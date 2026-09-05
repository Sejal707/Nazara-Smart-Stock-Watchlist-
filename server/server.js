import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, getAttentionView, getUserBySession, getUserState, loginUser, markAttentionViewed, markStockAccess, setUserState } from "./db.js";
import { seedAll, seedWatchlistsForUser } from "./seed.js";
import { computeScore } from "./scoringEngine.js";
import { ResilientMarketDataService, YahooFinanceChartAdapter } from "./adapters/marketDataAdapter.js";
import { NseListedEquityAdapter } from "./adapters/listedStocksAdapter.js";
import { NewsRssAdapter } from "./adapters/newsAdapter.js";
import { BrokerageRssAdapter } from "./adapters/brokerageAdapter.js";
import { buildDetail } from "./seedData.js";
import { config } from "./config.js";
import { mapPool } from "./market/singleFlight.js";

const app = express();
const port = process.env.PORT || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(__dirname, "../dist");
const symbolPattern = /^[A-Z0-9][A-Z0-9.-]{0,18}$/;

seedAll();
app.use(cors());
app.use(express.json());
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

function normalizeSymbol(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  const symbol = raw.endsWith(".NS") ? raw : `${raw.replace(/\.NS$/, "")}.NS`;
  return symbolPattern.test(symbol) ? symbol : null;
}

function stockFromRow(row) {
  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    exchange: row.exchange,
    marketCap: row.market_cap
  };
}

function getStocks({ q = "", limit = 120 } = {}) {
  const search = `%${q.toLowerCase().replace(".ns", "")}%`;
  const rows = q
    ? db.prepare(`
      SELECT * FROM stocks
      WHERE LOWER(REPLACE(symbol, '.NS', '')) LIKE ?
         OR LOWER(symbol) LIKE ?
         OR LOWER(name) LIKE ?
         OR LOWER(sector) LIKE ?
      ORDER BY
        CASE
          WHEN LOWER(REPLACE(symbol, '.NS', '')) = ? THEN 0
          WHEN LOWER(REPLACE(symbol, '.NS', '')) LIKE ? THEN 1
          WHEN LOWER(name) LIKE ? THEN 2
          ELSE 3
        END,
        name
      LIMIT ?
    `).all(search, search, search, search, q.toLowerCase(), `${q.toLowerCase()}%`, `${q.toLowerCase()}%`, limit)
    : db.prepare("SELECT * FROM stocks ORDER BY name LIMIT ?").all(limit);
  return rows.map(stockFromRow);
}

function getDetail(symbol) {
  const row = db.prepare("SELECT payload FROM stock_details WHERE symbol = ?").get(symbol);
  return row ? JSON.parse(row.payload) : null;
}

function saveDetail(symbol, detail, stale = false, source = "Seed cache") {
  db.prepare(`
    INSERT INTO stock_details (symbol, payload, updated_at, stale, source)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      stale = excluded.stale,
      source = excluded.source
  `).run(symbol, JSON.stringify(detail), new Date().toISOString(), stale ? 1 : 0, source);
}

function latestScore(symbol) {
  const row = db.prepare("SELECT score, label, breakdown, created_at FROM scores WHERE symbol = ? ORDER BY created_at DESC LIMIT 1").get(symbol);
  if (!row) return null;
  return { score: row.score, label: row.label, breakdown: JSON.parse(row.breakdown), createdAt: row.created_at };
}

function listWatchlists(userId) {
  const lists = db.prepare("SELECT id, name, created_at FROM watchlists WHERE user_id = ? ORDER BY id").all(userId);
  return lists.map((list) => {
    const rows = db.prepare(`
      SELECT s.* FROM watchlist_stocks ws
      JOIN stocks s ON s.symbol = ws.symbol
      WHERE ws.watchlist_id = ?
      ORDER BY ws.position ASC, s.name ASC
    `).all(list.id);
    return {
      id: list.id,
      name: list.name,
      createdAt: list.created_at,
      stocks: rows.map((row) => {
        const detail = getDetail(row.symbol);
        return {
          ...stockFromRow(row),
          quote: detail?.quote,
          intraday: detail?.intraday,
          dataQuality: detail?.dataQuality,
          score: detail?.score ?? latestScore(row.symbol)
        };
      })
    };
  });
}

