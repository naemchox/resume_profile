import type { Quote } from "./types";

// API ไม่เป็นทางการของ Yahoo Finance — หุ้นไทยใช้ .BK, ข้อมูลล่าช้า ~15 นาที
export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      if (res.status !== 404) console.log(`yahoo ${symbol}: HTTP ${res.status}`);
      return null;
    }
    const json: any = await res.json();
    const m = json?.chart?.result?.[0]?.meta;
    if (!m || typeof m.regularMarketPrice !== "number") return null;
    return {
      symbol: m.symbol,
      name: m.longName || m.shortName || m.symbol,
      currency: m.currency ?? "",
      price: m.regularMarketPrice,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice,
      time: m.regularMarketTime ?? 0,
    };
  } catch (err) {
    console.log(`yahoo ${symbol}: ${err}`);
    return null;
  }
}

export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.all(symbols.map(fetchQuote));
  return results.filter((q): q is Quote => q !== null);
}

/** "PTT" → ลอง PTT.BK ก่อน ถ้าไม่มีค่อยลอง PTT (หุ้นต่างประเทศ) */
export async function resolveSymbol(input: string): Promise<Quote | null> {
  const s = input.toUpperCase();
  if (s.includes(".")) return fetchQuote(s);
  return (await fetchQuote(`${s}.BK`)) ?? (await fetchQuote(s));
}
