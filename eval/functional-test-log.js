#!/usr/bin/env node
/**
 * Functional Test Log: shows that every one of the 14 techniques is detected by the
 * full pipeline (L, S and C conditions, quote filter, conflict resolution).
 *
 *   node eval/functional-test-log.js [outDir]     (default eval/reports)
 *
 * Part A runs the thesis reference examples (Table 12 and Table 9) through the pipeline.
 * Part B runs one targeted test sentence per rule and checks that the rule itself fires.
 * Part C counts rules per technique and confidence tier (input for Table 9a).
 * Writes functional-test-log.md and functional-test-log.json.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const PatternMatcher = require("../content/pattern-matcher.js");
const ConflictResolver = require("../content/conflict-resolver.js");

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8"));
const label = (t) => (catalog.techniques[t] ? catalog.techniques[t].label : t);

/** Rendered detections for one sentence, exactly as the content script would draw them. */
function detect(text) {
  const candidates = PatternMatcher.findMatches(text, catalog.patterns, catalog.techniques);
  return ConflictResolver.resolveWithAudit(candidates).active;
}

// Thesis reference examples (Table 12, "Reference Example Analysis", and Table 9).
const REFERENCE = [
  ["Table 12", "LOADED_LANGUAGE", "Israel must defend itself from the barbaric terrorists surrounding its borders."],
  ["Table 12", "NAME_CALLING_LABELING", "These Hamas sympathizers are nothing but terrorist apologists."],
  ["Table 9", "REPETITION", "We must take our country back! Take it back!"],
  ["Table 12", "EXAGGERATION_MINIMIZATION", "If Israel loses this war, the entire country will cease to exist."],
  ["Table 12", "DOUBT", "Are these protesters really demanding human rights, or are they secretly supporting Hamas?"],
  ["Table 12", "APPEAL_TO_FEAR_PREJUDICE", "If Hamas is not completely defeated, Israeli families will never be safe again."],
  ["Table 12", "FLAG_WAVING", "True supporters of Israel stand with the IDF."],
  ["Table 12", "CAUSAL_OVERSIMPLIFICATION", "There would be peace tomorrow if Hamas simply surrendered."],
  ["Table 12", "SLOGANS", "Israel must win at all costs."],
  ["Table 12", "APPEAL_TO_AUTHORITY", "Our military leaders have said the operation is necessary, so there is no reason to question it."],
  ["Table 12", "BLACK_AND_WHITE_FALLACY", "You either support Israel or you support terrorism."],
  ["Table 12", "THOUGHT_TERMINATING_CLICHES", "Israel has the right to defend itself. End of discussion."],
  ["Table 12", "STRAW_MAN_WHATABOUTISM_RED_HERRING", "Instead of criticizing Israel, why aren't you talking about what Hamas did?"],
  ["Table 12", "BANDWAGON_REDUCTIO_AD_HITLERUM", "The whole world now stands with Israel, and anyone who still questions the operation is on the wrong side of history."]
];

// One targeted test sentence per rule (the catalog's sourceExample is often a shared
// per-technique illustration, so it does not always contain the rule's own trigger).
const PER_RULE = {
  "LL-007": "The radical activists blocked the road for hours.",
  "NC-004": "Local terrorists attacked the outpost overnight.",
  "NC-005": "The regime cracked down on dissidents after the protest.",
  "LL-011": "The governor slammed the new budget proposal.",
  "LL-012": "It was a shameful decision by the board.",
  "LL-015": "The notorious criminal was finally apprehended.",
  "LL-016": "The senator admitted that he lied to investigators.",
  "NC-001": "Illegals are flooding our borders",
  "NC-002": "They want to hand benefits to illegal aliens.",
  "NC-003": "He called the inquiry a witch hunt.",
  "EX-001": "Prices have skyrocketed since February.",
  "EX-002": "It affects a mere three percent of households.",
  "EX-003": "Officials said the leak was no big deal.",
  "DB-001": "The so-called experts disagreed with the findings.",
  "DB-002": "The minister allegedly favors a quiet deal with donors.",
  "DB-003": "Is the mayor really helping residents, or is he secretly helping his donors?",
  "DB-004": "The senator claimed that the bill would pass easily.",
  "FE-001": "Critics warn the plan is an existential threat to the region.",
  "FE-002": "Residents complain that the neighborhood is under siege from developers.",
  "FE-003": "The new rules will wreak havoc on small businesses.",
  "FW-001": "True patriots will support the bill.",
  "FW-002": "The agency kept the records secret from the American people.",
  "CO-001": "The only reason prices rose is the new tax.",
  "SL-001": "Supporters chanted drain the swamp at the rally.",
  "SL-002": "The party must win at all costs.",
  "AA-001": "Experts say the policy will fail.",
  "AA-002": "Critics argue that it fails.",
  "BF-001": "There is no middle ground on this issue.",
  "BF-002": "Either you support the plan or you oppose progress.",
  "TT-001": "The decision is final. End of discussion.",
  "BW-001": "Everyone knows the plan will fail.",
  "BW-002": "He made Stalinist statements about taking guns first.",
  "SM-001": "But what about the scandal in the other party?",
  "EX-004": "This is the greatest threat our civilization has ever faced.",
  "CO-002": "The strike would end tomorrow if the union simply gave up.",
  "AA-003": "Our leaders said the plan is necessary, so there is no reason to question it.",
  "LL-013": "Migrants are flooding our borders every day.",
  "LL-014": "It was a smear campaign built on bogus claims.",
  "RP-001": "What this country needs is jobs, jobs, jobs."
};