function mustLookSince(userId, lastVisitedAt) {
  const rows = db.prepare(`
    SELECT e.*, s.name, s.sector
    FROM events e
    JOIN stocks s ON s.symbol = e.symbol
    JOIN watchlist_stocks ws ON ws.symbol = e.symbol
    JOIN watchlists w ON w.id = ws.watchlist_id AND w.user_id = ?
    WHERE e.happened_at > ?
    GROUP BY e.id
    ORDER BY ABS(e.impact) DESC, e.happened_at DESC
  `).all(userId, lastVisitedAt);

  return rows.map((row) => {
    const attentionView = getAttentionView(userId, row.symbol);
    const viewed = attentionView ? new Date(attentionView.alertHappenedAt) >= new Date(row.happened_at) : false;
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      eventType: row.event_type,
      headline: row.headline,
      score: row.impact,
      reasons: JSON.parse(row.reasons),
      happenedAt: row.happened_at,
      viewed,
      lastViewedAt: attentionView?.viewedAt ?? null
    };
  });
}

function latestTimestamp(...values) {
  const times = values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!times.length) return new Date().toISOString();
  return new Date(Math.max(...times)).toISOString();
}

function attentionFeed(userId, lastVisitedAt) {
  const rows = db.prepare(`
    SELECT DISTINCT s.symbol, s.name, s.sector
    FROM watchlists w
    JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
    JOIN stocks s ON s.symbol = ws.symbol
    WHERE w.user_id = ?
  `).all(userId);

  const items = [];
  for (const row of rows) {
    const detail = ensureDetail(row.symbol);
    if (!detail?.score) continue;
    const stockAccess = db.prepare("SELECT last_accessed_at FROM stock_access WHERE user_id = ? AND symbol = ?")
      .get(userId, row.symbol);
    const lastSeenForStock = stockAccess?.last_accessed_at ?? lastVisitedAt;
    const previousScore = db.prepare(`
      SELECT score FROM scores
      WHERE symbol = ? AND created_at <= ?
      ORDER BY created_at DESC LIMIT 1
    `).get(row.symbol, lastSeenForStock);
    const delta = detail.score.score - (previousScore?.score ?? 0);
    const latestNews = [...(detail.news ?? [])].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const freshNews = latestNews && new Date(latestNews.date) > new Date(lastSeenForStock);
    const freshBrokerage = detail.brokerage && new Date(detail.brokerage.lastUpdated) > new Date(lastSeenForStock);
    const happenedAt = latestTimestamp(detail.dataQuality.lastUpdated, latestNews?.date, detail.brokerage?.lastUpdated);
    const attentionView = getAttentionView(userId, row.symbol);
    const viewed = attentionView ? new Date(attentionView.alertHappenedAt) >= new Date(happenedAt) : false;
    const reasons = detail.score.breakdown
      .filter((reason) => Math.abs(reason.points) >= 4)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, 3);

    if (Math.abs(detail.score.score) >= 25 || Math.abs(delta) >= 8 || freshNews || freshBrokerage) {
      const extraReasons = [
        ...reasons,
        ...(freshNews ? [{ key: "freshNews", label: "Fresh news", points: 6, reason: latestNews.title }] : []),
        ...(freshBrokerage ? [{ key: "brokerage", label: "Brokerage target", points: detail.brokerage.upsidePercent ?? 4, reason: detail.brokerage.summary }] : [])
      ].slice(0, 4);
      items.push({
        id: `${row.symbol}-${detail.dataQuality.lastUpdated}`,
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        eventType: delta >= 0 ? "attention_positive" : "attention_negative",
        headline: `${row.name}: ${detail.score.label}${delta ? `, score ${delta > 0 ? "+" : ""}${delta} since last opened` : ""}`,
        score: detail.score.score,
        reasons: extraReasons,
        happenedAt,
        viewed,
        lastViewedAt: attentionView?.viewedAt ?? null
      });
    }
  }

  return items.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 10);
}

