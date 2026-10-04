import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, UseMutationResult } from "@tanstack/react-query";
import type { PublicUser, Credentials } from "@shared/schema";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";

type AuthContextType = {
  user: PublicUser | null;
  isLoading: boolean;
  login: UseMutationResult<PublicUser, Error, Credentials>;
  logout: UseMutationResult<void, Error, void>;
  register: UseMutationResult<PublicUser, Error, Credentials & { ref?: string }>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export const ME_KEY = ["/api/me"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const onLoggedIn = (u: PublicUser) => {
    queryClient.clear();
    queryClient.setQueryData(ME_KEY, u);
  };

  const login = useMutation({
    mutationFn: async (data: Credentials) => (await apiRequest("POST", "/api/login", data)).json(),
    onSuccess: onLoggedIn,
  });

  const register = useMutation({
    mutationFn: async (data: Credentials & { ref?: string }) => (await apiRequest("POST", "/api/register", data)).json(),
    onSuccess: onLoggedIn,
  });

  const logout = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    },
  });

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
