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
    for (var i = 0; i < (outlets || []).length; i++) {
      if (hostnameMatchesDomain(host, outlets[i].domain)) return outlets[i];
    }
    return null;
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
    ideologyBucket: ideologyBucket,
    hostnameOf: hostnameOf,
    hostnameMatchesDomain: hostnameMatchesDomain,
    findOutlet: findOutlet,
    groupByIdeology: groupByIdeology,
    MAX_KEYWORDS: MAX_KEYWORDS
  };
});
