import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  deviceLabelFromUa,
  getClientIp,
  getSessionId,
  getUserAgent,
} from "@/lib/session";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router";
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
  const { isAuthenticated, signOut, user } = useAuth();
  const navigate = useNavigate();
  const registerSession = useMutation(api.security.ensureSessionPublic);
  const lastActivity = useRef(Date.now());
  const [sessionId] = useState(() => getSessionId());
  const [sessionReady, setSessionReady] = useState(false);

  // Register this browser session before checking the admin single-session gate.
  useEffect(() => {
    if (!isAuthenticated || user === undefined || user === null) {
      setSessionReady(false);
      return;
    }

    let cancelled = false;
    setSessionReady(false);
    void (async () => {
      try {
        const ip = await getClientIp();
        await registerSession({
          sessionId,
          perangkat: deviceLabelFromUa(getUserAgent()),
          ip,
        });
        if (!cancelled) setSessionReady(true);
      } catch (error) {
        console.error("Gagal mendaftarkan sesi:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, registerSession, sessionId, user?._id]);

  // --- 1. Idle auto-logout -------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    const keluarDanArahkan = () => {
      void signOut()
        .then(() => navigate("/auth?returnTo=/", { replace: true }))
        .catch((error: unknown) => console.error("Gagal mengakhiri sesi:", error));
    };
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });

    const tick = window.setInterval(() => {
      if (Date.now() - lastActivity.current > timeoutMenit * 60_000) {
        keluarDanArahkan();
      }
    }, 10_000);
    return () => {
      window.clearInterval(tick);
      for (const e of events) window.removeEventListener(e, onActivity);
    };
  }, [isAuthenticated, navigate, signOut, timeoutMenit]);

  // --- 2. Single Active Session (heartbeat reaktif) ------------------------
  const heartbeat = useQuery(
    api.security.sessionHeartbeat,
    isAuthenticated && sessionReady ? { sessionId } : "skip",
  );
  useEffect(() => {
    if (isAuthenticated && sessionReady && heartbeat?.valid === false) {
      void signOut()
        .then(() => navigate("/auth?returnTo=/", { replace: true }))
        .catch((error: unknown) => console.error("Gagal mengakhiri sesi:", error));
    }
  }, [isAuthenticated, sessionReady, heartbeat, navigate, signOut]);
}
