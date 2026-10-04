import { useEffect, useState } from "react";

/**
 * "Install the app" support.
 * Chrome/Edge/Samsung Internet on Android fire `beforeinstallprompt` once, often before
 * React has rendered, so the listener is attached at startup (main.tsx) and the event is
 * kept here. iPhone Safari has no such event: there the player adds the site to the home
 * screen from the Share menu, so we show the steps instead.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function listenForInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export type InstallMode = "prompt" | "ios" | "manual" | "installed";

/** How this browser can install the app right now */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const mode: InstallMode = installed || isStandalone() ? "installed" : deferred ? "prompt" : isIos() ? "ios" : "manual";

  /** Shows the browser's install dialog. Returns true if the player installed. */
  const install = async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null; // the event can only be used once
    await e.prompt();
    const { outcome } = await e.userChoice;
    notify();
    return outcome === "accepted";
  };

  return { mode, install };
}
