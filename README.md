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

The frontend runs at `http://localhost:5173/totalwork_hh/` and uses the deployed Worker API. To test a local API, run `npx wrangler dev --config wrangler.jsonc` with a local `.dev.vars`; adjust `web/api.ts` temporarily if needed. The local file is ignored by Git.

```bash
npm run typecheck:pages
npm run typecheck:worker
npm run build:pages
npm run deploy:wrangler
```

The legacy Next.js source in `src/` is retained for reference; GitHub Pages builds only `web/`. Do not run the Next.js or vinext deploy scripts for production.

## Discord OAuth

Register this exact redirect URI in the Discord Developer Portal:

`https://totalwork-hh.sealseapep.workers.dev/api/auth/callback/discord`

The Worker completes OAuth and redirects to GitHub Pages with a short-lived signed token in the URL fragment. The frontend immediately removes that fragment from the address bar, stores the token in session storage, and sends it in an Authorization header to the Worker. Closing the tab ends the browser session. The Worker checks active membership on each request.

## Configuration

Set the following Cloudflare Worker secrets (they have already been uploaded to this account): `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. The unused `DISCORD_BOT_TOKEN` is also present but the current API does not need it. Files `.env.local` and `.dev.vars` are ignored by Git. The Discord client secret and bot token shared in chat should be rotated.

## Sheets

The API uses these tabs: `Members`, `Tasks`, `Notifications`, `Issues`, `Updates`, and `Announcements`. The frontend supports task assignment, Kanban status changes, notifications, issue reporting, and daily updates. Admins and leads may assign tasks; members may update their own tasks; viewers may only read. Membership and roles come from `Members`.

## Design

The dashboard layout was inspired by [shadcn/ui dashboard blocks](https://ui.shadcn.com/blocks), which are [MIT licensed](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md). The application code and content are specific to Hamster Hub.
