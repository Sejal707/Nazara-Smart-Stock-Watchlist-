import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BellRing,
  Clock3,
  Eye,
  LineChart as LineChartIcon,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  Pencil,
  X
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis
} from "recharts";
import { api } from "./api";
import { storedUser } from "./api";
import type { Bootstrap, MustLookItem, Score, Stock, StockDetail, User, Watchlist, WatchlistStock } from "./types";

const tabs = ["Overview", "Fundamentals", "Brokerage & Targets", "Concall", "Holdings", "News & Sentiment", "Corporate Actions"] as const;
type DetailTab = (typeof tabs)[number];

function currency(value: number) {
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function compact(value: number) {
  return Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function timeAgo(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function scoreTone(score: number) {
  if (score >= 40) return "positive";
  if (score >= 10) return "mild-positive";
  if (score <= -40) return "negative";
  if (score <= -10) return "mild-negative";
  return "neutral";
}

function labelSign(value: number) {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => storedUser());
  const [currentView, setCurrentView] = useState<'home' | 'watchlist'>('home');
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selected, setSelected] = useState<StockDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [lastAutoUpdated, setLastAutoUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  async function load() {
    if (!currentUser) return;
    setError(null);
    const data = await api.bootstrap();
    setBootstrap(data);
    setCurrentUser(data.user);
    localStorage.setItem("nazaraUser", JSON.stringify(data.user));
    setActiveId((current) => data.watchlists.some((list) => list.id === current) ? current : data.watchlists[0]?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [currentUser?.id]);

  async function login() {
    const name = loginName.trim();
    if (!name || !loginPassword) return;
    setLoginBusy(true);
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(name, loginPassword);
      localStorage.setItem("nazaraUser", JSON.stringify(result.user));
      localStorage.setItem("nazaraSessionToken", result.token);
      setBootstrap(null);
      setActiveId(null);
      setSelected(null);
      setCurrentUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in");
    } finally {
      setLoginBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("nazaraUser");
    localStorage.removeItem("nazaraSessionToken");
    setCurrentUser(null);
    setBootstrap(null);
    setActiveId(null);
    setSelected(null);
    setLoginName("");
    setLoginPassword("");
    setLoading(false);
  }

  const activeWatchlist = useMemo(
    () => bootstrap?.watchlists.find((list) => list.id === activeId) ?? bootstrap?.watchlists[0],
    [bootstrap, activeId]
  );

  useEffect(() => {
    if (!activeWatchlist) return;
    if (!searchOpen) return;
    if (!stockQuery.trim()) {
      setStockResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      api.searchStocks(stockQuery, 80)
        .then((stocks) => {
          const existing = new Set(activeWatchlist.stocks.map((stock) => stock.symbol));
          setStockResults(stocks.filter((stock) => !existing.has(stock.symbol)));
        })
        .catch(() => setStockResults([]));
    }, 180);

    return () => window.clearTimeout(handle);
  }, [stockQuery, activeWatchlist, searchOpen]);

  useEffect(() => {
    if (!activeWatchlist?.stocks.length) return;
    const handle = window.setInterval(() => {
      refreshActiveWatchlist(true).catch(() => null);
    }, 30000);

    return () => window.clearInterval(handle);
  }, [activeWatchlist?.id, activeWatchlist?.stocks.length]);

  async function openStock(symbol: string) {
    setDetailTab("Overview");
    setSelected(null);
    const detail = await api.refreshStock(symbol).catch(() => api.stockDetail(symbol));
    setSelected(detail);
    await load();
  }

  async function openAttentionItem(item: MustLookItem) {
    setDetailTab("Overview");
    setSelected(null);
    const viewedAt = new Date().toISOString();
    setBootstrap((current) => current ? {
      ...current,
      mustLook: current.mustLook.map((alert) => alert.symbol === item.symbol ? {
        ...alert,
        viewed: true,
        lastViewedAt: viewedAt
      } : alert)
    } : current);
    const detail = await api.refreshStock(item.symbol).catch(() => api.stockDetail(item.symbol));
    await api.markAttentionViewed(detail.stock.symbol).catch(() => null);
    setSelected(detail);
    await load();
  }

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function refreshActiveWatchlist(silent = false) {
    if (!activeWatchlist?.stocks.length || busy) return;
    if (!silent) setBusy(true);
    try {
      setIsAutoRefreshing(true);
      await Promise.all(activeWatchlist.stocks.map((stock) => api.refreshStock(stock.symbol).catch(() => null)));
      await load();
      setLastAutoUpdated(new Date().toISOString());
      if (selected) {
        const detail = await api.stockDetail(selected.stock.symbol);
        setSelected(detail);
      }
    } finally {
      setIsAutoRefreshing(false);
      if (!silent) setBusy(false);
    }
  }

  async function createList() {
    const name = newListName.trim();
    if (!name) return;
    await mutate(() => api.createWatchlist(name));
    setNewListName("");
  }

  async function renameList(list: Watchlist) {
    const name = renameValue.trim();
    if (!name || name === list.name) {
      setRenamingId(null);
      return;
    }
    await mutate(() => api.renameWatchlist(list.id, name));
    setRenamingId(null);
  }

  async function addStockFromSearch(stock: Stock) {
    if (!activeWatchlist || busy) return;
    setStockQuery("");
    setStockResults([]);
    setSearchOpen(false);
    await mutate(() => api.addStock(activeWatchlist.id, stock.symbol));
  }

  async function moveStock(symbol: string, direction: -1 | 1) {
    if (!activeWatchlist) return;
    const symbols = activeWatchlist.stocks.map((stock) => stock.symbol);
    const index = symbols.indexOf(symbol);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= symbols.length) return;
    [symbols[index], symbols[nextIndex]] = [symbols[nextIndex], symbols[index]];
    await mutate(() => api.reorder(activeWatchlist.id, symbols));
  }

  async function markVisited() {
    await api.markVisited();
    await load();
  }

  if (!currentUser) {
    return (
      <LoginPage
        loginName={loginName}
        loginPassword={loginPassword}
        setLoginName={setLoginName}
        setLoginPassword={setLoginPassword}
        onLogin={login}
        busy={loginBusy}
        error={error}
      />
    );
  }

  if (loading) {
    return <ShellState icon={<Loader2 className="spin" />} title="Loading Nazara" text="Preparing watchlists, scores and cached filings." />;
  }

  if (error || !bootstrap) {
    return <ShellState icon={<AlertTriangle />} title="Nazara could not start" text={error ?? "Unknown error"} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="logo-group">
          <img src="/logo.png" alt="Nazara Logo" className="app-logo" />
          <div>
            <h1>Nazara</h1>
            <p className="user-line">Signed in as {currentUser.displayName}</p>
          </div>
        </div>
        <div className="top-actions">
          <button
            className={currentView === 'home' ? "ghost-button active-view" : "ghost-button"}
            onClick={() => setCurrentView('home')}
            style={{ fontWeight: currentView === 'home' ? 'bold' : 'normal', background: currentView === 'home' ? '#e2e8f0' : 'transparent', color: '#0f172a' }}
          >
            Home
          </button>
          <button
            className={currentView === 'watchlist' ? "ghost-button active-view" : "ghost-button"}
            onClick={() => setCurrentView('watchlist')}
            style={{ fontWeight: currentView === 'watchlist' ? 'bold' : 'normal', background: currentView === 'watchlist' ? '#e2e8f0' : 'transparent', color: '#0f172a' }}
          >
            Watchlists
          </button>
          <button 
            className="ghost-button live-prices-btn" 
            style={{ backgroundColor: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5' }}
            onClick={() => refreshActiveWatchlist()} 
            disabled={busy} 
            title="Refresh current watchlist prices"
          >
            {busy ? <Loader2 className="spin" size={17} /> : <Activity size={17} />} Live prices
          </button>
          <button className="ghost-button" onClick={logout} title="Log out">
            <X size={17} /> Logout
          </button>
        </div>
      </header>

      {currentView === 'home' ? (
        <MustLook items={bootstrap.mustLook} onOpen={openAttentionItem} onMarkVisited={markVisited} />
      ) : (
        <>
          <section className="workspace-tabs">
            <div className="watchlist-tabs-bar">
              <div className="watchlist-tabs">
                {bootstrap.watchlists.map((list) => (
                  <button
                    key={list.id}
                    className={list.id === activeWatchlist?.id ? "tab active" : "tab"}
                    onClick={() => {
                      setActiveId(list.id);
                      setRenamingId(null);
                    }}
                  >
                    <span>{list.name}</span>
                    <small>{list.stocks.length}</small>
                  </button>
                ))}
              </div>
              <div className="rail-form">
                <input value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New watchlist" />
                <button className="icon-button" onClick={createList} title="Create watchlist"><Plus size={17} /></button>
              </div>
            </div>
          </section>

          <section className="workspace">
            <section className="stock-panel">
          <div className="panel-heading">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2>{activeWatchlist?.name ?? "Watchlist"}</h2>
                {activeWatchlist && (
                  <div className="mini-actions">
                    <button onClick={() => {
                      setRenameValue(activeWatchlist.name);
                      setRenamingId(activeWatchlist.id);
                    }} title="Rename"><Pencil size={14} /></button>
                    {bootstrap.watchlists.length > 1 && (
                      <button onClick={() => mutate(() => api.deleteWatchlist(activeWatchlist.id))} title="Delete"><Trash2 size={14} /></button>
                    )}
                  </div>
                )}
              </div>
              <p>{activeWatchlist?.stocks.length ?? 0} stocks monitored</p>
              
              {activeWatchlist && renamingId === activeWatchlist.id && (
                <div className="rail-form-horizontal" style={{ marginTop: '8px' }}>
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") renameList(activeWatchlist);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    autoFocus
                  />
                  <button onClick={() => renameList(activeWatchlist)} className="ghost-button">Save</button>
                  <button onClick={() => setRenamingId(null)} className="ghost-button">Cancel</button>
                </div>
              )}
            </div>
            {activeWatchlist && (
              <div className="stock-search-wrap">
                <div className="add-stock">
                  <Search size={16} />
                  <input
                    value={stockQuery}
                    onFocus={() => {
                      if (stockQuery.trim()) setSearchOpen(true);
                    }}
                    onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)}
                    onChange={(event) => {
                      setStockQuery(event.target.value);
                      setSearchOpen(Boolean(event.target.value.trim()));
                    }}
                    placeholder="Search NSE stocks by name or symbol"
                  />
                </div>
                {searchOpen && (
                <div className="stock-results">
                  {stockResults.slice(0, 8).map((stock) => (
                    <button
                      key={stock.symbol}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addStockFromSearch(stock);
                      }}
                    >
                      <strong>{stock.name}</strong>
                      <span>{stock.symbol} - {stock.sector}</span>
                    </button>
                  ))}
                  {!stockResults.length && <span className="stock-results-empty">No NSE matches found</span>}
                </div>
                )}
              </div>
            )}
          </div>

          <div className="stock-list-header" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', padding: '0 20px', marginBottom: '8px', color: '#475569', fontSize: '0.85rem', fontWeight: 'bold' }}>
            <div>{activeWatchlist?.name ?? "Starter watch list"}</div>
            <div></div>
            <div></div>
            <div></div>
            <div style={{ textAlign: 'right', paddingRight: '10px' }}>Net Score Board</div>
            <div></div>
          </div>
          <div className="stock-grid">
            {[...(activeWatchlist?.stocks || [])]
              .sort((a, b) => b.score.score - a.score.score)
              .map((stock, index) => (
              <StockCard
                key={stock.symbol}
                stock={stock}
                canMoveUp={false} // sorting is now automatic by score
                canMoveDown={false}
                onOpen={() => openStock(stock.symbol)}
                onRemove={() => mutate(() => api.removeStock(activeWatchlist!.id, stock.symbol))}
                onMoveUp={() => {}}
                onMoveDown={() => {}}
              />
            ))}
          </div>
        </section>
      </section>
      </>
      )}

      {selected && (
        <DetailModal
          detail={selected}
          activeTab={detailTab}
          setActiveTab={setDetailTab}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            const refreshed = await api.refreshStock(selected.stock.symbol);
            setSelected(refreshed);
            await load();
          }}
        />
      )}
    </main>
  );
}

