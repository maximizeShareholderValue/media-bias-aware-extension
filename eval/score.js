#!/usr/bin/env node
/**
 * Scores the formal evaluation (thesis sections 7-9).
 *
 *   node eval/score.js --articles <dir> --detections <detections.json>
 *                      --phase1 <v1.csv> <v2.csv> <v3.csv>
 *                      [--phase2 <validation-sheet.csv> --key <key.json>] [--out results.json]
 *
 * Phase 1 (7.2): each validator's annotation tab, downloaded as CSV (Annotation ID, Article ID,
 * Span, Technique, Sentence Context, Comment). Spans marked by at least 2 of the 3 validators form
 * the reference set. The full pipeline's highlights and the keyword baseline's (8.3) are scored
 * against it: precision, recall, F1 and FPR, strict (same technique) and lenient (any technique).
 *
 * Phase 2 (9.3): the Valid / Not Valid judgments of each highlight give Fleiss' kappa (Gate 1).
 * When Gate 1 fails, the judgments must not be used.
 *
 * <dir> holds the clean `<articleId>.txt` copies the validators annotated; <detections.json> is
 * written by eval/generate-sheet.js over the same files.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const csv = require("./csv.js");
const M = require("./metrics.js");
const R = require("./reference-set.js");

const GATE2_REVISED = "Gate 2 (proposed revision, pending adviser approval): pipeline strict FPR < baseline strict FPR";

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

/** Rows of one Phase 1 tab (header row first) -> [{validator, annotationId, articleId, span, technique, context}]. */
function readPhase1(rows, validator) {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const c = { id: col("annotation id"), article: col("article id"), span: col("span"), tech: col("technique"), ctx: col("sentence context"), start: col("start"), end: col("end") };
  const num = (r, i) => (i >= 0 && String(r[i] || "").trim() !== "" && !isNaN(Number(r[i])) ? Number(r[i]) : null);
  if (c.article < 0 || c.span < 0 || c.tech < 0) throw new Error("Phase 1 sheet for " + validator + " needs Article ID, Span and Technique columns");
  return rows
    .slice(1)
    .filter((r) => String(r[c.span] || "").trim())
    .map((r) => ({
      validator: validator,
      annotationId: c.id >= 0 ? r[c.id] : "",
      articleId: String(r[c.article] || "").trim(),
      span: r[c.span],
      technique: r[c.tech],
      context: c.ctx >= 0 ? r[c.ctx] : "",
      start: num(r, c.start),
      end: num(r, c.end)
    }));
}

/** Start/End from the annotation page, used when they still point at the same words in the article. */
function exactOffsets(text, a) {
  if (a.start === null || a.end === null || a.start < 0 || a.end > text.length || a.end <= a.start) return null;
  const squash = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
  return squash(text.slice(a.start, a.end)) === squash(a.span) ? { start: a.start, end: a.end, ambiguous: false } : null;
}

/** Phase 2 rows + key -> kappa report (null when no rows are fully rated). */
function scorePhase2(rows, key) {
  const header = rows[0].map((h) => h.trim());
  const idCol = header.indexOf("itemId");
  const voteCols = header.map((h, i) => (/^validator\d+$/i.test(h) ? i : -1)).filter((i) => i >= 0);
  if (idCol < 0 || voteCols.length !== 3) throw new Error("Phase 2 sheet needs an itemId column and exactly three validator columns (validator1..3)");
  const complete = [];
  let incomplete = 0;
  let unrecognized = 0;
  rows.slice(1).forEach((r) => {
    if (!key[r[idCol]]) return;
    const votes = voteCols.map((c) => parseVote(r[c]));
    if (votes.some((v) => v === undefined)) unrecognized++;
    if (votes.some((v) => v === null || v === undefined)) {
      incomplete++;
      return;
    }
    complete.push(votes);
  });
  const k = M.fleissKappa(M.toCounts(complete));
  return {
    rated: complete.length,
    incomplete: incomplete,
    unrecognizedValues: unrecognized,
    kappa: k.kappa,
    observedAgreement: k.observedAgreement,
    expectedAgreement: k.expectedAgreement,
    percentUnanimous: complete.length ? complete.filter((v) => v.every((x) => x === v[0])).length / complete.length : null,
    validatedShare: complete.length ? complete.filter(M.isValidated).length / complete.length : null
  };
}

