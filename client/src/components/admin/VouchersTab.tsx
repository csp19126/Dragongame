import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Gift, Layers, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Voucher {
  id: number;
  code: string;
  denomination: number;
  isRedeemed: boolean;
  redeemedAt: string | null;
  redeemedByName: string | null;
  createdAt: string | null;
  batch: string | null;
  note: string | null;
}

const KEY = ["/api/admin/dashboard/gift-cards"];
const PRESETS = [50_000, 100_000, 500_000, 1_000_000, 5_000_000];
const fmt = (n: number) => n.toLocaleString("en");
const short = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1000 ? `${n / 1000}K` : String(n));
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const box = { background: "rgba(45,20,102,0.5)", border: "1px solid rgba(251,191,36,0.25)" };
const input = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400/50";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function NoteEditor({ card }: { card: Voucher }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(card.note ?? "");
  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `${KEY[0]}/${card.id}`, { note: value }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: KEY }); setEditing(false); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-yellow-200/60 hover:text-yellow-200 text-left" data-testid={`note-${card.id}`}>
        <Pencil className="w-3 h-3 shrink-0" />
        {card.note ? <span className="italic">{card.note}</span> : <span className="text-white/30">Add note (who it's for)</span>}
      </button>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="flex gap-1.5">
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} placeholder="e.g. Given to Minh, 4 Oct" className="flex-1 bg-white/10 border border-yellow-400/40 rounded-lg px-2 py-1 text-xs text-white focus:outline-none" />
      <button type="submit" className="px-2 rounded-lg bg-yellow-400 text-black" aria-label="Save note"><Check className="w-3.5 h-3.5" /></button>
    </form>
  );
}