// Part D (8.4 item 2): controlled sentence corpus. Gold = the sentences a careful reader marks,
// written by hand; the hard cases (abbreviations, decimals, quotes, ellipses) are deliberate.
const SENTENCES = [
  ["The U.S. Senate voted on Tuesday.", "The bill passed 52 to 48."],
  ["Dr. Smith said the rate rose 3.5 percent.", "Markets fell."],
  ["\"This is a disaster,\" the mayor said.", "Critics disagreed."],
  ["Is the plan working?", "Officials say yes!"],
  ["Prices rose in Jan. and Feb. according to the report."],
  ["The company, based in Washington, D.C., hired 200 workers."],
  ["He waited...", "Then he left."],
  ["Officials met at 3 p.m. on Monday.", "No deal was reached."],
  ["Mr. and Mrs. Jones arrived late.", "They apologized."],
  ["The vote was 7-2.", "Justice Roberts wrote the opinion."],
  ["She asked, \"Why now?\"", "Nobody answered."],
  ["Inflation hit 9.1% in 2022.", "It has since eased."],
  ["The St. Louis team won.", "Fans celebrated."],
  ["NASA's Artemis II crew returned safely.", "The mission lasted 10 days."],
  ["One sentence without a final period"]
];

// Part E (8.4 item 3): hand-annotated part of speech of words the rules' Linguistic Conditions
// depend on, including words whose tag changes with use (attack, record, flooding, claim).
const POS = [
  ["The governor slammed the proposal.", "slammed", "Verb"],
  ["It was a shameful decision.", "shameful", "Adjective"],
  ["The radical activists blocked the road.", "radical", "Adjective"],
  ["The regime cracked down on dissent.", "regime", "Noun"],
  ["Prices skyrocketed last year.", "skyrocketed", "Verb"],
  ["The so-called experts disagreed.", "experts", "Noun"],
  ["He allegedly took the money.", "allegedly", "Adverb"],
  ["The senator claimed victory.", "claimed", "Verb"],
  ["The claim was false.", "claim", "Noun"],
  ["It is a mere formality.", "mere", "Adjective"],
  ["They plan to attack the city.", "attack", "Verb"],
  ["The attack killed ten people.", "attack", "Noun"],
  ["Critics say the plan will fail.", "say", "Verb"],
  ["Critics say the plan will fail.", "fail", "Verb"],
  ["The flood was catastrophic.", "catastrophic", "Adjective"],
  ["Migrants are flooding the border.", "flooding", "Verb"],
  ["The flooding damaged homes.", "flooding", "Noun"],
  ["Officials refused to comment.", "refused", "Verb"],
  ["The notorious gang returned.", "notorious", "Adjective"],
  ["She spoke quickly.", "quickly", "Adverb"],
  ["Experts warn of an existential threat.", "existential", "Adjective"],
  ["Experts warn of an existential threat.", "threat", "Noun"],
  ["The record was broken.", "record", "Noun"],
  ["They record every call.", "record", "Verb"],
  ["Everyone knows the truth.", "knows", "Verb"],
  ["True patriots support the bill.", "patriots", "Noun"],
  ["True patriots support the bill.", "support", "Verb"],
  ["The terrorists fled the scene.", "terrorists", "Noun"],
  ["It was a total disaster.", "total", "Adjective"],
  ["It was a total disaster.", "disaster", "Noun"]
];