const marketData = new ResilientMarketDataService({
  adapter: new YahooFinanceChartAdapter(),
  getCachedDetail: getDetail,
  saveDetail
});

const listedStocks = new NseListedEquityAdapter();
const newsAdapter = new NewsRssAdapter();
const brokerageAdapter = new BrokerageRssAdapter();

function requestUser(req, res) {
  const user = getUserBySession(req.header("X-Session-Token"));
  if (!user) {
    res.status(401).json({ error: "Login required" });
    return null;
  }
  return user;
}

function upsertStock(stock) {
  db.prepare(`
    INSERT INTO stocks (symbol, name, sector, exchange, market_cap)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      sector = excluded.sector,
      exchange = excluded.exchange,
      market_cap = excluded.market_cap
  `).run(stock.symbol, stock.name, stock.sector, stock.exchange, stock.marketCap);
}

async function syncListedStocks({ silent = false } = {}) {
  const remoteStocks = await listedStocks.list();
  for (const stock of remoteStocks) upsertStock(stock);
  setUserState(1, "stockUniverseSyncedAt", new Date().toISOString());
  if (!silent) console.log(`${remoteStocks.length} NSE symbols synced`);
  return { count: remoteStocks.length, source: listedStocks.name };
}

function ensureDetail(symbol) {
  const detail = getDetail(symbol);
  if (detail) return detail;

  const row = db.prepare("SELECT * FROM stocks WHERE symbol = ?").get(symbol);
  if (!row) return null;

  const stock = stockFromRow(row);
  const freshDetail = buildDetail(stock, Number(symbol.length));
  const score = computeScore(freshDetail.scoringInputs);
  freshDetail.score = score;
  saveDetail(symbol, freshDetail, false, freshDetail.dataQuality.source);
  db.prepare("INSERT INTO scores (symbol, score, label, breakdown, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(symbol, score.score, score.label, JSON.stringify(score.breakdown), new Date().toISOString());
  return freshDetail;
}

async function refreshSymbol(symbol, options = {}) {
  const detail = await marketData.refresh(symbol, options);
  const liveNews = await newsAdapter.latest(detail.stock).catch(() => null);
  if (liveNews?.length) {
    detail.news = liveNews;
  }
  const liveBrokerage = await brokerageAdapter.latest(detail.stock, detail.quote.current).catch(() => null);
  if (liveBrokerage) {
    detail.brokerage = liveBrokerage;
  }
  const scoringInputs = {
    ...detail.scoringInputs,
    priceChangePercent: detail.quote.percentFromOpen,
    volumeVsAveragePercent: detail.quote.volumeVsAveragePercent,
    newsSentimentScore: detail.news?.length
      ? Number((detail.news.reduce((sum, item) => sum + item.score, 0) / detail.news.length).toFixed(2))
      : detail.scoringInputs.newsSentimentScore
  };
  const score = computeScore(scoringInputs);
  detail.score = score;
  detail.scoringInputs = scoringInputs;
  saveDetail(symbol, detail, detail.dataQuality.stale, detail.dataQuality.source);
  db.prepare("INSERT INTO scores (symbol, score, label, breakdown, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(symbol, score.score, score.label, JSON.stringify(score.breakdown), new Date().toISOString());
  return detail;
}

async function refreshSymbols(symbols, options = {}) {
  const uniqueSymbols = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  await mapPool(uniqueSymbols, config.marketDataConcurrency, async (symbol) => {
    await refreshSymbol(symbol, options).catch(() => null);
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Nazara API",
    time: new Date().toISOString(),
    marketData: {
      provider: "Yahoo Finance chart API",
      cacheMs: config.marketDataCacheMs,
      staleAfterMs: config.marketDataStaleAfterMs,
      delayedAfterMs: config.marketDataDelayedAfterMs
    }
  });
});

app.post("/api/auth/login", (req, res) => {
  try {
    const session = loginUser(req.body.displayName, req.body.password);
    seedWatchlistsForUser(session.user.id);
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  res.json({ user });
});

app.get("/api/bootstrap", async (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  seedWatchlistsForUser(user.id);
  const lastVisitedAt = getUserState(user.id, "lastVisitedAt", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const watchlistSymbols = db.prepare(`
    SELECT DISTINCT ws.symbol
    FROM watchlist_stocks ws
    JOIN watchlists w ON w.id = ws.watchlist_id
    WHERE w.user_id = ?
  `).all(user.id).map((row) => row.symbol);
  await refreshSymbols(watchlistSymbols, { force: false });
  const watchlists = listWatchlists(user.id);
  const mustLook = mustLookSince(user.id, lastVisitedAt);
  res.json({
    user,
    watchlists,
    stocks: getStocks({ limit: 120 }),
    stockUniverseCount: db.prepare("SELECT COUNT(*) AS count FROM stocks").get().count,
    mustLook: [...attentionFeed(user.id, lastVisitedAt), ...mustLook]
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 10),
    lastVisitedAt,
    accessedStocks: db.prepare(`
      SELECT sa.symbol, s.name, s.sector, sa.last_accessed_at AS lastAccessedAt, sa.view_count AS viewCount
      FROM stock_access sa
      JOIN stocks s ON s.symbol = sa.symbol
      WHERE sa.user_id = ?
      ORDER BY sa.last_accessed_at DESC
      LIMIT 8
    `).all(user.id),
    dataSources: [
      { name: "Yahoo Finance chart adapter", coverage: "Price/OHLC/intraday", limitation: "Auto-polled public live/delayed endpoint; cached fallback on failure" },
      { name: "Google News RSS", coverage: "Latest company, sector, IPO, policy and market news", limitation: "Search-ranked RSS headlines; source links retained when available" },
      { name: "Google News RSS brokerage search", coverage: "Foreign brokerage ratings and target-price headlines", limitation: "Summarizes public headlines only; full paid brokerage reports are not scraped" },
      { name: "NSE securities CSV", coverage: "Searchable NSE stock universe", limitation: "Syncs listed equity symbols when online; seed list remains available offline" },
      { name: "Seed cache", coverage: "Earnings, concall, holdings, actions, news, circuit limits", limitation: "Demo-safe offline data shaped like parsed NSE/BSE/RSS outputs" },
      { name: "Optional LLM summarizer", coverage: "Concall and news summaries", limitation: "Uses deterministic mock summaries when OPENAI_API_KEY is absent" }
    ]
  });
});

app.post("/api/visit", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const now = new Date().toISOString();
  setUserState(user.id, "lastVisitedAt", now);
  res.json({ lastVisitedAt: now });
});

app.get("/api/stocks", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Number(req.query.limit ?? 80), 250);
  res.json(getStocks({ q, limit }));
});

