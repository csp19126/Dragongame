import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLang } from "@/lib/lang-context";

/** Lets a logged-in player permanently delete their account and all its data */
export function DeleteAccountCard() {
  const { t } = useLang();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [sure, setSure] = useState(false);

  const del = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/user/delete", { password })).json(),
    onSuccess: () => {
      queryClient.clear();
      toast({ title: t.accountDeleted });
      window.location.assign("/");
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <Card className="bg-red-950/40 border-red-500/30 p-6" data-testid="card-delete-account">
      <h3 className="text-sm font-black uppercase tracking-widest text-red-300 mb-2 flex items-center gap-2"><Trash2 className="w-4 h-4" />{t.deleteAccount}</h3>
      <p className="text-sm text-yellow-100/60 mb-4">{t.deleteAccountDesc}</p>
      <form onSubmit={(e) => { e.preventDefault(); del.mutate(); }} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="delete-password" className="text-yellow-100/70">{t.password}</Label>
          <Input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="bg-purple-900/40 border-red-500/30 text-yellow-100" data-testid="input-delete-password" />
        </div>
        <label className="flex items-start gap-2 text-sm text-yellow-100/80 cursor-pointer">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1 accent-red-500" data-testid="checkbox-delete-sure" />
          {t.deleteConfirm}
        </label>
        <button type="submit" disabled={!password || !sure || del.isPending}
          className="w-full rounded-md py-2.5 font-black bg-red-600 hover:bg-red-500 text-white disabled:opacity-40" data-testid="button-delete-account">
          {del.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.deleteAccount}
        </button>
      </form>
    </Card>
  );
}
