import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useAuth, ME_KEY } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { Avatar } from "@/components/Avatar";
import { AVATAR_PX, AVATAR_MAX_BYTES, SOCIAL_MIN_GAMES } from "@shared/social";

const VIEW = 260; // the crop square on screen, in CSS pixels

/** Draws the chosen square of the photo onto a small canvas and returns a JPEG data URL */
function cropToJpeg(img: HTMLImageElement, left: number, top: number, scale: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1a0a2e";
  ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -left / scale, -top / scale, VIEW / scale, VIEW / scale, 0, 0, AVATAR_PX, AVATAR_PX);
  let q = 0.85;
  let url = canvas.toDataURL("image/jpeg", q);
  while (url.length * 0.75 > AVATAR_MAX_BYTES && q > 0.4) { q -= 0.15; url = canvas.toDataURL("image/jpeg", q); }
  return url;
}

/** Pick a photo, drag and zoom it in a square, and upload it as your profile picture */
export function PhotoUploader({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const { tr, srv } = useLang();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const locked = user.gamesPlayed < SOCIAL_MIN_GAMES && !user.isAdmin;

  const errText = (e: unknown) => {
    const m = e instanceof ApiError ? e.message : String(e);
    if (m === "play_first") return tr(`Chơi ${SOCIAL_MIN_GAMES} ván để đặt ảnh đại diện`, `Play ${SOCIAL_MIN_GAMES} games to add a photo`, `玩 ${SOCIAL_MIN_GAMES} 局後才能設定大頭貼`);
    if (m === "muted") return tr("Bạn đang bị tạm khóa, chưa đổi ảnh được.", "You're muted for now, so you can't change your photo.", "你目前被暫時禁言，無法更換照片。");
    return srv(m);
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast({ title: tr("Hãy chọn một tấm ảnh", "Please pick a photo", "請選擇一張照片"), variant: "destructive" }); return; }
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => { URL.revokeObjectURL(url); toast({ title: tr("Không mở được ảnh này", "Couldn't open that photo", "無法開啟這張照片"), variant: "destructive" }); };
    im.src = url;
  };

  const done = (profileImageUrl: string | null) => {
    queryClient.setQueryData(ME_KEY, (u: any) => (u ? { ...u, profileImageUrl } : u));
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/players/") });
    queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
  };

  const upload = async (dataUrl: string) => {
    setBusy(true);
    try {
      const r = await (await apiRequest("POST", "/api/profile/photo", { photo: dataUrl })).json();
      done(r.profileImageUrl);
      closeCrop();
      toast({ title: tr("Đã cập nhật ảnh đại diện 📸", "Photo updated 📸", "大頭貼已更新 📸") });
    } catch (e) {
      toast({ title: errText(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(tr("Xóa ảnh đại diện?", "Remove your photo?", "要移除大頭貼嗎？"))) return;
    setBusy(true);
    try { await apiRequest("DELETE", "/api/profile/photo"); done(null); } catch (e) { toast({ title: errText(e), variant: "destructive" }); } finally { setBusy(false); }
  };

  const closeCrop = () => { if (img) URL.revokeObjectURL(img.src); setImg(null); if (input.current) input.current.value = ""; };

  return (
    <div className={`flex ${compact ? "flex-row items-center justify-center" : "flex-col items-center"} gap-2`} data-testid="photo-uploader">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="input-photo" />
      {!compact && <Avatar user={user} size={96} ring />}
      {locked ? (
        <p className="text-[11px] text-white/55 text-center">{tr(`Chơi ${SOCIAL_MIN_GAMES} ván để đặt ảnh đại diện`, `Play ${SOCIAL_MIN_GAMES} games to add a photo`, `玩 ${SOCIAL_MIN_GAMES} 局後才能設定大頭貼`)}</p>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="h-10 px-4 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black text-sm flex items-center gap-1.5 disabled:opacity-50 active:scale-95" data-testid="button-photo-pick">
            <Camera className="w-4 h-4" />{user.profileImageUrl ? tr("Đổi ảnh", "Change photo", "更換照片") : tr("Thêm ảnh", "Add photo", "新增照片")}
          </button>
          {user.profileImageUrl && (
            <button type="button" disabled={busy} onClick={remove} className="h-10 px-3 rounded-xl bg-white/10 text-white/80 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50" data-testid="button-photo-remove">
              <Trash2 className="w-4 h-4" />{tr("Xóa", "Remove", "移除")}
            </button>
          )}
        </div>
      )}
      {createPortal(
        <AnimatePresence>
          {img && <CropDialog img={img} busy={busy} onCancel={closeCrop} onSave={(left, top, scale) => upload(cropToJpeg(img, left, top, scale))} />}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function CropDialog({ img, busy, onCancel, onSave }: { img: HTMLImageElement; busy: boolean; onCancel: () => void; onSave: (left: number, top: number, scale: number) => void }) {
  const { tr } = useLang();
  const base = VIEW / Math.min(img.naturalWidth, img.naturalHeight);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const scale = base * zoom;
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  // Keep the photo covering the whole square
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.max(-(w - VIEW) / 2, Math.min((w - VIEW) / 2, o.x)),
    y: Math.max(-(h - VIEW) / 2, Math.min((h - VIEW) / 2, o.y)),
  });
  const o = clamp(off);
  const left = (VIEW - w) / 2 + o.x, top = (VIEW - h) / 2 + o.y;
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  return (
    <motion.div className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="crop-dialog">
      <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl bg-[#1a0a2e] border border-yellow-500/40 p-4 flex flex-col items-center gap-3">
        <div className="font-black text-yellow-300">{tr("Căn chỉnh ảnh", "Frame your photo", "調整照片")}</div>
        <div className="relative overflow-hidden rounded-2xl bg-black touch-none cursor-grab active:cursor-grabbing" style={{ width: VIEW, height: VIEW }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: o.x, oy: o.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.002)))}>
          <img src={img.src} alt="" draggable={false} className="absolute max-w-none pointer-events-none select-none" style={{ left, top, width: w, height: h }} />
          {/* The round frame other players will see */}
          <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: "radial-gradient(circle at center, transparent 69.5%, rgba(0,0,0,0.55) 70.5%)" }} />
          <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-yellow-300/80" />
        </div>
        <div className="flex items-center gap-2 w-full px-2">
          <ZoomOut className="w-4 h-4 text-white/60" />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-yellow-400" aria-label={tr("Phóng to", "Zoom", "縮放")} data-testid="crop-zoom" />
          <ZoomIn className="w-4 h-4 text-white/60" />
        </div>
        <p className="text-[11px] text-white/50 text-center">{tr("Kéo để căn giữa. Chỉ dùng ảnh của chính bạn, không ảnh nhạy cảm.", "Drag to centre it. Only photos of you, nothing explicit.", "拖曳調整位置。只能使用你本人的照片，禁止不雅內容。")}</p>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button type="button" onClick={onCancel} className="py-2.5 rounded-xl bg-white/10 text-white font-black">{tr("Hủy", "Cancel", "取消")}</button>
          <button type="button" disabled={busy} onClick={() => onSave(left, top, scale)} className="py-2.5 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black flex items-center justify-center disabled:opacity-50" data-testid="button-crop-save">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : tr("Lưu ảnh", "Save photo", "儲存照片")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
