#!/usr/bin/env node
/**
 * Builds the Phase 1 annotation page (thesis 7.2): one self-contained HTML file with the
 * clean article texts embedded, opened offline in any browser by each validator.
 *
 *   node eval/build-annotator.js <articlesDir> <out.html> [--exports <exportsDir>]
 *
 * <articlesDir>: the `<articleId>.txt` files (from eval/export-to-txt.js).
 * --exports: the popup export JSON files, used only for each article's title and URL.
 *
 * The page shows only the technique definitions - never rule triggers or examples - so the
 * validators' reference set is not primed toward what the extension looks for. Its CSV export
 * has the Phase 1 columns plus exact Start/End offsets into the .txt files, read by eval/score.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Definitions and examples from the Validator Annotation Guide (Google Doc), word for word. The examples
// are neutral: none of them matches any of the 39 rules (checked with lexical-only matching), to avoid priming.
const GUIDE = {
  LOADED_LANGUAGE: ["Emotionally charged words meant to sway the reader", "\"a ruinous plan\"; \"a spineless retreat\""],
  NAME_CALLING_LABELING: ["A label for a person or group that the audience fears, dislikes or admires", "\"career bureaucrats\"; \"a puppet of Beijing\""],
  REPETITION: ["The same word or message repeated to push it", "\"Never again. Never again.\""],
  EXAGGERATION_MINIMIZATION: ["Making something much bigger or smaller than it is", "\"the most important vote ever cast\"; \"just a small hiccup\""],
  DOUBT: ["Undermining someone's credibility without evidence", "\"Can we trust anything he says?\"; \"his supposed expertise\""],
  APPEAL_TO_FEAR_PREJUDICE: ["Creating fear or relying on prejudice to win support", "\"our children will pay the price\"; \"our streets will become war zones\""],
  FLAG_WAVING: ["Appealing to national, religious or group identity", "\"any patriot would agree\"; \"for the sake of our homeland\""],
  CAUSAL_OVERSIMPLIFICATION: ["One simple cause for a complex problem; scapegoating", "\"prices rose for one reason only: the new governor\""],
  SLOGANS: ["Short, catchy rallying phrases", "\"Jobs, not handouts\"; \"Make it right\""],
  APPEAL_TO_AUTHORITY: ["A claim is true because an authority says so", "\"a top scientist says so, so it must be true\""],
  BLACK_AND_WHITE_FALLACY: ["Only two options presented", "\"either we act now or we lose everything\""],
  THOUGHT_TERMINATING_CLICHES: ["A phrase that shuts down discussion", "\"Rules are rules.\"; \"That's just politics.\""],
  STRAW_MAN_WHATABOUTISM_RED_HERRING: ["Deflecting to another issue or distorting the opponent's view", "\"But the other party did worse last year.\"; \"They want to abolish all borders.\""],
  BANDWAGON_REDUCTIO_AD_HITLERUM: ["Claiming that most people already support it, or linking a view to a hated figure", "\"millions are already switching\"; \"sounds like something Stalin would do\""]
};

function buildData(articlesDir, exportsDir, catalog) {
  const articles = fs
    .readdirSync(articlesDir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => {
      const id = f.replace(/\.txt$/, "");
      const text = fs.readFileSync(path.join(articlesDir, f), "utf8").replace(/\r\n/g, "\n");
      let meta = {};
      const exp = exportsDir && path.join(exportsDir, id + ".json");
      if (exp && fs.existsSync(exp)) meta = JSON.parse(fs.readFileSync(exp, "utf8"));
      return { id: id, title: meta.title || "", url: meta.url || "", text: text };
    });
  const techniques = Object.keys(catalog.techniques).map((k) => ({
    key: k,
    label: catalog.techniques[k].label,
    description: GUIDE[k] ? GUIDE[k][0] : catalog.techniques[k].description,
    example: GUIDE[k] ? GUIDE[k][1] : ""
  }));
  const buildId = crypto.createHash("sha1").update(JSON.stringify(articles.map((a) => [a.id, a.text]))).digest("hex").slice(0, 10);
  return { buildId: buildId, techniques: techniques, articles: articles };
}

function render(template, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  if (!template.includes("/*__DATA__*/null")) throw new Error("template is missing the /*__DATA__*/null placeholder");
  return template.replace("/*__DATA__*/null", () => json);
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--exports");
  const exportsDir = i >= 0 ? args[i + 1] : null;
  const [articlesDir, out] = args.filter((a, j) => !a.startsWith("--") && !(j > 0 && args[j - 1] === "--exports"));
  if (!articlesDir || !out) {
    console.error("usage: node eval/build-annotator.js <articlesDir> <out.html> [--exports <exportsDir>]");
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8"));
  const data = buildData(articlesDir, exportsDir, catalog);
  if (!data.articles.length) {
    console.error("no .txt articles found in " + articlesDir);
    process.exit(1);
  }
  const template = fs.readFileSync(path.join(__dirname, "annotator-template.html"), "utf8");
  fs.writeFileSync(out, render(template, data));
  console.log("Wrote " + out + " with " + data.articles.length + " articles (build " + data.buildId + "). Send the same file to all three validators.");
}

if (require.main === module) main();

module.exports = { buildData: buildData, render: render, GUIDE: GUIDE };
