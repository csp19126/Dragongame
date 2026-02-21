import { useLeaderboard } from "@/hooks/use-game";
import { Header } from "@/components/Header";
import { useLang } from "@/lib/lang-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Medal } from "lucide-react";

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useLeaderboard();
  const { t } = useLang();

  const getRankIcon = (index: number) => {
    if (index === 0) return <Medal className="w-6 h-6 text-yellow-500" />; // Gold
    if (index === 1) return <Medal className="w-6 h-6 text-gray-400" />;   // Silver
    if (index === 2) return <Medal className="w-6 h-6 text-amber-700" />;  // Bronze
    return <span className="font-mono font-bold text-muted-foreground">#{index + 1}</span>;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-0 shadow-xl bg-white/90 backdrop-blur">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-display text-primary">{t.leaderboard}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px] text-center">Rank</TableHead>
                    <TableHead>{t.username}</TableHead>
                    <TableHead className="text-right">{t.balance}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard?.map((entry, index) => (
                    <TableRow key={entry.username} className="hover:bg-primary/5">
                      <TableCell className="text-center font-medium">
                        <div className="flex justify-center">{getRankIcon(index)}</div>
                      </TableCell>
                      <TableCell className="font-semibold text-foreground/80">{entry.username}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary">
                        {entry.balance.toLocaleString()} 🪙
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaderboard?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No players found yet. Be the first!
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
