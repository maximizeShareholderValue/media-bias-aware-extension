# Chapter 4 draft: system, functional testing, Gate 3 and calibration (Gate 2)

> **Superseded.** Chapter 4 is now written in the thesis Google Doc. Some numbers here are out of date (Gate 3 was re-run with stage timings: median 67 ms, 95th percentile 127 ms, maximum 252 ms; the test counts have changed). Use the Doc and the reports in `eval/reports/`.

> Working draft for the thesis. Numbers come from the files named in each section; re-check them against those files before pasting. Formal evaluation (validators, EC1-EC2, Gate 1) and usability (EC3-EC4, Gate 4) follow after 26 October 2026.


## 4.1 The Developed System

The Media Bias-Aware Browser Extension was implemented as a Google Chrome Manifest V3 extension that runs entirely on the user's device. No article text is sent to a server for detection. The extension requests only two permissions, `activeTab` and `storage`; the optional host permission for `newsapi.org` is requested only when the user opens the comparative-reporting feature.

### 4.1.1 Components

| Component | File(s) | Role |
|---|---|---|
| Content script | `content/content-script.js` | Extracts the article, runs detection paragraph by paragraph, and renders the results |
| Article extraction | `lib/Readability.js` | Isolates the article body from navigation, advertisements and other page content |
| Linguistic analysis | `lib/compromise.js` | Part-of-speech tagging for the linguistic (S) conditions |
| Pattern matcher | `content/pattern-matcher.js` | Evaluates each rule's lexical (L), linguistic (S) and context (C) conditions |
| Conflict resolver | `content/conflict-resolver.js` | Resolves overlapping detections (FR-DET-04) |
| Highlighter | `content/highlighter.js`, `content/highlighter.css` | Draws highlights and their explanations |
| Rule catalog | `data/pattern-catalog.json` | 39 rules covering the 14 techniques, catalog version 1.1.0 (frozen) |
| Outlet metadata | `data/outlet-metadata.json`, `data/ownership-curated.json` | Outlet-level transparency information shown in the popup; never used in detection |
| Comparative reporting | `content/article-matcher.js`, `content/keyword-extractor.js` | Finds coverage of the same story by other outlets (NewsAPI) |
| Popup and service worker | `popup/`, `background/service-worker.js` | Summary counts per technique (FR-DET-05: counts only, no bias score), settings and export |

### 4.1.2 Detection pipeline

For each paragraph of the extracted article, a rule produces a detection only when all of its conditions hold, D = L ∧ S ∧ C (Section 4.1 of Chapter 3).

1. **Lexical condition (L):** a trigger word or multi-word expression from the rule.
2. **Linguistic condition (S):** a part-of-speech requirement on the trigger or its neighbors.
3. **Context condition (C):** surrounding words that must, or must not, be present (for example, skipping literal or factual senses).
4. **Quoted speech filter:** text inside quotation marks is skipped (see Deviation 2).
5. **Conflict resolution (FR-DET-04):** overlapping detections are resolved by longest span, then higher confidence tier, then earliest offset, then lowest rule ID.
6. **Rendering:** each remaining detection is highlighted with its technique, rule and explanation.

The keyword baseline required by Section 8.3 is the same matcher run in lexical-only mode, so the two differ only in the S and C conditions.

### 4.1.3 Implementation status of the techniques (Table 9a)

Section 3.2.3 promises a table of each technique's implementation status. It is given as Table 9a (draft in `eval/reports/table-9a.md`). Thirteen techniques are fully implemented. Repetition is partially implemented: only immediate repetition ("jobs, jobs, jobs"; "Take it back! Take it back!") is detected. Repetition spread across an article was tested and rejected (Section 4.4.4).

### 4.1.4 Deviations from the design in Chapter 3

| # | Planned (Chapter 3) | Built | Justification |
|---|---|---|---|
| 1 | TypeScript, React, Tailwind CSS and Vite (Table 7) | Plain JavaScript with no build step | Every file loaded by the browser is the file in the repository, which makes the rules and logic easy to audit; nothing needs to be compiled. NFR-MAIN-01 and NFR-PORT-01 still hold. |
| 2 | Not specified | Quoted speech is skipped; only Slogans rules fire inside quotation marks | The extension flags the outlet's own wording, not the words of the people it quotes. A news report that quotes a politician's loaded language is not itself using loaded language. Cost: propaganda inside quotations is not counted, which lowers recall. Validators were therefore instructed not to annotate quoted speech. |
| 3 | `patterns.json`, `outlets_v1.json` | `data/pattern-catalog.json`, `data/outlet-metadata.json` | Names only; content and role are as designed. |
| 4 | `scripting` permission | Removed | The permission was unused. Removing it follows the principle of least privilege. |
| 5 | Calibration on the SemEval-2020 Task 11 development set | Calibration on a held-out split of the training set | The development-set gold labels are distributed only through the PTC registration site, which was unreachable (Section 4.4.1). |