app.post("/api/stocks/sync", async (_req, res) => {
  try {
    const result = await syncListedStocks();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(503).json({
      error: error.message,
      fallbackCount: db.prepare("SELECT COUNT(*) AS count FROM stocks").get().count
    });
  }
});


app.get("/api/stocks/:symbol/history", async (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  const requestedRange = String(req.query.range || "1M").trim().toUpperCase();
  const range = ["1D", "1W", "1M", "3M", "1Y", "5Y"].includes(requestedRange) ? requestedRange : "1M";
  try {
    const history = await marketData.history(symbol, range);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stocks/:symbol", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  const detail = ensureDetail(symbol);
  if (!detail) return res.status(404).json({ error: "Stock not found" });
  markStockAccess(user.id, detail.stock.symbol);
  return res.json(detail);
});

app.get("/api/market/quote/:symbol", async (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  const quote = await marketData.latestQuote(symbol);
  res.json(quote);
});

app.post("/api/refresh/:symbol", async (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  try {
    const detail = await refreshSymbol(symbol);
    markStockAccess(user.id, detail.stock.symbol);
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/attention/:symbol/viewed", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  const detail = ensureDetail(symbol);
  if (!detail) return res.status(404).json({ error: "Stock not found" });
  const latestNews = [...(detail.news ?? [])].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const happenedAt = latestTimestamp(detail.dataQuality.lastUpdated, latestNews?.date, detail.brokerage?.lastUpdated);
  const viewedAt = markAttentionViewed(user.id, detail.stock.symbol, happenedAt);
  res.json({ ok: true, symbol: detail.stock.symbol, happenedAt, viewedAt });
});

app.post("/api/watchlists", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const name = String(req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Watchlist name is required" });
  const result = db.prepare("INSERT INTO watchlists (name, user_id) VALUES (?, ?)").run(name, user.id);
  res.status(201).json({ id: result.lastInsertRowid, name, stocks: [] });
});

app.patch("/api/watchlists/:id", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const id = Number(req.params.id);
  const name = String(req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Watchlist name is required" });
  db.prepare("UPDATE watchlists SET name = ? WHERE id = ? AND user_id = ?").run(name, id, user.id);
  res.json({ ok: true });
});

app.delete("/api/watchlists/:id", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  db.prepare("DELETE FROM watchlists WHERE id = ? AND user_id = ?").run(Number(req.params.id), user.id);
  res.json({ ok: true });
});

app.post("/api/watchlists/:id/stocks", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const id = Number(req.params.id);
  const list = db.prepare("SELECT id FROM watchlists WHERE id = ? AND user_id = ?").get(id, user.id);
  if (!list) return res.status(404).json({ error: "Watchlist not found" });
  const symbol = normalizeSymbol(req.body.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  if (!db.prepare("SELECT symbol FROM stocks WHERE symbol = ?").get(symbol)) {
    return res.status(404).json({ error: "Stock not found. Choose from the NSE search results." });
  }
  ensureDetail(symbol);
  const nextPosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM watchlist_stocks WHERE watchlist_id = ?").get(id).position;
  db.prepare(`
    INSERT INTO watchlist_stocks (watchlist_id, symbol, position)
    VALUES (?, ?, ?)
    ON CONFLICT(watchlist_id, symbol) DO NOTHING
  `).run(id, symbol, nextPosition);
  res.status(201).json({ ok: true });
});

app.delete("/api/watchlists/:id/stocks/:symbol", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const symbol = normalizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: "Invalid symbol" });
  db.prepare("DELETE FROM watchlist_stocks WHERE watchlist_id = ? AND symbol = ?")
    .run(
      db.prepare("SELECT id FROM watchlists WHERE id = ? AND user_id = ?").get(Number(req.params.id), user.id)?.id ?? -1,
      symbol
    );
  res.json({ ok: true });
});

app.patch("/api/watchlists/:id/reorder", (req, res) => {
  const user = requestUser(req, res);
  if (!user) return;
  const id = Number(req.params.id);
  const list = db.prepare("SELECT id FROM watchlists WHERE id = ? AND user_id = ?").get(id, user.id);
  if (!list) return res.status(404).json({ error: "Watchlist not found" });
  const symbols = Array.isArray(req.body.symbols) ? req.body.symbols.map((symbol) => String(symbol).toUpperCase()) : [];
  const update = db.prepare("UPDATE watchlist_stocks SET position = ? WHERE watchlist_id = ? AND symbol = ?");
  symbols.forEach((symbol, index) => update.run(index, id, symbol));
  res.json({ ok: true });
});

setInterval(async () => {
  const rows = db.prepare("SELECT symbol FROM stocks").all();
  await refreshSymbols(rows.slice(0, 4).map((row) => row.symbol), { force: false });
}, 5 * 60 * 1000);

syncListedStocks({ silent: true }).catch((error) => {
  console.warn(`NSE symbol auto-sync skipped: ${error.message}`);
});

if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Nazara server listening on http://localhost:${port}`);
});
