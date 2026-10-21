# Functional Test Log

Catalog 1.1.0 (39 rules). Generated 2026-10-21 by `node eval/functional-test-log.js`.

## A. Thesis reference examples (one per technique)

14 of 14 techniques detected on their reference example.

| Case | Technique | Source | Test sentence | Detected phrase | Rule | Result |
|---|---|---|---|---|---|---|
| FT-01 | Loaded Language | Table 12 | Israel must defend itself from the barbaric terrorists surrounding its borders. | barbaric | LL-012 | Pass |
| FT-02 | Name Calling / Labeling | Table 12 | These Hamas sympathizers are nothing but terrorist apologists. | terrorist | NC-004 | Pass |
| FT-03 | Repetition | Table 9 | We must take our country back! Take it back! | take our country back! Take | RP-001 | Pass |
| FT-04 | Exaggeration / Minimization | Table 12 | If Israel loses this war, the entire country will cease to exist. | will cease to exist | EX-004 | Pass |
| FT-05 | Doubt | Table 12 | Are these protesters really demanding human rights, or are they secretly supporting Hamas? | really; secretly | DB-003, DB-003 | Pass |
| FT-06 | Appeal to Fear / Prejudice | Table 12 | If Hamas is not completely defeated, Israeli families will never be safe again. | will never be safe | FE-001 | Pass |
| FT-07 | Flag-Waving | Table 12 | True supporters of Israel stand with the IDF. | True supporters | FW-001 | Pass |
| FT-08 | Causal Oversimplification | Table 12 | There would be peace tomorrow if Hamas simply surrendered. | would be peace tomorrow; simply surrendered | CO-002, CO-002 | Pass |
| FT-09 | Slogans | Table 12 | Israel must win at all costs. | at all costs | SL-002 | Pass |
| FT-10 | Appeal to Authority | Table 12 | Our military leaders have said the operation is necessary, so there is no reason to question it. | there is no reason to question it | AA-003 | Pass |
| FT-11 | Black-and-White Fallacy | Table 12 | You either support Israel or you support terrorism. | You either | BF-002 | Pass |
| FT-12 | Thought-Terminating Clichés | Table 12 | Israel has the right to defend itself. End of discussion. | End of discussion | TT-001 | Pass |
| FT-13 | Straw Men / Whataboutism / Red Herring | Table 12 | Instead of criticizing Israel, why aren't you talking about what Hamas did? | why aren't you talking | SM-001 | Pass |
| FT-14 | Bandwagon / Reductio ad Hitlerum | Table 12 | The whole world now stands with Israel, and anyone who still questions the operation is on the wrong side of history. | wrong side of history | BW-001 | Pass |

## B. Every rule on a targeted test sentence

39 of 39 rules fire on their test sentence.

