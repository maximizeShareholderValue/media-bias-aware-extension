// Removes site boilerplate from the evaluation articles and logs every removal.
// Usage (from the repo root): node eval/clean-corpus.js
// Re-running is safe: it starts from a fresh export-to-txt conversion each time.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = path.join(__dirname, "corpus", "articles");
execFileSync(process.execPath, [path.join(__dirname, "export-to-txt.js"), path.join(__dirname, "corpus", "exports"), dir], { stdio: "ignore" });

// Paragraphs removed wherever they appear (exact boilerplate).
const RULES = [
  { re: /^Learn more about our emails\. Unsubscribe anytime\.$/i, why: "newsletter prompt" },
  { re: /^The Reuters .* newsletter keeps you informed/i, why: "newsletter prompt" },
  { re: /^\[\d+\/\d+\]/, why: "photo-gallery caption" },
  { re: /^Copyright .*All rights reserved/i, why: "copyright line" },
  { re: /^Accuracy and availability of NPR transcripts/i, why: "transcript disclaimer" },
  { re: /^Subscribe to the Daily newsletter/i, why: "newsletter prompt" },
  { re: /^This story is breaking and will be updated\.$/i, why: "update notice" },
  { re: /^Supreme Court Donald Trump Tariffs Supreme Court justices$/i, why: "topic tag line" },
  { re: /^A man waits to play chess in Union Square during a heatwave/i, why: "photo caption" },
  { re: /^Update: .* This article was updated/i, why: "update notice" },
  { re: /^The news cycle is loud\. Algorithms push us to extremes/i, why: "membership promo" },
  { re: /^Common ground isn't just possible/i, why: "membership promo" },
  { re: /^In a polarized era, the center is dismissed as bland/i, why: "membership promo" },
  { re: /^When you become a Newsweek Member/i, why: "membership promo" },
  { re: /^Help keep the center courageous\. Join today\.$/i, why: "membership promo" }
];

const log = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
  const id = f.replace(/\.txt$/, "");
  const paras = fs.readFileSync(path.join(dir, f), "utf8").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const keep = [];
  paras.forEach((p, i) => {
    const rule = RULES.find((r) => r.re.test(p));
    // A paragraph that contains several later paragraphs is a duplicated block of the article.
    const dupBlock = p.length > 1000 && paras.filter((q, j) => j !== i && q.length > 100 && p.includes(q.slice(0, 100))).length >= 3;
    if (rule || dupBlock) {
      log.push({ article: id, paragraph: i, words: p.split(/\s+/).length, reason: rule ? rule.why : "duplicated block of the article text", text: p.slice(0, 120) });
    } else keep.push(p);
  });
  fs.writeFileSync(path.join(dir, f), keep.join("\n\n") + "\n");
}
fs.writeFileSync(path.join(__dirname, "corpus", "cleaning-log.json"), JSON.stringify(log, null, 2));
console.log("removed " + log.length + " paragraphs");
log.forEach((l) => console.log(" " + l.article + " #" + l.paragraph + " [" + l.words + "w] " + l.reason));
