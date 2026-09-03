/**
 * Rule-based linguistic pattern matcher.
 *
 * Matches POS-tagged text against the JSON Linguistic Pattern Catalog.
 * Pure function module: no DOM access, no chrome.* APIs, so it can be
 * unit tested directly under Node (see test/pattern-matcher.test.js).
 *
 * Every returned match carries the exact ruleId it came from (transparency
 * requirement: no opaque scoring).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    // Node / test environment.
    var nlpDep;
    try {
      nlpDep = require("../lib/compromise.js");
    } catch (e) {
      nlpDep = null;
    }
    module.exports = factory(nlpDep);
  } else {
    // Browser content-script environment: `nlp` is a global provided by
    // lib/compromise.js, loaded earlier in manifest.json's content_scripts.
    root.PatternMatcher = factory(root.nlp);
  }
})(typeof self !== "undefined" ? self : this, function (nlpFn) {
  "use strict";

  if (typeof nlpFn !== "function") {
    throw new Error(
      "PatternMatcher: compromise.js `nlp` function was not found. " +
        "Make sure lib/compromise.js is loaded before content/pattern-matcher.js."
    );
  }

  /** Escapes a string that is not already a regex source for literal use in `new RegExp`. */
  function toRegex(pattern) {
    return new RegExp(pattern, "gi");
  }

  /** Collapses whitespace and lower-cases for tolerant comparisons. */
  function norm(s) {
    return (s || "").toLowerCase().trim();
  }

  /**
   * Flattens compromise's per-sentence offset output into a single, sentence-
   * order list of terms whose offset.start/length are absolute positions in
   * the original `text` string (compromise keeps offsets absolute across
   * sentence boundaries within one nlp() call, confirmed empirically).
   */
  function flattenTerms(text) {
    var doc = nlpFn(text);
    var sentences = doc.out("offsets");
    var terms = [];
    for (var s = 0; s < sentences.length; s++) {
      var sentTerms = sentences[s].terms || [];
      for (var t = 0; t < sentTerms.length; t++) {
        terms.push(sentTerms[t]);
      }
    }
    return terms;
  }

  function hasTag(term, tag) {
    return Array.isArray(term.tags) && term.tags.indexOf(tag) !== -1;
  }

  /** True if `term.post` contains sentence-ending punctuation (used to avoid treating the last word of one sentence and the first word of the next as adjacent). */
  function endsSentence(term) {
    return /[.!?]/.test(term.post || "");
  }

  function isExcluded(word, exclusions) {
    if (!word || !exclusions || !exclusions.length) return false;
    var w = norm(word);
    for (var i = 0; i < exclusions.length; i++) {
      if (norm(exclusions[i]) === w) return true;
    }
    return false;
  }

  /**
   * LOADED_LANGUAGE / EVALUATIVE_MODIFIER style constraint:
   * trigger word must be immediately followed (same sentence) by a noun-
   * tagged word that is not on the pattern's contextExclusions denylist.
   *
   * NOTE (implementation choice - see README "Ambiguities"): Compromise's
   * static lexicon does not reliably tag these trigger words as #Adjective
   * (e.g. "radical"/"hardline"/"extremist" default to Noun/Actor). Rather
   * than gate on the trigger's own tag, we gate on adjacency to a following
   * noun plus the exclusion list, which is what actually distinguishes
   * "radical faction" (bias) from "radical surgery" (neutral) in practice.
   */
  function checkPrecedesNoun(terms, i, pattern) {
    if (endsSentence(terms[i])) return false;
    var next = terms[i + 1];
    if (!next) return false;
    if (!hasTag(next, "Noun")) return false;
    if (isExcluded(next.normal || next.text, pattern.contextExclusions)) return false;
    return true;
  }

  /**
   * PRESUPPOSITION constraint: trigger must be a reporting verb introducing
   * a claim - i.e. followed by "that" or an opening quotation mark - rather
   * than used in an unrelated sense ("admitted to the hospital").
   */
  function checkReportingVerb(terms, i, pattern, text, matchEnd) {
    var next = terms[i + 1];
    var introducesClause = false;

    if (next && norm(next.normal || next.text) === "that") {
      introducesClause = true;
    } else {
      var tail = text.slice(matchEnd, matchEnd + 4);
      if (/^\s*["“'‘]/.test(tail)) introducesClause = true;
    }
    if (!introducesClause) return false;

    // Guard against the small set of documented false-positive senses
    // (e.g. "admitted to the hospital", "evidence admitted in court").
    var windowWords = [];
    for (var w = Math.max(0, i - 2); w <= Math.min(terms.length - 1, i + 3); w++) {
      windowWords.push(norm(terms[w].normal || terms[w].text));
    }
    for (var j = 0; j < windowWords.length; j++) {
      if (isExcluded(windowWords[j], pattern.contextExclusions)) return false;
    }
    return true;
  }

  /**
   * Standalone-noun-label constraint: the trigger word itself IS the loaded
   * label (e.g. "terrorists", "propaganda", "regime"), rather than a word
   * that modifies a following noun. Requires the trigger to be tagged Noun
   * or Adjective (compromise tags e.g. "terrorist" as Adjective when
   * attributive - "terrorist organization" - but "terrorists" as Noun when
   * standalone - "terrorists attacked..." - confirmed empirically), and
   * checks BOTH neighboring words against contextExclusions, since the
   * neutral sense can sit on either side depending on the word ("exercise
   * regime" excludes via the preceding word; "propaganda poster" excludes
   * via the following word).
   */
  function checkStandaloneLabel(terms, i, pattern) {
    var term = terms[i];
    if (!hasTag(term, "Noun") && !hasTag(term, "Adjective")) return false;
    var prev = terms[i - 1];
    var next = terms[i + 1];
    if (prev && isExcluded(prev.normal || prev.text, pattern.contextExclusions)) return false;
    if (next && isExcluded(next.normal || next.text, pattern.contextExclusions)) return false;
    return true;
  }

  var CONSTRAINT_CHECKS = {
    precedesNoun: checkPrecedesNoun,
    standaloneLabel: checkStandaloneLabel
    // reportingVerb is handled separately below since it needs extra args (text, matchEnd).
  };

  /**
   * Runs every pattern in `patterns` against `text` and returns raw
   * (possibly overlapping) matches. Overlap resolution is a separate
   * pipeline stage (see conflict-resolver.js).
   *
   * @param {string} text - plain-text paragraph (or sentence) to scan.
   * @param {Array} patterns - `patterns` array from pattern-catalog.json.
   * @param {Object} [categoryPriority] - map of category name -> numeric priority (lower = higher priority).
   * @returns {Array<Match>} Match = { id, category, categoryPriority, label, start, end, matchedText, explanation, neutralAlternative, confidenceTier, confidenceWeight }
   */
  function findMatches(text, patterns, categoryPriority) {
    categoryPriority = categoryPriority || {};
    var matches = [];
    if (!text || !patterns || !patterns.length) return matches;

    var terms = null; // lazily computed; phrase-only patterns don't need POS tags.

    for (var p = 0; p < patterns.length; p++) {
      var pattern = patterns[p];
      var isPhraseLevel = !!(pattern.posConstraints && pattern.posConstraints.phraseLevel);

      if (isPhraseLevel) {
        var re = toRegex(pattern.pattern);
        var m;
        while ((m = re.exec(text)) !== null) {
          matches.push(buildMatch(pattern, m.index, m.index + m[0].length, m[0], categoryPriority));
          if (m[0].length === 0) re.lastIndex++; // safety against zero-width loops
        }
        continue;
      }

      // Token-level pattern: needs POS-tagged terms.
      if (terms === null) terms = flattenTerms(text);

      for (var i = 0; i < terms.length; i++) {
        var term = terms[i];
        var normalWord = norm(term.normal || term.text);
        if (pattern.triggerWords.indexOf(normalWord) === -1) continue;

        var start = term.offset.start;
        var end = term.offset.start + term.offset.length;
        var constraintType = (pattern.posConstraints && pattern.posConstraints.constraintType) || "precedesNoun";
        var constraintOk = false;

        if (constraintType === "reportingVerb") {
          constraintOk = checkReportingVerb(terms, i, pattern, text, end);
        } else if (CONSTRAINT_CHECKS[constraintType]) {
          constraintOk = CONSTRAINT_CHECKS[constraintType](terms, i, pattern);
        }

        if (constraintOk) {
          matches.push(buildMatch(pattern, start, end, term.text, categoryPriority));
        }
      }
    }

    matches.sort(function (a, b) {
      return a.start - b.start;
    });
    return matches;
  }

  function resolveNeutralAlternative(pattern, matchedText) {
    if (pattern.neutralAlternatives) {
      var override = pattern.neutralAlternatives[norm(matchedText)];
      if (override) return override;
    }
    return pattern.neutralAlternative || null;
  }

  function buildMatch(pattern, start, end, matchedText, categoryPriority) {
    return {
      id: pattern.id,
      category: pattern.category,
      categoryPriority: categoryPriority[pattern.category] != null ? categoryPriority[pattern.category] : 999,
      label: pattern.label,
      start: start,
      end: end,
      matchedText: matchedText,
      explanation: pattern.explanation,
      neutralAlternative: resolveNeutralAlternative(pattern, matchedText),
      confidenceTier: pattern.confidenceTier,
      confidenceWeight: pattern.confidenceWeight
    };
  }

  return {
    findMatches: findMatches,
    _internals: {
      flattenTerms: flattenTerms,
      checkPrecedesNoun: checkPrecedesNoun,
      checkReportingVerb: checkReportingVerb,
      checkStandaloneLabel: checkStandaloneLabel
    }
  };
});
