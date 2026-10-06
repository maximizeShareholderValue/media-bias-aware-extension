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
 * keywords (plus a list of public outlet domains to search within or skip).
 * CompareUtils.sanitizeKeywords drops anything that looks like a title or
 * sentence, so article text, titles, highlights and reading history cannot be
 * sent even if a caller passes them by mistake.
 *
 * Lookup strategy: up to three queries, each looser than the last
 * (CompareUtils.buildAttempts), stopping as soon as enough rated articles are
 * found. Results are cached for 30 minutes so reopening the tab does not spend
 * the free plan's 100-requests-a-day quota.
 */

importScripts("../shared/compare-utils.js");

const NEWSAPI_TIMEOUT_MS = 1500;
const NEWSAPI_BASE = "https://newsapi.org/v2/everything";
const CACHE_TTL_MS = 30 * 60 * 1000;

let catalogCache = null;
let outletsCache = null;

async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch(chrome.runtime.getURL("data/pattern-catalog.json"));
  catalogCache = await res.json();
  return catalogCache;
}

async function loadOutlets() {
  if (outletsCache) return outletsCache;
  const res = await fetch(chrome.runtime.getURL("data/outlet-metadata.json"));
  outletsCache = (await res.json()).outlets || [];
  return outletsCache;
}

async function queryNewsApi(apiKey, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEWSAPI_TIMEOUT_MS);
  try {
    let url = NEWSAPI_BASE + "?q=" + encodeURIComponent(params.query) + "&language=en&sortBy=relevancy&pageSize=100";
    if (params.searchIn) url += "&searchIn=" + params.searchIn;
    if (params.domains && params.domains.length) url += "&domains=" + params.domains.join(",");
    if (params.excludeDomains && params.excludeDomains.length) url += "&excludeDomains=" + params.excludeDomains.join(",");
    const res = await fetch(url, { signal: controller.signal, headers: { "X-Api-Key": apiKey } });

    if (res.status === 429) {
      console.warn("[bias-aware] comparative lookup rate-limited (429) by newsapi.org");
      return { ok: false, reason: "rate_limited" };
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.warn("[bias-aware] comparative lookup failed: HTTP " + res.status + " from newsapi.org - " + bodyText.slice(0, 300));
      return { ok: false, reason: res.status === 401 ? "bad_api_key" : "http_error", status: res.status };
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

function cacheKey(attempts, currentDomain) {
  return "cmp:" + (currentDomain || "") + ":" + attempts.map((a) => a.query).join("|");
}

async function readCache(key) {
  try {
    if (!chrome.storage.session) return null;
    const entry = (await chrome.storage.session.get(key))[key];
    return entry && Date.now() - entry.at < CACHE_TTL_MS ? entry.response : null;
  } catch (e) {
    return null;
  }
}

async function writeCache(key, response) {
  try {
    if (chrome.storage.session) await chrome.storage.session.set({ [key]: { at: Date.now(), response } });
  } catch (e) {
    /* cache is best-effort */
  }
}

async function handleComparativeLookup(rawKeywords, rawCurrentDomain) {
  const keywords = CompareUtils.sanitizeKeywords(rawKeywords);
  if (!keywords.length) return { ok: false, reason: "no_keywords" };

  const { newsApiKey } = await chrome.storage.local.get({ newsApiKey: "" });
  if (!newsApiKey) return { ok: false, reason: "no_api_key" };

  const hasPermission = await chrome.permissions.contains({ origins: ["https://newsapi.org/*"] });
  if (!hasPermission) {
    console.warn("[bias-aware] comparative lookup blocked: newsapi.org host permission not granted");
    return { ok: false, reason: "no_permission" };
  }

  const currentDomain = /^[a-z0-9.-]{3,80}$/i.test(rawCurrentDomain || "") ? rawCurrentDomain.toLowerCase() : null;
  const attempts = CompareUtils.buildAttempts(keywords);
  const key = cacheKey(attempts, currentDomain);
  const cached = await readCache(key);
  if (cached) return Object.assign({}, cached, { cached: true });

  const outlets = await loadOutlets();
  const priority = CompareUtils.PRIORITY_DOMAINS.filter((d) => !currentDomain || !CompareUtils.hostnameMatchesDomain(currentDomain, d));
  const merged = [];
  const seen = {};
  const tried = [];
  let usable = 0;
  let failure = null;
  let usedKeywords = attempts[0].keywords;

  for (const attempt of attempts) {
    const result = await queryNewsApi(newsApiKey, {
      query: attempt.query,
      searchIn: attempt.searchIn,
      domains: attempt.scope === "priority" ? priority : null,
      excludeDomains: attempt.scope === "any" && currentDomain ? [currentDomain] : null
    });
    if (!result.ok) {
      failure = result;
      tried.push({ id: attempt.id, failed: result.reason });
      break; // a rate limit, bad key or timeout will not improve with a looser query
    }
    result.articles.forEach((a) => {
      if (a.url && !seen[a.url]) {
        seen[a.url] = true;
        merged.push(a);
      }
    });
    const grouped = CompareUtils.groupByIdeology(merged, outlets, currentDomain);
    usable = grouped.groups.Left.length + grouped.groups.Center.length + grouped.groups.Right.length;
    tried.push({ id: attempt.id, found: result.articles.length, usable: usable });
    usedKeywords = attempt.keywords;
    if (usable >= CompareUtils.ENOUGH_RESULTS) break;
  }

  if (failure && !merged.length) return failure;
  const response = { ok: true, articles: merged, keywords: usedKeywords, tried: tried };
  await writeCache(key, response);
  return response;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PATTERN_CATALOG") {
    loadCatalog()
      .then((catalog) => sendResponse({ ok: true, catalog }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "COMPARATIVE_LOOKUP") {
    handleComparativeLookup(message.keywords, message.currentDomain)
      .then(sendResponse)
      .catch((err) => {
        console.warn("[bias-aware] comparative lookup crashed:", err && err.message);
        sendResponse({ ok: false, reason: "internal_error" });
      });
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
