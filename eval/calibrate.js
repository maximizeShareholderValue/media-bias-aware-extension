#!/usr/bin/env node
/**
 * Validation Gate 2 calibration (thesis 4.4 Stage 5).
 *
 *   node eval/calibrate.js <ptc-datasets-dir> [--n 75] [--seed 2026] [--out report.json]
 *
 * <ptc-datasets-dir> is the `datasets/` folder of the PTC / SemEval-2020 Task 11
 * release (train-articles/ + train-labels-task2-technique-classification/). The
 * dev-set gold labels are only distributed through the PTC registration site,
 * so calibration uses a fixed, seeded sample of --n labelled training articles.
 *
 * Each article is scanned paragraph by paragraph exactly as the content script
 * does it (PatternMatcher.findMatches, then ConflictResolver), and only the
 * rendered (active) spans are scored. A span is a true positive when it overlaps
 * a gold span of the same technique, otherwise a false positive (thesis 4.4).
 * Read-only: it reports results and never changes the catalog.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const PatternMatcher = require("../content/pattern-matcher.js");
const ConflictResolver = require("../content/conflict-resolver.js");

const FPR_GATE = 0.15;
const MIN_FOR_TIER = 5; // fewer detections than this: too little evidence to set a tier

/** PTC label names -> catalog technique keys. */
const TECHNIQUE_MAP = {
  Loaded_Language: "LOADED_LANGUAGE",
  "Name_Calling,Labeling": "NAME_CALLING_LABELING",
  Repetition: "REPETITION",
  "Exaggeration,Minimisation": "EXAGGERATION_MINIMIZATION",
  Doubt: "DOUBT",
  "Appeal_to_fear-prejudice": "APPEAL_TO_FEAR_PREJUDICE",
  "Flag-Waving": "FLAG_WAVING",
  Causal_Oversimplification: "CAUSAL_OVERSIMPLIFICATION",
  Slogans: "SLOGANS",
  Appeal_to_Authority: "APPEAL_TO_AUTHORITY",
  "Black-and-White_Fallacy": "BLACK_AND_WHITE_FALLACY",
  "Thought-terminating_Cliches": "THOUGHT_TERMINATING_CLICHES",
  "Bandwagon,Reductio_ad_hitlerum": "BANDWAGON_REDUCTIO_AD_HITLERUM",
  "Whataboutism,Straw_Men,Red_Herring": "STRAW_MAN_WHATABOUTISM_RED_HERRING"
};

/**
 * PTC offsets count Unicode code points (Python); JS strings index UTF-16 units.
 * Returns f(cp) -> UTF-16 index for this text.
 */
function codePointToUtf16(text) {
  const map = [];
  let u = 0;
  for (const ch of text) {
    map.push(u);
    u += ch.length;
  }
  map.push(u);
  return (cp) => (cp < map.length ? map[cp] : u);
}

/** Parses one article's label lines into { technique, start, end } in UTF-16 offsets. */
function parseLabels(raw, text) {
  const toU = codePointToUtf16(text);
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [, label, start, end] = line.split("\t");
    const technique = TECHNIQUE_MAP[label];
    if (!technique) throw new Error("unknown PTC technique label: " + label);
    out.push({ technique, start: toU(Number(start)), end: toU(Number(end)) });
  }
  return out;
}

/** Non-empty lines of the article with their absolute start offsets (PTC paragraphs are lines). */
function splitParagraphs(text) {
  const out = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    if (line.trim()) out.push({ text: line, offset });
    offset += line.length + 1;
  }
  return out;
}

/** Rendered (active) detections for a whole article, in absolute offsets. */
function detectArticle(text, catalog) {
  const dets = [];
  for (const p of splitParagraphs(text)) {
    const candidates = PatternMatcher.findMatches(p.text, catalog.patterns, catalog.techniques);
    for (const m of ConflictResolver.resolveWithAudit(candidates).active) {
      dets.push({ id: m.id, technique: m.technique, start: p.offset + m.start, end: p.offset + m.end, text: m.matchedText });
    }
  }
  return dets;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Marks each detection tp/fp and each gold span matched/unmatched. */
function scoreArticle(dets, gold) {
  const matched = gold.map(() => false);
  const scored = dets.map((d) => {
    let tp = false;
    gold.forEach((g, i) => {
      if (g.technique === d.technique && overlaps(d, g)) {
        tp = true;
        matched[i] = true;
      }
    });
    return Object.assign({ tp }, d);
  });
  return { scored, matched };
}

/** Deterministic seeded sample (mulberry32 + Fisher-Yates over the sorted ids). */
function sampleIds(ids, n, seed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = ids.slice().sort();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n).sort();
}

function suggestTier(tp, fp) {
  const n = tp + fp;
  if (n < MIN_FOR_TIER) return null;
  const p = tp / n;
  return p >= 0.85 ? "high" : p >= 0.6 ? "medium" : "low";
}

function ratio(a, b) {
  return b ? a / b : null;
}

