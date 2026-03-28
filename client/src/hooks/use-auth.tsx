import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser, InsertUser } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  login: UseMutationResult<SelectUser, Error, InsertUser>;
  logout: UseMutationResult<void, Error, void>;
  register: UseMutationResult<SelectUser, Error, InsertUser>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const [stateRes, profileRes] = await Promise.all([
          fetch("/api/game/state"),
          fetch("/api/user/profile"),
        ]);
        if (stateRes.ok) {
          const gameState = await stateRes.json();
          let profileData: any = {};
          if (profileRes.ok) {
            profileData = await profileRes.json();
          }
          return {
            id: profileData.id || "replit-user",
            username: profileData.username || "replit-user",
            firstName: profileData.firstName || null,
            lastName: profileData.lastName || null,
            email: profileData.email || null,
            password: "",
            balance: gameState.balance,
            totalWins: profileData.totalWins || 0,
            maxWin: profileData.maxWin || 0,
            streak: profileData.streak || 0,
            maxStreak: profileData.maxStreak || 0,
            gamesPlayed: profileData.gamesPlayed || 0,
          } as SelectUser;
        }
        return null;
      } catch (e) {
        return null;
      }
    },
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const res = await apiRequest("POST", "/api/login", data);
      return (await res.json()) as SelectUser;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", data);
      return (await res.json()) as SelectUser;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/user"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/logout", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        login: loginMutation as any,
        logout: logoutMutation,
        register: registerMutation as any,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
