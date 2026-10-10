import QRCode from "qrcode";
import { STARTING_BALANCE } from "@shared/schema";
import { REFERRAL_WELCOME } from "@shared/stickers";
import type { Language } from "@/lib/lang-context";

/**
 * Brag cards: a 1080x1920 picture (phone story / TikTok size) drawn on a canvas in the browser.
 * The QR code is the player's own invite link, so every shared win is also an invite.
 */

export interface ShareCardData {
  emoji: string;
  title: string;
  amount?: number;
  detail: string;
  username: string;
  lang: Language;
}

const W = 1080, H = 1920;

export function inviteUrl(username: string) {
  return `${location.origin}/auth?ref=${encodeURIComponent(username)}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits the width */
function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, weight: string, start: number, maxW: number) {
  let size = start;
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 4; } while (ctx.measureText(text).width > maxW && size > 20);
}

function goldText(ctx: CanvasRenderingContext2D, text: string, y: number, size: number) {
  const g = ctx.createLinearGradient(0, y - size, 0, y + size * 0.2);
  g.addColorStop(0, "#fff7c2");
  g.addColorStop(0.45, "#facc15");
  g.addColorStop(1, "#f97316");
  ctx.lineWidth = Math.max(6, size / 12);
  ctx.strokeStyle = "rgba(60,10,10,0.85)";
  ctx.strokeText(text, W / 2, y);
  ctx.fillStyle = g;
  ctx.fillText(text, W / 2, y);
}

export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  const tr = <T,>(vi: T, en: T, zh: T): T => (d.lang === "vi" ? vi : d.lang === "zh" ? zh : en);
  try { await Promise.all([document.fonts.load("120px Lobster"), document.fonts.load("800 80px Nunito")]); } catch { /* use fallbacks */ }
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // CJK fallbacks so Chinese titles draw with a real font instead of boxes
  const cjk = "'PingFang TC', 'Noto Sans CJK TC', 'Noto Sans TC', 'Microsoft JhengHei'";
  const display = `Lobster, Georgia, ${cjk}, serif`;
  const body = `Nunito, 'Segoe UI', Roboto, Arial, ${cjk}, sans-serif`;

  // Background: red glow over deep purple
  const bg = ctx.createRadialGradient(W / 2, 620, 60, W / 2, 760, 1250);
  bg.addColorStop(0, "#b91c1c");
  bg.addColorStop(0.45, "#4c0b2e");
  bg.addColorStop(1, "#08030f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Light rays behind the prize
  ctx.save();
  ctx.translate(W / 2, 860);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    const ray = ctx.createLinearGradient(0, 0, 0, -900);
    ray.addColorStop(0, "rgba(250,204,21,0.22)");
    ray.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = ray;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, -900); ctx.lineTo(70, -900); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Sparkles (fixed pattern, so every card looks the same quality)
  for (let i = 0; i < 70; i++) {
    const x = (i * 397) % W, y = (i * 733) % H, r = 2 + (i % 4) * 1.5;
    ctx.fillStyle = `rgba(255,${200 + (i % 50)},120,${0.25 + (i % 5) / 10})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Gold frame
  ctx.lineWidth = 10;
  const frame = ctx.createLinearGradient(0, 0, W, H);
  frame.addColorStop(0, "#fde68a"); frame.addColorStop(0.5, "#b45309"); frame.addColorStop(1, "#fde68a");
  ctx.strokeStyle = frame;
  roundRect(ctx, 34, 34, W - 68, H - 68, 56); ctx.stroke();

  // Corner lanterns
  ctx.font = `110px ${body}`;
  ctx.fillText("🏮", 130, 190); ctx.fillText("🏮", W - 130, 190);

  // Logo and name
  const logo = await loadImage("/icons/icon-512.png");
  if (logo) {
    ctx.save();
    roundRect(ctx, W / 2 - 130, 110, 260, 260, 60); ctx.clip();
    ctx.drawImage(logo, W / 2 - 130, 110, 260, 260);
    ctx.restore();
  }
  ctx.font = `110px ${display}`;
  goldText(ctx, "VnSlot 888", 500, 110);

  // The prize
  ctx.font = `230px ${body}`;
  ctx.fillText(d.emoji, W / 2, 790);
  fitFont(ctx, d.title, display, "", 150, W - 140);
  goldText(ctx, d.title, 980, 150);
  if (d.amount != null) {
    const amount = `+${d.amount.toLocaleString(tr("vi-VN", "en-GB", "zh-TW"))}`;
    fitFont(ctx, amount, body, "800", 170, W - 160);
    ctx.shadowColor = "rgba(250,204,21,0.9)"; ctx.shadowBlur = 40;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(amount, W / 2, 1170);
    ctx.shadowBlur = 0;
    ctx.font = `bold 56px ${body}`;
    ctx.fillStyle = "#fde68a";
    ctx.fillText(tr("xu 🪙", "coins 🪙", "金幣 🪙"), W / 2, 1245);
  }
  fitFont(ctx, d.detail, body, "bold", 54, W - 160);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(d.detail, W / 2, d.amount != null ? 1330 : 1180);
  fitFont(ctx, `🎉 ${d.username}`, body, "800", 64, W - 160);
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(`🎉 ${d.username}`, W / 2, d.amount != null ? 1420 : 1280);

  // Invite panel with the QR code
  const px = 80, py = 1480, pw = W - 160, ph = 330;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, px, py, pw, ph, 40); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(250,204,21,0.6)"; ctx.stroke();
  const qrSize = 270;
  const qr = await QRCode.toDataURL(inviteUrl(d.username), { margin: 1, width: qrSize, color: { dark: "#1a0a2e", light: "#ffffff" } });
  const qrImg = await loadImage(qr);
  if (qrImg) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, px + 30, py + 30, qrSize, qrSize, 20); ctx.fill();
    ctx.drawImage(qrImg, px + 30, py + 30, qrSize, qrSize);
  }
  ctx.textAlign = "left";
  const tx = px + qrSize + 70, tw = pw - qrSize - 100;
  const playFree = tr("Chơi miễn phí!", "Play free!", "免費玩！");
  fitFont(ctx, playFree, display, "", 76, tw);
  ctx.fillStyle = "#facc15"; ctx.fillText(playFree, tx, py + 115);
  const welcome = STARTING_BALANCE + REFERRAL_WELCOME;
  const scan = tr(`Quét mã: +${welcome.toLocaleString("vi-VN")} xu`, `Scan: +${welcome.toLocaleString("en-US")} coins`, `掃碼：+${welcome.toLocaleString("zh-TW")} 金幣`);
  fitFont(ctx, scan, body, "bold", 44, tw);
  ctx.fillStyle = "#ffffff"; ctx.fillText(scan, tx, py + 185);
  fitFont(ctx, location.host, body, "bold", 42, tw);
  ctx.fillStyle = "#fde68a"; ctx.fillText(location.host, tx, py + 250);
  ctx.textAlign = "center";

  // Honest small print: play money only
  ctx.font = `bold 30px ${body}`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(tr("Xu ảo · chỉ để giải trí · không đổi ra tiền · 18+", "Play coins · entertainment only · no cash value · 18+", "遊戲金幣 · 僅供娛樂 · 無法兌換現金 · 18+"), W / 2, H - 70);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not draw the card"))), "image/png"));
}

/** Opens the phone's share sheet with the picture, or saves it when sharing files isn't supported */
export async function shareCardImage(blob: Blob, text: string, url: string): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], "vnslot888.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${text} ${url}`, title: "VnSlot 888" });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  saveCardImage(blob);
  return "saved";
}

export function saveCardImage(blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vnslot888.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
