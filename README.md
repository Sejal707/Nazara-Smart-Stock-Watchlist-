# Nazara

Nazara ("bird's-eye view") is a hackathon-ready stock watchlist dashboard for NSE-listed stocks. It ships with a working Express backend, SQLite persistence, a React dashboard, a deterministic scoring engine, and seeded offline-safe market intelligence so demos keep working even when external APIs are unavailable.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:8787`.

The first screen is a login page. Enter a name and password; Nazara creates or resumes that user and keeps that user's watchlists, last-accessed stocks, last visit time, and attention feed separate in SQLite. The built-in demo user keeps the seeded demo watchlists; every other new user starts with one pre-added `Starter Watchlist`.

To reseed the database:

```bash
npm run seed
```

## Deploy On Vercel

Vercel can host Nazara as a Vite frontend plus an Express serverless API. It is not unlimited: Hobby accounts have included request/function/CPU quotas, and Yahoo can still rate-limit public market-data traffic. Nazara reduces unnecessary requests with backend quote caching, request coalescing, and truthful `LIVE`/`DELAYED`/`STALE`/`MARKET_CLOSED` labels.

Required Vercel project settings:

```text
Repository: https://github.com/Sejal707/Nazara-Smart-Stock-Watchlist-
Framework preset: Vite
Build command: npm run build
Output directory: dist
Node version: 24.x
```

Add these Vercel environment variables before deploying:

```text
MARKET_DATA_STALE_AFTER_MS=120000
MARKET_DATA_DELAYED_AFTER_MS=20000
MARKET_DATA_CACHE_MS=0
MARKET_DATA_CONCURRENCY=3
VITE_CLIENT_POLL_INTERVAL_MS=30000
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only. Do not expose it in browser code.

Set `MARKET_DATA_CACHE_MS=0` on Vercel if you want Nazara to request Yahoo on every quote refresh instead of reusing the backend's short quote cache. This still cannot force Yahoo to provide exchange-grade real-time data; Yahoo may return delayed or last-traded market timestamps, and Nazara will label that truthfully.

Nazara uses the Yahoo Finance chart endpoint for price and history data. Some free hosts may rate-limit outbound calls to Yahoo; if that happens, the app clearly labels the affected stock as cached/stale/unavailable instead of pretending it is live.

## Yahoo Market Data

Yahoo Finance remains the primary market-data provider. NAZARA stores two different timestamps for every quote:

- `marketTimestamp`: the actual timestamp Yahoo attaches to the quote.
- `receivedAt`: when NAZARA received the Yahoo response.

The app never treats `receivedAt` as proof that the market data is live. Current quote API responses use `Cache-Control: no-store` so browsers and hosting CDNs do not reuse old quote responses as current data.

Freshness is classified as:

- `LIVE`: NSE session is open and Yahoo's market timestamp is within `MARKET_DATA_DELAYED_AFTER_MS`.
- `DELAYED`: NSE session is open and Yahoo data is fresh enough to use but behind the configured delay threshold.
- `STALE`: NSE session is open but Yahoo's market timestamp is older than `MARKET_DATA_STALE_AFTER_MS`, or Yahoo failed and only last-known data remains.
- `MARKET_CLOSED`: NSE is outside normal weekday trading hours, so the last traded Yahoo price is shown truthfully as closed-market data.
- `UNAVAILABLE`: Yahoo did not return a valid quote and no previous valid quote exists.

The backend validates Yahoo responses before replacing current market state. It rejects malformed prices, invalid OHLC, missing timestamps, and timestamp regressions so older provider responses do not overwrite newer quotes.

## Automatic Updates And Scaling

On login/bootstrap, NAZARA deduplicates the active watchlist symbols and refreshes each unique symbol through the backend before returning watchlist data. While the app is open, the frontend polls the NAZARA backend every `VITE_CLIENT_POLL_INTERVAL_MS` milliseconds, not Yahoo directly.

The backend uses an in-memory single-flight registry and optional short-lived quote cache:

- 100 users watching `RELIANCE.NS` share one in-flight Yahoo request.
- cached quote state keeps Yahoo's original `marketTimestamp`.
- freshness is recalculated when data is served.
- `MARKET_DATA_CONCURRENCY` controls how many unique symbols refresh at once.
- `MARKET_DATA_CACHE_MS=0` disables backend quote-cache reuse.

This is scalable for demos and small public deployments without hammering Yahoo. On Vercel, in-memory cache can reset on cold starts because serverless functions are not one permanent machine. For high traffic, add Redis/Upstash so all serverless instances share one quote cache.

## Supabase Persistence