## 4.2 Functional Testing

The Functional Test Log (`eval/reports/functional-test-log.md`, generated by `node eval/functional-test-log.js`) runs test sentences through the complete pipeline, including the quoted-speech filter and conflict resolution, exactly as the content script does.

- **Part A, reference examples:** each of the 14 techniques was tested on its reference example from Table 12 (Repetition from Table 9). **All 14 techniques were detected (14/14).**
- **Part B, each rule:** each of the 39 rules was tested on a targeted sentence containing its own trigger. **All 39 rules fired (39/39).** The catalog's `sourceExample` field could not be used for this test, because several rules share one illustration per technique that does not contain each rule's own trigger.
- **Automated unit tests:** 238 tests (225 pass; 13 are marked as known limitations).

## 4.3 Processing Time (Validation Gate 3)

**Method.** The unpacked extension was loaded into Google Chrome 155 (headless mode) through the Chrome DevTools Protocol. Each of the 30 evaluation articles, plus a synthetic 1,967-word article assembled from corpus paragraphs to test the 2,000-word limit, was served as a plain news page from a local web server and loaded fresh 10 times (310 measurements). The time recorded is the extension's own measurement (`performance.now()`) from the start of its pipeline (article extraction, catalog loading, detection, conflict resolution and highlight rendering) to its end. The harness is `eval/gate3-timing.js`.

**Machine.** Intel Core i5-12450HX (12 logical cores), 12 GB RAM, Windows 11.

**Results.**

| Measure | Result |
|---|---|
| Measurements | 310 (31 articles × 10 loads) |
| Median | 63 ms |
| 95th percentile | 123 ms |
| Maximum | 185 ms |
| 1,967-word article: median / maximum | 135 ms / 156 ms |
| Budget (Gate 3) | 3,000 ms |

**All 310 measurements were under 3,000 ms, so Validation Gate 3 is met.** The slowest measurement used about 6% of the budget.

**Limitation.** The test pages were plain local pages. Live news sites carry advertisements, scripts and heavier page structure, so extraction may take longer in everyday use. Even so, the slowest measurement leaves a margin of about 16 times.

## 4.4 Rule Calibration (Validation Gate 2)

### 4.4.1 Data and procedure

Section 4.4 Stage 5 calls for calibrating the rules on the SemEval-2020 Task 11 development set until the false-positive rate (FPR) is below 15%, then freezing the catalog. The development-set gold labels are available only after registration at propaganda.qcri.org. That site redirects to tanbih.qcri.org, which failed with a TLS error when attempted (14 October 2026), so the labels could not be obtained.

Calibration therefore used the labelled training articles of the same corpus (Propaganda Techniques Corpus, PTC; public SemEval-2020 Task 11 release on Zenodo), 371 articles split three ways:

| Split | Articles | Use |
|---|---|---|
| Calibration | 75 (random, seed 2026) | Rounds 1-2: finding and fixing false positives |
| Mining | 221 | Rounds 3-4: deriving new triggers from gold spans |
| Held-out | 75 (random, seed 2027) | Reported results only; never used to change rules |

A detection counts as a true positive when it overlaps a gold span of the same technique (strict) or of any technique (lenient); otherwise it is a false positive. FPR = false positives ÷ all detections. Only rendered detections (after the quote filter and conflict resolution) are scored. The tool is `eval/calibrate.js`.

### 4.4.2 Calibration rounds

| Round | Catalog | Rules | Main changes |
|---|---|---|---|
| Initial | 0.5.0 | 35 | Rules as designed in Chapter 3 |
| 1 | 0.5.1 | 34 | Skip crime and incident reports (DB-002), policy compounds and factual designations; one rule removed |
| 2 | 0.5.2 | 35 | Narrower triggers; skip quoted or named terms, legal and enforcement context, diseases and negation; "illegal alien(s)" split into its own rule (NC-002) |
| 3 | 0.6.0, frozen as 1.0.0 | 37 | Evaluative terms (LL-014) and labels (NC-003) mined from gold spans (each term inside a gold span in at least 50% of its occurrences on the mining split, then curated by hand); five exaggeration and fear terms remapped to Loaded Language, as SemEval labels them |
| 4 | 1.1.0 | 39 | FW-002 (appeal to the national public) and BW-002 (totalitarian comparison) mined from the mining split |


