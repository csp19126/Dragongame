import { createRoot } from "react-dom/client";
import App from "./App";
import { listenForInstallPrompt } from "./lib/install";
import "./index.css";

// Before rendering: the browser's install offer can arrive very early
listenForInstallPrompt();

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
