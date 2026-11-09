import { api } from "@/convex/_generated/api";
import { kunciPenyimpananDraft } from "@/lib/draftKyc";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback } from "react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut: signOutAsli } = useAuthActions();

  // Draft KYC memuat NIK/rekening. Jangan biarkan ia menetap di perangkat
  // setelah pemiliknya keluar; TTL 30 hari di lib/draftKyc.ts adalah jaring
  // pengaman tambahan, bukan pengganti pembersihan saat logout.
  const signOut = useCallback(async () => {
    const userId = user?._id;
    await signOutAsli();
    if (userId === undefined || typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(kunciPenyimpananDraft(userId));
    } catch {
      // localStorage bisa diblokir (mode privat); logout tetap berhasil.
    }
  }, [signOutAsli, user?._id]);

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    isAnonymous: user?.isAnonymous === true,
    user,
    signIn,
    signOut,
  };
}