/** Admin: every voucher code, what it's worth, who has it and who used it */
export function VouchersTab() {
  const { toast } = useToast();
  const { data: cards = [], isLoading, refetch } = useQuery<Voucher[]>({ queryKey: KEY });
  const [status, setStatus] = useState<"available" | "used" | "all">("available");
  const [batch, setBatch] = useState("all");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState<"none" | "batch" | "single">("none");
  const [count, setCount] = useState("10");
  const [amount, setAmount] = useState("100000");
  const [batchName, setBatchName] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<number | "all" | null>(null);

  const batches = useMemo(() => [...new Set(cards.map((c) => c.batch ?? "Older codes"))], [cards]);
  const shown = cards.filter((c) =>
    (status === "all" || (status === "used") === c.isRedeemed) &&
    (batch === "all" || (c.batch ?? "Older codes") === batch) &&
    (!q || `${c.code} ${c.note ?? ""} ${c.redeemedByName ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const available = cards.filter((c) => !c.isRedeemed);
  const availableValue = available.reduce((a, c) => a + c.denomination, 0);

  const done = (title: string) => { queryClient.invalidateQueries({ queryKey: KEY }); toast({ title }); setPanel("none"); };
  const makeBatch = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${KEY[0]}/batch`, { count: Number(count), denomination: Number(amount), batch: batchName || undefined })).json() as Promise<Voucher[]>,
    onSuccess: (made) => { done(`🎁 ${made.length} new codes made`); setBatch(made[0]?.batch ?? "all"); setStatus("available"); setBatchName(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const makeOne = useMutation({
    mutationFn: () => apiRequest("POST", KEY[0], { code, denomination: Number(amount), note: note || undefined }),
    onSuccess: () => { done("🎁 Code created"); setCode(""); setNote(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${KEY[0]}/${id}`),
    onSuccess: () => done("🗑 Code deleted"),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const copyOne = async (c: Voucher) => {
    if (await copy(c.code)) { setCopied(c.id); setTimeout(() => setCopied(null), 1500); }
    else toast({ title: c.code, description: "Copy this code by hand" });
  };
  const copyAll = async () => {
    const list = shown.filter((c) => !c.isRedeemed).map((c) => `${c.code}  (${fmt(c.denomination)} coins)`).join("\n");
    if (list && (await copy(list))) { setCopied("all"); setTimeout(() => setCopied(null), 1500); }
  };

  return (
    <div className="space-y-4" data-testid="vouchers-tab">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 text-center" style={box}><div className="text-2xl font-black text-green-300">{available.length}</div><div className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Available</div></div>
        <div className="rounded-2xl p-3 text-center" style={box}><div className="text-2xl font-black text-white/60">{cards.length - available.length}</div><div className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Used</div></div>
        <div className="rounded-2xl p-3 text-center" style={box}><div className="text-xl font-black text-yellow-300">{short(availableValue)}</div><div className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Coins unclaimed</div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPanel(panel === "batch" ? "none" : "batch")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950" data-testid="button-new-batch">
          <Layers className="w-4 h-4" /> Make a batch
        </button>
        <button onClick={() => setPanel(panel === "single" ? "none" : "single")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-yellow-400/40 text-yellow-300">
          <Plus className="w-4 h-4" /> One custom code
        </button>
        <button onClick={() => refetch()} className="ml-auto p-2.5 rounded-xl bg-white/5 border border-white/10 text-yellow-400/60 hover:text-yellow-300" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {panel !== "none" && (
        <div className="rounded-2xl p-4 space-y-3" style={box}>
          <div>
            <label className="text-xs text-yellow-500/70 font-bold uppercase tracking-widest mb-1 block">Coins per code</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setAmount(String(p))} className={`px-3 py-1.5 rounded-lg text-xs font-black ${Number(amount) === p ? "bg-yellow-400 text-black" : "bg-white/5 text-white/70"}`}>{short(p)}</button>
              ))}
            </div>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
          </div>
          {panel === "batch" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-yellow-500/70 font-bold uppercase tracking-widest mb-1 block">How many (1-200)</label>
                  <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} className={input} data-testid="input-batch-count" />
                </div>
                <div>
                  <label className="text-xs text-yellow-500/70 font-bold uppercase tracking-widest mb-1 block">Batch name</label>
                  <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Tết 2027" maxLength={60} className={input} />
                </div>
              </div>
              <p className="text-xs text-white/50">Codes look like <span className="font-mono text-yellow-200">VN888-K7QX-M2PA</span>: random and impossible to guess. Each one works once.</p>
              <button onClick={() => makeBatch.mutate()} disabled={makeBatch.isPending || !Number(count) || !Number(amount)} className="w-full py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 disabled:opacity-50" data-testid="button-make-batch">
                {makeBatch.isPending ? "Making…" : `Make ${count || 0} codes × ${fmt(Number(amount) || 0)} coins`}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-yellow-500/70 font-bold uppercase tracking-widest mb-1 block">Code</label>
                  <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TET-2027" className={`${input} font-mono uppercase`} />
                </div>
                <div>
                  <label className="text-xs text-yellow-500/70 font-bold uppercase tracking-widest mb-1 block">Note</label>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who it's for" className={input} />
                </div>
              </div>
              <button onClick={() => makeOne.mutate()} disabled={makeOne.isPending || code.length < 3 || !Number(amount)} className="w-full py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 disabled:opacity-50">
                {makeOne.isPending ? "Creating…" : "Create code"}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-xl overflow-hidden border border-white/10">
          {(["available", "used", "all"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-2 text-xs font-black capitalize ${status === s ? "bg-yellow-400 text-black" : "bg-white/5 text-white/60"}`} data-testid={`filter-${s}`}>{s}</button>
          ))}
        </div>
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white" data-testid="select-batch">
          <option value="all" className="bg-[#1a0b35]">All batches</option>
          {batches.map((b) => <option key={b} value={b} className="bg-[#1a0b35]">{b}</option>)}
        </select>
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, note, player" className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white focus:outline-none" />
        </div>
        <button onClick={copyAll} disabled={!shown.some((c) => !c.isRedeemed)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border border-yellow-400/40 text-yellow-300 disabled:opacity-30" data-testid="button-copy-all">
          {copied === "all" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy {shown.filter((c) => !c.isRedeemed).length} shown
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-yellow-400/40">Loading codes…</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-white/40">No codes here.</div>
      ) : (
        <div className="space-y-2" data-testid="voucher-list">
          {shown.map((c) => (
            <div key={c.id} className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: "rgba(45,20,102,0.3)", border: c.isRedeemed ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(251,191,36,0.22)", opacity: c.isRedeemed ? 0.65 : 1 }}>
              <div className={`mt-0.5 w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 ${c.isRedeemed ? "bg-white/10" : "bg-yellow-400/20"}`}>
                <Gift className={`w-4 h-4 ${c.isRedeemed ? "text-white/30" : "text-yellow-400"}`} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-[15px] text-white tracking-wide" data-testid="voucher-code">{c.code}</span>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-300">{fmt(c.denomination)}</span>
                </div>
                <div className="text-[11px] text-white/40">
                  {c.batch ?? "Older codes"} · made {fmtDate(c.createdAt)}
                  {c.isRedeemed && <> · <span className="text-white/70">used by <b>{c.redeemedByName ?? "a deleted account"}</b> on {fmtDate(c.redeemedAt)}</span></>}
                </div>
                <NoteEditor card={c} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!c.isRedeemed && (
                  <button onClick={() => copyOne(c)} className="p-2 rounded-lg text-yellow-300/70 hover:text-yellow-200 hover:bg-white/5" aria-label="Copy code" data-testid={`copy-${c.id}`}>
                    {copied === c.id ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
                {!c.isRedeemed && (
                  <button onClick={() => { if (confirm(`Delete ${c.code}?`)) del.mutate(c.id); }} className="p-2 rounded-lg text-red-400/50 hover:text-red-300 hover:bg-red-500/10" aria-label="Delete code">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
