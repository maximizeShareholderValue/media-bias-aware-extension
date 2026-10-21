/**
 * Tests for the cross-outlet framing comparison (eval/framing-comparison.js; thesis 8.7).
 * Run with: node --test test/framing-comparison.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../eval/framing-comparison.js");
const catalog = require("../data/pattern-catalog.json");

const item = (articleId, technique, inFullPipeline) => ({ articleId, technique, inFullPipeline, phrase: "x", patternId: "X-001" });

test("counts only rendered highlights of the 15 framing-set articles, per article and per group", () => {
  const r = F.run({
    catalogVersion: catalog.catalogVersion,
    generatedAt: "2026-10-20T00:00:00Z",
    items: [item("L01", "LOADED_LANGUAGE", true), item("L01", "DOUBT", true), item("L01", "DOUBT", false), item("R05", "DOUBT", true), item("L06", "DOUBT", true)]
  });
  assert.equal(r.articles.length, 15);
  assert.deepEqual(r.articles.slice(0, 3).map((a) => a.id), ["L01", "C01", "R01"]);
  const l01 = r.articles.find((a) => a.id === "L01");
  assert.equal(l01.cues, 2, "the suppressed / failed candidate is not counted");
  assert.equal(l01.perTechnique.DOUBT, 1);
  const left = r.byLean.find((g) => g.lean === "Left");
  assert.equal(left.cues, 2, "L06 is in the general set, not the framing set");
  assert.equal(left.articlesWithNoCue, 4);
  assert.equal(r.byLean.find((g) => g.lean === "Right").perTechnique.DOUBT, 1);
});

test("refuses detections made with another catalog version", () => {
  assert.throws(() => F.run({ catalogVersion: "0.0.1", generatedAt: "", items: [] }), /re-run eval\/generate-sheet\.js/);
});
