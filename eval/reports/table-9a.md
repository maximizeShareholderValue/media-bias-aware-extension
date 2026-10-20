# Table 9a (draft): implementation status of the 14 techniques

Catalog 1.1.0, 39 rules. Status: Implemented = detected by at least one rule and verified by the Functional Test Log; Partial = only part of the technique's forms are detectable.

| # | Technique | Rules | Rule IDs (conditions) | Tiers (H/M/L) | Functional test | Status | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Loaded Language | 7 | LL-007 (L+S+C); LL-011 (L+S+C); LL-012 (L+S+C); LL-015 (L+S+C); LL-016 (L+S+C); LL-013 (L+C); LL-014 (L+S+C) | 0/5/2 | Reference example detected; 7/7 rules pass | Implemented |  |
| 2 | Name Calling / Labeling | 5 | NC-004 (L+S+C); NC-005 (L+S+C); NC-001 (L+S+C); NC-002 (L+S+C); NC-003 (L+S+C) | 0/2/3 | Reference example detected; 5/5 rules pass | Implemented |  |
| 3 | Repetition | 1 | RP-001 (L+C) | 0/0/1 | Reference example detected; 1/1 rules pass | Partial | Partial: immediate repetition only ("jobs, jobs"; "take it back! take it back"). Repetition spread across an article (Table 12) is not detected; a frequency detector was tested and rejected (1.6-2.7% precision on SemEval). |
| 4 | Exaggeration / Minimization | 4 | EX-001 (L+S+C); EX-002 (L+S); EX-003 (L (fixed phrase)); EX-004 (L+C) | 1/1/2 | Reference example detected; 4/4 rules pass | Implemented |  |
| 5 | Doubt | 4 | DB-001 (L+S+C); DB-002 (L+S+C); DB-003 (L+S+C); DB-004 (L+S) | 0/3/1 | Reference example detected; 4/4 rules pass | Implemented | Includes DB-004 ('claimed'), kept despite SemEval disagreement (bias-lexicon tradition, Recasens et al., 2013). |
| 6 | Appeal to Fear / Prejudice | 3 | FE-001 (L (fixed phrase)); FE-002 (L+C); FE-003 (L+C) | 0/2/1 | Reference example detected; 3/3 rules pass | Implemented |  |
| 7 | Flag-Waving | 2 | FW-001 (L (fixed phrase)); FW-002 (L+C) | 1/0/1 | Reference example detected; 2/2 rules pass | Implemented | FW-002 added in calibration round 4 from SemEval mining data. |
| 8 | Causal Oversimplification | 2 | CO-001 (L+C); CO-002 (L+C) | 1/1/0 | Reference example detected; 2/2 rules pass | Implemented |  |
| 9 | Slogans | 2 | SL-001 (L (fixed phrase)); SL-002 (L (fixed phrase)) | 1/1/0 | Reference example detected; 2/2 rules pass | Implemented |  |
| 10 | Appeal to Authority | 3 | AA-001 (L+C); AA-002 (L (fixed phrase)); AA-003 (L+C) | 1/2/0 | Reference example detected; 3/3 rules pass | Implemented |  |
| 11 | Black-and-White Fallacy | 2 | BF-001 (L+S); BF-002 (L+S) | 1/1/0 | Reference example detected; 2/2 rules pass | Implemented |  |
| 12 | Thought-Terminating Clichés | 1 | TT-001 (L (fixed phrase)) | 1/0/0 | Reference example detected; 1/1 rules pass | Implemented | Fixed phrases only; SemEval spans for this technique are one-off sentences, so no further trigger met the mining criteria (calibration round 4). |
| 13 | Bandwagon / Reductio ad Hitlerum | 2 | BW-001 (L (fixed phrase)); BW-002 (L+S+C) | 0/1/1 | Reference example detected; 2/2 rules pass | Implemented | BW-002 added in calibration round 4 from SemEval mining data. |
| 14 | Straw Men / Whataboutism / Red Herring | 1 | SM-001 (L (fixed phrase)) | 0/1/0 | Reference example detected; 1/1 rules pass | Implemented | Explicit deflection phrases only; most instances are sentence-level arguments that a lexical rule cannot recognize (calibration round 4). |

Conditions: L = lexical trigger, S = linguistic (part-of-speech) condition, C = context condition; D = L AND S AND C. Rules marked "L (fixed phrase)" use a multi-word expression as the anchor.
