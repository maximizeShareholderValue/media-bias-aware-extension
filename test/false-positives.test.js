/**
 * False-positive regression tests, driven by test/false-positive-cases.json.
 * Run with: node --test test/false-positives.test.js
 *
 * mustNotFire     a reported wrong highlight; must stay fixed.
 * mustFire        companion true positives, so a fix cannot silently disable the rule.
 * knownLimitations still-flagged neutral sentences, tracked as todo tests.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PatternMatcher = require("../content/pattern-matcher.js");

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8"));
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "false-positive-cases.json"), "utf8"));
const flagged = (text, rule) => PatternMatcher.findMatches(text, catalog.patterns, catalog.techniques).some((m) => m.id === rule);

for (const c of corpus.mustNotFire) {
  test(`${c.rule} must NOT flag: ${c.text.slice(0, 70)}`, () => {
    assert.ok(catalog.patterns.some((p) => p.id === c.rule), "unknown rule " + c.rule);
    assert.equal(flagged(c.text, c.rule), false, c.note || "");
  });
}

for (const c of corpus.mustFire) {
  test(`${c.rule} must still flag: ${c.text.slice(0, 70)}`, () => {
    assert.equal(flagged(c.text, c.rule), true);
  });
}

for (const c of corpus.knownLimitations) {
  test(`${c.rule} not flagged (known limitation: ${c.why})`, { todo: c.why }, () => {
    assert.equal(flagged(c.text, c.rule), false);
  });
}

test("every rule that has a mustNotFire case also has a mustFire companion", () => {
  const firing = new Set(corpus.mustFire.map((c) => c.rule));
  const missing = [...new Set(corpus.mustNotFire.map((c) => c.rule))].filter((r) => !firing.has(r));
  assert.deepEqual(missing, []);
});

// ---- quoted speech ----------------------------------------------------------
const { quotedSpans } = PatternMatcher;
const catalogRules = (text, opts) => PatternMatcher.findMatches(text, catalog.patterns, catalog.techniques, opts);

test("quotedSpans: curly, straight, unmatched and single quotes", () => {
  assert.deepEqual(quotedSpans("A \u201cbig deal\u201d here."), [[3, 11]]);
  assert.deepEqual(quotedSpans('He said "no way" twice.'), [[9, 15]]);
  assert.deepEqual(quotedSpans("\u201cOpen and never closed"), [[1, 22]]);
  assert.equal(quotedSpans("Headline as 'wholly wrong'").length, 1);
  assert.deepEqual(quotedSpans("It isn't the reporters' fault, nor John's."), [], "apostrophes are not quotes");
  assert.deepEqual(quotedSpans("No quotes at all."), []);
});

test("a detection inside quotes is reported as failedAt 'quoted', outside quotes is kept", () => {
  const text = "She said \u201cradical socialists\u201d and the radicals left.";
  const rec = PatternMatcher.evaluate(text, catalog.patterns, catalog.techniques);
  const inside = rec.find((r) => r.matchedText === "socialists");
  assert.equal(inside.passed, false);
  assert.equal(inside.failedAt, "quoted");
  assert.ok(rec.find((r) => r.matchedText === "radicals" && r.passed));
});

test("options.includeQuotes and the keyword baseline still see quoted candidates", () => {
  const text = "She said \u201cradical socialists\u201d.";
  assert.equal(catalogRules(text).length, 0);
  assert.ok(catalogRules(text, { includeQuotes: true }).length > 0);
  assert.ok(catalogRules(text, { mode: "lexicalOnly" }).length > 0);
});

test("slogan rules opt back in: a quoted slogan is still a slogan", () => {
  assert.ok(catalogRules("They chanted \u201cMake America Great Again\u201d loudly.").some((m) => m.id === "SL-001"));
});
