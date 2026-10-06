#!/usr/bin/env node
/**
 * Scores the validators' judgments (thesis sections 7-9).
 *
 *   node eval/score.js <filled-validation-sheet.csv> <key.json> [--stage calibration|formal] [--out results.json]
 *
 * Reads the validator1..3 columns (Valid / Not Valid; also V/N, yes/no, 1/0), computes Fleiss' kappa
 * and agreement, then precision / per-technique precision / FPR for the FULL pipeline and for the
 * lexical-only BASELINE (thesis 8.3), and checks the validation gates.
 * Judgments are not used for evaluation when Validation Gate 1 (kappa >= 0.60) fails (thesis 9.3).
 */
"use strict";

const fs = require("fs");
const csv = require("./csv.js");
const M = require("./metrics.js");

function parseVote(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (["valid", "v", "yes", "y", "1", "true"].includes(v)) return true;
  if (["not valid", "invalid", "not_valid", "n", "no", "0", "false"].includes(v)) return false;
  return undefined; // unrecognized
}

function pct(x) {
  return x === null || x === undefined ? "n/a" : (x * 100).toFixed(1) + "%";
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
  };
  const [sheetPath, keyPath] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!sheetPath || !keyPath) {
    console.error("usage: node eval/score.js <filled-validation-sheet.csv> <key.json> [--stage calibration|formal] [--out results.json]");
    process.exit(1);
  }
  const stage = flag("--stage", "formal");
  const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  const rows = csv.parse(fs.readFileSync(sheetPath, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const idCol = header.indexOf("itemId");
  const voteCols = header.map((h, i) => (/^validator\d+$/i.test(h) ? i : -1)).filter((i) => i >= 0);
  if (idCol < 0 || voteCols.length !== 3) {
    console.error("sheet needs an itemId column and exactly three validator columns (validator1..3)");
    process.exit(1);
  }

  const complete = [];
  let incomplete = 0;
  let unrecognized = 0;
  let unknownItems = 0;
  rows.slice(1).forEach((r) => {
    const info = key[r[idCol]];
    if (!info) {
      unknownItems++;
      return;
    }
    const votes = voteCols.map((c) => parseVote(r[c]));
    if (votes.some((v) => v === undefined)) unrecognized++;
    if (votes.some((v) => v === null || v === undefined)) {
      incomplete++;
      return;
    }
    complete.push({ itemId: r[idCol], info: info, votes: votes, validated: M.isValidated(votes) });
  });

  const kappa = M.fleissKappa(M.toCounts(complete.map((c) => c.votes)));
  const unanimous = complete.filter((c) => c.votes.every((v) => v === c.votes[0])).length;
  const asItems = (list) => list.map((c) => ({ technique: c.info.technique, validated: c.validated }));

  const report = {
    stage: stage,
    items: { rated: complete.length, incomplete: incomplete, unrecognizedValues: unrecognized, notInKey: unknownItems },
    kappa: kappa.kappa,
    observedAgreement: kappa.observedAgreement,
    expectedAgreement: kappa.expectedAgreement,
    percentUnanimous: complete.length ? unanimous / complete.length : null,
    validShare: kappa.proportions[0] === undefined ? null : kappa.proportions[0],
    fullPipeline: M.summarize(asItems(complete.filter((c) => c.info.inFullPipeline))),
    baseline: M.summarize(asItems(complete))
  };
  report.gates = M.checkGates(report, stage);
  report.judgmentsUsable = report.gates[0].pass;

  const lines = [];
  lines.push("Items rated by all 3 validators: " + report.items.rated + (incomplete ? "  (" + incomplete + " incomplete - fill them in)" : ""));
  if (unrecognized) lines.push("WARNING: " + unrecognized + " rows had values that are not Valid / Not Valid.");
  lines.push("Fleiss' kappa: " + (kappa.kappa === null ? "undefined (all judgments in one category)" : kappa.kappa.toFixed(3)) +
    "   Po=" + (kappa.observedAgreement || 0).toFixed(3) + "  Pe=" + (kappa.expectedAgreement || 0).toFixed(3) +
    "   unanimous=" + pct(report.percentUnanimous) + "   judged Valid overall=" + pct(report.validShare));
  report.gates.forEach((g) => lines.push((g.pass ? "PASS  " : "FAIL  ") + g.name + "  (" + (g.value === null ? "n/a" : g.value.toFixed(3)) + ")"));
  if (!report.judgmentsUsable) lines.push("\nGate 1 failed: per thesis 9.3 these judgments must NOT be used. Clarify the validation guide, hold a recalibration session and re-judge.");
  lines.push("\n| System | Flagged | TP | FP | Precision | FPR |\n|---|---|---|---|---|---|");
  [["Full pipeline (L and S and C)", report.fullPipeline], ["Baseline (lexical trigger only)", report.baseline]].forEach(([name, s]) => {
    lines.push("| " + name + " | " + s.flagged + " | " + s.tp + " | " + s.fp + " | " + pct(s.precision) + " | " + pct(s.fpr) + " |");
  });
  lines.push("\nPer-technique precision (full pipeline vs baseline):\n| Technique | Full flagged | Full precision | Baseline flagged | Baseline precision |\n|---|---|---|---|---|");
  const techs = Array.from(new Set(Object.keys(report.fullPipeline.perTechnique).concat(Object.keys(report.baseline.perTechnique)))).sort();
  techs.forEach((t) => {
    const f = report.fullPipeline.perTechnique[t];
    const b = report.baseline.perTechnique[t];
    lines.push("| " + t + " | " + (f ? f.flagged : 0) + " | " + pct(f && f.precision) + " | " + (b ? b.flagged : 0) + " | " + pct(b && b.precision) + " |");
  });
  console.log(lines.join("\n"));

  const out = flag("--out", null);
  if (out) {
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log("\nWrote " + out);
  }
}

main();
