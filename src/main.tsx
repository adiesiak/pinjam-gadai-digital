import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { BilahSinkron } from "@/components/BilahSinkron";
import { ErrorPage } from "@/components/ErrorPage";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Snowfall } from "@/components/Snowfall";
import { KarnivalConfetti } from "@/components/KarnivalConfetti";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useQuery } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { ADMIN_ROUTE, QC_ROUTE } from "@/lib/routes";
import { THEME_PRESETS, type ThemePreset } from "@/lib/system-config";
import { api } from "@/convex/_generated/api";

import { Promo } from "./pages/Promo";

/**
 * Bungkus importer rute dengan percobaan ulang. Kegagalan memuat modul
 * (dev server menggantung, 504 "Outdated Optimize Dep", jaringan putus
 * sesaat) umumnya sementara, jadi modul dicoba ulang beberapa kali sebelum
 * React menyerah dan menampilkan halaman error.
 */
function denganPercobaan<M>(muat: () => Promise<M>, maksPercobaan = 3): () => Promise<M> {
  return async () => {
    for (let ke = 1; ; ke += 1) {
      try {
        return await muat();
      } catch (error) {
        if (ke >= maksPercobaan) throw error;
        await new Promise((selesai) => setTimeout(selesai, 300 * ke));
      }
    }
  };
}

// Lazy load route components for better code splitting
const Landing = lazy(denganPercobaan(() => import("./pages/Landing.tsx")));
const AuthPage = lazy(denganPercobaan(() => import("./pages/Auth.tsx")));
const Dashboard = lazy(denganPercobaan(() => import("./pages/Dashboard.tsx")));
const Admin = lazy(denganPercobaan(() => import("./pages/Admin.tsx")));
const PenyediaDana = lazy(denganPercobaan(() => import("./pages/PenyediaDana.tsx")));
const AksesBersama = lazy(denganPercobaan(() => import("./pages/AksesBersama.tsx")));
const SyaratKetentuan = lazy(denganPercobaan(() => import("./pages/SyaratKetentuan.tsx")));
const NotFound = lazy(denganPercobaan(() => import("./pages/NotFound.tsx")));
const Qc = lazy(denganPercobaan(() => import("./pages/Qc.tsx")));

// Fallback pemuatan rute: layar bermerek PINDAI dengan logo brankas "pindai"
// yang beranimasi dan interaktif (lihat components/LoadingScreen.tsx).
function RouteLoading() {
  return <LoadingScreen />;
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Ciri kegagalan memuat modul rute (chunk/dependency), bukan bug logika. */
function gagalMuatModul(error: unknown): boolean {
  const pesan = error instanceof Error ? error.message : String(error);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|outdated optimize dep|chunkloaderror|loading chunk \S+ failed/i.test(
    pesan,
  );
}

const KUNCI_MUAT_ULANG = "pindai.muat-ulang-modul";
const JEDA_MUAT_ULANG_MS = 30_000;

/**
 * Izinkan satu muat-ulang otomatis per 30 detik: cukup untuk membuang modul
 * dengan hash dependency yang basi, tanpa membuat loop bila server benar-benar
 * mati.
 */
function bolehMuatUlangOtomatis(): boolean {
  try {
    const terakhir = Number(window.sessionStorage.getItem(KUNCI_MUAT_ULANG) ?? 0);
    if (Date.now() - terakhir < JEDA_MUAT_ULANG_MS) return false;
    window.sessionStorage.setItem(KUNCI_MUAT_ULANG, String(Date.now()));
    return true;
  } catch {
    // sessionStorage diblokir → jangan mengambil risiko muat-ulang berulang.
    return false;
  }
}

/**
 * Guard terakhir agar kesalahan runtime tidak pernah menyisakan halaman
 * kosong. Detail teknis hanya dicatat ke console — pengunjung melihat error
 * page generik PINDAI tanpa pesan server mentah.
 *
 * Khusus rute yang gagal dimuat, halaman memulihkan diri sendiri dengan satu
 * kali muat ulang otomatis (mengambil modul beserta hash dependency terbaru)
 * alih-alih membiarkan pengunjung tersangkut di halaman error.
 */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; memuatUlang: boolean }
