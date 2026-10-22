import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSocial } from "@/hooks/use-social";

export const DM_UNREAD_KEY = ["/api/dm/unread"];

/** Unread private messages (one shared query for every badge): pushed by the social socket, polled when it's down */
export function useDmUnread() {
  const { user } = useAuth();
  const { connected } = useSocial();
  const q = useQuery<{ total: number }>({ queryKey: DM_UNREAD_KEY, enabled: !!user, refetchInterval: connected ? 120_000 : 20_000, staleTime: 10_000 });
  return user ? q.data?.total ?? 0 : 0;
}
