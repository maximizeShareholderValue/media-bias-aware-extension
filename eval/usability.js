#!/usr/bin/env node
/**
 * Scores the user-centered usability evaluation (thesis 8.6, 9.4-9.6; EC3, EC4, Gate 4).
 *
 *   node eval/usability.js --template <sheet.csv>        writes a blank recording sheet (15 rows)
 *   node eval/usability.js <sheet.csv> [--out <dir>]     scores a filled sheet
 *
 * One row per participant: Participant, T1..T4 (task completed without assistance: Yes / No),
 * Q1..Q15 (rating 5 = Excellent ... 1 = Poor; ISO 9241-161:2025 questionnaire, Appendix 1).
 * Constructs (8.6): System Usability and Interface Clarity = Q1-Q10 (highlights Q1-Q3,
 * tooltips Q4-Q6, popup panels Q7-Q9, general ease of use Q10); Perceived Utility and News
 * Literacy Support = Q11-Q15 (comparison view Q11-Q13, usefulness Q14, intention to use Q15).
 *
 * Reports (descriptive only):
 *  - EC4: completion rate per task (target >= 80%).
 *  - Mean (9.4) and sample standard deviation (9.5) per item and per construct; a construct's score
 *    for a participant is the mean of their items in it. SD < 1.0 = fairly uniform,
 *    SD > 1.5 = considerable disagreement (flagged for follow-up).
 *  - Cronbach's alpha (9.6) once over all 15 items, over participants who answered every item.
 *  - Gate 4 / EC3: each construct mean >= 3.50 and alpha >= 0.70.
 * Writes usability-results.json and usability-results.md.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const csv = require("./csv.js");

const TASKS = ["T1", "T2", "T3", "T4"];
const ITEMS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14", "Q15"];
const CONSTRUCTS = [
  { name: "System Usability and Interface Clarity", items: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"] },
  { name: "Perceived Utility and News Literacy Support", items: ["Q11", "Q12", "Q13", "Q14", "Q15"] }
];
const TARGETS = { taskCompletionMin: 0.8, constructMeanMin: 3.5, alphaMin: 0.7, sdUniform: 1.0, sdDisagreement: 1.5 };
const PARTICIPANTS = 15;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Sample variance (n - 1), as in 9.5 and 9.6. */
function variance(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
}
const sd = (xs) => (xs.length < 2 ? null : Math.sqrt(variance(xs)));

/** Cronbach's alpha (9.6) for rows of item scores (every row complete): k/(k-1) * (1 - sum s_i^2 / s_t^2). */
function cronbachAlpha(rows) {
  if (rows.length < 2) return null;
  const k = rows[0].length;
  if (k < 2) return null;
  const itemVars = [];
  for (let j = 0; j < k; j++) itemVars.push(variance(rows.map((r) => r[j])));
  const totalVar = variance(rows.map((r) => r.reduce((a, b) => a + b, 0)));
  if (!totalVar) return null;
  return (k / (k - 1)) * (1 - itemVars.reduce((a, b) => a + b, 0) / totalVar);
}

function parseTask(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (["yes", "y", "1", "true", "completed", "complete", "done"].includes(s)) return true;
  if (["no", "n", "0", "false", "not completed", "incomplete", "assisted"].includes(s)) return false;
  return undefined;
}

function parseLikert(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

/** rows: CSV rows, header first. Returns the full report; problems lists cells that are not valid values. */
function score(rows) {
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name) => header.indexOf(name.toUpperCase());
  const missing = ["PARTICIPANT"].concat(TASKS, ITEMS).filter((c) => col(c) < 0);
  if (missing.length) throw new Error("the sheet is missing columns: " + missing.join(", "));
  const problems = [];
  const people = rows
    .slice(1)
    .filter((r) => r.some((c) => String(c || "").trim()) && String(r[col("Participant")] || "").trim())
    .map((r, i) => {
      const id = String(r[col("Participant")]).trim();
      const p = { id: id, tasks: {}, items: {} };
      TASKS.forEach((t) => {
        const v = parseTask(r[col(t)]);
        if (v === undefined) problems.push(id + " " + t + ": \"" + r[col(t)] + "\" is not Yes / No");
        p.tasks[t] = v === undefined ? null : v;
      });
      ITEMS.forEach((q) => {
        const v = parseLikert(r[col(q)]);
        if (v === undefined) problems.push(id + " " + q + ": \"" + r[col(q)] + "\" is not a whole number from 1 to 5");
        p.items[q] = v === undefined ? null : v;
      });
      return p;
    });

  const tasks = TASKS.map((t) => {
    const answered = people.filter((p) => p.tasks[t] !== null);
    const done = answered.filter((p) => p.tasks[t]).length;
    const rate = answered.length ? done / answered.length : null;
    return { task: t, completed: done, recorded: answered.length, rate: rate, meetsEC4: rate !== null && rate >= TARGETS.taskCompletionMin };
  });

  const items = ITEMS.map((q) => {
    const xs = people.map((p) => p.items[q]).filter((x) => x !== null);
    const s = sd(xs);
    return { item: q, n: xs.length, mean: mean(xs), sd: s, spread: s === null ? null : s < TARGETS.sdUniform ? "uniform" : s > TARGETS.sdDisagreement ? "disagreement" : "moderate", belowTarget: xs.length ? mean(xs) < TARGETS.constructMeanMin : null };
  });

  const constructs = CONSTRUCTS.map((c) => {
    const complete = people.filter((p) => c.items.every((q) => p.items[q] !== null));
    const scores = complete.map((p) => mean(c.items.map((q) => p.items[q])));
    const m = mean(scores);
    return {
      construct: c.name, items: c.items, n: complete.length, excludedIncomplete: people.length - complete.length,
      mean: m, sd: sd(scores), meetsMean: m !== null && m >= TARGETS.constructMeanMin
    };
  });

  const completeAll = people.filter((p) => ITEMS.every((q) => p.items[q] !== null));
  const alphaValue = cronbachAlpha(completeAll.map((p) => ITEMS.map((q) => p.items[q])));
  const alpha = { value: alphaValue, n: completeAll.length, excludedIncomplete: people.length - completeAll.length, meetsAlpha: alphaValue !== null && alphaValue >= TARGETS.alphaMin };

  return {
    participants: people.length, problems: problems, tasks: tasks, items: items, constructs: constructs, alpha: alpha, targets: TARGETS,
    ec4: { pass: tasks.every((t) => t.meetsEC4), note: "every task completed without assistance by at least 80% of participants" },
    gate4: { pass: constructs.every((c) => c.meetsMean) && alpha.meetsAlpha, note: "each construct mean >= 3.50 and Cronbach's alpha over all 15 items >= 0.70" }
  };
}

