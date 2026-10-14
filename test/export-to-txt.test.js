/**
 * Tests for eval/export-to-txt.js (popup export JSON -> plain-text articles).
 * Run with: node --test test/export-to-txt.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const E = require("../eval/export-to-txt.js");

const exp = (over) => Object.assign({ url: "https://example.com/a", title: "A", catalogVersion: "1.1.0", paragraphs: ["First paragraph.", "Second\n\nparagraph."] }, over);

test("paragraphs become blank-line-separated text; inner blank lines are collapsed", () => {
  assert.equal(E.toText(exp()), "First paragraph.\n\nSecond paragraph.\n");
});

test("warns about empty exports, another catalog version and duplicate URLs", () => {
  const { texts, warnings } = E.convert(
    [
      { articleId: "L01", exp: exp() },
      { articleId: "L02", exp: exp({ paragraphs: [] }) },
      { articleId: "L03", exp: exp({ url: "https://example.com/b", catalogVersion: "1.0.0" }) },
      { articleId: "L04", exp: exp() }
    ],
    "1.1.0"
  );
  assert.deepEqual(Object.keys(texts), ["L01", "L03", "L04"]);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /L02: no paragraphs/);
  assert.match(warnings[1], /L03: exported with catalog 1\.0\.0/);
  assert.match(warnings[2], /L04: same URL as L01/);
});

test("CLI writes <articleId>.txt that generate-sheet can read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exp-"));
  fs.mkdirSync(path.join(dir, "exports"));
  fs.writeFileSync(path.join(dir, "exports", "R01.json"), JSON.stringify(exp({ paragraphs: ["They lied to the American people.", "It was a smear."] })));
  const root = path.join(__dirname, "..");
  execFileSync(process.execPath, [path.join(root, "eval/export-to-txt.js"), path.join(dir, "exports"), path.join(dir, "articles"), "--catalog", "1.1.0"]);
  assert.equal(fs.readFileSync(path.join(dir, "articles", "R01.txt"), "utf8"), "They lied to the American people.\n\nIt was a smear.\n");
  const stdout = execFileSync(process.execPath, [path.join(root, "eval/generate-sheet.js"), path.join(dir, "articles"), path.join(dir, "out"), "--pipeline-only"], { encoding: "utf8" });
  assert.match(stdout, /pipeline highlights/);
  fs.rmSync(dir, { recursive: true, force: true });
});
