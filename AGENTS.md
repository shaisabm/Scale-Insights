# Project rules

Scale PPC is a static web app with Vercel Functions behind it. `app/build.mjs` copies `app/src/` to `app/dist/`, which Vercel serves; `api/` holds the functions that serve live data.

## Code layout

- `app/src/*.js` are classic browser scripts (IIFEs sharing `window.SP`, no imports or exports). `app/src/index.html` loads them in order: `core.js`, `sales.js`, `products.js`, `ads.js`, `more.js`, `account.js`, `optimizer.js`, `app.js`.
- Types for the shared globals live in `app/types/globals.d.ts`.
- `app/dist/` is build output and is gitignored. Never edit or commit it.
- Most pages still show invented sample data (`SP.period`, `SP.PRODUCTS` and per-page constants). A page with live data defines `load()`, which `route()` in `app.js` awaits before calling `render(data)` and `wire(root, data)`. It fetches through `SP.api.get/post`, which sends a signed-out person to `/Identity/Login`. So far only `/Ads/AdvertisingTrend` is live.
- `app/build.mjs` writes `window.SP_ENV` (Vercel's `VERCEL_ENV`, or `development` outside Vercel) into every page. Production always uses the real account. Preview deployments and local development start on sample data and show a "Real data" switch in the top bar (`SP.usesRealData()`, remembered in `localStorage` as `sp-data-source`). A live page's `load()` returns sample data in the API's shape while the switch is off, so it needs no sign-in.
- `api/` are Vercel Functions using the Web signature (`export async function GET(request)` returning a `Response`). Shared server code lives in `server/`: `amazon/` (Login with Amazon tokens and the Ads client), `ads/` (sync and queries), `auth.js`, `db.js` (Turso) and `http.js`. ES modules, no build step.
- `scripts/` are local tools; `tests/` are the Vitest suites.

## Commands

In `app/`:

- `npm ci`: install dependencies
- `npm run build`: write `dist/` (Vercel runs `cd app && npm run build`)
- `npm run lint`: ESLint for `app/`
- `npm run typecheck`: TypeScript check

At the repo root:

- `npm ci`: install server and test dependencies
- `npm test`: Vitest, server and app tests
- `npm run lint`: ESLint for `api/`, `server/`, `scripts/` and `tests/`
- `npm run sync:ads`: run the Amazon Ads sync from this machine with `.env.local` (reads only; waits up to 10 minutes for Amazon's reports)

CI (`.github/workflows/ci.yml`) runs Lint (both configs), Typecheck and Test on every PR.

## Live link

The owner checks work in progress from other devices through a private Tailscale link to this machine's dev server. At the start of every session, check whether the link is running. If it isn't, start it. Either way, give the user the link.

- Check from the repo root:

  ```bash
  host=$(tailscale status --json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).Self.DNSName.replace(/\.$/, "")')
  curl -s -o /dev/null -w '%{http_code}\n' "https://$host/Ads"
  ss -ltn | grep -q ':3005 ' || echo "dev server not running"
  pgrep -f "[t]ailscale serve 3005" >/dev/null || echo "share not running"
  pgrep -f "[w]atch-path=./src" >/dev/null || echo "watcher not running"
  ```

  `200` and no other output means all three are up. `tailscale serve status` says "No serve config" even while the share runs, so don't go by it.
- Start whatever is missing, each as a long-running background process:
  1. `vercel dev --listen 3005 --yes` at the repo root: the app and the `api/` functions with the Development variables.
  2. `node --watch-path=./src --watch-preserve-output build.mjs` in `app/`: rebuilds `dist/` within a few seconds of each save in `app/src/`. A new file may need a `vercel dev` restart before it's served.
  3. `tailscale serve 3005`: shares port 3005 over HTTPS with the owner's tailnet only and prints the link. It runs in the foreground, so nothing stays configured once it stops. The user is Tailscale's operator on this machine, so it needs no `sudo`. Never use `tailscale funnel`, which puts the app on the public internet, or `--bg`, which keeps the share configured.
- Give the user `https://$host/Ads` and tell them to reload to see changes. The "Real data" switch and the app password work there because the link is HTTPS.
- On a machine without `tailscale`, tell the user the link can't be made there.

## Amazon APIs

- **Agents only read from the real profile Shaisab. They never write to it.** That holds for the Amazon Ads API, the SP-API production app and any other route, such as the deployed app's UI: no creating, changing, pausing or deleting campaigns, keywords, bids, budgets, listings, prices or anything else. When a task needs a write, do it in a sandbox, test or demo account, such as the SP-API sandbox (`sandbox.sellingpartnerapi-*.amazon.com`) or an Amazon Ads test account.
- Amazon Ads has no separate sandbox host. The old `advertising-api-test.amazon.com` is retired and returns 503. Ads test accounts run on the production hosts (`advertising-api.amazon.com`, `advertising-api-eu.amazon.com`, `advertising-api-fe.amazon.com`), don't serve ads and don't bill. Only write there when the `Amazon-Advertising-API-Scope` header is a test account's profile ID, meaning its `accountInfo.id` matches an `id` from `GET /testAccounts`.
- Creating Ads test accounts (`POST /testAccounts`, type `VENDOR` or `AUTHOR`) needs a refresh token from a separate Amazon login that manages no real ad accounts, granted `advertising::campaign_management` and `advertising::test:create_account`. Amazon blocks test-account creation for logins that manage real ad accounts, including the one behind `AMAZON_ADS_REFRESH_TOKEN`.
- The test login (`AMAZON_ADS_TEST_REFRESH_TOKEN`) has one US `VENDOR` test account: profile ID `1929247901688721`, `accountInfo.id` `ENTITY3DXOXTNJGU62E`. It has no products (no vendor code). `GET /testAccounts?requestId=…` returns a single object, not the list the docs show.
- Writes to the real profile are for the app's human users, in production.
- Send every Amazon Ads call through `createAdsClient` in `server/amazon/ads.js`. Its write guard (`assertAllowed`) lets reads through (GETs, report requests, the `/product/metadata` lookup, `/list` endpoints) and allows a write on the test profile, or when `VERCEL_ENV` is `production` and the caller passes `humanApproved`. Never bypass or loosen it.
- The real profile's seller ID and its Ads profile ID (`AMAZON_ADS_PROFILE_ID`, the US seller profile) are sensitive. Never write them in code, comments, docs, commits, PRs, logs or messages. Call the profile Shaisab.
- Ads data flow: `/api/sync/ads` requests daily reports (Sponsored Products per advertised ASIN for 90 days, Sponsored Brands and Sponsored Display per campaign for 60 days, which is as far back as Amazon keeps them), waits for them, and stores them in Turso (`ads_daily`, `ads_synced_days`, `ads_report_requests`). Missing days are fetched once and the last 14 days are refreshed daily. Vercel Cron calls it at 13:00 and 14:00 UTC; signed-in people can also POST to it ("Sync now"). Pages read from Turso through `/api/ads/trend`, never from Amazon directly.
- The keyword insights ("Keywords with 0 Sales" and "Keywords with High ACOS", each a `filterId` with its own saved settings) read the daily targeting reports (`SP_TARGETING` for 90 days, `SB_TARGETING` and `SD_TARGETING` for 60 days), which the same sync stores in `ads_targets_daily`, through `/api/ads/keywords`. Each keyword's current bid comes from the ads lists the sync reads (`ads_keyword_bids`, next to `ads_keyword_states`), else the bid last reported. Each keyword's product is what its ad group advertised: Sponsored Products through `ads_daily`, Sponsored Brands through `ads_search_product_history`, and Sponsored Display through its current product ads list (`ads_sd_product_ads`), since its reports name no product.
- The Advertising trend page's first table adds up every ad type and matches the Ads console's Performance chart when the console shows all campaigns. The console can hide paused or archived campaigns through its status filter, and those still count here for the days they ran.
- Every `/api` route that returns account data must start with `requireUser` from `server/auth.js`. Sign-in is one shared password (`APP_PASSWORD`) and a signed `sp_session` cookie.
- Credentials are environment variables in `.env.local` (gitignored) and on the Vercel project `scale-insights` (Secrets in Production and Preview, plain encrypted variables in Development). `.env.example` lists the names:
  - `SP_API_SANDBOX_CLIENT_ID`, `SP_API_SANDBOX_CLIENT_SECRET`: SP-API sandbox app
  - `SP_API_PROD_CLIENT_ID`, `SP_API_PROD_CLIENT_SECRET`: SP-API production app
  - `AMAZON_ADS_CLIENT_ID`, `AMAZON_ADS_CLIENT_SECRET`, `AMAZON_ADS_REFRESH_TOKEN`: Amazon Ads API
  - `AMAZON_ADS_TEST_REFRESH_TOKEN`: Amazon Ads API, separate test login that manages no real ad accounts. Use it for creating and writing to Ads test accounts.
  - `AMAZON_ADS_PROFILE_ID`: the real US profile (reads only). `AMAZON_ADS_TEST_PROFILE_ID`: the test account's profile.
  - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: the Turso database `scale-insights-database`, added on Vercel by the Turso integration
  - `APP_PASSWORD`: the sign-in password, a readable (not Secret) variable on Vercel so the owner can look it up. `SESSION_SECRET` signs session cookies. `CRON_SECRET` authenticates Vercel Cron.
- They are server-side secrets. Read them only in server code (`api/`, `server/`, `scripts/`), never in `app/src/`, which is copied to `app/dist/` and served publicly.
- Never print or commit credential values. `vercel env pull` rewrites `.env.local` from the Development variables.

## Commits and pull requests

- Commit only as the repo-local git identity (Shaisab Mistry, already set in `.git/config`). No co-authors.
- No `Co-Authored-By` trailers, no "Generated with ..." lines, and no mention of the tools or assistants used to make a change. This applies to commit messages, PR titles and bodies, branch names, code comments and committed files.
- Every change goes through a branch and a PR into `main`. Never commit to or push `main` directly. The `main` ruleset rejects direct and force pushes and requires a PR, a successful Vercel deployment and Copilot code review.
- Keep `.codex/` out of commits. It is excluded locally through `.git/info/exclude`.

## Tests

- Every change to app code ships with unit tests for the new or changed behavior, in the same PR. They must pass locally and in CI before the PR goes up.
- A bug fix includes a test that fails without the fix.
- If a change has nothing unit-testable (CI config, docs, pure renames), say so in the PR description.
- Tests use Vitest (`npm test` at the repo root). Server tests run in Node; `tests/server/` uses in-memory libSQL databases (`createClient({ url: ":memory:" })`) and fake Amazon clients, never the real APIs. App tests start with `// @vitest-environment happy-dom` and use `tests/app/load-app.js`, which loads the `app/src` scripts in `index.html` order, stubs `fetch` and records `location.assign`.

## GitHub access

- `origin` is SSH. Pushes authenticate as `shaisabm` through the repo-local `core.sshCommand`. Don't change global git or gh config for this repo.
- The globally active gh account can't see this private repo and should stay active. Pass a token per command instead of switching accounts:

  ```bash
  GH_TOKEN="$(gh auth token --hostname github.com --user shaisabm)" gh pr create ...
  ```

## Branch-switch trap

The first commit (`48b3f72`) still tracks `agent-session.jsonl`, `build-activity.log`, `app/dist/`, `inbox/` and `.idea/`, which are now gitignored live files. Checking out that commit overwrites them, and moving forward again deletes them. Never check it out.

To update local `main`, run this from a branch where those files are already untracked:

```bash
git fetch origin && git branch -f main origin/main && git switch main
```
