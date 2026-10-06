#!/usr/bin/env node
/**
 * Adds MBFC review links, country and media type to data/outlet-metadata.json,
 * then overlays the hand-curated ownership in data/ownership-curated.json.
 *
 *   node scripts/enrich-outlet-metadata.js path/to/mbfc-data.json
 *
 * Safe to re-run: it only sets the fields below and leaves ideology/name untouched.
 *   mbfcUrl, country, mediaType      from the MBFC row for the outlet's domain
 *   parentCompany, ownershipType,    from data/ownership-curated.json (when listed)
 *   ownershipDetail, ownershipSource
 */
const fs = require("fs");
const path = require("path");

const mbfcPath = process.argv[2];
if (!mbfcPath) {
  console.error("usage: node scripts/enrich-outlet-metadata.js <mbfc-data.json>");
  process.exit(1);
}

const dataDir = path.join(__dirname, "..", "data");
const metaPath = path.join(dataDir, "outlet-metadata.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const mbfc = JSON.parse(fs.readFileSync(mbfcPath, "utf8"));
const curated = JSON.parse(fs.readFileSync(path.join(dataDir, "ownership-curated.json"), "utf8")).outlets;

const hostOf = (u) => String(u || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^\.+/, "").replace(/^www\./, "").split("/")[0].trim();
const hasPath = (u) => /\//.test(String(u || "").replace(/^https?:\/\//, ""));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const byHost = new Map();
for (const row of mbfc) {
  const h = hostOf(row["Source URL"]);
  if (!h) continue;
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(row);
}

function bestRow(outlet) {
  let rows = byHost.get(outlet.domain) || [];
  if (!rows.length) {
    // MBFC sometimes lists a subdomain ("news.abs-cbn.com") for an outlet we store by its main domain.
    for (const [h, r] of byHost) if (h.endsWith("." + outlet.domain)) rows = rows.concat(r);
  }
  return (
    rows.find((r) => norm(r.Source) === norm(outlet.name)) ||
    rows.find((r) => !hasPath(r["Source URL"])) ||
    rows[0] ||
    null
  );
}

let linked = 0, owned = 0, fixedDomains = 0;
for (const o of meta.outlets) {
  if (o.domain.startsWith(".")) { o.domain = o.domain.replace(/^\.+/, ""); fixedDomains++; }
  const row = bestRow(o);
  if (row) {
    if (/^https:\/\/mediabiasfactcheck\.com\//.test(row["MBFC URL"] || "")) { o.mbfcUrl = row["MBFC URL"]; linked++; }
    if (row.Country) o.country = row.Country;
    if (row["Media Type"]) o.mediaType = row["Media Type"];
  }
  const c = curated[o.domain];
  if (c) {
    Object.assign(o, c, { ownershipSource: "Curated by the authors from public company information; see MBFC review for more." });
    owned++;
  }
}

meta.fields = Object.assign(meta.fields || {}, {
  mbfcUrl: "Link to the outlet's Media Bias/Fact Check review page (opened by the Source tab's 'Learn about ownership' button).",
  country: "Country of the outlet per MBFC.",
  mediaType: "Media type per MBFC (Newspaper, TV Station, Website, ...).",
  ownershipSource: "Present when ownership comes from data/ownership-curated.json rather than a dataset."
});
meta.lastUpdated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
console.log(`outlets: ${meta.outlets.length}  mbfc links: ${linked}  curated ownership: ${owned}  leading-dot domains fixed: ${fixedDomains}`);
const missing = Object.keys(curated).filter((d) => !meta.outlets.some((o) => o.domain === d));
if (missing.length) console.log("curated domains not in the outlet list (ignored): " + missing.join(", "));
