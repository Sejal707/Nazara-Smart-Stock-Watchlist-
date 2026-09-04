export class DataSourceAdapter {
  constructor(name) {
    this.name = name;
  }

  async quote() {
    throw new Error("quote() must be implemented by adapter");
  }
}

export class YahooFinanceChartAdapter extends DataSourceAdapter {
  constructor() {
    super("Yahoo Finance chart API");
  }

  async history(symbol, range) {
    let interval = "1d";
    let yfRange = "1mo";
    
    if (range === "1W") { yfRange = "5d"; interval = "15m"; }
    else if (range === "1M") { yfRange = "1mo"; interval = "1d"; }
    else if (range === "3M") { yfRange = "3mo"; interval = "1d"; }
    else if (range === "1Y") { yfRange = "1y"; interval = "1d"; }
    else if (range === "5Y") { yfRange = "5y"; interval = "1wk"; }
    else if (range === "1D") { yfRange = "1d"; interval = "5m"; }
    else { yfRange = "1mo"; interval = "1d"; }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${yfRange}&interval=${interval}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Nazara hackathon demo" },
      signal: AbortSignal.timeout(4500)
    });

    if (!response.ok) throw new Error(`Yahoo history failed: ${response.status}`);
    const body = await response.json();
    const result = body.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result || !quote) throw new Error("Yahoo response missing history payload");

    const timestamps = result.timestamp ?? [];
    return timestamps.map((timestamp, index) => {
      const close = quote.close[index];
      if (typeof close !== "number") return null;
      const date = new Date(timestamp * 1000);
      let timeLabel = date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
      if (range === "1D" || range === "1W") {
         timeLabel = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
      } else if (range === "5Y") {
         timeLabel = date.toLocaleDateString("en-IN", { year: "numeric", month: "short" });
      }
      return {
        time: timeLabel,
        date: date.toISOString(),
        price: Number(close.toFixed(2))
      };
    }).filter(Boolean);
  }

  async quote(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Nazara hackathon demo"
      },
      signal: AbortSignal.timeout(4500)
    });

    if (!response.ok) {
      throw new Error(`Yahoo chart request failed: ${response.status}`);
    }

    const body = await response.json();
    const result = body.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];
    if (!meta || !quote) throw new Error("Yahoo response missing quote payload");

    const prices = quote.close.filter((value) => typeof value === "number");
    const opens = quote.open.filter((value) => typeof value === "number");
    const lows = quote.low.filter((value) => typeof value === "number");
    const highs = quote.high.filter((value) => typeof value === "number");
    const volumes = quote.volume.filter((value) => typeof value === "number");
    const timestamps = result.timestamp ?? [];
    const intraday = timestamps
      .map((timestamp, index) => ({
        time: new Date(timestamp * 1000).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata"
        }),
        price: quote.close[index]
      }))
      .filter((point) => typeof point.price === "number")
      .map((point) => ({ ...point, price: Number(point.price.toFixed(2)) }));

    return {
      current: Number((meta.regularMarketPrice ?? prices.at(-1)).toFixed(2)),
      open: Number((meta.regularMarketOpen ?? opens[0] ?? prices[0]).toFixed(2)),
      previousClose: Number((meta.chartPreviousClose ?? meta.previousClose ?? prices[0]).toFixed(2)),
      low: Number(Math.min(...lows).toFixed(2)),
      high: Number(Math.max(...highs).toFixed(2)),
      volume: volumes.reduce((sum, value) => sum + value, 0),
      intraday,
      lastUpdated: new Date().toISOString()
    };
  }
}