> {
  state = { hasError: false, memuatUlang: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("[PINDAI] Kesalahan runtime:", err, info.componentStack);

    if (!gagalMuatModul(err) || !bolehMuatUlangOtomatis()) return;
    this.setState({ memuatUlang: true });
    window.setTimeout(() => window.location.reload(), 300);
    // Bila browser menolak memuat ulang, kembalikan halaman error sebagai
    // jalan keluar agar pengunjung tidak berhenti di layar tunggu.
    window.setTimeout(() => this.setState({ memuatUlang: false }), 2500);
  }
  render() {
    if (this.state.memuatUlang) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16 text-slate-900">
          <p className="text-sm text-muted-foreground">Menyiapkan ulang halaman…</p>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16 text-slate-900">
          <ErrorPage />
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Batas error per rute: kunci berubah saat path berganti sehingga kendala di
 * satu halaman tidak membuat seluruh aplikasi macet — pengunjung bisa pindah
 * halaman dan boundary mencoba render ulang dari awal.
 */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <RootErrorBoundary key={location.pathname}>{children}</RootErrorBoundary>;
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);



function ThemeSync() {
  const config = useQuery(api.system.getThemePublic, {});

  useEffect(() => {
    const tema = config?.tema;
    if (tema && (THEME_PRESETS as readonly string[]).includes(tema)) {
      document.documentElement.dataset.theme = tema as ThemePreset;
    }
  }, [config?.tema]);

  // Tema beranimasi menambahkan lapisan efek layar penuh di atas aplikasi.
  if (config?.tema === "salju") return <Snowfall />;
  if (config?.tema === "karnival") return <KarnivalConfetti />;
  return null;
}

function SessionGuardBridge() {
  // Idle auto-logout 15 menit + single active session (heartbeat) — semua halaman.
  useSessionGuard(15);
  return null;
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  /**
   * Setiap perpindahan rute: kembalikan gulir ke puncak dan pindahkan fokus
   * keyboard ke landmark konten utama (#konten). Tanpa ini, pengguna keyboard
   * dan pembaca layar tetap berada pada posisi gulir/fokus halaman sebelumnya
   * padahal isinya sudah berganti.
   *
   * Rute dimuat dengan lazy(), jadi elemen #konten belum tentu ada pada frame
   * pertama — fokus dicoba ulang maksimal ~1 detik agar tidak menggantung.
   */
  useEffect(() => {
    let dibatalkan = false;
    let frame = 0;
    let percobaan = 0;

    const pindahFokus = () => {
      if (dibatalkan) return;
      const konten = document.getElementById("konten");
      if (konten) {
        konten.focus({ preventScroll: true });
        return;
      }
      if (percobaan >= 60) return;
      percobaan += 1;
      frame = window.requestAnimationFrame(pindahFokus);
    };

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    frame = window.requestAnimationFrame(pindahFokus);

    return () => {
      dibatalkan = true;
      window.cancelAnimationFrame(frame);
    };
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <ThemeSync />
        <BrowserRouter>
          {/* Tautan lewat-navigasi: hanya tampil saat difokuskan dengan Tab,
              memindahkan pengguna keyboard langsung ke konten utama. */}
          <a className="skip-link" href="#konten">
            Lewati ke konten utama
          </a>
          <AnnouncementBar />
          {/* Indikator global HANYA untuk keadaan yang memang perlu diketahui
              seluruh layar: koneksi terputus atau proses panjang yang berjalan.
              Pemuatan awal & penyegaran biasa punya umpan baliknya sendiri. */}
          <BilahSinkron />
          <SessionGuardBridge />
          <RouteSyncer />
          <RouteErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route
                  path="/auth"
                  element={<AuthPage redirectAfterAuth="/dashboard" />}
                />
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <Dashboard />
                    </RequireAuth>
                  }
                />
                <Route
                  path={ADMIN_ROUTE}
                  element={
                    <RequireAuth>
                      <Admin />
                    </RequireAuth>
                  }
                />
                {/* Pintu publik pemantau: kode akses bersama (lihat saja).
                    Sengaja di luar RequireAuth — halamannya sendiri yang
                    membuka sesi tamu sebelum memverifikasi kode. */}
                <Route path="/akses-bersama" element={<AksesBersama />} />
                <Route path="/syarat-ketentuan" element={<SyaratKetentuan />} />

                {/* Ruang penyedia dana (baca saja) untuk akun yang diberi akses
                    admin; tautan lama /pendana diarahkan ke sana. */}
                <Route
                  path="/penyedia-dana"
                  element={
                    <RequireAuth>
                      <PenyediaDana />
                    </RequireAuth>
                  }
                />
                <Route path="/promo" element={<RequireAuth><Promo /></RequireAuth>} />
                {/* QC konsistensi — suite pemeriksaan invariant uang, mandiri,
                    gerbang admin + TOTP di dalam halaman. */}
                <Route
                  path={QC_ROUTE}
                  element={
                    <RequireAuth>
                      <Qc />
                    </RequireAuth>
                  }
                />
                {/* Tautan lama /pendana (bookmark, dokumen lama) diarahkan ke
                    ruang penyedia dana alih-alih jatuh ke NotFound. Rute ini
                    sebelumnya terdaftar untuk /penyedia-dana — path yang sudah
                    dilayani di atas, sehingga tidak pernah terpakai. */}
                <Route path="/pendana" element={<Navigate to="/penyedia-dana" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
