# Sourcebook — FromJapan sourcing library

A deployable Node.js app with your FromJapan history preloaded. Generates Japanese search ideas, provides marketplace search links, follows/unfollows items and searches, supports bulk selection, and imports CSV/JSON exports without duplicates.

## Deploy to Railway

1. Create a private GitHub repository and upload this folder's contents (not the enclosing folder).
2. In Railway, create a new project → Deploy from GitHub repo.
3. Add a Railway PostgreSQL service to the project.
4. In the web service's Variables, set `DATABASE_URL` to the PostgreSQL connection string (use Railway's variable reference if available).
5. Deploy. Railway detects `npm start` and supplies `PORT` automatically.
6. Set up a Railway public domain under the service's Networking settings.

The app creates its table and imports the included seed history on first launch. Subsequent deployments preserve edits in PostgreSQL. Without `DATABASE_URL`, local changes are saved to `data/store.json` but **will not survive Railway redeploys** without persistent storage.

## Run locally

`npm install && npm start` then visit http://localhost:3000.

## Important limitations

- Marketplace buttons open live search pages, but this release **does not automatically fetch listings or send alerts**.
- Search suggestions use offline title heuristics, not AI translation; review them before following.
- The original export contained generic image placeholders; these are excluded. Image URLs may expire or block hotlinking.
- The app does not include authentication. Keep the deployment private until login protection is added. Anyone with its public URL can view and modify the collection.
- The seed contains purchase history, including product prices and source URLs. Do not publish the repository publicly.
