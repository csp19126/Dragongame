import type { Hit } from "@shared/darts";
import type { Language } from "@/lib/lang-context";

/** Flight colours: seat 0 gold, seat 1 sky blue */
export const SEAT_COLORS = ["#facc15", "#38bdf8"] as const;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0–180 the way the caller says it: "one hundred and forty" */
export function scoreWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  return `one hundred${n % 100 ? ` and ${scoreWords(n % 100)}` : ""}`;
}

export interface Callout { id: number; big: string; small?: string; tone: "gold" | "red" | "green" | "white" | "max" }

let seq = 0;

/** What appears over the board when one dart lands */
export function dartCallout(h: Hit, lang: Language): Callout | null {
  const tr = (vi: string, en: string, zh: string) => (lang === "vi" ? vi : lang === "zh" ? zh : en);
  const id = ++seq;
  switch (h.ring) {
    case "bull": return { id, big: tr("HỒNG TÂM!", "BULL!", "紅心！"), small: "50", tone: "red" };
    case "outer": return { id, big: "25", small: tr("Vòng ngoài hồng tâm", "Outer bull", "外紅心"), tone: "green" };
    case "treble": return { id, big: tr(`BA LẦN ${h.n}!`, `TREBLE ${h.n}!`, `三倍 ${h.n}！`), small: String(h.score), tone: h.n >= 17 ? "gold" : "white" };
    case "double": return { id, big: tr(`ĐÔI ${h.n}!`, `DOUBLE ${h.n}!`, `雙倍 ${h.n}！`), small: String(h.score), tone: "green" };
    case "single": return null; // the little score pop on the board is enough
    default: return { id, big: tr("TRƯỢT", "MISS", "脫靶"), tone: "white" };
  }
}

/** What appears when a visit ends */
export function visitCallout(total: number, bust: boolean, checkout: boolean, lang: Language): Callout | null {
  const tr = (vi: string, en: string, zh: string) => (lang === "vi" ? vi : lang === "zh" ? zh : en);
  const id = ++seq;
  if (bust) return { id, big: tr("QUÁ ĐIỂM!", "BUST!", "爆分！"), small: tr("Điểm trở lại như đầu lượt", "Score goes back", "分數回到本輪開始"), tone: "red" };
  if (checkout) return { id, big: tr("KẾT THÚC!", "GAME SHOT!", "完美收尾！"), small: tr(`Đóng ${total} điểm`, `${total} checkout`, `${total} 分收尾`), tone: "gold" };
  if (total === 180) return { id, big: "ONE HUNDRED AND EIGHTY!", small: tr("Tối đa 180!", "Maximum!", "滿分 180！"), tone: "max" };
  if (total >= 100) return { id, big: String(total), small: tr("Lượt ném tuyệt vời!", "Ton plus!", "百分以上！"), tone: "gold" };
  return null;
}

/** What the pub caller says after a visit (in English, as is tradition) */
export function callerLine(total: number, bust: boolean, checkout: boolean): string | null {
  if (bust) return "No score!";
  if (checkout) return "Game shot!";
  if (total === 180) return "One hundred and eighty!";
  if (total === 0) return "No score!";
  return `${scoreWords(total)}!`;
}
