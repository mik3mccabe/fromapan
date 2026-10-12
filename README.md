# Sourcebook v2 — Railway deployment

Replace the files in your existing GitHub repository with **the contents of this folder**, not the parent folder. Railway will redeploy automatically.

## Railway variables

- `DATABASE_URL`: reference your PostgreSQL database (`${{Postgres.DATABASE_URL}}`). Keep the same database from v1 to preserve follows/imports.
- `APP_PASSWORD`: **strongly recommended**. Protects the entire app with HTTP Basic authentication. Username can be anything; password is this value.
- `MONITOR_ENABLED=true`: enables an hourly best-effort check for followed searches. Omit/false for manual-only checks.

## Monitoring limitations

The app attempts public HTML searches on Yahoo Auctions and Mercari. Neither site is guaranteed to permit automated server-side requests, and both can change their markup or block Railway IPs. The Diagnostics panel displays errors and zero-results. A check can find only URL references, not reliable price/image/title details. It checks up to 8 distinct followed queries per run, across 2 marketplaces, to limit load. No notifications, background queue, authenticated scraping, or guaranteed monitoring is provided. Additional sources (Mandarake, Suruga-ya, Rakuten) remain manual search links.

## Buying through FromJapan

The primary button opens FromJapan. The listing panel offers **Copy URL** for the original marketplace listing to paste into FromJapan's URL-order flow. There is no verified one-click deep link to FromJapan for arbitrary listings, so the app deliberately does not invent one.

## Data safety

Keep your GitHub repository private and set `APP_PASSWORD` before generating or sharing a public Railway domain. The bundled `data/seed.json` contains purchase titles and links, and should not be placed in a public repository. Your previous database remains intact if you reuse the same PostgreSQL instance.

## Version 3 additions
- Working FromJapan keyword search URLs (using the user-supplied search path).
- Library / Search Ideas / Trash views; bulk trash, restore and permanent delete. Trashed items are retained across reimports. Permanent deletion does not prevent future reimport.
- Japanese + English display; editable English glosses. Automatic glosses are rule-based and incomplete, not professional machine translation.
- Manual thumbnail URL and file upload (small images saved within app state). Image uploads above approximately 850 KB may be rejected. Automated image discovery is not implemented.
- Existing Postgres data remains in the same app_state row; do not remove the database.
