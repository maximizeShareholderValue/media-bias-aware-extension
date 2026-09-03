(function () {
  "use strict";

  // --- Constants / lookup tables ---------------------------------------

  var CATEGORY_META = {
    LOADED_LANGUAGE: { label: "Loaded Language", color: "#7A3EA6" },
    EVALUATIVE_MODIFIER: { label: "Evaluative Modifier", color: "#B3265E" },
    SPECULATIVE_CONSTRUCTION: { label: "Speculative Construction", color: "#1B5FA8" },
    ATTRIBUTION_FRAMING: { label: "Attribution Framing", color: "#0E7C66" },
    PRESUPPOSITION: { label: "Presupposition Trigger", color: "#8A5A00" }
  };

  // Fixed, documented mapping from the bundled dataset's discrete
  // factualReliability tier to a percentage shown in the UI (see the
  // "Learn Methodology" panel for the same explanation shown to the user).
  // "Very Low" was added when the dataset grew to include the full MBFC
  // rating scale (previously only Very High..Low existed).
  var RELIABILITY_TIER_TO_PERCENT = {
    "Very High": 95,
    High: 80,
    "Mostly Factual": 65,
    Mixed: 45,
    Low: 20,
    "Very Low": 5
  };

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

  function reliabilityLevel(tier) {
    if (tier === "Very High" || tier === "High") return "success";
    if (tier === "Mostly Factual") return "warning";
    return "danger"; // Mixed / Low / Very Low
  }

  // --- DOM refs -----------------------------------------------------------

  var statusPill = document.getElementById("statusPill");
  var statPhrases = document.getElementById("statPhrases");
  var statBiasIndex = document.getElementById("statBiasIndex");
  var statReliability = document.getElementById("statReliability");

  var highlightsToggle = document.getElementById("highlightsToggle");

  var leaningKnob = document.getElementById("leaningKnob");
  var reliabilityKnob = document.getElementById("reliabilityKnob");
  var reliabilityBadge = document.getElementById("reliabilityBadge");
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
  var methodologyPanel = document.getElementById("methodologyPanel");

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

  // Matches on a "hostname IS or ENDS WITH the known domain" basis (e.g.
  // "news.abs-cbn.com" and "www.abs-cbn.com" both match a stored
  // "abs-cbn.com" entry) rather than an exact strip-www comparison, since
  // outlets commonly serve from subdomains other than "www." (e.g. ABS-CBN's
  // real site is "news.abs-cbn.com"). This isn't full eTLD+1 parsing (no
  // public-suffix-list handling for multi-part TLDs like .co.uk), but it's
  // safe here because we're matching against our OWN known domain strings,
  // not deriving a registrable domain from an arbitrary hostname.
  function hostnameMatchesDomain(hostname, domain) {
    var h = hostname.toLowerCase();
    var d = domain.toLowerCase();
    return h === d || h.endsWith("." + d);
  }

  function findOutletByUrl(url) {
    if (!url || !/^https?:/.test(url)) return Promise.resolve(null);
    var hostname = new URL(url).hostname;
    return loadOutlets().then((outlets) => outlets.find((o) => hostnameMatchesDomain(hostname, o.domain)) || null);
  }

  // --- Status pill + stats -------------------------------------------------

  function renderStatusPill(state) {
    statusPill.className = "pill " + (state === "active" ? "pill--active" : "pill--muted");
    statusPill.textContent = state === "active" ? "Active" : state === "paused" ? "Paused" : state === "no-article" ? "No Article" : "Loading…";
  }

  function renderStats(result, outlet) {
    statPhrases.textContent = result && result.articleFound ? String(result.matchCount || 0) : "–";

    if (result && result.articleFound && typeof result.biasIndex === "number") {
      statBiasIndex.textContent = (result.biasIndex > 0 ? "+" : "") + result.biasIndex;
    } else {
      statBiasIndex.textContent = "–";
    }

    statReliability.className = "stat__value";
    if (outlet && RELIABILITY_TIER_TO_PERCENT[outlet.factualReliability] != null) {
      var pct = RELIABILITY_TIER_TO_PERCENT[outlet.factualReliability];
      statReliability.textContent = pct + "%";
      statReliability.classList.add("stat__value--" + reliabilityLevel(outlet.factualReliability));
    } else {
      statReliability.textContent = "–";
    }
  }

  // --- Overview tab ---------------------------------------------------------

  function renderPoliticalLeaning(outlet) {
    var pct = outlet && IDEOLOGY_TO_PERCENT[outlet.ideology] != null ? IDEOLOGY_TO_PERCENT[outlet.ideology] : 50;
    leaningKnob.style.left = pct + "%";
  }

  function renderReliabilitySection(outlet) {
    var tier = outlet ? outlet.factualReliability : null;
    var pct = tier && RELIABILITY_TIER_TO_PERCENT[tier] != null ? RELIABILITY_TIER_TO_PERCENT[tier] : 50;
    reliabilityKnob.style.left = pct + "%";

    reliabilityBadge.className = "reliability-badge";
    if (tier) {
      reliabilityBadge.classList.add("reliability-badge--" + reliabilityLevel(tier));
      reliabilityBadge.textContent = tier;
    } else {
      reliabilityBadge.textContent = "Unknown";
    }
  }

  function renderCategoryLegend(categoryCounts) {
    categoryLegend.innerHTML = "";
    Object.keys(CATEGORY_META).forEach((cat) => {
      var meta = CATEGORY_META[cat];
      var count = (categoryCounts && categoryCounts[cat]) || 0;
      var li = document.createElement("li");
      var swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = meta.color;
      li.appendChild(swatch);
      li.appendChild(document.createTextNode(meta.label + (count ? " (" + count + ")" : "")));
      categoryLegend.appendChild(li);
    });
  }

  function renderAnalysisNote(result) {
    if (!result || !result.articleFound) {
      analysisNoteText.textContent = result && result.disabled
        ? "Highlighting is turned off for this page."
        : "No article detected on this page.";
      return;
    }
    if (result.error) {
      analysisNoteText.textContent = "Bias detection unavailable (pattern catalog failed to load).";
      return;
    }
    if (!result.matchCount) {
      analysisNoteText.textContent = "No flagged phrases found in this article.";
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
        renderAnalysisNote(null);
        analysisNoteText.textContent = "This page can't be scanned (restricted or not yet loaded).";
        renderStats(null, currentOutlet);
        renderStatusPill("no-article");
        return;
      }
      var result = response && response.result;
      if (result && result.title) lastArticleTitle = result.title;
      renderStats(result, currentOutlet);
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
        renderStats(result, currentOutlet);
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
  var ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var ICON_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

  function infoItem(iconSvg, label, value) {
    var div = document.createElement("div");
    div.className = "info-item";
    div.innerHTML =
      '<span class="icon">' + iconSvg + "</span>" +
      '<span><span class="info-item__label">' + escapeHtml(label) + '</span>' +
      '<span class="info-item__value">' + escapeHtml(value) + "</span></span>";
    return div;
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

    var badge = document.createElement("span");
    badge.className = "ownership-badge";
    badge.textContent = outlet.ownershipType;
    sourceContent.appendChild(badge);

    var grid = document.createElement("div");
    grid.className = "info-grid";
    if (outlet.parentCompany) grid.appendChild(infoItem(ICON_BUILDING, "Parent Company", outlet.parentCompany));
    if (outlet.founded) grid.appendChild(infoItem(ICON_CALENDAR, "Founded", String(outlet.founded)));
    if (outlet.headquarters) grid.appendChild(infoItem(ICON_GLOBE, "Headquarters", outlet.headquarters));
    if (outlet.monthlyReaders) grid.appendChild(infoItem(ICON_USERS, "Monthly Readers", outlet.monthlyReaders));
    sourceContent.appendChild(grid);

    var expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "expand-button";
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.innerHTML = "<span>Learn about ownership</span>" + ICON_CHEVRON;

    var detail = document.createElement("p");
    detail.className = "ownership-detail";
    detail.textContent = outlet.ownershipDetail || outlet.sourceNote || "";
    detail.hidden = true;

    expandBtn.addEventListener("click", () => {
      var expanded = expandBtn.getAttribute("aria-expanded") === "true";
      expandBtn.setAttribute("aria-expanded", String(!expanded));
      detail.hidden = expanded;
    });

    sourceContent.appendChild(expandBtn);
    sourceContent.appendChild(detail);
  }

  // --- Compare tab -----------------------------------------------------

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

  function runComparativeLookup() {
    var query = lastArticleTitle || (activeTab && activeTab.title) || "";
    compareSubtitle.textContent = query
      ? "How other sources are covering: " + (query.length > 60 ? query.slice(0, 57) + "…" : query)
      : "Open a news article to compare coverage.";

    if (!query) {
      showComparePrompt("Open a news article, then reopen this tab to compare coverage.", false);
      return;
    }

    chrome.storage.local.get({ newsApiKey: "" }, (data) => {
      if (!data.newsApiKey) {
        showComparePrompt("Add a NewsAPI key in Settings to enable cross-outlet comparison.", true);
        return;
      }

      compareState.loading = true;
      compareContent.innerHTML = '<p class="hint">Looking up comparative coverage…</p>';

      chrome.runtime.sendMessage({ type: "COMPARATIVE_LOOKUP", query }, async (response) => {
        compareState.loading = false;
        if (!response || !response.ok) {
          compareState.loaded = false; // allow retry on next tab switch
          showComparePrompt("Comparative Data Unavailable", false);
          return;
        }
        compareState.loaded = true;
        if (!response.articles || !response.articles.length) {
          showComparePrompt("No comparative articles found for this story.", false);
          return;
        }

        compareContent.innerHTML = "";
        for (const article of response.articles) {
          const outlet = await findOutletByUrl(article.url);
          compareContent.appendChild(renderCompareCard(article, outlet));
        }
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

  // --- Methodology panel -----------------------------------------------

  methodologyToggle.addEventListener("click", () => {
    methodologyPanel.hidden = !methodologyPanel.hidden;
  });

  // --- Init -------------------------------------------------------------

  getActiveTab().then(async (tab) => {
    activeTab = tab;
    var domain = tab && tab.url && /^https?:/.test(tab.url) ? registrableDomain(new URL(tab.url).hostname) : null;

    currentOutlet = await findOutletByUrl(tab && tab.url);
    renderSourceTab(currentOutlet, domain);
    renderPoliticalLeaning(currentOutlet);
    renderReliabilitySection(currentOutlet);
    renderStats(null, currentOutlet);

    initHighlightToggle(tab);
    requestBiasSummary(tab);
    refreshKeyStatus();
  });
})();
