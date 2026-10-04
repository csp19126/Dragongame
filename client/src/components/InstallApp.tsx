import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X, EllipsisVertical, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useInstall, type InstallMode } from "@/lib/install";
import { useLang } from "@/lib/lang-context";

const DISMISS_KEY = "install-banner-dismissed";
const DISMISS_DAYS = 7;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 864e5;
  } catch {
    return false;
  }
}

/** Steps for adding the site to the home screen by hand */
function Steps({ mode }: { mode: InstallMode }) {
  const { t } = useLang();
  const step = (n: number, body: React.ReactNode) => (
    <li className="flex items-start gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-yellow-400 text-black font-black flex items-center justify-center">{n}</span>
      <span className="pt-0.5">{body}</span>
    </li>
  );
  const ios = (
    <ol className="space-y-3 text-yellow-50" data-testid="install-steps-ios">
      {step(1, <>{t.installIos1} <Share className="inline w-5 h-5 text-sky-400 -mt-1" /></>)}
      {step(2, <>{t.installIos2} <SquarePlus className="inline w-5 h-5 -mt-1" /> <b>“{t.installIosAdd}”</b></>)}
      {step(3, <>{t.installIos3} <b>“{t.installIosConfirm}”</b></>)}
    </ol>
  );
  const android = (
    <ol className="space-y-3 text-yellow-50" data-testid="install-steps-android">
      {step(1, <>{t.installAndroid1} <EllipsisVertical className="inline w-5 h-5 -mt-1" /></>)}
      {step(2, <>{t.installAndroid2}</>)}
    </ol>
  );
  if (mode === "ios") return ios;
  return (
    <div className="space-y-4">
      <div><p className="text-xs font-black uppercase tracking-widest text-yellow-400 mb-2">Android</p>{android}</div>
      <div><p className="text-xs font-black uppercase tracking-widest text-yellow-400 mb-2">iPhone / iPad (Safari)</p>{ios}</div>
    </div>
  );
}

/** The "how to install" box, also opened from the footer link */
export function InstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useLang();
  const { mode, install } = useInstall();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#140a2e] border-yellow-500/30 text-yellow-50 max-w-sm" data-testid="dialog-install">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-[0_0_20px_rgba(251,191,36,0.4)]" />
            <div className="text-left">
              <DialogTitle className="text-yellow-400 font-black">{t.installTitle}</DialogTitle>
              <DialogDescription className="text-yellow-100/70">{t.installDesc}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {mode === "installed" ? (
          <p className="flex items-center gap-2 text-green-300 font-bold"><Check className="w-5 h-5" />{t.installDone}</p>
        ) : mode === "prompt" ? (
          <button
            type="button"
            onClick={async () => { if (await install()) onOpenChange(false); }}
            className="w-full rounded-xl py-3 font-black text-lg text-black bg-gradient-to-b from-yellow-300 to-orange-500 flex items-center justify-center gap-2"
            data-testid="button-install-now"
          >
            <Download className="w-5 h-5" />{t.installNow}
          </button>
        ) : (
          <Steps mode={mode} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A small bar at the bottom offering to install, on browsers that can */
export function InstallBanner() {
  const { t } = useLang();
  const { mode, install } = useInstall();
  const [hidden, setHidden] = useState(true);
  const [dialog, setDialog] = useState(false);

  useEffect(() => { setHidden(dismissedRecently()); }, []);

  if (hidden || (mode !== "prompt" && mode !== "ios")) return <InstallDialog open={dialog} onOpenChange={setDialog} />;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setHidden(true);
  };

  return (
    <>
      <div className="fixed bottom-3 inset-x-3 z-50 mx-auto max-w-md flex items-center gap-3 rounded-2xl border border-yellow-400/40 bg-[#1a0b35]/95 backdrop-blur-xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.6)]" data-testid="install-banner">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl" />
        <div className="flex-1 min-w-0">
          <p className="font-black text-yellow-300 text-sm leading-tight">{t.installTitle}</p>
          <p className="text-[11px] text-yellow-100/70 leading-snug">{t.installBannerSub}</p>
        </div>
        <button
          type="button"
          onClick={async () => { if (mode === "prompt") { if (await install()) setHidden(true); } else setDialog(true); }}
          className="shrink-0 rounded-xl px-3.5 py-2 font-black text-sm text-black bg-gradient-to-b from-yellow-300 to-orange-500"
          data-testid="button-install-banner"
        >
          {t.installShort}
        </button>
        <button type="button" onClick={dismiss} aria-label={t.notNow} className="shrink-0 p-1 text-yellow-100/50 hover:text-yellow-100" data-testid="button-install-dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
      <InstallDialog open={dialog} onOpenChange={setDialog} />
    </>
  );
}
