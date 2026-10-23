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
  Check,
  Circle,
  ClipboardPaste,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LockKeyhole,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  Timer,
  Vault,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHitungMundur } from "@/hooks/use-hitung-mundur";
import {
  MASA_BERLAKU_TOKEN_DETIK,
  PANJANG_TOKEN_ADMIN,
  bersihkanToken,
  formatSisaToken,
  nilaiKekuatanSandi,
} from "@/lib/authAdmin";
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

/**
 * Kartu jalur SUPER ADMIN: sedikit lebih tegas (opasitas & bayangan lebih
 * tinggi) karena formulirnya lebih panjang dan berisi token rahasia — kartu
 * harus terbaca sebagai satu bidang utuh, bukan tembus pandang.
 */
export const KELAS_KARTU_ADMIN =
  "bg-white/90 backdrop-blur-xl border border-white/90 shadow-2xl rounded-3xl p-8 max-w-md w-full";

/** Medan administratif: cincin fokus emerald-600 (lebih tegas dari jalur nasabah). */
export const KELAS_INPUT_ADMIN =
  "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

/** Tombol aksi utama jalur admin: hijau PINDAI, jelas aktif/nonaktif. */
export const KELAS_TOMBOL_ADMIN =
  "w-full mt-4 bg-[#064E3B] hover:bg-[#042F2E] text-white font-medium py-3 rounded-xl shadow-md transition-all active:scale-[0.98] flex justify-center items-center gap-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100";

/** Tautan kecil di dalam kartu admin (Aktivasi password, Lupa kata sandi). */
export const KELAS_TAUTAN_ADMIN =
  "text-xs font-medium text-emerald-800 underline-offset-2 transition-colors hover:text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50";

/** Medan input bersih dengan fokus emerald. */
export const KELAS_INPUT =
  "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

/** Tombol aksi utama kartu (email / WhatsApp → kode verifikasi). */
export const KELAS_TOMBOL_UTAMA =
  "w-full mt-3 bg-[#064E3B] hover:bg-[#042F2E] text-white font-medium py-3 rounded-xl shadow-md transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Tombol pintu GOOGLE: bidang putih bergaris, lebih tenang daripada tombol
 * utama supaya email tetap terbaca sebagai jalur pertama. Membawa lambang
 * resmi Google; teks `slate-700` di atas putih ≈ 9,9:1, jadi tetap lolos
 * kontras WCAG AA.
 */
export const KELAS_TOMBOL_GOOGLE =
  "w-full py-3 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium flex items-center justify-center gap-2 transition-all mt-3 shadow-xs active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

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

