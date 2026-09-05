export function utcIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberOrNull(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function quoteAgeMs(marketTimestamp, now = Date.now()) {
  const time = new Date(marketTimestamp).getTime();
  return Number.isFinite(time) ? Math.max(0, now - time) : Number.POSITIVE_INFINITY;
}

export function classifyQuote(raw, previous, options) {
  const now = options.now ?? Date.now();
  const receivedAt = utcIso(raw.receivedAt ?? now);
  const marketTimestamp = utcIso(raw.marketTimestamp);
  const marketStatus = options.marketStatus ?? "OPEN";
  const issues = [];

  const price = numberOrNull(raw.price ?? raw.current);
  const open = numberOrNull(raw.open);
  const high = numberOrNull(raw.high);
  const low = numberOrNull(raw.low);
  const previousClose = numberOrNull(raw.previousClose);
  const volume = numberOrNull(raw.volume);

  if (price === null || price <= 0) issues.push("malformed_price");
  if (!marketTimestamp) issues.push("missing_market_timestamp");
  if (high !== null && low !== null && high < low) issues.push("malformed_ohlc");
  if (volume !== null && volume < 0) issues.push("malformed_volume");

  if (previous?.marketTimestamp && marketTimestamp) {
    const prevTime = new Date(previous.marketTimestamp).getTime();
    const nextTime = new Date(marketTimestamp).getTime();
    if (Number.isFinite(prevTime) && Number.isFinite(nextTime) && nextTime < prevTime) {
      issues.push("timestamp_regression");
    }
  }

  const fatal = issues.some((issue) => issue !== "timestamp_regression");
  const ageMs = quoteAgeMs(marketTimestamp, now);
  const providerLagMs = marketTimestamp && receivedAt
    ? Math.max(0, new Date(receivedAt).getTime() - new Date(marketTimestamp).getTime())
    : Number.POSITIVE_INFINITY;

  let dataStatus = "LIVE";
  if (marketStatus !== "OPEN") dataStatus = marketStatus;
  else if (ageMs > options.staleAfterMs) dataStatus = "STALE";
  else if (providerLagMs > options.delayedAfterMs) dataStatus = "DELAYED";
  if (fatal) dataStatus = "UNAVAILABLE";
  if (issues.includes("timestamp_regression")) dataStatus = "CONFLICT";

  return {
    accepted: !fatal && !issues.includes("timestamp_regression"),
    issues,
    quote: {
      symbol: raw.symbol,
      exchange: raw.exchange ?? "NSE",
      price,
      current: price,
      open: open ?? previous?.open ?? price,
      high: high ?? previous?.high ?? price,
      low: low ?? previous?.low ?? price,
      previousClose: previousClose ?? previous?.previousClose ?? price,
      change: previousClose ? Number((price - previousClose).toFixed(2)) : 0,
      changePercent: previousClose ? Number((((price - previousClose) / previousClose) * 100).toFixed(2)) : 0,
      volume: volume ?? previous?.volume ?? 0,
      marketTimestamp,
      receivedAt,
      provider: raw.provider ?? "yahoo",
      source: raw.source ?? "Yahoo Finance chart API",
      ageMs,
      providerLagMs,
      stale: ["STALE", "UNAVAILABLE", "CONFLICT"].includes(dataStatus),
      delayed: dataStatus === "DELAYED",
      dataStatus,
      marketStatus
    }
  };
}

export function retainLastKnownQuote(previous, error, options) {
  const receivedAt = utcIso(options.now ?? Date.now());
  if (!previous) {
    return {
      symbol: options.symbol,
      exchange: "NSE",
      price: null,
      current: null,
      marketTimestamp: null,
      receivedAt,
      provider: "yahoo",
      source: "Yahoo Finance chart API",
      ageMs: Number.POSITIVE_INFINITY,
      stale: true,
      delayed: false,
      dataStatus: "UNAVAILABLE",
      marketStatus: options.marketStatus ?? "OPEN",
      error: error?.message ?? "Yahoo unavailable"
    };
  }
  const ageMs = quoteAgeMs(previous.marketTimestamp, options.now ?? Date.now());
  return {
    ...previous,
    receivedAt,
    ageMs,
    stale: true,
    delayed: false,
    dataStatus: previous.marketStatus === "MARKET_CLOSED" ? "MARKET_CLOSED" : "STALE",
    error: error?.message ?? "Yahoo unavailable"
  };
}
