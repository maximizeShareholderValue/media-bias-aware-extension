/**
 * Conflict resolver: deduplicates overlapping phrase matches produced by
 * pattern-matcher.js before highlight rendering.
 *
 * Priority rules (spec, applied in order):
 *   1. Longest matching phrase wins.
 *   2. If equal length, higher-confidence rule wins (confidenceWeight).
 *   3. If still tied, category priority order:
 *      Loaded Language > Evaluative Modifier > Speculative Construction >
 *      Attribution Framing > Presupposition Trigger
 *      (lower categoryPriority number = higher priority; see
 *      pattern-catalog.json `categories[].priority`).
 *
 * Pure function module, unit-testable under Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ConflictResolver = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function length(match) {
    return match.end - match.start;
  }

  /** Returns true if two [start,end) ranges intersect. */
  function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  /**
   * Comparator implementing the three-tier priority rule. Returns a negative
   * number if `a` should be preferred over `b`.
   */
  function comparePriority(a, b) {
    var lenDiff = length(b) - length(a); // longer wins => ascending by -length
    if (lenDiff !== 0) return lenDiff;

    var confDiff = (b.confidenceWeight || 0) - (a.confidenceWeight || 0); // higher confidence wins
    if (confDiff !== 0) return confDiff;

    var catDiff = (a.categoryPriority != null ? a.categoryPriority : 999) -
      (b.categoryPriority != null ? b.categoryPriority : 999); // lower priority number wins
    return catDiff;
  }

  /**
   * Resolves a list of (possibly overlapping) matches into a non-overlapping
   * set using greedy interval selection ordered by priority: process
   * candidates best-first, accept a match only if it doesn't overlap any
   * already-accepted match, otherwise discard it as a duplicate/loser.
   *
   * @param {Array} matches - raw matches from PatternMatcher.findMatches().
   * @returns {Array} filtered matches, sorted by `start` ascending.
   */
  function resolve(matches) {
    if (!matches || matches.length < 2) return (matches || []).slice();

    var ordered = matches.slice().sort(comparePriority);
    var accepted = [];

    for (var i = 0; i < ordered.length; i++) {
      var candidate = ordered[i];
      var conflicts = false;
      for (var j = 0; j < accepted.length; j++) {
        if (overlaps(candidate, accepted[j])) {
          conflicts = true;
          break;
        }
      }
      if (!conflicts) accepted.push(candidate);
    }

    accepted.sort(function (a, b) {
      return a.start - b.start;
    });
    return accepted;
  }

  return { resolve: resolve, _internals: { overlaps: overlaps, comparePriority: comparePriority } };
});
