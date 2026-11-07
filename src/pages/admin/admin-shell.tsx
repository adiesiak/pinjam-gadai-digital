import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CircleDollarSign,
  ClipboardList,
  Coins,
  Info,
  Landmark,
  Loader2,
  Menu,
  Moon,
  Rows3,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router";

import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRupiah } from "@/lib/money";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { VaultLogo } from "@/components/VaultLogo";

export type AdminStatsData = {
  pinjamanBaru: number;
  gadaiProses: number;
  totalPinjaman: number;
  totalGadai: number;
  pinjamanDisetujui: number;
  /** Total pokok pinjaman yang sedang berjalan (sudah didanai). */
  totalPinjamanBerjalan: number;
  /** Total pokok pinjaman yang diajukan (menunggu keputusan). */
  totalPinjamanDiajukan: number;
  /** Keuntungan admin dari pinjaman lunas (sudah dibukukan). */
  keuntunganAdminTercatat: number;
  /** Keuntungan admin dari pinjaman berjalan (belum dibukukan). */
  keuntunganAdminBelumTercatat: number;
  pinjamanTerlambat: number;
  /** Tarif denda harian yang berlaku (% pokok). 0 berarti denda dimatikan. */
  persenDendaKeterlambatan?: number;
  nilaiTaksiranDisetujui: number;
  /** Total pokok gadai yang masih berjalan (sisa pokok, gadai aktif). */
  totalGadaiBerjalan: number;
  /** Total pokok dibiayai kredit barang yang sedang berjalan. */
  totalKreditBerjalan: number;
  gpsMismatch: number;
  /** Pinjaman aktif yang titik GPS-nya kedaluwarsa (lokasi dimatikan). */
  pinjamanTanpaLokasi: number;
  titikDicurigai: number;
  peringatanLokasiAktif: number;
};

/** Layar bootstrap admin pertama — wajib rahasia operator (fail-closed). */
export function BootstrapAdminView({
  busy,
  onActivate,
}: {
  busy: boolean;
  onActivate: (secret: string) => void;
}) {
  const [secret, setSecret] = useState("");
  const siap = secret.trim().length >= 24;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk w-full max-w-md rounded-lg border border-border/60 p-6 sm:p-8">
        <ShieldCheck className="size-5 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Setup tim PINDAI</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Belum ada admin di sistem. Masuk dengan email terverifikasi (bukan
          akun tamu), lalu masukkan rahasia bootstrap operator dari environment{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ADMIN_BOOTSTRAP_SECRET</code>.
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="admin-bootstrap-secret">Rahasia bootstrap</Label>
          <Input
            id="admin-bootstrap-secret"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Minimal 24 karakter"
          />
        </div>
        <Button
          className="mt-4 w-full rounded-full"
          disabled={busy || !siap}
          onClick={() => onActivate(secret.trim())}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Mengaktifkan…
            </>
          ) : (
            <>
              <BadgeCheck className="mr-2 size-4" />
              Aktifkan panel admin
            </>
          )}
        </Button>
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          Tanpa rahasia yang cocok, bootstrap selalu ditolak. Tombol ini hanya
          berfungsi untuk akun email terverifikasi dan hanya selama belum ada
          admin — setelah itu, admin baru hanya bisa ditambahkan oleh admin
          yang ada.
        </p>
      </div>
    </main>
  );
}

/** Layar penolakan akses untuk bukan admin. */
export function NotAdminView() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk max-w-md text-center">
        <ShieldCheck className="mx-auto size-5 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Akses khusus tim</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Halaman ini hanya untuk tim Pinjam Gadai Digital. Silakan kembali
          ke ruang nasabah.
        </p>
        <Button asChild variant="outline" className="mt-6 rounded-full">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 size-4" />
            Ke ruang nasabah
          </Link>
        </Button>
      </div>
    </main>
  );
}

/**
 * Status sistem — satu indikator di kepala panel.
 *
 * Dulu tiga chip (SSL / keseimbangan ledger / backup) mengapung di baris
 * terpisah di atas header, dan salah satunya berbunyi "Ledger". Sekarang satu
 * titik berwarna + popover: titik hijau berarti tidak ada yang perlu dibaca,
 * titik kuning/merah berarti ada keadaan darurat yang harus dilihat. Tiga chip
 * tidak lagi memakan satu baris penuh untuk informasi yang jarang berubah.
 */
