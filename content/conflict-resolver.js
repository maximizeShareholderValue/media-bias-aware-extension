/**
 * Deterministic overlap filtering and conflict resolution (thesis FR-DET-04).
 *
 * Overlapping detections are resolved with three sequential priority rules:
 *   1. retain the longest phrase span;
 *   2. if equal length, retain the higher Confidence Tier (high > medium > low);
 *   3. if tiers are equal, retain the earliest starting character offset,
 *      then the lowest Pattern ID.
 * Non-prioritized overlapping detections are not rendered; they are returned
 * as `suppressed` (with the rule that decided and the detection that won) so
 * the internal audit log is complete.
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

  var TIER_RANK = { high: 3, medium: 2, low: 1 };

  function length(m) {
    return m.end - m.start;
  }

  function tierRank(m) {
    if (typeof m.confidenceRank === "number") return m.confidenceRank;
    return TIER_RANK[m.confidenceTier] || 0;
  }

  function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
  }

  function idOrder(a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /** Negative when `a` outranks `b`. */
  function comparePriority(a, b) {
    return length(b) - length(a) || tierRank(b) - tierRank(a) || a.start - b.start || idOrder(a, b);
  }

  /** Which of the three rules separated the winner from the loser. */
  function decidedBy(winner, loser) {
    if (length(winner) !== length(loser)) return "longest-span";
    if (tierRank(winner) !== tierRank(loser)) return "confidence-tier";
    if (winner.start !== loser.start) return "earliest-offset";
    return "lowest-pattern-id";
  }

  /**
   * @param {Array} matches - detections from PatternMatcher.findMatches().
   * @returns {{active: Array, suppressed: Array}} active is sorted by start;
   *   each suppressed entry is the original detection plus
   *   `suppressedBy` ({id, start, end}) and `decidedBy`.
   */
  function resolveWithAudit(matches) {
    var ordered = (matches || []).slice().sort(comparePriority);
    var active = [];
    var suppressed = [];

    for (var i = 0; i < ordered.length; i++) {
      var candidate = ordered[i];
      var winner = null;
      for (var j = 0; j < active.length; j++) {
        if (overlaps(candidate, active[j])) {
          winner = active[j];
          break;
        }
      }
      if (!winner) {
        active.push(candidate);
      } else {
        suppressed.push(
          Object.assign({}, candidate, {
            suppressedBy: { id: winner.id, start: winner.start, end: winner.end },
            decidedBy: decidedBy(winner, candidate)
          })
        );
      }
    }

    active.sort(function (a, b) {
      return a.start - b.start;
    });
    return { active: active, suppressed: suppressed };
  }

  /** Active detections only. */
  function resolve(matches) {
    return resolveWithAudit(matches).active;
  }

  return {
    resolve: resolve,
    resolveWithAudit: resolveWithAudit,
    _internals: { overlaps: overlaps, comparePriority: comparePriority, decidedBy: decidedBy }
  };
});
