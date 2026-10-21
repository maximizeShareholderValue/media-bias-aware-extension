/**
 * Tests for the usability test-article checker's verdict (eval/check-test-article.js).
 * Run with: node --test test/check-test-article.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { verdict } = require("../eval/check-test-article.js");
const manifest = require("../eval/corpus-manifest.json");

const outlet = { name: "Example", ideology: "Center", ownershipType: "Independent", factualReliability: "High" };

test("usable when the outlet is rated, there are highlights, and one technique is most frequent", () => {
  const v = verdict("https://example.com/a", outlet, { articleFound: true, matchCount: 3, categoryCounts: { LOADED_LANGUAGE: 2, DOUBT: 1 } });
  assert.match(v, /usable for T1, T2 and T4/);
  assert.match(v, /Loaded Language \(2\), Doubt \(1\)/);
});

test("not suitable when techniques tie, when there are no highlights, or when no article is found", () => {
  assert.match(verdict("https://example.com/a", outlet, { articleFound: true, matchCount: 2, categoryCounts: { LOADED_LANGUAGE: 1, DOUBT: 1 } }), /not suitable/);
  assert.match(verdict("https://example.com/a", outlet, { articleFound: true, matchCount: 0, categoryCounts: {} }), /NO  T2 highlights: 0/);
  assert.match(verdict("https://example.com/a", outlet, null), /found no article/);
});

test("warns about unrecorded ownership and about evaluation-corpus articles", () => {
  const v = verdict("https://example.com/a", Object.assign({}, outlet, { ownershipType: "Unknown" }), { articleFound: true, matchCount: 1, categoryCounts: { DOUBT: 1 } });
  assert.match(v, /Ownership not recorded/);
  assert.match(verdict(manifest.articles[0].url, outlet, null), /one of the 30 evaluation articles/);
});
