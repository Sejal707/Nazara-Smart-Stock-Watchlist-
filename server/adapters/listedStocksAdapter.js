export class ListedStocksAdapter {
  constructor(name) {
    this.name = name;
  }

  async list() {
    throw new Error("list() must be implemented by adapter");
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field.trim());
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  return rows;
}

function yahooNseSymbol(symbol) {
  const clean = symbol.trim().toUpperCase();
  return clean.endsWith(".NS") ? clean : `${clean}.NS`;
}

export class NseListedEquityAdapter extends ListedStocksAdapter {
  constructor() {
    super("NSE securities CSV");
    this.urls = [
      "https://archives.nseindia.com/content/equities/EQUITY_L.csv",
      "https://www.nseindia.com/content/equities/EQUITY_L.csv"
    ];
  }

  async list() {
    let lastError = null;

    for (const url of this.urls) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 Nazara hackathon demo",
            "Accept": "text/csv,*/*"
          },
          signal: AbortSignal.timeout(9000)
        });

        if (!response.ok) throw new Error(`NSE list request failed: ${response.status}`);
        const rows = parseCsv(await response.text());
        const headers = rows.shift()?.map((header) => header.toUpperCase()) ?? [];
        const symbolIndex = headers.findIndex((header) => header.includes("SYMBOL"));
        const nameIndex = headers.findIndex((header) => header.includes("NAME"));
        const isinIndex = headers.findIndex((header) => header.includes("ISIN"));
        const seriesIndex = headers.findIndex((header) => header.includes("SERIES"));

        if (symbolIndex < 0 || nameIndex < 0) throw new Error("NSE CSV missing expected headers");

        return rows
          .map((row) => ({
            symbol: yahooNseSymbol(row[symbolIndex] ?? ""),
            name: row[nameIndex] ?? row[symbolIndex],
            sector: seriesIndex >= 0 ? `NSE ${row[seriesIndex] || "Equity"}` : "NSE Equity",
            exchange: "NSE",
            marketCap: isinIndex >= 0 && row[isinIndex] ? row[isinIndex] : "Listed Equity"
          }))
          .filter((stock) => stock.symbol.length > 3 && stock.name);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Unable to fetch NSE listed securities");
  }
}
