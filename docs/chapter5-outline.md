# Chapter 5 outline: Summary, Conclusions and Recommendations

> Working outline for the thesis. Every statement marked with a source comes from the repository; items marked **[after results]** wait for the validator results (Phase 1/2, about 26 October 2026) or the usability sessions (week of 26 October 2026). Do not fill a placeholder with an estimate.

## 5.1 Summary

One paragraph each, in this order:

1. **Problem and purpose** (Ch 1): readers lack phrase-level, explainable bias cues together with outlet context and comparative coverage; the study built and evaluated a browser extension that combines the three.
2. **What was built** (Ch 4.1): a Chrome Manifest V3 extension in plain JavaScript that runs entirely on the user's device; 39 rules (catalog 1.1.0, frozen) covering the 14 SemEval-2020 Task 11 techniques, each rule D = L ∧ S ∧ C; quoted speech skipped; deterministic conflict resolution; a source panel (leaning, MBFC factual reliability, ownership for 43 curated outlets) and NewsAPI-based comparative reporting. Source: `data/pattern-catalog.json`, `docs/chapter4-draft.md`.
3. **How it was evaluated** (Ch 3 Sections 6-9): calibration on the SemEval-2020 Task 11 training articles (75 calibration, 221 mining, 75 held-out); 30 evaluation articles (10 Left, 10 Center, 10 Right) annotated by 3 validators; functional, performance and memory tests; 15-participant usability evaluation.
4. **Main findings**: one sentence per research question (from 5.2).

## 5.2 Conclusions (one subsection per research question)

### RQ1: Can a rule-based, privately executed NLP pipeline identify phrase-level bias cues?

Known now (source in brackets):
- All 14 techniques detected on their reference examples (14/14); all 39 rules fire on targeted sentences (39/39) [`eval/reports/functional-test-log.md`].
- Seven techniques are only partially implemented (explicit local forms only), including Repetition across an article [Table 9a; Ch 4 4.1.3].
- Validation Gate 2 not met: strict FPR 68.4% on 75 held-out SemEval articles (target < 15%); precision 31.6% vs 26.1% for the keyword baseline [Ch 4 4.3].
- Validation Gate 3 met: all 310 runs under 3,000 ms (median 67 ms, max 252 ms); six stress scenarios all under 3,000 ms (slowest 409 ms) [`eval/reports/gate3-timing.md`, `eval/reports/browser-tests.md`].
- Runs locally: no article text leaves the browser; permissions activeTab and storage only (plus optional newsapi.org) [`manifest.json`].
- **[after results]** EC1 on the 30 evaluation articles: precision (target ≥ 0.50) and recall (target ≥ 0.30), strict and lenient, against the keyword baseline [`eval/score.js`].

Conclusion to write: answer "to what extent" with the EC1 result, framed by Gate 2 and Gate 3.

### RQ2: Do three independent validators agree on the flagged phrases?

- **[after results]** Fleiss' kappa on the 19 Phase 2 highlights (Gate 1: κ ≥ 0.60), with percent agreement, Gwet's AC1 and the Valid / Not Valid split; Phase 1 agreement as mean pairwise span F1 [`eval/score.js`].
- If κ < 0.60: report as obtained, then the recalibration round (Ch 3 9.3); if AC1 is high while κ is low, report the prevalence effect.

### RQ3: Do users find the extension usable, interpretable and useful?

- **[after results]** Usability (Q1-Q5) and Perceived Usefulness (Q6-Q10): construct means (target ≥ 3.50), SDs, Cronbach's α (target ≥ 0.70) (Gate 4, EC3) [`eval/usability.js`]. Note the small sample (15) and α instability (Ch 3 8.6).

### RQ4: Can users complete the guided tasks?

- **[after results]** Completion rate for T1-T4 (EC4, target ≥ 80% each) [`eval/usability.js`].

### Objectives (Ch 1) and how far each was met

| Objective | Status now | Evidence |
|---|---|---|
| 1. Classify outlets' political alignment from rating services | Built: lookup table of 8,847 outlets (MBFC; AllSides for a few MBFC does not rate) | `data/outlet-metadata.json` |
| 2. Phrase-level detection of the 14 techniques with explanations | Built: 39 rules, 14/14 techniques detected, 7 partial | Functional Test Log, Table 9a |
| 3. Comparative news, Left / Center / Right side by side | Built: NewsAPI Developer plan, topic-aligned, not event-aligned | `shared/compare-utils.js`; Ch 1 scope |
| 4. Source transparency: ideology and ownership | Built: leaning, factual reliability, ownership for 43 curated outlets (not Media Ownership Monitor) | `popup/popup.js`, `data/ownership-curated.json` |
| 5. Evaluation: accuracy, agreement, usability, tasks | **[after results]** | Ch 4 4.4-4.6 |

## 5.3 Recommendations

Each one follows from a finding already in the repository:

1. **Detection coverage.** Seven techniques are partial and recall is low on SemEval (4.3% held-out) [Ch 4 4.3]. Future work: sentence-level rules or a compact in-browser model (Ch 3 10.4 names DistilBERT / MobileBERT), keeping a traceable explanation for each highlight.
2. **Article-level Repetition.** A frequency detector reached only 1.6-2.7% precision on the mining split [Ch 4 4.3.4]; it needs a way to tell rhetorical repetition from topic repetition.
3. **Calibration data.** Calibrate on the official SemEval development labels when obtainable, and on a larger, independently annotated news corpus for recall (Ch 3 10.4).
4. **Dynamic pages.** Text added more than about a second after load is not scanned until reload [`eval/reports/browser-tests.md`]; watch the page for late-loading article text.
5. **Text processing.** Sentence splitting missed ellipses and questions inside quotations (13/15); POS tagging mis-tagged "radical" and "total" (28/30) [Functional Test Log D-E]; extraction picked up a newsletter box and a pull quote (89% precision on 2 of 6 layouts) [browser tests].
6. **Outlet data.** Use a dated, versioned source for the ratings, extend ownership beyond the 43 curated outlets, and add a verified source for Philippine outlets (the unverified placeholders were removed).
7. **Comparative reporting.** Public use needs a paid NewsAPI plan or another news API (Developer plan: 100 requests/day, 1-month window, 24-hour delay) [Ch 1 scope].
8. **[after results]** Recommendations from the error analysis (false-positive causes per technique; false negatives) and from usability items scoring below 3.50.

## 5.4 Limitations (restate briefly; details are in Ch 1 scope and Ch 4)

- English-language online news only; 30 evaluation articles (Jan-Sep 2026); 3 validators; 15 usability participants, exploratory.
- Gate 2 measured against SemEval labels, which are sparse and follow different definitions in places [Ch 4 4.3.3].
- Quoted speech is not analyzed by design.
- Timing measured on plain local pages; live sites may be slower [Ch 4 4.2.2].
- Outlet labels are contextual anchors, not ground truth; the lookup table's ideology labels come mainly from MBFC, so they can differ from the AllSides grouping used for the corpus (e.g., Newsweek).
- Lookup table source year not recorded.
