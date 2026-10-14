/**
 * Tests for the formal-evaluation scorer (eval/score.js, eval/reference-set.js; thesis 7.2, 8.3, 9.3).
 * All annotations here are made up; the expected numbers are worked out by hand in the comments.
 * Run with: node --test test/score.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const R = require("../eval/reference-set.js");
const S = require("../eval/score.js");
const csv = require("../eval/csv.js");
const catalog = require("../data/pattern-catalog.json");

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

const A1 = "The radical left launched a smear campaign. Critics called the plan a disaster.\n\nThe smear was bogus, and the “radical left” said so.";
const at = (text, s, from = 0) => {
  const start = text.indexOf(s, from);
  return { start, end: start + s.length };
};
const smear2 = A1.indexOf("smear", A1.indexOf("smear") + 1);

const HEAD = ["Annotation ID", "Article ID", "Span", "Technique", "Sentence Context", "Comment"];
// V1 and V2 both mark the first "smear" as Loaded Language -> reference span.
// V1 and V3 mark "radical left" as Name Calling; V2 calls it Loaded Language -> strict reference is Name Calling only.
// V3 alone marks "bogus" -> not in the reference set. V3's last row is not in the article -> unlocated.
const V1 = [HEAD, ["V1-001", "A1", "smear campaign", "Loaded Language", "", ""], ["V1-002", "A1", "radical left", "Name Calling / Labeling", "The radical left launched", ""]];
const V2 = [HEAD, ["V2-001", "A1", "smear", "Loaded Language", "launched a smear campaign", ""], ["V2-002", "A1", "The radical  left", "Loaded Language", "", ""]];
const V3 = [HEAD, ["V3-001", "A1", "bogus", "Loaded Language", "", ""], ["V3-002", "A1", "radical left", "Name Calling / Labeling", "The radical left launched", ""], ["V3-003", "A1", "wreak havoc", "Loaded Language", "", ""]];

const item = (s, technique, inFullPipeline, from) => Object.assign({ articleId: "A1", technique, inFullPipeline }, at(A1, s, from));
// Pipeline: first "smear" (TP), "radical left" as Name Calling (TP), "bogus" (FP: only one validator).
// Baseline also has "disaster" (FP) and the second "smear" (FP: no validator marked it).
const ITEMS = [
  item("smear", "LOADED_LANGUAGE", true),
  item("radical left", "NAME_CALLING_LABELING", true),
  item("bogus", "LOADED_LANGUAGE", true),
  item("disaster", "EXAGGERATION_MINIMIZATION", false),
  item("smear", "LOADED_LANGUAGE", false, smear2)
];

const run = (phase2) => S.score({ articles: { A1 }, techniques: catalog.techniques, items: ITEMS, phase1: [V1, V2, V3], phase2: phase2 || null });

test("locateSpan ignores case, extra whitespace and quote style", () => {
  assert.deepEqual(R.locateSpan(A1, "THE RADICAL   LEFT", ""), { start: 0, end: 16, ambiguous: false });
  const q = R.locateSpan(A1, '"radical left"', "");
  assert.equal(A1.slice(q.start, q.end), "“radical left”");
  assert.equal(R.locateSpan(A1, "wreak havoc", ""), null);
});

test("locateSpan uses the Sentence Context to pick between repeated spans", () => {
  assert.equal(R.locateSpan(A1, "smear", "The smear was bogus").start, smear2);
  assert.equal(R.locateSpan(A1, "smear", "launched a smear campaign").start, A1.indexOf("smear"));
  const amb = R.locateSpan(A1, "smear", "");
  assert.equal(amb.ambiguous, true);
  assert.equal(amb.start, A1.indexOf("smear"));
});

test("reference set keeps spans marked by at least 2 of 3 validators (7.2)", () => {
  const a = (validator, technique, s) => Object.assign({ validator, articleId: "A1", technique }, at(A1, s));
  const ann = [a("V1", "LL", "smear campaign"), a("V2", "LL", "smear"), a("V3", "LL", "bogus"), a("V1", "NC", "radical left"), a("V2", "LL", "radical left")];
  const strict = R.buildReference(ann);
  assert.equal(strict.length, 1);
  assert.deepEqual(strict[0], { articleId: "A1", technique: "LL", start: A1.indexOf("smear"), end: A1.indexOf("smear") + 14, validators: ["V1", "V2"] });
  const lenient = R.buildReference(ann, { lenient: true });
  assert.equal(lenient.length, 2, "radical left counts when technique is ignored");
});

test("the same validator marking a span twice is not agreement", () => {
  const a = (validator, s) => Object.assign({ validator, articleId: "A1", technique: "LL" }, at(A1, s));
  assert.equal(R.buildReference([a("V1", "smear"), a("V1", "smear campaign")]).length, 0);
});

test("scoreSpans: strict needs the same technique, lenient takes any", () => {
  const ref = [{ articleId: "A1", technique: "LL", start: 0, end: 10 }];
  const hl = [{ articleId: "A1", technique: "NC", start: 4, end: 8 }];
  const strict = R.scoreSpans(hl, ref, false);
  assert.equal(strict.tp, 0);
  assert.equal(strict.recall, 0);
  const lenient = R.scoreSpans(hl, ref, true);
  assert.equal(lenient.tp, 1);
  assert.equal(lenient.recall, 1);
  assert.equal(R.scoreSpans([], ref, false).precision, null);
  assert.equal(R.scoreSpans(hl, [{ articleId: "A2", technique: "NC", start: 0, end: 10 }], false).tp, 0, "other article");
});

test("techniqueResolver accepts sheet labels, SemEval-style names and catalog keys", () => {
  const t = R.techniqueResolver(catalog.techniques);
  assert.equal(t("Name Calling / Labeling"), "NAME_CALLING_LABELING");
  assert.equal(t("loaded_language"), "LOADED_LANGUAGE");
  assert.equal(t("Thought-Terminating Clichés"), "THOUGHT_TERMINATING_CLICHES");
  assert.equal(t("Propaganda"), null);
});

test("score: reference set, pipeline vs baseline, and the gates", () => {
  const r = run();
  assert.equal(r.phase1.annotations, 7);
  assert.equal(r.phase1.located, 6);
  assert.equal(r.phase1.unlocated.length, 1);
  assert.equal(r.phase1.unlocated[0].problem, "span not found in article");
  assert.equal(r.phase1.referenceSpans, 2); // smear (LL), radical left (NC)
  assert.equal(r.phase1.referenceSpansAnyTechnique, 2);
  close(r.phase1.allThreeAgreed, 0);

  const p = r.fullPipeline.strict; // 3 flagged, 2 TP, both reference spans found
  assert.equal(p.flagged, 3);
  assert.equal(p.tp, 2);
  close(p.precision, 2 / 3);
  close(p.recall, 1);
  close(p.f1, 0.8);
  close(p.fpr, 1 / 3);
  assert.equal(p.perTechnique.NAME_CALLING_LABELING.precision, 1);
  close(p.perTechnique.LOADED_LANGUAGE.precision, 0.5);

  const b = r.baseline.strict; // 5 flagged, 2 TP
  assert.equal(b.flagged, 5);
  close(b.precision, 0.4);
  close(b.fpr, 0.6);

  assert.equal(r.phase2, null);
  assert.equal(r.judgmentsUsable, null);
  assert.deepEqual(r.gates.map((g) => g.pass), [true, true]); // EC1 0.667 >= 0.50; pipeline FPR 0.333 < baseline 0.6
});

test("detections in articles nobody annotated are left out", () => {
  const items = ITEMS.concat([{ articleId: "B9", technique: "DOUBT", start: 0, end: 5, inFullPipeline: true }]);
  const r = S.score({ articles: { A1 }, techniques: catalog.techniques, items, phase1: [V1, V2, V3], phase2: null });
  assert.equal(r.fullPipeline.strict.flagged, 3);
});

const P2HEAD = ["itemId", "articleId", "technique_to_judge", "phrase", "context", "start", "end", "validator1", "validator2", "validator3"];
const KEY = { a: {}, b: {}, c: {}, d: {} };

test("Phase 2: Fleiss' kappa passes Gate 1 on agreeing judgments (9.3)", () => {
  const rows = [P2HEAD, ["a", "", "", "", "", "", "", "Valid", "Valid", "Valid"], ["b", "", "", "", "", "", "", "Not Valid", "Not Valid", "Not Valid"], ["c", "", "", "", "", "", "", "Valid", "Valid", ""]];
  const r = run({ rows, key: KEY });
  assert.equal(r.phase2.rated, 2);
  assert.equal(r.phase2.incomplete, 1);
  close(r.phase2.kappa, 1);
  assert.equal(r.gates[0].pass, true);
  assert.equal(r.judgmentsUsable, true);
});

test("Phase 2: Gate 1 failure marks the judgments unusable", () => {
  // Each item split 2-1: Po = 1/3, Pe = 0.5, kappa = -1/3.
  const rows = [P2HEAD, ["a", "", "", "", "", "", "", "Valid", "Valid", "Not Valid"], ["b", "", "", "", "", "", "", "Not Valid", "Not Valid", "Valid"], ["c", "", "", "", "", "", "", "V", "N", "N"], ["d", "", "", "", "", "", "", "yes", "no", "yes"]];
  const r = run({ rows, key: KEY });
  close(r.phase2.kappa, -1 / 3);
  assert.equal(r.judgmentsUsable, false);
  assert.match(S.format(r), /must NOT be used/);
});

test("CLI runs end to end on files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "score-"));
  fs.mkdirSync(path.join(dir, "articles"));
  fs.writeFileSync(path.join(dir, "articles", "A1.txt"), A1);
  fs.writeFileSync(path.join(dir, "detections.json"), JSON.stringify({ items: ITEMS }));
  [V1, V2, V3].forEach((v, i) => fs.writeFileSync(path.join(dir, "v" + (i + 1) + ".csv"), csv.stringify(v)));
  const out = path.join(dir, "results.json");
  const stdout = execFileSync(process.execPath, [path.join(__dirname, "../eval/score.js"), "--articles", path.join(dir, "articles"), "--detections", path.join(dir, "detections.json"),
    "--phase1", path.join(dir, "v1.csv"), path.join(dir, "v2.csv"), path.join(dir, "v3.csv"), "--out", out], { encoding: "utf8" });
  assert.match(stdout, /Reference spans \(>= 2 of 3 validators\): 2/);
  assert.match(stdout, /wreak havoc/);
  close(JSON.parse(fs.readFileSync(out, "utf8")).fullPipeline.strict.precision, 2 / 3);
  fs.rmSync(dir, { recursive: true, force: true });
});
