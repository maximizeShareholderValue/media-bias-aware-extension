/**
 * Tests for comparative-reporting helpers: the keyword privacy guard,
 * query building and Left/Center/Right grouping, plus keyword extraction.
 * Run with: node --test test/compare-utils.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const CompareUtils = require("../shared/compare-utils.js");
const KeywordExtractor = require("../content/keyword-extractor.js");

const outlets = [
  { domain: "cnn.com", name: "CNN", ideology: "Center-Left" },
  { domain: "foxnews.com", name: "Fox News", ideology: "Extreme Right" },
  { domain: "reuters.com", name: "Reuters", ideology: "Center" },
  { domain: "theguardian.com", name: "The Guardian", ideology: "Left" },
  { domain: "bbc.com", name: "BBC News", ideology: "Center" }
];

test("privacy guard: keeps short topic keywords", () => {
  assert.deepEqual(CompareUtils.sanitizeKeywords(["Trump", "Export Ban", "UK"]), ["trump", "export ban", "uk"]);
});

test("privacy guard: drops anything that looks like a title, sentence or article text", () => {
  const out = CompareUtils.sanitizeKeywords([
    "US pressures Europe to release diesel reserves as Trump threatens export ban", // title-length
    "The president said he may ask European countries to release reserves.", // sentence
    "line one\nline two with newline and many words",
    "a ".repeat(30),
    "ok-term",
    42,
    null,
    "<script>alert(1)</script>",
    "user@example.com"
  ]);
  assert.deepEqual(out, ["ok-term"]);
});

test("privacy guard: dedupes and caps the number of keywords", () => {
  const out = CompareUtils.sanitizeKeywords(["a1", "A1", "b2", "c3", "d4", "e5", "f6"]);
  assert.deepEqual(out, ["a1", "b2", "c3", "d4"]);
});

test("buildQuery quotes keywords and joins them with AND (max 3 by default)", () => {
  assert.equal(CompareUtils.buildQuery(["trump", "export ban", "europe", "diesel"]), '"trump" AND "export ban" AND "europe"');
  assert.equal(CompareUtils.buildQuery(["trump", "export ban", "europe"], 2), '"trump" AND "export ban"');
  assert.equal(CompareUtils.buildQuery([]), "");
});

test("ideology buckets fold the 7-point rating into Left / Center / Right", () => {
  assert.equal(CompareUtils.ideologyBucket("Extreme Left"), "Left");
  assert.equal(CompareUtils.ideologyBucket("Center-Left"), "Left");
  assert.equal(CompareUtils.ideologyBucket("Center"), "Center");
  assert.equal(CompareUtils.ideologyBucket("Center-Right"), "Right");
  assert.equal(CompareUtils.ideologyBucket("Extreme Right"), "Right");
  assert.equal(CompareUtils.ideologyBucket("Unknown"), null);
});

test("groupByIdeology groups by outlet rating, skips the current outlet, counts unrated", () => {
  const articles = [
    { title: "a", url: "https://www.cnn.com/x/1", source: "CNN" },
    { title: "b", url: "https://www.foxnews.com/y/2", source: "Fox News" },
    { title: "c", url: "https://www.reuters.com/z/3", source: "Reuters" },
    { title: "d", url: "https://news.bbc.com/q/4", source: "BBC" },
    { title: "e", url: "https://obscure-blog.example/p/5", source: "Blog" },
    { title: "f", url: "https://www.theguardian.com/w/6", source: "Guardian" }
  ];
  const { groups, unrated, sameOutlet } = CompareUtils.groupByIdeology(articles, outlets, "bbc.com");
  assert.deepEqual(groups.Left.map((x) => x.domain), ["cnn.com", "theguardian.com"]);
  assert.deepEqual(groups.Center.map((x) => x.domain), ["reuters.com"]);
  assert.deepEqual(groups.Right.map((x) => x.domain), ["foxnews.com"]);
  assert.equal(sameOutlet, 1, "the BBC subdomain article is the current outlet");
  assert.equal(unrated, 1);
  assert.equal(groups.Right[0].ideology, "Extreme Right");
});

test("groupByIdeology caps results per outlet and ignores duplicate URLs", () => {
  const articles = [1, 2, 3, 4].map((i) => ({ title: "t" + i, url: "https://cnn.com/a/" + i }));
  articles.push({ title: "dup", url: "https://cnn.com/a/1" });
  const { groups } = CompareUtils.groupByIdeology(articles, outlets, null, { perOutlet: 2 });
  assert.equal(groups.Left.length, 2);
});

test("domain matching is suffix-based, not substring-based", () => {
  assert.ok(CompareUtils.hostnameMatchesDomain("edition.cnn.com", "cnn.com"));
  assert.ok(!CompareUtils.hostnameMatchesDomain("notcnn.com", "cnn.com"));
});

test("keyword extractor returns short topic keywords, never a sentence", () => {
  const text =
    "Donald Trump has said he may ask European countries to release some of their diesel reserves. " +
    "The US export ban on diesel would flood the American market. European countries and the UK held talks. " +
    "Diesel prices in the UK hit record highs this week, according to the RAC.";
  const kws = KeywordExtractor.extract("US pressures Europe to release diesel reserves as Trump threatens export ban", text, 4);
  assert.ok(kws.length >= 2 && kws.length <= 4);
  assert.deepEqual(CompareUtils.sanitizeKeywords(kws), kws, "extractor output must already pass the privacy guard");
  assert.ok(kws.some((k) => /trump|europe|diesel|export/.test(k)), "should pick up headline topics: " + kws);
});
