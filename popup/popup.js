(function () {
  "use strict";

  // --- Constants / lookup tables ---------------------------------------

  // 14 SemEval-2020 Task 11 techniques; shared with the in-page tooltip (content/category-meta.js).
  var CATEGORY_META = CategoryMeta;

  // Discrete ideology label -> position (0-100) along the Left/Right slider.
  // "Extreme Left"/"Extreme Right" were added alongside the full MBFC
  // dataset, which distinguishes fringe outlets from mainstream Left/Right
  // ones - the existing 5 values keep their original positions so every
  // pre-existing entry's slider placement is unchanged.
  var IDEOLOGY_TO_PERCENT = {
    "Extreme Left": 0,
    Left: 10,
    "Center-Left": 30,
    Center: 50,
    "Center-Right": 70,
    Right: 90,
    "Extreme Right": 100
  };

  // --- DOM refs -----------------------------------------------------------

  var statusPill = document.getElementById("statusPill");
  var statPhrases = document.getElementById("statPhrases");
  var statTechniques = document.getElementById("statTechniques");

  var highlightsToggle = document.getElementById("highlightsToggle");

  var leaningKnob = document.getElementById("leaningKnob");
  var categoryLegend = document.getElementById("categoryLegend");
  var analysisNoteText = document.getElementById("analysisNoteText");

  var sourceContent = document.getElementById("sourceContent");
  var compareSubtitle = document.getElementById("compareSubtitle");
  var compareContent = document.getElementById("compareContent");

  var settingsToggle = document.getElementById("settingsToggle");
  var mainView = document.getElementById("mainView");
  var settingsView = document.getElementById("settingsView");
  var backBtn = document.getElementById("backBtn");
  var apiKeyInput = document.getElementById("apiKeyInput");
  var saveKeyBtn = document.getElementById("saveKeyBtn");
  var clearKeyBtn = document.getElementById("clearKeyBtn");
  var keyStatus = document.getElementById("keyStatus");

  var methodologyToggle = document.getElementById("methodologyToggle");
  var techniquesLink = document.getElementById("techniquesLink");

  var activeTab = null;
  var lastArticleTitle = null;
  var currentOutlet = null;
  var outletsCache = null;
  var compareState = { loaded: false, loading: false };

  // --- Helpers --------------------------------------------------------------

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function registrableDomain(hostname) {
    return hostname.replace(/^www\./, "").toLowerCase();
  }

  function getActiveTab() {
    return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
  }

  function loadOutlets() {
    if (outletsCache) return outletsCache;
    outletsCache = fetch("../data/outlet-metadata.json")
      .then((res) => res.json())
      .then((data) => data.outlets)
      .catch(() => []);
    return outletsCache;
  }

  // CompareUtils.findOutlet matches "hostname IS or ENDS WITH a known domain" (so
  // "news.abs-cbn.com" matches "abs-cbn.com") and prefers the longest matching domain.
  function findOutletByUrl(url) {
    if (!url || !/^https?:/.test(url)) return Promise.resolve(null);
    return loadOutlets().then((outlets) => CompareUtils.findOutlet(outlets, url));
  }

  // --- Status pill + stats -------------------------------------------------

  function renderStatusPill(state) {
    statusPill.className = "pill " + (state === "active" ? "pill--active" : "pill--muted");
    statusPill.textContent = state === "active" ? "Active" : state === "paused" ? "Paused" : state === "no-article" ? "No Article" : "Loading…";
  }

  // FR-DET-05: only the number of flagged spans and how many techniques they cover.
  function renderStats(result) {
    var found = result && result.articleFound && !result.error;
    statPhrases.textContent = found ? String(result.matchCount || 0) : "-";
    statTechniques.textContent = found ? String(result.techniqueCount || 0) : "-";
  }

  // --- Overview tab ---------------------------------------------------------

  function renderPoliticalLeaning(outlet) {
    var pct = outlet && IDEOLOGY_TO_PERCENT[outlet.ideology] != null ? IDEOLOGY_TO_PERCENT[outlet.ideology] : 50;
    leaningKnob.style.left = pct + "%";
  }

  function renderCategoryLegend(categoryCounts) {
    categoryLegend.innerHTML = "";
    // Only list techniques actually found: with 14 categories, showing all of them would be mostly zeros.
    var found = Object.keys(CATEGORY_META).filter((cat) => categoryCounts && categoryCounts[cat] > 0);
    if (!found.length) {
      var none = document.createElement("li");
      none.className = "legend__none";
      none.textContent = "None detected";
      categoryLegend.appendChild(none);
      return;
    }
    found.forEach((cat) => {
      var meta = CATEGORY_META[cat];
      var li = document.createElement("li");
      var swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = meta.color;
      li.appendChild(swatch);
      var more = document.createElement("a");
      more.href = "../about/about.html#" + cat;
      more.textContent = meta.label + " (" + categoryCounts[cat] + ")";
      more.title = "What does " + meta.label + " mean?";
      more.addEventListener("click", (e) => {
        e.preventDefault();
        openAbout(cat);
      });
      li.appendChild(more);
      categoryLegend.appendChild(li);
    });
  }

  function renderAnalysisNote(result) {
    if (result && result.disabled) {
      analysisNoteText.textContent = "Highlighting is turned off for this page.";
      return;
    }
    if (!result) {
      analysisNoteText.textContent = "This page hasn't finished scanning yet. Close and reopen this popup in a moment.";
      return;
    }
    if (!result.articleFound) {
      analysisNoteText.textContent = result.reason === "no_matching_paragraphs"
        ? "An article was found, but its paragraphs couldn't be matched on the page, so nothing was scanned."
        : "No news article text detected. This works on a single article page, not a homepage or search results.";
      return;
    }
    if (result.error) {
      analysisNoteText.textContent = result.error === "catalog_unavailable"
        ? "Bias detection unavailable (pattern catalog failed to load). Try reloading the extension."
        : "The scanner and its rule catalog are out of sync or hit an error. Reload the extension, then refresh this tab (F5).";
      return;
    }
    if (!result.matchCount) {
      analysisNoteText.textContent =
        "Scanned " + (result.paragraphCount || 0) + " paragraphs (" + (result.wordCount || 0) + " words) against " +
        (result.ruleCount || 0) + " rules: no flagged phrases found. That is a normal result for a neutrally written article.";
      return;
    }
    analysisNoteText.textContent =
      result.matchCount + " potential bias indicator" + (result.matchCount === 1 ? "" : "s") +
      " detected. Hover over highlighted text in the article for details.";
  }

  function requestBiasSummary(tab) {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "GET_BIAS_SUMMARY" }, (response) => {
      if (chrome.runtime.lastError) {
        // Most common cause: the tab was already open when the extension was installed/reloaded,
        // so it has no content script until refreshed. Also happens on chrome:// and store pages.
        renderCategoryLegend(null);
        analysisNoteText.textContent =
          "Can't reach the page scanner. Refresh this tab (F5) - pages that were already open when the extension was installed or reloaded aren't scanned until refreshed. Browser-internal pages can't be scanned at all.";
        renderStats(null);
        renderStatusPill("no-article");
        return;
      }
      var result = response && response.result;
      if (result && result.title) lastArticleTitle = result.title;
      renderStats(result);
      renderCategoryLegend(result && result.categoryCounts);
      renderAnalysisNote(result);
      renderStatusPill(!result || !result.articleFound ? "no-article" : result.disabled ? "paused" : "active");
    });
  }

  // --- Highlight toggle -----------------------------------------------------

  function setToggleUi(enabled) {
    highlightsToggle.setAttribute("aria-checked", String(enabled));
  }

  function initHighlightToggle(tab) {
    chrome.storage.local.get({ highlightsEnabled: true }, (settings) => {
      setToggleUi(settings.highlightsEnabled);
    });

    highlightsToggle.addEventListener("click", () => {
      var enabled = highlightsToggle.getAttribute("aria-checked") !== "true";
      setToggleUi(enabled);
      chrome.storage.local.set({ highlightsEnabled: enabled });
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_HIGHLIGHTS", enabled }, (response) => {
        if (chrome.runtime.lastError) return;
        var result = response && response.result;
        renderStats(result);
        renderCategoryLegend(result && result.categoryCounts);
        renderAnalysisNote(result);
        renderStatusPill(!result || !result.articleFound ? "no-article" : result.disabled ? "paused" : "active");
      });
    });
  }

  // --- Source tab -------------------------------------------------------

  var ICON_BUILDING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="7" x2="9" y2="7"/><line x1="15" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="9" y2="17"/><line x1="15" y1="17" x2="15" y2="17"/></svg>';
  var ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var ICON_GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
  var ICON_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  var ICON_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  var ICON_SCALE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="M5 7h14"/><path d="M5 7l-3 7a3 3 0 0 0 6 0z"/><path d="M19 7l-3 7a3 3 0 0 0 6 0z"/></svg>';
  var ICON_NEWS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z"/><line x1="8" y1="9" x2="15" y2="9"/><line x1="8" y1="13" x2="15" y2="13"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  function infoItem(iconSvg, label, value) {
    var div = document.createElement("div");
    div.className = "info-item";
    div.innerHTML =
      '<span class="icon">' + iconSvg + "</span>" +
      '<span><span class="info-item__label">' + escapeHtml(label) + '</span>' +
      '<span class="info-item__value">' + escapeHtml(value) + "</span></span>";
    return div;
  }

  function openInNewTab(url) {
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: url });
    else window.open(url, "_blank", "noopener");
  }

  // Ownership is only claimed when we have it (curated list); otherwise say so and send the reader to the MBFC review.
  function ownershipKnown(outlet) {
    return !!outlet.ownershipType && outlet.ownershipType !== "Unknown";
  }

  function renderSourceTab(outlet, domain) {
    sourceContent.innerHTML = "";

    if (!outlet) {
      var p = document.createElement("p");
      p.className = "card__loading";
      p.textContent = domain
        ? "No transparency data yet for " + domain + "."
        : "Open a news article to see outlet information.";
      sourceContent.appendChild(p);
      return;
    }

    var name = document.createElement("p");
    name.className = "outlet-name";
    name.textContent = outlet.name;
    sourceContent.appendChild(name);

    var known = ownershipKnown(outlet);
    var badge = document.createElement("span");
    badge.className = "ownership-badge" + (known ? "" : " ownership-badge--unknown");
    badge.textContent = known ? outlet.ownershipType : "Ownership not recorded";
    sourceContent.appendChild(badge);

    var grid = document.createElement("div");
    grid.className = "info-grid";
    if (outlet.parentCompany) grid.appendChild(infoItem(ICON_BUILDING, "Parent Company", outlet.parentCompany));
    grid.appendChild(infoItem(ICON_SCALE, "Political Leaning", outlet.ideology || "Not rated"));
    if (outlet.mediaType) grid.appendChild(infoItem(ICON_NEWS, "Media Type", outlet.mediaType));
    if (outlet.country) grid.appendChild(infoItem(ICON_GLOBE, "Country", outlet.country));
    if (outlet.headquarters) grid.appendChild(infoItem(ICON_GLOBE, "Headquarters", outlet.headquarters));
    if (outlet.founded) grid.appendChild(infoItem(ICON_CALENDAR, "Founded", String(outlet.founded)));
    if (outlet.monthlyReaders) grid.appendChild(infoItem(ICON_USERS, "Monthly Readers", outlet.monthlyReaders));
    grid.appendChild(infoItem(ICON_LINK, "Website", outlet.domain));
    sourceContent.appendChild(grid);

    var detail = document.createElement("p");
    detail.className = "ownership-detail";
    detail.textContent =
      outlet.ownershipDetail ||
      (known ? "No further ownership details are recorded for this outlet. " : "We don't have ownership details for this outlet yet. ") +
      "The Media Bias/Fact Check review below usually lists who owns and funds it.";
    sourceContent.appendChild(detail);

    var note = document.createElement("p");
    note.className = "source-note";
    note.textContent = "Leaning rating: Media Bias/Fact Check" + (outlet.ownershipSource ? ". Ownership: curated by the research team." : ".");
    sourceContent.appendChild(note);

    // Outlets without an MBFC review page in the dataset fall back to an MBFC search for the outlet name.
    var reviewUrl = outlet.mbfcUrl || "https://mediabiasfactcheck.com/?s=" + encodeURIComponent(outlet.name);
    var link = document.createElement("a");
    link.className = "expand-button";
    link.href = reviewUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = "<span>Learn about ownership</span>" + ICON_EXTERNAL;
    link.title = (outlet.mbfcUrl ? "Opens the Media Bias/Fact Check review of " : "Searches Media Bias/Fact Check for ") + outlet.name + " in a new tab";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openInNewTab(reviewUrl);
    });
    sourceContent.appendChild(link);
  }

  function miniLeaningSlider(outlet) {
    var wrap = document.createElement("div");
    wrap.className = "slider-track slider-track--leaning compare-card__slider";
    var knob = document.createElement("span");
    knob.className = "slider-knob";
    var pct = outlet && IDEOLOGY_TO_PERCENT[outlet.ideology] != null ? IDEOLOGY_TO_PERCENT[outlet.ideology] : 50;
    knob.style.left = pct + "%";
    if (!outlet) knob.style.opacity = "0.4";
    wrap.appendChild(knob);
    return wrap;
  }

  function renderCompareCard(article, outlet) {
    var card = document.createElement("div");
    card.className = "compare-card";

    var head = document.createElement("div");
    head.className = "compare-card__head";
    var source = document.createElement("span");
    source.className = "compare-card__source";
    source.textContent = article.source || (outlet && outlet.name) || "Unknown source";
    head.appendChild(source);

    if (article.url) {
      var link = document.createElement("a");
      link.className = "compare-card__link";
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", "Open article in a new tab");
      link.innerHTML = ICON_EXTERNAL;
      head.appendChild(link);
    }
    card.appendChild(head);

    var title = document.createElement("a");
    title.className = "compare-card__title";
    title.textContent = article.title || "(untitled)";
    title.href = article.url || "#";
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    card.appendChild(title);

    card.appendChild(miniLeaningSlider(outlet));
    if (!outlet) {
      var unknown = document.createElement("p");
      unknown.className = "compare-card__unknown";
      unknown.textContent = "Leaning unknown (outlet not in local dataset)";
      card.appendChild(unknown);
    }

    return card;
  }

  function showComparePrompt(message, showSettingsBtn) {
    compareContent.innerHTML = "";
    var p = document.createElement("p");
    p.className = "hint";
    p.textContent = message;
    compareContent.appendChild(p);
    if (showSettingsBtn) {
      var btn = document.createElement("button");
      btn.className = "button";
      btn.textContent = "Open Settings";
      btn.addEventListener("click", () => showSettings(true));
      compareContent.appendChild(btn);
    }
  }

  // "Comparative Data Unavailable" (thesis wording) plus the reason, so the reader knows whether to wait or fix something.
  function unavailableMessage(reason) {
    var why = {
      timeout: "NewsAPI did not answer within 1.5 seconds. Switch tabs and back to retry.",
      rate_limited: "NewsAPI's daily limit (100 requests on the free plan) has been reached. Try again tomorrow.",
      bad_api_key: "NewsAPI rejected the saved API key. Check it in Settings.",
      no_api_key: "Add a NewsAPI key in Settings to enable comparison.",
      no_permission: "Permission to contact newsapi.org was not granted. Save your key again in Settings and allow it.",
      network_error: "Could not reach newsapi.org. Check your connection and retry.",
      no_keywords: "Couldn't read this page's topic."
    }[reason];
    return "Comparative Data Unavailable" + (why ? ". " + why : ".");
  }

  function currentDomain() {
    if (currentOutlet) return currentOutlet.domain;
    return activeTab && activeTab.url && /^https?:/.test(activeTab.url) ? registrableDomain(new URL(activeTab.url).hostname) : null;
  }

  function requestKeywords() {
    return new Promise((resolve) => {
      if (!activeTab) return resolve({ keywords: [], publishedAt: null });
      chrome.tabs.sendMessage(activeTab.id, { type: "GET_KEYWORDS" }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return resolve({ keywords: [], publishedAt: null });
        resolve({ keywords: CompareUtils.sanitizeKeywords(resp.keywords), publishedAt: resp.publishedAt || null });
      });
    });
  }

  var BUCKETS = ["Left", "Center", "Right"];
  var POPUP_PER_BUCKET = 2;

  function openSplitScreen(data) {
    var area = chrome.storage.session || chrome.storage.local;
    area.set({ compareData: data }, () => chrome.tabs.create({ url: chrome.runtime.getURL("compare/compare.html") }));
  }

  function renderGroupedCompare(grouped, outlets, keywords, response, win) {
    var total = BUCKETS.reduce((n, b) => n + grouped.groups[b].length, 0);
    compareContent.innerHTML = "";
    if (!total) {
      var found = (response && response.articles ? response.articles.length : 0);
      var searches = (response && response.tried ? response.tried.length : 1);
      var why = win && win.status === "too_new"
        ? " This story was published less than a day ago, and NewsAPI's free plan holds articles back for about 24 hours. Try again tomorrow."
        : " Few outlets may have covered this exact topic, or the search words were too specific.";
      showComparePrompt(
        "No coverage from rated outlets was found for “" + keywords.join(" + ") + "”. " +
          "NewsAPI returned " + found + " article" + (found === 1 ? "" : "s") + " across " + searches + " search" + (searches === 1 ? "" : "es") +
          (grouped.unrated ? ", " + grouped.unrated + " from outlets we have no rating for" : "") + "." + why,
        false
      );
      return;
    }

    BUCKETS.forEach((bucket) => {
      var items = grouped.groups[bucket];
      var section = document.createElement("section");
      section.className = "compare-group";
      var heading = document.createElement("h3");
      heading.className = "compare-group__title";
      heading.textContent = bucket + " (" + items.length + ")";
      section.appendChild(heading);
      if (!items.length) {
        var empty = document.createElement("p");
        empty.className = "compare-group__empty";
        empty.textContent = "No " + bucket.toLowerCase() + "-rated coverage found.";
        section.appendChild(empty);
      }
      items.slice(0, POPUP_PER_BUCKET).forEach((article) => {
        section.appendChild(renderCompareCard(article, CompareUtils.findOutlet(outlets, article.url)));
      });
      compareContent.appendChild(section);
    });

    var btn = document.createElement("button");
    btn.className = "button";
    btn.textContent = "Open split-screen view";
    btn.addEventListener("click", () =>
      openSplitScreen({
        keywords: keywords,
        current: currentOutlet ? { name: currentOutlet.name, domain: currentOutlet.domain, ideology: currentOutlet.ideology } : { domain: currentDomain() },
        groups: grouped.groups,
        unrated: grouped.unrated,
        sameOutlet: grouped.sameOutlet,
        fetchedAt: new Date().toISOString()
      })
    );
    compareContent.appendChild(btn);
  }

  function runComparativeLookup() {
    compareState.loading = true;
    requestKeywords().then((page) => {
      var keywords = page.keywords;
      if (!keywords.length) {
        compareState.loading = false;
        compareSubtitle.textContent = "Open a news article to compare coverage.";
        showComparePrompt("Couldn't read this page's topic. Open a news article (refresh it if the extension was just reloaded), then reopen this tab.", false);
        return;
      }
      compareSubtitle.textContent = "Searching by topic keywords only: " + keywords.slice(0, 3).join(", ") + ". Nothing else about this page is sent.";

      chrome.storage.local.get({ newsApiKey: "" }, (data) => {
        if (!data.newsApiKey) {
          compareState.loading = false;
          showComparePrompt("Add a NewsAPI key in Settings to enable cross-outlet comparison.", true);
          return;
        }
        var win = CompareUtils.searchWindow(page.publishedAt);
        if (win.status === "too_old" && !compareState.forceOld) {
          compareState.loading = false;
          showComparePrompt(
            "This article is about " + win.days + " days old. NewsAPI's free plan only searches roughly the last " + CompareUtils.MAX_AGE_DAYS +
              " days, so coverage of it can't be found. Open a more recent article to compare outlets.",
            false
          );
          var anyway = document.createElement("button");
          anyway.className = "button button--secondary";
          anyway.textContent = "Search anyway";
          anyway.addEventListener("click", () => {
            compareState.forceOld = true;
            runComparativeLookup();
          });
          compareContent.appendChild(anyway);
          return;
        }
        compareContent.innerHTML = '<p class="hint">Looking up comparative coverage…</p>';

        chrome.runtime.sendMessage({ type: "COMPARATIVE_LOOKUP", keywords, currentDomain: currentDomain() }, async (response) => {
          compareState.loading = false;
          if (!response || !response.ok) {
            compareState.loaded = false; // allow retry on next tab switch
            showComparePrompt(unavailableMessage(response && response.reason), response && (response.reason === "no_api_key" || response.reason === "bad_api_key" || response.reason === "no_permission"));
            return;
          }
          compareState.loaded = true;
          var outlets = await loadOutlets();
          renderGroupedCompare(CompareUtils.groupByIdeology(response.articles, outlets, currentDomain()), outlets, response.keywords || keywords, response, win);
        });
      });
    });
  }

  // --- Tabs -----------------------------------------------------------

  var TAB_NAMES = ["overview", "source", "compare"];

  function selectTab(name) {
    TAB_NAMES.forEach((t) => {
      var btn = document.getElementById("tabBtn-" + t);
      var panel = document.getElementById("tabPanel-" + t);
      var isActive = t === name;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    if (name === "compare" && !compareState.loaded && !compareState.loading) {
      runComparativeLookup();
    }
  }

  TAB_NAMES.forEach((t) => {
    document.getElementById("tabBtn-" + t).addEventListener("click", () => selectTab(t));
  });

  // --- Settings view -------------------------------------------------

  function showSettings(show) {
    mainView.hidden = show;
    settingsView.hidden = !show;
  }

  settingsToggle.addEventListener("click", () => showSettings(true));
  backBtn.addEventListener("click", () => showSettings(false));

  function refreshKeyStatus() {
    chrome.storage.local.get({ newsApiKey: "" }, (data) => {
      keyStatus.textContent = data.newsApiKey ? "A key is currently saved on this device." : "No key saved.";
    });
  }

  saveKeyBtn.addEventListener("click", async () => {
    var key = apiKeyInput.value.trim();
    if (!key) {
      keyStatus.textContent = "Enter a key before saving.";
      return;
    }
    var granted = await chrome.permissions.request({ origins: ["https://newsapi.org/*"] });
    if (!granted) {
      keyStatus.textContent = "Permission denied - key was not saved.";
      return;
    }
    await chrome.storage.local.set({ newsApiKey: key });
    apiKeyInput.value = "";
    keyStatus.textContent = "Key saved.";
    compareState.loaded = false; // let the next Compare tab visit use the new key
    refreshKeyStatus();
  });

  clearKeyBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove("newsApiKey");
    await chrome.permissions.remove({ origins: ["https://newsapi.org/*"] });
    compareState.loaded = false;
    keyStatus.textContent = "Key removed.";
    refreshKeyStatus();
  });

  // --- Export detections (evaluation support) --------------------------------

  var exportBtn = document.getElementById("exportBtn");
  var exportStatus = document.getElementById("exportStatus");

  exportBtn.addEventListener("click", () => {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, { type: "GET_AUDIT_LOG" }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        exportStatus.textContent = "Nothing to export: open an analyzed news article first (refresh it if the extension was just reloaded).";
        return;
      }
      var host = "page";
      try { host = new URL(activeTab.url).hostname.replace(/^www\./, ""); } catch (e) {}
      var blob = new Blob([JSON.stringify(Object.assign({ exportedAt: new Date().toISOString() }, resp.log), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "detections-" + host + "-" + Date.now() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      exportStatus.textContent = "Exported " + resp.log.detections.length + " detections (" + resp.log.suppressed.length + " suppressed overlaps).";
    });
  });

  // --- Methodology panel -----------------------------------------------

  function openAbout(hash) {
    openInNewTab(chrome.runtime.getURL("about/about.html") + (hash ? "#" + hash : ""));
  }
  methodologyToggle.addEventListener("click", () => openAbout("methodology"));
  techniquesLink.addEventListener("click", () => openAbout("techniques"));

  // --- Init -------------------------------------------------------------

  getActiveTab().then(async (tab) => {
    activeTab = tab;
    var domain = tab && tab.url && /^https?:/.test(tab.url) ? registrableDomain(new URL(tab.url).hostname) : null;

    currentOutlet = await findOutletByUrl(tab && tab.url);
    renderSourceTab(currentOutlet, domain);
    renderPoliticalLeaning(currentOutlet);
    renderStats(null);

    initHighlightToggle(tab);
    requestBiasSummary(tab);
    refreshKeyStatus();
  });
})();
