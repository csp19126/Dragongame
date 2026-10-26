import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLang, fmtCoins } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { soundManager } from "@/lib/sound";
import { fireworks } from "@/lib/celebrate";
import { DM_UNREAD_KEY } from "@/hooks/use-dm";
import type { NotificationView } from "@shared/friends";

export const NOTIF_KEY = ["/api/notifications"];
export const NOTIF_UNREAD_KEY = ["/api/notifications/unread"];
export const FRIENDS_KEY = ["/api/friends"];
export const CONV_KEY = ["/api/dm/conversations"];

type Listener = (msg: any) => void;
interface SocialCtx { connected: boolean; send: (msg: object) => void; subscribe: (fn: Listener) => () => void }
const Ctx = createContext<SocialCtx>({ connected: false, send: () => {}, subscribe: () => () => {} });

/** The live social connection: `connected` is false while it's down (screens then poll instead) */
export const useSocial = () => useContext(Ctx);

/** Calls `fn` for every message the server pushes (always the latest `fn`) */
export function useSocialEvent(fn: Listener) {
  const { subscribe } = useSocial();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((m) => ref.current(m)), [subscribe]);
}

/** Unread notifications (one shared query; the socket keeps it fresh, polling is the fallback) */
export function useNotifUnread() {
  const { user } = useAuth();
  const { connected } = useSocial();
  const q = useQuery<{ total: number }>({ queryKey: NOTIF_UNREAD_KEY, enabled: !!user, refetchInterval: connected ? 120_000 : 25_000, staleTime: 10_000 });
  return user ? q.data?.total ?? 0 : 0;
}

/**
 * Opens /ws/social while signed in, reconnecting with a growing pause (1 s, 2 s, 4 s … 30 s)
 * when it drops. Tells the server which page the player is on, so friends see what they play.
 */
export function SocialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tr } = useLang();
  const { toast } = useToast();
  const [location] = useLocation();
  const search = useSearch();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<Listener>());
  const route = useRef(location);
  route.current = location + (search ? `?${search}` : "");
  const trRef = useRef(tr);
  trRef.current = tr;

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let stop = false;
    let tries = 0;
    let timer: number | undefined;
    const handle = (m: any) => {
      const tr = trRef.current;
      switch (m.t) {
        case "unread":
          queryClient.setQueryData(DM_UNREAD_KEY, { total: m.dm });
          queryClient.setQueryData(NOTIF_UNREAD_KEY, { total: m.notif });
          break;
        case "notif": {
          queryClient.invalidateQueries({ queryKey: NOTIF_KEY });
          const n = m.n as NotificationView;
          const who = n.actor?.username ?? "";
          const title = n.kind === "friend_request" ? tr(`👋 ${who} muốn kết bạn`, `👋 ${who} wants to be friends`, `👋 ${who} 想加你為好友`)
            : n.kind === "friend_accepted" ? tr(`🤝 ${who} đã đồng ý kết bạn`, `🤝 ${who} accepted your request`, `🤝 ${who} 接受了你的好友邀請`)
            : n.kind === "mention" ? tr(`💬 ${who} nhắc đến bạn`, `💬 ${who} mentioned you`, `💬 ${who} 提到了你`)
            : n.kind === "gift" ? tr(`🧧 ${who} gửi bạn Lì Xì ${fmtCoins(n.data.amount)} xu!`, `🧧 ${who} sent you a Lì Xì of ${fmtCoins(n.data.amount)} coins!`, `🧧 ${who} 送你 ${fmtCoins(n.data.amount)} 金幣紅包！`)
            : n.kind === "invite" ? tr(`⚔️ ${who} thách bạn một ván!`, `⚔️ ${who} challenged you!`, `⚔️ ${who} 向你發起挑戰！`)
            : n.kind === "quest" ? tr("📜 Xong một nhiệm vụ! Vào nhận thưởng nhé", "📜 Quest complete! Claim your reward", "📜 任務完成！快去領取獎勵")
            : n.kind === "club" && n.data.action === "reward" ? tr(`🏆 Thưởng hội tuần: +${fmtCoins(n.data.amount)} xu!`, `🏆 Weekly club reward: +${fmtCoins(n.data.amount)} coins!`, `🏆 公會週獎勵：+${fmtCoins(n.data.amount)} 金幣！`)
            : n.kind === "club" && n.data.action === "request" ? tr(`🏯 ${who} xin vào hội`, `🏯 ${who} wants to join your club`, `🏯 ${who} 申請加入公會`)
            : null;
          if (title) { soundManager.ping(); toast({ title, description: tr("Mở 🔔 để xem", "Open 🔔 to see it", "打開 🔔 查看") }); }
          if (n.kind === "friend_request" || n.kind === "friend_accepted") queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
          break;
        }
        case "friends":
          queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
          queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/players/") });
          break;
        case "presence":
          queryClient.setQueryData(FRIENDS_KEY, (old: any) => old && {
            ...old,
            friends: old.friends.map((f: any) => (f.username === m.username ? { ...f, online: m.online, playing: m.playing, join: m.join } : f)),
          });
          break;
        case "dm":
          queryClient.invalidateQueries({ queryKey: CONV_KEY });
          break;
        case "levelup":
          soundManager.levelUp();
          fireworks(1600, 0.6);
          toast({ title: tr(`🎉 Lên cấp ${m.level}!`, `🎉 Level ${m.level}!`, `🎉 升到 Lv.${m.level}！`), description: tr("Chơi càng nhiều, cấp càng cao.", "The more you play, the higher you go.", "玩得越多，等級越高。") });
          break;
      }
      for (const fn of listeners.current) {
        try { fn(m); } catch (e) { console.error("[social]", e); }
      }
    };
    const connect = () => {
      if (stop) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      let ws: WebSocket;
      try { ws = new WebSocket(`${proto}://${window.location.host}/ws/social`); } catch { schedule(); return; }
      wsRef.current = ws;
      ws.onopen = () => {
        tries = 0;
        setConnected(true);
        ws.send(JSON.stringify({ t: "presence", route: route.current }));
        // Catch up on anything missed while the socket was down
        queryClient.invalidateQueries({ queryKey: NOTIF_KEY });
        queryClient.invalidateQueries({ queryKey: CONV_KEY });
      };
      ws.onmessage = (e) => { try { handle(JSON.parse(String(e.data))); } catch { /* not ours */ } };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        schedule();
      };
      ws.onerror = () => { try { ws.close(); } catch { /* closed */ } };
    };
    const schedule = () => {
      if (stop) return;
      const wait = Math.min(30_000, 1000 * 2 ** tries) * (0.75 + Math.random() * 0.5);
      tries = Math.min(tries + 1, 6);
      timer = window.setTimeout(connect, wait);
    };
    // Back on the network or back to the tab: reconnect now rather than waiting out the pause
    const wake = () => {
      if (document.visibilityState !== "visible" || wsRef.current) return;
      clearTimeout(timer);
      tries = 0;
      connect();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      setConnected(false);
    };
  }, [user?.id, toast]);

  // Which page we're on (friends see the game)
  useEffect(() => { send({ t: "presence", route: route.current }); }, [location, search, send]);

  return <Ctx.Provider value={{ connected, send, subscribe }}>{children}</Ctx.Provider>;
}
