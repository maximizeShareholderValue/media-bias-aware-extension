# Media Bias-Aware Browser Extension

Chrome MV3 extension that detects phrase-level linguistic bias in news articles
client-side, and shows outlet-level transparency metadata.

## Load it in Chrome

1. `chrome://extensions`
2. Enable "Developer mode" (top right).
3. "Load unpacked" -> select this folder.
4. Open a news article and click the toolbar icon.

## Run the unit tests

```
node --test test/pattern-matcher.test.js
```

No third-party test framework is installed - this uses Node's built-in
`node:test` runner (Node 18+).

## Project layout

```
manifest.json                MV3 manifest
lib/Readability.js           vendored @mozilla/readability 0.5.0
lib/compromise.js            vendored compromise 14.14.3 (UMD build)
data/pattern-catalog.json    Linguistic Pattern Catalog (edit freely, no rebuild needed)
data/outlet-metadata.json    Outlet transparency lookup table (14 sample rows)
content/pattern-matcher.js   rule matcher (pure function, Node-testable)
content/conflict-resolver.js overlap/priority resolution (pure function, Node-testable)
content/highlighter.js       DOM highlight injection + tooltip
content/highlighter.css      accessible highlight styling (light/dark)
content/content-script.js    orchestrates the 8-step pipeline
background/service-worker.js settings, NewsAPI lookup, catalog serving
popup/                       outlet metadata panel + settings UI
test/                        unit tests for matcher + resolver
```

## Implementation choices made where the spec was ambiguous

1. **Pattern catalog is not exposed via `web_accessible_resources`.** The
   content script fetches it from the background service worker via
   `chrome.runtime.sendMessage`, instead of the page fetching the JSON
   directly. Rationale: exposing bundled JSON to `web_accessible_resources`
   lets *any* website detect the extension is installed (a common
   fingerprinting vector) - message passing avoids that while keeping the
   catalog local-only.

2. **NewsAPI host permission is `optional_host_permissions`, requested at
   runtime**, not declared upfront in `host_permissions`. The popup calls
   `chrome.permissions.request()` only when the user clicks "Save key" in
   Settings. This matches the spec's framing of the NewsAPI call as
   genuinely opt-in - if it were a static `host_permissions` entry, Chrome
   would show "read and change data on newsapi.org" at install time even
   for users who never use the feature.

3. **POS constraints in the catalog are enforced via word-adjacency +
   exclusion lists, not strict tag equality.** I empirically tested
   Compromise 14's default lexicon against the seed words: it tags
   "radical", "hardline", and "extremist" as `Noun/Actor` by default, not
   `Adjective` (only "rabid" gets tagged `Adjective`). Requiring an exact
   `#Adjective` tag would silently fail to match the spec's own example
   ("radical faction"). Instead, `LL-007` fires when a trigger word is
   immediately followed by a noun-tagged word that isn't on
   `contextExclusions` (e.g. "surgery", "honesty") - this is what actually
   separates "radical faction" from "radical surgery" in practice. The
   `posConstraints.requiredTag` field in the catalog is kept as
   documentation of intent; see comments in `pattern-matcher.js`.

4. **`PS-003` (presupposition) is gated on "followed by `that` or a quote"**
   rather than requiring the subject be tagged `#Person`/`#Organization`,
   because Compromise does not reliably tag common-noun titles like
   "senator" or "spokesperson" as `Person`. The clause/quote check is what
   actually distinguishes the reporting-verb sense ("admitted that...")
   from unrelated senses ("admitted to the hospital").

5. **Highlight span = the trigger word/phrase itself**, not the trigger plus
   the noun it's checked against. Adjacent-but-distinct matches (e.g.
   "hardline extremist" containing two separate `LL-007` hits) are treated
   as two legitimate, non-overlapping highlights rather than merged into
   one span.

6. **Live-DOM article isolation**: Readability.js runs on a detached
   `document.cloneNode(true)` (its parsing is destructive and would
   otherwise visibly mutate the real page). To highlight in the *live* DOM
   without trying to graft Readability's cleaned HTML back onto it, live
   `<p>` elements are kept only if their normalized text also appears
   inside Readability's cleaned `textContent` - this is what strips
   nav/ad/comment paragraphs while highlighting real, on-page nodes.

7. **Accessibility**: highlight categories use a solid pastel background chip
   (matching the thesis UI mockup) distinguished by both hue AND
   `border-bottom-style` (solid/dashed/dotted/double/wavy), so category
   identity never depends on color alone. The chip's text color is forced
   dark (`!important`) regardless of the host page's own text color, since
   the pastel backgrounds are always light-toned - this is what keeps
   highlights legible on both light- and dark-themed news sites without
   knowing the page's styling in advance. The tooltip is a custom element
   (not the native `title` attribute) so its color pair is fully controlled
   and independently AA-compliant in both light and dark variants, and
   highlight spans are keyboard-focusable with an Escape-to-dismiss tooltip.

8. **Performance instrumentation**: the content script measures DOM-read-to-
   highlights-rendered time per the &lt;3000ms budget and logs a console
   warning if a page exceeds it, rather than silently doing nothing - there
   was no spec guidance on what should happen on budget overrun.

