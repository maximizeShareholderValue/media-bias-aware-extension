/**
 * Pure helpers for comparative reporting (thesis FR-AVD-01 / FR-AVD-02).
 * Shared by the popup, the service worker (importScripts), the split-screen
 * page and the Node tests.
 *
 *  - sanitizeKeywords: the privacy guard. Only short topic keywords may ever
 *    reach the network; anything that looks like a title or a sentence is dropped.
 *  - groupByIdeology: classifies result articles into Left / Center / Right
 *    using the bundled outlet ratings.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CompareUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_KEYWORDS = 4;
  var MAX_KEYWORD_CHARS = 40;
  var MAX_KEYWORD_WORDS = 3;

  // The comparison classes in the thesis are Left / Center / Right; the
  // finer outlet ratings fold into them (Lean Left -> Left, Lean Right -> Right).
  var BUCKET = {
    "Extreme Left": "Left",
    Left: "Left",
    "Center-Left": "Left",
    Center: "Center",
    "Center-Right": "Right",
    Right: "Right",
    "Extreme Right": "Right"
  };

  // Widely read outlets rated across the spectrum. The first lookups are limited to these so every result
  // is an outlet we can place on the Left / Center / Right split (an open search returns mostly unrated sites).
  var PRIORITY_DOMAINS = [
    // Left (incl. Center-Left)
    "cnn.com", "nytimes.com", "washingtonpost.com", "theguardian.com", "huffpost.com", "msnbc.com", "nbcnews.com",
    "abcnews.go.com", "cbsnews.com", "politico.com", "npr.org", "vox.com", "theatlantic.com", "slate.com",
    "independent.co.uk", "aljazeera.com", "apnews.com", "bloomberg.com", "usatoday.com", "axios.com", "cnbc.com",
    "pbs.org", "dw.com", "inquirer.net", "philstar.com", "gmanetwork.com", "rappler.com",
    // Center
    "reuters.com", "bbc.com", "bbc.co.uk", "economist.com", "ft.com", "upi.com", "thehill.com", "csmonitor.com",
    "forbes.com", "latimes.com", "france24.com", "abs-cbn.com", "straitstimes.com", "channelnewsasia.com",
    "japantimes.co.jp", "semafor.com", "foreignpolicy.com",
    // Right (incl. Center-Right)
    "foxnews.com", "nypost.com", "wsj.com", "breitbart.com", "dailywire.com", "washingtontimes.com",
    "nationalreview.com", "newsmax.com", "dailymail.co.uk", "washingtonexaminer.com", "theblaze.com",
    "thefederalist.com", "townhall.com", "telegraph.co.uk", "spectator.co.uk", "newsweek.com", "manilatimes.net"
  ];

  // Sites whose domain differs from the one in the outlet list.
  var DOMAIN_ALIASES = { "bbc.co.uk": "bbc.com" };

  var ENOUGH_RESULTS = 4;

  // NewsAPI's free (Developer) plan: articles are delayed about a day and search history reaches back about a month.
  var MIN_AGE_DAYS = 1;
  var MAX_AGE_DAYS = 30;

  /**
   * Can the free plan have coverage of a story published at `publishedAt`?
   * Runs locally; the date is never sent anywhere.
   * @returns {{status: "ok"|"too_new"|"too_old"|"unknown", days: number|null}}
   */
  function searchWindow(publishedAt, now) {
    var t = Date.parse(publishedAt);
    if (!t) return { status: "unknown", days: null };
    var days = Math.floor(((now == null ? Date.now() : now) - t) / 86400000);
    if (days < MIN_AGE_DAYS) return { status: "too_new", days: Math.max(0, days) };
    if (days > MAX_AGE_DAYS) return { status: "too_old", days: days };
    return { status: "ok", days: days };
  }

  /**
   * Query attempts, tried in order until enough rated articles are found. Each is looser than the last:
   * strict (up to 3 keywords, headline-level) -> core (2 strongest keywords, anywhere in the article)
   * -> open (2 strongest, any outlet). Only keywords are used; see sanitizeKeywords.
   */
  function buildAttempts(keywords) {
    var k = sanitizeKeywords(keywords);
    if (!k.length) return [];
    var attempts = [
      { id: "strict", keywords: k.slice(0, Math.min(3, k.length)), searchIn: "title,description", scope: "priority" },
      { id: "core", keywords: k.slice(0, Math.min(2, k.length)), searchIn: "", scope: "priority" },
      { id: "open", keywords: k.slice(0, Math.min(2, k.length)), searchIn: "", scope: "any" }
    ];
    var seen = {};
    return attempts
      .filter(function (a) {
        var key = a.keywords.join("|") + "|" + a.searchIn + "|" + a.scope;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      })
      .map(function (a) {
        return { id: a.id, keywords: a.keywords, query: buildQuery(a.keywords, a.keywords.length), searchIn: a.searchIn, scope: a.scope };
      });
  }

  function sanitizeKeywords(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var out = [];
    list.forEach(function (k) {
      if (typeof k !== "string") return;
      var c = k.toLowerCase().replace(/\s+/g, " ").trim();
      if (!c || c.length > MAX_KEYWORD_CHARS || c.split(" ").length > MAX_KEYWORD_WORDS) return;
      if (!/^[a-z0-9À-ɏ][a-z0-9À-ɏ\s-]*$/.test(c)) return;
      if (seen[c]) return;
      seen[c] = true;
      out.push(c);
    });
    return out.slice(0, MAX_KEYWORDS);
  }

  /** Quoted keywords joined with AND, e.g. "trump" AND "export ban". */
  function buildQuery(keywords, count) {
    return sanitizeKeywords(keywords)
      .slice(0, count || 3)
      .map(function (k) {
        return '"' + k + '"';
      })
      .join(" AND ");
  }

  function ideologyBucket(ideology) {
    return BUCKET[ideology] || null;
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    } catch (e) {
      return null;
    }
  }

  function hostnameMatchesDomain(hostname, domain) {
    var h = (hostname || "").toLowerCase();
    var d = (domain || "").toLowerCase();
    return !!d && (h === d || h.slice(-(d.length + 1)) === "." + d);
  }

  function findOutlet(outlets, url) {
    var host = hostnameOf(url);
    if (!host) return null;
    for (var alias in DOMAIN_ALIASES) {
      if (hostnameMatchesDomain(host, alias)) {
        host = DOMAIN_ALIASES[alias];
        break;
      }
    }
    // Longest matching domain wins, so "news.example.com" beats "example.com" when both are listed.
    var best = null;
    for (var i = 0; i < (outlets || []).length; i++) {
      var d = outlets[i].domain;
      if (hostnameMatchesDomain(host, d) && (!best || d.length > best.domain.length)) best = outlets[i];
    }
    return best;
  }

  /**
   * @param {Array} articles - [{title, url, source, publishedAt}] in relevance order.
   * @param {Array} outlets - bundled outlet-metadata `outlets`.
   * @param {string} [currentDomain] - the page's own outlet; its articles are left out.
   * @param {{perOutlet?: number}} [options] - cap per outlet so one outlet can't fill a column.
   * @returns {{groups: {Left: Array, Center: Array, Right: Array}, unrated: number, sameOutlet: number}}
   */
  function groupByIdeology(articles, outlets, currentDomain, options) {
    var perOutlet = (options && options.perOutlet) || 2;
    var groups = { Left: [], Center: [], Right: [] };
    var unrated = 0;
    var sameOutlet = 0;
    var seenUrl = {};
    var perOutletCount = {};

    (articles || []).forEach(function (a) {
      var host = hostnameOf(a.url);
      if (!host || seenUrl[a.url]) return;
      seenUrl[a.url] = true;
      if (currentDomain && hostnameMatchesDomain(host, currentDomain)) {
        sameOutlet++;
        return;
      }
      var outlet = findOutlet(outlets, a.url);
      var bucket = outlet && ideologyBucket(outlet.ideology);
      if (!bucket) {
        unrated++;
        return;
      }
      var key = outlet.domain;
      perOutletCount[key] = (perOutletCount[key] || 0) + 1;
      if (perOutletCount[key] > perOutlet) return;
      groups[bucket].push({
        title: a.title,
        url: a.url,
        source: a.source || outlet.name,
        publishedAt: a.publishedAt,
        domain: host,
        outletName: outlet.name,
        ideology: outlet.ideology,
        bucket: bucket
      });
    });
    return { groups: groups, unrated: unrated, sameOutlet: sameOutlet };
  }

  return {
    sanitizeKeywords: sanitizeKeywords,
    buildQuery: buildQuery,
    buildAttempts: buildAttempts,
    PRIORITY_DOMAINS: PRIORITY_DOMAINS,
    DOMAIN_ALIASES: DOMAIN_ALIASES,
    ENOUGH_RESULTS: ENOUGH_RESULTS,
    searchWindow: searchWindow,
    MAX_AGE_DAYS: MAX_AGE_DAYS,
    ideologyBucket: ideologyBucket,
    hostnameOf: hostnameOf,
    hostnameMatchesDomain: hostnameMatchesDomain,
    findOutlet: findOutlet,
    groupByIdeology: groupByIdeology,
    MAX_KEYWORDS: MAX_KEYWORDS
  };
});
