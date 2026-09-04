function decodeHtml(value) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

const foreignBrokerages = [
  "Goldman Sachs",
  "Morgan Stanley",
  "JPMorgan",
  "JP Morgan",
  "Jefferies",
  "Nomura",
  "Citi",
  "Citigroup",
  "UBS",
  "CLSA",
  "HSBC",
  "Bernstein",
  "Macquarie",
  "BofA",
  "Bank of America"
];

function extractBroker(title) {
  const match = foreignBrokerages.find((broker) => title.toLowerCase().includes(broker.toLowerCase()));
  return match ?? "Foreign brokerage";
}

function extractTarget(title) {
  const patterns = [
    /(?:target price|price target|target|tp)\D{0,20}(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i,
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)\D{0,20}(?:target price|price target|target|tp)/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return Number(match[1].replace(/,/g, ""));
  }

  return null;
}

function extractUpside(title) {
  const match = title.match(/([+-]?\d+(?:\.\d+)?)\s*%\s*(?:upside|downside)/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return /downside/i.test(title) ? -Math.abs(value) : value;
}

function extractRating(title) {
  const lower = title.toLowerCase();
  if (/buy|outperform|overweight|add|accumulate/.test(lower)) return "positive";
  if (/sell|underperform|underweight|reduce/.test(lower)) return "negative";
  if (/hold|neutral|equal-weight|market perform/.test(lower)) return "neutral";
  return "unrated";
}

function parseItems(xml, stock, currentPrice) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12);
  return items.map((match) => {
    const block = match[1];
    const title = decodeHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const url = decodeHtml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const source = decodeHtml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "Google News");
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? new Date().toUTCString();
    const targetPrice = extractTarget(title);
    const upsidePercent = targetPrice
      ? Number((((targetPrice - currentPrice) / currentPrice) * 100).toFixed(1))
      : extractUpside(title);

    return {
      date: new Date(pubDate).toISOString(),
      broker: extractBroker(title),
      rating: extractRating(title),
      targetPrice,
      upsidePercent,
      title,
      source,
      url
    };
  }).filter((item) => {
    const haystack = `${item.title} ${item.source}`.toLowerCase();
    const stockMatch = haystack.includes(stock.name.toLowerCase().split(" ")[0]) ||
      haystack.includes(stock.symbol.replace(".NS", "").toLowerCase());
    const brokerageMatch = item.broker !== "Foreign brokerage" ||
      /target|upside|downside|brokerage|rating|buy|sell|hold|neutral|outperform|underperform/i.test(item.title);
    return stockMatch && brokerageMatch;
  });
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

function fallbackSummary(stock, currentPrice) {
  return {
    source: "Cached public-headline fallback",
    label: "no fresh foreign brokerage headline found",
    lastUpdated: new Date().toISOString(),
    consensusTarget: null,
    upsidePercent: null,
    summary: `No recent public foreign-brokerage target headline was found for ${stock.name}. Paid/private research reports are not scraped; this slot updates when a public headline mentions a foreign brokerage rating or target price.`,
    items: []
  };
}

export class BrokerageRssAdapter {
  constructor() {
    this.name = "Google News RSS brokerage search";
  }

  async latest(stock, currentPrice) {
    const baseSymbol = stock.symbol.replace(".NS", "");
    const brokers = '"Jefferies" OR "Morgan Stanley" OR "Goldman Sachs" OR "JPMorgan" OR "Nomura" OR "Citi" OR "UBS" OR "CLSA" OR "HSBC" OR "Bernstein" OR "Macquarie" OR "BofA"';
    const query = `("${stock.name}" OR ${baseSymbol}) (${brokers}) ("target price" OR rating OR brokerage OR "price target")`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Nazara brokerage targets" },
      signal: AbortSignal.timeout(7500)
    });
    if (!response.ok) throw new Error(`Brokerage RSS failed: ${response.status}`);

    const items = parseItems(await response.text(), stock, currentPrice).slice(0, 6);
    if (!items.length) return fallbackSummary(stock, currentPrice);

    const consensusTarget = median(items.map((item) => item.targetPrice));
    const upsidePercent = consensusTarget
      ? Number((((consensusTarget - currentPrice) / currentPrice) * 100).toFixed(1))
      : null;
    const ratings = items.map((item) => item.rating).filter((rating) => rating !== "unrated");
    const upsideMentions = items.filter((item) => item.upsidePercent !== null).length;
    const ratingSummary = ratings.length ? `${ratings[0]} tone from latest public headline` : "rating not exposed in latest public headline";

    return {
      source: this.name,
      label: "live public brokerage headlines",
      lastUpdated: new Date().toISOString(),
      consensusTarget,
      upsidePercent,
      summary: `${items.length} public foreign-brokerage headline(s) found for ${stock.name}; ${ratingSummary}; ${upsideMentions} headline(s) expose target/upside language.`,
      items
    };
  }
}
