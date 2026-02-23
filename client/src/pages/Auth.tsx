import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/lang-context";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { SiReplit } from "react-icons/si";

export default function Auth() {
  const { login, register, user } = useAuth();
  const { t, language } = useLang();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("login");

  // Redirect if already logged in
  if (user) {
    setLocation("/");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ username, password });
      toast({ title: "Welcome back!", className: "bg-primary text-yellow-100 border-yellow-500/20 font-bold" });
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
      toast({ title: "Account created!", className: "bg-primary text-yellow-100 border-yellow-500/20 font-bold" });
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-secondary/5 blur-3xl" />

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-12 relative">
          <motion.div
            animate={{ 
              scale: [1, 1.05, 1],
              rotate: [0, 1, -1, 0]
            }}
            transition={{ duration: 5, repeat: Infinity }}
          >
            <h1 className="font-display text-7xl gold-gradient-text drop-shadow-[0_10px_20_rgba(0,0,0,0.5)] mb-2">VnSlot</h1>
          </motion.div>
          <p className="text-primary/60 font-black uppercase tracking-[0.4em] text-xs">Gateway to Fortune</p>
          <div className="absolute -top-8 -left-8 text-6xl opacity-10 rotate-12">🧧</div>
          <div className="absolute -bottom-8 -right-8 text-6xl opacity-10 -rotate-12">✨</div>
        </div>

        <Card className="border-0 shadow-2xl backdrop-blur-2xl bg-purple-950/40 rounded-[2rem] overflow-hidden">
          <CardHeader className="pt-10">
            <CardTitle className="text-center text-3xl font-black gold-gradient-text uppercase tracking-tighter">
              {activeTab === "login" ? t.login : t.register}
            </CardTitle>
            <CardDescription className="text-center text-yellow-100/50 font-medium">Step into the Realm of Fortune</CardDescription>
          </CardHeader>
          <CardContent className="pb-10 px-8">
            <div className="flex flex-col gap-4 mb-6">
              <Button 
                onClick={() => window.location.href = "/api/login"}
                className="w-full h-14 text-lg font-bold bg-orange-600 hover:bg-orange-700 text-white border-2 border-orange-400 shadow-[0_0_15px_rgba(234,88,12,0.4)] transition-all group rounded-2xl"
              >
                <SiReplit className="mr-3 h-6 w-6 group-hover:scale-110 transition-transform" />
                {language === "en" ? "Login with Replit" : "Đăng nhập với Replit"}
              </Button>
              
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-yellow-500/20" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-[#0a0510] px-3 text-yellow-500/40 font-black tracking-[0.2em]">
                    {language === "en" ? "OR USE GUEST" : "HOẶC DÙNG KHÁCH"}
                  </span>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-10 bg-purple-900/20 p-1 rounded-2xl h-14">
                <TabsTrigger value="login" className="rounded-xl font-bold data-[state=active]:bg-primary data-[state=active]:text-yellow-100 transition-all">{t.login}</TabsTrigger>
                <TabsTrigger value="register" className="rounded-xl font-bold data-[state=active]:bg-primary data-[state=active]:text-yellow-100 transition-all">{t.register}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 ml-2">{t.username}</label>
                    <Input 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)}
                      required 
                      className="rounded-2xl h-14 bg-purple-900/20 border-yellow-500/10 text-yellow-100 placeholder:text-yellow-100/20 focus:border-primary/50 focus:ring-primary/20 transition-all text-lg px-6"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 ml-2">{t.password}</label>
                    <Input 
                      type="password"
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                      className="rounded-2xl h-14 bg-purple-900/20 border-yellow-500/10 text-yellow-100 placeholder:text-yellow-100/20 focus:border-primary/50 focus:ring-primary/20 transition-all text-lg px-6"
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-2xl h-16 font-black text-xl bg-gradient-to-r from-primary to-purple-600 shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin w-8 h-8" /> : t.login}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 ml-2">{t.username}</label>
                    <Input 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)}
                      required 
                      className="rounded-2xl h-14 bg-purple-900/20 border-yellow-500/10 text-yellow-100 placeholder:text-yellow-100/20 focus:border-primary/50 focus:ring-primary/20 transition-all text-lg px-6"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest text-yellow-500/70 ml-2">{t.password}</label>
                    <Input 
                      type="password"
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                      className="rounded-2xl h-14 bg-purple-900/20 border-yellow-500/10 text-yellow-100 placeholder:text-yellow-100/20 focus:border-primary/50 focus:ring-primary/20 transition-all text-lg px-6"
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-2xl h-16 font-black text-xl bg-gradient-to-r from-primary to-purple-600 shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin w-8 h-8" /> : t.register}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
