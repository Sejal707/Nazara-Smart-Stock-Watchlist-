import { config } from "../config.js";
import { nseMarketStatus } from "../market/session.js";
import { SingleFlight } from "../market/singleFlight.js";
import { classifyQuote, retainLastKnownQuote } from "../market/quoteValidator.js";

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
      headers: {
        "User-Agent": "Mozilla/5.0 Nazara market-data service",
        "Cache-Control": "no-cache"
      },
      cache: "no-store",
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
        "User-Agent": "Mozilla/5.0 Nazara market-data service",
        "Cache-Control": "no-cache"
      },
      cache: "no-store",
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
    const marketTimestampSeconds = meta.regularMarketTime ?? timestamps.at(-1);
    if (!marketTimestampSeconds) throw new Error("Yahoo response missing market timestamp");
    const marketTimestamp = new Date(marketTimestampSeconds * 1000).toISOString();
    const receivedAt = new Date().toISOString();
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

    const current = Number((meta.regularMarketPrice ?? prices.at(-1)).toFixed(2));
    const open = Number((meta.regularMarketOpen ?? opens[0] ?? prices[0]).toFixed(2));
    const previousClose = Number((meta.chartPreviousClose ?? meta.previousClose ?? prices[0]).toFixed(2));
    return {
      symbol,
      exchange: "NSE",
      price: current,
      current,
      open,
      previousClose,
      low: Number(Math.min(...lows).toFixed(2)),
      high: Number(Math.max(...highs).toFixed(2)),
      volume: volumes.reduce((sum, value) => sum + value, 0),
      intraday,
      marketTimestamp,
      receivedAt,
      provider: "yahoo",
      source: this.name,
      lastUpdated: marketTimestamp
    };
  }
}

export class ResilientMarketDataService {
  constructor({ adapter, getCachedDetail, saveDetail }) {
    this.adapter = adapter;
    this.getCachedDetail = getCachedDetail;
    this.saveDetail = saveDetail;
    this.singleFlight = new SingleFlight();
    this.quotes = new Map();
  }

  cachedQuote(symbol) {
    return this.quotes.get(symbol) ?? null;
  }

  quoteWithCurrentStatus(quote) {
    if (!quote) return null;
    const marketStatus = nseMarketStatus();
    const refreshed = classifyQuote(quote, null, {
      staleAfterMs: config.marketDataStaleAfterMs,
      delayedAfterMs: config.marketDataDelayedAfterMs,
      marketStatus
    }).quote;
    return { ...quote, ...refreshed, error: quote.error };
  }

  async latestQuote(symbol, { force = false } = {}) {
    const normalizedSymbol = symbol.toUpperCase();
    const cached = this.cachedQuote(normalizedSymbol);
    const receivedTime = cached?.receivedAt ? new Date(cached.receivedAt).getTime() : 0;
    if (!force && config.marketDataCacheMs > 0 && cached && Date.now() - receivedTime < config.marketDataCacheMs) {
      return this.quoteWithCurrentStatus(cached);
    }

    return this.singleFlight.do(normalizedSymbol, async () => {
      const previous = this.cachedQuote(normalizedSymbol);
      const marketStatus = nseMarketStatus();
      try {
        const raw = await this.adapter.quote(normalizedSymbol);
        const result = classifyQuote(raw, previous, {
          staleAfterMs: config.marketDataStaleAfterMs,
          delayedAfterMs: config.marketDataDelayedAfterMs,
          marketStatus
        });
        const next = result.accepted ? result.quote : retainLastKnownQuote(previous, new Error(result.issues.join(", ")), { symbol: normalizedSymbol, marketStatus });
        this.quotes.set(normalizedSymbol, next);
        return next;
      } catch (error) {
        const retained = retainLastKnownQuote(previous, error, { symbol: normalizedSymbol, marketStatus });
        this.quotes.set(normalizedSymbol, retained);
        return retained;
      }
    });
  }

  async refresh(symbol, { force = true } = {}) {
    const cached = this.getCachedDetail(symbol);
    if (!cached) throw new Error(`No cached detail for ${symbol}`);

    const live = await this.latestQuote(symbol, { force });
    if (!live.price) {
      const stale = {
        ...cached,
        dataQuality: {
          ...cached.dataQuality,
          stale: true,
          label: "unavailable",
          dataStatus: live.dataStatus,
          marketStatus: live.marketStatus,
          marketTimestamp: live.marketTimestamp,
          receivedAt: live.receivedAt,
          ageMs: live.ageMs,
          error: live.error
        }
      };
      this.saveDetail(symbol, stale, true, cached.dataQuality.source);
      return stale;
    }

    try {
      const { intraday, marketTimestamp, receivedAt, dataStatus, marketStatus, ageMs, stale, delayed, provider, source, error, ...liveQuote } = live;
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
        current: live.price,
        avgVolume: cached.quote.avgVolume,
        percentFromOpen: Number((((live.price - live.open) / live.open) * 100).toFixed(2)),
        volumeVsAveragePercent: Number((((live.volume - cached.quote.avgVolume) / cached.quote.avgVolume) * 100).toFixed(1)),
        upperCircuit,
        lowerCircuit,
        hitUpperCircuit: live.price >= upperCircuit * 0.995,
        hitLowerCircuit: live.price <= lowerCircuit * 1.005,
        marketTimestamp,
        receivedAt,
        dataStatus,
        marketStatus,
        ageMs,
        delayed,
        provider
      };
      const updated = {
        ...cached,
        quote,
        intraday: intraday?.length ? intraday : cached.intraday,
        dataQuality: {
          ...cached.dataQuality,
          source,
          label: dataStatus.toLowerCase().replaceAll("_", " "),
          stale,
          delayed,
          dataStatus,
          marketStatus,
          marketTimestamp,
          receivedAt,
          ageMs,
          lastUpdated: marketTimestamp,
          error
        }
      };
      this.saveDetail(symbol, updated, stale, source);
      return updated;
    } catch (error) {
      const stale = {
        ...cached,
        dataQuality: {
          ...cached.dataQuality,
          stale: true,
          dataStatus: "STALE",
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
