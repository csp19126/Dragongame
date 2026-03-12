import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/Header";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Gift, CreditCard, BarChart3, Search, Edit3, Trash2, Plus,
  Check, X, ChevronDown, ChevronUp, Shield, Wallet, Trophy, Gamepad2,
  ArrowLeft, RefreshCw, Eye, EyeOff, Crown
} from "lucide-react";
import { Link } from "wouter";

const ADMIN_USER_ID = "55109529";

function fmt(n: number) { return n?.toLocaleString() ?? "0"; }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StatCard({ icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const Icon = icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 flex items-center gap-4"
      style={{ background: "linear-gradient(135deg, rgba(45,20,102,0.6) 0%, rgba(15,6,32,0.8) 100%)", border: "1px solid rgba(251,191,36,0.15)" }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}22` }}>
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div>
        <div className="text-xs text-yellow-500/60 uppercase tracking-widest font-bold">{label}</div>
        <div className="text-2xl font-black text-white">{typeof value === "number" ? fmt(value) : value}</div>
      </div>
    </motion.div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${active
        ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 shadow-lg"
        : "text-yellow-400/60 hover:text-yellow-300 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: any; onClose: () => void; onSave: (data: any) => void }) {
  const [balance, setBalance] = useState(String(user.balance ?? 0));
  const [username, setUsername] = useState(user.username ?? "");
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, y: 30 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-6 space-y-4"
        style={{ background: "linear-gradient(135deg, #1a0a40, #0d0520)", border: "1px solid rgba(251,191,36,0.3)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-yellow-300 flex items-center gap-2">
            <Edit3 className="w-5 h-5" /> Edit User
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-xs text-yellow-500/50 font-mono bg-black/30 px-3 py-1 rounded-lg">ID: {user.id}</div>

        {[
          { label: "Username", value: username, set: setUsername, type: "text", placeholder: "username" },
          { label: "First Name", value: firstName, set: setFirstName, type: "text", placeholder: "First name" },
          { label: "Last Name", value: lastName, set: setLastName, type: "text", placeholder: "Last name" },
          { label: "Balance (VND)", value: balance, set: setBalance, type: "number", placeholder: "Balance" },
        ].map(f => (
          <div key={f.label}>
            <label className="text-xs text-yellow-500/60 font-bold uppercase tracking-widest mb-1 block">{f.label}</label>
            <input
              type={f.type}
              value={f.value}
              onChange={e => f.set(e.target.value)}
              placeholder={f.placeholder}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400/50 transition-colors"
            />
          </div>
        ))}

        <div>
          <label className="text-xs text-yellow-500/60 font-bold uppercase tracking-widest mb-1 block">New Password (leave blank to keep)</label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-yellow-400/50 transition-colors"
            />
            <button onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={() => onSave({ balance: Number(balance), username, firstName, lastName, ...(password ? { password } : {}) })}
            className="flex-1 py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 hover:from-yellow-300 hover:to-yellow-500 transition-all"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: users = [], isLoading, refetch } = useQuery<any[]>({ queryKey: ["/api/admin/dashboard/users"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/admin/dashboard/users/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/users"] }); toast({ title: "✅ User updated!" }); setEditing(null); },
    onError: () => toast({ title: "❌ Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/dashboard/users/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/users"] }); toast({ title: "🗑 User deleted" }); },
    onError: (e: any) => toast({ title: e.message || "Delete failed", variant: "destructive" }),
  });

  const filtered = users.filter(u =>
    [u.username, u.firstName, u.lastName, u.email, u.id].some(v => v?.toLowerCase?.().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-500/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users by name, username, email..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400/50 transition-colors"
          />
        </div>
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-yellow-400/60 hover:text-yellow-300 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-yellow-400/40">Loading users...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => (
            <motion.div
              key={user.id}
              layout
              className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(45,20,102,0.3)", border: user.id === ADMIN_USER_ID ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
                  style={{ background: user.id === ADMIN_USER_ID ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : "rgba(139,92,246,0.3)", color: user.id === ADMIN_USER_ID ? "#3b0764" : "#c4b5fd" }}>
                  {user.id === ADMIN_USER_ID ? <Crown className="w-5 h-5" /> : (user.username || user.firstName || "?")[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm truncate">{user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user.username || "—"}</span>
                    {user.id === ADMIN_USER_ID && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 font-black">ADMIN</span>}
                  </div>
                  <div className="text-xs text-white/40 truncate">{user.username || user.email || user.id}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-black text-yellow-300">{fmt(user.balance)}đ</div>
                  <div className="text-[10px] text-white/30">{user.totalWins} wins</div>
                </div>
                {expandedId === user.id ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
              </div>

              <AnimatePresence>
                {expandedId === user.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {[
                          { label: "User ID", value: user.id },
                          { label: "Email", value: user.email || "—" },
                          { label: "Games Played", value: fmt(user.gamesPlayed) },
                          { label: "Max Win", value: fmt(user.maxWin) + "đ" },
                          { label: "Max Streak", value: user.maxStreak },
                          { label: "Joined", value: fmtDate(user.createdAt) },
                          { label: "Last Active", value: fmtDate(user.updatedAt) },
                        ].map(f => (
                          <div key={f.label} className="bg-black/20 rounded-lg px-3 py-2">
                            <div className="text-yellow-500/50 font-bold uppercase tracking-wider text-[9px]">{f.label}</div>
                            <div className="text-white font-mono text-[11px] truncate">{f.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(user)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 font-bold text-sm hover:bg-blue-500/30 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" /> Edit
                        </button>
                        {user.id !== ADMIN_USER_ID && (
                          <button
                            onClick={() => { if (confirm(`Delete ${user.username || user.id}? This cannot be undone.`)) deleteMutation.mutate(user.id); }}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-400/30 text-red-300 font-bold text-sm hover:bg-red-500/30 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-10 text-white/30">No users found</div>
          )}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <EditUserModal
            user={editing}
            onClose={() => setEditing(null)}
            onSave={data => updateMutation.mutate({ id: editing.id, data })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function GiftCardsTab() {
  const { toast } = useToast();
  const [newCode, setNewCode] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: cards = [], isLoading, refetch } = useQuery<any[]>({ queryKey: ["/api/admin/dashboard/gift-cards"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/dashboard/gift-cards", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/gift-cards"] }); toast({ title: "🎁 Gift card created!" }); setNewCode(""); setNewAmount(""); setShowForm(false); },
    onError: (e: any) => toast({ title: e.message || "Failed to create", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/dashboard/gift-cards/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/gift-cards"] }); toast({ title: "🗑 Card deleted" }); },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const available = cards.filter(c => !c.isRedeemed);
  const redeemed = cards.filter(c => c.isRedeemed);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 font-bold">{available.length} Available</span>
          <span className="px-3 py-1 rounded-full bg-white/10 text-white/40 font-bold">{redeemed.length} Redeemed</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-yellow-400/60 hover:text-yellow-300 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950"
          >
            <Plus className="w-4 h-4" /> New Card
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(45,20,102,0.5)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <h3 className="font-black text-yellow-300 flex items-center gap-2"><Plus className="w-4 h-4" /> Create Gift Card</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-yellow-500/60 font-bold uppercase tracking-widest mb-1 block">Code</label>
                  <input
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                    placeholder="LUCKY-500K-VIP"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-yellow-400/50 uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs text-yellow-500/60 font-bold uppercase tracking-widest mb-1 block">Amount (VND)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    placeholder="500000"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400/50"
                  />
                </div>
              </div>
              {newAmount && <div className="text-xs text-yellow-400/60">= {fmt(Number(newAmount))}đ</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:bg-white/5">Cancel</button>
                <button
                  onClick={() => createMutation.mutate({ code: newCode, denomination: Number(newAmount) })}
                  disabled={!newCode || !newAmount || createMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-yellow-400 to-yellow-600 text-purple-950 disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create Card"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="text-center py-12 text-yellow-400/40">Loading gift cards...</div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <div
              key={card.id}
              className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ background: "rgba(45,20,102,0.3)", border: card.isRedeemed ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(251,191,36,0.2)", opacity: card.isRedeemed ? 0.6 : 1 }}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.isRedeemed ? "bg-white/10" : "bg-yellow-400/20"}`}>
                <Gift className={`w-4 h-4 ${card.isRedeemed ? "text-white/30" : "text-yellow-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-black text-sm text-white">{card.code}</div>
                <div className="text-xs text-white/40">{fmt(card.denomination)}đ {card.isRedeemed ? `• Redeemed ${fmtDate(card.redeemedAt)}` : "• Available"}</div>
              </div>
              <div className="flex items-center gap-2">
                {card.isRedeemed
                  ? <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/30 font-bold">Used</span>
                  : <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-300 font-bold">Active</span>
                }
                {!card.isRedeemed && (
                  <button
                    onClick={() => { if (confirm("Delete this gift card?")) deleteMutation.mutate(card.id); }}
                    className="p-1.5 rounded-lg text-red-400/50 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
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

function WithdrawalsTab() {
  const { toast } = useToast();
  const { data: withdrawals = [], isLoading, refetch } = useQuery<any[]>({ queryKey: ["/api/admin/dashboard/withdrawals"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/admin/dashboard/withdrawals/${id}`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/withdrawals"] }); toast({ title: "✅ Status updated" }); },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const statusColor: Record<string, string> = { pending: "text-yellow-300 bg-yellow-400/15", approved: "text-green-300 bg-green-500/15", rejected: "text-red-300 bg-red-500/15" };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-yellow-400/60 hover:text-yellow-300 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-yellow-400/40">Loading withdrawals...</div>
      ) : withdrawals.length === 0 ? (
        <div className="text-center py-12 text-white/30">No withdrawal requests yet</div>
      ) : (
        <div className="space-y-2">
          {withdrawals.map(w => (
            <div key={w.id} className="p-4 rounded-2xl flex items-center gap-3" style={{ background: "rgba(45,20,102,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Wallet className="w-5 h-5 text-yellow-400/50 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">{fmt(w.amount)}đ</div>
                <div className="text-xs text-white/40">{w.note || "No note"} · {fmtDate(w.createdAt)}</div>
                <div className="text-[10px] text-white/30 font-mono">User: {w.userId}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${statusColor[w.status] || "text-white/40 bg-white/10"}`}>
                  {w.status}
                </span>
                {w.status === "pending" && (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: w.id, status: "approved" })}
                      className="p-1.5 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: w.id, status: "rejected" })}
                      className="p-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsTab() {
  const { data: stats, isLoading } = useQuery<any>({ queryKey: ["/api/admin/dashboard/stats"] });

  if (isLoading) return <div className="text-center py-12 text-yellow-400/40">Loading stats...</div>;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <StatCard icon={Users} label="Total Users" value={stats.totalUsers} color="#c084fc" />
      <StatCard icon={Wallet} label="Total Balance" value={fmt(stats.totalBalance) + "đ"} color="#fbbf24" />
      <StatCard icon={Trophy} label="Total Wins" value={stats.totalWins} color="#34d399" />
      <StatCard icon={Gamepad2} label="Games Played" value={stats.totalGamesPlayed} color="#60a5fa" />
      <StatCard icon={Gift} label="Active Cards" value={stats.activeGiftCards} color="#f472b6" />
      <StatCard icon={Check} label="Cards Redeemed" value={stats.redeemedGiftCards} color="#a78bfa" />
      <StatCard icon={CreditCard} label="Pending Withdrawals" value={stats.pendingWithdrawals} color="#fb923c" />
      <StatCard icon={BarChart3} label="Total Withdrawals" value={stats.totalWithdrawals} color="#94a3b8" />
    </div>
  );
}

export default function Admin() {
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState<"stats" | "users" | "cards" | "withdrawals">("stats");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-yellow-400 animate-pulse text-xl font-black">Loading...</div>
      </div>
    );
  }

  if (!user || user.id !== ADMIN_USER_ID) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
        <Shield className="w-16 h-16 text-red-400" />
        <div className="text-2xl font-black text-white text-center">Admin Access Only</div>
        <div className="text-white/40 text-center">You don't have permission to view this page.</div>
        <Link href="/">
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-500 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Game
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Crown className="w-7 h-7 text-yellow-400" />
              <h1 className="text-2xl sm:text-3xl font-black" style={{ background: "linear-gradient(to right,#fbbf24,#f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Admin Dashboard
              </h1>
            </div>
            <p className="text-white/40 text-sm mt-1">Welcome back, The Boss 🚀</p>
          </div>
          <Link href="/">
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 font-bold text-sm hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </Link>
        </motion.div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <TabBtn active={tab === "stats"} onClick={() => setTab("stats")}><BarChart3 className="w-4 h-4 inline mr-1.5" />Stats</TabBtn>
          <TabBtn active={tab === "users"} onClick={() => setTab("users")}><Users className="w-4 h-4 inline mr-1.5" />Users</TabBtn>
          <TabBtn active={tab === "cards"} onClick={() => setTab("cards")}><Gift className="w-4 h-4 inline mr-1.5" />Gift Cards</TabBtn>
          <TabBtn active={tab === "withdrawals"} onClick={() => setTab("withdrawals")}><CreditCard className="w-4 h-4 inline mr-1.5" />Withdrawals</TabBtn>
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl p-5 sm:p-6"
          style={{ background: "linear-gradient(180deg,rgba(45,20,102,0.3) 0%,rgba(15,6,32,0.5) 100%)", border: "1px solid rgba(251,191,36,0.1)", backdropFilter: "blur(20px)" }}
        >
          {tab === "stats" && <StatsTab />}
          {tab === "users" && <UsersTab />}
          {tab === "cards" && <GiftCardsTab />}
          {tab === "withdrawals" && <WithdrawalsTab />}
        </motion.div>
      </div>
    </div>
  );
}
