/**
 * Background service worker.
 *
 *  - Serves the bundled pattern catalog to content scripts via message
 *    passing (kept out of web_accessible_resources so a web page cannot
 *    fetch it and fingerprint the extension).
 *  - Performs the ONE optional network call: a comparative-reporting lookup
 *    against NewsAPI, only when the user has saved their own API key.
 *
 * Privacy (FR-AVD-01 / NFR-PRIV-01): the request carries ONLY short topic
 * keywords. CompareUtils.sanitizeKeywords drops anything that looks like a
 * title or sentence, so article text, titles, highlights and reading history
 * cannot be sent even if a caller passes them by mistake.
 */

importScripts("../shared/compare-utils.js");

const NEWSAPI_TIMEOUT_MS = 1500;
const NEWSAPI_BASE = "https://newsapi.org/v2/everything";

let catalogCache = null;

async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(chrome.runtime.getURL("data/pattern-catalog.json"));
  catalogCache = await res.json();
  return catalogCache;
}

async function queryNewsApi(apiKey, query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEWSAPI_TIMEOUT_MS);
  try {
    const url =
      NEWSAPI_BASE +
      "?q=" + encodeURIComponent(query) +
      "&language=en&searchIn=title,description&sortBy=relevancy&pageSize=50";
    const res = await fetch(url, { signal: controller.signal, headers: { "X-Api-Key": apiKey } });

    if (res.status === 429) {
      console.warn("[bias-aware] comparative lookup rate-limited (429) by newsapi.org");
      return { ok: false, reason: "rate_limited" };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.warn("[bias-aware] comparative lookup failed: HTTP " + res.status + " from newsapi.org - " + bodyText.slice(0, 300));
      return { ok: false, reason: "http_error", status: res.status };
    }
    const data = await res.json();
    const articles = (data.articles || []).map((a) => ({
      title: a.title,
      source: a.source && a.source.name,
      url: a.url,
      publishedAt: a.publishedAt
    }));
    return { ok: true, articles };
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn("[bias-aware] comparative lookup timed out after " + NEWSAPI_TIMEOUT_MS + "ms");
      return { ok: false, reason: "timeout" };
    }
    console.warn("[bias-aware] comparative lookup network error:", err.message);
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleComparativeLookup(rawKeywords) {
  const keywords = CompareUtils.sanitizeKeywords(rawKeywords);
  if (!keywords.length) return { ok: false, reason: "no_keywords" };

  const { newsApiKey } = await chrome.storage.local.get({ newsApiKey: "" });
  if (!newsApiKey) return { ok: false, reason: "no_api_key" };

  const hasPermission = await chrome.permissions.contains({ origins: ["https://newsapi.org/*"] });
  if (!hasPermission) {
    console.warn("[bias-aware] comparative lookup blocked: newsapi.org host permission not granted");
    return { ok: false, reason: "no_permission" };
  }

  let used = Math.min(3, keywords.length);
  let result = await queryNewsApi(newsApiKey, CompareUtils.buildQuery(keywords, used));
  // Three ANDed keywords can be too narrow: retry once with the two strongest.
  if (result.ok && !result.articles.length && used > 2) {
    used = 2;
    result = await queryNewsApi(newsApiKey, CompareUtils.buildQuery(keywords, used));
  }
  if (result.ok) result.keywords = keywords.slice(0, used);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PATTERN_CATALOG") {
    loadCatalog()
      .then((catalog) => sendResponse({ ok: true, catalog }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "COMPARATIVE_LOOKUP") {
    handleComparativeLookup(message.keywords).then(sendResponse);
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ highlightsEnabled: true }, (settings) => {
    if (settings.highlightsEnabled === undefined) {
      chrome.storage.local.set({ highlightsEnabled: true });
    }
  });
});
