import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { BilahSinkron } from "@/components/BilahSinkron";
import { GerbangVersiWajib } from "@/components/GerbangVersiWajib";
import { PratinjauBanner } from "@/components/PratinjauBanner";
import { ErrorPage } from "@/components/ErrorPage";
import { RouteLoading } from "@/components/LoadingScreen";
import { Snowfall } from "@/components/Snowfall";
import { KarnivalConfetti } from "@/components/KarnivalConfetti";
import {
  RequireAdmin,
  RequireAuth,
  RequirePendana,
} from "@/components/RequireAuth";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useQuery } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import "./index.css";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { ADMIN_ROUTE, QC_ROUTE } from "@/lib/routes";
import { THEME_PRESETS } from "@/lib/system-config";
import { GAYA_PRESETS } from "@/lib/template-gaya";
import { api } from "@/convex/_generated/api";

// Keduanya sengaja lazy seperti rute lain: `Promo` menarik framer-motion dan
// kanvas poster, `PublicInfoPage` menarik kalkulator pinjaman/gadai/bulanan.
// Impor statis membuat keduanya ikut bundel awal dan memperlambat paint
// beranda, yang tidak membutuhkan satu pun dari berkas itu.
const Promo = lazy(
  denganPercobaan(() =>
    import("./pages/Promo").then((m) => ({ default: m.PromoDenganKampanye })),
  ),
);
const PublicInfoPage = lazy(
  denganPercobaan(() => import("./pages/PublicInfoPage")),
);
// Dua halaman produk memakai kalkulator dan mesin syariah; keduanya tetap
// lazy supaya bundel beranda tidak membawa kode yang belum dibuka pengunjung.
const ProdukPinjaman = lazy(
  denganPercobaan(() => import("./pages/ProdukPinjaman")),
);
// Halaman penawaran pendanaan: menarik kalkulator dan penyusun PDF proposal,
// jadi tetap lazy seperti halaman publik lain.
const JadiPendana = lazy(
  denganPercobaan(() => import("./pages/JadiPendana.tsx")),
);
// Etalase PPOB publik: pembeli tidak perlu akun, jadi halaman ini dimuat
// terpisah dari dashboard dan tidak menarik mesin pinjaman sama sekali.
const Ppob = lazy(
  denganPercobaan(() => import("./pages/Ppob").then((m) => ({ default: m.Ppob }))),
);
const PpobPesanan = lazy(
  denganPercobaan(() =>
    import("./pages/Ppob").then((m) => ({ default: m.PpobPesanan })),
  ),
);

/**
 * Daftarkan service worker pemasangan (lihat `public/sw.js`). Tanpa cache:
 * hanya memenuhi syarat browser sebelum menawarkan "Pasang aplikasi".
 * Kegagalan pendaftaran diabaikan — tombol pasang tetap memberi panduan manual.
 */
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

/**
 * Bungkus importer rute dengan percobaan ulang. Kegagalan memuat modul
 * (dev server menggantung, 504 "Outdated Optimize Dep", jaringan putus
 * sesaat) umumnya sementara, jadi modul dicoba ulang beberapa kali sebelum
 * React menyerah dan menampilkan halaman error.
 */
