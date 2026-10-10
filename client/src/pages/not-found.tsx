import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang-context";

export default function NotFound() {
  const { tr } = useLang();
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 p-6 text-center bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515]">
      <div className="text-7xl">🐉</div>
      <h1 className="text-4xl font-display gold-gradient-text">404</h1>
      <p className="text-yellow-100/60">{tr("Rồng đã nuốt mất trang này.", "The dragon ate this page.", "這一頁被神龍吃掉了。")}</p>
      <Link href="/">
        <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-950 font-black">
          {tr("Về trang chủ", "Back to the game", "返回遊戲")}
        </Button>
      </Link>
    </div>
  );
}
