import assert from "node:assert/strict";
import test from "node:test";
import { SingleFlight } from "../server/market/singleFlight.js";

test("SingleFlight shares one in-flight request for duplicate keys", async () => {
  const sf = new SingleFlight();
  let calls = 0;
  const worker = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { price: 100 };
  };

  const [a, b, c] = await Promise.all([
    sf.do("RELIANCE.NS", worker),
    sf.do("RELIANCE.NS", worker),
    sf.do("RELIANCE.NS", worker)
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(a, { price: 100 });
  assert.deepEqual(b, { price: 100 });
  assert.deepEqual(c, { price: 100 });
});
