function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  marketDataStaleAfterMs: numberEnv("MARKET_DATA_STALE_AFTER_MS", 2 * 60 * 1000),
  marketDataDelayedAfterMs: numberEnv("MARKET_DATA_DELAYED_AFTER_MS", 20 * 1000),
  marketDataCacheMs: numberEnv("MARKET_DATA_CACHE_MS", 15 * 1000),
  marketDataConcurrency: Math.max(1, Math.min(numberEnv("MARKET_DATA_CONCURRENCY", 3), 8))
};
