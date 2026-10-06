/**
 * Tests for the evaluation metrics (thesis sections 7 and 9) and the CSV helper.
 * Run with: node --test test/eval-metrics.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../eval/metrics.js");
const csv = require("../eval/csv.js");

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("a phrase is validated when at least 2 of 3 validators judge it Valid", () => {
  assert.equal(M.isValidated([true, true, false]), true);
  assert.equal(M.isValidated([true, true, true]), true);
  assert.equal(M.isValidated([true, false, false]), false);
  assert.equal(M.isValidated([false, false, false]), false);
});

test("precision, FPR = 1 - precision, and per-technique precision (9.1, 9.2)", () => {
  const s = M.summarize([
    { technique: "DOUBT", validated: true },
    { technique: "DOUBT", validated: true },
    { technique: "DOUBT", validated: false },
    { technique: "SLOGANS", validated: false },
    { technique: "SLOGANS", validated: true }
  ]);
  assert.equal(s.flagged, 5);
  assert.equal(s.tp, 3);
  assert.equal(s.fp, 2);
  close(s.precision, 0.6);
  close(s.fpr, 0.4);
  close(s.perTechnique.DOUBT.precision, 2 / 3);
  close(s.perTechnique.SLOGANS.precision, 0.5);
  assert.equal(s.perTechnique.DOUBT.flagged, 3);
});

test("precision is undefined (null) when nothing was flagged", () => {
  const s = M.summarize([]);
  assert.equal(s.precision, null);
  assert.equal(s.fpr, null);
});

test("Fleiss' kappa reproduces the published worked example (Fleiss 1971 data, kappa = 0.210)", () => {
  // 10 subjects, 14 raters, 5 categories (the standard worked example).
  const counts = [
    [0, 0, 0, 0, 14], [0, 2, 6, 4, 2], [0, 0, 3, 5, 6], [0, 3, 9, 2, 0], [2, 2, 8, 1, 1],
    [7, 7, 0, 0, 0], [3, 2, 6, 3, 0], [2, 5, 3, 2, 2], [6, 5, 2, 1, 0], [0, 2, 2, 3, 7]
  ];
  const r = M.fleissKappa(counts);
  close(r.kappa, 0.21, 0.001);
  close(r.observedAgreement, 0.378, 0.001);
  close(r.expectedAgreement, 0.213, 0.001);
});

test("Fleiss' kappa for the thesis design (3 validators, Valid / Not Valid), checked by hand", () => {
  // Items: [3 Valid], [3 Valid], [3 Not Valid], [2 Valid 1 Not].
  // P_i = 1, 1, 1, 1/3 -> Po = 0.8333; p_valid = 8/12, p_not = 4/12 -> Pe = 0.5556; kappa = 0.625.
  const r = M.fleissKappa(M.toCounts([[true, true, true], [true, true, true], [false, false, false], [true, true, false]]));
  close(r.observedAgreement, 0.8333, 1e-3);
  close(r.expectedAgreement, 0.5556, 1e-3);
  close(r.kappa, 0.625, 1e-3);
});

test("Fleiss' kappa: perfect agreement across both categories is 1; one-category-only is undefined", () => {
  close(M.fleissKappa(M.toCounts([[true, true, true], [false, false, false]])).kappa, 1);
  assert.equal(M.fleissKappa(M.toCounts([[true, true, true], [true, true, true]])).kappa, null);
});

test("Fleiss' kappa rejects items with differing numbers of raters", () => {
  assert.throws(() => M.fleissKappa([[3, 0], [2, 0]]));
});

test("validation gates (Gate 1 kappa >= 0.60; Gate 2 calibration FPR < 15%; formal precision >= 0.50)", () => {
  const report = { kappa: 0.65, fullPipeline: { precision: 0.9, fpr: 0.1 } };
  assert.ok(M.checkGates(report, "calibration").every((g) => g.pass));
  assert.ok(M.checkGates(report, "formal").every((g) => g.pass));
  const bad = { kappa: 0.55, fullPipeline: { precision: 0.4, fpr: 0.6 } };
  assert.ok(M.checkGates(bad, "calibration").every((g) => !g.pass));
  assert.ok(M.checkGates(bad, "formal").every((g) => !g.pass));
  assert.ok(!M.checkGates({ kappa: null, fullPipeline: { precision: 0.9, fpr: 0.1 } }, "formal")[0].pass);
});

test("CSV round-trips quotes, commas and newlines", () => {
  const rows = [["id", "phrase", "context"], ["a:1", 'say "hi", now', "line one\nline two"], ["a:2", "", "x"]];
  assert.deepEqual(csv.parse(csv.stringify(rows)), rows);
});
