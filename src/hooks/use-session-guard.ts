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
  // Diisi ulang saat efek idle dipasang — hindari `Date.now()` di render.
  const lastActivity = useRef(0);
  const [sessionId] = useState(() => getSessionId());
  // Identitas sesi saat ini; null saat belum login / user belum termuat.
  const sessionKey = isAuthenticated && user ? `${user._id}:${sessionId}` : null;
  // Sesi dianggap siap setelah registrasi untuk `sessionKey` berhasil — nilai
  // turunan ini menggantikan reset state di dalam efek.
  const [registeredKey, setRegisteredKey] = useState<string | null>(null);
  // Saat sesi berakhir, buang catatan registrasi (pola "adjusting state during
  // render") agar login berikutnya — yang memakai sessionId localStorage sama —
  // menunggu registrasi ulang sebelum heartbeat aktif.
  if (sessionKey === null && registeredKey !== null) {
    setRegisteredKey(null);
  }
  const sessionReady = sessionKey !== null && registeredKey === sessionKey;

  // Register this browser session before checking the admin single-session gate.
  useEffect(() => {
    if (sessionKey === null) return;

    let cancelled = false;
    void (async () => {
      try {
        const ip = await getClientIp();
        await registerSession({
          sessionId,
          perangkat: deviceLabelFromUa(getUserAgent()),
          ip,
        });
        if (!cancelled) setRegisteredKey(sessionKey);
      } catch (error) {
        console.error("Gagal mendaftarkan sesi:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionKey, registerSession, sessionId]);

  // --- 1. Idle auto-logout -------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    lastActivity.current = Date.now();
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
