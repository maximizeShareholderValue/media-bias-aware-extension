/**
 * Unit tests for the pattern matcher + conflict resolver.
 * Run with: node --test test/pattern-matcher.test.js
 * No third-party test framework required (uses Node's built-in node:test).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PatternMatcher = require("../content/pattern-matcher.js");
const ConflictResolver = require("../content/conflict-resolver.js");

const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8")
);
const patterns = catalog.patterns;
const categoryPriority = {};
for (const [name, def] of Object.entries(catalog.categories)) {
  categoryPriority[name] = def.priority;
}

function matchIds(matches) {
  return matches.map((m) => m.id);
}

test("LL-007 fires on loaded language before a person/group noun", () => {
  const text = "The radical faction pushed for immediate reform.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("LL-007"), "expected LL-007 to match 'radical faction'");
  const m = matches.find((x) => x.id === "LL-007");
  assert.equal(text.slice(m.start, m.end).toLowerCase(), "radical");
});

test("LL-007 does NOT fire on legitimate descriptive use (radical surgery)", () => {
  const text = "She underwent radical surgery last week.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(!matchIds(matches).includes("LL-007"), "should not flag 'radical surgery'");
});

test("LL-007 fires on hardline as adjacent loaded-language word (extremist moved to LL-008)", () => {
  const text = "The senator met with the hardline extremist group yesterday.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  const ll007Words = matches.filter((m) => m.id === "LL-007").map((m) => text.slice(m.start, m.end).toLowerCase());
  const ll008Words = matches.filter((m) => m.id === "LL-008").map((m) => text.slice(m.start, m.end).toLowerCase());
  assert.ok(ll007Words.includes("hardline"));
  assert.ok(ll008Words.includes("extremist"));
});

test("LL-008 fires on standalone plural noun-label usage (terrorists attacked)", () => {
  const text = "Local terrorists attacked the outpost overnight.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("LL-008"));
});

test("LL-008 fires on singular attributive usage (terrorist organization)", () => {
  const text = "The group was labeled a terrorist organization by the state department.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("LL-008"));
});

test("LL-008 fires on racists as a standalone label", () => {
  const text = "The rally attracted known racists from across the region.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("LL-008"));
});

test("LL-009 fires on propaganda as a delegitimizing label", () => {
  const text = "The leaflet was dismissed as propaganda by independent researchers.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("LL-009"));
});

test("LL-009 does NOT fire on the legitimate genre sense (propaganda poster)", () => {
  const text = "The museum's new exhibit features a rare propaganda poster from the era.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(!matchIds(matches).includes("LL-009"));
});

test("LL-010 fires on regime describing a government", () => {
  const text = "The regime cracked down on dissidents after the protest.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("LL-010"));
});

test("LL-010 does NOT fire on the neutral lifestyle sense (exercise regime)", () => {
  const text = "She follows a strict exercise regime every morning.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(!matchIds(matches).includes("LL-010"));
});

test("EM-001 fires on notorious/disgraced/infamous before a noun", () => {
  const text = "The notorious criminal was finally apprehended.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("EM-001"));

  const text2 = "The disgraced senator resigned from office.";
  const matches2 = PatternMatcher.findMatches(text2, patterns, categoryPriority);
  assert.ok(matchIds(matches2).includes("EM-001"));

  const text3 = "The infamous scandal rocked the administration.";
  const matches3 = PatternMatcher.findMatches(text3, patterns, categoryPriority);
  assert.ok(matchIds(matches3).includes("EM-001"));
});

test("AF-001 fires on claimed introducing a that-clause", () => {
  const text = "The senator claimed that the bill would pass easily.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("AF-001"));
  const m = matches.find((x) => x.id === "AF-001");
  assert.equal(m.neutralAlternative, "said");
});

test("AF-001 does NOT fire on the noun sense (filed an insurance claim)", () => {
  const text = "He filed an insurance claim after the accident.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(!matchIds(matches).includes("AF-001"));
});

test("AF-001 does NOT fire on the attributive-adjective sense (the claimed savings)", () => {
  const text = "The claimed savings turned out to be exaggerated.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(!matchIds(matches).includes("AF-001"));
});

test("PS-003 fires on a reporting verb introducing a that-clause", () => {
  const text = "The senator admitted that he lied to investigators.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("PS-003"));
});

test("PS-003 does NOT fire on an unrelated sense (hospital admitted the patient)", () => {
  const text = "The hospital admitted the patient overnight.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(!matchIds(matches).includes("PS-003"));
});

test("PS-003 fires when followed by a quotation instead of 'that'", () => {
  const text = 'The spokesperson acknowledged "we made mistakes" during the briefing.';
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.ok(matchIds(matches).includes("PS-003"));
});

test("SC-012 fires on unattributed collective-claim phrases", () => {
  const text = "Some say the policy will fail. Critics argue that the bill goes too far.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  const scMatches = matches.filter((m) => m.id === "SC-012");
  assert.equal(scMatches.length, 2);
  assert.equal(text.slice(scMatches[0].start, scMatches[0].end).toLowerCase(), "some say");
  assert.equal(text.slice(scMatches[1].start, scMatches[1].end).toLowerCase(), "critics argue");
});

test("no false positive across all three seed patterns on a neutral sentence", () => {
  const text = "The city council approved the new budget on Tuesday after a public hearing.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  assert.equal(matches.length, 0);
});

test("conflict resolver: longest match wins over a shorter overlapping match", () => {
  const matches = [
    { id: "A", start: 10, end: 20, categoryPriority: 5, confidenceWeight: 3 },
    { id: "B", start: 10, end: 30, categoryPriority: 5, confidenceWeight: 1 }
  ];
  const resolved = ConflictResolver.resolve(matches);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, "B");
});

test("conflict resolver: equal length -> higher confidenceWeight wins", () => {
  const matches = [
    { id: "A", start: 0, end: 10, categoryPriority: 5, confidenceWeight: 2 },
    { id: "B", start: 0, end: 10, categoryPriority: 1, confidenceWeight: 3 }
  ];
  const resolved = ConflictResolver.resolve(matches);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, "B");
});

test("conflict resolver: equal length + equal confidence -> category priority order wins", () => {
  const matches = [
    { id: "LOADED", category: "LOADED_LANGUAGE", start: 0, end: 10, categoryPriority: 1, confidenceWeight: 2 },
    { id: "PRESUP", category: "PRESUPPOSITION", start: 0, end: 10, categoryPriority: 5, confidenceWeight: 2 }
  ];
  const resolved = ConflictResolver.resolve(matches);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, "LOADED");
});

test("conflict resolver: non-overlapping matches are both kept", () => {
  const matches = [
    { id: "A", start: 0, end: 5, categoryPriority: 1, confidenceWeight: 1 },
    { id: "B", start: 10, end: 15, categoryPriority: 1, confidenceWeight: 1 }
  ];
  const resolved = ConflictResolver.resolve(matches);
  assert.equal(resolved.length, 2);
});

test("LL-007 resolves a per-word neutralAlternative override", () => {
  const text = "The radical faction pushed for immediate reform.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  const m = matches.find((x) => x.id === "LL-007");
  assert.equal(m.neutralAlternative, "non-mainstream");
});

test("PS-003 resolves its pattern-level neutralAlternative", () => {
  const text = "The senator admitted that he lied to investigators.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  const m = matches.find((x) => x.id === "PS-003");
  assert.equal(m.neutralAlternative, "said");
});

test("SC-012 resolves its pattern-level neutralAlternative", () => {
  const text = "Some say the policy will fail within a year.";
  const matches = PatternMatcher.findMatches(text, patterns, categoryPriority);
  const m = matches.find((x) => x.id === "SC-012");
  assert.equal(m.neutralAlternative, "Name the specific source");
});

test("end-to-end: matcher + resolver on a multi-bias sentence", () => {
  const text =
    "Critics argue that the hardline senator admitted that the radical faction was involved.";
  const raw = PatternMatcher.findMatches(text, patterns, categoryPriority);
  const resolved = ConflictResolver.resolve(raw);
  const ids = matchIds(resolved).sort();
  assert.deepEqual(ids, ["LL-007", "LL-007", "PS-003", "SC-012"].sort());
});
