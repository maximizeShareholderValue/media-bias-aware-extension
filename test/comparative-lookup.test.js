/**
 * Comparative lookup: the query ladder, the priority-outlet list, and the
 * service worker's handling of NewsAPI results (run against a stubbed fetch).
 * Run with: node --test test/comparative-lookup.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CompareUtils = require("../shared/compare-utils.js");
const outletsFile = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/outlet-metadata.json"), "utf8"));
const outlets = outletsFile.outlets;

test("every priority domain is rated, and the list covers Left, Center and Right", () => {
  const counts = { Left: 0, Center: 0, Right: 0 };
  for (const d of CompareUtils.PRIORITY_DOMAINS) {
    const o = CompareUtils.findOutlet(outlets, "https://www." + d + "/story");
    assert.ok(o, d + " is not in outlet-metadata.json");
    const bucket = CompareUtils.ideologyBucket(o.ideology);
    assert.ok(bucket, d + " has no Left/Center/Right bucket");
    counts[bucket]++;
  }
  for (const b of Object.keys(counts)) assert.ok(counts[b] >= 10, b + " has only " + counts[b] + " priority outlets");
});

test("bbc.co.uk resolves to BBC News through the alias table", () => {
  assert.equal(CompareUtils.findOutlet(outlets, "https://www.bbc.co.uk/news/world-123").name, "BBC News");
});

test("buildAttempts: strict -> core -> open, only keywords in the queries", () => {
  const a = CompareUtils.buildAttempts(["Trump", "Iran", "Hormuz", "bounty"]);
  assert.deepEqual(a.map((x) => x.id), ["strict", "core", "open"]);
  assert.equal(a[0].query, '"trump" AND "iran" AND "hormuz"');
  assert.equal(a[0].searchIn, "title,description");
  assert.equal(a[1].query, '"trump" AND "iran"');
  assert.equal(a[1].scope, "priority");
  assert.equal(a[2].scope, "any");
  for (const x of a) assert.match(x.query, /^("[a-z0-9 -]+"( AND )?)+$/);
});

test("buildAttempts drops duplicate attempts and handles one keyword or none", () => {
  assert.deepEqual(CompareUtils.buildAttempts(["Iran"]).map((x) => x.id), ["strict", "core", "open"]);
  assert.equal(CompareUtils.buildAttempts([]).length, 0);
  const two = CompareUtils.buildAttempts(["iran", "hormuz"]);
  assert.equal(new Set(two.map((x) => x.query + x.searchIn + x.scope)).size, two.length);
});

// ---- service worker with a stubbed chrome / fetch ---------------------------

function loadWorker({ responses, key = "k", granted = true }) {
  const requests = [];
  const store = {};
  const listeners = [];
  const sandbox = {
    console: { warn() {}, log() {} },
    URL, AbortController, setTimeout, clearTimeout, Date, Promise, encodeURIComponent,
    importScripts: () => { sandbox.CompareUtils = CompareUtils; },
    fetch: async (url) => {
      if (String(url).startsWith("chrome-extension://")) {
        const name = String(url).split("/").pop();
        const file = name === "outlet-metadata.json" ? outletsFile : {};
        return { ok: true, json: async () => file };
      }
      requests.push(String(url));
      const next = responses.shift() || { articles: [] };
      if (next.abort) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      if (next.status) return { ok: false, status: next.status, text: async () => "", json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ articles: next.articles }) };
    },
    chrome: {
      runtime: { getURL: (p) => "chrome-extension://id/" + p, onMessage: { addListener: (fn) => listeners.push(fn) }, onInstalled: { addListener() {} } },
      storage: {
        local: { get: async () => ({ newsApiKey: key }), set: async () => {} },
        session: {
          get: async (k) => (k in store ? { [k]: store[k] } : {}),
          set: async (o) => Object.assign(store, o)
        }
      },
      permissions: { contains: async () => granted }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../background/service-worker.js"), "utf8"), sandbox);
  const ask = (keywords, currentDomain) =>
    new Promise((resolve) => listeners[0]({ type: "COMPARATIVE_LOOKUP", keywords, currentDomain }, {}, resolve));
  return { ask, requests, store };
}

const art = (host, n) => Array.from({ length: n }, (_, i) => ({ title: host + i, source: host, url: "https://" + host + "/a" + i, publishedAt: "2026-01-01" }));

test("stops after the first query when it already finds enough rated articles", async () => {
  const w = loadWorker({ responses: [{ articles: [...art("cnn.com", 2), ...art("reuters.com", 2), ...art("foxnews.com", 2)] }] });
  const r = await w.ask(["iran", "hormuz", "tanker"], "nypost.com");
  assert.equal(r.ok, true);
  assert.equal(w.requests.length, 1);
  assert.match(w.requests[0], /domains=/);
  assert.doesNotMatch(w.requests[0], /domains=[^&]*nypost\.com/, "the current outlet is left out of the search");
  assert.equal(r.articles.length, 6);
});

test("relaxes the query when the first one finds too little, and merges the results", async () => {
  const w = loadWorker({
    responses: [{ articles: [] }, { articles: [...art("bbc.com", 1), ...art("foxnews.com", 1)] }, { articles: [...art("cnn.com", 2), ...art("breitbart.com", 1)] }]
  });
  const r = await w.ask(["iran", "hormuz", "tanker"], "nypost.com");
  assert.equal(w.requests.length, 3);
  assert.match(decodeURIComponent(w.requests[0]), /"iran" AND "hormuz" AND "tanker"/);
  assert.match(decodeURIComponent(w.requests[1]), /"iran" AND "hormuz"/);
  assert.match(w.requests[2], /excludeDomains=nypost\.com/);
  assert.doesNotMatch(w.requests[2], /[?&]domains=/);
  assert.equal(r.articles.length, 5);
  assert.deepEqual([...r.tried.map((t) => t.id)], ["strict", "core", "open"]);
});

test("a timeout on the first query is reported, not hidden as 'no results'", async () => {
  const w = loadWorker({ responses: [{ abort: true }] });
  const r = await w.ask(["iran", "hormuz"], null);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "timeout");
  assert.equal(w.requests.length, 1, "no looser retries after a timeout");
});

test("a timeout on a later query keeps what the earlier queries found", async () => {
  const w = loadWorker({ responses: [{ articles: art("cnn.com", 1) }, { abort: true }] });
  const r = await w.ask(["iran", "hormuz", "tanker"], null);
  assert.equal(r.ok, true);
  assert.equal(r.articles.length, 1);
});

test("HTTP 429 and 401 give specific reasons", async () => {
  assert.equal((await loadWorker({ responses: [{ status: 429 }] }).ask(["iran", "hormuz"], null)).reason, "rate_limited");
  assert.equal((await loadWorker({ responses: [{ status: 401 }] }).ask(["iran", "hormuz"], null)).reason, "bad_api_key");
});

test("missing key or permission is reported before any request", async () => {
  const noKey = loadWorker({ responses: [], key: "" });
  assert.equal((await noKey.ask(["iran"], null)).reason, "no_api_key");
  assert.equal(noKey.requests.length, 0);
  const noPerm = loadWorker({ responses: [], granted: false });
  assert.equal((await noPerm.ask(["iran"], null)).reason, "no_permission");
});

test("the same lookup twice is served from the cache (saves the 100/day quota)", async () => {
  const w = loadWorker({ responses: [{ articles: [...art("cnn.com", 2), ...art("reuters.com", 2)] }] });
  await w.ask(["iran", "hormuz"], "nypost.com");
  const again = await w.ask(["iran", "hormuz"], "nypost.com");
  assert.equal(w.requests.length, 1);
  assert.equal(again.cached, true);
});

test("only keywords and outlet domains reach the network", async () => {
  const w = loadWorker({ responses: [{ articles: [] }, { articles: [] }, { articles: [] }] });
  await w.ask(["iran", "A full headline that should never be sent to the API because it is a sentence"], "nypost.com");
  for (const url of w.requests) assert.doesNotMatch(decodeURIComponent(url), /headline|sentence/i);
});

test("searchWindow: the free plan covers articles about 1 to 30 days old", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  assert.equal(CompareUtils.searchWindow("2026-10-07T01:00:00Z", now).status, "too_new");
  assert.equal(CompareUtils.searchWindow("2026-10-04T00:00:00Z", now).status, "ok");
  assert.equal(CompareUtils.searchWindow("2026-08-24T00:00:00Z", now).status, "too_old");
  assert.equal(CompareUtils.searchWindow("2026-08-24T00:00:00Z", now).days, 44);
  assert.equal(CompareUtils.searchWindow(null, now).status, "unknown");
  assert.equal(CompareUtils.searchWindow("not a date", now).status, "unknown");
});
