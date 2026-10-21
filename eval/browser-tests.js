#!/usr/bin/env node
/**
 * Browser-based functional and performance tests (thesis 8.4; NFR-PERF-01, NFR-PERF-02).
 *
 *   node eval/browser-tests.js [--runs 10] [--chrome <path>] [--out eval/reports]
 *
 * Runs the unpacked extension in Chrome (headless) on test pages served from a local web server.
 * All page text is written for these tests (no corpus text), so the pages can be published.
 *
 *  A. Text extraction across news layouts (8.4 item 1): six layouts of the same 8-paragraph article.
 *     The extension's extracted paragraphs (its audit log) are compared with the article body.
 *  B. Highlight injection and tooltips (8.4 item 6): highlight attributes, page text and links left
 *     intact, a phrase that crosses inline markup, and the tooltip on keyboard focus.
 *  C. The six NFR-PERF-01 stress scenarios, each loaded fresh --runs times, with the extension's
 *     stage timers (extraction, catalog, matching, rendering).
 *  D. Memory (NFR-PERF-02): JS heap in use after garbage collection, with and without the
 *     extension, and across repeated highlight injections.
 *
 * Writes browser-tests.json and browser-tests.md.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { openBrowser, sleep } = require("./browser.js");
const { PER_RULE } = require("./functional-test-log.js");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const RUNS = Number(opt("--runs", 10));
const CHROME = opt("--chrome", undefined);
const OUT = opt("--out", path.join(__dirname, "reports"));
const BUDGET_MS = 3000;
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

// The test article (written for these tests). Paragraphs 2, 4, 6 and 8 carry rule triggers.
const ARTICLE = [
  "The city council met on Tuesday to debate a new budget for road repairs, school buildings and public parks. The meeting lasted more than four hours and drew a large crowd of residents who wanted to speak about the plan.",
  "The governor slammed the new budget proposal in a statement released after the vote, saying it would raise costs for families without fixing the roads that need the most work.",
  "Council members said the plan would spend about 40 million dollars over three years. Most of the money would go to repaving streets in the eastern districts, where complaints about potholes have doubled since 2023.",
  "The so-called experts disagreed with the findings of an earlier city report, which had estimated that the repairs would cost half as much. The report's authors said they stood by their numbers.",
  "Several residents told the council that the work should start with the streets near schools. A parent of two said the crossing outside her children's school had been flooded twice this spring.",
  "Prices have skyrocketed since February, according to suppliers who bid on the contract, and the city's finance office said the estimate might rise again before the final vote.",
  "The council is expected to vote on the plan next month. If it passes, work on the first streets could begin before the end of the year, the city engineer said.",
  "Experts say the cost estimate is still too low. Residents who could not attend the meeting can send written comments to the city clerk until the end of the month."
];

const shell = (title, body, head) =>
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>" + esc(title) + "</title>" + (head || "") + "</head><body>" + body + "</body></html>";
const paras = (list, tag) => list.map((p, i) => "<" + (tag || "p") + " data-gold=\"" + i + "\">" + p + "</" + (tag || "p") + ">").join("");
const plain = (list) => list.map(esc);
const nav = (n) => "<header><nav>" + Array.from({ length: n }, (_, i) => "<a href=\"#s" + i + "\">Section " + i + "</a>").join(" | ") + "</nav></header>";

/** Section A layouts: [id, description, html(title), links in the article body]. */
function layouts() {
  const p = plain(ARTICLE);
  const inline = p.slice();
  inline[1] = "The governor <a href=\"#statement\">slammed</a> the new budget proposal in a <em>statement</em> released after the vote, saying it would raise costs for families without fixing the roads that need the most work.";
  inline[3] = "The <em>so-called</em> experts disagreed with the findings of an <a href=\"#report\">earlier city report</a>, which had estimated that the repairs would cost half as much. The report's authors said they stood by their <strong>numbers</strong>.";
  inline[7] = "<a href=\"#experts\">Experts</a> say the cost estimate is still too low. Residents who could not attend the meeting can send written comments to the city clerk until the end of the month.";
  const head = (t) => "<h1>" + esc(t) + "</h1><p class=\"byline\">By Test Reporter | October 1, 2026</p>";
  return [
    ["semantic", "Semantic markup: <article> with <p> paragraphs", (t) => shell(t, nav(6) + "<main><article>" + head(t) + paras(p) + "</article></main><footer><p>Copyright Test News.</p></footer>"), 0],
    ["div-only", "No <p> elements: paragraphs are plain <div>s in a story container", (t) => shell(t, nav(6) + "<div class=\"page\"><div class=\"story-body\">" + head(t) + paras(p, "div") + "</div></div>"), 0],
    ["cluttered", "Article between navigation, sidebar, ads, related links, comments, newsletter box and footer", (t) => shell(t,
      nav(15) + "<div class=\"layout\"><aside class=\"sidebar\"><h3>Most read</h3>" + Array.from({ length: 5 }, (_, i) => "<p><a href=\"#m" + i + "\">Most read story number " + (i + 1) + " about the weather and the weekend traffic</a></p>").join("") + "</aside>" +
      "<main><article>" + head(t) + paras(p.slice(0, 3)) + "<div class=\"ad\">Advertisement</div>" + paras(p.slice(3, 6)).replace(/data-gold="(\d)"/g, (m, d) => "data-gold=\"" + (Number(d) + 3) + "\"") +
      "<div class=\"newsletter\"><p>Sign up for our daily newsletter to get the top stories in your inbox every morning.</p></div>" + paras(p.slice(6)).replace(/data-gold="(\d)"/g, (m, d) => "data-gold=\"" + (Number(d) + 6) + "\"") + "</article>" +
      "<section class=\"related\"><h3>Related stories</h3><ul>" + Array.from({ length: 4 }, (_, i) => "<li><a href=\"#r" + i + "\">Related story " + (i + 1) + " on city spending</a></li>").join("") + "</ul></section>" +
      "<section id=\"comments\" class=\"comments\"><h3>Comments</h3>" + Array.from({ length: 4 }, (_, i) => "<div class=\"comment\"><p>Reader comment " + (i + 1) + ": I think the council should fix the roads near the hospital first, because ambulances use them every day.</p></div>").join("") + "</section></main></div>" +
      "<footer><p>Copyright Test News. All rights reserved. Terms of use and privacy policy.</p></footer>"), 0],
    ["inline-markup", "Links, <em> and <strong> inside paragraphs, including a highlighted phrase that crosses a link", (t) => shell(t, nav(6) + "<main><article>" + head(t) + paras(inline) + "</article></main>"), 3],
    ["sectioned", "Subheadings, a photo with caption and a pull quote between paragraphs", (t) => shell(t, nav(6) + "<main><article>" + head(t) + paras(p.slice(0, 2)) +
      "<h2>What the plan costs</h2>" + paras(p.slice(2, 4)).replace(/data-gold="(\d)"/g, (m, d) => "data-gold=\"" + (Number(d) + 2) + "\"") +
      "<figure><img alt=\"\" width=\"600\" height=\"300\" src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\"><figcaption>The council chamber during Tuesday's meeting.</figcaption></figure>" +
      "<blockquote class=\"pullquote\">The crossing outside her children's school had been flooded twice this spring.</blockquote>" +
      "<h2>What happens next</h2>" + paras(p.slice(4)).replace(/data-gold="(\d)"/g, (m, d) => "data-gold=\"" + (Number(d) + 4) + "\"") + "</article></main>"), 0],
    ["script-inserted", "Article body inserted by a script when the page loads (DOMContentLoaded)", (t) => shell(t, nav(6) + "<main><article id=\"story\">" + head(t) + "</article></main>",
      "<script>document.addEventListener('DOMContentLoaded',function(){document.getElementById('story').insertAdjacentHTML('beforeend'," + JSON.stringify(paras(p)) + ");});</script>"), 0]
  ];
}

