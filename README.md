# Totalwork HH

Team workspace with Discord login, a static frontend on GitHub Pages, and a Cloudflare Worker API backed by Google Sheets.

## Deployment layout

- **Frontend:** `web/` is built by `.github/workflows/deploy-pages.yml` and published at https://pepsealsea.github.io/totalwork_hh/ on each push to `main`.
- **API:** `worker/` is deployed independently with `npm run deploy:wrangler` to https://totalwork-hh.sealseapep.workers.dev. GitHub Actions does not deploy the Worker.
- **Data:** the Worker reads and writes spreadsheet `1AjOYO0EwPoUUOgUKjo47Dv0ZDuXccspJfYZtDDZdzP0` using its Cloudflare secrets. No Google or Discord secret is bundled in the frontend.

Only active Discord IDs in the `Members` sheet may use the API. Pep (`933205385194639400`) is the admin. GitHub Pages hosts public static files, so the login screen itself is visible to anyone; team data and writes are protected by the Worker.

## Local development

```bash
npm ci
npm run dev:pages
```

The frontend runs at `http://localhost:5173/totalwork_hh/` and uses the deployed Worker API. The Discord OAuth redirect is the production Pages URL, so test the actual login on GitHub Pages. To test a local API, run `npx wrangler dev --config wrangler.jsonc` with a local `.dev.vars`; adjust `web/api.ts` temporarily if needed. The local file is ignored by Git.

```bash
npm run typecheck:pages
npm run typecheck:worker
npm run build:pages
npm run deploy:wrangler
```

The legacy Next.js source in `src/` is retained for reference; GitHub Pages builds only `web/`. Do not run the Next.js or vinext deploy scripts for production.

## Discord OAuth

The Discord Developer Portal must contain this exact redirect URI (including the trailing slash):

`https://pepsealsea.github.io/totalwork_hh/`

The frontend requests a Discord authorization URL and a signed state value from the Worker, stores the state in session storage, and sends the browser to Discord. Discord returns a one-time code to GitHub Pages. The frontend compares the returned state with the stored value, removes the code from the address bar, and sends the code to the Worker. The Worker exchanges it using the client secret, checks membership, and returns a short-lived signed session token. Closing the tab ends the browser session. The Worker checks active membership on each API request.

## Configuration

Set the following Cloudflare Worker secrets (they have already been uploaded to this account): `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. The unused `DISCORD_BOT_TOKEN` is also present but the current API does not need it. Files `.env.local` and `.dev.vars` are ignored by Git. The Discord client secret and bot token shared in chat should be rotated.

## Sheets

The API uses these tabs: `Members`, `Tasks`, `Notifications`, `Issues`, `Updates`, `Announcements`, and `AnnouncementComments`. The Worker creates `AnnouncementComments` when it is first needed. New announcements can include a meeting topic, a Markdown summary, and an optional raw `.txt` transcript. Raw text is stored in chunks in columns I:Z of `Announcements` and fetched only when a member downloads it. Announcement authors can edit their posts and attach a transcript later. Signed-in members can comment, and comment authors or admins can delete comments; viewers may only read. Membership and roles come from `Members`.

## Design

The frontend uses a compact icon rail, line separated work lists, and popups for editing. The default theme is dark. The layout follows the visual reference supplied for this project; the code and content are specific to Hamster Hub.
