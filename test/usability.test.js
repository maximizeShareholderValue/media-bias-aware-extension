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

const HEAD = ["Participant", "T1", "T2", "T3", "T4", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"];
const row = (id, tasks, usab, useful) => [id].concat(tasks, usab, useful).map(String);

test("tasks, items, constructs and Gate 4 on a small sheet", () => {
  const rows = [
    HEAD,
    row("P01", ["Yes", "Yes", "Yes", "No"], [4, 4, 4, 4, 4], [5, 5, 5, 5, 5]),
    row("P02", ["Yes", "Yes", "No", "No"], [5, 5, 5, 5, 5], [4, 4, 4, 4, 4]),
    row("P03", ["Yes", "Yes", "Yes", "Yes"], [3, 3, 3, 3, 3], [5, 4, 5, 4, 5]),
    row("P04", ["Yes", "No", "Yes", "Yes"], [4, 5, 4, 5, 4], [2, 2, 2, 2, 2]),
    row("P05", ["Yes", "Yes", "Yes", "Yes"], [5, 4, 5, 4, 5], [4, 4, 4, 4, 4])
  ];
  const r = U.score(rows);
  assert.equal(r.participants, 5);
  // T1 5/5, T2 4/5, T3 4/5 (all >= 80%), T4 3/5 = 60%: EC4 not met.
  assert.deepEqual(r.tasks.map((t) => t.rate), [1, 0.8, 0.8, 0.6]);
  assert.equal(r.ec4.pass, false);
  // Q1: 4,5,3,4,5 -> mean 4.2, SD sqrt(((-.2)^2+.8^2+(-1.2)^2+(-.2)^2+.8^2)/4) = sqrt(2.8/4) = 0.83666.
  close(r.items[0].mean, 4.2);
  close(r.items[0].sd, 0.836660);
  assert.equal(r.items[0].spread, "uniform");
  // Usability construct scores: 4, 5, 3, 4.4, 4.6 -> mean 4.2.
  const u = r.constructs[0];
  close(u.mean, 4.2);
  assert.equal(u.meetsMean, true);
  // Usefulness: 5, 4, 4.6, 2, 4 -> mean 3.92.
  close(r.constructs[1].mean, 3.92);
  assert.equal(typeof u.alpha, "number");
  assert.equal(r.gate4.pass, u.meetsAlpha && r.constructs[1].meetsAlpha && u.meetsMean && r.constructs[1].meetsMean);
});

test("bad cells are reported and left out; incomplete participants are left out of the construct only", () => {
  const rows = [
    HEAD,
    row("P01", ["yes", "maybe", "Yes", "Yes"], [4, 4, 6, 4, 4], [5, 5, 5, 5, 5]),
    row("P02", ["Yes", "Yes", "Yes", "Yes"], [5, 4, 5, 4, 5], [4, 4, 4, 4, 4]),
    row("P03", ["Yes", "Yes", "Yes", "Yes"], [3, 4, 3, 4, 3], [4, 5, 4, 5, 4])
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
  assert.match(U.toMarkdown(r), /could not be read/);
});

test("template has the right columns and 15 blank participants; missing columns are refused", () => {
  const t = csv.parse(U.template());
  assert.deepEqual(t[0], HEAD);
  assert.equal(t.length, 16);
  assert.equal(t[15][0], "P15");
  assert.throws(() => U.score([["Participant", "T1"]]), /missing columns/);
});