/** Start offsets of sentences 2..n, from a list of sentences joined by single spaces. */
function boundaries(sentences) {
  const out = [];
  let pos = 0;
  sentences.forEach((s, i) => {
    if (i > 0) out.push(pos);
    pos += s.length + 1;
  });
  return out;
}

function sentenceTest() {
  const rows = SENTENCES.map((gold, i) => {
    const text = gold.join(" ");
    const terms = PatternMatcher._internals.flattenTerms(text);
    const gotB = terms.sentences.slice(1).map((s) => terms[s.first].offset.start);
    const cuts = [0].concat(gotB, [text.length]);
    const got = cuts.slice(0, -1).map((c, k) => text.slice(c, cuts[k + 1]).trim());
    const goldB = boundaries(gold);
    return { case: "SB-" + String(i + 1).padStart(2, "0"), text: text, gold: gold, predicted: got, goldBoundaries: goldB, predictedBoundaries: gotB, correct: goldB.join() === gotB.join() };
  });
  const goldN = rows.reduce((s, r) => s + r.goldBoundaries.length, 0);
  const gotN = rows.reduce((s, r) => s + r.predictedBoundaries.length, 0);
  const hit = rows.reduce((s, r) => s + r.predictedBoundaries.filter((b) => r.goldBoundaries.includes(b)).length, 0);
  return { rows: rows, textsCorrect: rows.filter((r) => r.correct).length, boundaryPrecision: gotN ? hit / gotN : null, boundaryRecall: goldN ? hit / goldN : null, goldBoundaries: goldN, predictedBoundaries: gotN };
}

function posTest() {
  const rows = POS.map(([sentence, word, gold], i) => {
    const t = PatternMatcher._internals.flattenTerms(sentence).find((x) => x.normal === word || x.text === word);
    const tags = t ? t.tags : [];
    return { case: "POS-" + String(i + 1).padStart(2, "0"), sentence: sentence, word: word, gold: gold, tags: tags, correct: tags.includes(gold) };
  });
  return { rows: rows, correct: rows.filter((r) => r.correct).length, accuracy: rows.filter((r) => r.correct).length / rows.length };
}

function run() {
  const partA = REFERENCE.map(([source, technique, sentence], i) => {
    const hits = detect(sentence).filter((m) => m.technique === technique);
    return {
      case: "FT-" + String(i + 1).padStart(2, "0"),
      source: source,
      technique: technique,
      sentence: sentence,
      detected: hits.length > 0,
      rules: hits.map((m) => m.id),
      phrases: hits.map((m) => m.matchedText)
    };
  });

  const partB = catalog.patterns.map((p) => {
    const text = PER_RULE[p.id] || "";
    const hits = text ? detect(text).filter((m) => m.id === p.id) : [];
    const sameTechnique = text ? detect(text).filter((m) => m.technique === p.technique) : [];
    return {
      rule: p.id,
      technique: p.technique,
      tier: p.confidenceTier,
      example: text || "",
      ruleFired: hits.length > 0,
      techniqueDetected: sameTechnique.length > 0,
      detectedBy: sameTechnique.map((m) => m.id),
      phrases: hits.map((m) => m.matchedText)
    };
  });

  const partC = Object.keys(catalog.techniques).map((t) => {
    const rules = catalog.patterns.filter((p) => p.technique === t);
    const tiers = { high: 0, medium: 0, low: 0 };
    rules.forEach((p) => (tiers[p.confidenceTier] = (tiers[p.confidenceTier] || 0) + 1));
    const a = partA.find((r) => r.technique === t);
    return { technique: t, rules: rules.length, ruleIds: rules.map((p) => p.id), tiers: tiers, referenceExampleDetected: a ? a.detected : null };
  });

  return { catalogVersion: catalog.catalogVersion, ruleCount: catalog.patterns.length, generatedAt: new Date().toISOString(), referenceExamples: partA, perRule: partB, perTechnique: partC, sentenceBoundaries: sentenceTest(), posTagging: posTest() };
}

