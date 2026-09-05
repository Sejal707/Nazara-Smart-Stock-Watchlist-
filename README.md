| Technique | How It Works |
|---|---|
| **SingleFlight Throttling** | Concurrent requests for the same symbol share one upstream Yahoo Finance fetch |
| **mapPool Worker Pool** | Watchlist batch refreshes limited to `MARKET_DATA_CONCURRENCY` parallel fetches |
| **Session Caching** | Supabase auth token validation cached for 5 minutes per warm function instance |
| **Fast Bootstrap** | `GET /api/bootstrap?refresh=0` reloads state instantly without re-fetching Yahoo |
| **Selective Refresh** | `GET /api/bootstrap?refresh=1` triggers live price refresh for all watchlist symbols |
| **No-Store Headers** | All `/api/*` responses set `Cache-Control: no-store` to prevent stale CDN caching |
| **Client Poll Interval** | Frontend auto-refreshes every `VITE_CLIENT_POLL_INTERVAL_MS` milliseconds (default 30s) |
Next scaling step: Add Upstash Redis for shared quote caching across Vercel function instances when multi-user traffic grows.
---
## Data Sources
| Source | Coverage | Limitation |
|---|---|---|
| Yahoo Finance Chart API | Live/delayed NSE quotes, OHLC, intraday ticks, price history | Unofficial public endpoint; subject to rate limits |
| Google News RSS | Company, sector, policy, and IPO headlines with links | Search-ranked only; paywalled content not scraped |
| Google News RSS (Brokerage) | Foreign broker ratings and target-price headlines | Public headlines only — no full brokerage reports |
| NSE India EQUITY_L.csv | Complete NSE listed equity universe | Synced when online; offline fallback uses seed list |
| Seed Cache | Earnings, concall, holdings, actions, technical signals | Demo-safe data shaped like real parsed outputs |
| Optional LLM (OpenAI) | Concall and news summaries | Uses deterministic mock summaries when API key absent |
---
<div align="center">
Built by [Sejal Sharma](https://github.com/Sejal707)
*Nazara — because every market session deserves a clear view.*
[![Live Demo](https://img.shields.io/badge/Try_it_Live-Nazara-3B82F6?style=for-the-badge)](https://nazara-smart-stock-watchlist.vercel.app/)
</div>
