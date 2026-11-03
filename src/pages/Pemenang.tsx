/**
 * Halaman /pemenang — papan pemenang undian triwulanan (publik).
 *
 * Kenapa publik: undian berhadiah hanya dipercaya kalau hasilnya bisa dilihat
 * orang lain, bukan hanya disebut di dashboard pemenang. Yang ditampilkan cukup
 * untuk membuktikan undian benar-benar dijalankan — periode, hadiah, jumlah
 * peserta/tiket, dan status penyerahan — tanpa membocorkan identitas: nama
 * disamarkan di SERVER (`doorprize.pemenangPublik`), dan halaman ini tidak
 * pernah menerima nama lengkap, email, atau nomor telepon.
 *
 * Tidak ada pemenang karangan: daftar ini membaca baris `doorprizeUndian` yang
 * ditulis saat admin menjalankan pengundian. Kalau belum ada undian, halamannya
 * mengatakan begitu.
 */
import { motion } from "framer-motion";
import { ArrowLeft, Award, CalendarCheck, Gift, Loader2, ShieldCheck, Ticket } from "lucide-react";
import { Link } from "react-router";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { DoorprizeRingkas } from "@/components/landing/DoorprizeRingkas";
import { useAuth } from "@/hooks/use-auth";
import { EASE_OUT } from "@/lib/motion";
import { formatTanggalWIB } from "@/lib/waktu";

const LABEL_PERAN: Record<"peminjam" | "pendana", string> = {
  peminjam: "Peminjam",
  pendana: "Penyedia dana",
};

export function PemenangView() {
  const daftar = useQuery(api.doorprize.pemenangPublik, { batas: 12 });
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">PINDAI</span>
          </Link>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Beranda
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="rounded-2xl border border-border bg-card p-5 sm:p-7"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
            <Award className="size-4" aria-hidden />
            Doorprize triwulanan
          </p>
          <h1 className="mt-2 font-judul text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
            Pemenang undian PINDAI
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            Setiap kuartal, tiket dari pelunasan tepat waktu dan penempatan dana diundi
            satu pemenang. Daftar ini menampilkan undian yang sudah benar-benar
            dijalankan, beserta status penyerahan hadiahnya.
          </p>
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Nama sengaja disamarkan agar pemenang tetap dapat dikenali pemiliknya tanpa
              bisa dihubungi pihak lain. PINDAI tidak pernah meminta biaya apa pun untuk
              mencairkan hadiah undian.
            </span>
          </p>
        </motion.section>

        <DoorprizeRingkas
          accountHref={isAuthenticated ? "/dashboard" : "/auth"}
          sudahMasuk={isAuthenticated}
          tampilkanTautanPemenang={false}
        />

        {daftar === undefined ? (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Memuat pemenang…
          </p>
        ) : daftar.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Belum ada undian yang dijalankan. Pemenang kuartal pertama akan muncul di sini
            setelah pengundian resmi.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {daftar.map((baris) => (
              <li
                key={baris.periode}
                className="rounded-xl border border-border bg-card px-4 py-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-emerald-700/30 bg-emerald-700/10 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {baris.labelPeriode}
                      </span>
                      <p className="text-sm font-semibold text-foreground">{baris.nama}</p>
                      <span className="text-xs text-muted-foreground">
                        {LABEL_PERAN[baris.peran]}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Gift className="size-3.5 text-slate-400" aria-hidden />
                        {baris.hadiah}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Ticket className="size-3.5 text-slate-400" aria-hidden />
                        {baris.jumlahTiket} tiket · {baris.jumlahPeserta} peserta
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck className="size-3.5 text-slate-400" aria-hidden />
                        Diundi {formatTanggalWIB(baris.diundiPada)}
                      </span>
                    </p>
                  </div>
                  <span
                    className={
                      baris.hadiahDiserahkan
                        ? "rounded-full border border-emerald-700/30 bg-emerald-700/10 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                        : "rounded-full border border-amber-700/30 bg-amber-700/10 px-2 py-0.5 text-xs font-semibold text-amber-800"
                    }
                  >
                    {baris.hadiahDiserahkan
                      ? `Diserahkan ${formatTanggalWIB(baris.diserahkanPada ?? baris.diundiPada)}`
                      : "Menunggu penyerahan"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          Hadiah undian adalah objek pajak penerima sesuai ketentuan yang berlaku. Pemenang
          dihubungi petugas melalui kontak yang terdaftar di akun.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            to="/jadi-pendana"
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentang pendanaan
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Buka dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function Pemenang() {
  return <PemenangView />;
}
