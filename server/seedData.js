export const stocks = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy & Retail", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "IT Services", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "INFY.NS", name: "Infosys", sector: "IT Services", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Private Banks", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Private Banks", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "SBIN.NS", name: "State Bank of India", sector: "Public Banks", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Capital Goods", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "TITAN.NS", name: "Titan Company", sector: "Consumer Discretionary", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki India", sector: "Automobiles", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", sector: "Pharmaceuticals", exchange: "NSE", marketCap: "Large Cap" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises", sector: "Diversified", exchange: "NSE", marketCap: "Large Cap" }
];

export const watchlists = [
  { name: "Priority 1", symbols: ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "BHARTIARTL.NS"] },
  { name: "Priority 2", symbols: ["INFY.NS", "ICICIBANK.NS", "LT.NS", "TITAN.NS"] },
  { name: "Event Radar", symbols: ["SBIN.NS", "MARUTI.NS", "SUNPHARMA.NS", "ADANIENT.NS", "RELIANCE.NS"] }
];

const base = {
  "RELIANCE.NS": { price: 2948, open: 2894, low: 2872, high: 2966, volume: 8200000, avgVolume: 5900000, circuit: 20, sentiment: 0.68, surprise: 8.5, tech: 0.44 },
  "TCS.NS": { price: 4186, open: 4210, low: 4144, high: 4238, volume: 2100000, avgVolume: 2400000, circuit: 10, sentiment: 0.18, surprise: 2.4, tech: -0.12 },
  "INFY.NS": { price: 1512, open: 1544, low: 1504, high: 1559, volume: 9800000, avgVolume: 6500000, circuit: 10, sentiment: -0.42, surprise: -6.8, tech: -0.58 },
  "HDFCBANK.NS": { price: 1748, open: 1710, low: 1702, high: 1756, volume: 13400000, avgVolume: 10200000, circuit: 10, sentiment: 0.35, surprise: 5.5, tech: 0.36 },
  "ICICIBANK.NS": { price: 1236, open: 1242, low: 1220, high: 1251, volume: 7600000, avgVolume: 7200000, circuit: 10, sentiment: 0.05, surprise: 1.2, tech: 0.14 },
  "SBIN.NS": { price: 846, open: 816, low: 811, high: 852, volume: 22400000, avgVolume: 14700000, circuit: 10, sentiment: 0.51, surprise: 11.8, tech: 0.62 },
  "BHARTIARTL.NS": { price: 1564, open: 1538, low: 1524, high: 1572, volume: 5800000, avgVolume: 5200000, circuit: 10, sentiment: 0.39, surprise: 4.8, tech: 0.31 },
  "LT.NS": { price: 3638, open: 3688, low: 3612, high: 3706, volume: 2900000, avgVolume: 2100000, circuit: 10, sentiment: -0.24, surprise: -3.5, tech: -0.28 },
  "TITAN.NS": { price: 3476, open: 3428, low: 3405, high: 3490, volume: 1700000, avgVolume: 1500000, circuit: 10, sentiment: 0.22, surprise: 3.8, tech: 0.21 },
  "MARUTI.NS": { price: 12890, open: 12670, low: 12622, high: 12980, volume: 980000, avgVolume: 730000, circuit: 10, sentiment: 0.47, surprise: 6.1, tech: 0.48 },
  "SUNPHARMA.NS": { price: 1818, open: 1834, low: 1798, high: 1840, volume: 3900000, avgVolume: 3600000, circuit: 10, sentiment: -0.08, surprise: 0.8, tech: -0.06 },
  "ADANIENT.NS": { price: 3098, open: 3184, low: 3072, high: 3210, volume: 6700000, avgVolume: 4100000, circuit: 20, sentiment: -0.71, surprise: -9.9, tech: -0.72 }
};

function seededNumber(symbol, min, max) {
  const seed = symbol.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 17);
  const ratio = (Math.sin(seed) + 1) / 2;
  return min + ratio * (max - min);
}

function genericBase(stock) {
  const open = seededNumber(stock.symbol, 80, 5200);
  const percentMove = seededNumber(`${stock.symbol}:move`, -2.8, 2.8);
  const price = open * (1 + percentMove / 100);
  const spread = Math.max(open * seededNumber(`${stock.symbol}:spread`, 0.012, 0.045), 2);
  const low = Math.min(open, price) - spread * 0.45;
  const high = Math.max(open, price) + spread * 0.55;
  const avgVolume = Math.round(seededNumber(`${stock.symbol}:avg`, 120000, 9200000));
  const volume = Math.round(avgVolume * (1 + seededNumber(`${stock.symbol}:vol`, -0.25, 0.75)));
  const sentiment = seededNumber(`${stock.symbol}:sentiment`, -0.42, 0.42);
  const surprise = seededNumber(`${stock.symbol}:surprise`, -5.5, 6.5);
  const tech = seededNumber(`${stock.symbol}:tech`, -0.55, 0.55);

  return {
    price: Number(price.toFixed(2)),
    open: Number(open.toFixed(2)),
    low: Number(low.toFixed(2)),
    high: Number(high.toFixed(2)),
    volume,
    avgVolume,
    circuit: 10,
    sentiment: Number(sentiment.toFixed(2)),
    surprise: Number(surprise.toFixed(1)),
    tech: Number(tech.toFixed(2))
  };
}

