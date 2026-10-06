/**
 * Pure string-matching helpers used to map Readability's cleaned article
 * text back onto live DOM paragraphs. No DOM access, so it's directly
 * Node-testable (see test/article-matcher.test.js) without needing jsdom.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ArticleMatcher = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeWhitespace(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Whether a live paragraph's text should count as "part of the article",
   * compared against Readability's cleaned textContent.
   *
   * Exact substring match is the fast path and covers most cases, but real
   * (especially ad-heavy) news sites regularly break it: Readability's
   * cleanup pass can strip a short inline fragment from the MIDDLE of a
   * paragraph (an inline "Share" link, a "Read more:" aside, a promotional
   * snippet) without removing the paragraph itself, which leaves a "hole" in
   * the cleaned text that an exact match against the live, unmodified
   * paragraph text will never find - silently dropping that paragraph from
   * analysis even though it's genuinely part of the article. Confirmed this
   * is a real risk (not just theoretical) by checking a live BBC article:
   * paragraphs there mix inline links/markup in ways a synthetic test
   * article doesn't exercise, and by reproducing it with an inline
   * "Share this" link stripped from the middle of a paragraph containing a
   * seed trigger word ("claimed") - the old exact-match check silently
   * dropped that whole paragraph from analysis.
   *
   * Falls back to a tolerant word-overlap check: if most (>=80%) of the
   * paragraph's own significant words still appear somewhere in the cleaned
   * text, treat it as a match. Unrelated paragraphs (nav, related-articles,
   * comments) won't clear that bar since they're about different content
   * entirely, so this doesn't meaningfully loosen the nav/ad/comment
   * filtering - it just tolerates small internal edits.
   */
  function textBelongsToArticle(paragraphText, cleanedArticleText) {
    if (cleanedArticleText.indexOf(paragraphText) !== -1) return true;

    var words = paragraphText.split(/\s+/).filter(function (w) {
      return w.length > 2;
    });
    if (!words.length) return false;

    var found = 0;
    for (var i = 0; i < words.length; i++) {
      if (cleanedArticleText.indexOf(words[i]) !== -1) found++;
    }
    return found / words.length >= 0.8;
  }

  return {
    normalizeWhitespace: normalizeWhitespace,
    textBelongsToArticle: textBelongsToArticle
  };
});