Results on the 75 held-out articles:

| Catalog | Strict FPR | Lenient FPR | Precision | Recall | F1 |
|---|---|---|---|---|---|
| 0.5.2 (after round 2) | 79.7% | – | 20.3% | 2.0% | 0.036 |
| 1.0.0 (after round 3) | 69.3% | 54.8% | 30.7% | 4.0% | 0.071 |
| **1.1.0 (after round 4, final)** | **68.4%** | **53.4%** | **31.6%** | **4.3%** | **0.076** |
| Keyword baseline, 1.0.0 | 75.1% | – | 24.9% | 6.2% | 0.099 |
| Keyword baseline, 1.1.0 | 73.9% | 60.2% | 26.1% | 6.7% | 0.107 |

### 4.4.3 Gate 2 result

**Validation Gate 2 (FPR below 15%) was not met: the final strict FPR on held-out data is 68.4%.** The target in Chapter 3 is unchanged; the shortfall is reported here.

The figure should be read in context:

1. **SemEval annotation is sparse and span-based.** The corpus labels a technique only where its annotators marked one, and many evaluative words that fit the thesis definitions are left unlabeled. Some disagreement is a difference of definition rather than a detection error. For example, DB-004 ("claimed") matched no SemEval Doubt span, but was kept because Section 2.2 cites the "claims versus confirms" distinction (Recasens et al., 2013).
2. **The rules were not tuned toward SemEval where it conflicts with the thesis definitions** (for example, "illegals," which Table 9 lists as an example). The validators judge those cases in the formal evaluation.
3. **Lexical rules have a floor.** Simulations during calibration put the achievable strict FPR at about 65-75% on this corpus for any rule set that keeps reasonable coverage.
4. **The pipeline improves on the keyword baseline** in FPR (68.4% vs. 73.9%) and precision (31.6% vs. 26.1%). The baseline has higher recall, which reflects the precision-first design (EC1: "an incorrect highlight misleads, a miss only leaves text unmarked").

Because Gate 2 uses SemEval labels, the deciding measure of precision is EC1 (precision ≥ 0.50), judged by the validators on the 30 evaluation articles (Section 4.5).

### 4.4.4 Techniques that could not be improved

- **Repetition:** 81% of SemEval's short Repetition spans repeat a phrase from earlier in the article. A frequency detector (flagging a phrase's third and later occurrences) reached only 1.6-2.7% precision on the mining split, because ordinary topic repetition cannot be told apart from propagandistic repetition. It was not implemented.
- **Thought-Terminating Clichés; Straw Man / Whataboutism / Red Herring:** in round 4, no phrase reached at least 3 occurrences at 50% precision on the mining split. SemEval instances of these techniques are mostly one-off sentence-level arguments that a lexical rule cannot recognize.

### 4.4.5 Catalog freeze

The catalog was frozen as 1.0.0 after round 3 (Stage 5). One further round, approved by the adviser, produced 1.1.0, the version used in the formal evaluation. No rule was changed after that. Six rules were renumbered at the freeze so that each ID matches its technique; each keeps its old ID in a `formerId` field, and the rendered output was checked to be identical before and after.


## 4.5 Evaluation corpus (preparation; results after 26 October)

- **Selection:** 30 articles (10 Left, 10 Center, 10 Right by AllSides) were found manually and screened against the seven Section 6.3 criteria, then cleaned of 22 boilerplate paragraphs (`eval/clean-corpus.js`, logged in `cleaning-log.json`). Total: 21,271 words. NewsAPI was not used to find articles.
- **Additional screening rule:** wire copy (articles reprinted from news agencies) was excluded, so that each article represents its own outlet's wording. This rule is not in Section 6.3 and is reported here.
- **Replacements:** several candidates were replaced for failing a criterion, such as MBFC factual rating, word count or publication date. Each is logged with its reason in the corpus manifest (`eval/corpus-manifest.json`).
- **Disclosure:** the authors ran the extension on some candidate articles during development, before the catalog was frozen. No rule was derived from those runs, and one article that had served as a rule source was replaced. Rules were never tuned on the 30 evaluation articles.

