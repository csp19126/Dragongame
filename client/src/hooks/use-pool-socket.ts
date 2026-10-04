import { useCallback, useEffect, useRef, useState } from "react";
import type { PoolServerMsg } from "@shared/pool/protocol";

/** Live connection to an online pool table, reconnecting by itself if the line drops */
export function usePoolSocket(code: string | null, onMessage: (m: PoolServerMsg) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!code) return;
    let closedByUs = false;
    let retry: number | undefined;
    let attempt = 0;
    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/pool?code=${encodeURIComponent(code)}`);
      wsRef.current = ws;
      ws.onopen = () => { attempt = 0; setConnected(true); };
      ws.onmessage = (e) => { try { handler.current(JSON.parse(e.data)); } catch { /* ignore */ } };
      ws.onclose = () => {
        setConnected(false);
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

  return { connected, send };
}
