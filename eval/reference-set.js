/**
 * Phase 1 reference set and span scoring (thesis 7.2, 8.3).
 *
 *  - Validators annotate clean article copies independently (Phase 1). Each annotation is the span
 *    text they copied, the technique they chose, and the sentence it sits in.
 *  - locateSpan() turns that text back into character offsets in the article.
 *  - buildReference() keeps a span when at least 2 of the 3 validators marked overlapping text:
 *    "strict" groups require the same technique, "lenient" groups ignore technique.
 *  - scoreSpans() scores highlights against the reference set with the same overlap rule as
 *    eval/calibrate.js (Gate 2), so the two sets of numbers can be compared.
 *
 * Pure functions, Node-testable. Not part of the shipped extension.
 */
"use strict";

const MIN_AGREE = 2;

const QUOTES = "\"'“”‘’";

/** Regex for a validator's copied span: case-insensitive, any whitespace run, any quote style. */
function spanRegex(span) {
  const src = span
    .trim()
    .split("")
    .map((ch) => {
      if (/\s/.test(ch)) return " ";
      if (QUOTES.includes(ch)) return "[" + QUOTES + "]";
      return ch.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
    })
    .join("")
    .replace(/ +/g, "\\s+");
  return new RegExp(src, "gi");
}

function findAll(text, span) {
  if (!span || !span.trim()) return [];
  const re = spanRegex(span);
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/**
 * Finds a copied span in the article. When it occurs more than once, the copy that sits inside
 * the validator's Sentence Context wins. Returns {start, end, ambiguous} or null when not found.
 */
function locateSpan(text, span, context) {
  const hits = findAll(text, span);
  if (!hits.length) return null;
  if (hits.length === 1) return { start: hits[0].start, end: hits[0].end, ambiguous: false };
  const ctx = findAll(text, context);
  const inCtx = hits.filter((h) => ctx.some((c) => c.start <= h.start && h.end <= c.end));
  if (inCtx.length === 1) return { start: inCtx[0].start, end: inCtx[0].end, ambiguous: false };
  const pick = inCtx[0] || hits[0];
  return { start: pick.start, end: pick.end, ambiguous: true };
}

function overlaps(a, b) {
  return a.articleId === b.articleId && a.start < b.end && b.start < a.end;
}

/**
 * annotations: [{validator, articleId, technique, start, end}] (already located).
 * Groups annotations that overlap (chained) within the same article (and technique, unless
 * lenient). A group marked by >= 2 distinct validators becomes one reference span covering
 * the extent of the group. Returns [{articleId, technique, start, end, validators}].
 */
function buildReference(annotations, opts) {
  const lenient = !!(opts && opts.lenient);
  const minAgree = (opts && opts.minAgree) || MIN_AGREE;
  const buckets = {};
  annotations.forEach((a) => {
    const k = a.articleId + "\u0000" + (lenient ? "" : a.technique);
    (buckets[k] = buckets[k] || []).push(a);
  });
  const ref = [];
  Object.keys(buckets).forEach((k) => {
    const list = buckets[k].slice().sort((x, y) => x.start - y.start || x.end - y.end);
    let group = null;
    const flush = () => {
      if (!group) return;
      const validators = Array.from(new Set(group.items.map((g) => g.validator))).sort();
      if (validators.length >= minAgree) {
        const counts = {};
        group.items.forEach((g) => (counts[g.technique] = (counts[g.technique] || 0) + 1));
        const technique = Object.keys(counts).sort((x, y) => counts[y] - counts[x] || (x < y ? -1 : 1))[0];
        ref.push({ articleId: group.items[0].articleId, technique: technique, start: group.start, end: group.end, validators: validators });
      }
    };
    list.forEach((a) => {
      if (group && a.start < group.end) {
        group.items.push(a);
        group.end = Math.max(group.end, a.end);
      } else {
        flush();
        group = { start: a.start, end: a.end, items: [a] };
      }
    });
    flush();
  });
  return ref.sort((x, y) => (x.articleId < y.articleId ? -1 : x.articleId > y.articleId ? 1 : x.start - y.start));
}

function ratio(a, b) {
  return b === 0 ? null : a / b;
}

function f1(p, r) {
  return p === null || r === null || p + r === 0 ? null : (2 * p * r) / (p + r);
}

function stats(tp, flagged, found, refTotal) {
  const p = ratio(tp, flagged);
  const r = ratio(found, refTotal);
  return { flagged: flagged, tp: tp, fp: flagged - tp, reference: refTotal, found: found, precision: p, recall: r, f1: f1(p, r), fpr: p === null ? null : 1 - p };
}

/**
 * highlights: [{articleId, technique, start, end}]; reference: output of buildReference.
 * ignoreTechnique: true for the lenient score (any reference span counts).
 * Returns overall and per-technique precision / recall / F1 / FPR.
 * Per technique, precision is over that technique's highlights and recall over its reference spans.
 */
function scoreSpans(highlights, reference, ignoreTechnique) {
  const same = (h, r) => overlaps(h, r) && (ignoreTechnique || h.technique === r.technique);
  const hitH = highlights.map((h) => reference.some((r) => same(h, r)));
  const hitR = reference.map((r) => highlights.some((h) => same(h, r)));
  const count = (arr, pred) => arr.filter(pred).length;
  const overall = stats(count(hitH, Boolean), highlights.length, count(hitR, Boolean), reference.length);
  const techs = Array.from(new Set(highlights.map((h) => h.technique).concat(reference.map((r) => r.technique)))).sort();
  const perTechnique = {};
  techs.forEach((t) => {
    const hi = highlights.map((h, i) => i).filter((i) => highlights[i].technique === t);
    const ri = reference.map((r, i) => i).filter((i) => reference[i].technique === t);
    perTechnique[t] = stats(count(hi, (i) => hitH[i]), hi.length, count(ri, (i) => hitR[i]), ri.length);
  });
  return Object.assign(overall, { perTechnique: perTechnique });
}

/** Maps a sheet technique name ("Name Calling / Labeling", "Loaded_Language", "DOUBT") to its catalog key. */
function techniqueResolver(techniques) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  const map = {};
  Object.keys(techniques).forEach((k) => {
    map[norm(k)] = k;
    if (techniques[k].label) map[norm(techniques[k].label)] = k;
  });
  return (name) => map[norm(name)] || null;
}

module.exports = { MIN_AGREE: MIN_AGREE, locateSpan: locateSpan, buildReference: buildReference, scoreSpans: scoreSpans, techniqueResolver: techniqueResolver };