function denganPercobaan<M>(
  muat: () => Promise<M>,
  maksPercobaan = 3,
): () => Promise<M> {
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
const PublicLanding = lazy(
  denganPercobaan(() => import("./pages/LandingHome.tsx")),
);
const UnduhAplikasi = lazy(
  denganPercobaan(() => import("./pages/UnduhAplikasi.tsx")),
);
const AuthPage = lazy(denganPercobaan(() => import("./pages/Auth.tsx")));
const Dashboard = lazy(denganPercobaan(() => import("./pages/Dashboard.tsx")));
const Admin = lazy(denganPercobaan(() => import("./pages/Admin.tsx")));
const PenyediaDana = lazy(
  denganPercobaan(() => import("./pages/PenyediaDana.tsx")),
);
const AksesBersama = lazy(
  denganPercobaan(() => import("./pages/AksesBersama.tsx")),
);
const SyaratKetentuan = lazy(
  denganPercobaan(() => import("./pages/SyaratKetentuan.tsx")),
);
// Kebijakan privasi: halaman publik yang ditautkan dari beranda, halaman masuk,
// dashboard, dan formulir pengajuan.
const Privasi = lazy(denganPercobaan(() => import("./pages/Privasi.tsx")));
// Papan pemenang undian: publik, ditautkan dari kartu doorprize di beranda.
const Pemenang = lazy(denganPercobaan(() => import("./pages/Pemenang.tsx")));
// Halaman publik dari tautan WhatsApp admin (lihat pages/CekStatus.tsx).
const CekStatus = lazy(denganPercobaan(() => import("./pages/CekStatus.tsx")));
const VerifikasiKontrak = lazy(
  denganPercobaan(() => import("./pages/VerifikasiKontrak.tsx")),
);
const NotFound = lazy(denganPercobaan(() => import("./pages/NotFound.tsx")));
const Qc = lazy(denganPercobaan(() => import("./pages/Qc.tsx")));
/**
 * Bilah alat pengembang dimuat SETELAH paint pertama.
 *
 * Berkas itu mengimpor framer-motion dan snapdom (±44 kB terkompresi). Selama
 * diimpor statis, setiap kunjungan beranda — termasuk pengunjung yang hanya
 * membaca halaman produk — ikut mengunduh animasi bilah alat sebelum konten
 * tampil. Ia bukan bagian alur pengunjung, jadi cukup muncul belakangan; bila
 * gagal dimuat, `ToolbarErrorBoundary` mematikannya tanpa menyentuh halaman.
 */
const VlyToolbar = lazy(() =>
  import("../vly-toolbar-readonly.tsx").then((m) => ({ default: m.VlyToolbar })),
);

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
    const terakhir = Number(
      window.sessionStorage.getItem(KUNCI_MUAT_ULANG) ?? 0,
    );
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
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-900 sm:py-16">
          <p className="text-sm text-muted-foreground">
            Menyiapkan ulang halaman…
          </p>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-900 sm:py-16">
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
  return (
    <RootErrorBoundary key={location.pathname}>{children}</RootErrorBoundary>
  );
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

/** Rute yang boleh memakai efek musiman layar penuh. */
const RUTE_PUBLIK = [
  "/biaya",
  "/cara-kerja",
  "/layanan",
  "/keamanan",
  "/faq",
  "/aplikasi",
  "/pinjaman",
  "/syarat-ketentuan",
] as const;

/**
 * Menyegerakkan template (palet + gaya) dari server ke `data-*` di <html>.
 *
 * Nilai disimpan ke localStorage supaya `index.html` bisa memasangnya pada
 * paint pertama (lihat skrip inline di sana) — tanpa itu, pengunjung melihat
 * warna bawaan sekilas sebelum query Convex selesai.
 *
 * Efek musiman hanya dipasang di rute publik dan hanya bila sakelarnya aktif:
 * dashboard, KYC, dan panel admin tidak boleh tertutup salju/konfeti.
 */
function ThemeSync() {
  const config = useQuery(api.system.getThemePublic, {});
  const lokasi = useLocation();

  useEffect(() => {
    if (!config) return;
    const akar = document.documentElement;
    if ((THEME_PRESETS as readonly string[]).includes(config.tema)) {
      akar.dataset.theme = config.tema;
      try {
        localStorage.setItem("pindai-tema", config.tema);
      } catch {
        // Penyimpanan diblokir: tema tetap berlaku untuk sesi ini.
      }
    }
    if ((GAYA_PRESETS as readonly string[]).includes(config.gaya)) {
      akar.dataset.gaya = config.gaya;
      try {
        localStorage.setItem("pindai-gaya", config.gaya);
      } catch {
        // idem
      }
    }
  }, [config?.tema, config?.gaya]);

  const publik =
    lokasi.pathname === "/" ||
    RUTE_PUBLIK.some(
      (awalan) =>
        lokasi.pathname === awalan || lokasi.pathname.startsWith(`${awalan}/`),
    );
  if (!config?.efekMusiman || !publik) return null;
  if (config.tema === "salju") return <Snowfall />;
  if (config.tema === "karnival") return <KarnivalConfetti />;
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
        <Suspense fallback={null}>
          <VlyToolbar />
        </Suspense>
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        {/* APK di bawah versi wajib berhenti di layar perbarui — dipasang di
            atas router supaya tidak ada rute yang bisa menyelinap lewat. */}
        <GerbangVersiWajib />
        <BrowserRouter>
          {/* `ThemeSync` membaca `useLocation` untuk membatasi salju/konfeti ke
              rute publik, jadi ia WAJIB berada di dalam router. Di luar router
              hook itu melempar dan boundary teratas mengganti seluruh aplikasi
              dengan halaman kendala. */}
          <ThemeSync />
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
          {/* Penanda pratinjau Super Admin: selama peramban ini memakai sesi
              akun lain, bilah ini selalu tampil di atas seluruh halaman. */}
          <PratinjauBanner />
          <SessionGuardBridge />
          <RouteSyncer />
          <RouteErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<PublicLanding />} />
                <Route path="/biaya" element={<PublicInfoPage />} />
                {/* Dua produk dipisah tegas: konvensional dan syariah punya
                    halaman, aturan, dan kalkulatornya sendiri. */}
                <Route
                  path="/pinjaman/konvensional"
                  element={<ProdukPinjaman produk="konvensional" />}
                />
                <Route
                  path="/pinjaman/syariah"
                  element={<ProdukPinjaman produk="syariah" />}
                />
                <Route path="/cara-kerja" element={<PublicInfoPage />} />
                {/* Etalase PPOB: penjualan tunai, bukan pengajuan pinjaman. */}
                <Route path="/ppob" element={<Ppob />} />
                <Route path="/ppob/pesanan/:kode" element={<PpobPesanan />} />
                <Route
                  path="/layanan/pinjaman-tunai"
                  element={<PublicInfoPage />}
                />
                <Route path="/layanan/gadai" element={<PublicInfoPage />} />
                <Route
                  path="/layanan/kredit-barang"
                  element={<PublicInfoPage />}
                />
                <Route path="/keamanan" element={<PublicInfoPage />} />
                <Route path="/faq" element={<PublicInfoPage />} />
                {/* Proposal pendanaan tidak lagi terbuka untuk umum: halaman ini
                    hanya dibuka dari ruang pendana, setelah kode akses bersama
                    (atau akun pendana/admin) membuka sesi lihat-saja. */}
                <Route
                  path="/jadi-pendana"
                  element={
                    <RequirePendana>
                      <JadiPendana />
                    </RequirePendana>
                  }
                />
                {/* Halaman unduh APK: menu khusus yang menjelaskan versi,
                    ukuran, dan langkah pemasangan sebelum berkas diunduh. */}
                <Route path="/aplikasi" element={<UnduhAplikasi />} />
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
                <Route path="/privasi" element={<Privasi />} />
                {/* Pemenang undian: bukti publik bahwa undian dijalankan, dengan
                    nama yang sudah disamarkan di server. */}
                <Route path="/pemenang" element={<Pemenang />} />
                {/* Publik: pembaca dokumen cetak bisa memeriksa hash tanpa akun. */}
                <Route
                  path="/verifikasi-kontrak/:kode"
                  element={<VerifikasiKontrak />}
                />
                {/* Pintu publik kwitansi digital: dibuka dari tautan WhatsApp
                    yang dikirim admin. Sengaja di luar RequireAuth — peminjam
                    lama belum tentu punya sesi aktif; otorisasinya adalah token
                    128 bit per pinjaman (lihat convex/tautanStatus.ts). */}
                <Route path="/cek-status/:token" element={<CekStatus />} />

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
                {/* /promo = ruang internal brand (poster & aset Android). Hanya
                    akun admin; peran lain dialihkan ke dashboard-nya sendiri. */}
                <Route
                  path="/promo"
                  element={
                    <RequireAdmin>
                      <Promo />
                    </RequireAdmin>
                  }
                />
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
                <Route
                  path="/pendana"
                  element={<Navigate to="/penyedia-dana" replace />}
                />
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
