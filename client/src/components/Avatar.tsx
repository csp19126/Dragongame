import { useState } from "react";
import { safeAvatarUrl, nameHue, initialOf } from "@shared/social";

export interface AvatarUser { username: string; avatarUrl?: string | null; profileImageUrl?: string | null }

/**
 * A player's round picture: their photo if they've set one, otherwise a coloured circle with
 * the first letter of their name (the colour always the same for the same name).
 */
export function Avatar({ user, size = 32, online, ring, className = "", onClick, testid }: {
  user: AvatarUser; size?: number; online?: boolean; ring?: boolean; className?: string; onClick?: () => void; testid?: string;
}) {
  const url = safeAvatarUrl(user.avatarUrl ?? user.profileImageUrl);
  const [broken, setBroken] = useState<string | null>(null);
  const showPhoto = url && broken !== url;
  const h = nameHue(user.username);
  const dot = Math.max(8, Math.round(size * 0.26));
  const body = (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} data-testid={testid}>
      <span className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center select-none ${ring ? "ring-2 ring-yellow-400/70 ring-offset-1 ring-offset-[#140b26]" : "border border-white/15"}`}
        style={showPhoto ? undefined : { background: `linear-gradient(135deg, hsl(${h} 75% 52%), hsl(${(h + 40) % 360} 70% 32%))` }}>
        {showPhoto
          ? <img src={url} alt={user.username} loading="lazy" draggable={false} className="w-full h-full object-cover" onError={() => setBroken(url)} />
          : <span className="font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" style={{ fontSize: Math.round(size * 0.44) }}>{initialOf(user.username)}</span>}
      </span>
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 rounded-full border-2 border-[#140b26] ${online ? "bg-emerald-400" : "bg-slate-500"}`} style={{ width: dot, height: dot }} />
      )}
    </span>
  );
  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="rounded-full shrink-0 active:scale-95 transition" aria-label={user.username}>
      {body}
    </button>
  );
}
