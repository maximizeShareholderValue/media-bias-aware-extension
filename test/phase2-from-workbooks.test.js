/**
 * Tests for building the Phase 2 CSV from the validators' workbook tabs (eval/phase2-from-workbooks.js).
 * Run with: node --test test/phase2-from-workbooks.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../eval/phase2-from-workbooks.js");
const S = require("../eval/score.js");

const IDS = { P001: "L01:LL-011:1596:1605", P002: "C08:LL-016:7115:7127" };
// Same layout as the validators' "Phase 2" tab: title, instructions, blank row, header.
const tab = (n, j1, j2) => [
  ["Validator " + n + " — Judgment Sheet"],
  ["For each row, decide whether ..."],
  [],
  ["Phrase ID", "Article ID", "Flagged Phrase", "Sentence Context", "Assigned Technique", "Judgment", "Comment (optional)"],
  ["P001", "L01", "lambasted", "...", "Loaded Language", j1, ""],
  ["P002", "C08", "acknowledged", "...", "Loaded Language", j2, ""]
];

test("maps Phrase IDs back to itemIds and collects the three judgments", () => {
  const r = P.build([tab(1, "Valid", "Not Valid"), tab(2, "valid", "Not valid"), tab(3, "Valid", "")], IDS);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows[0], ["itemId", "articleId", "phraseId", "validator1", "validator2", "validator3"]);
  assert.deepEqual(r.rows[1], ["L01:LL-011:1596:1605", "L01", "P001", "Valid", "Valid", "Valid"]);
  assert.deepEqual(r.rows[2], ["C08:LL-016:7115:7127", "C08", "P002", "Not Valid", "Not Valid", ""]);
  assert.equal(r.blank, 1);
});

test("the output feeds score.js Phase 2 (blank judgment = incomplete row)", () => {
  const r = P.build([tab(1, "Valid", "Not Valid"), tab(2, "Valid", "Not Valid"), tab(3, "Valid", "")], IDS);
  const k = S.scorePhase2(r.rows, { "L01:LL-011:1596:1605": {}, "C08:LL-016:7115:7127": {} });
  assert.equal(k.rated, 1);
  assert.equal(k.incomplete, 1);
});

test("problems: bad judgment, wrong article, missing and unknown phrases", () => {
  const bad = tab(1, "Maybe", "Valid");
  bad[5][1] = "C09";
  const missing = tab(2, "Valid", "Valid").slice(0, 5);
  const extra = tab(3, "Valid", "Valid").concat([["P099", "R01", "x", "", "Doubt", "Valid", ""]]);
  const r = P.build([bad, missing, extra], IDS);
  const text = r.problems.join(" | ");
  assert.match(text, /V1 P001: judgment "Maybe"/);
  assert.match(text, /V1 P002: Article ID C09/);
  assert.match(text, /V2 P002: missing/);
  assert.match(text, /V3 P099: not in phrase-ids\.json/);
});

test("a tab without the header is reported", () => {
  const r = P.build([[["nothing here"]], tab(2, "Valid", "Valid"), tab(3, "Valid", "Valid")], IDS);
  assert.match(r.problems.join(" "), /V1: no header row/);
});
