# Sourcebook v11 — Grouped Library & Sourcing Lab (books, magazines and mooks)

Upgrade for the existing Sourcebook Japanese sourcing app on Railway/Express/PostgreSQL. v11 includes all of v10's library, Search Profiles, translations, and best-effort image recovery.

## New in v11

**Grouped Library (default)**: the previous Library is now a publication-level Library; the new **Purchases** tab preserves all individual FromJapan records and existing editing/following controls. Sourcebook consolidates identical ISBNs or confidently identified copies of the same edition. Different magazine issues, book volumes, reprints, edition variants and bulk lots are conservatively kept separate. Click a publication to expand its original purchase records and see links, prices and order details. A **Duplicates only** switch shows just multi-purchase publications. **Possible duplicate matches** are a review queue only, never merged automatically. You can manually group candidate publications, separate purchases, or reset to automatic matching. Groupings persist in `state.items[*].duplicateOverride`; no purchase is deleted.

**Sourcing Lab**: a ranked shortlist of relevant print listings, seller name and seller-watch buttons **when actual seller metadata is retrievable**, basic multi-book lot detection, and illustrative UK landed costs. Set your own JPY→GBP assumption, allocated proxy fees, postage, import costs and expected retail price; profit is *gross* and ignores overhead, VAT treatment and other unentered costs. It is not a live exchange-rate feed or a quote. Edit assumptions in the app; they persist.

**Related research**: generates publisher, back-issue and adjacent-subject Japanese searches from identified purchases, with FromJapan, Suruga-ya and Mandarake search links. These are *search leads, not confirmed new titles or verified live inventory*. Known print sources are not scraped or indexed automatically beyond the previous Mercari/Yahoo monitoring. Use the existing Taste Profile to adjust discovery searches.

**Cover-photo review (optional)**: When `OPENAI_API_KEY` is available, explicitly click **Analyse available cover photos** to send up to 3 visible marketplace photographs to the OpenAI API for visual-format and style observations. This may be charged separately. It is not a perceptual-image duplicate engine; missing marketplace images cannot be analysed and the AI may be wrong.

**Discovery digest**: **Export 20-item digest** downloads an *on-demand JSON* shortlist of deduplicated recommended print listings, with links, prices and rationales. It is **not** a scheduled weekly email or background alert.

**Tests**: V11 adds duplicate/issue/edition/bundle and route migration tests. These run without live marketplaces using `node --test test/v11.test.js test/v11-api.test.js`. The build environment could not install Cheerio because npm DNS access failed, so marketplace extraction and a deployed browser test are not verified. Check logs after deployment, and check that your own magazine variants have not been grouped incorrectly. If anything is wrong, split it — the original records are preserved.

---

## Install without losing your data

1. In Sourcebook, select **Backup** and save the exported JSON privately before updating.
2. Unzip the download and copy **everything inside `fromjapan-sourcing-app/`** to the root of your existing GitHub `fromapan` repository, replacing files with the same names. Don't delete the Railway Postgres service or its environment variables.
3. Commit your changes. Keep the Railway **Root Directory blank**. Railway should redeploy automatically.
4. Visit Sourcebook → **Library · Grouped** to review duplicate groups, **Purchases** for the original individual imports, and **Sourcing Lab** for research, seller signals and estimated costs. Your existing **Taste Profile** and **New Listings** tabs remain.
5. **New Listings** now starts with **Recommended print only**. Use **Needs review** to rescue printed items whose titles are ambiguous; use **Non-print excluded** to inspect mistaken exclusions. Existing listings are not deleted.

Existing database records are left intact. On first startup, `state.v11` is initialised in the same `app_state` JSONB row and existing `state.curation` is retained; prior item identities, search profiles, thumbnail URLs, follow settings, translations, and discovered listing records remain unchanged.

## What is new

