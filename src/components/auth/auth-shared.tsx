/**
 * Potongan antarmuka halaman masuk (`pages/Auth.tsx`) — presentasional & murni.
 *
 * Dipisah dari halaman itu karena tiga alasan:
 *  1. `pages/Auth.tsx` menumpuk >1.100 baris JSX untuk lima alur berbeda
 *     (nasabah, klaim WhatsApp, OTP email, admin, tamu) sehingga sulit dibaca.
 *  2. Token desain halaman masuk (latar ambient, kartu glassmorphism, medan
 *     input, tombol utama, tombol WhatsApp peminjam lama, lencana keamanan)
 *     jadi punya SATU sumber yang bisa diuji lewat render statis.
 *  3. Perubahan tampilan tidak perlu menyentuh logika submit form maupun
 *     autentikasi Convex yang sudah ada — semua nilai & aksi masuk lewat prop.
 *
 * Tidak ada hook autentikasi di sini: komponen ini hanya menggambar markup,
 * jadi aman dirender dengan `react-dom/server` (lihat
 * `auth-shared.render.test.tsx`) tanpa klien Convex.
 */
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  MessageCircle,
  ShieldCheck,
  Vault,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Nilai tab pada kartu masuk. Dipakai bersama oleh halaman (`value`/`onValueChange`
 * pada `<Tabs>`) dan segmen di bawah ini supaya tidak ada string lepas.
 */
export const TAB_MASUK = "masuk";
export const TAB_CEPAT = "cepat";
export type TabPintuMasuk = typeof TAB_MASUK | typeof TAB_CEPAT;

/* ==========================================================================
   Token desain — satu tempat. Kelas ditulis utuh (bukan dirakit) supaya
   Tailwind v4 tetap menemukannya saat memindai berkas sumber.
   ========================================================================== */

/** Latar halaman: gradient ambient emerald lembut di atas slate terang. */
export const KELAS_LATAR =
  "bg-slate-50 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,78,59,0.15),rgba(255,255,255,0))] min-h-screen flex items-center justify-center p-4 text-slate-800";

/** Kartu utama: glassmorphism di atas latar ambient. */
export const KELAS_KARTU =
  "bg-white/85 backdrop-blur-xl border border-white/90 shadow-xl rounded-3xl p-8 max-w-md w-full";

/** Medan input bersih dengan fokus emerald. */
export const KELAS_INPUT =
  "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

/** Tombol aksi utama kartu (email / WhatsApp → kode verifikasi). */
export const KELAS_TOMBOL_UTAMA =
  "w-full mt-3 bg-[#064E3B] hover:bg-[#042F2E] text-white font-medium py-3 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

/** Tombol sekunder beraksen hijau untuk peminjam lama (nomor WhatsApp). */
export const KELAS_TOMBOL_WA =
  "w-full py-3 px-4 rounded-xl border border-emerald-600/30 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-900 font-medium flex items-center justify-center gap-2 transition-all mt-3 shadow-2xs disabled:cursor-not-allowed disabled:opacity-60";

/* ==========================================================================
   Kerangka halaman
   ========================================================================== */

/**
 * Latar ambient halaman masuk. `id="konten"` + `tabIndex={-1}` dipertahankan
 * karena tautan lompat-ke-konten (skip link) menyasar elemen ini.
 */
export function LatarAuth({ children }: { children: ReactNode }) {
  return (
    <div id="konten" tabIndex={-1} className={KELAS_LATAR}>
      {children}
    </div>
  );
}

/** Kartu formulir bergaya glassmorphism. */
export function KartuAuth({ children }: { children: ReactNode }) {
  return <div className={KELAS_KARTU}>{children}</div>;
}

/**
 * Kepala kartu: logo PINDAI + nama produk, lalu tiga lencana fitur yang
 * disusun simetris (grid 3 kolom sama lebar, pemisah garis tipis).
 */
