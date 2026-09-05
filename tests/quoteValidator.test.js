import assert from "node:assert/strict";
import test from "node:test";
import { classifyQuote, retainLastKnownQuote } from "../server/market/quoteValidator.js";

const freshTime = "2026-09-04T05:15:00.000Z";
const receivedAt = "2026-09-04T05:15:01.000Z";

function raw(overrides = {}) {
  return {
    symbol: "TCS.NS",
    price: 3100,
    open: 3080,
    high: 3120,
    low: 3075,
    previousClose: 3070,
    volume: 1000000,
    marketTimestamp: freshTime,
    receivedAt,
    provider: "yahoo",
    source: "Yahoo Finance chart API",
    ...overrides
  };
}

test("fresh open-market Yahoo quote is LIVE", () => {
  const result = classifyQuote(raw(), null, {
    now: new Date("2026-09-04T05:15:02.000Z").getTime(),
    staleAfterMs: 120000,
    delayedAfterMs: 20000,
    marketStatus: "OPEN"
  });
  assert.equal(result.accepted, true);
  assert.equal(result.quote.dataStatus, "LIVE");
  assert.equal(result.quote.marketTimestamp, freshTime);
  assert.equal(result.quote.receivedAt, receivedAt);
});

test("new HTTP response with old Yahoo market timestamp is not LIVE", () => {
  const result = classifyQuote(raw({ marketTimestamp: "2026-09-04T05:00:00.000Z", receivedAt: "2026-09-04T05:15:01.000Z" }), null, {
    now: new Date("2026-09-04T05:15:01.000Z").getTime(),
    staleAfterMs: 120000,
    delayedAfterMs: 20000,
    marketStatus: "OPEN"
  });
  assert.equal(result.quote.dataStatus, "STALE");
  assert.equal(result.quote.stale, true);
});

test("closed NSE session reports MARKET_CLOSED instead of stale", () => {
  const result = classifyQuote(raw({ marketTimestamp: "2026-09-04T09:45:00.000Z" }), null, {
    now: new Date("2026-09-05T05:15:00.000Z").getTime(),
    staleAfterMs: 120000,
    delayedAfterMs: 20000,
    marketStatus: "MARKET_CLOSED"
  });
  assert.equal(result.quote.dataStatus, "MARKET_CLOSED");
  assert.equal(result.quote.stale, false);
});

test("timestamp regression is rejected as conflict", () => {
  const previous = classifyQuote(raw({ marketTimestamp: "2026-09-04T05:15:00.000Z" }), null, {
    now: new Date("2026-09-04T05:15:02.000Z").getTime(),
    staleAfterMs: 120000,
    delayedAfterMs: 20000,
    marketStatus: "OPEN"
  }).quote;
  const result = classifyQuote(raw({ marketTimestamp: "2026-09-04T05:14:00.000Z" }), previous, {
    now: new Date("2026-09-04T05:15:03.000Z").getTime(),
    staleAfterMs: 120000,
    delayedAfterMs: 20000,
    marketStatus: "OPEN"
  });
  assert.equal(result.accepted, false);
  assert.equal(result.quote.dataStatus, "CONFLICT");
});

test("provider failure retains last known market timestamp", () => {
  const previous = classifyQuote(raw(), null, {
    now: new Date("2026-09-04T05:15:02.000Z").getTime(),
    staleAfterMs: 120000,
    delayedAfterMs: 20000,
    marketStatus: "OPEN"
  }).quote;
  const retained = retainLastKnownQuote(previous, new Error("timeout"), {
    now: new Date("2026-09-04T05:16:00.000Z").getTime(),
    symbol: "TCS.NS",
    marketStatus: "OPEN"
  });
  assert.equal(retained.price, 3100);
  assert.equal(retained.marketTimestamp, freshTime);
  assert.equal(retained.dataStatus, "STALE");
});