export function StatusSistem({
  killSwitch,
  seimbang,
}: {
  /** Pembacaan `system.getStatusPublic`: undefined selama belum termuat. */
  killSwitch: boolean | undefined;
  /** Keseimbangan catatan internal dari `admin.ledgerSummary`. */
  seimbang: boolean | undefined;
}) {
  const adaMasalah = killSwitch === true || seimbang === false;
  const belumTerbaca = killSwitch === undefined || seimbang === undefined;
  const judul = belumTerbaca
    ? "Status sistem: belum terbaca"
    : adaMasalah
      ? "Status sistem: perlu diperiksa"
      : "Status sistem: normal";

  const baris: Array<{
    label: string;
    nilai: string;
    nada: "baik" | "perhatian" | "darurat" | "netral";
  }> = [
    {
      label: "Pengajuan baru",
      nilai:
        killSwitch === undefined
          ? "Belum terbaca"
          : killSwitch
            ? "Diblokir: kill switch aktif"
            : "Dibuka",
      nada: killSwitch === undefined ? "netral" : killSwitch ? "darurat" : "baik",
    },
    {
      label: "Catatan internal",
      nilai: seimbang === undefined ? "Belum terbaca" : seimbang ? "Seimbang" : "Menunggu transaksi",
      nada: seimbang === undefined ? "netral" : seimbang ? "baik" : "perhatian",
    },
  ];
  // Baris "cadangan data" dihapus bersama chip lamanya: tidak ada query yang
  // bisa membuktikan kesiapan backup dari sini, dan klaim "siap" tanpa dasar
  // justru membuat indikator ini tidak bisa dipercaya.

  const nadaTitik = adaMasalah ? "bg-red-500" : belumTerbaca ? "bg-slate-400" : "bg-success";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full gap-2 border-slate-200 text-slate-700 hover:bg-slate-50"
          aria-label={judul}
        >
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${nadaTitik}`} />
          <span className="hidden sm:inline">Status sistem</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-xs font-semibold text-slate-900">Status sistem</p>
        <ul className="mt-2 space-y-1.5">
          {baris.map((b) => (
            <li key={b.label} className="flex items-start justify-between gap-3 text-[11px] leading-5">
              <span className="text-muted-foreground">{b.label}</span>
              <span
                className={`text-right font-medium ${
                  b.nada === "darurat"
                    ? "text-red-700"
                    : b.nada === "perhatian"
                      ? "text-amber-700"
                      : b.nada === "netral"
                        ? "text-slate-600"
                        : "text-success-foreground"
                }`}
              >
                {b.nilai}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-4 text-muted-foreground">
          Kill switch darurat sekarang diatur dari menu Kill Switch di grup Sistem, bukan dari kepala panel.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Kendali menu ponsel: laci menu dipegang `AdminTabs`, tombolnya duduk di sini.
 * Tipenya dipisah supaya tanda tangan prop `header` dan komponen ini tidak bisa
 * menyimpang satu sama lain.
 */
export type KendaliMenuPonsel = {
  /** Laci sedang terbuka? Dipakai tombol untuk `aria-expanded`. */
  terbuka: boolean;
  onToggle: () => void;
};

const KUNCI_TEMA_ADMIN = "pindai.admin.tema";
const KUNCI_PADAT_ADMIN = "pindai.admin.padat";

/** Baca pilihan tampilan dari perangkat; aman saat dirender di luar peramban. */
function bacaTampilanAdmin(): { dim: boolean; padat: boolean } {
  if (typeof window === "undefined") return { dim: false, padat: false };
  try {
    return {
      dim: window.localStorage.getItem(KUNCI_TEMA_ADMIN) === "dim",
      padat: window.localStorage.getItem(KUNCI_PADAT_ADMIN) === "1",
    };
  } catch {
    return { dim: false, padat: false };
  }
}

/**
 * Sakelar tampilan panel: "Dim" menurunkan silau permukaan, "Padat" merapatkan
 * jarak kartu dan baris tabel untuk layar kerja yang panjang.
 *
 * Nilainya disimpan per perangkat dan diterapkan sebagai atribut di `<html>`;
 * CSS-nya dibatasi `.admin-shell`, jadi ruang nasabah dan pendana tidak ikut
 * berubah. Tombol tetap 44px di ponsel dan status aktif ditulis sebagai teks,
 * bukan hanya warna.
 */
function TampilanAdmin() {
  const awal = bacaTampilanAdmin();
  const [dim, setDim] = useState(awal.dim);
  const [padat, setPadat] = useState(awal.padat);

  useEffect(() => {
    const akar = document.documentElement;
    akar.dataset.adminTema = dim ? "dim" : "terang";
    akar.dataset.adminPadat = padat ? "padat" : "lega";
    try {
      window.localStorage.setItem(KUNCI_TEMA_ADMIN, dim ? "dim" : "terang");
      window.localStorage.setItem(KUNCI_PADAT_ADMIN, padat ? "1" : "0");
    } catch {
      // Penyimpanan bisa diblokir mode privat; tampilan tetap berlaku sesi ini.
    }
    return () => {
      delete akar.dataset.adminTema;
      delete akar.dataset.adminPadat;
    };
  }, [dim, padat]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="outline"
          className="rounded-full border-slate-200 text-slate-700 hover:bg-slate-50"
          aria-label="Tampilan panel admin"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="text-sm font-semibold text-slate-900">Tampilan panel</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Tersimpan di perangkat ini dan hanya berlaku di panel admin.
        </p>
        <div className="mt-3 space-y-1">
          <button
            type="button"
            role="switch"
            aria-checked={dim}
            onClick={() => setDim((sebelumnya) => !sebelumnya)}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Moon className="size-4 shrink-0 text-slate-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">Dim</span>
              <span className="block text-xs text-muted-foreground">Kurangi silau permukaan</span>
            </span>
            <span className="text-xs font-semibold text-slate-600">{dim ? "Aktif" : "Mati"}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={padat}
            onClick={() => setPadat((sebelumnya) => !sebelumnya)}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Rows3 className="size-4 shrink-0 text-slate-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">Padat</span>
              <span className="block text-xs text-muted-foreground">Rapatkan kartu dan baris tabel</span>
            </span>
            <span className="text-xs font-semibold text-slate-600">{padat ? "Aktif" : "Mati"}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Kepala panel admin — duduk di kolom KONTEN, bukan di atas sidebar.
 *
 * Isinya sengaja sedikit: breadcrumb kelompok/modul, lonceng notifikasi, satu
 * indikator status sistem, dan menu profil berisi identitas (beralih ke mode
 * nasabah / keluar). Tombol kill switch DIKELUARKAN dari sini: tindakan darurat
 * semacam itu tidak boleh menjadi tombol paling mudah dijangkau di kepala panel.
 *
 * Tombol menu hanya tampil di bawah `lg`, tempat kolom sidebar tidak dirender.
 * Ia tanpa label teks karena tujuan utama ponsel tetap terlihat di bilah bawah —
 * yang tersembunyi di baliknya hanya daftar menu lengkap.
 */
export function AdminHeader({
  judul,
  grup = "Panel operasional",
  killSwitch,
  seimbang,
  menuPonsel,
}: {
  /** Label modul yang sedang dibuka — dipakai breadcrumb. */
  judul: string;
  /** Kelompok menu induk, mis. "Operasional" atau "Pemantauan". */
  grup?: string;
  killSwitch: boolean | undefined;
  seimbang: boolean | undefined;
  menuPonsel: KendaliMenuPonsel;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <div className="flex min-h-14 w-full items-center justify-between gap-2 px-3 py-1.5 sm:min-h-16 sm:px-6 sm:py-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={menuPonsel.onToggle}
            aria-expanded={menuPonsel.terbuka}
            aria-label={menuPonsel.terbuka ? "Tutup menu" : "Buka menu"}
            aria-controls={menuPonsel.terbuka ? "menu-panel-admin" : undefined}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <VaultLogo
            size={40}
            className="hidden size-9 shrink-0 sm:block sm:size-10 lg:hidden"
          />
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {/* Di ponsel, hanya modul aktif yang perlu tampil. Kelompok menu
                  memakan lebar yang dibutuhkan tombol kanan. */}
              <li className="hidden shrink-0 sm:block">{grup}</li>
              <li aria-hidden className="hidden shrink-0 sm:block">
                /
              </li>
              <li className="min-w-0 truncate text-sm font-semibold text-slate-900">{judul}</li>
            </ol>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Lonceng yang sama dengan dashboard nasabah: sumbernya catatan milik
              pengguna yang sedang masuk, jadi tidak ada notifikasi orang lain. */}
          <NotificationBell />
          <TampilanAdmin />
          <StatusSistem killSwitch={killSwitch} seimbang={seimbang} />
          {/* Menu profil: pintu keluar dan perpindahan ke mode nasabah ada di
              dalamnya, jadi kepala panel tidak penuh tombol. */}
          <RoleDashboardMenu />
        </div>
      </div>
    </header>
  );
}

/** Produk yang punya angka "sedang berjalan" dan antrean pengajuan. */
export type ProdukAdmin = "pinjaman" | "gadai" | "kredit";

const NAMA_PRODUK: Record<ProdukAdmin, string> = {
  pinjaman: "Pinjaman tunai",
  gadai: "Gadai barang",
  kredit: "Kredit barang",
};

/**
 * Empat KPI seragam + SATU bar filter produk.
 *
 * Sebelumnya pinjaman/gadai/kredit dipilih lewat tab DI DALAM satu kartu judul,
 * jadi hanya satu kartu yang punya slot angka dan dua kartu lain berdiri timpang.
 * Sekarang filternya satu bar di atas empat kartu berbobot sama — dua di antaranya
 * (sedang berjalan & menunggu keputusan) mengikuti produk yang dipilih, sisanya
 * angka global yang memang tidak dipecah per produk, dan itu ditulis di kartunya.
 */
export function AdminStats({
  stats,
  menunggu,
}: {
  stats: AdminStatsData;
  /** Cacah pengajuan yang belum diputuskan, per produk (dari `hitungMenunggu`). */
  menunggu: Record<ProdukAdmin, number>;
}) {
  const [produk, setProduk] = useState<ProdukAdmin>("pinjaman");

  const berjalan: Record<ProdukAdmin, number> = {
    pinjaman: stats.totalPinjamanBerjalan,
    gadai: stats.totalGadaiBerjalan,
    kredit: stats.totalKreditBerjalan,
  };

  const kartu = [
    {
      key: "berjalan",
      label: `Sedang berjalan: ${NAMA_PRODUK[produk]}`,
      nilai: berjalan[produk],
      rupiah: true,
      Icon: CircleDollarSign,
      catatan: null as string | null,
    },
    {
      key: "menunggu",
      label: `Menunggu keputusan: ${NAMA_PRODUK[produk]}`,
      nilai: menunggu[produk],
      rupiah: false,
      Icon: ClipboardList,
      catatan: null as string | null,
    },
    {
      key: "terlambat",
      label: "Pinjaman lewat jatuh tempo",
      nilai: stats.pinjamanTerlambat,
      rupiah: false,
      Icon: Landmark,
      // Angka ini memang hanya pinjaman tunai — beda produk punya menu sendiri,
      // jadi keterangannya ditulis, bukan dibiarkan tampak berlaku untuk semua.
      catatan: "Hanya pinjaman tunai; gadai & kredit ada di menunya sendiri.",
    },
  ] as const;

  return (
    <section aria-label="Statistik operasional" className="mt-5">
      {/* Satu bar filter produk untuk seluruh ringkasan — bukan tab di dalam kartu. */}
      <div role="group" aria-label="Saring produk" className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Produk</span>
        {(Object.keys(NAMA_PRODUK) as ProdukAdmin[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={produk === id}
            onClick={() => setProduk(id)}
            className={`min-h-9 rounded-xl border px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              produk === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-slate-600 hover:border-primary/40 hover:text-primary"
            }`}
          >
            {NAMA_PRODUK[id].split(" ")[0]}
          </button>
        ))}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {kartu.map(({ key, label, nilai, rupiah, Icon, catatan }) => (
          <motion.div
            key={key}
            variants={fadeUpItem}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${
              key === "terlambat" && nilai > 0 ? "border-amber-200" : "border-slate-200/80"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 break-words text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">
              <CountUp value={nilai} format={rupiah ? formatRupiah : undefined} />
            </p>
            {catatan !== null && (
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{catatan}</p>
            )}
          </motion.div>
        ))}

        {/* Keuntungan admin: SATU kartu dua baris + tooltip yang menjelaskan
            bedanya "tercatat" dan "belum tercatat" — bukan dua kartu berbeda. */}
        <motion.div
          variants={fadeUpItem}
          className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium leading-5 text-muted-foreground">Keuntungan admin</p>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Apa bedanya tercatat dan belum tercatat?"
                    className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
                  >
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-[11px] leading-5">
                  Tercatat = bagian admin dari pinjaman yang sudah lunas dan sudah
                  dibukukan. Belum tercatat = bagian dari pinjaman yang masih berjalan;
                  angkanya masih bisa berubah sampai pelunasan.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <dl className="mt-2 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Coins className="size-3.5" aria-hidden /> Tercatat
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900">
                <CountUp value={stats.keuntunganAdminTercatat} format={formatRupiah} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <BadgeCheck className="size-3.5" aria-hidden /> Belum tercatat
              </dt>
              <dd className="text-sm font-medium tabular-nums text-slate-600">
                <CountUp value={stats.keuntunganAdminBelumTercatat} format={formatRupiah} />
              </dd>
            </div>
          </dl>
        </motion.div>
      </motion.div>
    </section>
  );
}
