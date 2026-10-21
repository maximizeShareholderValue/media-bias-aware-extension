# Browser tests (thesis 8.4, NFR-PERF-01, NFR-PERF-02)

Generated 2026-10-21 by `node eval/browser-tests.js --runs 10`. Chrome/155.0.8059.85 (headless) on 12th Gen Intel(R) Core(TM) i5-12450HX, 12 logical cores, 12 GB RAM, Windows_NT 10.0.26200 (x64).

Test pages are written for these tests and served from a local web server.

## A. Text extraction across news layouts (8.4 item 1)

Gold = the 8 body paragraphs. Recall = gold paragraphs the extension extracted; precision = extracted paragraphs that are body paragraphs.

| Layout | Description | Recall | Precision | Extra text extracted |
|---|---|---|---|---|
| semantic | Semantic markup: &lt;article> with &lt;p> paragraphs | 8/8 (100%) | 100% | - |
| div-only | No &lt;p> elements: paragraphs are plain &lt;div>s in a story container | 8/8 (100%) | 100% | - |
| cluttered | Article between navigation, sidebar, ads, related links, comments, newsletter box and footer | 8/8 (100%) | 89% | "Sign up for our daily newsletter to get the top stories in y..." |
| inline-markup | Links, &lt;em> and &lt;strong> inside paragraphs, including a highlighted phrase that crosses a link | 8/8 (100%) | 100% | - |
| sectioned | Subheadings, a photo with caption and a pull quote between paragraphs | 8/8 (100%) | 89% | "The crossing outside her children's school had been flooded ..." |
| script-inserted | Article body inserted by a script when the page loads (DOMContentLoaded) | 8/8 (100%) | 100% | - |

Article body inserted 1.5 s after the page loaded: 0 highlights. The content script runs once, when the page has loaded (document_idle), so text added later is not scanned; reloading the page or turning highlights off and on in the popup scans it.

## B. Highlight injection and tooltips (8.4 item 6)

| Layout | Highlights | Spans | Attributes (tabindex, role, aria-describedby, rule, explanation) | Page text unchanged | Links kept | Phrase across a link split into spans | Tooltip on focus shows rule and explanation | Tooltip hides on blur |
|---|---|---|---|---|---|---|---|---|
| semantic | 4 | 4 | Pass | Pass | Pass | - | Pass | Pass |
| div-only | 4 | 4 | Pass | Pass | Pass | - | Pass | Pass |
| cluttered | 4 | 4 | Pass | Pass | Pass | - | Pass | Pass |
| inline-markup | 4 | 5 | Pass | Pass | Pass | Pass | Pass | Pass |
| sectioned | 4 | 4 | Pass | Pass | Pass | - | Pass | Pass |
| script-inserted | 4 | 4 | Pass | Pass | Pass | - | Pass | Pass |

## C. NFR-PERF-01 stress scenarios

Each scenario loaded fresh 10 times; stage times are medians of the extension's own timers (ms).

| Scenario | Words | Highlights | Suppressed overlaps | Median (ms) | Max (ms) | Under 3,000 ms | Extraction | Catalog | Matching | Rendering |
|---|---|---|---|---|---|---|---|---|---|---|
| 2,000-word threshold: an article at the 2,000-word limit | 1975 | 30 | 0 | 179 | 189 | Pass | 2.8 | 4.4 | 158.6 | 4.1 |
| Dynamically loaded page: the 2,000-word body is inserted by a script on DOMContentLoaded | 1975 | 30 | 0 | 202.5 | 248 | Pass | 3.5 | 4.2 | 183.5 | 5 |
| Dense DOM: the 2,000-word article inside a page with about 21,000 extra elements | 1975 | 30 | 0 | 293 | 409 | Pass | 84 | 4.5 | 164.1 | 6.6 |
| Overlapping matches: every paragraph holds a phrase where two rules overlap (LL-013 and FW-002) | 1993 | 69 | 46 | 111.5 | 174 | Pass | 1.9 | 2.7 | 99.1 | 3.6 |
| Simultaneous multi-pattern detections: all 39 rules' test sentences, repeated to 2,000 words | 1999 | 265 | 0 | 152 | 193 | Pass | 2.2 | 3.2 | 131.3 | 9.6 |
| Repeated highlight injection: highlights turned off and on 10 times on the 2,000-word page | - | 30 | - | 114 | 129 | Pass | - | - | - | - |

Repeated injection: highlights removed completely each time and re-drawn without duplicates: Pass.

## D. Memory (NFR-PERF-02)

JS heap in use by the page after garbage collection (MB), with the extension and on the same page in a browser without it.

| Scenario | With extension | Without | Difference |
|---|---|---|---|
| S1-threshold | 5.7 | 0.4 | 5.2 |
| S2-dynamic | 5.7 | 0.5 | 5.3 |
| S3-dense-dom | 5.7 | 0.4 | 5.3 |
| S4-overlapping | 5.8 | 0.4 | 5.4 |
| S6-multi-pattern | 5.7 | 0.4 | 5.3 |

Across the 10 off/on cycles of S5 the heap changed by 0.2 MB (first 5.7 MB, last 5.9 MB). No tab crashed or stopped responding in any test.
