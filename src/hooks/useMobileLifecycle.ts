import * as React from "react";

/**
 * useMobileLifecycle — tahu kapan halaman kembali dari latar (WhatsApp,
 * galeri, kamera, file picker, swipe home, lock screen) atau dibuat ulang
 * (pageshow persistence).
 *
 * Aturan keras:
 *  - TIDAK memicu reload / router.refresh / replace / push secara otomatis.
 *  - TIDAK membuat OTP session / form / upload baru hanya karena halaman
 *    menjadi visible lagi.
 *  - Hanya mengekspos sinyal "halaman kembali". Persistensi isian TIDAK
 *    dilakukan di sini: pemanggil yang tahu apa yang boleh disimpan (lihat
 *    `lib/drafPengaduan.ts`), dan `markRestored()` hanya menandai bahwa
 *    pemanggil sudah selesai memulihkan.
 */

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof window.addEventListener === "function"
  );
}

interface MobileLifecycleState {
  /** true bila halaman kembali dari hidden/blur setelah sebelumnya tidak aktif. */
  isPageRestored: boolean;
  /** true bila halaman aktif (visible + focus). */
  isActive: boolean;
  /** true bila halaman sedang invisible (tab lain aktif atau browser background). */
  isHidden: boolean;
}

interface UseMobileLifecycleReturn {
  state: MobileLifecycleState;
  /** Panggil untuk menandai bahwa consumer sudah meresume state (mis. draft). */
  markRestored: () => void;
}

/**
 * Log audit teknis tanpa data sensitif.
 *
 * Bisa dicatat: OTP_SESSION_RESUMED, KYC_DRAFT_RESTORED,
 * DOCUMENT_UPLOAD_RESUMED, DOCUMENT_UPLOAD_FAILED, KYC_DRAFT_SAVED.
 *
 * Tidak boleh mencatat OTP / NIK / KTP / selfie / slip / token.
 */
function auditLog(event: string, meta?: Record<string, string | number | boolean | undefined>) {
  if (typeof console === "undefined") return;
  try {
    console.info(`[mobile-lifecycle] ${event}`, meta ?? "");
  } catch {
    // jangan bunuh app hanya karena console bermasalah
  }
}

export function useMobileLifecycle(): UseMobileLifecycleReturn {
  const [state, setState] = React.useState<MobileLifecycleState>(() => {
    if (!isSupported()) {
      return { isPageRestored: false, isActive: true, isHidden: false };
    }
    return { isPageRestored: false, isActive: true, isHidden: false };
  });

  const restoredRef = React.useRef(false);

  const markRestored = React.useCallback(() => {
    restoredRef.current = true;
    auditLog("KYC_DRAFT_RESTORED", { restored: true });
  }, []);



  React.useEffect(() => {
    if (!isSupported()) return;

    const setActive = (active: boolean, hidden: boolean) => {
      setState((prev) => {
        const next = { isPageRestored: prev.isPageRestored, isActive: active, isHidden: hidden };
        // Sinyal "kembali" hanya satu kali per periode tidak-aktif.
        if (!prev.isActive && active) {
          next.isPageRestored = true;
        }
        return next;
      });
    };

    const onVisibilityChange = () => {
      // visibilityState 'hidden' -> tab tidak terlihat (bisa ke tab lain,
      // browser background, lock screen). 'visible' -> kembali.
      setActive(document.visibilityState === "visible", document.visibilityState === "hidden");
    };
    const onPageShow = (evt: Event) => {
      // pageshow dengan persisted=true: tab di-restore dari frozen/back-forward cache.
      if ("persisted" in evt && (evt as PageTransitionEvent).persisted) {
        setActive(true, false);
      }
    };
    const onPageHide = () => {
      setActive(false, true);
    };
    const onFocus = () => setActive(true, false);
    const onBlur = () => setActive(false, true);

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pageshow", onPageShow, false);
    document.addEventListener("pagehide", onPageHide, false);
    window.addEventListener("focus", onFocus, false);
    window.addEventListener("blur", onBlur, false);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("pageshow", onPageShow, false);
      document.removeEventListener("pagehide", onPageHide, false);
      window.removeEventListener("focus", onFocus, false);
      window.removeEventListener("blur", onBlur, false);
    };
  }, []);

  return {
    state,
    markRestored,
  };
}
