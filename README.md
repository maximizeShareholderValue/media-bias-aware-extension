# Media Bias-Aware Browser Extension

Chrome MV3 extension that flags phrase-level propaganda techniques (the 14 SemEval-2020
Task 11 techniques) in news articles, entirely in the browser, and shows outlet-level
transparency metadata. It is a rule-based, explainable system: every highlight traces to a
named rule in `data/pattern-catalog.json`.

## Load and test it

1. `chrome://extensions` -> enable Developer mode -> **Load unpacked** -> select this folder.
2. After **any** change, click the reload icon on the extension card, **then refresh (F5) the
   article tab**. Chrome does not inject a reloaded extension into tabs that were already open;
   the popup will say so if that is the problem.
3. Open a news article. Most neutral articles (BBC, Guardian, Al Jazeera) produce few or no
   highlights; opinionated outlets produce more. `test-article.html` is a page built to trigger
   many rules.

```
node --test test/pattern-matcher.test.js test/article-matcher.test.js test/compare-utils.test.js test/eval-metrics.test.js
```

## How detection works

For each paragraph of the article (isolated with Readability.js) the matcher evaluates every
rule as **D(s,r) = L(s,r) AND S(s,r) AND C(s,r)** (thesis FR-DET-03):

- **L** - the rule's lexical trigger generates a candidate span.
- **S** - a structural/POS condition on the candidate (e.g. "directly precedes a noun", "is a
  reporting verb followed by *that* or a quote", "sits in a question").
- **C** - a local context condition (e.g. "not 'radical surgery'", "no figure stated in the
  sentence", "no police/court vocabulary in the sentence").

Overlaps are then resolved per FR-DET-04: longest span, then higher confidence tier, then
earliest start offset, then lowest Pattern ID. Losing detections are kept as `suppressed`, with
the rule that decided, in an audit log. The popup reports only the number of flagged spans and
how many techniques they cover (FR-DET-05) - no article score and no biased/unbiased verdict.

Running with `mode: "lexicalOnly"` skips S and C. That is the keyword-only baseline of thesis
section 8.3; the full pipeline's detections are always a subset of it.

## Catalog schema (thesis Table 13)

`data/pattern-catalog.json` -> `patterns[]`, one object per rule:

| Table 13 field | JSON key |
|---|---|
| Pattern ID | `id` |
| SemEval Technique | `technique` (key into `techniques`) |
| Reference Definition | `referenceDefinition` |
| Lexical Trigger | `lexicalTrigger` `{words, pattern}` |
| Linguistic Condition | `linguisticCondition` `{type, ...}` |
| Context Condition | `contextCondition` `{excludeNeighborWords, excludeWindowWords, excludeSentenceWords, requireSentenceWords, requireNoQuantity, excludeFollowingPattern}` |
| Target Span | `targetSpan` (`"trigger"`) |
| Explanation | `explanation` |
| Source Example | `sourceExample` `{text, source, triggerEvidence}` |
| Confidence Tier | `confidenceTier` (`high` / `medium` / `low`) |

Condition types and the tests that enforce the schema are in `content/pattern-matcher.js` and
`test/pattern-matcher.test.js`. The catalog is plain JSON: edit it and reload, no rebuild.

## Evaluation harness (thesis sections 7-9)

Not shipped to users; run with Node.

```
node eval/generate-sheet.js <articlesDir> [outDir]     # one <id>.txt per article, paragraphs separated by a blank line
# give outDir/validation-sheet.csv to the 3 validators (columns validator1..3: Valid / Not Valid)
node eval/score.js <filled-sheet.csv> <outDir>/key.json --stage calibration|formal --out results.json
```

`generate-sheet.js` writes the blinded sheet (all baseline candidates, shuffled, nothing
revealing which the full pipeline kept), `key.json`, `detections.json` (incl. suppressed
overlaps), SemEval-format span files (`articleId  technique  start  end`) for both modes, and
`summary.json` (incl. the proportion of overlaps resolved, section 8.4). `score.js` computes
Fleiss' kappa and agreement, precision / per-technique precision / FPR for the full pipeline
**and** the baseline, and checks Gate 1 (kappa >= 0.60), Gate 2 (calibration FPR < 15%) and the
formal precision threshold (>= 0.50). If Gate 1 fails it says the judgments must not be used
(section 9.3). The metric code is tested against the published Fleiss (1971) worked example.
The popup's Settings has **Export detections (JSON)** to capture what the extension actually
flagged on a live page.

## Thesis alignment status

| Requirement | Status |
|---|---|
| FR-DET-01/02 Readability + Compromise pipeline | Done |
| FR-DET-03 L and S and C, Table 13 schema | Done (all 28 rules carry the ten fields) |
| FR-DET-04 resolution + audit log | Done |
| FR-DET-05 counts only, no score | Done (Bias Index removed) |
| FR-DET-06 highlights + tooltip (technique, rule ID, explanation) | Done |
| FR-AVD-01 keywords only to NewsAPI | Done. Keywords are extracted locally; a privacy guard in the service worker drops anything that looks like a title or sentence |
| FR-AVD-02 split-screen Left / Center / Right | Done (popup groups results; "Open split-screen view" opens `compare/compare.html`) |
| FR-CHK-01 offline outlet lookup | Done, but with **8,849** outlets (full MBFC + AllSides), not 200 - update the thesis text or subset the file |
| FR-CHK-02 ideology + reliability | **Partial by decision**: ideology is shown; the reliability tier was removed from the popup at the team's request (the data is still in `outlet-metadata.json`). The thesis requirement needs updating |
| FR-CHK-03 ownership from MOM | **Gap**: `ownershipType` is "Unknown" for nearly all outlets; Media Ownership Monitor data is not integrated |
| FR-SYS-01 / NFR-PRIV-01 encrypted key, activeTab + storage only | **Gap**: the NewsAPI key is stored unencrypted in `chrome.storage.local` (readable by content scripts), and content scripts match all http(s) pages instead of using only `activeTab` |
| NFR-PERF-01 < 3 s | Met: about 0.4 s average over 12 saved pages (real articles + test page) |
| NFR-RELI-01 precision / FPR / kappa | **Not yet measurable**: needs the 30-article corpus and three validators |
| Stage 5 calibration of confidence tiers | **Pending**: tiers are authored, not yet calibrated on a development corpus |

## Provenance of the rules (for the methodology chapter)

Each rule's `sourceExample` says where it comes from: a SemEval-2020 Task 11 Table 1 example,
a thesis Table 12 example, or "authored from the technique definition", plus where the trigger
words were observed. Triggers were also drawn from the BABE/MBIC annotator-flagged words and the
Wiki Neutrality Corpus (`docs/corpus-mined-bias-candidates.json`), and tuned against 11 saved
real articles (BBC, Guardian, Al Jazeera, Fox, Breitbart, HuffPost, 2026-10-02). **Section 3 of
the thesis lists only the SemEval corpus, so BABE/MBIC/WNC must be added there or the rules
re-derived from the PTC-SemEval20 corpus.** Those 11 articles are *development* data and must
stay out of the 30-article evaluation corpus.

The thesis Table 12 examples are used as reference tests. 10 of the 14 techniques' examples are
detected; **Repetition, Exaggeration (absolutes), Causal Oversimplification and Appeal to
Authority are not yet covered** (they appear as `todo` tests). Repetition needs a
repeated-expression detector rather than a lexical trigger, so `REPETITION` has no rules.

## Decisions worth knowing about

- **Catalog field names**: `technique` / `techniques` match the thesis wording; the matcher also
  emits `category` as an alias used by the highlighter CSS.
- **Rule IDs**: prefixes of the original seed rules (LL / PS / SC / AF / EM) are legacy names from
  an earlier 5-category scheme and were kept so references stay valid; `technique` is authoritative.
  Re-mapped seed rules carry a `techniqueNote` explaining why (e.g. `PS-003` -> Loaded Language
  because SemEval has no presupposition class; `SC-012` -> Appeal to Authority although
  "many believe" is arguably Bandwagon).
- **Highlight span** is the trigger word/phrase itself, not the noun it is checked against.
- **Whitespace**: a literal space in a rule matches line breaks and NBSP, because `textContent`
  keeps the page source's raw whitespace.
- **Paragraph matching**: Readability runs on a detached clone; a live `<p>` counts as article text
  if it matches Readability's text exactly or (>= 80% word overlap) after Readability strips an
  inline fragment such as a "Share" link (`content/article-matcher.js`).
- **Text blocks, not just `<p>`**: Readability turns `<div>`s that hold plain text into paragraphs, so
  on sites like news aggregators the article text is not in `<p>` tags. Any block element with no
  block inside it is a candidate; only those matching Readability's text are scanned and highlighted.
- **Version-mismatch guard**: if the content script and the catalog come from different versions
  (e.g. the extension was reloaded but the tab was not refreshed) the scan reports
  `catalog_schema` and the popup says to reload and refresh, instead of throwing.
- **Privacy**: article text never leaves the page. The only network call is the optional,
  user-triggered NewsAPI request, and it carries only topic keywords. Highlights, titles and
  reading history are never sent.
- **Known limitation**: keyword rules are heuristics, so some flags are legitimate uses in
  context (e.g. "extremist views" in a factual report). The tooltip explains the rule so the
  reader can judge; the thesis frames highlights as cues, not verdicts.
