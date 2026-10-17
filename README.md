# Sourcebook v5

Japanese sourcing library for Railway. Replaces overly-specific seller listing searches with a **core publication/product term**, and optional year/month refinements. Search Ideas are consolidated across purchases.

## Upgrade

Upload the **contents** of `fromjapan-sourcing-app/` to the root of your GitHub repository, replacing matching files. Leave Railway's Root Directory empty. Keep `DATABASE_URL`, `APP_PASSWORD`, and `MONITOR_ENABLED` as before. The app re-generates suggestions on startup; manually edited item translations are preserved. Back up first using the **Backup** button.

## Translations

The built-in title glossary only covers recognized publications and categories. It intentionally leaves unknown titles untranslated rather than producing misleading partial translations. To translate other titles, configure a DeepL API key in Railway Variables:

- `DEEPL_API_KEY`: your DeepL API key
- `DEEPL_API_URL`: optional, `https://api.deepl.com/v2/translate` for a DeepL Pro key; defaults to the DeepL Free endpoint.

Then click **Translate missing titles** in Sourcebook. Each click translates up to 25 missing item titles; API usage may be billable depending on your plan. Manual edits override automatic translation and are retained. This feature requires the user's own DeepL key; it does not use a hidden translation service.

## Search intelligence

Recognizes known publications, strips seller additions and only uses the shortest meaningful publication/product phrase as the **Core** search. Year and month are optional **Refine** and **Exact** suggestions. For unrecognized titles, only short, unambiguous leading phrases are proposed; other titles receive no automatic idea rather than a misleading search. Search Ideas shows each distinct phrase once.

## Caveats

Marketplace monitoring is experimental and may not extract live listings; no guaranteed alerts. Database persists in PostgreSQL. Imported image data is stored in app state. Protect the app with `APP_PASSWORD` and keep your repo private if it contains purchase data.


## v6 — New Listings view

New Listings has its own navigation tab with compact image cards, marketplace filters, keyword search, original listing links and FromJapan searches. The monitor currently discovers URLs from marketplace HTML and often cannot retrieve actual product titles, images or prices. In those cases the UI explicitly shows unavailable metadata; it does not fabricate thumbnails or translations.

The **Translate listing titles** button uses `DEEPL_API_KEY` (DeepL API Free by default) for real Japanese listing titles when available. It cannot translate URL-only placeholder titles. Marketplace access may be blocked or require site-specific APIs.

## v7: marketplace metadata recovery

New listings use public search-result cards and embedded structured data to retrieve original Japanese titles, thumbnail URLs and yen prices where available. Existing URL-only discoveries can be retried using **Recover missing details** (up to 12 per click). The hourly monitor also retries a bounded set of incomplete listings. Translation still requires `DEEPL_API_KEY` and clicking Translate. Marketplaces may block automated access or change their markup; empty fields remain empty rather than fabricated. No proxy rotation, CAPTCHA bypass, or login scraping is used.

Tests: `npm test`.