SQLite remains the local fallback for development and an ephemeral stock/detail cache on Vercel. For production persistence across sessions/devices, create Supabase tables from [supabase/schema.sql](supabase/schema.sql). Supabase is only for user/application state: profiles, watchlists, watchlist stocks, preferences/user state, stock access, and attention-view tracking. Yahoo remains the source of market data.

Required Supabase environment variables:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code. Keep it server-only.

## Evaluation Requirements

### 1. How does state persist across sessions/devices?

Production state is intended to persist through Supabase Auth plus Supabase PostgreSQL tables for profiles, watchlists, watchlist stocks, user state, and attention views. Local `localStorage` stores only the current browser session token/user shell; it is not the authoritative watchlist store.

### 2. How are stale, delayed, or conflicting data handled?

Yahoo quote responses are normalized into `marketTimestamp` and `receivedAt`. Freshness uses NSE market status, age thresholds, provider lag, validation, and timestamp regression protection. Cached data keeps its original market timestamp, so cached data cannot become `LIVE` merely because it was served just now.

### 3. How does the system scale for larger watchlists and more users?

Watchlist symbols are deduplicated, concurrent refreshes are capped, and duplicate in-flight requests are coalesced with single-flight. Many users watching the same symbol share one backend Yahoo request per refresh window instead of one request per user.

## Architecture

```text
React + Recharts UI
        |
        v
Express API (/api/*)
        |
        +--> Supabase Auth/Postgres (production users, watchlists, user state)
        |
        +--> SQLite/temp SQLite (local fallback, stock details, scores, events)
        |
        +--> DataSourceAdapter interface
              |
              +--> YahooFinanceChartAdapter (auto-polled live/delayed price data)
              +--> NseListedEquityAdapter (searchable NSE stock universe)
              +--> NewsRssAdapter (latest company/sector headlines)
              +--> BrokerageRssAdapter (foreign brokerage target headlines)
              +--> Seed cache fallback (earnings, concall, holdings, actions)
```

The frontend never calls external market APIs directly. The backend owns login state, polling, caching, stale flags, scoring, and per-user watchlist state.

## Data Sources And Limitations

- Price/OHLC/intraday/history: best-effort Yahoo Finance chart endpoint through a swappable adapter. Public data can be delayed or blocked, so Nazara auto-polls the active watchlist every 30 seconds, loads real chart history for 1D, 1W, 1M, 3M, 1Y, and 5Y ranges, and serves cached values when live calls fail.
- Listed stocks: NSE `EQUITY_L.csv` securities list. Nazara syncs the searchable NSE universe automatically on API startup; the last successful sync remains in SQLite.
- News: Google News RSS search per company/sector, with source links retained in the News & Sentiment tab. Reliance/Jio IPO news is queried with a Jio-specific search so important subsidiary events are attached to Reliance.
- Foreign brokerage targets: Google News RSS search for public headlines mentioning foreign brokerages such as Jefferies, Morgan Stanley, Goldman Sachs, JPMorgan, Nomura, Citi, UBS, CLSA, HSBC, Bernstein, Macquarie, and BofA. Nazara extracts target prices from headlines when visible and clearly labels missing targets. Full paid/private brokerage reports are not scraped.
- Earnings, concall summaries, holdings, corporate actions, block deals, circuit limits, and sentiment feed: seeded demo cache modeled after NSE/BSE filings, corporate announcements, and finance-news/RSS outputs.
- LLM summarization: optional by design. The current demo uses deterministic mock concall/news summaries when no API key is present.

## Scoring

The signed score is calculated from `config/scoringConfig.json` and stored with a full timestamped breakdown:

- Price movement: max 25 points, with 2%, 5%, 10% thresholds and circuit-hit handling.
- Volume vs average: max 20 points using 10%, 20%, 50%, 100% thresholds.
- Quarterly earnings surprise: max 15 points.
- News sentiment: max 15 points.
- Technical indicators: max 10 points.
- Analyst rating change: max 5 points.
- Corporate action: max 5 points.
- User-specific event: max 5 points.

Labels map from -100 to +100: Critical Negative, Strong Negative, Mild Negative, Neutral, Mild Positive, Strong Positive, and Exceptional Positive.

## Demo Checklist

- Multi-user login with isolated watchlists, last visit, and access-aware attention tracking.
- Multiple watchlists with create, rename, add, remove, and reorder.
- Stock cards with price, sparkline, current score badge, and stale/updated state.
- Pay Attention feed ranked by current score, score changes since the user last opened a stock, fresh news, and brokerage target updates.
- Detail drill-down with straight OHLC reference line, earnings, YoY/QoQ, foreign brokerage target summary, concall summary and diff, holdings trends, latest news sentiment, corporate actions, and circuit limits.
- Config-driven ticker list and scoring weights.
- Graceful degradation via cached data and section-level stale labeling.