function toMarkdown(r) {
  const yes = (b) => (b ? "Pass" : "**Fail**");
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  const L = [];
  L.push("# Functional Test Log", "");
  L.push("Catalog " + r.catalogVersion + " (" + r.ruleCount + " rules). Generated " + new Date(r.generatedAt).toLocaleDateString("en-CA") + " by `node eval/functional-test-log.js`.", "");
  const passA = r.referenceExamples.filter((x) => x.detected).length;
  L.push("## A. Thesis reference examples (one per technique)", "");
  L.push(passA + " of " + r.referenceExamples.length + " techniques detected on their reference example.", "");
  L.push("| Case | Technique | Source | Test sentence | Detected phrase | Rule | Result |", "|---|---|---|---|---|---|---|");
  r.referenceExamples.forEach((x) => L.push("| " + [x.case, label(x.technique), x.source, esc(x.sentence), esc(x.phrases.join("; ") || "-"), x.rules.join(", ") || "-", yes(x.detected)].join(" | ") + " |"));
  const passB = r.perRule.filter((x) => x.ruleFired).length;
  L.push("", "## B. Every rule on a targeted test sentence", "");
  L.push(passB + " of " + r.perRule.length + " rules fire on their test sentence.", "");
  L.push("| Rule | Technique | Tier | Test sentence | Detected phrase | Result |", "|---|---|---|---|---|---|");
  r.perRule.forEach((x) => {
    const note = x.ruleFired ? "Pass" : x.techniqueDetected ? "Pass (technique detected by " + x.detectedBy.join(", ") + ")" : "**Fail**";
    L.push("| " + [x.rule, label(x.technique), x.tier, esc(x.example), esc(x.phrases.join("; ") || "-"), note].join(" | ") + " |");
  });
  L.push("", "## C. Rules per technique (input for Table 9a)", "");
  L.push("| Technique | Rules | High | Medium | Low | Rule IDs |", "|---|---|---|---|---|---|");
  r.perTechnique.forEach((x) => L.push("| " + [label(x.technique), x.rules, x.tiers.high || 0, x.tiers.medium || 0, x.tiers.low || 0, x.ruleIds.join(", ")].join(" | ") + " |"));
  const pc = (x) => (x * 100).toFixed(1) + "%";
  const sb = r.sentenceBoundaries;
  L.push("", "## D. Sentence boundaries on a controlled corpus (8.4 item 2)", "");
  L.push(sb.textsCorrect + " of " + sb.rows.length + " texts split exactly as the hand-marked gold. Boundary precision " + pc(sb.boundaryPrecision) + ", recall " + pc(sb.boundaryRecall) + " (" + sb.goldBoundaries + " gold boundaries).", "");
  L.push("| Case | Text | Gold sentences | Detected sentences | Result |", "|---|---|---|---|---|");
  sb.rows.forEach((x) => L.push("| " + [x.case, esc(x.text), x.gold.length, esc(x.predicted.map((s) => "[" + s + "]").join(" ")), yes(x.correct)].join(" | ") + " |"));
  const pt = r.posTagging;
  L.push("", "## E. Part-of-speech tagging on hand-annotated words (8.4 item 3)", "");
  L.push(pt.correct + " of " + pt.rows.length + " words tagged correctly (" + pc(pt.accuracy) + ").", "");
  L.push("| Case | Sentence | Word | Gold | Tagger output | Result |", "|---|---|---|---|---|---|");
  pt.rows.forEach((x) => L.push("| " + [x.case, esc(x.sentence), x.word, x.gold, x.tags.join(", ") || "(not found)", yes(x.correct)].join(" | ") + " |"));
  return L.join("\n") + "\n";
}

function main() {
  const outDir = process.argv[2] || path.join(__dirname, "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const r = run();
  fs.writeFileSync(path.join(outDir, "functional-test-log.json"), JSON.stringify(r, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "functional-test-log.md"), toMarkdown(r));
  const a = r.referenceExamples.filter((x) => x.detected).length;
  const b = r.perRule.filter((x) => x.ruleFired || x.techniqueDetected).length;
  console.log("Reference examples: " + a + "/" + r.referenceExamples.length + " techniques detected");
  console.log("Rules on their test sentence: " + b + "/" + r.perRule.length);
  r.perRule.filter((x) => !x.ruleFired).forEach((x) => console.log("  " + x.rule + ": " + (x.techniqueDetected ? "technique detected by " + x.detectedBy.join(",") : "NOT detected") + " | " + x.example));
  const sb = r.sentenceBoundaries;
  console.log("Sentence boundaries: " + sb.textsCorrect + "/" + sb.rows.length + " texts exact; boundary precision " + sb.boundaryPrecision.toFixed(3) + ", recall " + sb.boundaryRecall.toFixed(3));
  console.log("POS tagging: " + r.posTagging.correct + "/" + r.posTagging.rows.length + " words correct");
  console.log("Wrote " + path.join(outDir, "functional-test-log.md"));
}

if (require.main === module) main();

module.exports = { run: run, detect: detect, REFERENCE: REFERENCE };
