import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { SiReplit } from "react-icons/si";

export default function Auth() {
  const { login, register, user } = useAuth();
  const { language } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("login");

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ username, password });
      toast({ title: "Welcome back!", className: "bg-yellow-500 text-purple-900 font-bold" });
    } catch (error) {
      toast({ 
        title: "Login failed", 
        description: (error as Error).message, 
        variant: "destructive" 
      });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register.mutateAsync({ username, password });
      toast({ title: "Account created!", className: "bg-yellow-500 text-purple-900 font-bold" });
    } catch (error) {
      toast({ 
        title: "Registration failed", 
        description: (error as Error).message, 
        variant: "destructive" 
      });
    }
  };

  const isLoading = login.isPending || register.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] relative overflow-hidden">
      {/* Animated globs */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 6, repeat: Infinity }}
        className="absolute top-20 left-20 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.15, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, delay: 1 }}
        className="absolute bottom-20 right-20 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none"
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.h1 
            animate={{ 
              textShadow: ["0 0 20px rgba(234,179,8,0.2)", "0 0 40px rgba(234,179,8,0.4)", "0 0 20px rgba(234,179,8,0.2)"]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-6xl font-display font-black bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent mb-2"
          >
            VnSlot
          </motion.h1>
          <p className="text-yellow-500/70 font-bold uppercase tracking-[0.2em] text-sm">Step Into Fortune</p>
        </div>

        {/* Main Card */}
        <Card className="border-2 border-yellow-500/30 bg-gradient-to-b from-purple-950/80 to-purple-900/60 backdrop-blur-2xl rounded-[3rem] overflow-hidden shadow-[0_0_60px_rgba(139,92,246,0.3)]">
          <CardHeader className="pt-8 pb-6">
            <CardTitle className="text-center text-2xl font-black uppercase tracking-wider bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              {activeTab === "login" ? "RETURN TO FORTUNE" : "JOIN THE DRAGON"}
            </CardTitle>
          </CardHeader>

          <CardContent className="pb-8 px-8 space-y-6">
            {/* Replit Auth Button */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button 
                onClick={() => {
                  window.location.href = "/api/login";
                }}
                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white border-2 border-orange-400 rounded-2xl shadow-[0_0_20px_rgba(234,88,12,0.4)] transition-all group uppercase tracking-widest"
              >
                <SiReplit className="mr-3 h-6 w-6 group-hover:scale-110 transition-transform" />
                {language === "en" ? "Sign in with Replit" : "Đăng nhập với Replit"}
              </Button>
            </motion.div>

            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-yellow-500/20" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gradient-to-b from-[#0a0515] via-[#1a0a35] to-[#0a0515] px-3 text-yellow-500/50 font-black tracking-[0.15em]">
                  {language === "en" ? "OR GUEST ACCESS" : "HOẶC KHÁCH"}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-purple-900/30 p-1 rounded-2xl">
              {["login", "register"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 rounded-xl font-black uppercase text-sm tracking-wider transition-all duration-300 ${
                    activeTab === tab
                      ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-900 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                      : "text-yellow-400/60 hover:text-yellow-400"
                  }`}
                >
                  {tab === "login" ? "Login" : "Register"}
                </button>
              ))}
            </div>

            {/* Forms */}
            <div className="space-y-4">
              {activeTab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 block mb-2">Username</label>
                    <Input 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="rounded-2xl h-12 bg-purple-900/40 border-yellow-500/20 text-yellow-100 placeholder:text-yellow-100/30 focus:border-yellow-500/50 focus:ring-yellow-500/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 block mb-2">Password</label>
                    <Input 
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="rounded-2xl h-12 bg-purple-900/40 border-yellow-500/20 text-yellow-100 placeholder:text-yellow-100/30 focus:border-yellow-500/50 focus:ring-yellow-500/20"
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 font-black text-lg bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-900 rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:shadow-[0_0_40px_rgba(234,179,8,0.5)]" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : "SPIN"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 block mb-2">Username</label>
                    <Input 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="rounded-2xl h-12 bg-purple-900/40 border-yellow-500/20 text-yellow-100 placeholder:text-yellow-100/30 focus:border-yellow-500/50 focus:ring-yellow-500/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 block mb-2">Password</label>
                    <Input 
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="rounded-2xl h-12 bg-purple-900/40 border-yellow-500/20 text-yellow-100 placeholder:text-yellow-100/30 focus:border-yellow-500/50 focus:ring-yellow-500/20"
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 font-black text-lg bg-gradient-to-r from-yellow-500 to-orange-500 text-purple-900 rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:shadow-[0_0_40px_rgba(234,179,8,0.5)]" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : "JOIN"}
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer Text */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-yellow-500/40 text-xs uppercase tracking-widest font-black mt-8"
        >
          🐉 Enter the realm of the Dragon 🐉
        </motion.p>
      </motion.div>
    </div>
  );
}
