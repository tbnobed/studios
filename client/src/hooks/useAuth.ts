import { useQuery } from "@tanstack/react-query";
import { UserWithPermissions } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<UserWithPermissions>({
    queryKey: ["/api/auth/user"],
    retry: false,
    // When logged out this query is in an *error* state (401). By default React
    // Query retries an errored query every time a new component observes it
    // (retryOnMount), and also refetches it (refetchOnMount). Public pages that
    // also call useAuth() — e.g. the TV pairing screens, which render before the
    // app's auth gate — would otherwise re-trigger that fetch on mount, flip the
    // app's global loading gate, unmount themselves, and loop forever. Disabling
    // both breaks the loop. Login/logout still refresh this explicitly via
    // queryClient.invalidateQueries(["/api/auth/user"]).
    refetchOnMount: false,
    retryOnMount: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}
