/**
 * Tests for the evaluation sheet generator (eval/generate-sheet.js, thesis 7.2 / 8.3).
 * Run with: node --test test/generate-sheet.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const csv = require("../eval/csv.js");

const ROOT = path.join(__dirname, "..");
const ARTICLE =
  "Critics say the agency kept the records secret from the American people for decades.\n\n" +
  "The radical left launched a smear campaign, and everyone knows the plan was a disaster.\n";

function generate(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-"));
  fs.mkdirSync(path.join(dir, "articles"));
  fs.writeFileSync(path.join(dir, "articles", "A1.txt"), ARTICLE);
  const out = path.join(dir, "out");
  execFileSync(process.execPath, [path.join(ROOT, "eval/generate-sheet.js"), path.join(dir, "articles"), out].concat(extra), { encoding: "utf8" });
  const read = (f) => fs.readFileSync(path.join(out, f), "utf8");
  return { dir, out, sheet: csv.parse(read("validation-sheet.csv")), key: JSON.parse(read("key.json")) };
}

test("default sheet lists every baseline candidate", () => {
  const g = generate([]);
  const rows = g.sheet.slice(1).filter((r) => r[0]);
  assert.equal(rows.length, Object.keys(g.key).length);
  assert.ok(Object.values(g.key).some((k) => !k.inFullPipeline), "fixture should have baseline-only candidates");
  fs.rmSync(g.dir, { recursive: true, force: true });
});

test("--pipeline-only sheet lists only the full pipeline's highlights, key keeps everything", () => {
  const g = generate(["--pipeline-only"]);
  const rows = g.sheet.slice(1).filter((r) => r[0]);
  const kept = Object.keys(g.key).filter((id) => g.key[id].inFullPipeline);
  assert.ok(rows.length > 0);
  assert.deepEqual(rows.map((r) => r[0]).sort(), kept.sort());
  assert.ok(Object.keys(g.key).length > rows.length, "key.json still has the baseline candidates for scoring");
  fs.rmSync(g.dir, { recursive: true, force: true });
});

test("--pipeline-only output feeds score.js end to end", () => {
  const g = generate(["--pipeline-only"]);
  const sheet = g.sheet.map((r, i) => (i === 0 || !r[0] ? r : r.slice(0, 7).concat(["Valid", "Valid", "Valid"])));
  fs.writeFileSync(path.join(g.dir, "phase2.csv"), csv.stringify(sheet));
  const head = ["Annotation ID", "Article ID", "Span", "Technique", "Sentence Context", "Comment"];
  const v = [head, ["", "A1", "the American people", "Flag-Waving", "", ""]];
  [1, 2, 3].forEach((n) => fs.writeFileSync(path.join(g.dir, "v" + n + ".csv"), csv.stringify(v)));
  const stdout = execFileSync(process.execPath, [path.join(ROOT, "eval/score.js"),
    "--articles", path.join(g.dir, "articles"), "--detections", path.join(g.out, "detections.json"),
    "--phase1", path.join(g.dir, "v1.csv"), path.join(g.dir, "v2.csv"), path.join(g.dir, "v3.csv"),
    "--phase2", path.join(g.dir, "phase2.csv"), "--key", path.join(g.out, "key.json")], { encoding: "utf8" });
  assert.match(stdout, /Reference spans \(>= 2 of 3 validators\): 1 /);
  assert.match(stdout, /Phase 2: \d+ highlights rated by all 3/);
  fs.rmSync(g.dir, { recursive: true, force: true });
});
