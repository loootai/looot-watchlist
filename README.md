<p align="center"><img src="assets/hero.png" alt="looot-watchlist: buying signals on your target accounts" width="100%"></p>

<p align="center"><img src="assets/screenshot-desktop.png" alt="Signals feed with the sidebar" width="68%"> <img src="assets/screenshot-mobile.png" alt="Signals feed on a phone, dark theme" width="22%"></p>

# looot watchlist

[![License](https://img.shields.io/github/license/loootai/looot-watchlist)](LICENSE) [![Release](https://img.shields.io/github/v/release/loootai/looot-watchlist)](https://github.com/loootai/looot-watchlist/releases) [![Docs](https://img.shields.io/badge/docs-docs.looot.ai-12A06A)](https://docs.looot.ai)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-watchlist&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,LOOOT_TOKEN&envDescription=Supabase%20project%20URL%20and%20anon%20key%2C%20plus%20a%20looot%20agent%20token&envLink=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-watchlist%23set-up&project-name=looot-watchlist&repository-name=looot-watchlist)

An open-source account watchlist for sales teams. You list the companies you sell to, and it checks each one for new news (funding, executive changes, launches, layoffs), new job posts that match the roles you care about, and changes on the pages you watch, such as `/pricing` or `/careers`. Everything new lands in one feed.

It runs on Next.js and Supabase (auth and Postgres), deploys to Vercel, and gets its data from [looot](https://looot.ai): one key and one prepaid balance for 2,500+ data API endpoints. A check of one account with two watched pages costs about $0.004 at the prices below. There is no seat price.

## What it does

- Sign in with email and password (Supabase Auth). Each user sees only their own accounts and signals: row level security on every table, `owner_id = auth.uid()`.
- Add an account: company name, domain, role words (`SDR, RevOps`), up to 5 pages to watch.
- Get a quote, confirm a maximum spend, run the check. The first check of an account records a baseline; later checks create signals for what is new.
- Read the feed, filter by type or account, mark signals read.
- Optional daily check through Vercel Cron, with its own spend cap.

## What one check runs

| Signal | looot job | Input | Price used for the quote (2026-10-08) |
|---|---|---|---|
| News | `job:news.search` | `"<company name>"` | $0.00099 per call |
| Hiring | `job:jobs.search` (only when role words are set) | company name plus role words | $0.00145 ($0.0005 per call, or $0.000145 per result x 10) |
| Page change | `job:web.scrape.markdown` per watched page | the page URL | $0.001 ($0.0002 per call, or $0.001 per page result) |

Prices come from the free public catalog (`GET https://api.looot.ai/v1/catalog/overview?depth=jobs`), cached for an hour, with the dated prices above as a fallback. The quote takes the higher of the per-call and per-result price, so it errs high. Each run uses `fallback` so looot tries the next provider when one misses.

## Spending rules

1. `/api/quote` (free) counts the runs and prices them.
2. The user confirms a maximum spend. `/api/check` refuses (HTTP 409) before any paid call when the estimate is above it.
3. Every run is capped with `fallback.maxCostUsd` (`PER_RUN_CAP_USD`, default $0.02). Before each run the checker lowers the cap to what is left of the maximum and stops when the next run no longer fits. The total cannot pass the confirmed maximum.
4. `MAX_CHECK_COST_USD` (default $1) caps any manual check; `CRON_MAX_COST_USD` (default $0.50) caps the daily run across all users.
5. Idempotency keys carry the account and the date, so a second check on the same day replays the stored runs at no cost.

`LOOOT_TOKEN` is read only in route handlers (`src/lib/looot.ts`, `src/app/api/*`). It is never sent to the browser: the build was checked with a canary token and `grep -r` over `.next/static` finds nothing.

## Set up

You need a Supabase project, a looot agent token, and Node 20 or newer.

1. Create a Supabase project. In Project Settings, API, copy the project URL and the anon key.
2. Apply the schema, from a clone of this repo:

   ```bash
   npx supabase@2.118.0 login
   npx supabase@2.118.0 link --project-ref <your-project-ref>
   npx supabase@2.118.0 db push
   ```

   Or paste `supabase/migrations/20261008000000_init.sql` into the SQL editor and run it.
3. Create a looot agent token at https://looot.ai/settings with `catalog.read`, `runs.read` and `runs.execute`, and top up from $5.
4. Copy `.env.example` to `.env.local`, fill in the three values, then:

   ```bash
   npm ci
   npm run dev
   ```

5. Deploy: click the Vercel button above, or import the repo in Vercel and set the same three variables.

### Daily check (optional)

`vercel.json` schedules `GET /api/cron` at 07:00 UTC. It does nothing until you set two more variables in Vercel:

- `CRON_SECRET`: any long random string. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.
- `SUPABASE_SERVICE_ROLE_KEY`: the service role key from Project Settings, API. Only the cron route uses it; it sets `owner_id` on every row itself.

## Tests

```bash
npm test            # vitest, looot mocked: 30 tests
npm run typecheck   # tsc --noEmit
npm run test:rls    # needs initdb/pg_ctl/psql: applies the migration to a throwaway Postgres and checks RLS
npm run build
```

The tests cover the looot client (request shape, polling, errors), price parsing, result extraction for several provider shapes, page change detection, the baseline rule, the spend guard (refuse above the maximum, never pass it while running) and failure handling.

## Limits

- Provider answers differ. `src/lib/extract.ts` finds the first list of items with a link and a title, which covers the common news and job shapes. If a provider answers in a shape it misses, the signal is lost, not invented.
- The app was built and tested without a live looot run or a live Supabase project. The first real check on your account is the live test: start with one account.
- Job board results mix in other employers. Postings are kept only when the employer name matches the account and the title matches a role word.
- Page change detection ignores dates and times but not other text that changes on every load. Watch stable pages.

## Layout

```
src/lib/looot.ts        looot client: run job:<id> with fallback and a cost cap, poll the run
src/lib/checker.ts      plan runs, estimate, spend guard, diff against what was seen
src/lib/extract.ts      read items and page text from provider answers, tag headlines
src/lib/prices.ts       prices from the public catalog
src/app/api/quote       free quote
src/app/api/check       paid check after confirmation
src/app/api/cron        daily check (Vercel Cron)
supabase/migrations     schema and row level security
```

## License

MIT. See [LICENSE](LICENSE). Built by [looot](https://looot.ai).
