/**
 * Gate 2 calibration harness (eval/calibrate.js), run against a tiny PTC-format fixture.
 * Run with: node --test test/calibrate.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const C = require("../eval/calibrate.js");
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/pattern-catalog.json"), "utf8"));

test("every PTC label maps to a catalog technique, and all 14 techniques are reachable", () => {
  const targets = new Set(Object.values(C.TECHNIQUE_MAP));
  assert.equal(targets.size, 14);
  for (const t of targets) assert.ok(catalog.techniques[t], t);
});

test("code-point offsets are converted to UTF-16 offsets", () => {
  const text = "😀 radical plan";
  const [g] = C.parseLabels("1\tLoaded_Language\t2\t9\n", text);
  assert.equal(text.slice(g.start, g.end), "radical");
});

test("unknown PTC labels fail loudly instead of being skipped", () => {
  assert.throws(() => C.parseLabels("1\tObfuscation\t0\t3\n", "abc"), /unknown PTC technique/);
});

test("paragraph offsets point back into the whole article", () => {
  const text = "Title\n\nFirst line.\nSecond line.";
  for (const p of C.splitParagraphs(text)) assert.equal(text.slice(p.offset, p.offset + p.text.length), p.text);
  assert.equal(C.splitParagraphs(text).length, 3);
});

test("a detection is a TP only when it overlaps a gold span of the same technique", () => {
  const dets = [
    { id: "A", technique: "DOUBT", start: 10, end: 20 },
    { id: "B", technique: "DOUBT", start: 30, end: 35 },
    { id: "C", technique: "SLOGANS", start: 10, end: 20 }
  ];
  const gold = [{ technique: "DOUBT", start: 15, end: 25 }];
  const { scored, matched } = C.scoreArticle(dets, gold);
  assert.deepEqual(scored.map((d) => d.tp), [true, false, false]);
  assert.deepEqual(matched, [true]);
});

test("the seeded sample is reproducible and does not depend on input order", () => {
  const ids = Array.from({ length: 50 }, (_, i) => String(1000 + i));
  const a = C.sampleIds(ids, 10, 2026);
  assert.deepEqual(a, C.sampleIds(ids.slice().reverse(), 10, 2026));
  assert.notDeepEqual(a, C.sampleIds(ids, 10, 7));
  assert.equal(new Set(a).size, 10);
});

test("tiers are only suggested with enough detections", () => {
  assert.equal(C.suggestTier(2, 1), null);
  assert.equal(C.suggestTier(9, 1), "high");
  assert.equal(C.suggestTier(7, 3), "medium");
  assert.equal(C.suggestTier(1, 4), "low");
});

test("end to end on a PTC-format fixture", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptc-"));
  fs.mkdirSync(path.join(dir, "train-articles"));
  fs.mkdirSync(path.join(dir, "train-labels-task2-technique-classification"));
  const text = "Officials met on Tuesday.\n\nThe senator slammed the plan as an existential threat to the country.";
  const at = (s) => text.indexOf(s);
  fs.writeFileSync(path.join(dir, "train-articles", "article1.txt"), text);
  fs.writeFileSync(
    path.join(dir, "train-labels-task2-technique-classification", "article1.task2-TC.labels"),
    `1\tAppeal_to_fear-prejudice\t${at("existential")}\t${at(" to the")}\n1\tDoubt\t0\t9\n`
  );
  const r = C.calibrate(dir, catalog, { n: 75, seed: 2026 });
  assert.equal(r.data.articles, 1);
  assert.equal(r.perRule["FE-001"].tp, 1, "existential threat matches the gold fear span");
  assert.equal(r.perRule["LL-011"].fp, 1, "slammed has no gold Loaded Language span here");
  assert.equal(r.perTechnique.DOUBT.gold, 1);
  assert.equal(r.perTechnique.DOUBT.recall, 0);
  assert.equal(r.overall.fp + r.overall.tp, r.overall.detections);
});
