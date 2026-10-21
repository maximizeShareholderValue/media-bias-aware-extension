#!/usr/bin/env node
/**
 * Builds the Phase 2 CSV for eval/score.js from the three validators' workbooks (thesis 7.2, 9.3).
 *
 *   node eval/phase2-from-workbooks.js <v1.csv> <v2.csv> <v3.csv> [--ids eval/out/phrase-ids.json] [--out phase2.csv]
 *
 * Each <vN.csv> is the validator's "Phase 2" tab downloaded as CSV (File > Download > CSV). The tab
 * has a title and instructions above a header row with "Phrase ID", "Article ID" and "Judgment".
 * Phrase IDs (P001...) are mapped back to the itemId in key.json through phrase-ids.json.
 * Output columns: itemId, articleId, phraseId, validator1, validator2, validator3.
 * Stops with a list of problems when a phrase is missing, its article does not match, a judgment
 * is not Valid / Not Valid, or a workbook lists an unknown Phrase ID; blank judgments are allowed
 * (score.js counts those rows as incomplete).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const csv = require("./csv.js");

const JUDGMENTS = { valid: "Valid", "not valid": "Not Valid" };

/** Rows of one workbook tab -> { phraseId: {articleId, judgment} }; problems are pushed to `problems`. */
function readWorkbook(rows, label, problems) {
  const h = rows.findIndex((r) => r.some((c) => /^phrase id$/i.test(String(c).trim())));
  if (h < 0) {
    problems.push(label + ": no header row with \"Phrase ID\"");
    return {};
  }
  const head = rows[h].map((c) => String(c).trim().toLowerCase());
  const c = { id: head.indexOf("phrase id"), article: head.indexOf("article id"), judgment: head.indexOf("judgment") };
  if (c.article < 0 || c.judgment < 0) {
    problems.push(label + ": the header needs \"Article ID\" and \"Judgment\" columns");
    return {};
  }
  const out = {};
  rows.slice(h + 1).forEach((r) => {
    const id = String(r[c.id] || "").trim();
    if (!id) return;
    const raw = String(r[c.judgment] || "").trim();
    const judgment = raw ? JUDGMENTS[raw.toLowerCase()] : "";
    if (judgment === undefined) problems.push(label + " " + id + ": judgment \"" + raw + "\" is not Valid / Not Valid");
    if (out[id]) problems.push(label + " " + id + ": listed twice");
    out[id] = { articleId: String(r[c.article] || "").trim(), judgment: judgment || "" };
  });
  return out;
}

/** workbooks: [rows V1, rows V2, rows V3]; ids: {P001: itemId}. Returns {rows, problems, blank}. */
function build(workbooks, ids) {
  const problems = [];
  const books = workbooks.map((rows, i) => readWorkbook(rows, "V" + (i + 1), problems));
  books.forEach((b, i) =>
    Object.keys(b).forEach((pid) => {
      if (!ids[pid]) problems.push("V" + (i + 1) + " " + pid + ": not in phrase-ids.json");
    })
  );
  let blank = 0;
  const out = [["itemId", "articleId", "phraseId", "validator1", "validator2", "validator3"]];
  Object.keys(ids)
    .sort()
    .forEach((pid) => {
      const itemId = ids[pid];
      const articleId = itemId.split(":")[0];
      const votes = books.map((b, i) => {
        const row = b[pid];
        if (!row) {
          problems.push("V" + (i + 1) + " " + pid + ": missing from the workbook");
          return "";
        }
        if (row.articleId && row.articleId !== articleId) problems.push("V" + (i + 1) + " " + pid + ": Article ID " + row.articleId + " but phrase-ids.json says " + articleId);
        if (!row.judgment) blank++;
        return row.judgment || "";
      });
      out.push([itemId, articleId, pid].concat(votes));
    });
  return { rows: out, problems: problems, blank: blank };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
  const files = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (files.length !== 3) {
    console.error("usage: node eval/phase2-from-workbooks.js <v1.csv> <v2.csv> <v3.csv> [--ids eval/out/phrase-ids.json] [--out phase2.csv]");
    process.exit(1);
  }
  const ids = JSON.parse(fs.readFileSync(flag("--ids", path.join(__dirname, "out", "phrase-ids.json")), "utf8"));
  const r = build(files.map((f) => csv.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""))), ids);
  if (r.problems.length) {
    console.error("Fix these in the workbooks and download again:\n  " + r.problems.join("\n  "));
    process.exit(1);
  }
  const out = flag("--out", path.join(__dirname, "out", "phase2.csv"));
  fs.writeFileSync(out, csv.stringify(r.rows));
  console.log("Wrote " + out + ": " + (r.rows.length - 1) + " phrases x 3 validators" + (r.blank ? " (" + r.blank + " blank judgments)" : "") + ".");
}

if (require.main === module) main();

module.exports = { build: build, readWorkbook: readWorkbook };
