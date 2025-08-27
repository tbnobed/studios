import { useQuery } from "@tanstack/react-query";
import { UserWithPermissions } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<UserWithPermissions>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
  };
}
