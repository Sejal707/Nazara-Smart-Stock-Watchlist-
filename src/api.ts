import type { Bootstrap, Stock, StockDetail, User } from "./types";

export function storedToken() {
  return localStorage.getItem("nazaraSessionToken");
}

export function storedUser() {
  const raw = localStorage.getItem("nazaraUser");
  if (!raw || !storedToken()) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem("nazaraUser");
    localStorage.removeItem("nazaraSessionToken");
    return null;
  }
}

export function clearStoredSession() {
  localStorage.removeItem("nazaraUser");
  localStorage.removeItem("nazaraSessionToken");
}

function authHeaders(options?: RequestInit) {
  const token = storedToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "X-Session-Token": token } : {}),
    ...(options?.headers ?? {})
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: authHeaders(options)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error ?? `Request failed: ${response.status}`);
    if (response.status === 401) {
      error.name = "AuthError";
    }
    throw error;
  }

  return response.json();
}

export const api = {
  login: (displayName: string, password: string) =>
    request<{ user: User; token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ displayName, password }) }),
  me: () => request<{ user: User }>("/api/auth/me"),
  bootstrap: () => request<Bootstrap>("/api/bootstrap"),
  searchStocks: (q: string, limit = 80) =>
    request<Stock[]>(`/api/stocks?q=${encodeURIComponent(q)}&limit=${limit}`),
  syncStocks: () =>
    request<{ ok: boolean; count: number; source: string }>("/api/stocks/sync", { method: "POST" }),
  stockDetail: (symbol: string) => request<StockDetail>(`/api/stocks/${symbol}`),
  stockHistory: (symbol: string, range: string) => request<{ time: string; date?: string; price: number }[]>(`/api/stocks/${symbol}/history?range=${range}`),
  markVisited: () => request<{ lastVisitedAt: string }>("/api/visit", { method: "POST" }),
  markAttentionViewed: (symbol: string) =>
    request<{ ok: boolean; symbol: string; happenedAt: string; viewedAt: string }>(`/api/attention/${symbol}/viewed`, { method: "POST" }),
  createWatchlist: (name: string) =>
    request("/api/watchlists", { method: "POST", body: JSON.stringify({ name }) }),
  renameWatchlist: (id: number, name: string) =>
    request(`/api/watchlists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteWatchlist: (id: number) =>
    request(`/api/watchlists/${id}`, { method: "DELETE" }),
  addStock: (id: number, symbol: string) =>
    request(`/api/watchlists/${id}/stocks`, { method: "POST", body: JSON.stringify({ symbol }) }),
  removeStock: (id: number, symbol: string) =>
    request(`/api/watchlists/${id}/stocks/${symbol}`, { method: "DELETE" }),
  reorder: (id: number, symbols: string[]) =>
    request(`/api/watchlists/${id}/reorder`, { method: "PATCH", body: JSON.stringify({ symbols }) }),
  refreshStock: (symbol: string) =>
    request<StockDetail>(`/api/refresh/${symbol}`, { method: "POST" })
};
