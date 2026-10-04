/**
 * Scroll an element into view if it isn't fully on screen, so a roll or spin is never
 * missed. Runs a frame later: a scroll started in the same click as a re-render
 * (the button switching to its spinner) can be cancelled by the browser.
 */
export function showInView(el: HTMLElement | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    const headerH = 72;
    if (r.top >= headerH && r.bottom <= window.innerHeight) return;
    const room = window.innerHeight - headerH;
    const top = window.scrollY + r.top - headerH - Math.max(0, (room - r.height) / 2);
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  });
}