| Rule | Technique | Tier | Test sentence | Detected phrase | Result |
|---|---|---|---|---|---|
| LL-007 | Loaded Language | medium | The radical activists blocked the road for hours. | radical | Pass |
| NC-004 | Name Calling / Labeling | medium | Local terrorists attacked the outpost overnight. | terrorists | Pass |
| NC-005 | Name Calling / Labeling | medium | The regime cracked down on dissidents after the protest. | regime | Pass |
| LL-011 | Loaded Language | medium | The governor slammed the new budget proposal. | slammed | Pass |
| LL-012 | Loaded Language | low | It was a shameful decision by the board. | shameful | Pass |
| LL-015 | Loaded Language | medium | The notorious criminal was finally apprehended. | notorious | Pass |
| LL-016 | Loaded Language | medium | The senator admitted that he lied to investigators. | admitted | Pass |
| NC-001 | Name Calling / Labeling | low | Illegals are flooding our borders | Illegals | Pass |
| NC-002 | Name Calling / Labeling | low | They want to hand benefits to illegal aliens. | illegal aliens | Pass |
| NC-003 | Name Calling / Labeling | low | He called the inquiry a witch hunt. | witch hunt | Pass |
| EX-001 | Exaggeration / Minimization | low | Prices have skyrocketed since February. | skyrocketed | Pass |
| EX-002 | Exaggeration / Minimization | medium | It affects a mere three percent of households. | a mere | Pass |
| EX-003 | Exaggeration / Minimization | high | Officials said the leak was no big deal. | no big deal | Pass |
| DB-001 | Doubt | medium | The so-called experts disagreed with the findings. | so-called | Pass |
| DB-002 | Doubt | medium | The minister allegedly favors a quiet deal with donors. | allegedly | Pass |
| DB-003 | Doubt | low | Is the mayor really helping residents, or is he secretly helping his donors? | really; secretly | Pass |
| DB-004 | Doubt | medium | The senator claimed that the bill would pass easily. | claimed | Pass |
| FE-001 | Appeal to Fear / Prejudice | medium | Critics warn the plan is an existential threat to the region. | existential threat | Pass |
| FE-002 | Appeal to Fear / Prejudice | medium | Residents complain that the neighborhood is under siege from developers. | under siege | Pass |
| FE-003 | Appeal to Fear / Prejudice | low | The new rules will wreak havoc on small businesses. | wreak havoc | Pass |
| FW-001 | Flag-Waving | high | True patriots will support the bill. | True patriots | Pass |
| FW-002 | Flag-Waving | low | The agency kept the records secret from the American people. | the American people | Pass |
| CO-001 | Causal Oversimplification | high | The only reason prices rose is the new tax. | The only reason | Pass |
| SL-001 | Slogans | high | Supporters chanted drain the swamp at the rally. | drain the swamp | Pass |
| SL-002 | Slogans | medium | The party must win at all costs. | at all costs | Pass |
| AA-001 | Appeal to Authority | medium | Experts say the policy will fail. | Experts say | Pass |
| AA-002 | Appeal to Authority | high | Critics argue that it fails. | Critics argue | Pass |
| BF-001 | Black-and-White Fallacy | high | There is no middle ground on this issue. | no middle ground | Pass |
| BF-002 | Black-and-White Fallacy | medium | Either you support the plan or you oppose progress. | Either you | Pass |
| TT-001 | Thought-Terminating Clichés | high | The decision is final. End of discussion. | End of discussion | Pass |
| BW-001 | Bandwagon / Reductio ad Hitlerum | medium | Everyone knows the plan will fail. | Everyone knows | Pass |
| BW-002 | Bandwagon / Reductio ad Hitlerum | low | He made Stalinist statements about taking guns first. | Stalinist | Pass |
| SM-001 | Straw Men / Whataboutism / Red Herring | medium | But what about the scandal in the other party? | But what about | Pass |
| EX-004 | Exaggeration / Minimization | low | This is the greatest threat our civilization has ever faced. | the greatest threat our civilization has ever faced | Pass |
| CO-002 | Causal Oversimplification | medium | The strike would end tomorrow if the union simply gave up. | simply gave up | Pass |
| AA-003 | Appeal to Authority | medium | Our leaders said the plan is necessary, so there is no reason to question it. | there is no reason to question it | Pass |
| LL-013 | Loaded Language | medium | Migrants are flooding our borders every day. | flooding our borders | Pass |
| LL-014 | Loaded Language | low | It was a smear campaign built on bogus claims. | smear; bogus | Pass |
| RP-001 | Repetition | low | What this country needs is jobs, jobs, jobs. | jobs, jobs | Pass |

## C. Rules per technique (input for Table 9a)

| Technique | Rules | High | Medium | Low | Rule IDs |
|---|---|---|---|---|---|
| Loaded Language | 7 | 0 | 5 | 2 | LL-007, LL-011, LL-012, LL-015, LL-016, LL-013, LL-014 |
| Name Calling / Labeling | 5 | 0 | 2 | 3 | NC-004, NC-005, NC-001, NC-002, NC-003 |
| Repetition | 1 | 0 | 0 | 1 | RP-001 |
| Exaggeration / Minimization | 4 | 1 | 1 | 2 | EX-001, EX-002, EX-003, EX-004 |
| Doubt | 4 | 0 | 3 | 1 | DB-001, DB-002, DB-003, DB-004 |
| Appeal to Fear / Prejudice | 3 | 0 | 2 | 1 | FE-001, FE-002, FE-003 |
| Flag-Waving | 2 | 1 | 0 | 1 | FW-001, FW-002 |
| Causal Oversimplification | 2 | 1 | 1 | 0 | CO-001, CO-002 |
| Slogans | 2 | 1 | 1 | 0 | SL-001, SL-002 |
| Appeal to Authority | 3 | 1 | 2 | 0 | AA-001, AA-002, AA-003 |
| Black-and-White Fallacy | 2 | 1 | 1 | 0 | BF-001, BF-002 |
| Thought-Terminating Clichés | 1 | 1 | 0 | 0 | TT-001 |
| Bandwagon / Reductio ad Hitlerum | 2 | 0 | 1 | 1 | BW-001, BW-002 |
| Straw Men / Whataboutism / Red Herring | 1 | 0 | 1 | 0 | SM-001 |

## D. Sentence boundaries on a controlled corpus (8.4 item 2)

13 of 15 texts split exactly as the hand-marked gold. Boundary precision 100.0%, recall 83.3% (12 gold boundaries).

