/**
 * Highlight renderer: injects accessible <mark>-like spans into the live
 * article DOM for each resolved match, plus a shared hover/focus tooltip
 * that shows the rule's plain-language explanation and rule ID.
 *
 * Must run against the REAL page DOM (not a detached Readability clone) so
 * that highlighting doesn't change the site's own layout/styling.
 */
(function (root) {
  "use strict";

  var TOOLTIP_ID = "bias-aware-tooltip";
  var tooltipEl = null;
  var activeTarget = null;
  var hideTimer = null;

  // Mirrors the category colors defined in highlighter.css; used only for
  // the tooltip's small identifying dot (a purely decorative echo of the
  // border-accent color already on the highlight span itself).
  var CATEGORY_DOT_COLOR = {
    LOADED_LANGUAGE: "#7A3EA6",
    EVALUATIVE_MODIFIER: "#B3265E",
    SPECULATIVE_CONSTRUCTION: "#1B5FA8",
    ATTRIBUTION_FRAMING: "#0E7C66",
    PRESUPPOSITION: "#8A5A00"
  };

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.id = TOOLTIP_ID;
    tooltipEl.className = "bias-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.hidden = true;
    document.documentElement.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(target) {
    clearTimeout(hideTimer);
    var tip = ensureTooltip();
    var label = target.dataset.label || target.dataset.ruleId;
    var explanation = target.dataset.explanation || "";
    var neutralAlternative = target.dataset.neutralAlternative || "";
    var ruleId = target.dataset.ruleId || "";
    var category = target.dataset.category || "";

    tip.innerHTML = "";

    var header = document.createElement("div");
    header.className = "bias-tooltip__header";
    var dot = document.createElement("span");
    dot.className = "bias-tooltip__dot";
    dot.style.background = CATEGORY_DOT_COLOR[category] || "#888";
    var categoryLabel = document.createElement("span");
    categoryLabel.className = "bias-tooltip__category";
    categoryLabel.textContent = (label || category).toUpperCase();
    header.appendChild(dot);
    header.appendChild(categoryLabel);
    tip.appendChild(header);

    var explLine = document.createElement("span");
    explLine.className = "bias-tooltip__explanation";
    explLine.textContent = explanation;
    tip.appendChild(explLine);

    if (neutralAlternative) {
      var altLine = document.createElement("span");
      altLine.className = "bias-tooltip__alternative";
      altLine.textContent = "Neutral alternative: ";
      var altValue = document.createElement("b");
      altValue.textContent = neutralAlternative;
      altLine.appendChild(altValue);
      tip.appendChild(altLine);
    }

    // Kept for the transparency requirement (every highlight must trace to
    // a named rule ID) - shown small/muted since it's implementation detail
    // rather than something a general reader needs to act on.
    var ruleLine = document.createElement("span");
    ruleLine.className = "bias-tooltip__rule";
    ruleLine.textContent = "Rule " + ruleId;
    tip.appendChild(ruleLine);

    tip.hidden = false;
    activeTarget = target;

    var rect = target.getBoundingClientRect();
    var top = window.scrollY + rect.bottom + 6;
    var left = window.scrollX + rect.left;

    // Rough viewport-overflow guard: measure after making visible.
    var tipRect = tip.getBoundingClientRect();
    if (rect.left + tipRect.width > window.innerWidth - 8) {
      left = window.scrollX + Math.max(8, window.innerWidth - tipRect.width - 8);
    }
    if (rect.bottom + tipRect.height + 6 > window.innerHeight) {
      top = window.scrollY + rect.top - tipRect.height - 6;
    }

    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  function hideTooltip() {
    hideTimer = setTimeout(function () {
      if (tooltipEl) tooltipEl.hidden = true;
      activeTarget = null;
    }, 60);
  }

  function isHighlight(el) {
    return el && el.classList && el.classList.contains("bias-highlight");
  }

  function attachDelegatedEvents() {
    document.addEventListener(
      "mouseover",
      function (e) {
        var el = e.target.closest ? e.target.closest(".bias-highlight") : null;
        if (isHighlight(el)) showTooltip(el);
      },
      true
    );
    document.addEventListener(
      "mouseout",
      function (e) {
        var el = e.target.closest ? e.target.closest(".bias-highlight") : null;
        if (isHighlight(el)) hideTooltip();
      },
      true
    );
    document.addEventListener(
      "focusin",
      function (e) {
        var el = e.target;
        if (isHighlight(el)) showTooltip(el);
      },
      true
    );
    document.addEventListener(
      "focusout",
      function (e) {
        var el = e.target;
        if (isHighlight(el)) hideTooltip();
      },
      true
    );
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && activeTarget) {
        if (tooltipEl) tooltipEl.hidden = true;
        activeTarget = null;
      }
    });
    // Re-flow tooltip position on scroll/resize while visible.
    window.addEventListener(
      "scroll",
      function () {
        if (activeTarget && tooltipEl && !tooltipEl.hidden) showTooltip(activeTarget);
      },
      true
    );
  }

  /**
   * Wraps [match.start, match.end) of `paragraphEl`'s flattened text content
   * in an accessible highlight span, splitting text nodes as needed so
   * nested inline markup (e.g. <a>, <em>) inside the paragraph is preserved.
   */
  function wrapRange(paragraphEl, match) {
    var walker = document.createTreeWalker(paragraphEl, NodeFilter.SHOW_TEXT, null);
    var node;
    var pos = 0;
    var touched = [];

    while ((node = walker.nextNode())) {
      var nodeStart = pos;
      var nodeEnd = pos + node.nodeValue.length;
      pos = nodeEnd;
      if (nodeEnd <= match.start || nodeStart >= match.end) continue;
      touched.push({ node: node, nodeStart: nodeStart, nodeEnd: nodeEnd });
    }

    for (var i = 0; i < touched.length; i++) {
      var t = touched[i];
      var localStart = Math.max(0, match.start - t.nodeStart);
      var localEnd = Math.min(t.node.nodeValue.length, match.end - t.nodeStart);
      if (localStart >= localEnd) continue;

      var text = t.node.nodeValue;
      var before = text.slice(0, localStart);
      var middle = text.slice(localStart, localEnd);
      var after = text.slice(localEnd);

      var span = document.createElement("span");
      span.className = "bias-highlight bias-highlight--" + match.category;
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.setAttribute("aria-describedby", TOOLTIP_ID);
      span.dataset.ruleId = match.id;
      span.dataset.label = match.label;
      span.dataset.explanation = match.explanation;
      span.dataset.category = match.category;
      if (match.neutralAlternative) span.dataset.neutralAlternative = match.neutralAlternative;
      span.textContent = middle;

      var parent = t.node.parentNode;
      var frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(span);
      if (after) frag.appendChild(document.createTextNode(after));
      parent.replaceChild(frag, t.node);
    }
  }

  /**
   * @param {HTMLElement} paragraphEl - live DOM element whose textContent
   *   equals `text` (the string that was fed to the pattern matcher).
   * @param {string} text
   * @param {Array} matches - conflict-resolved, non-overlapping matches.
   */
  function renderHighlights(paragraphEl, text, matches) {
    if (!matches || !matches.length) return;
    // Process back-to-front so earlier offsets stay valid while we mutate.
    var ordered = matches.slice().sort(function (a, b) {
      return b.start - a.start;
    });
    for (var i = 0; i < ordered.length; i++) {
      wrapRange(paragraphEl, ordered[i]);
    }
  }

  function removeAllHighlights() {
    var spans = document.querySelectorAll(".bias-highlight");
    spans.forEach(function (span) {
      var parent = span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    });
    if (tooltipEl) tooltipEl.hidden = true;
  }

  attachDelegatedEvents();

  root.Highlighter = {
    renderHighlights: renderHighlights,
    removeAllHighlights: removeAllHighlights
  };
})(typeof self !== "undefined" ? self : this);
