/** Drawn symbols for Slot 777 Cổ Điển (no emoji looks right for these) */

/** A bold red 7 with a gold rim */
export function Seven({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="7">
      <defs>
        <linearGradient id="s7-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6b6b" /><stop offset="0.45" stopColor="#e11d48" /><stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
        <linearGradient id="s7-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff7ae" /><stop offset="0.5" stopColor="#facc15" /><stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path d="M11 7h43v10L35 58H20l18-38H22v6H11z" fill="#3b0a0a" transform="translate(2 3)" opacity="0.45" />
      <path d="M11 7h43v10L35 58H20l18-38H22v6H11z" fill="url(#s7-red)" stroke="url(#s7-gold)" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M15 10h35v3H15z" fill="#fff" opacity="0.45" />
    </svg>
  );
}

/** The classic black BAR tile */
export function Bar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 44" className={className} aria-label="BAR">
      <defs>
        <linearGradient id="s7-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f3f46" /><stop offset="0.5" stopColor="#09090b" /><stop offset="1" stopColor="#27272a" />
        </linearGradient>
        <linearGradient id="s7-bar-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef08a" /><stop offset="0.5" stopColor="#f59e0b" /><stop offset="1" stopColor="#fde047" />
        </linearGradient>
      </defs>
      <rect x="3" y="5" width="66" height="34" rx="7" fill="url(#s7-bar)" stroke="url(#s7-bar-rim)" strokeWidth="3.5" />
      <rect x="8" y="9" width="56" height="5" rx="2.5" fill="#fff" opacity="0.18" />
      <text x="36" y="31.5" textAnchor="middle" fontFamily="Arial Black, Impact, sans-serif" fontWeight="900" fontSize="21" letterSpacing="1.5" fill="#fde047" stroke="#7c2d12" strokeWidth="0.8">BAR</text>
    </svg>
  );
}
