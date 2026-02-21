import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InsertUser, type User } from "@shared/schema"; // Inferred types
// Note: We use the API paths from routes_manifest provided in prompt context
// but the types need to be inferred since we can't import directly from routes_manifest as code.
// We will manually type the API requests based on the prompt's schema description for now.

type LoginRequest = InsertUser;
type RegisterRequest = InsertUser;

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) throw new Error("Login failed");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/me"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: RegisterRequest) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) throw new Error("Registration failed");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/me"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/logout", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/me"], null);
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
  };
}
