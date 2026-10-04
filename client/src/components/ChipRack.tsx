import { TABLE_CHIPS } from "@shared/tablegames";

export function fmtChip(a: number) {
  if (a >= 1_000_000) return `${+(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${+(a / 1000).toFixed(1)}K`;
  return String(a);
}

const CHIP_COLORS: Record<number, string> = {
  1000: "from-slate-200 to-slate-400 text-slate-900 border-slate-100",
  5000: "from-red-500 to-red-700 text-white border-red-300",
  10000: "from-sky-500 to-blue-700 text-white border-sky-300",
  50000: "from-emerald-500 to-green-700 text-white border-emerald-300",
  100000: "from-zinc-700 to-black text-yellow-300 border-zinc-400",
  500000: "from-purple-500 to-purple-800 text-white border-purple-300",
  1000000: "from-yellow-300 to-amber-600 text-black border-yellow-100",
};

/** A stake badge sitting on a bet spot */
export function ChipBadge({ amount, className = "" }: { amount: number; className?: string }) {
  const face = [...TABLE_CHIPS].reverse().find((c) => amount >= c) ?? TABLE_CHIPS[0];
  return (
    <span className={`inline-flex items-center justify-center min-w-[2.1rem] h-[2.1rem] px-1 rounded-full bg-gradient-to-b border-2 border-dashed font-black text-[10px] shadow-[0_2px_6px_rgba(0,0,0,0.6)] ${CHIP_COLORS[face]} ${className}`}>
      {fmtChip(amount)}
    </span>
  );
}

/** Pick the chip value that a tap on the table places */
export function ChipRack({ value, onChange, balance, disabled }: { value: number; onChange: (v: number) => void; balance: number; disabled?: boolean }) {
  return (
    <div className="flex justify-center gap-1.5 flex-wrap" data-testid="chip-rack">
      {TABLE_CHIPS.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled || c > balance}
          onClick={() => onChange(c)}
          data-testid={`chip-${c}`}
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b border-[3px] border-dashed font-black text-[11px] transition-transform disabled:opacity-25 ${CHIP_COLORS[c]} ${
            value === c ? "scale-110 ring-4 ring-yellow-300/80 shadow-[0_0_18px_rgba(250,204,21,0.7)]" : "hover:scale-105"
          }`}
        >
          {fmtChip(c)}
        </button>
      ))}
    </div>
  );
}