export class FinancialModelingPrepAdapter extends DataSourceAdapter {
  constructor(apiKey) {
    super("Financial Modeling Prep API");
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  fmpSymbol(symbol) {
    return symbol.toUpperCase();
  }

  async history(symbol, range) {
    if (!this.isConfigured()) throw new Error("Financial Modeling Prep API key is not configured");
    const today = new Date();
    const from = new Date(today);
    if (range === "1D" || range === "1W") from.setDate(today.getDate() - 7);
    else if (range === "1M") from.setMonth(today.getMonth() - 1);
    else if (range === "3M") from.setMonth(today.getMonth() - 3);
    else if (range === "1Y") from.setFullYear(today.getFullYear() - 1);
    else if (range === "5Y") from.setFullYear(today.getFullYear() - 5);

    const params = new URLSearchParams({
      from: from.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
      apikey: this.apiKey
    });
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(this.fmpSymbol(symbol))}?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5500) });
    if (!response.ok) throw new Error(`Financial Modeling Prep history failed: ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body.historical) ? body.historical : [];
    if (!rows.length) throw new Error("Financial Modeling Prep response missing history payload");

    return rows
      .slice()
      .reverse()
      .map((row) => ({
        time: new Date(row.date).toLocaleDateString("en-IN", range === "5Y" ? { year: "numeric", month: "short" } : { month: "short", day: "numeric" }),
        date: new Date(row.date).toISOString(),
        price: Number(Number(row.close).toFixed(2))
      }))
      .filter((point) => Number.isFinite(point.price));
  }

  async quote(symbol) {
    if (!this.isConfigured()) throw new Error("Financial Modeling Prep API key is not configured");
    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(this.fmpSymbol(symbol))}?apikey=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5500) });
    if (!response.ok) throw new Error(`Financial Modeling Prep quote failed: ${response.status}`);
    const body = await response.json();
    const quote = Array.isArray(body) ? body[0] : null;
    if (!quote || typeof quote.price !== "number") throw new Error("Financial Modeling Prep response missing quote payload");

    const current = Number(quote.price.toFixed(2));
    const open = Number((quote.open ?? quote.previousClose ?? current).toFixed(2));
    const low = Number((quote.dayLow ?? current).toFixed(2));
    const high = Number((quote.dayHigh ?? current).toFixed(2));
    const previousClose = Number((quote.previousClose ?? current).toFixed(2));

    return {
      current,
      open,
      previousClose,
      low,
      high,
      volume: Number(quote.volume ?? 0),
      intraday: [
        { time: "Open", price: open },
        { time: "Low", price: low },
        { time: "Current", price: current },
        { time: "High", price: high }
      ],
      lastUpdated: new Date().toISOString()
    };
  }
}

export class FallbackMarketDataAdapter extends DataSourceAdapter {
  constructor(adapters) {
    super(adapters.map((adapter) => adapter.name).join(" -> "));
    this.adapters = adapters;
  }

  async quote(symbol) {
    const errors = [];
    for (const adapter of this.adapters) {
      if (typeof adapter.isConfigured === "function" && !adapter.isConfigured()) continue;
      try {
        const quote = await adapter.quote(symbol);
        return { ...quote, sourceName: adapter.name };
      } catch (error) {
        errors.push(`${adapter.name}: ${error.message}`);
      }
    }
    throw new Error(errors.join("; ") || "No market data adapter is configured");
  }

  async history(symbol, range) {
    const errors = [];
    for (const adapter of this.adapters) {
      if (typeof adapter.isConfigured === "function" && !adapter.isConfigured()) continue;
      try {
        return await adapter.history(symbol, range);
      } catch (error) {
        errors.push(`${adapter.name}: ${error.message}`);
      }
    }
    throw new Error(errors.join("; ") || "No market data adapter is configured");
  }
}

export class ResilientMarketDataService {
  constructor({ adapter, getCachedDetail, saveDetail }) {
    this.adapter = adapter;
    this.getCachedDetail = getCachedDetail;
    this.saveDetail = saveDetail;
  }

  async refresh(symbol) {
    const cached = this.getCachedDetail(symbol);
    if (!cached) throw new Error(`No cached detail for ${symbol}`);

    try {
      const live = await this.adapter.quote(symbol);
      const { intraday, lastUpdated, sourceName, ...liveQuote } = live;
      const upperCircuitPercent = cached.quote.upperCircuit > cached.quote.open
        ? (cached.quote.upperCircuit / cached.quote.open) - 1
        : 0.1;
      const lowerCircuitPercent = cached.quote.lowerCircuit < cached.quote.open
        ? 1 - (cached.quote.lowerCircuit / cached.quote.open)
        : 0.1;
      const upperCircuit = Number((live.open * (1 + upperCircuitPercent)).toFixed(2));
      const lowerCircuit = Number((live.open * (1 - lowerCircuitPercent)).toFixed(2));
      const quote = {
        ...cached.quote,
        ...liveQuote,
        avgVolume: cached.quote.avgVolume,
        percentFromOpen: Number((((live.current - live.open) / live.open) * 100).toFixed(2)),
        volumeVsAveragePercent: Number((((live.volume - cached.quote.avgVolume) / cached.quote.avgVolume) * 100).toFixed(1)),
        upperCircuit,
        lowerCircuit,
        hitUpperCircuit: live.current >= upperCircuit * 0.995,
        hitLowerCircuit: live.current <= lowerCircuit * 1.005
      };
      const updated = {
        ...cached,
        quote,
        intraday: intraday?.length ? intraday : cached.intraday,
        dataQuality: {
          ...cached.dataQuality,
          source: sourceName ?? this.adapter.name,
          label: "live/delayed public feed",
          stale: false,
          lastUpdated
        }
      };
      this.saveDetail(symbol, updated, false, sourceName ?? this.adapter.name);
      return updated;
    } catch (error) {
      const stale = {
        ...cached,
        dataQuality: {
          ...cached.dataQuality,
          stale: true,
          label: "stale cached fallback",
          error: error.message
        }
      };
      this.saveDetail(symbol, stale, true, cached.dataQuality.source);
      return stale;
    }
  }

  async history(symbol, range) {
    try {
      return await this.adapter.history(symbol, range);
    } catch (error) {
      console.error(`History fetch failed for ${symbol}: ${error.message}`);
      return [];
    }
  }

}
