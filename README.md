# Nazara - Smart Stock Watchlist

Nazara is a bird's-eye stock watchlist platform for NSE investors. It is built to answer one simple question:

> Which stocks in my watchlist actually need my attention right now?

Instead of showing only a flat list of prices, Nazara combines live/delayed Yahoo Finance market data, watchlist activity, news, brokerage-target headlines, quarterly review signals, and a scoring engine to rank stocks by importance.

[Live Site](https://nazara-smart-stock-watchlist.vercel.app/)

---

## Aim

Most investors track many stocks but do not want to manually refresh every company, open multiple tabs, compare price movement, scan news, check brokerage targets, and remember what they reviewed last time.

Nazara aims to become a clean, personal stock command center:

- every user gets their own login and watchlists
- each user starts with a pre-added starter watchlist
- NSE stocks can be searched and added quickly
- prices update automatically from Yahoo Finance
- high-attention stocks are ranked first
- reviewed alerts stay reviewed until a newer important update appears
- data quality is clearly labelled as `LIVE`, `DELAYED`, `MARKET_CLOSED`, `STALE`, or `UNAVAILABLE`

---

## Core Features

### 1. User Login And Saved Watchlists

Users can log in with a username and password. Each user gets separate watchlists, reviewed-alert status, stock access history, and app state.

Production persistence uses Supabase Auth and Supabase Postgres. Local development can fall back to SQLite.

### 2. Multiple Watchlists

Nazara supports multiple named watchlists per user:

- create new watchlists
- rename only when needed
- delete custom watchlists
- add NSE stocks from search
- remove stocks
- reorder stocks
- every new user gets one pre-filled `Starter Watchlist`

### 3. NSE Stock Search

The search is designed for fast watchlist building:

- automatic matching while typing
- NSE-focused search
- no need to manually type `.NS`
- clicking a result adds the stock directly
- existing stocks in the watchlist are filtered out

### 4. Yahoo Finance Price Data

Market prices and historical charts come from Yahoo Finance chart endpoints through the backend.

Nazara stores two timestamps for every quote:

- `marketTimestamp`: the timestamp Yahoo gives for the actual market quote
- `receivedAt`: the time Nazara received the Yahoo response

This prevents old data from being shown as fake live data.

### 5. Price History Charts

Each stock has a price history chart with multiple ranges:

- `1D`
- `1W`
- `1M`
- `3M`
- `1Y`
- `5Y`

These charts use real Yahoo Finance historical data when available.

### 6. High Attention Stocks

The home screen focuses on stocks that actually need review. A stock enters this section only when it has a meaningful trigger such as:

- strong positive or negative score
- major score movement since last view
- fresh important news
- brokerage target update
- unusual volume
- significant price move
- circuit-related signal

The feed is deduped by stock symbol, so the same stock does not appear twice. Unreviewed alerts appear before reviewed ones.

### 7. Needs Review / Reviewed Logic

Each high-attention stock can show:

- `Needs review`: you have not checked the latest important update
- `Viewed`: you already opened or marked that alert

If a stock gets a newer important update later, it automatically becomes `Needs review` again.

### 8. Stock Deep Dive

Every stock card opens a detailed view with:

- price chart
- score breakdown
- fundamentals
- quarterly review with QoQ data
- brokerage and target-price section
- concall summary
- holdings
- news and sentiment
- corporate actions

### 9. Brokerage And Target Price Summary

Nazara tracks public brokerage-target headlines and summarizes the latest available target-price context for a stock.

It does not scrape paid reports. It works with public headline/news sources only.

### 10. News And Sentiment

Company news is pulled from public RSS/news search sources. The app highlights relevant headlines and uses them in the attention score where applicable.

### 11. Clean UI

The UI is intentionally focused:

- no unnecessary source cards at the bottom
- no permanently open rename controls
- no noisy live-feed block under every stock
- compact stock cards
- direct add-from-search behavior
- simple live status chips
- uncluttered stock detail tabs

---

## UI And Animations

Nazara includes subtle interaction polish:

- loading spinner while data is being prepared
- pulsing dot in the high-attention header
- hover transitions on stock cards
- active tab transitions
- status chips for quote freshness
- smooth chart rendering through Recharts
- clean modal interactions for stock details

The goal is to make the app feel alive without making the finance workflow noisy.

---

## Data Quality Model

Nazara does not pretend every response is real-time. It labels data honestly:

| Status | Meaning |
|---|---|
| `LIVE` | NSE is open and Yahoo's market timestamp is fresh |
| `DELAYED` | NSE is open but Yahoo's quote is behind the configured delay threshold |
| `MARKET_CLOSED` | NSE is closed, so the latest traded price is shown |
| `STALE` | Yahoo did not provide fresh data and last-known data is being used |
| `UNAVAILABLE` | Yahoo did not return a usable quote |
| `CONFLICT` | A provider response looked older or inconsistent and was rejected |

Browser/API responses use no-store headers, and Yahoo fetches are requested with no-store behavior.

---

## High Attention Scoring

Each stock receives a score from `-100` to `+100`.

The score is calculated from:

| Signal | Purpose |
|---|---|
| Price movement | Detects meaningful movement from open |
| Volume vs average | Finds unusual participation |
| Quarterly earnings surprise | Captures results vs expectation |
| News sentiment | Adds recent market/news context |
| Technical indicators | Adds momentum and moving-average context |
| Analyst rating change | Tracks upgrade/downgrade/initiation signals |
| Corporate action | Includes dividend, split, buyback, block deal, fundraise style signals |
| User-specific event | Tracks watchlist-specific triggers |

Score labels:

| Score Range | Label |
|---|---|
| `80` to `100` | Exceptional Positive |
| `40` to `79` | Strong Positive |
| `10` to `39` | Mild Positive |
| `-9` to `9` | Neutral / No Meaningful Change |
| `-39` to `-10` | Mild Negative |
| `-79` to `-40` | Strong Negative |
| `-100` to `-80` | Critical Negative |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Charts | Recharts |
| Icons | Lucide React |
| Styling | Custom CSS |
| Backend | Node.js, Express |
| Local database | SQLite via `node:sqlite` |
| Production persistence | Supabase Auth + Supabase Postgres |
| Market data | Yahoo Finance chart API |
| News | Google News RSS-style public feed adapter |
| Deployment | Vercel serverless functions |
| Tests | Node test runner |

---

## Architecture

```text
Browser
  |
  | React + Vite UI
  |
  v
Express API on Vercel
  |
  +-- Supabase Auth/Postgres
  |     - users
  |     - profiles
  |     - watchlists
  |     - watchlist stocks
  |     - reviewed attention alerts
  |     - stock access state
  |
  +-- SQLite/temp SQLite
  |     - local dev fallback
  |     - seeded stock details
  |     - score snapshots
  |     - fallback stock intelligence
  |
  +-- Yahoo Finance adapter
  |     - quote data
  |     - OHLC
  |     - intraday points
  |     - historical chart ranges
  |
  +-- News/Brokerage adapters
        - latest public headlines
        - brokerage target summaries
```

---

## Project Structure

```text
nazara/
  api/
    index.js
    [...path].js
  config/
    scoringConfig.json
    tickers.json
  server/
    adapters/
      brokerageAdapter.js
      listedStocksAdapter.js
      marketDataAdapter.js
      newsAdapter.js
    market/
      quoteValidator.js
      session.js
      singleFlight.js
    config.js
    db.js
    scoringEngine.js
    seed.js
    seedData.js
    server.js
    supabaseStore.js
  src/
    App.tsx
    api.ts
    main.tsx
    styles.css
    types.ts
    vite-env.d.ts
  supabase/
    schema.sql
  tests/
    quoteValidator.test.js
    singleFlight.test.js
  index.html
  package.json
  vercel.json
```

---

## Run Locally

Use `npm.cmd` on Windows PowerShell.

```powershell
cd "C:\Users\Sejal Sharma\OneDrive\Desktop\nazara"
npm.cmd install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

For production-style local run:

```powershell
npm.cmd run build
npm.cmd start
```

Open:

```text
http://localhost:8787
```

---

## Environment Variables

Local `.env` is optional for SQLite-only development. Supabase is required for production user persistence.

```env
PORT=8787
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

For Vercel, set these in:

```text
Vercel > Project > Settings > Environment Variables
```

Do not commit real keys. `.env` is ignored by Git.

---

## Supabase Setup

1. Create a Supabase project.
2. Open `SQL Editor`.
3. Paste and run:

```text
supabase/schema.sql
```

4. Add these keys to Vercel:

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service role key must remain server-only.

---

## Deploy On Vercel

1. Push the repo to GitHub.
2. Go to Vercel.
3. Import the GitHub repository.
4. Use these settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

5. Add environment variables in Vercel.
6. Deploy.

After deployment, test:

```text
https://your-vercel-domain.vercel.app/api/health
```

Expected persistence mode:

```json
{
  "persistence": {
    "mode": "supabase",
    "supabaseConfigured": true
  }
}
```

---

## Performance Notes

Vercel runs the backend as serverless functions. To keep interactions fast:

- normal button actions use fast bootstrap without waiting for every Yahoo refresh
- live refresh paths still fetch Yahoo data
- Supabase session validation is cached briefly in warm functions
- `/api/bootstrap?refresh=0` reloads user state quickly
- `/api/bootstrap?refresh=1` refreshes watchlist prices

If traffic grows, the next upgrade should be shared Redis/Upstash caching for quote data across Vercel function instances.

---

## Testing

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

Current tests cover:

- live/delayed/stale quote classification
- market-closed quote handling
- timestamp regression rejection
- last-known quote fallback
- duplicate in-flight request coalescing

---

## Limitations

Nazara is an educational/project-grade stock watchlist app. It is not investment advice.

Important limitations:

- Yahoo Finance public endpoints can be delayed, rate-limited, or unavailable.
- Vercel free/Hobby hosting is not unlimited.
- Supabase free tier has usage limits.
- Some fundamentals, holdings, concall, and corporate-action sections use seeded/fallback data when live structured sources are unavailable.
- Brokerage summaries are based on public headlines and do not scrape paid brokerage reports.

---

## Why Nazara Matters

Nazara is not just a stock list. It is a watchlist intelligence layer.

It helps a user move from:

```text
What changed in all these stocks?
```

to:

```text
These are the few stocks I should check first, and here is why.
```

That is the core idea of the project.
