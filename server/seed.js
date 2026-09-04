import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, migrate, setUserState } from "./db.js";
import { buildDetail, stocks, watchlists } from "./seedData.js";
import { computeScore } from "./scoringEngine.js";

function hasRows(table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count > 0;
}

function seedStocks() {
  const insert = db.prepare(`
    INSERT INTO stocks (symbol, name, sector, exchange, market_cap)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      name = excluded.name,
      sector = excluded.sector,
      exchange = excluded.exchange,
      market_cap = excluded.market_cap
  `);

  for (const stock of stocks) {
    insert.run(stock.symbol, stock.name, stock.sector, stock.exchange, stock.marketCap);
  }
}

export function seedWatchlistsForUser(userId = 1) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM watchlists WHERE user_id = ?").get(userId).count;
  if (existing > 0) return;

  if (userId !== 1) {
    const starter = watchlists[0];
    const result = db.prepare("INSERT INTO watchlists (name, user_id) VALUES (?, ?)").run("Starter Watchlist", userId);
    starter.symbols.forEach((symbol, index) => {
      db.prepare("INSERT INTO watchlist_stocks (watchlist_id, symbol, position) VALUES (?, ?, ?)")
        .run(result.lastInsertRowid, symbol, index);
    });
    return;
  }

  for (const list of watchlists) {
    const result = db.prepare("INSERT INTO watchlists (name, user_id) VALUES (?, ?)").run(list.name, userId);
    list.symbols.forEach((symbol, index) => {
      db.prepare("INSERT INTO watchlist_stocks (watchlist_id, symbol, position) VALUES (?, ?, ?)")
        .run(result.lastInsertRowid, symbol, index);
    });
  }
}

function seedDetailsAndScores() {
  const now = new Date().toISOString();
  const detailUpsert = db.prepare(`
    INSERT INTO stock_details (symbol, payload, updated_at, stale, source)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      stale = excluded.stale,
      source = excluded.source
  `);

  const scoreInsert = db.prepare(`
    INSERT INTO scores (symbol, score, label, breakdown, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const eventInsert = db.prepare(`
    INSERT INTO events (symbol, event_type, headline, impact, reasons, happened_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const [index, stock] of stocks.entries()) {
    const detail = buildDetail(stock, index);
    const score = computeScore(detail.scoringInputs);
    detail.score = score;
    detailUpsert.run(stock.symbol, JSON.stringify(detail), now, 0, detail.dataQuality.source);

    const latestScore = db.prepare("SELECT created_at FROM scores WHERE symbol = ? ORDER BY created_at DESC LIMIT 1").get(stock.symbol);
    if (!latestScore) {
      scoreInsert.run(stock.symbol, score.score, score.label, JSON.stringify(score.breakdown), now);
    }

    const hasEvent = db.prepare("SELECT id FROM events WHERE symbol = ? LIMIT 1").get(stock.symbol);
    if (!hasEvent) {
      const topReasons = score.breakdown
        .filter((item) => Math.abs(item.points) >= 4)
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
        .slice(0, 3);
      eventInsert.run(
        stock.symbol,
        score.score >= 0 ? "positive_delta" : "negative_delta",
        `${stock.name} moved to ${score.label}`,
        score.score,
        JSON.stringify(topReasons),
        new Date(Date.now() - (index + 1) * 70 * 60 * 1000).toISOString()
      );
    }
  }
}

export function seedAll() {
  migrate();
  seedStocks();
  seedWatchlistsForUser(1);
  seedDetailsAndScores();

  if (!db.prepare("SELECT value FROM user_state_scoped WHERE user_id = ? AND key = ?").get(1, "lastVisitedAt")) {
    setUserState(1, "lastVisitedAt", new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString());
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedAll();
  console.log("Nazara seed data ready.");
}