function intraday(open, low, high, current, symbol) {
  const points = [];
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  for (let i = 0; i < 24; i += 1) {
    const t = i / 23;
    const curve = Math.sin((t * Math.PI * 2) + seed) * 0.34 + Math.cos((t * Math.PI * 5) + seed / 3) * 0.12;
    const drift = open + (current - open) * t;
    const value = Math.min(high, Math.max(low, drift + (high - low) * curve * 0.22));
    points.push({ time: `${String(9 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`, price: Number(value.toFixed(2)) });
  }
  points[0].price = open;
  points[points.length - 1].price = current;
  return points;
}

function daysAgo(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

export function buildDetail(stock, index = 0) {
  const p = base[stock.symbol] ?? genericBase(stock);
  const upperCircuit = Number((p.open * (1 + p.circuit / 100)).toFixed(2));
  const lowerCircuit = Number((p.open * (1 - p.circuit / 100)).toFixed(2));
  const priceChangePercent = ((p.price - p.open) / p.open) * 100;
  const volumeVsAveragePercent = ((p.volume - p.avgVolume) / p.avgVolume) * 100;

  return {
    stock,
    dataQuality: {
      source: "Seed cache + Yahoo Finance adapter",
      label: "delayed / demo-safe",
      stale: false,
      lastUpdated: daysAgo(index % 3 === 0 ? 0.04 : 0.12)
    },
    quote: {
      current: p.price,
      open: p.open,
      low: p.low,
      high: p.high,
      previousClose: Number((p.open * 0.992).toFixed(2)),
      percentFromOpen: Number(priceChangePercent.toFixed(2)),
      volume: p.volume,
      avgVolume: p.avgVolume,
      volumeVsAveragePercent: Number(volumeVsAveragePercent.toFixed(1)),
      upperCircuit,
      lowerCircuit,
      hitUpperCircuit: p.price >= upperCircuit * 0.995,
      hitLowerCircuit: p.price <= lowerCircuit * 1.005
    },
    intraday: intraday(p.open, p.low, p.high, p.price, stock.symbol),
    earnings: {
      annual: { period: "FY2026", revenueCr: 112000 + index * 5200, profitCr: 8500 + index * 430, yoyPercent: Number((8 + p.sentiment * 6).toFixed(1)) },
      quarter: {
        period: "Q1 FY2027",
        revenueCr: 28600 + index * 1170,
        profitCr: 2180 + index * 160,
        yoyPercent: Number((7 + p.surprise / 2).toFixed(1)),
        qoqPercent: Number((p.tech * 7 + p.sentiment * 4).toFixed(1)),
        surprisePercent: p.surprise
      },
      estimate: { profitCr: 2110 + index * 144, beatMiss: p.surprise >= 0 ? "beat" : "miss" }
    },
    concall: {
      latestDate: daysAgo(16 + index),
      summary: [
        `${stock.name} highlighted demand visibility in ${stock.sector.toLowerCase()} with selective margin discipline.`,
        p.sentiment > 0 ? "Management sounded constructive on near-term execution and cash conversion." : "Management flagged slower conversion cycles and cautious discretionary spending.",
        "Working-capital commentary remained a key monitoring point for the next quarter."
      ],
      diff: [
        { label: "Guidance tone", current: p.sentiment > 0 ? "Raised confidence" : "More cautious", previous: "Stable", impact: p.sentiment > 0 ? "positive" : "negative" },
        { label: "Capex language", current: index % 2 === 0 ? "Capex increased for capacity" : "Capex held steady", previous: "Normalised spend", impact: index % 2 === 0 ? "neutral" : "positive" },
        { label: "Demand commentary", current: p.tech > 0 ? "Order pipeline improved" : "Pipeline conversion slower", previous: "Mixed", impact: p.tech > 0 ? "positive" : "negative" }
      ]
    },
    holdings: {
      promoter: { value: Number((45 + (index % 5) * 2.1).toFixed(1)), trend: index % 3 === 0 ? 0.4 : -0.1 },
      fii: { value: Number((18 + (index % 4) * 1.8).toFixed(1)), trend: p.sentiment > 0 ? 0.6 : -0.5 },
      dii: { value: Number((11 + (index % 6) * 1.2).toFixed(1)), trend: p.tech > 0 ? 0.3 : -0.2 },
      filingDate: daysAgo(31 + index)
    },
    brokerage: {
      source: "Cached public-headline fallback",
      label: "demo fallback",
      lastUpdated: daysAgo(0.2 + index / 18),
      consensusTarget: Number((p.price * (1 + p.sentiment * 0.16 + p.tech * 0.08)).toFixed(2)),
      upsidePercent: Number(((p.sentiment * 16) + (p.tech * 8)).toFixed(1)),
      summary: `Cached foreign-brokerage monitor for ${stock.name}; live public headlines replace this when available.`,
      items: [
        {
          date: daysAgo(6 + index),
          broker: index % 3 === 0 ? "Jefferies" : index % 3 === 1 ? "Morgan Stanley" : "Nomura",
          rating: p.sentiment > 0.2 ? "positive" : p.sentiment < -0.2 ? "negative" : "neutral",
          targetPrice: Number((p.price * (1 + p.sentiment * 0.14 + 0.05)).toFixed(2)),
          upsidePercent: Number(((p.sentiment * 14) + 5).toFixed(1)),
          title: `${stock.name} public brokerage monitor: target-price watch updated`,
          source: "Seed cache",
          url: ""
        }
      ]
    },
    corporateActions: [
      { date: daysAgo(3 + index), type: index % 2 === 0 ? "Dividend" : "Block deal", title: index % 2 === 0 ? "Board approved interim dividend" : "Large negotiated trade disclosed", impact: p.sentiment >= 0 ? "positive" : "negative" },
      { date: daysAgo(22 + index), type: "Corporate announcement", title: `${stock.name} released quarterly investor update`, impact: "neutral" },
      { date: daysAgo(54 + index), type: index % 4 === 0 ? "Fundraise" : "Buyback/Split/Bonus watch", title: index % 4 === 0 ? "Enabling resolution for debt refinancing" : "No fresh split or bonus action; calendar monitored", impact: index % 4 === 0 ? "positive" : "neutral" }
    ],
    news: [
      ...(stock.symbol === "RELIANCE.NS" ? [{
        date: "2026-08-28T13:10:00.000Z",
        title: "SEBI observation letter clears Jio Platforms DRHP for proposed IPO",
        sentiment: "positive",
        score: 0.82,
        tag: "Reliance / Jio IPO",
        source: "Fortune India / Economic Times",
        url: "https://www.fortuneindia.com/markets/reliances-jio-platforms-gets-sebi-nod-to-launch-indias-biggest-ipo/156416"
      }] : []),
      { date: daysAgo(1 + index / 8), title: `${stock.sector} policy update keeps ${stock.name} on institutional radar`, sentiment: p.sentiment > 0.25 ? "positive" : p.sentiment < -0.25 ? "negative" : "neutral", score: p.sentiment, tag: stock.sector },
      { date: daysAgo(5 + index), title: `Government capex and import-cost signals mapped to ${stock.sector}`, sentiment: p.tech > 0 ? "positive" : "neutral", score: p.tech / 2, tag: "Govt policy" },
      { date: daysAgo(11 + index), title: `Global risk watch: currency, crude and rate movement sensitivity`, sentiment: p.sentiment < -0.3 ? "negative" : "neutral", score: p.sentiment / 2, tag: "Geopolitical" }
    ],
    analystRatingChange: index % 5 === 0 ? "upgrade" : index % 7 === 0 ? "downgrade" : "none",
    technical: {
      signalScore: p.tech,
      reason: p.tech > 0 ? "Price reclaimed short moving average with constructive RSI" : "Momentum softened below short moving average"
    },
    scoringInputs: {
      priceChangePercent,
      volumeVsAveragePercent,
      earningsSurprisePercent: p.surprise,
      newsSentimentScore: p.sentiment,
      technicalSignalScore: p.tech,
      technicalReason: p.tech > 0 ? "RSI and moving averages are constructive" : "RSI and moving averages weakened",
      analystRatingChange: index % 5 === 0 ? "upgrade" : index % 7 === 0 ? "downgrade" : "none",
      corporateActionImpact: index % 2 === 0 ? 1 : p.sentiment > 0 ? 0.5 : -0.5,
      corporateActionReason: index % 2 === 0 ? "Dividend or buyback-style shareholder return signal" : "Block deal and corporate action feed updated",
      userSpecificEventImpact: Math.abs(priceChangePercent) > 2 ? Math.sign(priceChangePercent) : 0,
      userSpecificEventReason: Math.abs(priceChangePercent) > 2 ? "Demo alert: 2% move from open triggered" : "No custom trigger fired"
    }
  };
}
