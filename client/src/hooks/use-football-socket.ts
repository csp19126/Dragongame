import { useCallback, useEffect, useRef, useState } from "react";
import type { FootballServerMsg } from "@shared/football";

/** Live connection to an online penalty shootout, reconnecting by itself if the line drops */
export function useFootballSocket(code: string | null, onMessage: (m: FootballServerMsg) => void) {
  const [connected, setConnected] = useState(false);
  /** The table couldn't be reached at all (gone, or never existed) */
  const [failed, setFailed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!code) return;
    let closedByUs = false;
    let retry: number | undefined;
    let attempt = 0;
    let everOpened = false;
    setFailed(false);
    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/football?code=${encodeURIComponent(code)}`);
      wsRef.current = ws;
      ws.onopen = () => { attempt = 0; everOpened = true; setConnected(true); setFailed(false); };
      ws.onmessage = (e) => { try { handler.current(JSON.parse(e.data)); } catch { /* ignore */ } };
      ws.onclose = () => {
        setConnected(false);
        if (!everOpened && attempt >= 2) setFailed(true);
        if (!closedByUs) retry = window.setTimeout(open, Math.min(8000, 500 * 2 ** attempt++));
      };
    };
    open();
    return () => { closedByUs = true; clearTimeout(retry); wsRef.current?.close(); wsRef.current = null; };
  }, [code]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { connected, failed, send };
}
