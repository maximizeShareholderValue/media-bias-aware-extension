(function () {
  "use strict";

  var BUCKETS = ["Left", "Center", "Right"];
  var columns = document.getElementById("columns");
  var topicLine = document.getElementById("topicLine");
  var currentLine = document.getElementById("currentLine");
  var notes = document.getElementById("notes");

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function renderColumn(bucket, items) {
    var col = el("section", "column column--" + bucket.toLowerCase());
    var head = el("div", "column__head");
    head.appendChild(el("h2", null, bucket));
    head.appendChild(el("p", null, items.length + (items.length === 1 ? " article" : " articles")));
    col.appendChild(head);

    if (!items.length) {
      col.appendChild(el("p", "empty", "No " + bucket.toLowerCase() + "-rated coverage found for this topic."));
      return col;
    }
    items.forEach(function (a) {
      var card = el("article", "article");
      var meta = el("div", "article__outlet");
      meta.appendChild(el("span", null, a.outletName || a.source || a.domain));
      meta.appendChild(el("span", "article__badge", a.ideology || bucket));
      card.appendChild(meta);

      var link = el("a", "article__title", a.title || "(untitled)");
      link.href = a.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.appendChild(link);

      if (a.publishedAt) card.appendChild(el("span", "article__date", formatDate(a.publishedAt)));
      col.appendChild(card);
    });
    return col;
  }

  function render(data) {
    topicLine.textContent = "Topic keywords (the only thing sent to the news API): " + (data.keywords || []).join(", ");
    var cur = data.current || {};
    currentLine.textContent = cur.name
      ? "You are reading: " + cur.name + (cur.ideology ? " (rated " + cur.ideology + ")" : "")
      : cur.domain ? "You are reading: " + cur.domain : "";

    columns.textContent = "";
    BUCKETS.forEach(function (b) {
      columns.appendChild(renderColumn(b, (data.groups && data.groups[b]) || []));
    });

    var parts = ["Ratings describe the outlet (AllSides / Media Bias/Fact Check), not this particular article."];
    if (data.unrated) parts.push(data.unrated + " result(s) from outlets without a rating were left out.");
    if (data.sameOutlet) parts.push(data.sameOutlet + " result(s) from the outlet you are reading were left out.");
    notes.textContent = parts.join(" ");
  }

  var area = chrome.storage.session || chrome.storage.local;
  area.get("compareData", function (stored) {
    if (!stored || !stored.compareData) {
      columns.textContent = "";
      columns.appendChild(el("p", "empty", "No comparison data. Open the extension popup on a news article, choose the Compare tab, and select \"Open split-screen view\"."));
      return;
    }
    render(stored.compareData);
  });
})();
