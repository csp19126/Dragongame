import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export const DM_UNREAD_KEY = ["/api/dm/unread"];

/** Unread private messages, checked every 20 s while signed in (one shared query for every badge) */
export function useDmUnread() {
  const { user } = useAuth();
  const q = useQuery<{ total: number }>({ queryKey: DM_UNREAD_KEY, enabled: !!user, refetchInterval: 20_000, staleTime: 10_000 });
  return user ? q.data?.total ?? 0 : 0;
}
