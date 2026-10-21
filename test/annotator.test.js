/**
 * Tests for the Phase 1 annotation page builder (eval/build-annotator.js) and for score.js
 * using its exact Start/End offsets.
 * Run with: node --test test/annotator.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const B = require("../eval/build-annotator.js");
const S = require("../eval/score.js");
const catalog = require("../data/pattern-catalog.json");

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ann-"));
  fs.mkdirSync(path.join(dir, "articles"));
  fs.mkdirSync(path.join(dir, "exports"));
  fs.writeFileSync(path.join(dir, "articles", "L01.txt"), "A smear here.\n\nAnother smear </script> there.\n");
  fs.writeFileSync(path.join(dir, "articles", "R01.txt"), "Plain text.\n");
  fs.writeFileSync(path.join(dir, "exports", "L01.json"), JSON.stringify({ title: "Title L01", url: "https://example.com/l01" }));
  return dir;
}

test("buildData embeds every article, titles from exports, and only technique definitions", () => {
  const dir = fixture();
  const d = B.buildData(path.join(dir, "articles"), path.join(dir, "exports"), catalog);
  assert.deepEqual(d.articles.map((a) => a.id), ["L01", "R01"]);
  assert.equal(d.articles[0].title, "Title L01");
  assert.equal(d.articles[1].title, "");
  assert.equal(d.techniques.length, 14);
  assert.deepEqual(Object.keys(d.techniques[0]).sort(), ["description", "example", "key", "label"]);
  assert.equal(d.techniques[0].description, B.GUIDE[d.techniques[0].key][0], "definition comes from the validator guide");
  assert.match(d.buildId, /^[0-9a-f]{10}$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("render injects the data safely and never includes rule triggers", () => {
  const dir = fixture();
  const d = B.buildData(path.join(dir, "articles"), null, catalog);
  const html = B.render(fs.readFileSync(path.join(__dirname, "../eval/annotator-template.html"), "utf8"), d);
  assert.ok(!html.includes("/*__DATA__*/null"));
  assert.ok(!/<\/script> there/.test(html), "article text cannot close the script tag");
  const json = html.match(/var DATA = (\{.*?\});\n/s)[1];
  assert.equal(JSON.parse(json).articles[0].text, "A smear here.\n\nAnother smear </script> there.\n");
  assert.ok(!html.includes("lexicalTrigger") && !html.includes("sourceExample"), "no rule internals");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("score.js uses Start/End to pick the right copy of a repeated span", () => {
  const text = "A smear here.\n\nAnother smear there.\n";
  const second = text.lastIndexOf("smear");
  const head = ["Annotation ID", "Article ID", "Span", "Technique", "Sentence Context", "Comment", "Start", "End"];
  const row = (v) => [head, [v + "-001", "L01", "smear", "Loaded Language", "", "", String(second), String(second + 5)], ["#done", "L01", "", "", "", "", "", ""]];
  const items = [{ articleId: "L01", technique: "LOADED_LANGUAGE", start: second, end: second + 5, inFullPipeline: true }];
  const r = S.score({ articles: { L01: text }, techniques: catalog.techniques, items, phase1: [row("V1"), row("V2"), row("V3")], phase2: null });
  assert.equal(r.phase1.located, 3, "the #done row is not an annotation");
  assert.equal(r.phase1.ambiguous.length, 0);
  assert.equal(r.fullPipeline.strict.tp, 1);
});

test("score.js falls back to text search when Start/End no longer match", () => {
  const text = "Only one smear here.\n";
  const head = ["Annotation ID", "Article ID", "Span", "Technique", "Sentence Context", "Comment", "Start", "End"];
  const rows = [head, ["V1-001", "L01", "smear", "Loaded Language", "", "", "0", "5"]];
  const r = S.score({ articles: { L01: text }, techniques: catalog.techniques, items: [], phase1: [rows, rows, rows], phase2: null });
  assert.equal(r.phase1.located, 3);
  assert.equal(r.phase1.referenceSpans, 1);
});

test("the annotator carries the guide's definitions and examples, and the examples match no rule", () => {
  const B = require("../eval/build-annotator.js");
  const catalog = require("../data/pattern-catalog.json");
  const PM = require("../content/pattern-matcher.js");
  assert.deepEqual(Object.keys(B.GUIDE).sort(), Object.keys(catalog.techniques).sort(), "one guide entry per technique");
  Object.values(B.GUIDE).forEach(([, examples]) => {
    examples.split(";").map((e) => e.trim().replace(/^"|"$/g, "")).forEach((e) => {
      const hits = PM.findMatches(e, catalog.patterns, catalog.techniques, { mode: "lexicalOnly" });
      assert.equal(hits.length, 0, "guide example matches a rule (priming): " + e + " -> " + hits.map((h) => h.id));
    });
  });
});
