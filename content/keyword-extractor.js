/**
 * Privacy-preserving topic keyword extraction (thesis FR-AVD-01).
 *
 * Reduces an article to a few short topic keywords (named entities and
 * frequent nouns) so that ONLY those keywords - never the title, body text,
 * highlights or reading history - are ever sent to the comparative-reporting
 * API. Runs locally with Compromise.js.
 *
 * Pure function module, unit-testable under Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    var nlpDep;
    try {
      nlpDep = require("../lib/compromise.js");
    } catch (e) {
      nlpDep = null;
    }
    module.exports = factory(nlpDep);
  } else {
    root.KeywordExtractor = factory(root.nlp);
  }
})(typeof self !== "undefined" ? self : this, function (nlpFn) {
  "use strict";

  var MAX_WORDS_PER_KEYWORD = 3;
  var MAX_KEYWORD_CHARS = 40;
  var MAX_ANALYZED_CHARS = 20000;

  // Words that make poor search keywords: function words, time words and generic news nouns.
  var STOP = {};
  ("the a an and or but if of to in on at by for with from as is are was were be been it its this that these those " +
    "he she they we you i his her their our your not no more most some any all new said says say also one two three " +
    "week weeks day days month months year years time today yesterday tomorrow monday tuesday wednesday thursday friday " +
    "saturday sunday january february march april may june july august september october november december " +
    "people person man men woman women thing things way lot part number percent report reports statement news story " +
    "state states country government official officials president minister spokesperson source sources comment comments " +
    "while after before during since until over under between among according inc corp ltd llc co").split(" ").forEach(function (w) {
    STOP[w] = true;
  });

  function clean(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .replace(/[^a-z0-9À-ɏ\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function usable(keyword) {
    if (!keyword || keyword.length < 2 || keyword.length > MAX_KEYWORD_CHARS) return false;
    if (/\d/.test(keyword)) return false;
    var words = keyword.split(" ");
    if (words.length > MAX_WORDS_PER_KEYWORD) return false;
    for (var i = 0; i < words.length; i++) {
      if (STOP[words[i]] || words[i].length < 2) return false;
    }
    return true;
  }

  function addCandidates(scores, doc, weight) {
    var groups = [
      [doc.topics(), 3 * weight],
      [doc.people(), 3 * weight],
      [doc.nouns().not("#Pronoun"), 1 * weight]
    ];
    groups.forEach(function (g) {
      g[0].out("freq").forEach(function (item) {
        var keyword = clean(item.normal);
        if (usable(keyword)) scores[keyword] = (scores[keyword] || 0) + g[1] * item.count;
      });
    });
  }

  function tokenSet(keyword) {
    var set = {};
    keyword.split(" ").forEach(function (w) {
      set[w] = true;
    });
    return set;
  }

  function isSubsetOf(a, b) {
    for (var w in a) if (!b[w]) return false;
    return true;
  }

  /**
   * @param {string} title - page/article title (used only locally, to weight keywords).
   * @param {string} text - article body text.
   * @param {number} [max=4] - maximum number of keywords to return.
   * @returns {string[]} lower-case keywords, best first.
   */
  function extract(title, text, max) {
    max = max || 4;
    var scores = {};
    var body = (text || "").slice(0, MAX_ANALYZED_CHARS);
    if (body) addCandidates(scores, nlpFn(body), 1);
    if (title) {
      // Headline terms are the best statement of the topic: give them a bonus that body counts rarely outweigh.
      var titleScores = {};
      addCandidates(titleScores, nlpFn(title), 1);
      Object.keys(titleScores).forEach(function (k) {
        scores[k] = (scores[k] || 0) + 15 + titleScores[k];
      });
    }

    var ranked = Object.keys(scores).sort(function (a, b) {
      return scores[b] - scores[a] || a.length - b.length || (a < b ? -1 : 1);
    });

    var chosen = [];
    for (var i = 0; i < ranked.length && chosen.length < max; i++) {
      var tokens = tokenSet(ranked[i]);
      var redundant = false;
      for (var j = 0; j < chosen.length; j++) {
        if (isSubsetOf(tokens, tokenSet(chosen[j])) || isSubsetOf(tokenSet(chosen[j]), tokens)) {
          redundant = true;
          break;
        }
      }
      if (!redundant) chosen.push(ranked[i]);
    }
    return chosen;
  }

  return { extract: extract, MAX_KEYWORD_CHARS: MAX_KEYWORD_CHARS };
});