/** Kartu formulir bergaya glassmorphism; jalur admin pakai varian yang lebih tegas. */
export function KartuAuth({
  children,
  varian = "nasabah",
}: {
  children: ReactNode;
  varian?: "nasabah" | "admin";
}) {
  return (
    <div className={varian === "admin" ? KELAS_KARTU_ADMIN : KELAS_KARTU}>
      {children}
    </div>
  );
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
        aria-label="PINDAI, kembali ke beranda"
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

      <ul className="mt-5 grid w-full grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white text-center shadow-xs">
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
 *
 * Tab AKTIF memakai pasangan yang sama dengan panel lain — `bg-primary` +
 * `text-primary-foreground` (10,9:1 di preset bawaan). Sebelumnya kelas di
 * sini menulis `bg-white text-emerald-900`: latar putihnya memang tidak pernah
 * terpakai karena aturan `[data-slot="tabs-trigger"][data-state="active"]` di
 * `src/index.css` memaksa latar `--primary`, sementara teks cokelat gelapnya
 * BENAR-BENAR diwariskan ke atas hijau #0f3d3a — 1:1, jadi hurufnya tenggelam.
 * Label pasif memakai `slate-600` (5,7:1 di atas track kertas) karena
 * `slate-500` hanya 3,8:1, di bawah ambang 4,5:1 untuk teks 14px.
 */
export function TabPintuMasuk() {
  return (
    <TabsList
      aria-label="Pilihan cara masuk"
      className="grid h-11 w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1"
    >
      <TabsTrigger
        value={TAB_MASUK}
        className="h-9 w-full gap-1.5 rounded-xl text-sm font-semibold text-slate-600 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
      >
        <LogIn className="size-4" aria-hidden="true" />
        Masuk Akun
      </TabsTrigger>
      <TabsTrigger
        value={TAB_CEPAT}
        className="h-9 w-full gap-1.5 rounded-xl text-sm font-semibold text-slate-600 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
      >
        <Zap className="size-4" aria-hidden="true" />
        Akses Cepat
      </TabsTrigger>
    </TabsList>
  );
}

/* ==========================================================================
   Jalur SUPER ADMIN — badge, medan, meter sandi, token, tombol
   ========================================================================== */

/** Badge keamanan di atas header jalur admin (semua langkah admin). */
export function BadgeAksesAdmin() {
  return (
    <span className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-200/50 mb-3 inline-flex items-center gap-1.5">
      <Lock className="size-3.5" aria-hidden="true" />
      Akses Super Admin Terproteksi
    </span>
  );
}

/**
 * Medan administratif (email/kata sandi). Untuk kata sandi, tombol mata ada DI
 * DALAM kolom: admin sering memeriksa ulang token & kata sandi yang panjang,
 * dan menyembunyikan/menampilkan tanpa kehilangan fokus lebih aman daripada
 * membiarkannya selalu tersembunyi sehingga salah ketik tak terlihat.
 */
export function MedanAdmin({
  id,
  label,
  nilai,
  onUbah,
  tipe = "text",
  autoComplete,
  placeholder,
  petunjuk,
  minPanjang,
  nonaktif,
}: {
  id: string;
  label: string;
  nilai: string;
  onUbah: (nilai: string) => void;
  tipe?: "text" | "email" | "password";
  autoComplete?: string;
  placeholder?: string;
  petunjuk?: ReactNode;
  /** Panjang minimal versi peramban; aturan sesungguhnya tetap di server. */
  minPanjang?: number;
  nonaktif: boolean;
}) {
  const [terlihat, setTerlihat] = useState(false);
  const kataSandi = tipe === "password";
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className={kataSandi ? "relative" : undefined}>
        <input
          id={id}
          type={
            kataSandi && !terlihat
              ? "password"
              : tipe === "password"
                ? "text"
                : tipe
          }
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={nilai}
          onChange={(event) => onUbah(event.target.value)}
          className={cn(KELAS_INPUT_ADMIN, kataSandi && "pr-12")}
          minLength={minPanjang}
          disabled={nonaktif}
          required
        />
        {kataSandi && (
          <button
            type="button"
            onClick={() => setTerlihat((sebelumnya) => !sebelumnya)}
            aria-label={
              terlihat ? "Sembunyikan kata sandi" : "Lihat kata sandi"
            }
            aria-pressed={terlihat}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-400 transition-colors hover:text-emerald-800"
          >
            {terlihat ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {petunjuk !== undefined && (
        <p className="text-xs leading-5 text-slate-500">{petunjuk}</p>
      )}
    </div>
  );
}

/**
 * Meter kekuatan kata sandi + checklist syarat.
 *
 * Warna mengikuti tingkat: merah (Lemah), kuning (Sedang), emerald (Sangat
 * Kuat). Kedua butir checklist dihitung oleh `nilaiKekuatanSandi` — sumber yang
 * sama dengan bar-nya, sehingga label dan warna tak mungkin berbeda pendapat.
 * Meter ini MENYARANKAN, bukan mengunci: tombol kirim hanya mengikuti syarat
 * server (8+ karakter) + konfirmasi cocok, supaya kata sandi sah tidak tertahan
 * karena meternya belum hijau.
 */
export function MeterKekuatanSandi({ sandi }: { sandi: string }) {
  const nilai = nilaiKekuatanSandi(sandi);
  return (
    <div className="mt-2 space-y-2">
      <div
        role="progressbar"
        aria-label="Kekuatan kata sandi"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={nilai.skor}
        aria-valuetext={nilai.label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            WARNA_KEKUATAN[nilai.tingkat].bar,
          )}
          style={{ width: `${PERSEN_KEKUATAN[nilai.skor]}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span
          className={cn(
            "text-xs font-semibold",
            WARNA_KEKUATAN[nilai.tingkat].teks,
          )}
        >
          Kekuatan: {nilai.label}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
          <SyaratSandi terpenuhi={nilai.panjangCukup} label="8+ Karakter" />
          <span aria-hidden="true" className="text-slate-300">
            •
          </span>
          <SyaratSandi
            terpenuhi={nilai.adaHurufBesar && nilai.adaAngkaAtauSimbol}
            label="Huruf Besar & Angka/Simbol"
          />
        </span>
      </div>
    </div>
  );
}

const PERSEN_KEKUATAN: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 33,
  2: 66,
  3: 100,
};

const WARNA_KEKUATAN: Record<
  ReturnType<typeof nilaiKekuatanSandi>["tingkat"],
  { bar: string; teks: string }
> = {
  kosong: { bar: "bg-slate-300", teks: "text-slate-500" },
  lemah: { bar: "bg-red-500", teks: "text-red-600" },
  sedang: { bar: "bg-amber-400", teks: "text-amber-600" },
  "sangat-kuat": { bar: "bg-emerald-600", teks: "text-emerald-700" },
};

/** Satu butir checklist syarat kata sandi. */
function SyaratSandi({
  terpenuhi,
  label,
}: {
  terpenuhi: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors",
        terpenuhi
          ? "bg-emerald-50 text-emerald-800"
          : "bg-slate-100 text-slate-500",
      )}
    >
      {terpenuhi ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <Circle className="size-3" aria-hidden="true" />
      )}
      {label}
      <span className="sr-only">
        {terpenuhi ? " (terpenuhi)" : " (belum terpenuhi)"}
      </span>
    </span>
  );
}

/**
 * Medan token verifikasi 32 karakter.
 *
 * Tiga kemudahan yang sengaja digabung: font monospace agar karakter serupa
 * (0/O, 1/l) mudah dibedakan, tombol [Tempel Token] sekali klik, dan
 * pembersihan otomatis — semua jalur (ketik, tempel via tombol, tempel via
 * papan klip sistem) melewati `bersihkanToken`, jadi spasi/baris baru dari
 * email tidak pernah ikut menjadi bagian token.
 */
export function MedanTokenAdmin({
  nilai,
  onUbah,
  nonaktif,
}: {
  nilai: string;
  onUbah: (nilai: string) => void;
  nonaktif: boolean;
}) {
  const [galatTempel, setGalatTempel] = useState<string | null>(null);

  const tempel = async () => {
    setGalatTempel(null);
    if (
      typeof navigator === "undefined" ||
      navigator.clipboard?.readText === undefined
    ) {
      setGalatTempel(
        "Papan klip tidak tersedia di peramban ini; tempel manual (Ctrl/Cmd + V).",
      );
      return;
    }
    try {
      const teks = await navigator.clipboard.readText();
      const bersih = bersihkanToken(teks);
      if (bersih === "") {
        setGalatTempel(
          "Papan klip tidak berisi token; salin token dari email lebih dulu.",
        );
        return;
      }
      onUbah(bersih);
    } catch {
      setGalatTempel(
        "Tidak diizinkan membaca papan klip; tempel manual (Ctrl/Cmd + V).",
      );
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor="admin-verification-token"
        className="text-sm font-medium text-slate-700"
      >
        Token verifikasi (32 karakter)
      </label>
      {/* `min-w-0` pada medan token: tanpa itu medan monospace ini menolak
          menyusut di bawah lebar bawaan peramban (≈240px), sedangkan tombol
          "Tempel Token" di sebelahnya `shrink-0` — barisnya lalu melampaui
          tepi kartu dan tombolnya terpotong di layar 360px. */}
      <div className="flex items-stretch gap-2">
        <input
          id="admin-verification-token"
          aria-label="Token verifikasi admin 32 karakter"
          autoComplete="one-time-code"
          maxLength={PANJANG_TOKEN_ADMIN}
          placeholder="Tempel token dari email di sini"
          value={nilai}
          onChange={(event) => onUbah(bersihkanToken(event.target.value))}
          disabled={nonaktif}
          className={cn(
            KELAS_INPUT_ADMIN,
            "font-mono tracking-wider bg-slate-50/80 min-w-0",
          )}
          required
        />
        <button
          type="button"
          onClick={() => void tempel()}
          disabled={nonaktif}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-all hover:border-emerald-600/40 hover:bg-emerald-50/60 hover:text-emerald-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ClipboardPaste className="size-4" aria-hidden="true" />
          Tempel Token
        </button>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        {nilai.length}/{PANJANG_TOKEN_ADMIN} karakter · spasi &amp; baris baru
        otomatis dibuang · huruf besar/kecil harus sama seperti di email.
      </p>
      {galatTempel !== null && (
        <p role="status" className="text-xs leading-5 text-amber-700">
          {galatTempel}
        </p>
      )}
    </div>
  );
}

/**
 * Hitung mundur masa berlaku token + tombol kirim ulang.
 *
 * Tombol hanya aktif SETELAH masa berlaku habis: mengirim ulang lebih awal
 * hanya menghabiskan kuota permintaan token di server (batas 15 menit), dan
 * token lama tetap berlaku sampai kedaluwarsa — jadi tidak ada gunanya.
 */
export function HitungMundurToken({
  mulaiPada,
  onKirimUlang,
  sibuk,
}: {
  /** Epoch ms saat token terakhir dikirim; `null` = tidak ada token aktif. */
  mulaiPada: number | null;
  onKirimUlang: () => void;
  sibuk: boolean;
}) {
  const sisa = useHitungMundur(mulaiPada, MASA_BERLAKU_TOKEN_DETIK);
  if (sisa === null) return null;
  const habis = sisa === 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <Timer
          className="size-3.5 shrink-0 text-emerald-700"
          aria-hidden="true"
        />
        Token berlaku:{" "}
        <span
          className={cn(
            "font-mono font-semibold tabular-nums",
            habis ? "text-red-600" : "text-slate-800",
          )}
        >
          {formatSisaToken(sisa)}
        </span>
      </p>
      <button
        type="button"
        onClick={onKirimUlang}
        disabled={!habis || sibuk}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all active:scale-[0.98]",
          habis
            ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "cursor-not-allowed text-slate-400",
        )}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Kirim Ulang Token
      </button>
    </div>
  );
}

/** Tombol aksi utama jalur admin: spinner menggantikan ikon saat memproses. */
export function TombolAdmin({
  memuat,
  nonaktif,
  ikon,
  children,
}: {
  memuat: boolean;
  nonaktif: boolean;
  ikon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={KELAS_TOMBOL_ADMIN}
      disabled={memuat || nonaktif}
    >
      {memuat ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        ikon
      )}
      {children}
    </button>
  );
}

/** Navigasi antar-langkah admin tanpa memuat ulang halaman. */
export function TombolKembaliAdmin({
  onClick,
  nonaktif,
  tujuan = "Login Admin",
}: {
  onClick: () => void;
  nonaktif: boolean;
  tujuan?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={nonaktif}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent py-2.5 text-sm font-medium text-slate-500 transition-all hover:bg-slate-100/80 hover:text-emerald-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Kembali ke {tujuan}
    </button>
  );
}

/** Catatan informasi (bukan galat) di dalam kartu. */
export function PesanInfo({
  pesan,
  className,
}: {
  pesan: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-sm leading-5 text-emerald-900",
        className,
      )}
    >
      {pesan}
    </p>
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
 * Medan masuk TUNGGAL: email atau nomor WhatsApp dalam satu kolom.
 *
 * Label di ATAS medan (bukan ikon di dalam medan) supaya padding `px-4` yang
 * diminta tidak bertabrakan dengan ikon, dan petunjuk penting tetap terbaca.
 *
 * `type="text"`, bukan `email`: validasi bawaan peramban untuk `type="email"`
 * menolak nomor telepon SEBELUM formulir sempat dikirim, padahal nomor itulah
 * pintu peminjam lama maupun pendaftar baru. Jalur email atau WhatsApp
 * ditentukan `lib/masukKredensial.ts` di sisi halaman, bukan oleh peramban.
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
        type="text"
        autoComplete="username"
        placeholder="nama@contoh.com atau 08123456789"
        className={KELAS_INPUT}
        disabled={isLoading}
        required
      />
      <p className="text-xs leading-5 text-slate-500">
        Kode dikirim ke email Anda, atau ke WhatsApp bila yang Anda isi nomor.
        Nomor baru maupun nomor dari web PINDAI lama bisa masuk di sini;
        riwayat nomor lama ikut dipulihkan. Pendana memakai nomor yang sudah
        didaftarkan pada akun pendananya.
      </p>
    </div>
  );
}

/**
 * Tombol utama: mengirim kode verifikasi 6 angka — ke email, atau ke WhatsApp
 * bila medan di atasnya berisi nomor.
 *
 * Labelnya sengaja pendek dan dijaga satu baris (`whitespace-nowrap`). Jalur
 * email maupun WhatsApp sudah dijelaskan medan beserta petunjuknya di atas
 * tombol, sedangkan label panjang "Lanjutkan dengan Email / WhatsApp"
 * membungkus jadi dua baris di layar 360px sehingga tombolnya terbaca penuh
 * dan kotak ketuknya terlihat sempit. Ikonnya `size-5`, seukuran dengan huruf
 * labelnya, supaya tidak terlihat mengambang kecil di tepi kiri.
 */
export function TombolLanjutEmail({ isLoading }: { isLoading: boolean }) {
  return (
    <button
      type="submit"
      className={cn(
        KELAS_TOMBOL_UTAMA,
        "flex items-center justify-center gap-2 whitespace-nowrap",
      )}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      ) : (
        <ShieldCheck className="size-5" aria-hidden="true" />
      )}
      Kirim kode verifikasi
    </button>
  );
}

/**
 * Lambang Google resmi (versi empat warna standar, tidak diwarnai ulang) —
 * dipakai apa adanya sesuai pedoman merek Google. Murni hias: label tombolnya
 * sudah menyebut penyedianya, jadi tidak perlu dibacakan pembaca layar.
 */
function LambangGoogle() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-5 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
    </svg>
  );
}

/**
 * Tombol pintu GOOGLE.
 *
 * Jalur nomor WhatsApp ditangani medan masuk bersama (peminjam lama maupun
 * baru); di sini yang dibuktikan adalah EMAIL yang sudah diverifikasi Google, dan
 * akun lama ber-email terverifikasi otomatis memakai sesi akun itu (lihat
 * `convex/auth/google.ts`) — jadi tidak ada akun kosong kedua.
 */
export function TombolGoogle({
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
      className={KELAS_TOMBOL_GOOGLE}
    >
      <LambangGoogle />
      Masuk dengan Google
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
