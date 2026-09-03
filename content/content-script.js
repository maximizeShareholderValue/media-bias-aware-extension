/**
 * Content script orchestrator. Implements the processing pipeline in the
 * required order:
 *   1. Active tab DOM retrieval        -> implicit (this script runs against `document`)
 *   2. Readability.js article extraction
 *   3. Paragraph / sentence segmentation
 *   4. Tokenization                    -> inside PatternMatcher (Compromise)
 *   5. POS tagging (Compromise.js)     -> inside PatternMatcher
 *   6. Rule-based pattern matching     -> PatternMatcher.findMatches()
 *   7. Conflict resolution + filtering -> ConflictResolver.resolve()
 *   8. Highlight rendering + UI        -> Highlighter.renderHighlights()
 *
 * Privacy: nothing computed here is ever sent off the page. The only
 * message this script sends is to its own background service worker
 * (same extension, no network), to fetch the bundled pattern catalog.
 */
(function () {
  "use strict";

  var PERF_BUDGET_MS = 3000;
  var lastRunResult = null;

  function getSettings() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ highlightsEnabled: true }, resolve);
    });
  }

  function requestPatternCatalog() {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ type: "GET_PATTERN_CATALOG" }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error("catalog unavailable"));
          return;
        }
        resolve(response.catalog);
      });
    });
  }

  function normalizeWhitespace(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Steps 2-3: run Readability on a detached clone (so the live page is
   * never mutated by its destructive DOM parsing), then map its cleaned
   * article textContent back onto live <p> elements. A live paragraph is
   * considered part of "the article" only if its normalized text also
   * appears in Readability's cleaned textContent - this is what isolates
   * the article container and drops nav/ad/comment paragraphs, while still
   * highlighting inside the real, visible DOM (not a disconnected clone).
   */
  function extractArticle() {
    if (typeof Readability !== "function") return null;

    var clone = document.cloneNode(true);
    var reader = new Readability(clone, { charThreshold: 200 });
    var parsed;
    try {
      parsed = reader.parse();
    } catch (e) {
      return null;
    }
    if (!parsed || !parsed.textContent || parsed.textContent.trim().length < 200) {
      return null;
    }

    var cleanedArticleText = normalizeWhitespace(parsed.textContent);
    var liveParagraphs = Array.prototype.slice.call(document.querySelectorAll("p"));

    var articleParagraphs = liveParagraphs.filter(function (p) {
      var t = normalizeWhitespace(p.textContent);
      if (t.length < 40) return false; // skip captions/bylines/trivial fragments
      return cleanedArticleText.indexOf(t) !== -1;
    });

    return {
      title: parsed.title,
      byline: parsed.byline,
      paragraphs: articleParagraphs
    };
  }

  function computeCategoryPriority(catalog) {
    var map = {};
    Object.keys(catalog.categories).forEach(function (name) {
      map[name] = catalog.categories[name].priority;
    });
    return map;
  }

  async function run() {
    var startedAt = performance.now();

    var settings = await getSettings();
    if (!settings.highlightsEnabled) {
      lastRunResult = { articleFound: false, disabled: true };
      return lastRunResult;
    }

    var article = extractArticle();
    if (!article || !article.paragraphs.length) {
      lastRunResult = { articleFound: false };
      return lastRunResult;
    }

    var catalog;
    try {
      catalog = await requestPatternCatalog();
    } catch (e) {
      console.warn("[bias-aware] pattern catalog unavailable:", e.message);
      lastRunResult = { articleFound: true, error: "catalog_unavailable" };
      return lastRunResult;
    }

    var categoryPriority = computeCategoryPriority(catalog);
    var categoryCounts = {};
    var totalMatches = 0;
    var totalConfidenceWeight = 0;
    var wordCount = 0;

    article.paragraphs.forEach(function (p) {
      var text = p.textContent;
      wordCount += text.split(/\s+/).filter(Boolean).length;

      var raw = PatternMatcher.findMatches(text, catalog.patterns, categoryPriority);
      var resolved = ConflictResolver.resolve(raw);
      if (!resolved.length) return;
      Highlighter.renderHighlights(p, text, resolved);
      resolved.forEach(function (m) {
        categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
        totalMatches++;
        totalConfidenceWeight += m.confidenceWeight || 0;
      });
    });

    var elapsed = performance.now() - startedAt;
    if (elapsed > PERF_BUDGET_MS) {
      console.warn(
        "[bias-aware] pipeline took " + elapsed.toFixed(0) + "ms (budget " + PERF_BUDGET_MS + "ms) on " + location.href
      );
    }

    // Bias Index: a transparent, documented aggregate (NOT an opaque score -
    // it's fully derived from the same per-match confidenceWeight values
    // shown in each highlight's tooltip). Defined as the sum of matched
    // rules' confidence weights, normalized to "per 1,000 words" of
    // analyzed article text so a short article with a couple of loaded
    // phrases doesn't score the same as a long, mostly-neutral one, then
    // capped at 100. This is a deliberately simple, auditable formula for
    // a thesis prototype - not a validated bias metric.
    var biasIndex = wordCount > 0
      ? Math.min(100, Math.round((totalConfidenceWeight / wordCount) * 1000))
      : 0;

    lastRunResult = {
      articleFound: true,
      title: article.title,
      matchCount: totalMatches,
      categoryCounts: categoryCounts,
      wordCount: wordCount,
      totalConfidenceWeight: totalConfidenceWeight,
      biasIndex: biasIndex,
      elapsedMs: Math.round(elapsed)
    };
    return lastRunResult;
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "GET_BIAS_SUMMARY") {
      sendResponse({ ok: true, result: lastRunResult });
      return false;
    }
    if (message.type === "TOGGLE_HIGHLIGHTS") {
      if (message.enabled) {
        run().then(function (result) {
          sendResponse({ ok: true, result: result });
        });
      } else {
        Highlighter.removeAllHighlights();
        lastRunResult = { articleFound: lastRunResult ? lastRunResult.articleFound : false, disabled: true };
        sendResponse({ ok: true, result: lastRunResult });
      }
      return true; // async sendResponse in the "enabled" branch
    }
    return false;
  });

  run();
})();
