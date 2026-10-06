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

  var normalizeWhitespace = ArticleMatcher.normalizeWhitespace;
  var textBelongsToArticle = ArticleMatcher.textBelongsToArticle;

  // Readability turns <div>s that hold plain text into paragraphs, so on many sites (news
  // aggregators, React-built pages) the article text is NOT in <p> tags. Treat any block element
  // that contains no other block as a candidate "paragraph"; textBelongsToArticle then keeps only
  // the ones that actually match Readability's article text.
  var BLOCK_SELECTOR = "p,div,li,ul,ol,blockquote,section,article,header,footer,table,h1,h2,h3,h4,h5,h6,pre,figure,aside,nav,form";

  function collectTextBlocks() {
    var blocks = [];
    var all = document.querySelectorAll("p,li,blockquote,div,section,td,dd");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.textContent.length < 40) continue;
      if (el.querySelector(BLOCK_SELECTOR)) continue;
      blocks.push(el);
    }
    return blocks;
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
    if (typeof Readability !== "function") return { reason: "readability_unavailable", paragraphs: [] };

    var clone = document.cloneNode(true);
    var reader = new Readability(clone, { charThreshold: 200 });
    var parsed;
    try {
      parsed = reader.parse();
    } catch (e) {
      console.warn("[bias-aware] Readability threw on " + location.href + ": " + e.message);
      return { reason: "readability_error", paragraphs: [] };
    }
    if (!parsed || !parsed.textContent || parsed.textContent.trim().length < 200) {
      return { reason: "no_article", paragraphs: [] };
    }

    var cleanedArticleText = normalizeWhitespace(parsed.textContent);
    var liveParagraphs = collectTextBlocks();

    var articleParagraphs = liveParagraphs.filter(function (p) {
      var t = normalizeWhitespace(p.textContent);
      if (t.length < 40) return false; // skip captions/bylines/trivial fragments
      return textBelongsToArticle(t, cleanedArticleText);
    });

    if (!articleParagraphs.length) {
      console.warn(
        "[bias-aware] Readability found " + cleanedArticleText.length +
          " chars of article text on " + location.href +
          ", but none of the " + liveParagraphs.length +
          " live text blocks matched it - live-DOM paragraph matching failed, not just a narrow catalog."
      );
      return { reason: "no_matching_paragraphs", title: parsed.title, paragraphs: [] };
    }

    return {
      title: parsed.title,
      byline: parsed.byline,
      paragraphs: articleParagraphs
    };
  }

  // Kept in memory for the popup's keyword lookup and the detection export (FR-DET-04 audit log).
  var lastArticle = null;
  var auditLog = null;
  var keywordsCache = null;

  async function run() {
    var startedAt = performance.now();
    keywordsCache = null;

    var settings = await getSettings();
    if (!settings.highlightsEnabled) {
      lastRunResult = { articleFound: false, disabled: true };
      return lastRunResult;
    }

    var article = extractArticle();
    if (!article.paragraphs.length) {
      lastRunResult = { articleFound: false, reason: article.reason || "no_article" };
      return lastRunResult;
    }
    lastArticle = article;

    var catalog;
    try {
      catalog = await requestPatternCatalog();
    } catch (e) {
      console.warn("[bias-aware] pattern catalog unavailable:", e.message);
      lastRunResult = { articleFound: true, error: "catalog_unavailable" };
      return lastRunResult;
    }

    // A script from one version reading a catalog from another (e.g. the extension was reloaded
    // but this tab was not refreshed) must fail visibly, not crash.
    if (!catalog || !Array.isArray(catalog.patterns) || !catalog.techniques) {
      console.warn("[bias-aware] pattern catalog has an unexpected format; reload the extension and refresh this tab.");
      lastRunResult = { articleFound: true, error: "catalog_schema" };
      return lastRunResult;
    }

    var techniqueCounts = {};
    var totalMatches = 0;
    var wordCount = 0;
    var errorCount = 0;
    auditLog = {
      url: location.href,
      title: article.title,
      catalogVersion: catalog.catalogVersion,
      paragraphs: [],
      detections: [],
      suppressed: []
    };

    article.paragraphs.forEach(function (p, paragraphIndex) {
      var text = p.textContent;
      auditLog.paragraphs.push(text);
      wordCount += text.split(/\s+/).filter(Boolean).length;

      // One malformed paragraph must not abort the scan of the rest of the article.
      try {
        var candidates = PatternMatcher.findMatches(text, catalog.patterns, catalog.techniques);
        var resolved = ConflictResolver.resolveWithAudit(candidates);
        resolved.suppressed.forEach(function (m) {
          auditLog.suppressed.push(Object.assign({ paragraphIndex: paragraphIndex }, m));
        });
        if (!resolved.active.length) return;
        Highlighter.renderHighlights(p, text, resolved.active);
        resolved.active.forEach(function (m) {
          techniqueCounts[m.category] = (techniqueCounts[m.category] || 0) + 1;
          totalMatches++;
          auditLog.detections.push(Object.assign({ paragraphIndex: paragraphIndex }, m));
        });
      } catch (e) {
        errorCount++;
        console.warn("[bias-aware] skipped a paragraph on " + location.href + ": " + e.message);
      }
    });

    var elapsed = performance.now() - startedAt;
    if (elapsed > PERF_BUDGET_MS) {
      console.warn(
        "[bias-aware] pipeline took " + elapsed.toFixed(0) + "ms (budget " + PERF_BUDGET_MS + "ms) on " + location.href
      );
    }

    // FR-DET-05: report the number of flagged spans and the number per technique only.
    // No article-level score, percentage or density, and no biased/unbiased verdict.
    lastRunResult = {
      articleFound: true,
      title: article.title,
      matchCount: totalMatches,
      categoryCounts: techniqueCounts,
      techniqueCount: Object.keys(techniqueCounts).length,
      paragraphCount: article.paragraphs.length,
      errorCount: errorCount,
      ruleCount: catalog.patterns.length,
      wordCount: wordCount,
      suppressedCount: auditLog.suppressed.length,
      elapsedMs: Math.round(elapsed)
    };
    return lastRunResult;
  }

  // Publication date, read locally from page metadata (or a /YYYY/MM/DD/ URL). It is never sent anywhere:
  // the popup only uses it to tell the reader whether NewsAPI's free plan can still have the story.
  function getPublishedAt() {
    var selectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="date"]',
      'meta[name="pubdate"]',
      'meta[itemprop="datePublished"]',
      'meta[property="og:article:published_time"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var m = document.querySelector(selectors[i]);
      var t = m && Date.parse(m.getAttribute("content"));
      if (t) return new Date(t).toISOString();
    }
    var timeEl = document.querySelector("time[datetime]");
    var tt = timeEl && Date.parse(timeEl.getAttribute("datetime"));
    if (tt) return new Date(tt).toISOString();
    var u = /\/(20\d\d)\/(\d\d?)\/(\d\d?)(?:\/|$)/.exec(location.pathname);
    if (u) return new Date(Date.UTC(+u[1], +u[2] - 1, +u[3])).toISOString();
    return null;
  }

  // Topic keywords for comparative reporting (FR-AVD-01). Computed on demand so the
  // detection pipeline stays fast, and only these keywords ever leave the page.
  function getKeywords() {
    if (!lastArticle) return [];
    if (!keywordsCache) {
      var body = lastArticle.paragraphs
        .map(function (p) {
          return p.textContent;
        })
        .join(" ");
      keywordsCache = KeywordExtractor.extract(lastArticle.title, body, 4);
    }
    return keywordsCache;
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "GET_BIAS_SUMMARY") {
      sendResponse({ ok: true, result: lastRunResult });
      return false;
    }
    if (message.type === "GET_KEYWORDS") {
      sendResponse({ ok: true, keywords: getKeywords(), title: lastArticle && lastArticle.title, publishedAt: getPublishedAt() });
      return false;
    }
    if (message.type === "GET_AUDIT_LOG") {
      sendResponse({ ok: !!auditLog, log: auditLog });
      return false;
    }
    if (message.type === "TOGGLE_HIGHLIGHTS") {
      if (message.enabled) {
        run().then(
          function (result) {
            sendResponse({ ok: true, result: result });
          },
          function (e) {
            console.warn("[bias-aware] scan failed on " + location.href + ": " + (e && e.message));
            lastRunResult = { articleFound: true, error: "internal_error" };
            sendResponse({ ok: true, result: lastRunResult });
          }
        );
      } else {
        Highlighter.removeAllHighlights();
        lastRunResult = { articleFound: lastRunResult ? lastRunResult.articleFound : false, disabled: true };
        sendResponse({ ok: true, result: lastRunResult });
      }
      return true; // async sendResponse in the "enabled" branch
    }
    return false;
  });

  run().catch(function (e) {
    console.warn("[bias-aware] scan failed on " + location.href + ": " + (e && e.message));
    lastRunResult = { articleFound: true, error: "internal_error" };
  });
})();