| Case | Text | Gold sentences | Detected sentences | Result |
|---|---|---|---|---|
| SB-01 | The U.S. Senate voted on Tuesday. The bill passed 52 to 48. | 2 | [The U.S. Senate voted on Tuesday.] [The bill passed 52 to 48.] | Pass |
| SB-02 | Dr. Smith said the rate rose 3.5 percent. Markets fell. | 2 | [Dr. Smith said the rate rose 3.5 percent.] [Markets fell.] | Pass |
| SB-03 | "This is a disaster," the mayor said. Critics disagreed. | 2 | ["This is a disaster," the mayor said.] [Critics disagreed.] | Pass |
| SB-04 | Is the plan working? Officials say yes! | 2 | [Is the plan working?] [Officials say yes!] | Pass |
| SB-05 | Prices rose in Jan. and Feb. according to the report. | 1 | [Prices rose in Jan. and Feb. according to the report.] | Pass |
| SB-06 | The company, based in Washington, D.C., hired 200 workers. | 1 | [The company, based in Washington, D.C., hired 200 workers.] | Pass |
| SB-07 | He waited... Then he left. | 2 | [He waited... Then he left.] | **Fail** |
| SB-08 | Officials met at 3 p.m. on Monday. No deal was reached. | 2 | [Officials met at 3 p.m. on Monday.] [No deal was reached.] | Pass |
| SB-09 | Mr. and Mrs. Jones arrived late. They apologized. | 2 | [Mr. and Mrs. Jones arrived late.] [They apologized.] | Pass |
| SB-10 | The vote was 7-2. Justice Roberts wrote the opinion. | 2 | [The vote was 7-2.] [Justice Roberts wrote the opinion.] | Pass |
| SB-11 | She asked, "Why now?" Nobody answered. | 2 | [She asked, "Why now?" Nobody answered.] | **Fail** |
| SB-12 | Inflation hit 9.1% in 2022. It has since eased. | 2 | [Inflation hit 9.1% in 2022.] [It has since eased.] | Pass |
| SB-13 | The St. Louis team won. Fans celebrated. | 2 | [The St. Louis team won.] [Fans celebrated.] | Pass |
| SB-14 | NASA's Artemis II crew returned safely. The mission lasted 10 days. | 2 | [NASA's Artemis II crew returned safely.] [The mission lasted 10 days.] | Pass |
| SB-15 | One sentence without a final period | 1 | [One sentence without a final period] | Pass |

## E. Part-of-speech tagging on hand-annotated words (8.4 item 3)

28 of 30 words tagged correctly (93.3%).

| Case | Sentence | Word | Gold | Tagger output | Result |
|---|---|---|---|---|---|
| POS-01 | The governor slammed the proposal. | slammed | Verb | Verb, PastTense | Pass |
| POS-02 | It was a shameful decision. | shameful | Adjective | Adjective | Pass |
| POS-03 | The radical activists blocked the road. | radical | Adjective | Noun, Actor, Singular | **Fail** |
| POS-04 | The regime cracked down on dissent. | regime | Noun | Noun, Singular | Pass |
| POS-05 | Prices skyrocketed last year. | skyrocketed | Verb | Verb, PastTense | Pass |
| POS-06 | The so-called experts disagreed. | experts | Noun | Noun, Plural | Pass |
| POS-07 | He allegedly took the money. | allegedly | Adverb | Adverb | Pass |
| POS-08 | The senator claimed victory. | claimed | Verb | Verb, PastTense | Pass |
| POS-09 | The claim was false. | claim | Noun | Noun, Singular | Pass |
| POS-10 | It is a mere formality. | mere | Adjective | Adjective | Pass |
| POS-11 | They plan to attack the city. | attack | Verb | Verb, PresentTense, Infinitive | Pass |
| POS-12 | The attack killed ten people. | attack | Noun | Noun, Singular | Pass |
| POS-13 | Critics say the plan will fail. | say | Verb | Verb, PresentTense, Infinitive | Pass |
| POS-14 | Critics say the plan will fail. | fail | Verb | Verb, PresentTense, Infinitive | Pass |
| POS-15 | The flood was catastrophic. | catastrophic | Adjective | Adjective | Pass |
| POS-16 | Migrants are flooding the border. | flooding | Verb | Verb, PresentTense, Gerund | Pass |
| POS-17 | The flooding damaged homes. | flooding | Noun | Noun, Singular | Pass |
| POS-18 | Officials refused to comment. | refused | Verb | Verb, PastTense | Pass |
| POS-19 | The notorious gang returned. | notorious | Adjective | Adjective | Pass |
| POS-20 | She spoke quickly. | quickly | Adverb | Adverb | Pass |
| POS-21 | Experts warn of an existential threat. | existential | Adjective | Adjective | Pass |
| POS-22 | Experts warn of an existential threat. | threat | Noun | Noun, Singular | Pass |
| POS-23 | The record was broken. | record | Noun | Noun, Singular | Pass |
| POS-24 | They record every call. | record | Verb | Verb, PresentTense, Infinitive | Pass |
| POS-25 | Everyone knows the truth. | knows | Verb | Verb, PresentTense | Pass |
| POS-26 | True patriots support the bill. | patriots | Noun | Noun, Plural, Actor | Pass |
| POS-27 | True patriots support the bill. | support | Verb | Verb, PresentTense, Infinitive | Pass |
| POS-28 | The terrorists fled the scene. | terrorists | Noun | Noun, Plural | Pass |
| POS-29 | It was a total disaster. | total | Adjective | Noun, Singular | **Fail** |
| POS-30 | It was a total disaster. | disaster | Noun | Noun, Singular | Pass |
