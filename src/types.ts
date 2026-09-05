export type ScoreBreakdown = {
  key: string;
  label: string;
  points: number;
  reason: string;
};

export type Score = {
  score: number;
  label: string;
  breakdown: ScoreBreakdown[];
  createdAt?: string;
};

export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  marketCap: string;
};

export type User = {
  id: number;
  handle: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
};

export type Quote = {
  current: number;
  price?: number;
  open: number;
  low: number;
  high: number;
  previousClose: number;
  change?: number;
  changePercent?: number;
  percentFromOpen: number;
  volume: number;
  avgVolume: number;
  volumeVsAveragePercent: number;
  upperCircuit: number;
  lowerCircuit: number;
  hitUpperCircuit: boolean;
  hitLowerCircuit: boolean;
  marketTimestamp?: string | null;
  receivedAt?: string | null;
  provider?: string;
  ageMs?: number;
  dataStatus?: "LIVE" | "DELAYED" | "STALE" | "MARKET_CLOSED" | "PRE_MARKET" | "POST_MARKET" | "UNAVAILABLE" | "CONFLICT";
  marketStatus?: string;
  delayed?: boolean;
};

export type DataQuality = {
  source: string;
  label: string;
  stale: boolean;
  lastUpdated: string;
  dataStatus?: Quote["dataStatus"];
  marketStatus?: string;
  marketTimestamp?: string | null;
  receivedAt?: string | null;
  ageMs?: number;
  delayed?: boolean;
  error?: string;
};

export type WatchlistStock = Stock & {
  quote: Quote;
  intraday: { time: string; price: number }[];
  dataQuality: DataQuality;
  score: Score;
};

export type Watchlist = {
  id: number;
  name: string;
  createdAt?: string;
  stocks: WatchlistStock[];
};

export type MustLookItem = {
  id: number | string;
  symbol: string;
  name: string;
  sector: string;
  eventType: string;
  headline: string;
  score: number;
  reasons: ScoreBreakdown[];
  happenedAt: string;
  viewed: boolean;
  lastViewedAt: string | null;
};

export type StockDetail = {
  stock: Stock;
  dataQuality: DataQuality;
  quote: Quote;
  intraday: { time: string; price: number }[];
  earnings: {
    annual: { period: string; revenueCr: number; profitCr: number; yoyPercent: number };
    quarter: { period: string; revenueCr: number; profitCr: number; yoyPercent: number; qoqPercent: number; surprisePercent: number };
    estimate: { profitCr: number; beatMiss: string };
  };
  concall: {
    latestDate: string;
    summary: string[];
    diff: { label: string; current: string; previous: string; impact: "positive" | "negative" | "neutral" }[];
  };
  holdings: {
    promoter: { value: number; trend: number };
    fii: { value: number; trend: number };
    dii: { value: number; trend: number };
    filingDate: string;
  };
  brokerage: {
    source: string;
    label: string;
    lastUpdated: string;
    consensusTarget: number | null;
    upsidePercent: number | null;
    summary: string;
    items: {
      date: string;
      broker: string;
      rating: string;
      targetPrice: number | null;
      upsidePercent: number | null;
      title: string;
      source: string;
      url: string;
    }[];
  };
  corporateActions: { date: string; type: string; title: string; impact: string }[];
  news: { date: string; title: string; sentiment: string; score: number; tag: string; source?: string; url?: string }[];
  analystRatingChange: string;
  technical: { signalScore: number; reason: string };
  score: Score;
};

export type Bootstrap = {
  user: User;
  watchlists: Watchlist[];
  stocks: Stock[];
  stockUniverseCount: number;
  mustLook: MustLookItem[];
  lastVisitedAt: string;
  accessedStocks: { symbol: string; name: string; sector: string; lastAccessedAt: string; viewCount: number }[];
  dataSources: { name: string; coverage: string; limitation: string }[];
};