9. **Bias Index is a documented formula, not an opaque score.** It's
   `min(100, round((sum of matched rules' confidenceWeight / words analyzed) * 1000))`
   - i.e. confidence-weighted flagged phrases per 1,000 words, capped at 100.
   Every number that feeds it (confidenceWeight per match, word count) is the
   same data already visible in each highlight's tooltip, so this doesn't
   conflict with the "no opaque scoring" requirement, which is about
   per-phrase traceability. It's a deliberately simple, auditable metric for
   a thesis prototype, not a validated bias-measurement instrument - see the
   in-popup "Learn Methodology" panel for the same explanation shown to
   users. Reliability % is a fixed lookup from the outlet's
   `factualReliability` tier (Very High=95, High=80, Mostly Factual=65,
   Mixed=45, Low=20), also documented there.

10. **"Learn about ownership" expands inline instead of linking out.** The
    mockup shows an external-link-style affordance, but I didn't have a
    verified, specific URL to send users to for each outlet's ownership
    background (and didn't want to guess/fabricate one). It expands
    `ownershipDetail` (falling back to `sourceNote`) inline in the popup
    instead - same information, no invented link.

11. **Outlet domain matching uses a suffix match, not exact-hostname
    equality.** `popup.js`'s `hostnameMatchesDomain()` checks
    `hostname === domain || hostname.endsWith("." + domain)`, so a stored
    `abs-cbn.com` entry matches real traffic from `news.abs-cbn.com`. An
    earlier version only stripped a `www.` prefix and silently failed to
    match outlets that serve from other subdomains - caught by testing the
    Compare tab against a realistic ABS-CBN URL.

12. **Philippine outlets added to the sample dataset** (SMNI, Rappler,
    ABS-CBN News, GMA News) to match the thesis UI mockup's demo scenario
    (Duterte-era drug war coverage). Their ideology/reliability ratings are
    explicitly marked as illustrative placeholders for UI testing in
    `outlet-metadata.json`'s `sourceNote`/`_readme` - they are not
    independently verified and should be replaced with properly cited
    ratings before this goes beyond UI testing, especially given the
    human-rights-sensitive subject matter of the demo topic.

13. **Pattern catalog expanded from 3 to 8 rules**, mined from two real
    corpora (MBIC/BABE - Spinde et al. - and the Wiki Neutrality Corpus -
    Pryzant et al.), documented in `docs/corpus-mined-bias-candidates.json`.
    Candidates were cross-validated (flagged by BOTH the annotator corpus
    AND WNC's biased/neutral edit pairs) before being hand-engineered into
    rules - raw word frequency alone wasn't enough, since e.g. `regime` and
    `propaganda` both have legitimate neutral senses that needed explicit
    `contextExclusions`, and `terrorist`/`terrorists` tag completely
    differently in Compromise depending on whether they're used attributively
    or as a standalone noun (confirmed empirically, see LL-008 below). This
    also seeded the first rules for `ATTRIBUTION_FRAMING` (`AF-001`) and
    `EVALUATIVE_MODIFIER` (`EM-001`), which previously had none.

14. **`posConstraints.constraintType` replaced the old hardcoded
    "if category === PRESUPPOSITION" dispatch** in `pattern-matcher.js`.
    That worked for 3 patterns but broke down once `AF-001`
    (`ATTRIBUTION_FRAMING`) needed the same reporting-verb/clause-quote gate
    as `PS-003` (`PRESUPPOSITION`) - category and matching-strategy are
    separate concerns, so dispatch is now keyed on an explicit
    `constraintType` string (`precedesNoun` / `standaloneLabel` /
    `reportingVerb` / `phraseLevel`) instead of category name.

15. **New `standaloneLabel` constraint type** for words that ARE the loaded
    label themselves (`extremist(s)`, `terrorist(s)`, `racist(s)`,
    `propaganda`, `regime`), as opposed to `LL-007`'s original words which
    modify a following noun (`radical faction`). Compromise tags e.g.
    singular attributive "a terrorist organization" as `Adjective` but
    plural standalone "terrorists attacked..." as `Noun` - confirmed
    empirically - so this constraint just requires the trigger be tagged
    `Noun` or `Adjective` and checks BOTH neighboring words against
    `contextExclusions`, since the neutral sense can sit on either side
    (`exercise regime` excludes via the preceding word, `propaganda poster`
    via the following word).

16. **`extremist`/`extremists` moved from `LL-007` to the new `LL-008`.**
    They don't reliably behave like `radical`/`hardline`/`rabid`
    (adjective-before-noun); "terrorists attacked..." has no following noun
    at all. Splitting them into a dedicated `standaloneLabel` rule was
    cleaner than stretching `LL-007`'s adjacency gate to cover both syntactic
    patterns.

## Not yet implemented / left for you to expand

- `data/pattern-catalog.json` has 8 rules across all 5 categories now, but
  is still far from exhaustive - `docs/corpus-mined-bias-candidates.json`
  has 133 more corpus-validated candidates if you want to keep expanding it.
  `SPECULATIVE_CONSTRUCTION`/`ATTRIBUTION_FRAMING` in particular would
  benefit from phrase-pattern (bigram/trigram) mining rather than
  single-word mining, since hedging constructions like "some say" aren't
  single loaded words.
- `data/outlet-metadata.json` now has 8,849 entries (merged from the full
  MBFC rating database + AllSides community ratings for domains MBFC didn't
  cover), so this is effectively done - see the dataset's own `_readme`
  field for full provenance.
