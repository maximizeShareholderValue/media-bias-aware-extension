const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CompareUtils = require("../shared/compare-utils.js");
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/outlet-metadata.json"), "utf8"));
const outlets = meta.outlets;
const OWNERSHIP_TYPES = ["Corporate Chain", "Independent", "State-Affiliated", "Foundation-Funded", "Religious Organization", "Unknown"];

test("no outlet domain starts with a dot (it could never match a hostname)", () => {
  assert.deepEqual(outlets.filter((o) => o.domain.startsWith(".")).map((o) => o.domain), []);
});

test("every outlet has a valid ownership type; MBFC links point at mediabiasfactcheck.com", () => {
  for (const o of outlets) {
    assert.ok(OWNERSHIP_TYPES.includes(o.ownershipType), o.domain + ": " + o.ownershipType);
    if (o.mbfcUrl) assert.match(o.mbfcUrl, /^https:\/\/mediabiasfactcheck\.com\//, o.domain);
  }
});

test("almost every outlet has an MBFC review link", () => {
  const withLink = outlets.filter((o) => o.mbfcUrl).length;
  assert.ok(withLink / outlets.length > 0.99, withLink + " of " + outlets.length);
});

test("curated outlets carry a parent company and a known ownership type", () => {
  const curated = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/ownership-curated.json"), "utf8")).outlets;
  for (const [domain, c] of Object.entries(curated)) {
    const o = outlets.find((x) => x.domain === domain);
    assert.ok(o, domain + " is not in outlet-metadata.json");
    assert.equal(o.parentCompany, c.parentCompany);
    assert.notEqual(o.ownershipType, "Unknown", domain);
  }
});

test("New York Post resolves from a subdomain URL with ownership and a review link", () => {
  const o = CompareUtils.findOutlet(outlets, "https://www.nypost.com/2026/08/24/us-news/story/");
  assert.equal(o.name, "New York Post");
  assert.equal(o.parentCompany, "News Corp");
  assert.equal(o.mbfcUrl, "https://mediabiasfactcheck.com/new-york-post/");
});

test("findOutlet prefers the longest matching domain", () => {
  const list = [{ domain: "example.com", name: "Parent" }, { domain: "news.example.com", name: "News" }];
  assert.equal(CompareUtils.findOutlet(list, "https://news.example.com/a").name, "News");
  assert.equal(CompareUtils.findOutlet(list, "https://www.example.com/a").name, "Parent");
});
