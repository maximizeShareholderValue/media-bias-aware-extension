/**
 * Phase 1 reference set and span scoring (thesis 7.2, 8.3).
 *
 *  - Validators annotate clean article copies independently (Phase 1). Each annotation is the span
 *    text they copied, the technique they chose, and the sentence it sits in.
 *  - locateSpan() turns that text back into character offsets in the article.
 *  - Two spans match when their token-level Intersection over Union is at least 0.50 (7.2):
 *    IoU(A, B) = |A ∩ B| / |A ∪ B| over the word tokens each span touches. This is the primary
 *    rule. The secondary rule, "any overlap" (at least one shared character), is the one
 *    eval/calibrate.js uses for Gate 2, so the two sets of numbers can be compared.
 *  - buildReference() keeps a span when at least 2 of the 3 validators marked matching text:
 *    "strict" groups require the same technique, "lenient" groups ignore technique.
 *  - scoreSpans() scores highlights against the reference set with the same matching rule.
 *
 * Pure functions, Node-testable. Not part of the shipped extension.
 */
"use strict";

const MIN_AGREE = 2;
const IOU_MIN = 0.5;
const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

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

/** Word tokens of a text as [{start, end}] character ranges. */
function tokenize(text) {
  const out = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * Adds token indexes to spans: tokStart..tokEnd (end exclusive) are the tokens the span's
 * characters touch. texts: {articleId: text}. Returns new objects; the input is not changed.
 */
function withTokens(spans, texts) {
  const cache = {};
  return spans.map((s) => {
    const toks = cache[s.articleId] || (cache[s.articleId] = tokenize(texts[s.articleId] || ""));
    let tokStart = -1;
    let tokEnd = -1;
    toks.forEach((t, i) => {
      if (t.start < s.end && s.start < t.end) {
        if (tokStart < 0) tokStart = i;
        tokEnd = i + 1;
      }
    });
    return Object.assign({}, s, tokStart < 0 ? { tokStart: 0, tokEnd: 0 } : { tokStart: tokStart, tokEnd: tokEnd });
  });
}

/** Token-level IoU of two spans that carry tokStart/tokEnd (0 for different articles or no tokens). */
function iou(a, b) {
  if (a.articleId !== b.articleId) return 0;
  if (a.tokStart === undefined || b.tokStart === undefined) throw new Error("iou() needs spans with token indexes: call withTokens() first");
  const inter = Math.max(0, Math.min(a.tokEnd, b.tokEnd) - Math.max(a.tokStart, b.tokStart));
  const union = a.tokEnd - a.tokStart + (b.tokEnd - b.tokStart) - inter;
  return union > 0 ? inter / union : 0;
}

/** "iou" (primary, IoU >= 0.50) or "overlap" (secondary, any shared character). */
function matcher(mode) {
  if (mode === "overlap") return overlaps;
  if (mode === "iou") return (a, b) => iou(a, b) >= IOU_MIN;
  throw new Error("unknown match rule: " + mode);
}

/**
 * annotations: [{validator, articleId, technique, start, end}] (already located; with "iou"
 * they also need tokStart/tokEnd from withTokens()). Annotations of the same article (and
 * technique, unless lenient) that match are grouped, transitively. A group marked by >= 2
 * distinct validators becomes one reference span. Its extent is the union of the group with
 * "overlap"; with "iou" it is the group's most central annotation (highest summed IoU with the
 * others; ties go to the earlier, then the longer span), so a reference span is always a span
 * a validator actually marked. Returns [{articleId, technique, start, end, validators}].
 * opts: {lenient, minAgree, match: "iou" (default) | "overlap"}.
 */
function buildReference(annotations, opts) {
  const lenient = !!(opts && opts.lenient);
  const minAgree = (opts && opts.minAgree) || MIN_AGREE;
  const mode = (opts && opts.match) || "iou";
  const same = matcher(mode);
  const buckets = {};
  annotations.forEach((a) => {
    const k = a.articleId + "\u0000" + (lenient ? "" : a.technique);
    (buckets[k] = buckets[k] || []).push(a);
  });
  const ref = [];
  Object.keys(buckets).forEach((k) => {
    const list = buckets[k].slice().sort((x, y) => x.start - y.start || x.end - y.end);
    // Connected groups under the matching rule (union-find).
    const parent = list.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (same(list[i], list[j])) parent[root(j)] = root(i);
    const groups = {};
    list.forEach((a, i) => (groups[root(i)] = groups[root(i)] || []).push(a));
    Object.keys(groups).forEach((g) => {
      const items = groups[g];
      const validators = Array.from(new Set(items.map((x) => x.validator))).sort();
      if (validators.length < minAgree) return;
      const counts = {};
      items.forEach((x) => (counts[x.technique] = (counts[x.technique] || 0) + 1));
      const technique = Object.keys(counts).sort((x, y) => counts[y] - counts[x] || (x < y ? -1 : 1))[0];
      let extent;
      if (mode === "overlap") {
        extent = { start: Math.min(...items.map((x) => x.start)), end: Math.max(...items.map((x) => x.end)) };
      } else {
        const central = (x) => items.reduce((sum, y) => sum + (x === y ? 0 : iou(x, y)), 0);
        extent = items.slice().sort((x, y) => central(y) - central(x) || x.start - y.start || y.end - x.end)[0];
      }
      const span = { articleId: items[0].articleId, technique: technique, start: extent.start, end: extent.end, validators: validators };
      if (mode === "iou") Object.assign(span, { tokStart: extent.tokStart, tokEnd: extent.tokEnd });
      ref.push(span);
    });
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
 * match: "iou" (default; spans need withTokens()) or "overlap".
 * Per technique, precision is over that technique's highlights and recall over its reference spans.
 */
function scoreSpans(highlights, reference, ignoreTechnique, match) {
  const hit = matcher(match || "iou");
  const same = (h, r) => hit(h, r) && (ignoreTechnique || h.technique === r.technique);
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

/**
 * Phase 1 agreement (thesis 7.4): span-level F1 between each pair of validators, pooled over all
 * articles, and its mean over the pairs (Hripcsak & Rothschild, 2005). Two annotations agree when
 * they match under `match` (default IoU >= 0.50; spans need withTokens()) and carry the same
 * technique. For a pair (A, B): precision = share of A's annotations that agree with one of B's,
 * recall = share of B's that agree with one of A's, F1 = their harmonic mean.
 * Returns { pairs: [{a, b, annotationsA, annotationsB, f1}], meanF1 }.
 */
function pairwiseF1(annotations, match) {
  const hit = matcher(match || "iou");
  const same = (x, y) => x.technique === y.technique && hit(x, y);
  const validators = Array.from(new Set(annotations.map((x) => x.validator))).sort();
  const pairs = [];
  for (let i = 0; i < validators.length; i++) {
    for (let j = i + 1; j < validators.length; j++) {
      const A = annotations.filter((x) => x.validator === validators[i]);
      const B = annotations.filter((x) => x.validator === validators[j]);
      const p = ratio(A.filter((x) => B.some((y) => same(x, y))).length, A.length);
      const r = ratio(B.filter((y) => A.some((x) => same(x, y))).length, B.length);
      // No agreement at all is an F1 of 0, not undefined.
      pairs.push({ a: validators[i], b: validators[j], annotationsA: A.length, annotationsB: B.length, f1: p === 0 && r === 0 ? 0 : f1(p, r) });
    }
  }
  const scored = pairs.filter((x) => x.f1 !== null);
  return { pairs: pairs, meanF1: scored.length ? scored.reduce((s, x) => s + x.f1, 0) / scored.length : null };
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

module.exports = { MIN_AGREE: MIN_AGREE, IOU_MIN: IOU_MIN, tokenize: tokenize, withTokens: withTokens, iou: iou, locateSpan: locateSpan, buildReference: buildReference, scoreSpans: scoreSpans, pairwiseF1: pairwiseF1, techniqueResolver: techniqueResolver };
