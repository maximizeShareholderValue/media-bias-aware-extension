# Validator article order (thesis 7)

Documented before annotation begins, as Section 7 of Chapter 3 requires. Produced by `eval/corpus/annotator.html` (build 802d1d48f1), which computes the order from the validator number; it is the same every time a validator opens the page.

- **Framing set (Articles 1-15), same for all validators:** News 1 to News 5 in a fixed order, each as Left, Center, Right: L01 C01 R01, L02 C02 R02, L03 C03 R03, L04 C04 R04, L05 C05 R05.
- **General set (Articles 16-30):** a separate random order for each validator (seed 2026 + validator number).

| Validator | Articles 16-30 (general set) |
|---|---|
| V1 | R08 L09 C06 C07 L10 R06 L07 L06 R09 R07 C09 C10 C08 L08 R10 |
| V2 | L08 R08 L06 R06 L07 L10 R09 C07 R10 L09 C09 C10 C08 R07 C06 |
| V3 | R07 L10 R06 C09 C10 C07 C08 L08 R08 L09 R10 L06 C06 R09 L07 |

On screen the validators see neutral labels ("Article 7 of 30") and titles without the outlet name; the URL is not shown. The real article IDs, which encode the outlet group, appear only in the exported CSV files.
