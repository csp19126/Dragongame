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

export default function Auth() {
  const { login, register, user } = useAuth();
  const { t } = useLang();
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
      toast({ title: "Welcome back!", className: "bg-green-600 text-white" });
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
      toast({ title: "Account created!", className: "bg-green-600 text-white" });
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
        <div className="text-center mb-8">
          <h1 className="font-display text-5xl text-primary drop-shadow-sm mb-2">VnSlot</h1>
          <p className="text-muted-foreground">Gateway to Fortune</p>
        </div>

        <Card className="border-2 border-primary/10 shadow-xl backdrop-blur-sm bg-white/90">
          <CardHeader>
            <CardTitle className="text-center text-2xl font-bold">{activeTab === "login" ? t.login : t.register}</CardTitle>
            <CardDescription className="text-center">Enter your details to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">{t.login}</TabsTrigger>
                <TabsTrigger value="register">{t.register}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t.username}</label>
                    <Input 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)}
                      required 
                      className="rounded-xl border-gray-200 focus:border-primary focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t.password}</label>
                    <Input 
                      type="password"
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                      className="rounded-xl border-gray-200 focus:border-primary focus:ring-primary/20"
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-xl py-6 font-bold text-lg" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : t.login}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t.username}</label>
                    <Input 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)}
                      required 
                      className="rounded-xl border-gray-200 focus:border-primary focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t.password}</label>
                    <Input 
                      type="password"
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                      className="rounded-xl border-gray-200 focus:border-primary focus:ring-primary/20"
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-xl py-6 font-bold text-lg" disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin" /> : t.register}
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
