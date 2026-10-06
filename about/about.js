/**
 * Renders the technique reference, the rule anatomy and the full rule list from the live
 * pattern catalog, so this page can never describe a technique or rule the extension lacks.
 */
(function () {
  "use strict";

  var MAX_PHRASES = 8;
  var ANATOMY_RULE = "AF-001";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function meta(key) {
    return (window.CategoryMeta && window.CategoryMeta[key]) || {};
  }

  function samplePhrases(rules) {
    var seen = {};
    var out = [];
    rules.forEach(function (rule) {
      ((rule.lexicalTrigger && rule.lexicalTrigger.words) || []).forEach(function (w) {
        var key = w.toLowerCase();
        if (!seen[key] && out.length < MAX_PHRASES) {
          seen[key] = true;
          out.push(w);
        }
      });
    });
    return out;
  }

  function renderTechnique(key, technique, rules, index) {
    var card = el("article", "tech");
    card.id = key;
    card.style.setProperty("--accent", meta(key).color || "#888");

    var head = el("div", "tech__head");
    head.appendChild(el("span", "tech__dot"));
    head.appendChild(el("h3", null, technique.label || meta(key).label || key));
    head.appendChild(el("span", "tech__num", String(index + 1) + " / 14"));
    card.appendChild(head);
    card.appendChild(el("p", null, technique.description || ""));

    var phrases = samplePhrases(rules);
    if (phrases.length) {
      var row = el("div", "tech__row");
      row.appendChild(el("span", "tech__label", "Phrases we look for"));
      phrases.forEach(function (w) {
        row.appendChild(el("span", "pill", w));
        row.appendChild(document.createTextNode(" "));
      });
      card.appendChild(row);
    }

    var ruleRow = el("div", "tech__row");
    ruleRow.appendChild(el("span", "tech__label", rules.length === 1 ? "Rule" : "Rules"));
    if (rules.length) {
      rules.forEach(function (r) {
        var pill = el("a", "pill pill--id", r.id);
        pill.href = "#rule-" + r.id;
        pill.title = r.label || r.id;
        pill.addEventListener("click", function () {
          var details = document.querySelector("details.all-rules");
          if (details) details.open = true;
        });
        ruleRow.appendChild(pill);
        ruleRow.appendChild(document.createTextNode(" "));
      });
    } else {
      ruleRow.appendChild(el("span", "pill pill--none", "Not detected automatically yet"));
      ruleRow.appendChild(el("p", "muted", "This technique needs analysis of the whole article rather than a single phrase."));
    }
    card.appendChild(ruleRow);
    return card;
  }

  function anatomyRow(term, value) {
    var row = el("div", "anatomy__row");
    row.appendChild(el("dt", null, term));
    row.appendChild(el("dd", null, value));
    return row;
  }

  function renderAnatomy(rule) {
    var box = document.getElementById("anatomy");
    box.textContent = "";
    if (!rule) return;

    var head = el("div", "anatomy__head");
    head.appendChild(el("span", "anatomy__id", rule.id));
    head.appendChild(el("span", "anatomy__title", rule.label + " · " + (meta(rule.technique).label || rule.technique)));
    box.appendChild(head);

    var dl = el("dl");
    dl.style.display = "contents";
    dl.appendChild(anatomyRow("Trigger (L)", (rule.lexicalTrigger.words || []).join(", ")));
    dl.appendChild(anatomyRow("Grammar (S)", rule.linguisticCondition.description || "None"));
    dl.appendChild(anatomyRow("Context (C)", rule.contextCondition.description || "None"));
    dl.appendChild(anatomyRow("Why it is flagged", rule.explanation));
    var alt = rule.neutralAlternative || (rule.neutralAlternatives || []).join(", ");
    if (alt) dl.appendChild(anatomyRow("Neutral wording", alt));
    dl.appendChild(anatomyRow("Confidence tier", rule.confidenceTier));
    box.appendChild(dl);
  }

  function renderRuleList(catalog) {
    var list = document.getElementById("ruleList");
    list.textContent = "";
    Object.keys(catalog.techniques).forEach(function (key) {
      var rules = catalog.patterns.filter(function (p) {
        return p.technique === key;
      });
      if (!rules.length) return;

      var group = el("h4", "rule-group");
      group.style.setProperty("--accent", meta(key).color || "#888");
      group.appendChild(el("i"));
      group.appendChild(document.createTextNode(catalog.techniques[key].label));
      list.appendChild(group);

      rules.forEach(function (r) {
        var item = el("div", "rule");
        item.id = "rule-" + r.id;
        var top = el("div", "rule__top");
        top.appendChild(el("span", "rule__id", r.id));
        top.appendChild(el("span", "rule__label", r.label));
        top.appendChild(el("span", "rule__tier", r.confidenceTier + " confidence"));
        item.appendChild(top);

        var trig = el("p");
        trig.appendChild(el("b", null, "Looks for: "));
        trig.appendChild(document.createTextNode((r.lexicalTrigger.words || []).join(", ")));
        item.appendChild(trig);
        var gram = el("p");
        gram.appendChild(el("b", null, "Grammar: "));
        gram.appendChild(document.createTextNode(r.linguisticCondition.description || "None"));
        item.appendChild(gram);
        var ctx = el("p");
        ctx.appendChild(el("b", null, "Context: "));
        ctx.appendChild(document.createTextNode(r.contextCondition.description || "None"));
        item.appendChild(ctx);
        list.appendChild(item);
      });
    });
  }

  function render(catalog) {
    var list = document.getElementById("techniqueList");
    list.textContent = "";
    var keys = Object.keys(catalog.techniques);
    var covered = 0;
    keys.forEach(function (key, i) {
      var rules = catalog.patterns.filter(function (p) {
        return p.technique === key;
      });
      if (rules.length) covered++;
      list.appendChild(renderTechnique(key, catalog.techniques[key], rules, i));
    });

    document.getElementById("coverageLine").textContent =
      covered + " of " + keys.length + " techniques are detected by at least one rule (" + catalog.patterns.length + " rules in total).";
    document.getElementById("ruleCount").textContent = String(catalog.patterns.length);
    document.getElementById("versionLine").textContent =
      "Rule catalog version " + catalog.catalogVersion + ", last updated " + catalog.lastUpdated + ".";

    renderAnatomy(
      catalog.patterns.filter(function (p) {
        return p.id === ANATOMY_RULE;
      })[0]
    );
    renderRuleList(catalog);

    // Cards are built after load, so jump to a #TECHNIQUE or #rule-ID link by hand.
    if (location.hash.length > 1) {
      var id = decodeURIComponent(location.hash.slice(1));
      if (id.indexOf("rule-") === 0) {
        var d = document.querySelector("details.all-rules");
        if (d) d.open = true;
      }
      var target = document.getElementById(id);
      if (target) target.scrollIntoView();
    }
  }

  fetch("../data/pattern-catalog.json")
    .then(function (res) {
      return res.json();
    })
    .then(render)
    .catch(function () {
      document.getElementById("techniqueList").textContent = "The technique list could not be loaded. Reload the extension and try again.";
    });
})();
