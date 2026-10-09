/**
 * Rute `/qc` — QC Konsistensi PINDAI.
 *
 * Halaman admin berdiri sendiri yang menjalankan suite pemeriksaan invariant
 * (lib/qcKonsistensi) di atas DATA ASLI: ruang penyedia dana, panel admin, dan
 * kartu keuntungan admin. Suite gagal begitu satu invariant uang dilanggar —
 * angka yang tidak mungkin berasal dari perhitungan yang sama.
 *
 * Akses mengikuti pola panel admin: `RequireAuth` pada rute, lalu gerbang
 * peran + TOTP di dalam halaman; seluruh query dijaga `requireAdminSession`
 * di sisi server. Presentasi terpusat di `QcPanel`, dan panel rekonsiliasi
 * dipakai LANSUNG sebagai komponen yang sama dengan yang dipakai panel admin —
 * QC tidak membangun pembanding versi sendiri.
 */
import { useQuery } from "convex/react";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, Navigate } from "react-router";

import { RekonsiliasiPendana } from "@/components/admin/RekonsiliasiPendana";
import { QcPanel } from "@/components/admin/QcPanel";
import { LoadingScreen } from "@/components/LoadingScreen";
import { TotpGate } from "@/components/TotpGate";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { jalankanQc, type HasilQc, type InputQc } from "@/lib/qcKonsistensi";
import { ADMIN_ROUTE, QC_ROUTE } from "@/lib/routes";

export default function Qc() {
  const { isLoading, isAuthenticated } = useAuth();
  const gate = useQuery(api.security.totpGateStatus, isAuthenticated ? {} : "skip");
  const adminVerified = gate?.isAdmin === true && gate.verified;

  const ruang = useQuery(api.penyediaDana.daftarPengajuan, adminVerified ? {} : "skip");
  const panel = useQuery(api.penyediaDana.daftarInvestor, adminVerified ? {} : "skip");
  const stats = useQuery(api.admin.adminStats, adminVerified ? {} : "skip");

  // Judul tab halaman QC (halaman lain memakai judul bawaan index.html).
  useEffect(() => {
    const sebelum = document.title;
    document.title = "QC Konsistensi — PINDAI";
    return () => {
      document.title = sebelum;
    };
  }, []);

  // Suite dijalankan ulang setiap kali salah satu snapshot data berubah —
  // tanpa waktu render (aturan kemurnian React): stempel laporan dibaca saat
  // tombol "Salin laporan" diklik.
  const hasil = useMemo<HasilQc | null>(() => {
    if (ruang === undefined || panel === undefined || stats === undefined) {
      return null;
    }
    const input: InputQc = {
      ruang,
      panel: {
        ringkasan: panel.ringkasan,
        rows: panel.rows.map((r) => ({
          nama: r.nama,
          email: r.email,
          metrik: {
            jumlahPinjaman: r.jumlahPinjaman,
            totalDisalurkan: r.totalDisalurkan,
            saldoBerjalan: r.saldoBerjalan,
            totalBunga: r.totalBunga,
            keuntunganPendana: r.keuntunganPendana,
            keuntunganAdmin: r.keuntunganAdmin,
          },
        })),
      },
      stats,
    };
    return jalankanQc(input);
  }, [ruang, panel, stats]);

  // ===== Gerbang akses — sama urutannya dengan panel admin =====
  if (isLoading || (isAuthenticated && gate === undefined)) {
    return <LoadingScreen label="Memeriksa akses QC…" />;
  }
  if (!isAuthenticated) {
    return <Navigate to={`/auth?returnTo=${encodeURIComponent(QC_ROUTE)}`} replace />;
  }
  if (!gate?.isAdmin) {
    return <NotAdminGate />;
  }
  if (!gate.aktif) {
    return <TotpBelumAktif />;
  }
  if (!gate.verified) {
    return <TotpGate />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-3 py-6 sm:px-6 sm:py-8">
        <QcPanel hasil={hasil} />

        <section className="animate-masuk rounded-2xl border border-border bg-card p-4 sm:p-5">
          <p className="text-sm font-semibold">Rekonsiliasi panel ↔ ruang</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Komponen yang sama dengan yang tampil di panel admin — QC memakainya apa adanya,
            bukan salinannya.
          </p>
          <div className="mt-3">
            <RekonsiliasiPendana />
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-6 text-xs leading-5 text-muted-foreground">
          <p className="max-w-2xl">
            Angka diambil langsung dari query Convex yang dipakai panel admin dan ruang penyedia
            dana, lalu dihitung ulang lewat mesin uang tunggal <code>lib/bagiHasil</code>.
            Perubahan data langsung terhitung ulang tanpa muat ulang halaman.
          </p>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to={ADMIN_ROUTE}>Ke panel admin</Link>
          </Button>
        </footer>
      </main>
    </div>
  );
}

/** Bukan akun admin — ditolak dengan jelas (server tetap penjaga utama). */
function NotAdminGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk max-w-md text-center">
        <ShieldCheck className="mx-auto size-5 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Akses khusus Super Admin</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Halaman QC hanya untuk akun Super Admin. Silakan kembali ke ruang nasabah.
        </p>
        <Button asChild variant="outline" className="mt-6 rounded-full">
          <Link to="/dashboard">Ke ruang nasabah</Link>
        </Button>
      </div>
    </main>
  );
}

/** Admin yang belum mengaktifkan TOTP — arahkan ke panel untuk menyiapkannya. */
function TotpBelumAktif() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <ShieldCheck className="size-6 text-primary" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Aktifkan verifikasi TOTP</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          QC membaca data operasional, jadi verifikasi dua faktor wajib aktif lebih dulu —
          sama seperti panel admin.
        </p>
        <Button asChild className="mt-6 w-full rounded-full">
          <Link to={ADMIN_ROUTE}>Buka panel admin</Link>
        </Button>
      </div>
    </main>
  );
}
