# Technical Notes

Details behind the [README](../README.md): the detection logic, catalog schema, evaluation commands, and design decisions.

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
| Context Condition | `contextCondition` `{excludeNeighborWords, excludeWindowWords, excludeSentenceWords, requireSentenceWords, requireNoQuantity, excludeFollowingPattern, excludeMidSentenceCapital}`; plus top-level `flagInsideQuotes` |
| Target Span | `targetSpan` (`"trigger"`) |
| Explanation | `explanation` |
| Source Example | `sourceExample` `{text, source, triggerEvidence}` |
| Confidence Tier | `confidenceTier` (`high` / `medium` / `low`) |

Condition types and the tests that enforce the schema are in `content/pattern-matcher.js` and
`test/pattern-matcher.test.js`. The catalog is plain JSON: edit it and reload, no rebuild.

## Evaluation harness (thesis sections 7-9)

Not shipped to users; run with Node.

```
node eval/export-to-txt.js <exportsDir> <articlesDir>    # popup "Export detections (JSON)" files (<id>.json) -> <id>.txt
node eval/build-annotator.js <articlesDir> annotator.html --exports <exportsDir>   # Phase 1 page: send the same file to all 3 validators; each returns its Export CSV
node eval/generate-sheet.js <articlesDir> [outDir] --pipeline-only     # one <id>.txt per article, paragraphs separated by a blank line
# --pipeline-only: the Phase 2 sheet lists only the extension's highlights (baseline is scored against Phase 1, not judged)
# Phase 1: validators annotate the clean copies in their "Validator N - Phase 1" tabs (download each as CSV)
# Phase 2: validators mark each highlight Valid / Not Valid (columns validator1..3)
node eval/score.js --articles <articlesDir> --detections <outDir>/detections.json \
  --phase1 v1.csv v2.csv v3.csv [--phase2 <filled-sheet.csv> --key <outDir>/key.json] [--out results.json]
```

`generate-sheet.js` writes the blinded sheet (shuffled, nothing revealing which the full
pipeline kept), `key.json`, `detections.json` (incl. suppressed overlaps), SemEval-format span
files (`articleId  technique  start  end`) for both modes, and `summary.json` (incl. the
proportion of overlaps resolved, section 8.4).

`score.js` follows section 7.2. It finds each Phase 1 span in its article (Sentence Context picks
between repeats; spans it cannot find are listed for fixing), keeps spans marked by at least 2 of
3 validators as the reference set, and scores the full pipeline **and** the keyword baseline
(section 8.3) against it: precision, recall, F1 and FPR, strict (same technique) and lenient (any
technique), overall and per technique. Phase 2 judgments give Fleiss' kappa for Gate 1
(>= 0.60); if it fails the report says the judgments must not be used (section 9.3). It also
checks EC1 (precision >= 0.50) and the proposed revised Gate 2 (pipeline FPR below baseline).
The kappa code is tested against the published Fleiss (1971) worked example.
The popup's Settings has **Export detections (JSON)** to capture what the extension actually
flagged on a live page.

## Decisions worth knowing about

- **Catalog field names**: `technique` / `techniques` match the thesis wording; the matcher also
  emits `category` as an alias used by the highlighter CSS.
- **Rule IDs**: prefixes of the original seed rules (LL / PS / SC / AF / EM) are legacy names from
  an earlier 5-category scheme and were kept so references stay valid; `technique` is authoritative.
  Re-mapped seed rules carry a `techniqueNote` explaining why (e.g. `LL-016` (formerly PS-003) -> Loaded Language
  because SemEval has no presupposition class; `AA-002` (formerly SC-012) -> Appeal to Authority although
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
- **False positives**: a keyword alone is not evidence, so each rule carries conditions that
  separate the biased use from the neutral one. Example: "claims" is flagged only as a *verb*
  ("he claims that ..."), never as a noun ("rejected claims that ..."); capitalized names
  ("Spain's Socialists", "Radical Republicans") are not name-calling; "under siege" is skipped in
  a war context. Condition types: `none, all, any, not, taggedAny, precedesNoun, followedByTag,
  precededByTag, followedByWord, reportingVerb, inQuestion`.
- **Quoted speech**: a candidate entirely inside quotation marks (curly, straight, or
  single-quoted headline style) is what a source said, not the outlet's own wording, so it is not
  flagged. A quote left open runs to the end of the paragraph. Slogan rules set
  `flagInsideQuotes: true` because slogans are usually quoted. The keyword baseline still counts
  quoted candidates, and `includeQuotes: true` turns the check off.
- **How a wrong flag gets fixed**: add the sentence to `test/false-positive-cases.json` under
  `mustNotFire` (plus a `mustFire` companion so the rule cannot be silently disabled), tighten
  the rule's S or C condition in the catalog, and run `node --test`. During evaluation, the
  validators' "Not Valid" verdicts are the measured false-positive rate (FPR = 1 - precision).
- **Known limitations**: where the phrase itself is the cue ("sources say", "everyone knows",
  "merely"), a keyword rule cannot tell a neutral use from a loaded one. These are listed as
  `knownLimitations` in the same file (shown as `todo` tests) and disclosed in the thesis. The
  tooltip explains the rule so the reader can judge; highlights are cues, not verdicts.

## Icon

`icons/` holds the toolbar icon (a shield with a highlighted line of text, matching the popup header). Regenerate the PNGs and `icon.svg` with `node scripts/generate-icons.js`.

## Rule sources

Each rule's `sourceExample` records where it comes from. `corpus-mined-bias-candidates.json` in this folder holds candidate terms mined from bias corpora during rule development.
