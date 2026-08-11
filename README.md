# Smart Mutual Fund Terminal

This branch prepares the web-app dashboard for a sector-aware daily mutual-fund opportunity engine.

## Implemented
- NSE index/sector capture with one stored row per index per trading date.
- AMFI scheme-code-first NAV matching with name fallback.
- Fund-level weighted sector basket scoring instead of relying on one proxy index.
- NAV trend, drawdown, momentum and relative-strength filters.
- Automated client refresh every 15 minutes while the dashboard is open.
- Tactical labels: **Strong Buy Today**, **Buy on Dip**, **Accumulate**, **SIP**, **Wait**, **Avoid Today**.
- Tactical top-up allocation based on opportunity score.
- Configurable sector exposure JSON per fund.
- Quant scheme-code starters from the working portfolio configuration.

## Important production note
The sector exposure map is a configurable starter map, not a live holdings feed. The next production phase should sync the latest scheme portfolio/factsheet weights on a scheduled job, record an effective date, and recalculate exposures whenever the portfolio changes.

Mutual-fund NAV remains end-of-day. Intraday index weakness is therefore an estimate of potential closing-NAV opportunity, not a live NAV quote.

## Required deployment configuration
- `DATABASE_URL` — PostgreSQL connection string.
- Run the SQL in `drizzle/0001_daily_index_history.sql` against an existing database before using the new daily-history schema.
- Install dependencies with `npm install` and validate with `npm run typecheck`, `npm run lint`, and `npm run build`.

## Next build phase
1. Scheduled holdings/exposure sync.
2. Historical backfill for at least 252 trading days.
3. Cron-triggered refresh independent of an open browser.
4. Better scheme-code validation and fund metadata.
5. Opportunity explanation/audit trail for every recommendation.
