/**
 * Tests for the pattern catalog, matcher and conflict resolver.
 * Run with: node --test test/pattern-matcher.test.js
 * (Node's built-in test runner; no third-party framework.)
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PatternMatcher = require("../content/pattern-matcher.js");
const ConflictResolver = require("../content/conflict-resolver.js");

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8"));
const patterns = catalog.patterns;
const techniques = catalog.techniques;

const full = (text) => PatternMatcher.findMatches(text, patterns, techniques);
const baseline = (text) => PatternMatcher.findMatches(text, patterns, techniques, { mode: "lexicalOnly" });
const ids = (matches) => matches.map((m) => m.id);
const first = (text, id) => full(text).find((m) => m.id === id);

// ---------------------------------------------------------------------------
// Catalog schema (thesis Table 13) and taxonomy
// ---------------------------------------------------------------------------

test("taxonomy: exactly the 14 SemEval-2020 Task 11 techniques", () => {
  const keys = Object.keys(techniques);
  assert.equal(keys.length, 14);
  assert.equal(keys[0], "LOADED_LANGUAGE");
  assert.equal(keys[13], "STRAW_MAN_WHATABOUTISM_RED_HERRING");
  for (const k of keys) assert.ok(techniques[k].label && techniques[k].description.length > 30);
});

test("every rule carries the ten Table 13 fields", () => {
  for (const p of patterns) {
    assert.ok(p.id, "Pattern ID");
    assert.ok(techniques[p.technique], `${p.id}: SemEval Technique`);
    assert.equal(p.referenceDefinition, techniques[p.technique].description, `${p.id}: Reference Definition`);
    assert.ok(p.lexicalTrigger && p.lexicalTrigger.pattern && p.lexicalTrigger.words.length, `${p.id}: Lexical Trigger`);
    assert.ok(p.linguisticCondition && p.linguisticCondition.type && p.linguisticCondition.description, `${p.id}: Linguistic Condition`);
    assert.ok(p.contextCondition && p.contextCondition.description, `${p.id}: Context Condition`);
    assert.equal(p.targetSpan, "trigger", `${p.id}: Target Span`);
    assert.ok(p.explanation && p.explanation.length > 20, `${p.id}: Explanation`);
    assert.ok(p.sourceExample && p.sourceExample.text && p.sourceExample.source && p.sourceExample.triggerEvidence, `${p.id}: Source Example`);
    assert.ok(["high", "medium", "low"].includes(p.confidenceTier), `${p.id}: Confidence Tier`);
  }
});

test("catalog integrity: unique ids, compilable regexes, only known condition types", () => {
  assert.equal(new Set(ids(patterns)).size, patterns.length, "duplicate pattern ids");
  const used = new Set();
  (function walk(o) {
    if (o && typeof o === "object") {
      if (typeof o.type === "string") used.add(o.type);
      Object.values(o).forEach(walk);
    }
  })(patterns.map((p) => p.linguisticCondition));
  for (const t of used) assert.ok(PatternMatcher.LINGUISTIC_TYPES.includes(t), `unknown linguisticCondition type: ${t}`);
  for (const p of patterns) assert.doesNotThrow(() => new RegExp(p.lexicalTrigger.pattern.replace(/ /g, "\\s+"), "gi"), p.id);
});

test("every technique except REPETITION has at least one rule", () => {
  const used = new Set(patterns.map((p) => p.technique));
  assert.deepEqual(Object.keys(techniques).filter((t) => !used.has(t)), ["REPETITION"]);
});

test("match objects record span, ids, technique, tier and explanation (FR-DET-03)", () => {
  const text = "The senator claimed that the bill would pass.";
  const m = first(text, "AF-001");
  assert.ok(m);
  assert.equal(text.slice(m.start, m.end), "claimed");
  assert.equal(typeof m.tokenStart, "number");
  assert.equal(typeof m.tokenEnd, "number");
  assert.equal(m.technique, "DOUBT");
  assert.equal(m.techniqueLabel, "Doubt");
  assert.equal(m.confidenceTier, "medium");
  assert.ok(m.explanation);
});

// ---------------------------------------------------------------------------
// Original seed rules, re-mapped to SemEval techniques
// ---------------------------------------------------------------------------

test("seed rules keep their behavior and map to SemEval techniques", () => {
  const byId = Object.fromEntries(patterns.map((p) => [p.id, p.technique]));
  assert.equal(byId["LL-007"], "LOADED_LANGUAGE");
  assert.equal(byId["LL-008"], "NAME_CALLING_LABELING");
  assert.equal(byId["PS-003"], "LOADED_LANGUAGE");
  assert.equal(byId["AF-001"], "DOUBT");
  assert.equal(byId["SC-012"], "APPEAL_TO_AUTHORITY");
});

test("LL-007 fires on 'radical faction' but not on 'radical surgery'", () => {
  const text = "The radical faction pushed for immediate reform.";
  const m = first(text, "LL-007");
  assert.equal(text.slice(m.start, m.end), "radical");
  assert.equal(m.neutralAlternative, "non-mainstream");
  assert.ok(!first("She underwent radical surgery last week.", "LL-007"));
});

test("PS-003 fires on a reporting verb, not on 'admitted to the hospital'", () => {
  assert.ok(first("The senator admitted that he lied to investigators.", "PS-003"));
  assert.ok(first('The spokesperson acknowledged "we made mistakes" during the briefing.', "PS-003"));
  assert.ok(!first("The hospital admitted the patient overnight.", "PS-003"));
  assert.equal(first("The senator admitted that he lied.", "PS-003").neutralAlternative, "said");
});

test("SC-012 fires on unattributed collective-claim phrases", () => {
  const text = "Some say the policy will fail. Critics argue that the bill goes too far.";
  const hits = full(text).filter((m) => m.id === "SC-012");
  assert.deepEqual(hits.map((m) => text.slice(m.start, m.end).toLowerCase()), ["some say", "critics argue"]);
  assert.equal(hits[0].neutralAlternative, "Name the specific source");
});

test("LL-008 name-calling labels: plural noun, singular attributive adjective, racists", () => {
  assert.ok(first("Local terrorists attacked the outpost overnight.", "LL-008"));
  assert.ok(first("The group was labeled a terrorist organization by the state department.", "LL-008"));
  assert.ok(first("The rally attracted known racists from across the region.", "LL-008"));
});

test("LL-009 and LL-010 fire on the loaded senses only", () => {
  assert.ok(first("The leaflet was dismissed as propaganda by independent researchers.", "LL-009"));
  assert.ok(!first("The museum's new exhibit features a rare propaganda poster from the era.", "LL-009"));
  assert.ok(first("The regime cracked down on dissidents after the protest.", "LL-010"));
  assert.ok(!first("She follows a strict exercise regime every morning.", "LL-010"));
});

test("EM-001 and AF-001", () => {
  for (const t of ["The notorious criminal was finally apprehended.", "The disgraced senator resigned.", "The infamous scandal rocked the administration."]) {
    assert.ok(first(t, "EM-001"), t);
  }
  assert.equal(first("The senator claimed that the bill would pass easily.", "AF-001").neutralAlternative, "said");
  assert.ok(!first("He filed an insurance claim after the accident.", "AF-001"));
  assert.ok(!first("The claimed savings turned out to be exaggerated.", "AF-001"));
});

// ---------------------------------------------------------------------------
// Rules for the remaining techniques
// ---------------------------------------------------------------------------

const POSITIVE_CASES = [
  ["LL-011", "Trump blasts GOP defectors over the war powers vote.", "blasts", "criticizes"],
  ["LL-012", "It was a bizarre and shameful episode for the department.", "bizarre", null],
  ["NC-001", "A vote for the socialists, for the radicals, for the haters.", "socialists", null],
  ["EX-001", "Prices of petrol and diesel have skyrocketed since February.", "skyrocketed", "rose sharply"],
  ["EX-002", "He dismissed the report as nothing more than gossip.", "nothing more than", null],
  ["EX-002", "It affects a mere three percent of households.", "a mere", null],
  ["EX-003", "Officials said the delay was no big deal.", "no big deal", null],
  ["DB-001", "The so-called experts disagreed with the findings.", "so-called", null],
  ["DB-002", "An oil tanker allegedly linked to Venezuela was seized.", "allegedly", null],
  ["FE-001", "Candidates called the policy an existential threat to the country.", "existential threat", null],
  ["FW-001", "Only true patriots would support this measure.", "true patriots", null],
  ["CO-001", "The only reason prices rose is the new tax.", "The only reason", null],
  ["SL-001", "Crowds chanted build the wall at the rally.", "build the wall", null],
  ["AA-001", "But experts warn such a ban would put pressure on prices.", "experts warn", null],
  ["BF-001", "He said it was a case of with us or against us.", "with us or against us", null],
  ["BF-002", "In this fight you’re either a friend or an enemy.", "you’re either", null],
  ["TT-001", "The ruling stands, and that is the end of story.", "end of story", null],
  ["TT-001", "Prices are high, but it’s what it is.", "it’s what it is", null],
  ["BW-001", "Everyone knows the system is rigged.", "Everyone knows", null],
  ["SM-001", "Asked about the budget, he said but what about the last administration?", "but what about", null]
];
for (const [id, text, expected, alt] of POSITIVE_CASES) {
  test(`${id} fires on "${expected}"`, () => {
    const m = full(text).find((x) => x.id === id && text.slice(x.start, x.end) === expected);
    assert.ok(m, `expected ${id} to match "${expected}" in: ${text}`);
    if (alt) assert.equal(m.neutralAlternative, alt);
  });
}

test("neutral reporting produces no matches", () => {
  const neutral =
    "The city council approved the new budget on Tuesday after a public hearing. " +
    "Officials said the plan includes funding for road repairs and a new library branch, " +
    "and the vote was 5 to 2. The mayor will sign the measure next week.";
  assert.equal(full(neutral).length, 0);
  assert.equal(baseline(neutral).length, 0);
});

// ---------------------------------------------------------------------------
// D(s,r) = L AND S AND C: the full pipeline vs the lexical-only baseline (thesis 8.3)
// ---------------------------------------------------------------------------

const CONDITION_CASES = [
  ["LL-011", "She slammed the door and left the room.", "context: physical sense"],
  ["LL-011", "The rocket blasted off from the pad at dawn.", "structure: no object follows"],
  ["EX-001", "Prices skyrocketed 40% to 199.79p in October.", "context: the sentence states a figure"],
  ["DB-002", "The tanker, allegedly linked to Venezuela, was seized by police.", "context: legal hedging"],
  ["DB-003", "What is really happening in the market?", "context: plain question, no insinuated alternative"],
  ["PS-003", "The hospital admitted the patient overnight.", "structure: not a reporting verb"],
  ["AF-001", "He filed an insurance claim after the accident.", "structure: noun sense"],
  ["NC-001", "The Democratic Socialists of America endorsed the measure.", "context: proper organization name"],
  ["LL-007", "She underwent radical surgery last week.", "context: neutral technical collocation"]
];
for (const [id, text, why] of CONDITION_CASES) {
  test(`${id}: lexical baseline flags it, the full pipeline does not (${why})`, () => {
    assert.ok(baseline(text).some((m) => m.id === id), `baseline should flag ${id}: ${text}`);
    assert.ok(!full(text).some((m) => m.id === id), `full pipeline should not flag ${id}: ${text}`);
  });
}

test("the full pipeline's detections are always a subset of the baseline's candidates", () => {
  const text =
    "Trump blasts GOP defectors. The so-called experts warn prices have skyrocketed. " +
    "She slammed the door. Local terrorists attacked. It is what it is.";
  const key = (m) => m.id + ":" + m.start + ":" + m.end;
  const baseKeys = new Set(baseline(text).map(key));
  const fullMatches = full(text);
  assert.ok(fullMatches.length > 0);
  for (const m of fullMatches) assert.ok(baseKeys.has(key(m)), key(m));
  assert.ok(baseline(text).length > fullMatches.length, "conditions should remove at least one candidate here");
});

test("matcher can report why a candidate failed (evaluate)", () => {
  const rec = PatternMatcher.evaluate("She slammed the door and left.", patterns, techniques).find((r) => r.id === "LL-011");
  assert.equal(rec.passed, false);
  assert.equal(rec.failedAt, "context");
});

test("DB-003 fires on the insinuating rhetorical question", () => {
  const text = "Are these protesters really demanding human rights, or are they secretly supporting Hamas?";
  assert.equal(full(text).filter((m) => m.id === "DB-003").length, 2);
});

// ---------------------------------------------------------------------------
// Reference examples: thesis Table 12 (Stage 2, "Reference Example Analysis")
// ---------------------------------------------------------------------------

const TABLE_12 = [
  ["LOADED_LANGUAGE", "Israel must defend itself from the barbaric terrorists surrounding its borders."],
  ["NAME_CALLING_LABELING", "These Hamas sympathizers are nothing but terrorist apologists."],
  ["DOUBT", "Are these protesters really demanding human rights, or are they secretly supporting Hamas?"],
  ["APPEAL_TO_FEAR_PREJUDICE", "If Hamas is not completely defeated, Israeli families will never be safe again."],
  ["FLAG_WAVING", "True supporters of Israel stand with the IDF."],
  ["SLOGANS", "Israel must win at all costs."],
  ["BLACK_AND_WHITE_FALLACY", "You either support Israel or you support terrorism."],
  ["THOUGHT_TERMINATING_CLICHES", "Israel has the right to defend itself. End of discussion."],
  ["STRAW_MAN_WHATABOUTISM_RED_HERRING", "Instead of criticizing Israel, why aren't you talking about what Hamas did?"],
  ["BANDWAGON_REDUCTIO_AD_HITLERUM", "The whole world now stands with Israel, and anyone who still questions the operation is on the wrong side of history."]
];
for (const [technique, sentence] of TABLE_12) {
  test(`Table 12 example is flagged as ${technique}`, () => {
    assert.ok(full(sentence).some((m) => m.technique === technique), `not flagged as ${technique}: ${sentence}`);
  });
}

const TABLE_12_GAPS = [
  ["REPETITION", "Repeatedly describing protesters as 'terrorists' without distinguishing the specific individuals (needs a repeated-expression detector)."],
  ["EXAGGERATION_MINIMIZATION", "If Israel loses this war, the entire country will cease to exist."],
  ["CAUSAL_OVERSIMPLIFICATION", "There would be peace tomorrow if Hamas simply surrendered."],
  ["APPEAL_TO_AUTHORITY", "Our military leaders have said the operation is necessary, so there is no reason to question it."]
];
for (const [technique, sentence] of TABLE_12_GAPS) {
  test(`Table 12 example is flagged as ${technique}`, { todo: "not yet covered by a rule" }, () => {
    assert.ok(full(sentence).some((m) => m.technique === technique));
  });
}

test("REGRESSION: multi-word phrases match across line breaks and NBSP in raw textContent", () => {
  const wrapped = "One speaker called it an existential\n      threat to local services.";
  const m = first(wrapped, "FE-001");
  assert.ok(m, "phrase split by a line break was missed");
  assert.equal(wrapped.slice(m.start, m.end), "existential\n      threat");
  assert.ok(first("Some\n   say the plan will fail.", "SC-012"));
  assert.ok(first("Critics argue that it fails.", "SC-012"));
  assert.equal(first("Trump lashed\n   out at the defectors.", "LL-011").neutralAlternative, "criticized");
});

// ---------------------------------------------------------------------------
// Conflict resolution (thesis FR-DET-04)
// ---------------------------------------------------------------------------

const det = (id, start, end, tier) => ({ id, start, end, confidenceTier: tier });

test("FR-DET-04 rule 1: the longest span wins", () => {
  const r = ConflictResolver.resolve([det("A-1", 10, 20, "high"), det("B-1", 10, 30, "low")]);
  assert.deepEqual(ids(r), ["B-1"]);
});

test("FR-DET-04 rule 2: equal length, the higher confidence tier wins", () => {
  const r = ConflictResolver.resolve([det("A-1", 0, 10, "low"), det("B-1", 0, 10, "high")]);
  assert.deepEqual(ids(r), ["B-1"]);
});

test("FR-DET-04 rule 3: equal length and tier, the earliest start offset wins", () => {
  const r = ConflictResolver.resolve([det("A-1", 5, 15, "medium"), det("B-1", 0, 10, "medium")]);
  assert.deepEqual(ids(r), ["B-1"]);
});

test("FR-DET-04 rule 3: if the offset is also equal, the lowest Pattern ID wins", () => {
  const r = ConflictResolver.resolve([det("LL-009", 0, 10, "medium"), det("LL-007", 0, 10, "medium")]);
  assert.deepEqual(ids(r), ["LL-007"]);
});

test("FR-DET-04: suppressed detections are kept for the audit log with the deciding rule", () => {
  const { active, suppressed } = ConflictResolver.resolveWithAudit([
    det("A-1", 0, 10, "low"),
    det("B-1", 0, 10, "high"),
    det("C-1", 2, 6, "high"),
    det("D-1", 20, 30, "medium")
  ]);
  assert.deepEqual(ids(active), ["B-1", "D-1"]);
  assert.equal(suppressed.length, 2);
  const a = suppressed.find((s) => s.id === "A-1");
  assert.equal(a.decidedBy, "confidence-tier");
  assert.equal(a.suppressedBy.id, "B-1");
  assert.equal(suppressed.find((s) => s.id === "C-1").decidedBy, "longest-span");
});

test("FR-DET-04: non-overlapping detections are all kept and nothing is suppressed", () => {
  const { active, suppressed } = ConflictResolver.resolveWithAudit([det("A-1", 0, 5, "low"), det("B-1", 5, 10, "low")]);
  assert.equal(active.length, 2);
  assert.equal(suppressed.length, 0);
});

test("end to end: no two rendered highlights overlap", () => {
  const text = "But experts warn the so-called regime blasts critics who say radical socialists skyrocketed costs.";
  const { active } = ConflictResolver.resolveWithAudit(full(text));
  const spans = active.map((m) => [m.start, m.end]);
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length; j++) assert.ok(spans[i][1] <= spans[j][0] || spans[j][1] <= spans[i][0]);
});
