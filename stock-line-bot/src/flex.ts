import type { Quote } from "./types";

const UP = "#16A34A";
const DOWN = "#DC2626";
const FLAT = "#888888";

export function flag(symbol: string): string {
  if (symbol.endsWith(".BK")) return "🇹🇭";
  if (!symbol.includes(".")) return "🇺🇸";
  return "🌐";
}

export function displaySymbol(symbol: string): string {
  return symbol.replace(/\.BK$/, "");
}

export function bangkokTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtPrice(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function change(q: Quote) {
  const pct = q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, color: pct > 0 ? UP : pct < 0 ? DOWN : FLAT };
}

/** ข้อความสรุปหุ้นทุกตัวใน bubble เดียว = 1 ข้อความ */
export function priceMessage(quotes: Quote[], now: Date, closed: Set<string> = new Set()) {
  const rows = quotes.map((q) => {
    const c = change(q);
    const isClosed = closed.has(q.symbol);
    return {
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${flag(q.symbol)} ${displaySymbol(q.symbol)}`, weight: "bold", size: "sm", flex: 4 },
        { type: "text", text: fmtPrice(q.price), size: "sm", align: "end", flex: 3, color: isClosed ? FLAT : "#111111" },
        { type: "text", text: isClosed ? "ปิด" : c.text, size: "sm", align: "end", flex: 3, color: isClosed ? FLAT : c.color },
      ],
    };
  });

  const altText = quotes
    .map((q) => `${displaySymbol(q.symbol)} ${fmtPrice(q.price)} (${change(q).text})`)
    .join(", ")
    .slice(0, 400);

  return {
    type: "flex",
    altText: altText || "ราคาหุ้น",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "📈 ราคาหุ้น", weight: "bold", size: "lg" },
          { type: "text", text: `อัปเดต ${bangkokTime(now)} น.`, size: "xs", color: FLAT },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "md", contents: rows },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text: "Yahoo Finance · ล่าช้าประมาณ 15 นาที", size: "xxs", color: FLAT }],
      },
    },
  };
}