function calibrate(dir, catalog, opts) {
  const artDir = path.join(dir, "train-articles");
  const labDir = path.join(dir, "train-labels-task2-technique-classification");
  const ids = fs.readdirSync(artDir).map((f) => (f.match(/^article(\d+)\.txt$/) || [])[1]).filter(Boolean);
  const chosen = sampleIds(ids, opts.n, opts.seed);

  const perRule = {};
  const perTech = {};
  const fps = [];
  catalog.patterns.forEach((p) => (perRule[p.id] = { technique: p.technique, tier: p.confidenceTier, tp: 0, fp: 0 }));
  Object.keys(catalog.techniques).forEach((t) => (perTech[t] = { tp: 0, fp: 0, gold: 0, goldMatched: 0 }));

  for (const id of chosen) {
    const text = fs.readFileSync(path.join(artDir, "article" + id + ".txt"), "utf8");
    const gold = parseLabels(fs.readFileSync(path.join(labDir, "article" + id + ".task2-TC.labels"), "utf8"), text);
    const { scored, matched } = scoreArticle(detectArticle(text, catalog), gold);
    for (const d of scored) {
      perRule[d.id][d.tp ? "tp" : "fp"]++;
      perTech[d.technique][d.tp ? "tp" : "fp"]++;
      if (!d.tp) fps.push({ article: id, rule: d.id, text: d.text });
    }
    gold.forEach((g, i) => {
      perTech[g.technique].gold++;
      if (matched[i]) perTech[g.technique].goldMatched++;
    });
  }

  const tp = Object.values(perRule).reduce((s, r) => s + r.tp, 0);
  const fp = Object.values(perRule).reduce((s, r) => s + r.fp, 0);
  const goldTotal = Object.values(perTech).reduce((s, t) => s + t.gold, 0);
  const goldMatched = Object.values(perTech).reduce((s, t) => s + t.goldMatched, 0);
  Object.values(perRule).forEach((r) => {
    r.precision = ratio(r.tp, r.tp + r.fp);
    r.suggestedTier = suggestTier(r.tp, r.fp);
  });
  Object.values(perTech).forEach((t) => {
    t.precision = ratio(t.tp, t.tp + t.fp);
    t.recall = ratio(t.goldMatched, t.gold);
  });

  const fpr = ratio(fp, tp + fp);
  return {
    catalogVersion: catalog.catalogVersion,
    data: { source: "PTC / SemEval-2020 Task 11 training set (dev gold labels not publicly available)", articles: chosen.length, seed: opts.seed, articleIds: chosen },
    overall: { detections: tp + fp, tp, fp, fpr, precision: ratio(tp, tp + fp), goldSpans: goldTotal, recall: ratio(goldMatched, goldTotal) },
    gate2: { threshold: FPR_GATE, passed: fpr !== null && fpr < FPR_GATE },
    perTechnique: perTech,
    perRule,
    neverFired: Object.keys(perRule).filter((k) => perRule[k].tp + perRule[k].fp === 0),
    falsePositives: fps
  };
}

function pct(x) {
  return x === null || x === undefined ? "  n/a" : (x * 100).toFixed(1).padStart(5) + "%";
}

function printReport(r) {
  const o = r.overall;
  console.log(`Catalog ${r.catalogVersion} on ${r.data.articles} PTC training articles (seed ${r.data.seed})\n`);
  console.log(`Detections ${o.detections}  TP ${o.tp}  FP ${o.fp}  precision ${pct(o.precision)}  recall ${pct(o.recall)} of ${o.goldSpans} gold spans`);
  console.log(`FPR ${pct(o.fpr)}  ->  Gate 2 (FPR < ${FPR_GATE * 100}%): ${r.gate2.passed ? "PASSED" : "NOT PASSED"}\n`);
  console.log("Per technique                          TP    FP  precision  gold  recall");
  for (const [t, v] of Object.entries(r.perTechnique)) {
    console.log(`  ${t.padEnd(36)} ${String(v.tp).padStart(4)} ${String(v.fp).padStart(5)}  ${pct(v.precision)}   ${String(v.gold).padStart(5)}  ${pct(v.recall)}`);
  }
  console.log("\nPer rule          TP    FP  precision  tier now -> suggested");
  for (const [id, v] of Object.entries(r.perRule)) {
    if (v.tp + v.fp === 0) continue;
    console.log(`  ${id.padEnd(8)} ${String(v.tp).padStart(6)} ${String(v.fp).padStart(5)}  ${pct(v.precision)}    ${v.tier.padEnd(6)} -> ${v.suggestedTier || "too few"}`);
  }
  console.log("\nNever fired (not calibrated): " + (r.neverFired.join(", ") || "none"));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
  };
  const dir = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!dir) {
    console.error("usage: node eval/calibrate.js <ptc-datasets-dir> [--n 75] [--seed 2026] [--out report.json]");
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8"));
  const report = calibrate(dir, catalog, { n: Number(flag("--n", 75)), seed: Number(flag("--seed", 2026)) });
  printReport(report);
  const out = flag("--out", null);
  if (out) {
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log("\nFull report (including every false positive) written to " + out);
  }
}

if (require.main === module) main();

module.exports = { TECHNIQUE_MAP, codePointToUtf16, parseLabels, splitParagraphs, detectArticle, scoreArticle, sampleIds, suggestTier, calibrate };
