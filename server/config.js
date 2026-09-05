import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;
    const key = trimmed.slice(0, equalsAt).trim();
    const value = trimmed.slice(equalsAt + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function numberEnv(name, fallback, { allowZero = false } = {}) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  if (allowZero && value === 0) return 0;
  return value > 0 ? value : fallback;
}

const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

export const config = {
  marketDataStaleAfterMs: numberEnv("MARKET_DATA_STALE_AFTER_MS", 2 * 60 * 1000),
  marketDataDelayedAfterMs: numberEnv("MARKET_DATA_DELAYED_AFTER_MS", 20 * 1000),
  marketDataCacheMs: numberEnv("MARKET_DATA_CACHE_MS", 15 * 1000, { allowZero: true }),
  marketDataConcurrency: Math.max(1, Math.min(numberEnv("MARKET_DATA_CONCURRENCY", 3), 8)),
  supabase: {
    enabled: Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey),
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey
  }
};
