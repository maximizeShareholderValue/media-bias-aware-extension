#!/usr/bin/env node
/**
 * Validation Gate 3: end-to-end processing time in a real browser (< 3,000 ms for articles
 * of up to 2,000 words).
 *
 *   node eval/gate3-timing.js [--runs 10] [--chrome <path>] [--articles eval/corpus/articles] [--out eval/reports]
 *
 * Loads the unpacked extension into Chrome (new headless mode), serves each evaluation article
 * as a plain news page from a local web server, and reads the extension's own measurement
 * (lastRunResult.elapsedMs: article extraction, catalog load, detection, conflict resolution
 * and highlight rendering) through the GET_BIAS_SUMMARY message. Every run is a fresh page
 * load. A synthetic 2,000-word article built from corpus paragraphs tests the Gate 3 limit.
 * Writes gate3-timing.json and gate3-timing.md, including the machine specification.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const RUNS = Number(opt("--runs", 10));
const CHROME = opt("--chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe");
const ARTICLES = opt("--articles", path.join(__dirname, "corpus", "articles"));
const OUT = opt("--out", path.join(__dirname, "reports"));
const BUDGET_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function loadArticles() {
  const list = fs
    .readdirSync(ARTICLES)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({ id: f.replace(/\.txt$/, ""), paragraphs: fs.readFileSync(path.join(ARTICLES, f), "utf8").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) }));
  // Synthetic Gate 3 article: corpus paragraphs in order until 2,000 words.
  const long = [];
  let n = 0;
  for (const a of list) {
    for (const p of a.paragraphs) {
      if (n + words(p) > 2000) break;
      long.push(p);
      n += words(p);
    }
    if (n >= 1950) break;
  }
  list.push({ id: "GATE3-2000", paragraphs: long, synthetic: true });
  list.forEach((a) => (a.words = words(a.paragraphs.join(" "))));
  return list;
}

function page(a, run) {
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>" + a.id + " run" + run + " - Test News</title></head><body>" +
    "<header><nav>Home | World | Politics</nav></header><main><article><h1>Article " + a.id + " run" + run + "</h1>" +
    a.paragraphs.map((p) => "<p>" + esc(p) + "</p>").join("") +
    "</article></main><footer>Test page served locally for timing.</footer></body></html>"
  );
}

/**
 * DevTools protocol over --remote-debugging-pipe (Chrome reads fd 3, writes fd 4, messages end
 * with NUL). Branded Chrome ignores --load-extension, so the extension is loaded with
 * Extensions.loadUnpacked, which is only available on the pipe transport.
 */
function launchChrome(profile) {
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
    "--user-data-dir=" + profile, "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const toChrome = chrome.stdio[3];
  const fromChrome = chrome.stdio[4];
  let id = 0;
  let buf = "";
  const waiting = {};
  fromChrome.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\0")) >= 0) {
      const d = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (d.id && waiting[d.id]) {
        waiting[d.id](d);
        delete waiting[d.id];
      }
    }
  });
  const send = (method, params, sessionId) =>
    new Promise((r) => {
      const i = ++id;
      waiting[i] = r;
      toChrome.write(JSON.stringify(Object.assign({ id: i, method, params: params || {} }, sessionId ? { sessionId } : {})) + "\0");
    });
  return { chrome, send };
}

