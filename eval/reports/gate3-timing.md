# Gate 3 timing

Generated 2026-10-21 by `node eval/gate3-timing.js --runs 10`.

**Machine:** 12th Gen Intel(R) Core(TM) i5-12450HX, 12 logical cores, 12 GB RAM; Windows_NT 10.0.26200 (x64); Chrome/155.0.8059.85 (headless).

**Method:** the unpacked extension runs in Chrome; each article is served as a plain news page from a local web server and loaded fresh 10 times. The time is the extension's own measurement (`elapsedMs`) from the start of its pipeline (article extraction, catalog load, detection, conflict resolution and highlight rendering) to the end.

**Result:** PASS: all 310 measurements under 3000 ms. Median 63 ms, 95th percentile 123 ms, maximum 185 ms.
Synthetic 2,000-word article (1967 words): median 135 ms, maximum 156 ms.

| Article | Words | Highlights | Median (ms) | Min (ms) | Max (ms) |
|---|---|---|---|---|---|
| C01 | 1366 | 1 | 108.5 | 93 | 168 |
| C02 | 384 | 0 | 56 | 41 | 93 |
| C03 | 1108 | 0 | 81.5 | 74 | 119 |
| C04 | 482 | 0 | 51 | 48 | 77 |
| C05 | 361 | 1 | 43.5 | 41 | 62 |
| C06 | 614 | 0 | 58 | 50 | 62 |
| C07 | 348 | 0 | 41.5 | 41 | 60 |
| C08 | 1451 | 1 | 112.5 | 97 | 145 |
| C09 | 790 | 1 | 68 | 61 | 77 |
| C10 | 789 | 0 | 66.5 | 63 | 72 |
| L01 | 1547 | 2 | 105.5 | 99 | 124 |
| L02 | 844 | 0 | 67 | 62 | 76 |
| L03 | 502 | 0 | 50.5 | 46 | 62 |
| L04 | 939 | 0 | 70.5 | 68 | 83 |
| L05 | 676 | 2 | 58 | 56 | 62 |
| L06 | 173 | 0 | 33.5 | 30 | 39 |
| L07 | 310 | 1 | 40.5 | 38 | 45 |
| L08 | 870 | 1 | 73 | 67 | 77 |
| L09 | 309 | 1 | 39.5 | 36 | 71 |
| L10 | 287 | 0 | 39.5 | 37 | 40 |
| R01 | 861 | 0 | 69.5 | 68 | 75 |
| R02 | 908 | 0 | 74.5 | 70 | 81 |
| R03 | 1035 | 0 | 89.5 | 77 | 185 |
| R04 | 975 | 0 | 77.5 | 68 | 86 |
| R05 | 648 | 1 | 61.5 | 58 | 74 |
| R06 | 561 | 3 | 54 | 47 | 57 |
| R07 | 496 | 0 | 52.5 | 46 | 66 |
| R08 | 413 | 0 | 48.5 | 42 | 74 |
| R09 | 629 | 2 | 61.5 | 54 | 125 |
| R10 | 595 | 2 | 65.5 | 57 | 76 |
| GATE3-2000 | 1967 | 1 | 135 | 116 | 156 |
