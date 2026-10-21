# Gate 3 timing

Generated 2026-10-21 by `node eval/gate3-timing.js --runs 10`.

**Machine:** 12th Gen Intel(R) Core(TM) i5-12450HX, 12 logical cores, 12 GB RAM; Windows_NT 10.0.26200 (x64); Chrome/155.0.8059.85 (headless).

**Method:** the unpacked extension runs in Chrome; each article is served as a plain news page from a local web server and loaded fresh 10 times. The time is the extension's own measurement (`elapsedMs`) from the start of its pipeline (article extraction, catalog load, detection, conflict resolution and highlight rendering) to the end.

**Result:** PASS: all 310 measurements under 3000 ms. Median 67 ms, 95th percentile 127 ms, maximum 252 ms.
Synthetic 2,000-word article (1967 words): median 131.5 ms, maximum 142 ms.

Stage columns (NFR-PERF-01) are the median per article of the extension's own stage timers: extraction (Readability and paragraph matching), catalog loading, rule matching with conflict resolution, and highlight rendering. The total also includes reading the settings.

| Article | Words | Highlights | Median (ms) | Min (ms) | Max (ms) | Extraction | Catalog | Matching | Rendering |
|---|---|---|---|---|---|---|---|---|---|
| C01 | 1366 | 1 | 120.5 | 105 | 252 | 2.7 | 3.15 | 106.5 | 0.3 |
| C02 | 384 | 0 | 67.5 | 54 | 92 | 2.25 | 4.65 | 57.7 | 0 |
| C03 | 1108 | 0 | 104 | 99 | 147 | 2.55 | 4.15 | 94.9 | 0 |
| C04 | 482 | 0 | 64 | 61 | 74 | 1.7 | 2.75 | 55.4 | 0 |
| C05 | 361 | 1 | 51 | 49 | 58 | 1.9 | 2.6 | 43.35 | 0.2 |
| C06 | 614 | 0 | 73.5 | 65 | 83 | 1.7 | 3.3 | 62.75 | 0 |
| C07 | 348 | 0 | 53 | 46 | 62 | 1.45 | 2.55 | 44.95 | 0 |
| C08 | 1451 | 1 | 109.5 | 106 | 117 | 2.25 | 2.5 | 99.3 | 0.2 |
| C09 | 790 | 1 | 74.5 | 71 | 83 | 1.7 | 2.8 | 66.85 | 0.1 |
| C10 | 789 | 0 | 69 | 64 | 81 | 1.4 | 2.75 | 62.05 | 0 |
| L01 | 1547 | 2 | 105 | 100 | 127 | 1.75 | 2.5 | 97.2 | 0.3 |
| L02 | 844 | 0 | 72 | 67 | 78 | 1.4 | 2.55 | 63.85 | 0 |
| L03 | 502 | 0 | 53.5 | 51 | 61 | 1.4 | 3.85 | 45.95 | 0 |
| L04 | 939 | 0 | 75 | 73 | 79 | 1.6 | 3.05 | 67.35 | 0 |
| L05 | 676 | 2 | 64.5 | 63 | 69 | 1.6 | 3 | 56.1 | 0.3 |
| L06 | 173 | 0 | 36 | 35 | 40 | 1.2 | 2.1 | 29.3 | 0 |
| L07 | 310 | 1 | 44 | 42 | 49 | 1.15 | 2.1 | 36.05 | 0.2 |
| L08 | 870 | 1 | 74.5 | 71 | 99 | 1.5 | 2.75 | 66.95 | 0.2 |
| L09 | 309 | 1 | 43.5 | 40 | 51 | 1.4 | 2.25 | 36.05 | 0.2 |
| L10 | 287 | 0 | 42 | 40 | 49 | 1.35 | 3.2 | 33.95 | 0 |
| R01 | 861 | 0 | 79 | 75 | 82 | 1.65 | 2.7 | 69.6 | 0 |
| R02 | 908 | 0 | 81 | 76 | 84 | 1.85 | 3.1 | 72.2 | 0 |
| R03 | 1035 | 0 | 81.5 | 78 | 85 | 1.75 | 2.6 | 73.4 | 0 |
| R04 | 975 | 0 | 76 | 73 | 77 | 1.55 | 3.5 | 67.6 | 0 |
| R05 | 648 | 1 | 63.5 | 58 | 70 | 1.4 | 2.7 | 54.4 | 0.2 |
| R06 | 561 | 3 | 57 | 53 | 61 | 1.55 | 2.55 | 49.1 | 0.35 |
| R07 | 496 | 0 | 53.5 | 51 | 57 | 1.55 | 2.55 | 45.3 | 0 |
| R08 | 413 | 0 | 49 | 47 | 51 | 1.35 | 2.5 | 41.3 | 0 |
| R09 | 629 | 2 | 58 | 54 | 68 | 1.5 | 2.7 | 50.45 | 0.3 |
| R10 | 595 | 2 | 61 | 59 | 72 | 1.5 | 2.3 | 53.55 | 0.3 |
| GATE3-2000 | 1967 | 1 | 131.5 | 127 | 142 | 2.7 | 2.95 | 120.45 | 0.2 |