function LoginPage({
  loginName,
  loginPassword,
  setLoginName,
  setLoginPassword,
  onLogin,
  busy,
  error
}: {
  loginName: string;
  loginPassword: string;
  setLoginName: (value: string) => void;
  setLoginPassword: (value: string) => void;
  onLogin: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <img src="/login-logo.png" alt="Logo" className="login-logo" />
        <h1 className="stylish-title">NAZARA</h1>
        <p>Sign in or create an account to keep your watchlists, last-accessed stocks, and attention alerts separate.</p>
        <div className="login-form">
          <input
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onLogin();
            }}
            placeholder="Enter your name"
            autoFocus
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onLogin();
            }}
            placeholder="Enter password"
          />
          <button onClick={onLogin} disabled={busy || !loginName.trim() || !loginPassword}>
            {busy ? <Loader2 className="spin" size={17} /> : <Eye size={17} />} Login
          </button>
        </div>
        {error && <span className="login-error">{error}</span>}
      </section>
    </main>
  );
}

function ShellState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <main className="state-shell">
      {icon}
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  );
}

function MustLook({ items, onOpen, onMarkVisited }: { items: MustLookItem[]; onOpen: (item: MustLookItem) => void; onMarkVisited: () => void }) {
  const ranked = [...items].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 4);

  return (
    <section className="must-look">
      <div className="must-look-heading alert-heading">
        <div className="alert-title-wrap">
          <div className="pulsing-dot"></div>
          <h2>HIGH ATTENTION STOCK !!</h2>
        </div>
        <button className="ghost-button alert-btn" onClick={onMarkVisited}>Mark reviewed</button>
      </div>
      <div className="must-look-grid">
        {ranked.length ? ranked.map((item) => (
          <button
            key={item.id}
            className={`must-look-item ${scoreTone(item.score)} ${item.viewed ? "is-viewed" : "is-unviewed"}`}
            onClick={() => onOpen(item)}
          >
            <div>
              <div className="attention-card-top">
                <strong>{item.headline}</strong>
                <span className={item.viewed ? "viewed-chip" : "unviewed-chip"}>
                  {item.viewed ? "Viewed" : "Needs review"}
                </span>
              </div>
              <span>{item.symbol} - {item.sector} - {timeAgo(item.happenedAt)}</span>
            </div>
            <ScoreBadge score={{ score: item.score, label: item.score >= 0 ? "Positive delta" : "Negative delta", breakdown: item.reasons }} />
            <p>{item.reasons.map((reason) => `${reason.label} ${labelSign(reason.points)}`).join(" | ")}</p>
          </button>
        )) : (
          <div className="empty-state">Open any watchlist or refresh prices to generate the next ranked delta feed.</div>
        )}
      </div>
    </section>
  );
}

