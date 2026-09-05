import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.VERCEL ? path.join(os.tmpdir(), "nazara") : path.resolve(__dirname, "../data");
export const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "nazara.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

const passwordIterations = 120000;
const passwordKeyLength = 32;
const passwordDigest = "sha256";

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function ensureColumn(table, column, definition) {
  if (!tableColumns(table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_salt TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stocks (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector TEXT NOT NULL,
      exchange TEXT NOT NULL,
      market_cap TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watchlist_stocks (
      watchlist_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (watchlist_id, symbol),
      FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE,
      FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_details (
      symbol TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      stale INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      score INTEGER NOT NULL,
      label TEXT NOT NULL,
      breakdown TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      event_type TEXT NOT NULL,
      headline TEXT NOT NULL,
      impact INTEGER NOT NULL,
      reasons TEXT NOT NULL,
      happened_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_state_scoped (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_access (
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, symbol),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attention_views (
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      alert_happened_at TEXT NOT NULL,
      viewed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, symbol),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (symbol) REFERENCES stocks(symbol) ON DELETE CASCADE
    );
  `);

  ensureColumn("users", "password_salt", "TEXT");
  ensureColumn("users", "password_hash", "TEXT");
  ensureColumn("watchlists", "user_id", "INTEGER NOT NULL DEFAULT 1");

  db.prepare(`
    INSERT INTO users (id, handle, display_name, created_at, last_login_at)
    VALUES (1, 'demo', 'Demo User', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING
  `).run();

  db.exec("CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_scores_symbol_created ON scores(symbol, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_symbol_time ON events(symbol, happened_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_attention_views_user_symbol ON attention_views(user_id, symbol)");

  const oldLastVisit = db.prepare("SELECT value FROM user_state WHERE key = ?").get("lastVisitedAt");
  const scopedLastVisit = db.prepare("SELECT value FROM user_state_scoped WHERE user_id = 1 AND key = ?").get("lastVisitedAt");
  if (oldLastVisit && !scopedLastVisit) {
    setUserState(1, "lastVisitedAt", JSON.parse(oldLastVisit.value));
  }
}

export function getUserState(userId, key, fallback = null) {
  const row = db.prepare("SELECT value FROM user_state_scoped WHERE user_id = ? AND key = ?").get(userId, key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setUserState(userId, key, value) {
  db.prepare(`
    INSERT INTO user_state_scoped (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, JSON.stringify(value));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, passwordIterations, passwordKeyLength, passwordDigest).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const current = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return current.length === expected.length && crypto.timingSafeEqual(current, expected);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now, now);
  return token;
}

export function loginUser(displayName, password) {
  const cleanName = String(displayName ?? "").trim().replace(/\s+/g, " ");
  if (!cleanName) throw new Error("Name is required");
  const cleanPassword = String(password ?? "");
  if (!cleanPassword) throw new Error("Password is required");
  const handle = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
  const now = new Date().toISOString();
  const existing = db.prepare(`
    SELECT id, handle, display_name, password_salt, password_hash, created_at, last_login_at
    FROM users WHERE handle = ?
  `).get(handle);

  if (existing?.password_hash) {
    if (!verifyPassword(cleanPassword, existing.password_salt, existing.password_hash)) {
      throw new Error("Invalid username or password");
    }
    db.prepare("UPDATE users SET display_name = ?, last_login_at = ? WHERE id = ?").run(cleanName, now, existing.id);
  } else {
    const { salt, hash } = hashPassword(cleanPassword);
    if (existing) {
      db.prepare("UPDATE users SET display_name = ?, password_salt = ?, password_hash = ?, last_login_at = ? WHERE id = ?")
        .run(cleanName, salt, hash, now, existing.id);
    } else {
      db.prepare(`
        INSERT INTO users (handle, display_name, password_salt, password_hash, created_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(handle, cleanName, salt, hash, now, now);
    }
  }

  const user = db.prepare("SELECT id, handle, display_name, created_at, last_login_at FROM users WHERE handle = ?").get(handle);
  if (!getUserState(user.id, "lastVisitedAt")) {
    setUserState(user.id, "lastVisitedAt", new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString());
  }
  return { user: userFromRow(user), token: createSession(user.id) };
}

export function userFromRow(row) {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

export function getUserById(userId) {
  const row = db.prepare("SELECT id, handle, display_name, created_at, last_login_at FROM users WHERE id = ?").get(userId);
  return row ? userFromRow(row) : null;
}

export function getUserBySession(token) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) return null;
  const row = db.prepare(`
    SELECT u.id, u.handle, u.display_name, u.created_at, u.last_login_at
    FROM sessions se
    JOIN users u ON u.id = se.user_id
    WHERE se.token = ?
  `).get(cleanToken);
  if (!row) return null;
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token = ?").run(new Date().toISOString(), cleanToken);
  return userFromRow(row);
}

export function markStockAccess(userId, symbol) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO stock_access (user_id, symbol, last_accessed_at, view_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, symbol) DO UPDATE SET
      last_accessed_at = excluded.last_accessed_at,
      view_count = stock_access.view_count + 1
  `).run(userId, symbol, now);
  return now;
}

export function getAttentionView(userId, symbol) {
  return db.prepare(`
    SELECT alert_happened_at AS alertHappenedAt, viewed_at AS viewedAt
    FROM attention_views
    WHERE user_id = ? AND symbol = ?
  `).get(userId, symbol);
}

export function markAttentionViewed(userId, symbol, alertHappenedAt) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO attention_views (user_id, symbol, alert_happened_at, viewed_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, symbol) DO UPDATE SET
      alert_happened_at = excluded.alert_happened_at,
      viewed_at = excluded.viewed_at
  `).run(userId, symbol, alertHappenedAt, now);
  return now;
}
