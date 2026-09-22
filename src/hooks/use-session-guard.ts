import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { getSessionId } from "@/lib/session";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

/**
 * useSessionGuard — proteksi sesi sisi klien:
 *
 * 1. Idle auto-logout: tanpa interaksi (klik/keyboard/scroll) selama
 *    `timeoutMenit` pengguna otomatis keluar (default 15 menit).
 * 2. Single Active Session: heartbeat reaktif `api.security.sessionHeartbeat`
 *    membandingkan sessionId perangkat ini dengan sesi terdaftar di server.
 *    Bila sesi sudah digantikan perangkat lain (atau admin 2FA belum lolos
 *    TOTP gate), logout dipaksa otomatis.
 *
 * Hook ini dipasang sekali di main.tsx — aman untuk semua halaman.
 */
export function useSessionGuard(timeoutMenit = 15) {
  const { isAuthenticated, signOut } = useAuth();
  const lastActivity = useRef(Date.now());
  const [sessionId] = useState(() => getSessionId());

  // --- 1. Idle auto-logout -------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });

    const tick = window.setInterval(() => {
      if (Date.now() - lastActivity.current > timeoutMenit * 60_000) {
        void signOut();
        window.location.href = "/auth?returnTo=/";
      }
    }, 10_000);
    return () => {
      window.clearInterval(tick);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [isAuthenticated, signOut, timeoutMenit]);

  // --- 2. Single Active Session (heartbeat reaktif) ------------------------
  const heartbeat = useQuery(
    api.security.sessionHeartbeat,
    isAuthenticated ? { sessionId } : "skip",
  );
  useEffect(() => {
    if (isAuthenticated && heartbeat !== undefined && heartbeat.valid === false) {
      void signOut();
      window.location.href = "/auth?returnTo=/";
    }
  }, [isAuthenticated, heartbeat, signOut]);
}
