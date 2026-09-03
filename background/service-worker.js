/**
 * Background service worker.
 *
 * Responsibilities:
 *  - Serve the bundled pattern catalog to content scripts via message
 *    passing (kept out of web_accessible_resources so an arbitrary web
 *    page cannot fetch it directly and fingerprint the extension).
 *  - Perform the ONE optional network call in the whole extension: a
 *    comparative-reporting lookup against NewsAPI, and only when the user
 *    has supplied their own API key in the popup's settings view.
 *
 * No article text, page content, or browsing history is ever part of any
 * message this file sends over the network - only a short search query
 * (the article title) that the user's own click explicitly triggered.
 */

const NEWSAPI_TIMEOUT_MS = 1500;
const NEWSAPI_BASE = "https://newsapi.org/v2/everything";

let catalogCache = null;

async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const url = chrome.runtime.getURL("data/pattern-catalog.json");
  const res = await fetch(url);
  catalogCache = await res.json();
  return catalogCache;
}

async function handleComparativeLookup(query) {
  const { newsApiKey } = await chrome.storage.local.get({ newsApiKey: "" });
  if (!newsApiKey) {
    return { ok: false, reason: "no_api_key" };
  }

  const hasPermission = await chrome.permissions.contains({
    origins: ["https://newsapi.org/*"]
  });
  if (!hasPermission) {
    console.warn("[bias-aware] comparative lookup blocked: newsapi.org host permission not granted");
    return { ok: false, reason: "no_permission" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEWSAPI_TIMEOUT_MS);

  try {
    const url =
      NEWSAPI_BASE +
      "?q=" +
      encodeURIComponent(query) +
      "&pageSize=5&sortBy=relevancy";

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "X-Api-Key": newsApiKey }
    });

    if (res.status === 429) {
      console.warn("[bias-aware] comparative lookup rate-limited (429) by newsapi.org");
      return { ok: false, reason: "rate_limited" };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.warn(
        "[bias-aware] comparative lookup failed: HTTP " + res.status + " from newsapi.org - " + bodyText.slice(0, 300)
      );
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PATTERN_CATALOG") {
    loadCatalog()
      .then((catalog) => sendResponse({ ok: true, catalog }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }

  if (message.type === "COMPARATIVE_LOOKUP") {
    handleComparativeLookup(message.query || "").then(sendResponse);
    return true; // async
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
