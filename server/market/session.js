const IST_TIME_ZONE = "Asia/Kolkata";

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: byType.weekday,
    minutes: Number(byType.hour) * 60 + Number(byType.minute)
  };
}

export function nseMarketStatus(date = new Date()) {
  const { weekday, minutes } = istParts(date);
  if (weekday === "Sat" || weekday === "Sun") return "MARKET_CLOSED";
  if (minutes < 9 * 60) return "MARKET_CLOSED";
  if (minutes < 9 * 60 + 15) return "PRE_MARKET";
  if (minutes <= 15 * 60 + 30) return "OPEN";
  if (minutes <= 16 * 60) return "POST_MARKET";
  return "MARKET_CLOSED";
}
