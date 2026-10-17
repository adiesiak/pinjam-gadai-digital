import { useQuery } from "convex/react";
import { ArrowLeft, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { TombolMasukSebagai } from "@/components/admin/MasukSebagaiDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import { DashboardHeader } from "@/pages/dashboard/dashboard-header";
import {
  LABEL_STATUS_KYC,
  NADA_STATUS_KYC,
  type StatusKyc,
} from "@/lib/kycStatus";
import { ADMIN_ROUTE } from "@/lib/routes";

/** Satu akun yang bisa dibuka dalam Mode Nasabah. */
export type NasabahUji = {
  userId: string;
  nama: string;
  email: string | null;
  kodePeminjam: string | null;
  kycStatus: StatusKyc | null;
  punyaDataDiri: boolean;
  punyaPinjaman: boolean;
};

const NADA_LENCANA = "rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4";

/**
 * DAFTAR AKUN NASABAH untuk Mode Nasabah.
 *
 * Murni tampilan: semua data dan aksi datang lewat prop, jadi keadaan kosong,
 * memuat, dan belum-verifikasi-TOTP bisa diuji tanpa Convex. Yang dijaga di
 * sini bukan hanya barisnya, melainkan juga bahwa admin tahu AKUN MANA yang
 * layak dicoba — penanda data diri, status KYC, dan riwayat pengajuan ikut
 * tampil supaya tidak perlu membuka panel lain lebih dulu.
 */
export function DaftarNasabahUji({
  siap,
  memuat,
  kueri,
  kueriCari,
  hasil,
  total,
  onKueri,
  aksi,
}: {
  /** Sesi admin sudah lolos TOTP dan daftar boleh dibaca. */
  siap: boolean;
  memuat: boolean;
  /** Isi kotak pencarian (langsung, tanpa jeda). */
  kueri: string;
  /** Kata kunci yang sudah dipakai server — untuk kalimat hasil. */
  kueriCari: string;
  hasil: NasabahUji[];
  total: number;
  onKueri: (nilai: string) => void;
  aksi: (row: NasabahUji) => ReactNode;
}) {
  return (
    <section
      aria-labelledby="judul-pemilih-nasabah"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
        <h2 id="judul-pemilih-nasabah" className="text-sm font-semibold text-navy">
          Pilih akun nasabah
        </h2>
        <div className="mt-2.5">
          <Label htmlFor="cari-nasabah" className="text-xs text-muted-foreground">
            Cari nama, email, kode nasabah, atau NIK
          </Label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              id="cari-nasabah"
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={kueri}
              onChange={(event) => onKueri(event.target.value)}
              placeholder="mis. Rani atau PMN-"
              className="h-11 pl-9"
            />
          </div>
        </div>
        <p role="status" aria-live="polite" className="mt-2 text-xs leading-5 text-muted-foreground">
          {memuat
            ? "Mencari akun…"
            : !siap
              ? "Daftar akun terkunci sampai verifikasi TOTP selesai."
              : kueriCari === ""
                ? total === 0
                  ? "Belum ada akun nasabah."
                  : `${total} akun nasabah tersedia.`
                : total === 0
                  ? `Tidak ada akun yang cocok dengan “${kueriCari}”.`
                  : `${total} akun cocok; ${Math.min(hasil.length, total)} ditampilkan.`}
        </p>
      </div>

      {!siap ? (
        <div className="flex items-start gap-3 px-4 py-5 sm:px-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy">Verifikasi TOTP dulu</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Mode Nasabah memakai izin Super Admin. Sesi ini belum lolos verifikasi
              TOTP, atau sesinya sudah berakhir, jadi daftar akun belum bisa dibuka.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 rounded-xl">
              <Link to={ADMIN_ROUTE}>Buka panel admin</Link>
            </Button>
          </div>
        </div>
      ) : memuat ? (
        <div className="px-4 py-2 sm:px-5">
          <SkeletonBarisDaftar baris={4} />
        </div>
      ) : hasil.length === 0 ? (
        <div className="px-4 py-8 text-center sm:px-5">
          <p className="text-sm font-medium text-navy">
            {kueriCari === "" ? "Belum ada akun nasabah" : "Tidak ada akun yang cocok"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {kueriCari === ""
              ? "Akun muncul di sini setelah seseorang mendaftar, atau setelah Anda mencatat pengajuan manual di panel admin."
              : "Coba nama lain, email lengkap, kode nasabah, atau 16 digit NIK."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {hasil.map((row) => (
            <li
              key={row.userId}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy">{row.nama}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.email ?? "Tanpa email"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {row.kodePeminjam !== null && (
                    <span className={`${NADA_LENCANA} border-slate-200 bg-slate-50 font-mono text-slate-600`}>
                      {row.kodePeminjam}
                    </span>
                  )}
                  <span
                    className={`${NADA_LENCANA} ${
                      row.kycStatus === null
                        ? "border-slate-200 bg-slate-100 text-slate-600"
                        : NADA_STATUS_KYC[row.kycStatus]
                    }`}
                  >
                    KYC: {row.kycStatus === null ? "Belum dimulai" : LABEL_STATUS_KYC[row.kycStatus]}
                  </span>
                  <span className={`${NADA_LENCANA} border-slate-200 bg-white text-slate-600`}>
                    {row.punyaDataDiri ? "Data diri terisi" : "Data diri kosong"}
                  </span>
                  {row.punyaPinjaman && (
                    <span className={`${NADA_LENCANA} border-emerald-100 bg-emerald-50 text-emerald-800`}>
                      Pernah mengajukan
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0">{aksi(row)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * MODE NASABAH untuk Super Admin — membuka dashboard sebagai satu akun nasabah.
 *
 * Halaman ini sengaja tidak menumpuk data: admin datang ke sini untuk satu
 * pekerjaan, yaitu memilih akun uji. Pengaturan sesi, tiket sekali pakai, masa
 * berlaku, dan audit tetap dikerjakan `convex/pratinjau.ts`; layar ini hanya
 * memilih target lewat pencarian yang sempit dan menjelaskan risikonya sebelum
 * tombol ditekan.
 */
export function ModeNasabahUji() {
  const [kueri, setKueri] = useState("");
  const [kueriCari, setKueriCari] = useState("");
  // Jeda ketik kecil: daftar akun dibaca di server, jadi satu permintaan per
  // huruf akan mengirim pembacaan yang sama berulang kali.
  useEffect(() => {
    const timer = window.setTimeout(() => setKueriCari(kueri.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [kueri]);

  const data = useQuery(api.pratinjau.cariNasabahUji, { kueri: kueriCari });

  return (
    <div className="min-h-screen bg-slate-50">
      <DashboardHeader role="admin" />
      <main id="konten" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
        <Link
          to={ADMIN_ROUTE}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-navy"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Panel admin
        </Link>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-foreground">
          Pengujian fitur
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
          Mode Nasabah
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Buka dashboard sebagai satu akun nasabah untuk mencoba alur yang sama dengan
          yang dilihatnya: pengajuan, KYC, kontrak, sampai pembayaran.
        </p>

        <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-950">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Sesi ini nyata. Tindakan yang Anda lakukan tercatat atas nama akun itu dan
            masuk jejak audit, jadi pakai akun uji, bukan akun nasabah sungguhan.
            Sesi pratinjau berumur paling lama dua jam dan bisa ditutup dari bilah di
            atas layar.
          </p>
        </div>

        <DaftarNasabahUji
          siap={data?.siap ?? true}
          memuat={data === undefined}
          kueri={kueri}
          kueriCari={kueriCari}
          hasil={data?.hasil ?? []}
          total={data?.total ?? 0}
          onKueri={setKueri}
          aksi={(row) => (
            <TombolMasukSebagai
              targetId={row.userId}
              nama={row.nama}
              tujuan="dashboard nasabah"
            />
          )}
        />

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Akun pendana dibuka dari Manajemen Akun di panel admin. Akun admin tidak bisa
          dipratinjau, dan satu admin bisa membuka paling banyak tiga pratinjau aktif.
        </p>
      </main>
    </div>
  );
}
