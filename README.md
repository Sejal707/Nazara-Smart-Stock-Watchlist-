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

## Deploy Live

Deploy this as one Node web service, not as a static-only site. The Express server serves both the API and the built React frontend.

Recommended Koyeb settings:

```text
Repository: https://github.com/Sejal707/Nazara-Smart-Stock-Watchlist-
Build command: npm install && npm run build
Start command: npm start
Node version: 24+
```

Nazara uses the Yahoo Finance chart endpoint for price and history data. Some free hosts may rate-limit outbound calls to Yahoo; if that happens, the app clearly labels the affected stock as a cached fallback.

## Architecture

```text
React + Recharts UI
        |
        v
Express API (/api/*)
        |
        +--> SQLite (users, watchlists, stock details, scores, events, user state)
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
