#!/usr/bin/env node
/**
 * Turns the popup's "Export detections (JSON)" files into the plain-text articles that
 * eval/generate-sheet.js and eval/score.js read, so validators, the generator and the
 * extension all work from the same extracted text (thesis 7.2).
 *
 *   node eval/export-to-txt.js <exportsDir> <articlesDir> [--catalog 1.1.0]
 *
 * <exportsDir>: one `<articleId>.json` per article, saved from the popup.
 * <articlesDir>: receives `<articleId>.txt`, paragraphs separated by a blank line.
 * Warns about exports with no paragraphs, from another catalog version, or with a duplicate URL.
 */
"use strict";

const fs = require("fs");
const path = require("path");

/** Export JSON -> article text. Blank lines inside a paragraph would split it, so they are collapsed. */
function toText(exp) {
  return (exp.paragraphs || [])
    .map((p) => String(p).replace(/\s*\n\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n") + "\n";
}

/** files: [{articleId, exp}] -> {texts: {articleId: text}, warnings: [string]} */
function convert(files, expectedCatalog) {
  const texts = {};
  const warnings = [];
  const byUrl = {};
  files.forEach(({ articleId, exp }) => {
    if (!exp.paragraphs || !exp.paragraphs.length) {
      warnings.push(articleId + ": no paragraphs - re-export it after the highlights appear");
      return;
    }
    if (expectedCatalog && exp.catalogVersion !== expectedCatalog) {
      warnings.push(articleId + ": exported with catalog " + exp.catalogVersion + ", expected " + expectedCatalog + " - reload the extension and re-export");
    }
    if (exp.url) {
      if (byUrl[exp.url]) warnings.push(articleId + ": same URL as " + byUrl[exp.url] + " (" + exp.url + ")");
      else byUrl[exp.url] = articleId;
    }
    texts[articleId] = toText(exp);
  });
  return { texts, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--catalog");
  const expected = i >= 0 ? args[i + 1] : JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8")).catalogVersion;
  const [inDir, outDir] = args.filter((a, j) => !a.startsWith("--") && !(j > 0 && args[j - 1] === "--catalog"));
  if (!inDir || !outDir) {
    console.error("usage: node eval/export-to-txt.js <exportsDir> <articlesDir> [--catalog 1.1.0]");
    process.exit(1);
  }
  const files = fs
    .readdirSync(inDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ articleId: f.replace(/\.json$/, ""), exp: JSON.parse(fs.readFileSync(path.join(inDir, f), "utf8")) }));
  const { texts, warnings } = convert(files, expected);
  fs.mkdirSync(outDir, { recursive: true });
  Object.keys(texts).forEach((id) => fs.writeFileSync(path.join(outDir, id + ".txt"), texts[id]));
  console.log("Wrote " + Object.keys(texts).length + " of " + files.length + " articles to " + outDir + " (expected catalog " + expected + ")");
  warnings.forEach((w) => console.log("WARNING: " + w));
}

if (require.main === module) main();

module.exports = { toText: toText, convert: convert };
