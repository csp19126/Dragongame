import { useEffect, useState } from "react";
import { Download, Loader2, Share2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { renderShareCard, shareCardImage, saveCardImage, inviteUrl, type ShareCardData } from "@/lib/shareCard";

export type ShareWhat = Omit<ShareCardData, "username" | "lang">;

/** A preview of the brag card with Share and Save buttons */
export function ShareDialog({ what, onClose }: { what: ShareWhat; onClose: () => void }) {
  const { user } = useAuth();
  const { lang } = useLang();
  const vi = lang === "vi";
  const { toast } = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let url: string | null = null;
    renderShareCard({ ...what, username: user.username, lang })
      .then((b) => { setBlob(b); url = URL.createObjectURL(b); setSrc(url); })
      .catch(() => setFailed(true));
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, JSON.stringify(what), lang]);

  if (!user) return null;
  const text = vi ? `${what.title} trên VnSlot 888! Vào chơi với mình, đăng ký bằng link này được thêm 50.000 xu 🎁` : `${what.title} on VnSlot 888! Play with me — sign up with this link for 50,000 bonus coins 🎁`;

  const share = async () => {
    if (!blob) return;
    const r = await shareCardImage(blob, text, inviteUrl(user.username));
    if (r === "saved") toast({ title: vi ? "Đã lưu ảnh: đăng lên TikTok, Facebook hay Zalo nhé!" : "Picture saved: post it on TikTok, Facebook or Zalo!" });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4" onClick={onClose} data-testid="share-dialog">
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="Close" data-testid="button-share-close">
          <X className="w-5 h-5" />
        </button>
        {src ? (
          <img src={src} alt={what.title} className="h-[min(62vh,640px)] w-auto rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.7)] border border-yellow-400/40" data-testid="img-share-card" />
        ) : (
          <div className="h-[min(62vh,640px)] aspect-[9/16] rounded-2xl bg-white/5 flex items-center justify-center text-white/60 text-sm">
            {failed ? (vi ? "Không tạo được ảnh" : "Couldn't make the picture") : <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />}
          </div>
        )}
      </div>
      <div className="w-full max-w-xs grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" disabled={!blob} onClick={share} className="py-3 rounded-xl bg-gradient-to-b from-yellow-300 to-orange-500 text-black font-black flex items-center justify-center gap-1.5 disabled:opacity-40" data-testid="button-share-native">
          <Share2 className="w-4 h-4" />{vi ? "Chia sẻ" : "Share"}
        </button>
        <button type="button" disabled={!blob} onClick={() => blob && saveCardImage(blob)} className="py-3 rounded-xl bg-white/10 text-white font-black flex items-center justify-center gap-1.5 disabled:opacity-40" data-testid="button-share-save">
          <Download className="w-4 h-4" />{vi ? "Lưu ảnh" : "Save"}
        </button>
      </div>
      <p className="text-[11px] text-white/50 text-center max-w-xs" onClick={(e) => e.stopPropagation()}>
        {vi ? "Mã QR là link mời của bạn: bạn bè đăng ký qua đó, bạn nhận 100.000 xu." : "The QR code is your invite link: when friends join through it, you earn 100,000 coins."}
      </p>
    </div>
  );
}

/** A small "share this" button that opens the dialog */
export function ShareButton({ what, label, className = "" }: { what: ShareWhat; label?: string; className?: string }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 text-white font-black shadow-lg active:scale-95 ${className || "px-4 py-2 text-sm"}`}
        data-testid="button-share-win">
        <Share2 className="w-4 h-4" />{label ?? (lang === "vi" ? "Khoe chiến thắng" : "Share my win")}
      </button>
      {open && <ShareDialog what={what} onClose={() => setOpen(false)} />}
    </>
  );
}
