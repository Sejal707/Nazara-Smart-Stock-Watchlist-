import { config } from "./config.js";
import { watchlists as starterWatchlists } from "./seedData.js";

function handleFromName(displayName) {
  return String(displayName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
}

function emailForHandle(handle) {
  return `${handle}@nazara.local`;
}

function isoNow() {
  return new Date().toISOString();
}

function enc(value) {
  return encodeURIComponent(String(value));
}

async function parseResponse(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || body?.error || `Supabase request failed: ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function authFetch(path, { method = "GET", body, token, service = false } = {}) {
  const key = service ? config.supabase.serviceRoleKey : config.supabase.anonKey;
  const response = await fetch(`${config.supabase.url}/auth/v1${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return parseResponse(response);
}

async function restFetch(path, { method = "GET", body, prefer = "return=representation", token, count = false } = {}) {
  const response = await fetch(`${config.supabase.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: config.supabase.serviceRoleKey,
      Authorization: `Bearer ${token ?? config.supabase.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer,
      ...(count ? { Prefer: "count=exact" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return parseResponse(response);
}

function userFromProfile(user, profile = {}) {
  return {
    id: user.id,
    handle: profile.handle ?? user.user_metadata?.handle ?? handleFromName(profile.display_name ?? user.email),
    displayName: profile.display_name ?? user.user_metadata?.display_name ?? user.email,
    createdAt: profile.created_at ?? user.created_at ?? isoNow(),
    lastLoginAt: profile.updated_at ?? user.last_sign_in_at ?? isoNow()
  };
}

async function profileByHandle(handle) {
  const rows = await restFetch(`/profiles?handle=eq.${enc(handle)}&select=id,handle,display_name,created_at,updated_at&limit=1`);
  return rows[0] ?? null;
}

async function profileById(id) {
  const rows = await restFetch(`/profiles?id=eq.${enc(id)}&select=id,handle,display_name,created_at,updated_at&limit=1`);
  return rows[0] ?? null;
}

async function upsertProfile(user, handle, displayName) {
  const [profile] = await restFetch("/profiles?on_conflict=id", {
    method: "POST",
    body: [{
      id: user.id,
      handle,
      display_name: displayName,
      updated_at: isoNow()
    }],
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return profile;
}

async function signIn(email, password) {
  return authFetch("/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
}

async function createAuthUser(email, password, handle, displayName) {
  return authFetch("/admin/users", {
    method: "POST",
    service: true,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { handle, display_name: displayName }
    }
  });
}

async function userFromToken(token) {
  const data = await authFetch("/user", { token });
  const profile = await profileById(data.id);
  if (profile) return userFromProfile(data, profile);
  const handle = data.user_metadata?.handle ?? handleFromName(data.email);
  const displayName = data.user_metadata?.display_name ?? handle;
  const created = await upsertProfile(data, handle, displayName);
  return userFromProfile(data, created);
}

export const supabaseStore = {
  enabled: config.supabase.enabled,

  async loginUser(displayName, password) {
    const cleanName = String(displayName ?? "").trim().replace(/\s+/g, " ");
    if (!cleanName) throw new Error("Name is required");
    const cleanPassword = String(password ?? "");
    if (!cleanPassword) throw new Error("Password is required");

    const handle = handleFromName(cleanName);
    const email = emailForHandle(handle);
    const existingProfile = await profileByHandle(handle);

    let session;
    try {
      session = await signIn(email, cleanPassword);
    } catch (error) {
      if (existingProfile) throw new Error("Invalid username or password");
      await createAuthUser(email, cleanPassword, handle, cleanName);
      session = await signIn(email, cleanPassword);
    }

    const profile = await upsertProfile(session.user, handle, cleanName);
    const user = userFromProfile(session.user, profile);
    const lastVisitedAt = await this.getUserState(user.id, "lastVisitedAt", null);
    if (!lastVisitedAt) {
      await this.setUserState(user.id, "lastVisitedAt", new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString());
    }
    return { user, token: session.access_token };
  },

  getUserBySession(token) {
    const cleanToken = String(token ?? "").trim();
    if (!cleanToken) return Promise.resolve(null);
    return userFromToken(cleanToken).catch(() => null);
  },

  async getUserState(userId, key, fallback = null) {
    const rows = await restFetch(`/user_state?user_id=eq.${enc(userId)}&key=eq.${enc(key)}&select=value&limit=1`);
    return rows[0]?.value ?? fallback;
  },

  async setUserState(userId, key, value) {
    await restFetch("/user_state?on_conflict=user_id,key", {
      method: "POST",
      body: [{ user_id: userId, key, value, updated_at: isoNow() }],
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  },

  async seedWatchlistsForUser(userId) {
    const existing = await restFetch(`/watchlists?user_id=eq.${enc(userId)}&select=id&limit=1`);
    if (existing.length) return;

    const starter = starterWatchlists[0];
    const [watchlist] = await restFetch("/watchlists", {
      method: "POST",
      body: [{ user_id: userId, name: "Starter Watchlist" }]
    });
    await restFetch("/watchlist_stocks", {
      method: "POST",
      body: starter.symbols.map((symbol, index) => ({
        watchlist_id: watchlist.id,
        symbol,
        position: index
      })),
      prefer: "return=minimal"
    });
  },

  async listWatchlists(userId) {
    const lists = await restFetch(`/watchlists?user_id=eq.${enc(userId)}&select=id,name,created_at&order=created_at.asc`);
    if (!lists.length) return [];
    const ids = lists.map((list) => list.id);
    const stocks = await restFetch(`/watchlist_stocks?watchlist_id=in.(${ids.map(enc).join(",")})&select=watchlist_id,symbol,position&order=position.asc`);
    const byList = new Map(lists.map((list) => [list.id, []]));
    for (const row of stocks) {
      byList.get(row.watchlist_id)?.push(row);
    }
    return lists.map((list) => ({
      id: list.id,
      name: list.name,
      createdAt: list.created_at,
      symbols: byList.get(list.id) ?? []
    }));
  },

  async watchlistSymbols(userId) {
    const lists = await this.listWatchlists(userId);
    return [...new Set(lists.flatMap((list) => list.symbols.map((row) => row.symbol)))];
  },

  async createWatchlist(userId, name) {
    const [row] = await restFetch("/watchlists", {
      method: "POST",
      body: [{ user_id: userId, name }]
    });
    return { id: row.id, name: row.name, createdAt: row.created_at, stocks: [] };
  },

  async renameWatchlist(userId, id, name) {
    const rows = await restFetch(`/watchlists?id=eq.${enc(id)}&user_id=eq.${enc(userId)}`, {
      method: "PATCH",
      body: { name },
      prefer: "return=representation"
    });
    return rows.length > 0;
  },

  async deleteWatchlist(userId, id) {
    await restFetch(`/watchlists?id=eq.${enc(id)}&user_id=eq.${enc(userId)}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
  },

  async addStockToWatchlist(userId, id, symbol) {
    const lists = await restFetch(`/watchlists?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=id&limit=1`);
    if (!lists.length) return false;
    const existing = await restFetch(`/watchlist_stocks?watchlist_id=eq.${enc(id)}&symbol=eq.${enc(symbol)}&select=symbol&limit=1`);
    if (existing.length) return true;
    const rows = await restFetch(`/watchlist_stocks?watchlist_id=eq.${enc(id)}&select=position&order=position.desc&limit=1`);
    const nextPosition = (rows[0]?.position ?? -1) + 1;
    await restFetch("/watchlist_stocks", {
      method: "POST",
      body: [{ watchlist_id: id, symbol, position: nextPosition }],
      prefer: "return=minimal"
    });
    return true;
  },

  async removeStockFromWatchlist(userId, id, symbol) {
    const lists = await restFetch(`/watchlists?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=id&limit=1`);
    if (!lists.length) return false;
    await restFetch(`/watchlist_stocks?watchlist_id=eq.${enc(id)}&symbol=eq.${enc(symbol)}`, {
      method: "DELETE",
      prefer: "return=minimal"
    });
    return true;
  },

  async reorderWatchlist(userId, id, symbols) {
    const lists = await restFetch(`/watchlists?id=eq.${enc(id)}&user_id=eq.${enc(userId)}&select=id&limit=1`);
    if (!lists.length) return false;
    await Promise.all(symbols.map((symbol, index) => restFetch(`/watchlist_stocks?watchlist_id=eq.${enc(id)}&symbol=eq.${enc(symbol)}`, {
      method: "PATCH",
      body: { position: index },
      prefer: "return=minimal"
    })));
    return true;
  },

  async markStockAccess(userId, symbol) {
    const now = isoNow();
    const rows = await restFetch(`/stock_access?user_id=eq.${enc(userId)}&symbol=eq.${enc(symbol)}&select=view_count&limit=1`);
    await restFetch("/stock_access?on_conflict=user_id,symbol", {
      method: "POST",
      body: [{
        user_id: userId,
        symbol,
        last_accessed_at: now,
        view_count: (rows[0]?.view_count ?? 0) + 1
      }],
      prefer: "resolution=merge-duplicates,return=minimal"
    });
    return now;
  },

  async accessedStocks(userId) {
    return restFetch(`/stock_access?user_id=eq.${enc(userId)}&select=symbol,last_accessed_at,view_count&order=last_accessed_at.desc&limit=8`);
  },

  async getAttentionView(userId, symbol) {
    const rows = await restFetch(`/attention_views?user_id=eq.${enc(userId)}&symbol=eq.${enc(symbol)}&select=alert_happened_at,viewed_at&limit=1`);
    const row = rows[0];
    return row ? { alertHappenedAt: row.alert_happened_at, viewedAt: row.viewed_at } : null;
  },

  async markAttentionViewed(userId, symbol, alertHappenedAt) {
    const now = isoNow();
    await restFetch("/attention_views?on_conflict=user_id,symbol", {
      method: "POST",
      body: [{ user_id: userId, symbol, alert_happened_at: alertHappenedAt, viewed_at: now }],
      prefer: "resolution=merge-duplicates,return=minimal"
    });
    return now;
  }
};