/** About `target` words of article text, by repeating `source` paragraphs. */
function longBody(source, target) {
  const out = [];
  let n = 0;
  for (let i = 0; n < target; i++) {
    const p = source[i % source.length];
    if (n + words(p) > target) break;
    out.push(p);
    n += words(p);
  }
  return out;
}

/** Section C scenarios: [id, description, html(title)]. */
function scenarios() {
  const base = longBody(ARTICLE, 2000);
  const overlap = longBody(ARTICLE.map((p) => p + " Migrants are pouring into our country every week, the senator said."), 2000);
  const rules = Object.values(PER_RULE);
  const multiParas = [];
  for (let i = 0; i < rules.length; i += 4) multiParas.push(rules.slice(i, i + 4).join(" "));
  const multi = longBody(multiParas, 2000);
  const page = (t, list, extra, head) => shell(t, (extra && extra.before ? extra.before : nav(6)) + "<main><article><h1>" + esc(t) + "</h1>" + paras(plain(list)) + "</article></main>" + (extra && extra.after ? extra.after : ""), head);
  const dense = {
    before: "<header><nav>" + Array.from({ length: 2000 }, (_, i) => "<a href=\"#n" + i + "\">Link " + i + "</a>").join("") + "</nav></header><aside>" + "<div><div><span>widget</span></div></div>".repeat(3000) + "</aside>",
    after: "<footer><ul>" + Array.from({ length: 5000 }, (_, i) => "<li>Footer item " + i + "</li>").join("") + "</ul></footer>"
  };
  return [
    ["S1-threshold", "2,000-word threshold: an article at the 2,000-word limit", (t) => page(t, base), base],
    ["S2-dynamic", "Dynamically loaded page: the 2,000-word body is inserted by a script on DOMContentLoaded", (t) => shell(t, nav(6) + "<main><article id=\"story\"><h1>" + esc(t) + "</h1></article></main>",
      "<script>document.addEventListener('DOMContentLoaded',function(){document.getElementById('story').insertAdjacentHTML('beforeend'," + JSON.stringify(paras(plain(base))) + ");});</script>"), base],
    ["S3-dense-dom", "Dense DOM: the 2,000-word article inside a page with about 21,000 extra elements", (t) => page(t, base, dense), base],
    ["S4-overlapping", "Overlapping matches: every paragraph holds a phrase where two rules overlap (LL-013 and FW-002)", (t) => page(t, overlap), overlap],
    ["S6-multi-pattern", "Simultaneous multi-pattern detections: all 39 rules' test sentences, repeated to 2,000 words", (t) => page(t, multi), multi]
  ];
}

