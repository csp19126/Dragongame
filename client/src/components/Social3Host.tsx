import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { ChallengePicker, useSocial3State } from "@/components/Challenge";
import { QuestsSheet } from "@/components/Quests";
import { OnlineNowSheet } from "@/components/OnlineNow";

/** The Social 3 sheets that can open from anywhere (inside the profile-sheet provider) */
export function Social3Sheets() {
  const { user } = useAuth();
  const { s, set } = useSocial3State();
  if (!user) return null;
  return createPortal(
    <AnimatePresence>
      {s.quests && <QuestsSheet key="quests" onClose={() => set((x) => ({ ...x, quests: false }))} />}
      {s.online && <OnlineNowSheet key="online" onClose={() => set((x) => ({ ...x, online: false }))} />}
      {s.challenge && <ChallengePicker key="challenge" username={s.challenge} onClose={() => set((x) => ({ ...x, challenge: null }))} />}
    </AnimatePresence>,
    document.body,
  );
}