- **Format comes first:** Recognises explicit publication terms (本, 雑誌, ムック, 図鑑, 写真集, 書籍, パンフレット, etc.). Excludes actual audio cassettes, VHS, DVDs, records, game cartridges, figures, cards and clothing. A printed book **about** cassettes or games is still permitted. Ambiguous titles go to **Needs review**, not silently assumed to be printed.
- **Editorial taste profile:** Explainable scores based on nine categories: vintage Japanese magazines, printed graphic design, cinema, horror/kaiju/SFX, game visual history, avant-garde illustration, photobooks, subcultures and vintage adult magazine graphics. Stock overlap boosts relevant items; thematic labels explain each recommendation. Scores are ranking heuristics **out of 100**, not probabilities.
- **Lock Books stock:** Includes an offline snapshot of ~30 publicly listed Lock Books titles and sold-out examples, taken from public web pages in October 2026. **Refresh Lock Books catalogue** requests the public Shopify `products.json`; if unavailable, it tries public collection pages (Japanese, magazines, books) and labels the result as a partial sample. An unsuccessful sync preserves the previous catalogue and shows the error. No Shopify account connection or store-writing permission is used. This is a public catalogue, not private stock/inventory quantities.
- **Adjacent interests:** Japanese Avant-Garde Books and Japan Book Hunter public shop categories inform the built-in thematic rules. Instagram posts have **not** been fetched, monitored or analysed.
- **Curated discovery searches:** Enable/disable 14 print-specific example searches, or add your own Japanese searches by category. The monitor rotates through followed searches rather than scanning only the same first eight, and reserves one of eight slots for enabled curated searches. The total remains bounded to eight queries per run, multiplied by the two marketplaces. Automatic runs still require `MONITOR_ENABLED=true`.
- **Feedback:** Click **Interested** or **Not for me** on printed listings. Preferences persist in Postgres and gently affect future rankings for the same themes. For uncertain or excluded objects, use **It is print** or **Not print** to correct the format. **Reset feedback** removes the correction.
- **Optional AI:** Configure `OPENAI_API_KEY` in Railway to enable **AI review unclear formats** in Taste Profile. This is **off by default and requires an explicit click**; it sends up to 16 selected marketplace titles (not images) for title-based format classification and theme-fit scoring. The requests can incur fees on your API account, separate from ChatGPT. AI scoring is labelled; results are advisory and may make mistakes. Existing `OPENAI_MODEL` overrides the default `gpt-4o-mini`.

## Important behaviour and limitations

- Default recommended results deliberately favour **precision over recall**. An unknown book without clear format evidence may be hidden under **Needs review**. You can rescue it; a known non-print item isn't recommended just because its title says “SEGA” or “Godzilla”.
- The earlier marketplace collector and enrichment still depend on publicly accessible Mercari/Yahoo pages. These sites may block scraping, change markup, omit thumbnails or return unavailable listings. v10 does not bypass rate limits or guarantee real-time search coverage.
- Neither Instagram account is integrated. The reference influence comes from the public shops' categorical overlap and public Lock Books catalogue, not from private or unpublished Instagram content.
- The dynamic stock refresh is best-effort; test it after deploying. The package retains a useful local snapshot if public endpoints are unavailable.
- The user preference state, search suggestions, profiles, and catalogue all live in the existing database. Do not delete or reset PostgreSQL while updating.
- Do not upload your historical purchases (`history.json`, `items.csv`, older populated `data/seed.json`) or exported backups to a public repository. The packaged `data/seed.json` is intentionally `[]`.

## Local tests

`npm install && npm test` from the project root. The tests for identification, curation, and migration/feedback API handlers do not require installed dependencies:

```bash
node --test test/intelligence.test.js test/curation.test.js test/curation-api.test.js
```

**Development validation:** The 21 tests above passed in the build environment, and JavaScript syntax checks passed. `npm install` was unavailable due to DNS/network restrictions, so the Cheerio-backed marketplace extraction tests and a live Railway/browser deployment could not be verified here. Please test on your Railway deployment before relying on the recommendations.
