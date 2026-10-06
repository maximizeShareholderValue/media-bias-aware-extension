/**
 * Unit tests for the article-matcher module (live-paragraph <-> Readability
 * cleaned-text matching). Run with: node --test test/article-matcher.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const ArticleMatcher = require("../content/article-matcher.js");
const { normalizeWhitespace, textBelongsToArticle } = ArticleMatcher;

test("normalizeWhitespace collapses runs of whitespace and trims", () => {
  assert.equal(normalizeWhitespace("  The   Senate\n\nvoted  "), "The Senate voted");
});

test("textBelongsToArticle: exact match is the fast path", () => {
  const cleaned = "The Senate voted on Thursday to approve the bill.";
  assert.ok(textBelongsToArticle("The Senate voted on Thursday to approve the bill.", cleaned));
});

test("textBelongsToArticle: REGRESSION - survives Readability stripping an inline fragment", () => {
  // Reproduces a confirmed real-world bug: Readability's cleanup removed an
  // inline "Share this on social media now" link from the middle of a live
  // paragraph (common on ad-heavy news sites), leaving a "hole" in the
  // cleaned text. The old exact-substring check silently dropped the whole
  // paragraph - including a genuine trigger word ("claimed") - from
  // analysis. Confirmed via a live BBC article and a targeted repro before
  // this fix landed.
  const liveParagraphText =
    "The Senate on Thursday claimed that the new border security bill would pass easily " +
    "Share this on social media now though several lawmakers privately expressed doubt " +
    "about the fragile coalition behind the measure and its long-term funding prospects " +
    "going into next year.";
  const cleanedArticleText =
    "The Senate on Thursday claimed that the new border security bill would pass easily " +
    "though several lawmakers privately expressed doubt about the fragile coalition behind " +
    "the measure and its long-term funding prospects going into next year.";

  assert.equal(cleanedArticleText.indexOf(liveParagraphText), -1, "sanity check: exact match should fail here");
  assert.ok(textBelongsToArticle(liveParagraphText, cleanedArticleText));
});

test("textBelongsToArticle: rejects genuinely unrelated content (nav/related-articles)", () => {
  const cleanedArticleText =
    "The Senate on Thursday claimed that the new border security bill would pass easily " +
    "though several lawmakers privately expressed doubt about the fragile coalition.";
  const navText = "Home World Politics Business Technology Science Health Entertainment Sports";
  const relatedArticlesText = "Related: Five things to know about the upcoming election cycle this year";

  assert.ok(!textBelongsToArticle(navText, cleanedArticleText));
  assert.ok(!textBelongsToArticle(relatedArticlesText, cleanedArticleText));
});

test("textBelongsToArticle: rejects comment-section content that happens to share a few words", () => {
  const cleanedArticleText =
    "The regime cracked down on dissidents after the protest, according to local officials.";
  const commentText = "I think the local officials handling this situation did a great job overall, thanks for reporting.";
  assert.ok(!textBelongsToArticle(commentText, cleanedArticleText));
});
