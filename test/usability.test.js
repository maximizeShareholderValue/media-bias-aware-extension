/**
 * Tests for the usability scoring (eval/usability.js; thesis 8.6, 9.4-9.6).
 * The expected numbers are worked out by hand in the comments.
 * Run with: node --test test/usability.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../eval/usability.js");
const csv = require("../eval/csv.js");

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("Cronbach's alpha matches a hand-worked example (9.6)", () => {
  // Items (columns) over 4 participants: [4,3,5,2] var 5/3; [5,3,5,3] var 4/3; [4,4,5,2] var 4.75/3.
  // Sum of item variances = 4.5833. Totals 13, 10, 15, 7: var 36.75/3 = 12.25.
  // alpha = 3/2 * (1 - 4.5833 / 12.25) = 0.93878.
  close(U.cronbachAlpha([[4, 5, 4], [3, 3, 4], [5, 5, 5], [2, 3, 2]]), 0.938776);
  assert.equal(U.cronbachAlpha([[4, 5]]), null, "one participant");
  assert.equal(U.cronbachAlpha([[3, 3], [3, 3]]), null, "no variance in totals");
});

const ITEMS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14"];
const HEAD = ["Participant", "T1", "T2", "T3", "T4"].concat(ITEMS);
// groups: Highlights Q1-3, Tooltips Q4-6, Popup Panels Q7-9, Comparison View Q10-11, Overall Q12-14
const row = (id, tasks, h, t, p, c, o) => [id].concat(tasks, h, t, p, c, o).map(String);

test("tasks, items, element groups, alpha and Gate 4 on a small sheet", () => {
  const rows = [
    HEAD,
    row("P01", ["Yes", "Yes", "Yes", "No"], [4, 4, 4], [5, 5, 5], [4, 4, 4], [5, 5], [4, 4, 4]),
    row("P02", ["Yes", "Yes", "No", "No"], [5, 5, 5], [4, 4, 4], [5, 5, 5], [4, 4], [5, 5, 5]),
    row("P03", ["Yes", "Yes", "Yes", "Yes"], [3, 3, 3], [5, 4, 5], [3, 3, 3], [4, 4], [3, 3, 3]),
    row("P04", ["Yes", "No", "Yes", "Yes"], [4, 5, 4], [2, 2, 2], [4, 5, 4], [2, 2], [4, 4, 4]),
    row("P05", ["Yes", "Yes", "Yes", "Yes"], [5, 4, 5], [4, 4, 4], [5, 4, 5], [4, 4], [5, 5, 5])
  ];
  const r = U.score(rows);
  assert.equal(r.participants, 5);
  // T1 5/5, T2 4/5, T3 4/5 (all >= 80%), T4 3/5 = 60%: EC4 not met.
  assert.deepEqual(r.tasks.map((t) => t.rate), [1, 0.8, 0.8, 0.6]);
  assert.equal(r.ec4.pass, false);
  assert.equal(r.items.length, 14);
  // Q1: 4,5,3,4,5 -> mean 4.2, SD sqrt(2.8/4) = 0.83666.
  close(r.items[0].mean, 4.2);
  close(r.items[0].sd, 0.836660);
  assert.equal(r.items[0].spread, "uniform");
  assert.deepEqual(r.constructs.map((c) => c.construct), ["Highlights", "Tooltips", "Popup Panels", "Comparison View", "Overall"]);
  // Highlights scores: 4, 5, 3, 4.333, 4.667 -> mean 4.2.
  close(r.constructs[0].mean, 4.2);
  // Tooltips: 5, 4, 4.667, 2, 4 -> mean 3.9333.
  close(r.constructs[1].mean, 3.933333);
  // Comparison View: 5, 4, 4, 2, 4 -> mean 3.8.
  close(r.constructs[3].mean, 3.8);
  assert.ok(r.constructs.every((c) => c.meetsMean));
  assert.equal(r.alpha.n, 5);
  assert.equal(typeof r.alpha.value, "number");
  assert.equal(r.gate4.pass, r.alpha.meetsAlpha);
});

test("a group mean below 3.50 fails Gate 4 even with a high alpha", () => {
  const low = (id, v) => row(id, ["Yes", "Yes", "Yes", "Yes"], [v, v, v], [v, v, v], [v, v, v], [2, 2], [v, v, v]);
  const r = U.score([HEAD, low("P01", 5), low("P02", 4), low("P03", 5)]);
  assert.equal(r.constructs[3].meetsMean, false);
  assert.equal(r.gate4.pass, false);
});

test("bad cells are reported and left out; incomplete participants are left out of the group and alpha only", () => {
  const rows = [
    HEAD,
    row("P01", ["yes", "maybe", "Yes", "Yes"], [4, 4, 6], [5, 5, 5], [4, 4, 4], [5, 5], [4, 4, 4]),
    row("P02", ["Yes", "Yes", "Yes", "Yes"], [5, 4, 5], [4, 4, 4], [5, 4, 5], [4, 4], [5, 5, 5]),
    row("P03", ["Yes", "Yes", "Yes", "Yes"], [3, 4, 3], [4, 5, 4], [3, 4, 3], [4, 5], [3, 4, 3])
  ];
  const r = U.score(rows);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems.join(" "), /P01 T2/);
  assert.match(r.problems.join(" "), /P01 Q3/);
  assert.equal(r.tasks[1].recorded, 2);
  assert.equal(r.items[2].n, 2);
  assert.equal(r.constructs[0].n, 2);
  assert.equal(r.constructs[0].excludedIncomplete, 1);
  assert.equal(r.constructs[1].n, 3);
  assert.equal(r.alpha.n, 2);
  assert.equal(r.alpha.excludedIncomplete, 1);
  assert.match(U.toMarkdown(r), /could not be read/);
});

test("template has the right columns and 15 blank participants; missing columns are refused", () => {
  const t = csv.parse(U.template());
  assert.deepEqual(t[0], HEAD);
  assert.equal(t.length, 16);
  assert.equal(t[15][0], "P15");
  assert.throws(() => U.score([["Participant", "T1"]]), /missing columns/);
});