async function main() {
  const articles = loadArticles();
  const server = http.createServer((req, res) => {
    const id = decodeURIComponent((req.url.match(/^\/a\/([^/?]+)\.html/) || [])[1] || "");
    const a = articles.find((x) => x.id === id);
    if (!a) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(a, (req.url.match(/run=(\d+)/) || [0, 0])[1]));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gate3-"));
  const { chrome, send } = launchChrome(profile);
  const version = (await send("Browser.getVersion")).result;
  version.Browser = version.product;
  const loaded = await send("Extensions.loadUnpacked", { path: ROOT });
  if (!loaded.result) throw new Error("could not load the extension: " + JSON.stringify(loaded.error));
  const extId = loaded.result.id;
  await send("Target.setDiscoverTargets", { discover: true });

  // Find the extension's service worker and a page to drive.
  let sw;
  for (let i = 0; i < 60 && !sw; i++) {
    const t = (await send("Target.getTargets")).result.targetInfos;
    sw = t.find((x) => x.type === "service_worker" && x.url.startsWith("chrome-extension://" + extId + "/"));
    if (!sw) await sleep(250);
  }
  if (!sw) throw new Error("extension service worker not found - is the extension loading?");
  const swSession = (await send("Target.attachToTarget", { targetId: sw.targetId, flatten: true })).result.sessionId;
  const pageTarget = (await send("Target.createTarget", { url: "about:blank" })).result.targetId;
  const pageSession = (await send("Target.attachToTarget", { targetId: pageTarget, flatten: true })).result.sessionId;
  await send("Page.enable", {}, pageSession);

  // The extension has no "tabs" permission, so it cannot read tab URLs: ask every tab and keep the
  // answer whose article title belongs to the page just loaded.
  const summary = async (id) => {
    const expr = "chrome.tabs.query({}).then(ts => Promise.all(ts.map(t => chrome.tabs.sendMessage(t.id, { type: 'GET_BIAS_SUMMARY' }).catch(() => null))))" +
      ".then(rs => rs.find(r => r && r.result && r.result.title && r.result.title.indexOf(" + JSON.stringify(id) + ") >= 0) || null)";
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, swSession);
    return r.result && r.result.result ? r.result.result.value : null;
  };

  const results = [];
  for (const a of articles) {
    const url = base + "/a/" + a.id + ".html";
    const times = [];
    let last = null;
    for (let run = 0; run < RUNS; run++) {
      await send("Page.navigate", { url: url + "?run=" + run }, pageSession);
      let res = null;
      for (let i = 0; i < 200; i++) {
        await sleep(50);
        const s = await summary(a.id + " run" + run);
        if (s && s.result && typeof s.result.elapsedMs === "number") {
          res = s.result;
          break;
        }
      }
      if (!res) {
        const dbg = await send("Runtime.evaluate", { expression: "chrome.tabs.query({}).then(ts => Promise.all(ts.map(t => chrome.tabs.sendMessage(t.id, { type: 'GET_BIAS_SUMMARY' }).catch(e => String(e)))))", awaitPromise: true, returnByValue: true }, swSession);
        throw new Error("no timing result for " + a.id + ": " + JSON.stringify(dbg.result).slice(0, 600));
      }
      times.push(res.elapsedMs);
      last = res;
    }
    const sorted = times.slice().sort((x, y) => x - y);
    const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    results.push({ id: a.id, synthetic: !!a.synthetic, words: a.words, extensionWordCount: last.wordCount, paragraphs: last.paragraphCount, highlights: last.matchCount, runs: times, medianMs: median, maxMs: sorted[sorted.length - 1], minMs: sorted[0] });
    console.log(a.id.padEnd(11) + String(a.words).padStart(5) + " words  median " + String(median).padStart(5) + " ms  max " + String(sorted[sorted.length - 1]).padStart(5) + " ms  highlights " + last.matchCount);
  }

  
  chrome.kill();
  server.close();

  const all = results.flatMap((r) => r.runs).sort((x, y) => x - y);
  const machine = {
    os: os.type() + " " + os.release() + " (" + os.arch() + ")",
    cpu: os.cpus()[0].model.trim(),
    logicalCores: os.cpus().length,
    ramGB: Math.round(os.totalmem() / 1073741824),
    browser: version.Browser + " (headless)",
    node: process.version
  };
  const report = {
    generatedAt: new Date().toISOString(),
    budgetMs: BUDGET_MS,
    runsPerArticle: RUNS,
    machine: machine,
    overall: { articles: results.length, measurements: all.length, medianMs: all[Math.floor(all.length / 2)], p95Ms: all[Math.floor(all.length * 0.95)], maxMs: all[all.length - 1], allUnderBudget: all.every((t) => t < BUDGET_MS) },
    gate3Article: results.find((r) => r.synthetic),
    perArticle: results
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "gate3-timing.json"), JSON.stringify(report, null, 2) + "\n");
  const L = ["# Gate 3 timing", "", "Generated " + new Date(report.generatedAt).toLocaleDateString("en-CA") + " by `node eval/gate3-timing.js --runs " + RUNS + "`.", "",
    "**Machine:** " + machine.cpu + ", " + machine.logicalCores + " logical cores, " + machine.ramGB + " GB RAM; " + machine.os + "; " + machine.browser + ".", "",
    "**Method:** the unpacked extension runs in Chrome; each article is served as a plain news page from a local web server and loaded fresh " + RUNS + " times. The time is the extension's own measurement (`elapsedMs`) from the start of its pipeline (article extraction, catalog load, detection, conflict resolution and highlight rendering) to the end.", "",
    "**Result:** " + (report.overall.allUnderBudget ? "PASS" : "FAIL") + ": all " + all.length + " measurements under " + BUDGET_MS + " ms. Median " + report.overall.medianMs + " ms, 95th percentile " + report.overall.p95Ms + " ms, maximum " + report.overall.maxMs + " ms.",
    "Synthetic 2,000-word article (" + report.gate3Article.words + " words): median " + report.gate3Article.medianMs + " ms, maximum " + report.gate3Article.maxMs + " ms.", "",
    "| Article | Words | Highlights | Median (ms) | Min (ms) | Max (ms) |", "|---|---|---|---|---|---|"];
  results.forEach((r) => L.push("| " + [r.id, r.words, r.highlights, r.medianMs, r.minMs, r.maxMs].join(" | ") + " |"));
  fs.writeFileSync(path.join(OUT, "gate3-timing.md"), L.join("\n") + "\n");
  console.log("\n" + L.slice(4, 9).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