function StockCard({
  stock,
  canMoveUp,
  canMoveDown,
  onOpen,
  onRemove,
  onMoveUp,
  onMoveDown
}: {
  stock: WatchlistStock;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <article className="stock-card" role="button" tabIndex={0} onClick={onOpen} style={{ cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.85)'} onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.65)'}>
      <div className="stock-card-head">
        <div className="stock-title" style={{ textAlign: 'left' }}>
          <strong>{stock.name}</strong>
          <span>{stock.symbol}</span>
        </div>
      </div>

      <div className="price-row">
        <div>
          <strong>{currency(stock.quote.current)}</strong>
        </div>
        <div className={stock.quote.percentFromOpen >= 0 ? "move-up" : "move-down"}>
          {stock.quote.percentFromOpen >= 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          {stock.quote.percentFromOpen.toFixed(2)}%
        </div>
      </div>

      <div className="ohlc-mini">
        <div className="ohlc-mini-track"></div>
        {(() => {
          const { low, high, current } = stock.quote;
          const range = Math.max(0.001, high - low);
          const getPos = (val: number) => Math.max(0, Math.min(100, ((val - low) / range) * 100));
          
          const points = [
            { key: 'low', label: 'Low', val: low, pos: getPos(low) },
            { key: 'current', label: 'Current', val: current, pos: getPos(current) },
            { key: 'high', label: 'High', val: high, pos: getPos(high) }
          ].sort((a, b) => a.pos - b.pos);

          const labelGap = 13;
          const labelLanes = [-1, 1, 2];
          const lanePositions: number[] = [];
          const laidOut = points.map((pt, index) => {
            const lane = labelLanes[index % labelLanes.length];
            const previousInLane = lanePositions[lane] ?? -999;
            const displayPos = Math.min(96, Math.max(4, Math.max(pt.pos, previousInLane + labelGap)));
            lanePositions[lane] = displayPos;
            return { ...pt, lane, displayPos };
          });
          
          return (
            <>
              {laidOut.map((pt) => (
                <div key={pt.key} className={`ohlc-mini-marker ${pt.key}`}>
                  <div className="ohlc-mini-dot" style={{ left: `${pt.pos}%`, zIndex: pt.key === 'current' ? 10 : 1 }}>
                    <i />
                  </div>
                  <div className={`ohlc-mini-label lane-${pt.lane}`} style={{ left: `${pt.displayPos}%` }}>
                    <b>{pt.label}</b>
                    <span>{pt.val.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </>
          );
        })()}
      </div>

      <ScoreBadge score={stock.score} />

      <div className="card-footer">
        <div className="mini-actions">
          <button title="Remove stock" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Trash2 size={14} /></button>
        </div>
      </div>
    </article>
  );
}

function ScoreBadge({ score }: { score: Score }) {
  return (
    <div className={`score-badge ${scoreTone(score.score)}`}>
      <strong>{score.score > 0 ? "+" : ""}{score.score}</strong>
      <span>{score.label}</span>
    </div>
  );
}

function DetailModal({
  detail,
  activeTab,
  setActiveTab,
  onClose,
  onRefresh
}: {
  detail: StockDetail;
  activeTab: DetailTab;
  setActiveTab: (tab: DetailTab) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="detail-modal">
        <header className="detail-header">
          <div>
            <span className="eyebrow"><LineChartIcon size={16} /> {detail.stock.exchange} - {detail.stock.sector}</span>
            <h2>{detail.stock.name}</h2>
            <p>{detail.stock.symbol} - {detail.dataQuality.label} - updated {timeAgo(detail.dataQuality.lastUpdated)}</p>
          </div>
          <div className="detail-actions">
            <ScoreBadge score={detail.score} />
            <button className="ghost-button" onClick={refresh} disabled={refreshing} title="Refresh stock">
              {refreshing ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />} Refresh
            </button>
            <button className="icon-button" onClick={onClose} title="Close"><X size={18} /></button>
          </div>
        </header>

        <nav className="detail-tabs">
          {tabs.map((tab) => (
            <button key={tab} className={tab === activeTab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
          ))}
        </nav>

        <div className="detail-body">
          {activeTab === "Overview" && <Overview detail={detail} />}
          {activeTab === "Fundamentals" && <Fundamentals detail={detail} />}
          {activeTab === "Brokerage & Targets" && <Brokerage detail={detail} />}
          {activeTab === "Concall" && <Concall detail={detail} />}
          {activeTab === "Holdings" && <Holdings detail={detail} />}
          {activeTab === "News & Sentiment" && <News detail={detail} />}
          {activeTab === "Corporate Actions" && <Actions detail={detail} />}
        </div>
      </section>
    </div>
  );
}

function Overview({ detail }: { detail: StockDetail }) {
  return (
    <div className="overview-grid">
      <section className="chart-panel">
        <div className="section-heading">
          <h3>Price History</h3>
          <span>{detail.quote.percentFromOpen.toFixed(2)}% from open</span>
        </div>
        <RichChart detail={detail} />
      </section>

      <section className="breakdown-panel">
        <div className="section-heading">
          <h3>Score Breakdown</h3>
          <span>{detail.score.label}</span>
        </div>
        {detail.score.breakdown.map((item) => (
          <div className="breakdown-row" key={item.key}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.reason}</span>
            </div>
            <b className={item.points >= 0 ? "move-up" : "move-down"}>{item.points > 0 ? "+" : ""}{item.points}</b>
          </div>
        ))}
      </section>

      <MetricStrip detail={detail} />
    </div>
  );
}

function RichChart({ detail }: { detail: StockDetail }) {
  const [range, setRange] = useState("1D");
  const [history, setHistory] = useState<{ time: string; date?: string; price: number }[]>(detail.intraday);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const ranges = ["1D", "1W", "1M", "3M", "1Y", "5Y"];
  const chartData = history.length ? history : detail.intraday;
  const startPrice = chartData[0]?.price ?? detail.quote.open;
  const endPrice = chartData[chartData.length - 1]?.price ?? detail.quote.current;
  const rangeMove = startPrice ? ((endPrice - startPrice) / startPrice) * 100 : 0;
  const chartColor = rangeMove >= 0 ? "#10b981" : "#ef4444";

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    api.stockHistory(detail.stock.symbol, range)
      .then((points) => {
        if (cancelled) return;
        setHistory(points.length ? points : detail.intraday);
        if (!points.length) setHistoryError("Using cached intraday data");
      })
      .catch((error) => {
        if (cancelled) return;
        setHistory(detail.intraday);
        setHistoryError(error instanceof Error ? error.message : "Could not load price history");
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail.stock.symbol, range]);

  return (
    <div className="rich-chart">
      <div className="chart-toolbar">
        <div className="chart-ranges">
          {ranges.map((r) => (
            <button
              key={r}
              className={r === range ? "active" : ""}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <span className={rangeMove >= 0 ? "move-up" : "move-down"}>
          {rangeMove >= 0 ? "+" : ""}{rangeMove.toFixed(2)}% in {range}
        </span>
      </div>
      {(loadingHistory || historyError) && (
        <div className="chart-status">
          {loadingHistory && <span>Loading real {range} prices...</span>}
          {!loadingHistory && historyError && <span>{historyError}</span>}
        </div>
      )}
      <div className="rich-chart-area" aria-label={`${detail.stock.symbol} ${range} price history chart`}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`colorPrice-${detail.stock.symbol.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.34}/>
                <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(15, 23, 42, 0.08)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={58}
              tickFormatter={(value) => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", border: "1px solid rgba(15,23,42,0.12)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
              formatter={(value) => currency(Number(value))}
              labelFormatter={(label) => `${range} - ${label}`}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={chartColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              fillOpacity={1}
              fill={`url(#colorPrice-${detail.stock.symbol.replace(/[^a-z0-9]/gi, "")})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
function BrokerageSummary({ detail }: { detail: StockDetail }) {
  const brokerage = detail.brokerage;
  if (!brokerage) return null;

  return (
    <section className="brokerage-card">
      <div className="section-heading">
        <h3>Foreign Brokerage & Targets</h3>
        <span>{brokerage.label} - {timeAgo(brokerage.lastUpdated)}</span>
      </div>
      <div className="target-row">
        <div>
          <span>Median public target</span>
          <strong>{brokerage.consensusTarget ? currency(brokerage.consensusTarget) : "Not public"}</strong>
        </div>
        <div className={brokerage.upsidePercent && brokerage.upsidePercent >= 0 ? "move-up" : "move-down"}>
          {brokerage.upsidePercent !== null ? `${brokerage.upsidePercent > 0 ? "+" : ""}${brokerage.upsidePercent}% vs current` : "No target found"}
        </div>
      </div>
      <p>{brokerage.summary}</p>
    </section>
  );
}

function MetricStrip({ detail }: { detail: StockDetail }) {
  const metrics = [
    ["Open", currency(detail.quote.open)],
    ["Day Low", currency(detail.quote.low)],
    ["Day High", currency(detail.quote.high)],
    ["Upper Circuit", currency(detail.quote.upperCircuit)],
    ["Lower Circuit", currency(detail.quote.lowerCircuit)],
    ["Volume", compact(detail.quote.volume)]
  ];

  return (
    <section className="metric-strip">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function Fundamentals({ detail }: { detail: StockDetail }) {
  return (
    <div className="two-column">
      <InfoBlock title="Annual Earnings" rows={[
        ["Period", detail.earnings.annual.period],
        ["Revenue", `${compact(detail.earnings.annual.revenueCr)} Cr`],
        ["Profit", `${compact(detail.earnings.annual.profitCr)} Cr`],
        ["YoY", `${detail.earnings.annual.yoyPercent}%`]
      ]} />
      <InfoBlock title="Quarterly Earnings" rows={[
        ["Period", detail.earnings.quarter.period],
        ["Revenue", `${compact(detail.earnings.quarter.revenueCr)} Cr`],
        ["Profit", `${compact(detail.earnings.quarter.profitCr)} Cr`],
        ["YoY", `${detail.earnings.quarter.yoyPercent}%`],
        ["QoQ", `${detail.earnings.quarter.qoqPercent > 0 ? "+" : ""}${detail.earnings.quarter.qoqPercent}%`],
        ["Estimate", `${compact(detail.earnings.estimate.profitCr)} Cr ${detail.earnings.estimate.beatMiss}`],
        ["Surprise", `${detail.earnings.quarter.surprisePercent}%`]
      ]} />
    </div>
  );
}

function Concall({ detail }: { detail: StockDetail }) {
  return (
    <div className="two-column">
      <section>
        <div className="section-heading"><h3>Latest Concall</h3><span>{new Date(detail.concall.latestDate).toLocaleDateString()}</span></div>
        <ul className="summary-list">
          {detail.concall.summary.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section>
        <div className="section-heading"><h3>Tone Diff</h3><span>vs previous call</span></div>
        {detail.concall.diff.map((item) => (
          <div className={`diff-row ${item.impact}`} key={item.label}>
            <strong>{item.label}</strong>
            <span>Previous: {item.previous}</span>
            <b>Current: {item.current}</b>
          </div>
        ))}
      </section>
    </div>
  );
}

function Holdings({ detail }: { detail: StockDetail }) {
  const rows = [
    ["Promoter", detail.holdings.promoter],
    ["FII", detail.holdings.fii],
    ["DII", detail.holdings.dii]
  ] as const;

  return (
    <section>
      <div className="section-heading"><h3>Shareholding Pattern</h3><span>Filing {new Date(detail.holdings.filingDate).toLocaleDateString()}</span></div>
      <div className="holding-grid">
        {rows.map(([label, item]) => (
          <div className="holding-tile" key={label}>
            <span>{label}</span>
            <strong>{item.value}%</strong>
            <b className={item.trend >= 0 ? "move-up" : "move-down"}>{item.trend >= 0 ? "+" : ""}{item.trend}% QoQ</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function News({ detail }: { detail: StockDetail }) {
  return (
    <section>
      <div className="section-heading"><h3>News, Policy & Sentiment</h3><span>{detail.news.length} linked items</span></div>
      <div className="feed-list">
        {detail.news.map((item) => (
          <div className={`feed-row ${item.sentiment}`} key={item.title}>
            <span>{item.tag} - {new Date(item.date).toLocaleDateString()}</span>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
            ) : (
              <strong>{item.title}</strong>
            )}
            {item.source && <span>{item.source}</span>}
            <div className={`sentiment-badge ${item.sentiment}`}>
              {item.sentiment === 'positive' && <ArrowUp size={14} />}
              {item.sentiment === 'negative' && <ArrowDown size={14} />}
              {item.sentiment === 'neutral' && <Activity size={14} />}
              <span>{Math.abs(item.score).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Brokerage({ detail }: { detail: StockDetail }) {
  const brokerage = detail.brokerage;

  return (
    <section>
      <div className="section-heading">
        <h3>Foreign Brokerage & Target Summary</h3>
        <span>{brokerage?.source ?? "unavailable"} - {brokerage ? timeAgo(brokerage.lastUpdated) : "not updated"}</span>
      </div>
      {brokerage ? (
        <>
          <div className="brokerage-summary-grid">
            <div>
              <span>Median public target</span>
              <strong>{brokerage.consensusTarget ? currency(brokerage.consensusTarget) : "Not public"}</strong>
            </div>
            <div>
              <span>Upside/downside</span>
              <strong className={brokerage.upsidePercent && brokerage.upsidePercent >= 0 ? "move-up" : "move-down"}>
                {brokerage.upsidePercent !== null ? `${brokerage.upsidePercent > 0 ? "+" : ""}${brokerage.upsidePercent}%` : "Not public"}
              </strong>
            </div>
            <div>
              <span>Coverage found</span>
              <strong>{brokerage.items.length}</strong>
            </div>
          </div>
          <p className="brokerage-summary">{brokerage.summary}</p>
          <div className="feed-list">
            {brokerage.items.length ? brokerage.items.map((item) => (
              <div className={`feed-row ${item.rating === "positive" ? "positive" : item.rating === "negative" ? "negative" : "neutral"}`} key={`${item.broker}-${item.title}`}>
                <span>{item.broker} - {new Date(item.date).toLocaleDateString()} - {item.source}</span>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                ) : (
                  <strong>{item.title}</strong>
                )}
                <b>
                  {item.rating}
                  {item.targetPrice ? ` - target ${currency(item.targetPrice)}` : " - target not public"}
                  {item.upsidePercent !== null ? ` (${item.upsidePercent > 0 ? "+" : ""}${item.upsidePercent}%)` : ""}
                </b>
              </div>
            )) : (
              <div className="empty-state">No public foreign brokerage target headline found for this stock yet.</div>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">Brokerage target summary is unavailable for this stock.</div>
      )}
    </section>
  );
}

function OhlcStraightLine({ detail }: { detail: StockDetail }) {
  const { low, high, open, current } = detail.quote;
  const range = Math.max(1, high - low);
  const getPos = (value: number) => Math.max(0, Math.min(100, ((value - low) / range) * 100));
  const points = [
    { label: "Low", value: low, className: "low", pos: getPos(low) },
    { label: "Open", value: open, className: "open", pos: getPos(open) },
    { label: "Current", value: current, className: "current", pos: getPos(current) },
    { label: "High", value: high, className: "high", pos: getPos(high) }
  ].sort((a, b) => a.pos - b.pos);

  let lastBelow = -999;
  let lastAbove = -999;

  return (
    <div className="ohlc-line-wrap">
      <div className="ohlc-scale">
        <span>{currency(low)}</span>
        <span>{currency(high)}</span>
      </div>
      <div className="ohlc-track">
        {points.map((point) => {
          const crowdedBelow = (point.pos - lastBelow < 18);
          const crowdedAbove = (point.pos - lastAbove < 18);
          
          let placeAbove = false;
          if (crowdedBelow && !crowdedAbove) {
            placeAbove = true;
          } else if (!crowdedBelow && crowdedAbove) {
            placeAbove = false;
          } else if (crowdedBelow && crowdedAbove) {
            placeAbove = (point.pos - lastAbove) > (point.pos - lastBelow);
          } else {
            placeAbove = (point.className === 'current');
          }

          if (placeAbove) lastAbove = point.pos;
          else lastBelow = point.pos;

          return (
            <div
              key={point.label}
              className={`ohlc-marker ${point.className} ${placeAbove ? 'place-above' : ''}`}
              style={{ left: `${point.pos}%`, zIndex: point.className === 'current' ? 10 : 1 }}
            >
              <i />
              {placeAbove ? (
                <>
                  <span className="val-above">{currency(point.value)}</span>
                  <b className="lbl-above">{point.label}</b>
                </>
              ) : (
                <>
                  <b>{point.label}</b>
                  <span>{currency(point.value)}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Actions({ detail }: { detail: StockDetail }) {
  return (
    <section>
      <div className="section-heading"><h3>Corporate Actions</h3><span>Block deals, dividends, splits, bonus, buybacks, fundraise</span></div>
      <div className="feed-list">
        {detail.corporateActions.map((item) => (
          <div className={`feed-row ${item.impact}`} key={`${item.type}-${item.date}`}>
            <span>{item.type} - {new Date(item.date).toLocaleDateString()}</span>
            <strong>{item.title}</strong>
            <b>{item.impact}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section>
      <div className="section-heading"><h3>{title}</h3><Activity size={16} /></div>
      <div className="info-table">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