/**
 * articles: {articleId: text}; techniques: catalog.techniques; items: detections.json items;
 * phase1: [rows of V1, rows of V2, rows of V3]; phase2: {rows, key} or null.
 */
function score(input) {
  const resolveTech = R.techniqueResolver(input.techniques);
  const unlocated = [];
  const ambiguous = [];
  const located = [];
  input.phase1.forEach((rows, i) => {
    readPhase1(rows, "V" + (i + 1)).forEach((a) => {
      const technique = resolveTech(a.technique);
      const text = input.articles[a.articleId];
      const where = text === undefined ? null : exactOffsets(text, a) || R.locateSpan(text, a.span, a.context);
      const problem = text === undefined ? "unknown article" : !technique ? "unknown technique" : !where ? "span not found in article" : null;
      if (problem) {
        unlocated.push({ validator: a.validator, annotationId: a.annotationId, articleId: a.articleId, span: a.span, technique: a.technique, problem: problem });
        return;
      }
      if (where.ambiguous) ambiguous.push({ validator: a.validator, annotationId: a.annotationId, articleId: a.articleId, span: a.span });
      located.push({ validator: a.validator, articleId: a.articleId, technique: technique, start: where.start, end: where.end });
    });
  });

  const strictRef = R.buildReference(located);
  const lenientRef = R.buildReference(located, { lenient: true });
  const scored = new Set(Object.keys(input.articles));
  const spans = (list) => list.filter((it) => scored.has(it.articleId)).map((it) => ({ articleId: it.articleId, technique: it.technique, start: it.start, end: it.end }));
  const pipeline = spans(input.items.filter((it) => it.inFullPipeline));
  const baseline = spans(input.items);
  const system = (h) => ({ strict: R.scoreSpans(h, strictRef, false), lenient: R.scoreSpans(h, lenientRef, true) });

  const report = {
    articles: scored.size,
    phase1: {
      annotations: located.length + unlocated.length,
      located: located.length,
      unlocated: unlocated,
      ambiguous: ambiguous,
      referenceSpans: strictRef.length,
      referenceSpansAnyTechnique: lenientRef.length,
      allThreeAgreed: strictRef.length ? strictRef.filter((r) => r.validators.length === 3).length / strictRef.length : null
    },
    fullPipeline: system(pipeline),
    baseline: system(baseline),
    phase2: input.phase2 ? scorePhase2(input.phase2.rows, input.phase2.key) : null
  };

  const gates = [];
  if (report.phase2) gates.push({ name: "Validation Gate 1: Fleiss' kappa >= " + M.GATES.kappaMin, pass: report.phase2.kappa !== null && report.phase2.kappa >= M.GATES.kappaMin, value: report.phase2.kappa });
  const p = report.fullPipeline.strict.precision;
  gates.push({ name: "EC1: pipeline precision >= " + M.GATES.formalPrecisionMin, pass: p !== null && p >= M.GATES.formalPrecisionMin, value: p });
  const fp = report.fullPipeline.strict.fpr;
  const fb = report.baseline.strict.fpr;
  gates.push({ name: GATE2_REVISED, pass: fp !== null && fb !== null && fp < fb, value: fp });
  report.gates = gates;
  report.judgmentsUsable = report.phase2 ? gates[0].pass : null;
  return report;
}