export function KepalaMerekAuth() {
  return (
    <div className="flex w-full flex-col items-center">
      <Link
        to="/"
        className="group flex items-center gap-3 transition-opacity hover:opacity-90"
        aria-label="PINDAI — kembali ke beranda"
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-[#064E3B] text-lg font-bold text-emerald-50 shadow-md transition-transform group-hover:scale-105">
          P
        </span>
        <span className="flex flex-col text-left leading-tight">
          <span className="text-base font-semibold tracking-[0.22em] text-slate-900">
            PINDAI
          </span>
          <span className="text-[11px] tracking-wide text-slate-500">
            Pinjam &amp; Gadai Digital
          </span>
        </span>
      </Link>

      <ul className="mt-5 grid w-full grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white/70 text-center shadow-xs backdrop-blur-sm">
        {LENCANA_FITUR.map(({ label, ikon: Ikon }) => (
          <li
            key={label}
            className="flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium text-slate-600"
          >
            <Ikon className="size-4 text-emerald-700" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tiga lencana fitur yang meyakinkan pengunjung sebelum mengisi formulir. */
const LENCANA_FITUR: { label: string; ikon: LucideIcon }[] = [
  { label: "Pencatatan ledger", ikon: BadgeCheck },
  { label: "Pencatatan gadai", ikon: Vault },
  { label: "Jadwal angsuran", ikon: CalendarClock },
];

/* ==========================================================================
   Navigasi tab (segmented control)
   ========================================================================== */

/**
 * Segmented control di kepala kartu: memisahkan alur masuk biasa dari pintu
 * "akses cepat" (tamu & kode akses bersama) supaya satu layar tidak
 * menumpuk terlalu banyak pilihan sekaligus. Harus berada di dalam `<Tabs>`.
 */
export function TabPintuMasuk() {
  return (
    <TabsList
      aria-label="Pilihan cara masuk"
      className="grid h-11 w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1"
    >
      <TabsTrigger
        value={TAB_MASUK}
        className="h-9 w-full gap-1.5 rounded-xl text-sm font-semibold text-slate-500 data-[state=active]:bg-white data-[state=active]:text-emerald-900 data-[state=active]:shadow-sm"
      >
        <LogIn className="size-4" aria-hidden="true" />
        Masuk Akun
      </TabsTrigger>
      <TabsTrigger
        value={TAB_CEPAT}
        className="h-9 w-full gap-1.5 rounded-xl text-sm font-semibold text-slate-500 data-[state=active]:bg-white data-[state=active]:text-emerald-900 data-[state=active]:shadow-sm"
      >
        <Zap className="size-4" aria-hidden="true" />
        Akses Cepat
      </TabsTrigger>
    </TabsList>
  );
}

/* ==========================================================================
   Judul & pesan
   ========================================================================== */

/** Judul satu pane (kartu), opsional dengan ikon bulat di atasnya. */
export function KepalaPane({
  judul,
  keterangan,
  ikon,
}: {
  judul: string;
  keterangan: ReactNode;
  ikon?: ReactNode;
}) {
  return (
    <div className="mb-6 text-center">
      {ikon !== undefined && (
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl border border-emerald-600/20 bg-emerald-50 text-emerald-800">
          {ikon}
        </div>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        {judul}
      </h1>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">{keterangan}</p>
    </div>
  );
}

/** Pesan galat seragam: terbaca pembaca layar, tidak berteriak. */
export function PesanKesalahan({
  pesan,
  className,
}: {
  pesan: string;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive",
        className,
      )}
    >
      {pesan}
    </p>
  );
}

/* ==========================================================================
   Medan & tombol alur masuk nasabah
   ========================================================================== */

/**
 * Medan email/WhatsApp. Label di ATAS medan (bukan ikon di dalam medan):
 * dengan begitu padding `px-4` yang diminta tidak bertabrakan dengan ikon,
 * dan petunjuk penting tetap terbaca — alur nomor WhatsApp lama punya
 * tombolnya sendiri di bawah, karena medan ini mengirim kode ke EMAIL.
 */
export function MedanEmailMasuk({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="space-y-2">
      <label
        htmlFor="masuk-email"
        className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
      >
        <Mail className="size-4 text-slate-400" aria-hidden="true" />
        Email atau nomor WhatsApp
      </label>
      <input
        id="masuk-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="nama@contoh.com"
        className={KELAS_INPUT}
        disabled={isLoading}
        required
      />
      <p className="text-xs leading-5 text-slate-500">
        Kode verifikasi dikirim ke email. Peminjam lama yang terdaftar dengan
        nomor WhatsApp: tekan tombol hijau di bawah.
      </p>
    </div>
  );
}

/** Tombol utama: lanjutkan dengan email (mengirim kode 6 digit). */
export function TombolLanjutEmail({ isLoading }: { isLoading: boolean }) {
  return (
    <button
      type="submit"
      className={cn(
        KELAS_TOMBOL_UTAMA,
        "flex items-center justify-center gap-2",
      )}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <ShieldCheck className="size-4" aria-hidden="true" />
      )}
      Lanjutkan dengan Email / WhatsApp
    </button>
  );
}

/**
 * Tombol sekunder khusus PEMINJAM LAMA (data impor web lama): membuka alur
 * klaim nomor WhatsApp, bukan mengirim kode email seperti tombol utama.
 */
export function TombolWhatsappPeminjamLama({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={KELAS_TOMBOL_WA}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      Peminjam lama? Masuk dengan nomor WhatsApp
    </button>
  );
}

/* ==========================================================================
   Kepercayaan & navigasi
   ========================================================================== */

/** Indikator keamanan di dasar kartu: enkripsi + jejak audit. */
export function LencanaKeamanan() {
  return (
    <p className="mt-6 flex items-center justify-center gap-2 border-t border-slate-200/80 pt-4 text-center text-[11px] leading-5 text-slate-500">
      <LockKeyhole
        className="size-3.5 shrink-0 text-emerald-700"
        aria-hidden="true"
      />
      Koneksi Terenkripsi &amp; Dilindungi Audit Trail PINDAI
    </p>
  );
}

/** Navigasi bawah kartu: kembali ke beranda publik. */
export function TautanBeranda() {
  return (
    <Link
      to="/"
      className="group inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-emerald-800"
    >
      <ArrowLeft
        className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5"
        aria-hidden="true"
      />
      Kembali ke Beranda
    </Link>
  );
}
