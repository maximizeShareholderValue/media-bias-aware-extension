/**
 * Evaluation metrics, as defined in the thesis (sections 7 and 9).
 *
 *  - A flagged phrase is *validated* when at least 2 of the 3 validators judge it Valid (7.2).
 *  - Precision = TP / (TP + FP), overall and per SemEval technique (9.1).
 *  - FPR = FP / (TP + FP) = 1 - Precision (9.2); no true negatives are observed.
 *  - Fleiss' kappa over the validators' Valid / Not Valid judgments (9.3).
 *
 * Gates (thesis NFR-RELI-01 / 7.3): Validation Gate 1 kappa >= 0.60,
 * Validation Gate 2 calibration FPR < 15%, formal precision >= 0.50.
 *
 * Pure functions, Node-testable. Not part of the shipped extension.
 */
"use strict";

var GATES = { kappaMin: 0.6, calibrationFprMax: 0.15, formalPrecisionMin: 0.5 };

/** votes: array of booleans (true = Valid). Validated when at least two are Valid. */
function isValidated(votes) {
  var valid = 0;
  for (var i = 0; i < votes.length; i++) if (votes[i]) valid++;
  return valid >= 2;
}

function precision(tp, fp) {
  return tp + fp === 0 ? null : tp / (tp + fp);
}

/** items: [{technique, validated}] -> overall and per-technique precision / FPR. */
function summarize(items) {
  var tally = { tp: 0, fp: 0 };
  var per = {};
  items.forEach(function (it) {
    var t = per[it.technique] || (per[it.technique] = { tp: 0, fp: 0 });
    if (it.validated) {
      tally.tp++;
      t.tp++;
    } else {
      tally.fp++;
      t.fp++;
    }
  });
  var perTechnique = {};
  Object.keys(per).forEach(function (k) {
    var p = precision(per[k].tp, per[k].fp);
    perTechnique[k] = { tp: per[k].tp, fp: per[k].fp, flagged: per[k].tp + per[k].fp, precision: p, fpr: p === null ? null : 1 - p };
  });
  var p = precision(tally.tp, tally.fp);
  return { flagged: tally.tp + tally.fp, tp: tally.tp, fp: tally.fp, precision: p, fpr: p === null ? null : 1 - p, perTechnique: perTechnique };
}

/**
 * Fleiss' kappa. counts[i][j] = number of raters who put item i in category j
 * (every item must have the same number of raters n).
 * Returns { kappa, observedAgreement (Po), expectedAgreement (Pe), n, items, proportions }.
 * kappa is null when it is undefined (all judgments fall in one category: Pe = 1).
 */
function fleissKappa(counts) {
  var N = counts.length;
  if (!N) return { kappa: null, observedAgreement: null, expectedAgreement: null, n: 0, items: 0, proportions: [] };
  var k = counts[0].length;
  var n = counts[0].reduce(function (a, b) {
    return a + b;
  }, 0);

  var poSum = 0;
  var catTotals = new Array(k).fill(0);
  counts.forEach(function (row) {
    var rowSum = 0;
    var agree = 0;
    row.forEach(function (c, j) {
      rowSum += c;
      agree += c * (c - 1);
      catTotals[j] += c;
    });
    if (rowSum !== n) throw new Error("fleissKappa: every item needs the same number of raters");
    poSum += agree / (n * (n - 1));
  });

  var Po = poSum / N;
  var proportions = catTotals.map(function (t) {
    return t / (N * n);
  });
  var Pe = proportions.reduce(function (a, p) {
    return a + p * p;
  }, 0);
  return {
    kappa: Pe === 1 ? null : (Po - Pe) / (1 - Pe),
    observedAgreement: Po,
    expectedAgreement: Pe,
    n: n,
    items: N,
    proportions: proportions
  };
}

/** Per-item [Valid count, Not Valid count] rows for Fleiss' kappa from boolean votes. */
function toCounts(voteLists) {
  return voteLists.map(function (votes) {
    var valid = votes.filter(Boolean).length;
    return [valid, votes.length - valid];
  });
}

/** Gate checks for a scored run. stage: "calibration" | "formal". */
function checkGates(report, stage) {
  var gates = [];
  gates.push({
    name: "Validation Gate 1: Fleiss' kappa >= " + GATES.kappaMin,
    pass: report.kappa !== null && report.kappa >= GATES.kappaMin,
    value: report.kappa
  });
  if (stage === "calibration") {
    gates.push({
      name: "Validation Gate 2: calibration FPR < " + GATES.calibrationFprMax * 100 + "%",
      pass: report.fullPipeline.fpr !== null && report.fullPipeline.fpr < GATES.calibrationFprMax,
      value: report.fullPipeline.fpr
    });
  } else {
    gates.push({
      name: "Formal evaluation: precision >= " + GATES.formalPrecisionMin,
      pass: report.fullPipeline.precision !== null && report.fullPipeline.precision >= GATES.formalPrecisionMin,
      value: report.fullPipeline.precision
    });
  }
  return gates;
}

module.exports = { GATES: GATES, isValidated: isValidated, precision: precision, summarize: summarize, fleissKappa: fleissKappa, toCounts: toCounts, checkGates: checkGates };
