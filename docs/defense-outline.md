# Defense slides outline (facts only)

> For building the defense deck (Nov 9-13). Every number comes from the file named next to it. Slides marked **[after results]** wait for the validator and usability results; do not fill them with estimates.

1. **Title**: Development of a Media Bias-Aware Browser Extension for Balanced News Consumption; Kobi P. Pareja, Orchard Hernandez; adviser Ms. Julie Ann C. Lontoc; CvSU.
2. **Problem**: rating sites (AllSides, MBFC) label whole outlets but do not show which phrases in an article carry bias; most NLP bias models are not explainable to everyday readers (Ch 1).
3. **Research questions**: RQ1 pipeline, RQ2 validator agreement, RQ3 usability and usefulness, RQ4 task completion (Ch 1).
4. **What the extension does**: phrase highlights with explanations, source panel (leaning, MBFC factual reliability, ownership), Left / Center / Right comparison. Show the popup screenshot.
5. **How detection works**: D = L ∧ S ∧ C; quoted speech skipped; conflict resolution (longest span, then tier, then earliest offset, then lowest rule ID); runs entirely in the browser, permissions activeTab and storage only [`manifest.json`].
6. **Rule catalog**: 39 rules, 14 SemEval-2020 Task 11 techniques, tiers 7 high / 20 medium / 12 low, frozen as 1.1.0 (tag catalog-v1.0); 7 techniques partial [Table 9a, `data/pattern-catalog.json`].
7. **Calibration (Gate 2)**: 371 SemEval training articles split 75 / 221 / 75; four rounds; final held-out strict FPR 68.4%, precision 31.6%, recall 4.3%; keyword baseline 73.9% / 26.1% / 6.7%; Gate 2 (< 15%) not met; why [Ch 4 4.3].
8. **Functional testing**: 14/14 techniques on reference examples, 39/39 rules; sentence boundaries 13/15; POS 28/30; extraction 8/8 paragraphs on 6 layouts; highlights and tooltips pass [`eval/reports/functional-test-log.md`, `eval/reports/browser-tests.md`].
9. **Performance (Gate 3) and memory**: 310 runs, median 67 ms, max 252 ms (budget 3,000 ms); 6 stress scenarios all under 3,000 ms (max 409 ms); memory about +5.3 MB per page [`eval/reports/gate3-timing.md`, `eval/reports/browser-tests.md`].
10. **Evaluation corpus**: 30 hard-news articles, 10 Left / 10 Center / 10 Right (AllSides), Jan-Sep 2026, 21,271 words; 3 validators; 19 highlights from the extension [`eval/corpus-manifest.json`, `eval/out/summary.json`].
11. **[after results] Detection results (EC1)**: precision and recall with counts (n = 19 highlights), strict and lenient, vs keyword baseline.
12. **[after results] Validator agreement (RQ2, Gate 1)**: Fleiss' kappa, percent agreement, Gwet's AC1.
13. **[after results] Error analysis**: main false-positive causes by technique.
14. **[after results] Usability (RQ3, RQ4)**: construct means, Cronbach's alpha, task completion T1-T4.
15. **Cross-outlet framing (8.7)**: framing set of 5 events x L/C/R: 7 highlights in total (Left 4, Center 2, Right 1); 9 of 15 articles none; descriptive only [`eval/reports/framing-comparison.md`].
16. **Limitations**: English only; small samples; SemEval label sparsity; quoted speech not analyzed; late-loading pages not scanned; plain local pages for timing; outlet labels are contextual anchors [Ch 5 outline 5.4].
17. **Conclusions and recommendations** [Ch 5].
