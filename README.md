# Sourcebook v9 — Intelligent Search Profiles

An upgrade to the existing Sourcebook app (Node 20+, Express, Railway, PostgreSQL). Rather than truncating Japanese seller titles, v9 tries to identify the **book, magazine, issue or other product** before generating searches.

## Update the Railway app

1. In Sourcebook, use **Backup** to save your current archive. Keep it private.
2. Unzip and copy the **contents** of `fromjapan-sourcing-app/` into the root of your existing GitHub `fromapan` repository. Replace matching files; do not move the source into a subdirectory.
3. Commit. Keep Railway **Root Directory blank** and keep your existing `DATABASE_URL`, `APP_PASSWORD`, and `MONITOR_ENABLED` variables unchanged.
4. When Railway deploys, refresh Sourcebook. All existing items, followed searches, manually entered translations, images and new-listing records are retained in your existing PostgreSQL database.

**Private data:** The packaged `data/seed.json` is intentionally an empty array. Previous versions included private purchase-history data in this file. Do not commit personal `history.json`, `items.csv`, backups or a previous populated seed file to a public repository. If installing from scratch, import your private archive through the app instead of committing it to GitHub. Store backups somewhere private.

## New features

- **Product identity before search suggestions:** Understands 40+ recognisable publications and products, handles Japanese eras and Western years, and separates ISBNs from title searches. It strips shipping terms, seller stock codes and condition notes. A noisy auction title is *not* automatically treated as a search term.
- **Better search quality:** Shows a product core term, valid alternatives, useful year/month refinements for magazines, publisher refinements for books and exact ISBN searches when available. If confidence is low, shows **Needs review** rather than a fabricated keyword.
- **Search Profiles:** New navigation tab groups purchases for the same product or publication. Magazine issues roll up to one publication profile. Follow a profile to monitor its query instead of following individual seller listings. You can edit the profile's name and query.
- **Manual correction that sticks:** Use **Edit identity** on any card to correct its canonical Japanese title, English title and item type. You can optionally apply the correction to all items in that existing profile. The result is saved in PostgreSQL and is not overwritten by the next startup. Existing followed searches are preserved, marked as Saved when no longer automatically recommended.
- **ISBN catalogue lookup:** **Verify ISBN** on applicable cards queries OpenBD, a third-party Japanese bibliographic catalogue, to verify the title and publisher. Only the ISBN is sent, and only when you click.
- **Optional AI assistance:** Add `OPENAI_API_KEY` to Railway Variables to activate **AI identify unclear**. You must click and confirm; Sourcebook then sends up to 24 unclear listing titles per click to the model, in batches of 8. You can also select particular items to identify. The app displays job progress. `OPENAI_MODEL` is optional; defaults to `gpt-4o-mini`. Requests are **billable** under your API account, separate from any ChatGPT subscription. Uploaded auction titles may be sent to the model provider. Do not enable this if your purchasing data must not be sent externally. AI output is labelled as **Needs review** and is validated rather than being treated as verified catalogue facts.
- **Existing image recovery:** v8's background image backfill, marketplace checking and listing translations remain included.

## Behaviour and limitations

The deterministic identifier is conservative; it cannot know every rare Japanese book title. In the supplied archive tested for this update, 224 of 269 usable listings matched known titles/publications, and the remaining 45 were flagged for review rather than automatically fabricated. 31 of those 45 did not have a reliable search term until reviewed. Counts depend on your current data.

A manual correction can be applied across items sharing a profile, but only after you explicitly approve doing so. Corrections to unrelated titles are not assumed to be the same book. AI results are suggestions, not bibliographic verification. The ISBN lookup may fail for books not indexed in OpenBD. You can still edit manually.

For hourly monitoring, profile searches have priority but the app currently checks only the first eight distinct followed queries per run; source sites can block requests. No guaranteed alerts, no CAPTCHA circumvention. New Listings does not imply purchase availability.

English title translations still use optional `DEEPL_API_KEY` or the AI identifier's English title (when enabled); no paid third-party API is used without configuring your own key.

## Tests

`npm install && npm test` (requires access to npm dependencies). The pure identification tests can be run without installing dependencies: `node --test test/intelligence.test.js`.
