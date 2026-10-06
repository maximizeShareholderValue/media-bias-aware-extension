/**
 * Display metadata (label + accent color) for the 14 propaganda-technique
 * categories. Shared by the highlight tooltip (content script) and the popup
 * legend so the two can't drift apart. Mirrors data/pattern-catalog.json
 * `categories` (labels) and content/highlighter.css (colors).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CategoryMeta = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return {
      "LOADED_LANGUAGE": {
          "label": "Loaded Language",
          "color": "#7A3EA6"
      },
      "NAME_CALLING_LABELING": {
          "label": "Name Calling / Labeling",
          "color": "#B3265E"
      },
      "REPETITION": {
          "label": "Repetition",
          "color": "#5B6770"
      },
      "EXAGGERATION_MINIMIZATION": {
          "label": "Exaggeration / Minimization",
          "color": "#C2570C"
      },
      "DOUBT": {
          "label": "Doubt",
          "color": "#0E7C66"
      },
      "APPEAL_TO_FEAR_PREJUDICE": {
          "label": "Appeal to Fear / Prejudice",
          "color": "#B3261E"
      },
      "FLAG_WAVING": {
          "label": "Flag-Waving",
          "color": "#1B4F9C"
      },
      "CAUSAL_OVERSIMPLIFICATION": {
          "label": "Causal Oversimplification",
          "color": "#8A5A00"
      },
      "SLOGANS": {
          "label": "Slogans",
          "color": "#6B7F00"
      },
      "APPEAL_TO_AUTHORITY": {
          "label": "Appeal to Authority",
          "color": "#1B5FA8"
      },
      "BLACK_AND_WHITE_FALLACY": {
          "label": "Black-and-White Fallacy",
          "color": "#333333"
      },
      "THOUGHT_TERMINATING_CLICHES": {
          "label": "Thought-Terminating Clichés",
          "color": "#7C4A2D"
      },
      "BANDWAGON_REDUCTIO_AD_HITLERUM": {
          "label": "Bandwagon / Reductio ad Hitlerum",
          "color": "#A3257F"
      },
      "STRAW_MAN_WHATABOUTISM_RED_HERRING": {
          "label": "Straw Men / Whataboutism / Red Herring",
          "color": "#2E7D32"
      }
  };
});