function toMarkdown(r) {
  const f2 = (x) => (x === null || x === undefined ? "n/a" : x.toFixed(2));
  const pct = (x) => (x === null ? "n/a" : (x * 100).toFixed(1) + "%");
  const yn = (b) => (b ? "Yes" : "**No**");
  const L = ["# Usability evaluation results (thesis 8.6, 9.4-9.6)", "", "Participants: " + r.participants + ". Generated by `node eval/usability.js`.", ""];
  if (r.problems.length) L.push("**Cells that could not be read (left out):** " + r.problems.join("; ") + ".", "");
  L.push("## Task completion (EC4, target >= 80%)", "", "| Task | Completed without assistance | Rate | Meets 80% |", "|---|---|---|---|");
  r.tasks.forEach((t) => L.push("| " + [t.task, t.completed + " of " + t.recorded, pct(t.rate), yn(t.meetsEC4)].join(" | ") + " |"));
  L.push("", "EC4: " + (r.ec4.pass ? "met" : "not met") + " (" + r.ec4.note + ").", "");
  L.push("## Items (mean and standard deviation)", "", "| Item | n | Mean | SD | Spread |", "|---|---|---|---|---|");
  r.items.forEach((x) => L.push("| " + [x.item, x.n, f2(x.mean) + (x.belowTarget ? " (below 3.50)" : ""), f2(x.sd), x.spread || "n/a"].join(" | ") + " |"));
  L.push("", "Spread: SD < 1.00 uniform; 1.00-1.50 moderate; > 1.50 considerable disagreement (9.5).", "");
  L.push("## Constructs (EC3, Gate 4)", "", "| Construct | Items | n | Mean | SD | Mean >= 3.50 |", "|---|---|---|---|---|---|");
  r.constructs.forEach((c) => L.push("| " + [c.construct, c.items[0] + "-" + c.items[c.items.length - 1], c.n, f2(c.mean), f2(c.sd), yn(c.meetsMean)].join(" | ") + " |"));
  L.push("", "Cronbach's alpha over all 15 items: " + f2(r.alpha.value) + " (n = " + r.alpha.n + "; >= 0.70: " + yn(r.alpha.meetsAlpha) + ").");
  L.push("", "Gate 4: " + (r.gate4.pass ? "met" : "not met") + " (" + r.gate4.note + "). Alpha is unstable with " + r.participants + " participants and is interpreted cautiously (8.6).");
  const excluded = r.constructs.filter((c) => c.excludedIncomplete);
  if (excluded.length) L.push("", excluded.map((c) => c.construct + ": " + c.excludedIncomplete + " participant(s) with a missing item left out of the construct score.").join(" "));
  if (r.alpha.excludedIncomplete) L.push("", r.alpha.excludedIncomplete + " participant(s) with a missing item left out of alpha.");
  return L.join("\n") + "\n";
}

function template() {
  const head = ["Participant"].concat(TASKS, ITEMS);
  const rows = [head];
  for (let i = 1; i <= PARTICIPANTS; i++) rows.push(["P" + String(i).padStart(2, "0")].concat(TASKS.map(() => ""), ITEMS.map(() => "")));
  return csv.stringify(rows);
}

function main() {
  const args = process.argv.slice(2);
  const ti = args.indexOf("--template");
  if (ti >= 0) {
    fs.writeFileSync(args[ti + 1], template());
    console.log("Wrote a blank sheet for " + PARTICIPANTS + " participants: " + args[ti + 1] + "\nT1-T4: Yes / No (completed without assistance). Q1-Q15: 5 Excellent ... 1 Poor.");
    return;
  }
  const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
  if (!file) {
    console.error("usage: node eval/usability.js <sheet.csv> [--out <dir>]   |   node eval/usability.js --template <sheet.csv>");
    process.exit(1);
  }
  const oi = args.indexOf("--out");
  const out = oi >= 0 ? args[oi + 1] : path.join(__dirname, "reports");
  const r = score(csv.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "usability-results.json"), JSON.stringify(r, null, 2) + "\n");
  const md = toMarkdown(r);
  fs.writeFileSync(path.join(out, "usability-results.md"), md);
  console.log(md);
}

if (require.main === module) main();

module.exports = { score: score, cronbachAlpha: cronbachAlpha, variance: variance, template: template, toMarkdown: toMarkdown, TARGETS: TARGETS };
