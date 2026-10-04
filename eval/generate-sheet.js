#!/usr/bin/env node
/**
 * Runs the real detection modules over a folder of plain-text articles and
 * writes everything the thesis evaluation (sections 7-9) needs.
 *
 *   node eval/generate-sheet.js <articlesDir> [outDir]
 *
 * <articlesDir>: one `<articleId>.txt` per article (paragraphs separated by a blank line).
 *
 * Outputs in <outDir> (default eval/out):
 *   validation-sheet.csv   what validators see: every candidate phrase, in shuffled order, with the
 *                          technique to judge and blank validator1..3 columns (Valid / Not Valid).
 *                          It contains the BASELINE candidates (lexical trigger only), which are a
 *                          superset of the full pipeline's detections (thesis 8.3), and nothing that
 *                          reveals which ones the full pipeline kept.
 *   key.json               itemId -> {inFullPipeline, patternId, technique, tier, status} (hidden from validators)
 *   detections.json        full detail incl. suppressed overlaps (the FR-DET-04 audit log)
 *   semeval-full.labels / semeval-baseline.labels
 *                          SemEval span format: articleId <TAB> technique <TAB> start <TAB> end (character offsets)
 *   summary.json           counts, incl. the proportion of overlapping detections resolved (thesis 8.4)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const PatternMatcher = require(path.join(root, "content/pattern-matcher.js"));
const ConflictResolver = require(path.join(root, "content/conflict-resolver.js"));
const csv = require("./csv.js");

// Label names follow the PTC-SemEval20 scheme.
const SEMEVAL_NAMES = {
  LOADED_LANGUAGE: "Loaded_Language",
  NAME_CALLING_LABELING: "Name_Calling,Labeling",
  REPETITION: "Repetition",
  EXAGGERATION_MINIMIZATION: "Exaggeration,Minimisation",
  DOUBT: "Doubt",
  APPEAL_TO_FEAR_PREJUDICE: "Appeal_to_Fear-Prejudice",
  FLAG_WAVING: "Flag-Waving",
  CAUSAL_OVERSIMPLIFICATION: "Causal_Oversimplification",
  SLOGANS: "Slogans",
  APPEAL_TO_AUTHORITY: "Appeal_to_Authority",
  BLACK_AND_WHITE_FALLACY: "Black-and-White_Fallacy",
  THOUGHT_TERMINATING_CLICHES: "Thought-terminating_Cliches",
  STRAW_MAN_WHATABOUTISM_RED_HERRING: "Whataboutism,Straw_Men,Red_Herring",
  BANDWAGON_REDUCTIO_AD_HITLERUM: "Bandwagon,Reductio_ad_hitlerum"
};

function paragraphs(text) {
  const out = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ text: m[0], offset: m.index });
  return out;
}

function shuffled(arr, seed) {
  const a = arr.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const [articlesDir, outArg] = process.argv.slice(2);
  if (!articlesDir) {
    console.error("usage: node eval/generate-sheet.js <articlesDir> [outDir]");
    process.exit(1);
  }
  const outDir = outArg || path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const catalog = JSON.parse(fs.readFileSync(path.join(root, "data/pattern-catalog.json"), "utf8"));
  const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith(".txt")).sort();
  if (!files.length) {
    console.error("no .txt articles found in " + articlesDir);
    process.exit(1);
  }

  const items = [];
  const suppressedAll = [];
  const articleInfo = [];
  let passing = 0;
  let activeCount = 0;

  files.forEach((file) => {
    const articleId = file.replace(/\.txt$/, "");
    const text = fs.readFileSync(path.join(articlesDir, file), "utf8");
    const paras = paragraphs(text);
    articleInfo.push({ id: articleId, chars: text.length, paragraphs: paras.length });

    paras.forEach((para) => {
      const records = PatternMatcher.evaluate(para.text, catalog.patterns, catalog.techniques);
      const candidates = records.filter((r) => r.passed);
      const resolved = ConflictResolver.resolveWithAudit(candidates);
      passing += candidates.length;
      activeCount += resolved.active.length;

      const activeKeys = new Set(resolved.active.map((m) => m.id + ":" + m.start + ":" + m.end));
      const suppressedByKey = {};
      resolved.suppressed.forEach((m) => {
        suppressedByKey[m.id + ":" + m.start + ":" + m.end] = m;
        suppressedAll.push({
          articleId: articleId, patternId: m.id, technique: m.technique, start: para.offset + m.start, end: para.offset + m.end,
          phrase: m.matchedText, suppressedBy: m.suppressedBy.id, decidedBy: m.decidedBy
        });
      });

      records.forEach((r) => {
        const key = r.id + ":" + r.start + ":" + r.end;
        const start = para.offset + r.start;
        const end = para.offset + r.end;
        const status = activeKeys.has(key) ? "active" : r.failedAt ? "failed-" + r.failedAt : "suppressed-" + suppressedByKey[key].decidedBy;
        const ctxFrom = Math.max(0, start - 70);
        items.push({
          itemId: articleId + ":" + r.id + ":" + start + ":" + end,
          articleId: articleId,
          patternId: r.id,
          technique: r.technique,
          techniqueLabel: r.techniqueLabel,
          tier: r.confidenceTier,
          start: start,
          end: end,
          phrase: text.slice(start, end),
          context: text.slice(ctxFrom, end + 70).replace(/\s+/g, " "),
          inFullPipeline: status === "active",
          status: status
        });
      });
    });
  });

  const sheetRows = [["itemId", "articleId", "technique_to_judge", "phrase", "context", "start", "end", "validator1", "validator2", "validator3"]];
  shuffled(items, 20260101).forEach((it) => {
    sheetRows.push([it.itemId, it.articleId, it.techniqueLabel, it.phrase, it.context, it.start, it.end, "", "", ""]);
  });
  fs.writeFileSync(path.join(outDir, "validation-sheet.csv"), csv.stringify(sheetRows));

  const key = {};
  items.forEach((it) => {
    key[it.itemId] = { inFullPipeline: it.inFullPipeline, patternId: it.patternId, technique: it.technique, tier: it.tier, status: it.status };
  });
  fs.writeFileSync(path.join(outDir, "key.json"), JSON.stringify(key, null, 2));
  fs.writeFileSync(path.join(outDir, "detections.json"), JSON.stringify({ generatedAt: new Date().toISOString(), catalogVersion: catalog.catalogVersion, articles: articleInfo, items: items, suppressed: suppressedAll }, null, 2));

  const labels = (list) => list.map((it) => [it.articleId, SEMEVAL_NAMES[it.technique], it.start, it.end].join("\t")).join("\n") + "\n";
  fs.writeFileSync(path.join(outDir, "semeval-full.labels"), labels(items.filter((i) => i.inFullPipeline)));
  fs.writeFileSync(path.join(outDir, "semeval-baseline.labels"), labels(items));

  const summary = {
    catalogVersion: catalog.catalogVersion,
    articles: files.length,
    baselineCandidates: items.length,
    fullPipelineCandidatesPassingConditions: passing,
    fullPipelineActive: activeCount,
    suppressedOverlaps: suppressedAll.length,
    proportionOverlapsResolved: passing ? suppressedAll.length / passing : null
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nWrote validation-sheet.csv (give to validators), key.json (keep hidden), detections.json, semeval-*.labels, summary.json to " + outDir);
}

main();
