"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useAuth({ required = false, redirectTo = "/login" } = {}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const loading = status === "loading";
  const authenticated = status === "authenticated";
  const error = session?.error;

  useEffect(() => {
    // If authentication is required and the user is not authenticated
    if (required && !loading && !authenticated) {
      router.push(redirectTo);
    }

    // If there's a token error (e.g., refresh failed), sign out
    if (error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: redirectTo });
    }
  }, [required, loading, authenticated, error, router, redirectTo]);

  return {
    session,
    loading,
    authenticated,
  };
} 