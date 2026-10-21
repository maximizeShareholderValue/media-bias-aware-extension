#!/usr/bin/env node
/**
 * Checks candidate articles for the usability sessions (thesis 8.6, Table 17) before they are used.
 *
 *   node eval/check-test-article.js <url> [<url> ...] [--chrome <path>]
 *
 * Opens each URL in Chrome with the unpacked extension (the real page, from the internet) and
 * reports what a participant would see, so the researchers can pick articles on which every task
 * can be done:
 *   T1  the outlet is in the lookup table, with a leaning and an ownership category
 *   T2  at least one highlight
 *   T4  at least two techniques, with a single most frequent one
 *   T3  needs a manual check in the popup (NewsAPI key, articles from the last month)
 * The articles must not be any of the 30 evaluation articles (8.6); the script warns if one is.
 * Nothing is saved; the output is printed only.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { openBrowser } = require("./browser.js");
const CompareUtils = require("../shared/compare-utils.js");

const args = process.argv.slice(2);
const chromeArg = args.indexOf("--chrome") >= 0 ? args[args.indexOf("--chrome") + 1] : undefined;
const urls = args.filter((a, i) => /^https?:\/\//.test(a) && args[i - 1] !== "--chrome");

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/^﻿/, ""));
const outlets = read("data/outlet-metadata.json").outlets;
const catalog = read("data/pattern-catalog.json");
const corpusUrls = new Set(read("eval/corpus-manifest.json").articles.map((a) => a.url.replace(/[?#].*$/, "").replace(/\/$/, "")));

function verdict(url, outlet, res) {
  const lines = [];
  const ok = (b) => (b ? "OK  " : "NO  ");
  const counts = (res && res.categoryCounts) || {};
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const label = (k) => (catalog.techniques[k] ? catalog.techniques[k].label : k);
  const t1 = !!(outlet && outlet.ideology);
  const owned = !!(outlet && outlet.ownershipType && outlet.ownershipType !== "Unknown");
  const t2 = !!(res && res.matchCount > 0);
  const t4 = sorted.length >= 2 && counts[sorted[0]] > counts[sorted[1]];
  lines.push(url);
  if (corpusUrls.has(url.replace(/[?#].*$/, "").replace(/\/$/, ""))) lines.push("  WARNING: this is one of the 30 evaluation articles; do not use it (8.6).");
  if (!res || !res.articleFound) {
    lines.push("  NO  the extension found no article on this page" + (res && res.reason ? " (" + res.reason + ")" : "") + ". Do not use it.");
    return lines.join("\n");
  }
  lines.push("  " + ok(t1) + "T1 outlet: " + (outlet ? outlet.name + " | leaning " + (outlet.ideology || "not rated") + " | ownership " + (owned ? outlet.ownershipType : "not recorded") + " | factual " + (outlet.factualReliability || "not rated") : "not in the lookup table"));
  if (t1 && !owned) lines.push("      ownership shows \"Ownership not recorded\"; T1 still works, but an outlet with a recorded ownership type is a better test");
  lines.push("  " + ok(t2) + "T2 highlights: " + (res.matchCount || 0));
  lines.push("  " + ok(t4) + "T4 techniques: " + (sorted.length ? sorted.map((k) => label(k) + " (" + counts[k] + ")").join(", ") : "none") + (sorted.length && !t4 ? "  (needs 2+ techniques with one clearly most frequent)" : ""));
  lines.push("  ?   T3 comparative view: check in the popup (NewsAPI finds articles from roughly the last month only)");
  lines.push("  => " + (t1 && t2 && t4 ? "usable for T1, T2 and T4" : "not suitable as it stands"));
  return lines.join("\n");
}

async function main() {
  if (!urls.length) {
    console.error("usage: node eval/check-test-article.js <url> [<url> ...] [--chrome <path>]");
    process.exit(1);
  }
  const b = await openBrowser({ withExtension: true, chrome: chromeArg });
  try {
    for (const url of urls) {
      await b.newTab();
      // Any title matches: there is one page tab, and live page titles are not known in advance.
      const res = await b.load(url, "", 30000);
      console.log(verdict(url, CompareUtils.findOutlet(outlets, url), res) + "\n");
    }
  } finally {
    b.close();
  }
}

if (require.main === module) main().catch((e) => {
  console.error(e);
  process.exit(1);
});

module.exports = { verdict: verdict };