function format(report) {
  const lines = [];
  const p1 = report.phase1;
  lines.push("Articles: " + report.articles + "   Phase 1 annotations: " + p1.annotations + " (located " + p1.located + ")");
  lines.push("Reference spans (>= 2 of 3 validators): " + p1.referenceSpans + " same technique, " + p1.referenceSpansAnyTechnique + " any technique;  all 3 agreed on " + pct(p1.allThreeAgreed));
  if (p1.unlocated.length) {
    lines.push("\nWARNING: " + p1.unlocated.length + " annotations could not be used - fix them in the sheet and re-run:");
    p1.unlocated.forEach((u) => lines.push("  " + u.validator + " " + (u.annotationId || "") + " [" + u.articleId + "] \"" + u.span + "\" (" + u.technique + "): " + u.problem));
  }
  if (p1.ambiguous.length) lines.push("NOTE: " + p1.ambiguous.length + " spans occur more than once and the Sentence Context did not pick one; the first was used.");
  if (report.phase2) {
    const k = report.phase2;
    lines.push("\nPhase 2: " + k.rated + " highlights rated by all 3" + (k.incomplete ? " (" + k.incomplete + " incomplete)" : "") +
      "   Fleiss' kappa: " + (k.kappa === null ? "undefined (all judgments in one category)" : k.kappa.toFixed(3)) +
      "   unanimous=" + pct(k.percentUnanimous) + "   validated (>= 2 Valid)=" + pct(k.validatedShare));
    if (k.unrecognizedValues) lines.push("WARNING: " + k.unrecognizedValues + " rows had values that are not Valid / Not Valid.");
  }
  lines.push("");
  report.gates.forEach((g) => lines.push((g.pass ? "PASS  " : "FAIL  ") + g.name + "  (" + (g.value === null ? "n/a" : g.value.toFixed(3)) + ")"));
  if (report.judgmentsUsable === false) lines.push("\nGate 1 failed: per thesis 9.3 the Phase 2 judgments must NOT be used. Clarify the guide, hold a recalibration session and re-judge.");

  lines.push("\n| System | Score | Flagged | TP | FP | Precision | Recall | F1 | FPR |\n|---|---|---|---|---|---|---|---|---|");
  [["Full pipeline", report.fullPipeline], ["Keyword baseline", report.baseline]].forEach(([name, s]) => {
    ["strict", "lenient"].forEach((mode) => {
      const x = s[mode];
      lines.push("| " + name + " | " + mode + " | " + x.flagged + " | " + x.tp + " | " + x.fp + " | " + pct(x.precision) + " | " + pct(x.recall) + " | " + (x.f1 === null ? "n/a" : x.f1.toFixed(3)) + " | " + pct(x.fpr) + " |");
    });
  });

  lines.push("\nPer technique (strict):\n| Technique | Reference | Pipeline flagged | Pipeline precision | Pipeline recall | Baseline flagged | Baseline precision | Baseline recall |\n|---|---|---|---|---|---|---|---|");
  const f = report.fullPipeline.strict.perTechnique;
  const b = report.baseline.strict.perTechnique;
  Array.from(new Set(Object.keys(f).concat(Object.keys(b)))).sort().forEach((t) => {
    const x = f[t] || {};
    const y = b[t] || {};
    lines.push("| " + t + " | " + (x.reference || y.reference || 0) + " | " + (x.flagged || 0) + " | " + pct(x.precision) + " | " + pct(x.recall) + " | " + (y.flagged || 0) + " | " + pct(y.precision) + " | " + pct(y.recall) + " |");
  });
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const opt = {};
  let cur = null;
  args.forEach((a) => {
    if (a.startsWith("--")) opt[(cur = a.slice(2))] = [];
    else if (cur) opt[cur].push(a);
  });
  const one = (k) => (opt[k] || [])[0];
  if (!one("articles") || !one("detections") || (opt.phase1 || []).length !== 3 || (opt.phase2 && !one("key"))) {
    console.error("usage: node eval/score.js --articles <dir> --detections <detections.json> --phase1 <v1.csv> <v2.csv> <v3.csv> [--phase2 <validation-sheet.csv> --key <key.json>] [--out results.json]");
    process.exit(1);
  }
  const read = (f) => fs.readFileSync(f, "utf8");
  const articles = {};
  fs.readdirSync(one("articles"))
    .filter((f) => f.endsWith(".txt"))
    .forEach((f) => (articles[f.replace(/\.txt$/, "")] = read(path.join(one("articles"), f))));
  const catalog = JSON.parse(read(path.join(__dirname, "../data/pattern-catalog.json")));
  const report = score({
    articles: articles,
    techniques: catalog.techniques,
    items: JSON.parse(read(one("detections"))).items,
    phase1: opt.phase1.map((f) => csv.parse(read(f))),
    phase2: opt.phase2 ? { rows: csv.parse(read(one("phase2"))), key: JSON.parse(read(one("key"))) } : null
  });
  console.log(format(report));
  if (one("out")) {
    fs.writeFileSync(one("out"), JSON.stringify(report, null, 2));
    console.log("\nWrote " + one("out"));
  }
}

if (require.main === module) main();

module.exports = { parseVote: parseVote, readPhase1: readPhase1, scorePhase2: scorePhase2, score: score, format: format };