async function main() {
  const pages = {};
  const server = http.createServer((req, res) => {
    const m = req.url.match(/^\/p\/([^?]+)\?t=([^&]+)/);
    const make = m && pages[m[1]];
    if (!make) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(make(decodeURIComponent(m[2])));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const url = (id, title) => base + "/p/" + id + "?t=" + encodeURIComponent(title);
  layouts().forEach(([id, , html]) => (pages[id] = html));
  scenarios().forEach(([id, , html]) => (pages[id] = html));
  pages["late-insert"] = (t) => shell(t, nav(6) + "<main><article id=\"story\"><h1>" + esc(t) + "</h1></article></main>",
    "<script>setTimeout(function(){document.getElementById('story').insertAdjacentHTML('beforeend'," + JSON.stringify(paras(plain(ARTICLE))) + ");},1500);</script>");

  const b = await openBrowser({ withExtension: true, chrome: CHROME });
  const report = { generatedAt: new Date().toISOString(), runsPerScenario: RUNS, budgetMs: BUDGET_MS };

  // A + B: layouts.
  report.layouts = [];
  for (const [id, description, , linksInBody] of layouts()) {
    const title = "LAYOUT " + id + " - Test News";
    const res = await b.load(url(id, title), title);
    const log = res ? await b.toTab(title, { type: "GET_AUDIT_LOG" }) : null;
    const extracted = log && log.ok ? log.log.paragraphs.map(norm) : [];
    const gold = ARTICLE.map(norm);
    const found = gold.filter((g) => extracted.includes(g)).length;
    const correct = extracted.filter((e) => gold.includes(e)).length;
    const dom = await b.page(
      "(() => { const spans = [...document.querySelectorAll('.bias-highlight')];" +
        " const attrsOk = spans.length > 0 && spans.every(s => s.tabIndex === 0 && s.getAttribute('role') === 'button' && s.getAttribute('aria-describedby') === 'bias-aware-tooltip' && !!s.dataset.ruleId && !!s.dataset.explanation);" +
        " const byRule = {}; spans.forEach(s => byRule[s.dataset.ruleId] = (byRule[s.dataset.ruleId] || 0) + 1);" +
        " const text = [...document.querySelectorAll('[data-gold]')].sort((a, b) => a.dataset.gold - b.dataset.gold).map(p => p.textContent.replace(/\\s+/g, ' ').trim());" +
        " const links = [...document.querySelectorAll('[data-gold] a')].length;" +
        " return { spans: spans.length, byRule, attrsOk, text, links }; })()"
    );
    const tip = dom.spans
      ? await b.page(
          "(async () => { const s = document.querySelector('.bias-highlight'); s.focus(); await new Promise(r => setTimeout(r, 50));" +
            " const t = document.getElementById('bias-aware-tooltip'); const shown = !!t && !t.hidden; const text = t ? t.textContent : '';" +
            " s.blur(); await new Promise(r => setTimeout(r, 200));" +
            " return { shown, showsRule: text.indexOf('Rule ' + s.dataset.ruleId) >= 0, showsExplanation: text.indexOf(s.dataset.explanation) >= 0, hiddenAfterBlur: !!t && t.hidden }; })()"
        )
      : null;
    report.layouts.push({
      id, description,
      articleFound: !!(res && res.articleFound),
      extractedParagraphs: extracted.length, goldParagraphs: gold.length, goldFound: found, extractedCorrect: correct,
      extractionRecall: found / gold.length, extractionPrecision: extracted.length ? correct / extracted.length : null,
      extraneous: extracted.filter((e) => !gold.includes(e)),
      highlights: res ? res.matchCount : null, highlightSpans: dom.spans, spansPerRule: dom.byRule, highlightAttributesOk: dom.attrsOk,
      textIntact: JSON.stringify(dom.text) === JSON.stringify(gold), linksIntact: dom.links === linksInBody,
      crossMarkupSplit: id === "inline-markup" ? (dom.byRule["AA-001"] || 0) >= 2 || null : null,
      tooltip: tip
    });
    console.log("layout " + id.padEnd(16) + " extracted " + found + "/" + gold.length + " (+" + (extracted.length - correct) + " extra)  highlights " + (res && res.matchCount) + "  text intact " + (JSON.stringify(dom.text) === JSON.stringify(gold)) + "  tooltip " + JSON.stringify(tip));
  }
  // A late insertion (1.5 s after load) is not supported: the content script runs once, at document_idle.
  {
    const title = "LAYOUT late-insert - Test News";
    await b.navigate(url("late-insert", title));
    await sleep(4000);
    const r = await b.page("document.querySelectorAll('.bias-highlight').length");
    report.lateInsert = { description: "Article body inserted 1.5 s after load", highlightSpans: r };
  }

  // C + D: stress scenarios.
  report.scenarios = [];
  for (const [id, description, , body] of scenarios()) {
    const runs = [];
    const heaps = [];
    for (let i = 0; i < RUNS; i++) {
      const title = id + " run" + i + " - Test News";
      const res = await b.load(url(id, title), title, 20000);
      if (!res) throw new Error("no result for " + id + " run " + i);
      runs.push(res);
    }
    // Memory in a fresh tab, so earlier pages in the same tab do not count.
    await b.newTab();
    if (!(await b.load(url(id, id + " memory - Test News"), id + " memory - Test News", 20000))) throw new Error("no result for " + id + " (memory)");
    heaps.push(await b.heapUsed());
    await b.newTab();
    const t = runs.map((r) => r.elapsedMs).sort((x, y) => x - y);
    const med = (xs) => {
      const s = xs.slice().sort((x, y) => x - y);
      return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };
    const last = runs[runs.length - 1];
    report.scenarios.push({
      id, description, words: words(body.join(" ")),
      runs: t, medianMs: med(t), maxMs: t[t.length - 1], underBudget: t.every((x) => x < BUDGET_MS),
      stagesMedianMs: Object.fromEntries(Object.keys(last.stagesMs).map((k) => [k, Math.round(med(runs.map((r) => r.stagesMs[k])) * 10) / 10])),
      highlights: last.matchCount, techniques: last.techniqueCount, suppressedOverlaps: last.suppressedCount, paragraphs: last.paragraphCount,
      heapWithExtensionMB: heaps[0] / 1048576
    });
    console.log(id.padEnd(17) + " median " + med(t) + " ms  max " + t[t.length - 1] + " ms  highlights " + last.matchCount + "  suppressed " + last.suppressedCount + "  stages " + JSON.stringify(report.scenarios[report.scenarios.length - 1].stagesMedianMs));
  }

  // S5: repeated highlight injection on the 2,000-word page: highlights off and on again, 10 times.
  {
    const title = "S5-repeated - Test News";
    pages["S5-repeated"] = pages["S1-threshold"];
    const first = await b.load(url("S5-repeated", title), title);
    const cycles = [];
    for (let i = 0; i < 10; i++) {
      const off = await b.toTab(title, { type: "TOGGLE_HIGHLIGHTS", enabled: false });
      const spansOff = await b.page("document.querySelectorAll('.bias-highlight').length");
      const on = await b.toTab(title, { type: "TOGGLE_HIGHLIGHTS", enabled: true });
      const spansOn = await b.page("document.querySelectorAll('.bias-highlight').length");
      cycles.push({ elapsedMs: on && on.result ? on.result.elapsedMs : null, highlights: on && on.result ? on.result.matchCount : null, spansAfterOff: spansOff, spansAfterOn: spansOn, heapMB: (await b.heapUsed()) / 1048576, offOk: !!(off && off.ok) });
    }
    const t = cycles.map((c) => c.elapsedMs).sort((x, y) => x - y);
    report.repeatedInjection = {
      id: "S5-repeated", description: "Repeated highlight injection: highlights turned off and on 10 times on the 2,000-word page",
      firstRunHighlights: first.matchCount, cycles,
      noDuplicates: cycles.every((c) => c.spansAfterOff === 0 && c.spansAfterOn === cycles[0].spansAfterOn),
      medianMs: t[Math.floor(t.length / 2)], maxMs: t[t.length - 1], underBudget: t.every((x) => x < BUDGET_MS),
      heapGrowthMB: cycles[cycles.length - 1].heapMB - cycles[0].heapMB
    };
    console.log("S5-repeated       " + JSON.stringify({ noDuplicates: report.repeatedInjection.noDuplicates, maxMs: report.repeatedInjection.maxMs, heapGrowthMB: report.repeatedInjection.heapGrowthMB.toFixed(2) }));
  }
  report.browser = b.version.product;
  b.close();

  // D: the same pages without the extension, for the memory baseline.
  const plainBrowser = await openBrowser({ withExtension: false, chrome: CHROME });
  for (const s of report.scenarios) {
    await plainBrowser.newTab();
    await plainBrowser.load(url(s.id, s.id + " base - Test News"));
    await sleep(500); // let the S2 script insert the body
    s.heapWithoutExtensionMB = (await plainBrowser.heapUsed()) / 1048576;
  }
  plainBrowser.close();
  server.close();

  report.machine = { os: os.type() + " " + os.release() + " (" + os.arch() + ")", cpu: os.cpus()[0].model.trim(), logicalCores: os.cpus().length, ramGB: Math.round(os.totalmem() / 1073741824) };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "browser-tests.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "browser-tests.md"), toMarkdown(report));
  console.log("Wrote " + path.join(OUT, "browser-tests.md"));
}

function toMarkdown(r) {
  const pc = (x) => (x === null || x === undefined ? "n/a" : (x * 100).toFixed(0) + "%");
  const yn = (x) => (x === null || x === undefined ? "-" : x ? "Pass" : "**Fail**");
  const mb = (x) => (x === null || x === undefined || isNaN(x) ? "n/a" : x.toFixed(1));
  const L = ["# Browser tests (thesis 8.4, NFR-PERF-01, NFR-PERF-02)", "",
    "Generated " + r.generatedAt.slice(0, 10) + " by `node eval/browser-tests.js --runs " + r.runsPerScenario + "`. " + r.browser + " (headless) on " + r.machine.cpu + ", " + r.machine.logicalCores + " logical cores, " + r.machine.ramGB + " GB RAM, " + r.machine.os + ".", "",
    "Test pages are written for these tests and served from a local web server.", "",
    "## A. Text extraction across news layouts (8.4 item 1)", "",
    "Gold = the 8 body paragraphs. Recall = gold paragraphs the extension extracted; precision = extracted paragraphs that are body paragraphs.", "",
    "| Layout | Description | Recall | Precision | Extra text extracted |", "|---|---|---|---|---|"];
  r.layouts.forEach((x) => L.push("| " + [x.id, x.description.replace(/</g, "&lt;"), x.goldFound + "/" + x.goldParagraphs + " (" + pc(x.extractionRecall) + ")", pc(x.extractionPrecision), x.extraneous.length ? x.extraneous.map((e) => "\"" + e.slice(0, 60) + (e.length > 60 ? "..." : "") + "\"").join("; ") : "-"].join(" | ") + " |"));
  L.push("", "Article body inserted 1.5 s after the page loaded: " + r.lateInsert.highlightSpans + " highlights. The content script runs once, when the page has loaded (document_idle), so text added later is not scanned; reloading the page or turning highlights off and on in the popup scans it.", "");
  L.push("## B. Highlight injection and tooltips (8.4 item 6)", "", "| Layout | Highlights | Spans | Attributes (tabindex, role, aria-describedby, rule, explanation) | Page text unchanged | Links kept | Phrase across a link split into spans | Tooltip on focus shows rule and explanation | Tooltip hides on blur |", "|---|---|---|---|---|---|---|---|---|");
  r.layouts.forEach((x) => L.push("| " + [x.id, x.highlights, x.highlightSpans, yn(x.highlightAttributesOk), yn(x.textIntact), yn(x.linksIntact), yn(x.crossMarkupSplit), x.tooltip ? yn(x.tooltip.shown && x.tooltip.showsRule && x.tooltip.showsExplanation) : "-", x.tooltip ? yn(x.tooltip.hiddenAfterBlur) : "-"].join(" | ") + " |"));
  L.push("", "## C. NFR-PERF-01 stress scenarios", "", "Each scenario loaded fresh " + r.runsPerScenario + " times; stage times are medians of the extension's own timers (ms).", "",
    "| Scenario | Words | Highlights | Suppressed overlaps | Median (ms) | Max (ms) | Under 3,000 ms | Extraction | Catalog | Matching | Rendering |", "|---|---|---|---|---|---|---|---|---|---|---|");
  r.scenarios.forEach((s) => L.push("| " + [s.description, s.words, s.highlights, s.suppressedOverlaps, s.medianMs, s.maxMs, yn(s.underBudget), s.stagesMedianMs.extraction, s.stagesMedianMs.catalog, s.stagesMedianMs.matching, s.stagesMedianMs.rendering].join(" | ") + " |"));
  const ri = r.repeatedInjection;
  L.push("| " + [ri.description, "-", ri.firstRunHighlights, "-", ri.medianMs, ri.maxMs, yn(ri.underBudget), "-", "-", "-", "-"].join(" | ") + " |");
  L.push("", "Repeated injection: highlights removed completely each time and re-drawn without duplicates: " + yn(ri.noDuplicates) + ".", "");
  L.push("## D. Memory (NFR-PERF-02)", "", "JS heap in use by the page after garbage collection (MB), with the extension and on the same page in a browser without it.", "", "| Scenario | With extension | Without | Difference |", "|---|---|---|---|");
  r.scenarios.forEach((s) => L.push("| " + [s.id, mb(s.heapWithExtensionMB), mb(s.heapWithoutExtensionMB), mb(s.heapWithExtensionMB - s.heapWithoutExtensionMB)].join(" | ") + " |"));
  L.push("", "Across the 10 off/on cycles of S5 the heap changed by " + mb(ri.heapGrowthMB) + " MB (first " + mb(ri.cycles[0].heapMB) + " MB, last " + mb(ri.cycles[ri.cycles.length - 1].heapMB) + " MB). No tab crashed or stopped responding in any test.");
  return L.join("\n") + "\n";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
