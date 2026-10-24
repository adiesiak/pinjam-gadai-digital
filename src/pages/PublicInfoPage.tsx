import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MenuInformasiPonsel } from "@/components/MenuInformasiPonsel";
import { api } from "@/convex/_generated/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VaultLogo } from "@/components/VaultLogo";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { formatRupiah } from "@/lib/money";
import {
  quoteLoanBunga,
  LOAN_LIMITS,
  persenBungaHarian,
  sesuaikanTenorHarian,
  TENOR_OPTIONS,
  tenorHarianDefault,
  tenorHarianTersedia,
  LATE_FEE_POLICY,
  PINDAI_PRICING,
  tarifBiayaAman,
  type TarifBiaya,
} from "@/lib/loan";
import {
  adaBiayaEkspres,
  persenTeks,
  rentangEkspres,
  rincianPotonganDiMuka,
} from "@/lib/tarifBiayaTeks";
import {
  hitungSimulasiBulanan,
  tarifBulananAman,
  TENOR_BULANAN_OPTIONS,
  BULANAN_LIMITS,
  BULANAN_PRICING,
  persenBungaPerBulan,
  type TarifBulanan,
} from "@/lib/bulanan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GADAI_PRICING, quoteGadai } from "@/lib/gadai";
import { KREDIT_BARANG_POKOK_MAKS } from "@/lib/kredit";
import { LOKASI_KEBIJAKAN } from "@/lib/lokasi";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import { MAX_FILE_BYTES, GAMBAR_DITERIMA } from "@/lib/kyc";

/**
 * FAQ disusun dari tarif yang berlaku supaya jawaban denda tidak lagi ditulis
 * tetap: angka di halaman ini harus sama dengan yang dipakai mesin pinjaman.
 */
/** Menu ponsel: satu daftar untuk tombol pemicu di header. */
const TAUTAN_MENU = [
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai" },
  { href: "/layanan/gadai", label: "Gadai" },
  { href: "/layanan/kredit-barang", label: "Kredit barang" },
  { href: "/biaya", label: "Biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "FAQ" },
  { href: "/aplikasi", label: "Aplikasi Android" },
] as const;

function daftarFaq(
  dendaPerHari: number,
  maksDenda: number,
  tarif: TarifBiaya,
  tarifBulanan: TarifBulanan,
) {
  return [
  {
    q: "Apakah PINDAI mengirim uang ke rekening saya?",
    a: "Tidak. PINDAI mencatat pengajuan, perhitungan, dan status di aplikasi. Perpindahan dana ditangani di luar aplikasi; belum ada penyedia pembayaran yang terhubung.",
  },
  {
    q: "Dari mana angka pada kalkulator berasal?",
    a: "Kalkulator memakai nominal dan tenor yang dipilih serta aturan biaya yang digunakan aplikasi. Hasilnya adalah ilustrasi pencatatan, bukan persetujuan atau janji pencairan.",
  },
  {
    q: "Kapan biaya pinjaman dipotong?",
    a: `Potongan di muka: ${rincianPotonganDiMuka(tarif)}, dihitung dari pokok. Setiap pembayaran bulanan juga dikenai biaya admin cicilan ${persenTeks(tarifBulanan.persenBiayaAdminCicilanBulanan)} dari nominal cicilan.`,
  },
  {
    q: "Apa yang dicatat untuk gadai?",
    a: "Aplikasi mencatat deskripsi barang, nilai taksiran, pokok, sewa modal, dan status. Pemeriksaan fisik, penitipan, dan pelelangan barang ditangani di luar aplikasi.",
  },
  {
    q: "Bagaimana status pengajuan ditentukan?",
    a: "Tim PINDAI meninjau pengajuan dan mencatat perubahan status. Status di dashboard adalah catatan aplikasi; persetujuan bukan jaminan pencairan dana.",
  },
  {
    q: "Apakah ada denda jika terlambat?",
    a: `Perhitungan pinjaman tunai menetapkan denda ${dendaPerHari}% per hari dari pokok, maksimum ${maksDenda}% dari pokok. Periksa rincian pengajuan dan perjanjian Anda.`,
  },
  {
    q: "Siapa yang dapat melihat data pengajuan?",
    a: "Informasi akun dan pengajuan tidak ditampilkan ke publik. Data dapat diakses akun terkait dan tim PINDAI; akses pendana, bila diberikan, dibatasi. Rincian lengkap ada di Syarat & Ketentuan.",
  },
  ];
}

const ROUTES = [
  "/biaya",
  "/cara-kerja",
  "/layanan/pinjaman-tunai",
  "/layanan/gadai",
  "/layanan/kredit-barang",
  "/keamanan",
  "/faq",
] as const;

function Header() {
  const { pathname } = useLocation();
  const aktif = (href: string) => pathname === href;
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5"
          aria-label="Kembali ke beranda PINDAI"
        >
          <VaultLogo size={32} />
          <span className="text-sm font-semibold tracking-[0.16em]">
            PINDAI
          </span>
        </Link>
        <nav
          aria-label="Navigasi informasi"
          className="hidden flex-wrap items-center gap-4 text-sm text-slate-600 lg:flex"
        >
          {[
            { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai" },
            { href: "/layanan/gadai", label: "Gadai" },
            { href: "/layanan/kredit-barang", label: "Kredit barang" },
            { href: "/biaya", label: "Biaya" },
            { href: "/cara-kerja", label: "Cara kerja" },
            { href: "/keamanan", label: "Keamanan" },
          ].map((tautan) => (
            <Link
              key={tautan.href}
              to={tautan.href}
              aria-current={aktif(tautan.href) ? "page" : undefined}
              className={
                aktif(tautan.href)
                  ? "font-semibold text-emerald-900 underline decoration-2 underline-offset-8"
                  : "hover:text-emerald-900"
              }
            >
              {tautan.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <MenuInformasiPonsel
            tautan={TAUTAN_MENU.map((tautan) => ({
              ...tautan,
              aktif: aktif(tautan.href),
            }))}
            kelasTombol="flex size-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
            kelasPanel="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg"
            kelasTautan="rounded-lg px-3 py-3 hover:bg-slate-50"
            kelasTautanAktif="bg-emerald-50 font-semibold text-emerald-900"
          />
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/">Beranda</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * Kalkulator publik memakai tarif yang sama dengan mesin pengajuan
 * (`system.getKetentuanBiaya`): potongan di muka dan tarif bulanan per tenor.
 * Bunga bulanan TIDAK dipatok 30% untuk semua tenor — 3 dan 6 bulan memakai
 * tarifnya sendiri, sama seperti tabel di halaman ini.
 */
function KalkulatorRingkas({
  tarifBulanan,
  tarif,
}: {
  /** Tarif bulanan dari Pengaturan Parameter Bisnis. */
  tarifBulanan: TarifBulanan;
  /** Tarif potongan di muka dari Pengaturan Parameter Bisnis. */
  tarif: TarifBiaya;
}) {
  const [pokokHarian, setPokokHarian] = useState(500_000);
  const [tenorHarian, setTenorHarian] =
    useState<(typeof TENOR_OPTIONS)[number]>(tenorHarianDefault(500_000));
  const [pokokGadai, setPokokGadai] = useState(1_000_000);
  const [pokokBulanan, setPokokBulanan] = useState(1_000_000);
  const [tenorBulanan, setTenorBulanan] =
    useState<(typeof TENOR_BULANAN_OPTIONS)[number]>(3);
  const tenorHarianEfektif = sesuaikanTenorHarian(pokokHarian, tenorHarian);
  const tenorHarianOpsi = tenorHarianTersedia(pokokHarian);
  const tarifHarian =
    persenBungaHarian(pokokHarian, tenorHarianEfektif) ?? PINDAI_PRICING.bungaPercent;
  const simulasiHarian = useMemo(() => {
    if (
      !Number.isSafeInteger(pokokHarian) ||
      pokokHarian < LOAN_LIMITS.minPokok ||
      pokokHarian > LOAN_LIMITS.maxPokok
    )
      return null;
    try {
      return quoteLoanBunga(pokokHarian, tarifHarian, { tarif });
    } catch {
      return null;
    }
  }, [pokokHarian, tarifHarian, tarif]);

  // Nominal berubah → tenor dan tarif ikut menyesuaikan tanpa menunggu submit.
  const pilihPokokHarian = (nilai: number) => {
    setPokokHarian(nilai);
    setTenorHarian(sesuaikanTenorHarian(nilai, tenorHarianEfektif));
  };
  const simulasiBulanan = useMemo(() => {
    try {
      return hitungSimulasiBulanan(pokokBulanan, tenorBulanan, {
        tarif: tarifBulanan,
      });
    } catch {
      return null;
    }
  }, [pokokBulanan, tenorBulanan, tarifBulanan]);
  const simulasiGadai = useMemo(() => {
    try {
      return quoteGadai(pokokGadai, GADAI_PRICING.sewaModalMinPercent);
    } catch {
      return null;
    }
  }, [pokokGadai]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Pinjaman harian</h3>
          <span className="text-xs text-slate-500">
            {formatRupiah(LOAN_LIMITS.minPokok)} sampai{" "}
            {formatRupiah(LOAN_LIMITS.maxPokok)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="pokok-harian">Pokok pinjaman (Rp)</Label>
            <Input
              id="pokok-harian"
              type="number"
              inputMode="numeric"
              min={LOAN_LIMITS.minPokok}
              max={LOAN_LIMITS.maxPokok}
              step={10_000}
              value={pokokHarian}
              onChange={(event) => pilihPokokHarian(Number(event.target.value))}
              className="mt-1 min-h-11"
            />
          </div>
          <div>
            <Label htmlFor="tenor-harian">Tenor</Label>
            <select
              id="tenor-harian"
              value={tenorHarianEfektif}
              onChange={(event) =>
                setTenorHarian(
                  Number(event.target.value) as (typeof TENOR_OPTIONS)[number],
                )
              }
              className="mt-1 min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm sm:w-32"
            >
              {TENOR_OPTIONS.map((hari) => {
                const aktif = (tenorHarianOpsi as readonly number[]).includes(hari);
                return (
                  <option key={hari} value={hari} disabled={!aktif}>
                    {hari} hari{aktif ? "" : " (terkunci)"}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
        {simulasiHarian ? (
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <Baris label={`Tenor pilihan ${tenorHarianEfektif} hari`} nilai="" />
            <Baris
              label={`Potongan awal ${rincianPotonganDiMuka(tarif)}`}
              nilai={formatRupiah(simulasiHarian.totalPotonganDiMuka)}
            />
            <Baris
              label="Dana bersih pada hitungan"
              nilai={formatRupiah(simulasiHarian.danaBersihDitransfer)}
            />
            <Baris
              label={`Bunga ${tarifHarian}%`}
              nilai={formatRupiah(simulasiHarian.bunga)}
            />
            <Baris
              label="Kewajiban ilustratif"
              nilai={formatRupiah(simulasiHarian.totalKewajibanPelunasan)}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-amber-800" role="status">
            Masukkan pokok antara {formatRupiah(LOAN_LIMITS.minPokok)} dan{" "}
            {formatRupiah(LOAN_LIMITS.maxPokok)}.
          </p>
        )}
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Pinjaman bulanan</h3>
          <span className="text-xs text-slate-500">
            {formatRupiah(BULANAN_LIMITS.minPokok)} sampai{" "}
            {formatRupiah(BULANAN_LIMITS.maxPokok)}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="pokok-bulanan">Pokok pinjaman (Rp)</Label>
            <Input
              id="pokok-bulanan"
              type="number"
              inputMode="numeric"
              min={100_000}
              max={500_000_000}
              step={10_000}
              value={pokokBulanan}
              onChange={(event) => setPokokBulanan(Number(event.target.value))}
              className="mt-1 min-h-11"
            />
          </div>
          <div>
            <Label htmlFor="tenor-bulanan">Tenor</Label>
            <select
              id="tenor-bulanan"
              value={tenorBulanan}
              onChange={(event) =>
                setTenorBulanan(
                  Number(
                    event.target.value,
                  ) as (typeof TENOR_BULANAN_OPTIONS)[number],
                )
              }
              className="mt-1 min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm sm:w-32"
            >
              {TENOR_BULANAN_OPTIONS.map((bulan) => (
                <option key={bulan} value={bulan}>
                  {bulan} bulan
                </option>
              ))}
            </select>
          </div>
        </div>
        {simulasiBulanan ? (
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <Baris
              label={`Potongan awal ${tarifBulanan.persenBiayaLayananBulanan}%`}
              nilai={formatRupiah(simulasiBulanan.potonganDiMuka)}
            />
            <Baris
              label="Dana bersih pada hitungan"
              nilai={formatRupiah(simulasiBulanan.danaDiterima)}
            />
            <Baris
              label={`Bunga flat ${simulasiBulanan.persenBungaPerBulan}% per bulan`}
              nilai={formatRupiah(simulasiBulanan.bungaPerBulan)}
            />
            <Baris
              label="Bunga selama tenor"
              nilai={formatRupiah(simulasiBulanan.bungaTotal)}
            />
            <Baris
              label="Cicilan bulanan termasuk admin bila berlaku"
              nilai={formatRupiah(simulasiBulanan.cicilanPerBulan)}
            />
            <Baris
              label="Cicilan bulan terakhir (pembulatan pokok)"
              nilai={formatRupiah(simulasiBulanan.cicilanTerakhir)}
            />
            <Baris
              label="Total jadwal cicilan"
              nilai={formatRupiah(simulasiBulanan.totalPengembalian)}
            />
            <Baris
              label="Admin cicilan selama tenor"
              nilai={formatRupiah(simulasiBulanan.biayaAdminCicilanTotal)}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-amber-800" role="status">
            Masukkan pokok antara Rp100.000 dan Rp500.000.000.
          </p>
        )}
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Gadai</h3>
          <span className="text-xs text-slate-500">
            Potongan {GADAI_PRICING.upfrontDeductionPercent}% · sewa{" "}
            {GADAI_PRICING.sewaModalMinPercent} sampai{" "}
            {GADAI_PRICING.sewaModalMaxPercent}% per {GADAI_PRICING.periodeHari}{" "}
            hari
          </span>
        </div>
        <div className="mt-4 max-w-sm">
          <Label htmlFor="pokok-gadai">Pokok acuan gadai (Rp)</Label>
          <Input
            id="pokok-gadai"
            type="number"
            inputMode="numeric"
            min={100_000}
            step={10_000}
            value={pokokGadai}
            onChange={(event) => setPokokGadai(Number(event.target.value))}
            className="mt-1 min-h-11"
          />
        </div>
        {simulasiGadai ? (
          <dl className="mt-4 grid gap-x-8 divide-y divide-slate-100 text-sm sm:grid-cols-2">
            <Baris
              label="Potongan awal"
              nilai={formatRupiah(simulasiGadai.potonganDiMuka)}
            />
            <Baris
              label="Dana bersih pada hitungan"
              nilai={formatRupiah(simulasiGadai.danaBersihDitransfer)}
            />
            <Baris
              label={`Sewa periode awal ${simulasiGadai.persenSewaModal}%`}
              nilai={formatRupiah(simulasiGadai.sewaModalPeriode)}
            />
            <Baris
              label="Kewajiban awal ilustratif"
              nilai={formatRupiah(simulasiGadai.totalKewajibanAwal)}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-amber-800" role="status">
            Masukkan pokok gadai berupa angka positif.
          </p>
        )}
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Batas hitung internal maksimal {GADAI_PRICING.ltvMaxPercent}% dari
          harga pasar yang dicantumkan. Taksiran aplikasi bukan pemeriksaan
          fisik.
        </p>
      </article>
      <p className="text-sm leading-6 text-slate-600 lg:col-span-2">
        Hasil ini ilustrasi hitung, bukan persetujuan atau bukti pencairan.
        Skema bulanan memakai bunga flat dari pokok penuh; admin cicilan 2%
        berlaku pada setiap pembayaran bulanan. Periksa angka final pada rincian
        pengajuan.
      </p>
    </div>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">{nilai}</dd>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-7 text-xs text-slate-600 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>PINDAI · Perhitungan dan status adalah catatan aplikasi.</span>
          <nav
            aria-label="Tautan tambahan"
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            <Link to="/">Beranda</Link>
            <Link to="/biaya">Biaya</Link>
            <Link to="/cara-kerja">Cara kerja</Link>
            <Link to="/keamanan">Keamanan</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/aplikasi">Aplikasi</Link>
            <Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
          </nav>
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
          {PENAFIAN_PINDAI}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">{HAK_CIPTA_PINDAI}</p>
      </div>
    </footer>
  );
}

/**
 * Halaman ini menerima tarif denda lewat prop supaya bisa dirender tanpa
 * Convex (test render statis), sementara rute memakai versi live di bawah.
 */
export type KetentuanDendaTampil = {
  persenDendaKeterlambatan?: number;
  maksDendaPersen?: number;
  /**
   * Bunga harian global (Pengaturan Sistem). Skema bulanan tidak memakainya:
   * tarifnya per tenor dan datang lewat `tarifBulanan` di bawah.
   */
  persenBunga?: number;
  /** Tarif potongan di muka yang dipakai mesin harga (admin, asuransi, ekspres). */
  tarifBiaya?: Partial<TarifBiaya> | null;
  /** Tarif skema bulanan (bunga 1/3/6 bulan, biaya layanan, admin cicilan). */
  tarifBulanan?: Partial<TarifBulanan> | null;
};

export function PublicInfoPageView({
  ketentuan,
}: {
  ketentuan?: KetentuanDendaTampil | null;
}) {
  const { pathname } = useLocation();
  const dendaPerHari =
    ketentuan?.persenDendaKeterlambatan ?? LATE_FEE_POLICY.percentPerDay;
  const maksDenda = ketentuan?.maksDendaPersen ?? LATE_FEE_POLICY.maxPercent;
  // Tarif potongan di muka mengikuti pengaturan admin yang sama dengan
  // formulir pengajuan; kosong berarti tarif bawaan mesin harga.
  const tarif = tarifBiayaAman(ketentuan?.tarifBiaya);
  // Tarif bulanan publik = tarif yang dipakai mesin pengajuan baru. Bunga
  // khusus per nasabah bisa berbeda dan hanya terlihat setelah masuk.
  const tarifBulanan = tarifBulananAman(ketentuan?.tarifBulanan);
  const faqItems = daftarFaq(dendaPerHari, maksDenda, tarif, tarifBulanan);
  const biaya = pathname === "/biaya";
  const cara = pathname === "/cara-kerja";
  const gadai = pathname === "/layanan/gadai";
  const kredit = pathname === "/layanan/kredit-barang";
  const pinjaman = pathname === "/layanan/pinjaman-tunai";
  const keamanan = pathname === "/keamanan";
  const faq = pathname === "/faq";
  const title = biaya
    ? "Rincian biaya & kalkulator"
    : cara
      ? "Cara kerja"
      : gadai
        ? "Gadai"
        : kredit
          ? "Kredit barang"
          : pinjaman
            ? "Pinjaman tunai"
            : keamanan
              ? "Keamanan dan batas aplikasi"
              : "Pertanyaan umum";
  const description = biaya
    ? "Periksa ilustrasi biaya pinjaman tunai, gadai, dan kredit barang berdasarkan pilihan nominal dan tenor."
    : cara
      ? "Tahapan mengisi data, mengirim pengajuan, dan membaca status PINDAI."
      : gadai
        ? "Ketentuan pencatatan gadai, potongan awal, dan sewa modal."
        : kredit
          ? "Ketentuan tenor, biaya, dan cicilan kredit barang."
          : pinjaman
            ? "Ketentuan pokok, tenor, potongan, bunga, dan pelunasan pinjaman."
            : keamanan
              ? "Batas akses akun, pencatatan, dan pemrosesan informasi di PINDAI."
              : "Jawaban atas pertanyaan tentang biaya, akun, status, dan batas aplikasi PINDAI.";
  const Icon = biaya
    ? Calculator
    : cara
      ? FileText
      : keamanan
        ? LockKeyhole
        : ShieldCheck;

  useEffect(() => {
    const originalTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const originalDescription = meta?.getAttribute("content") ?? null;
    document.title = `${title} | PINDAI`;
    meta?.setAttribute("content", description);
    return () => {
      document.title = originalTitle;
      if (meta && originalDescription !== null)
        meta.setAttribute("content", originalDescription);
    };
  }, [title, description]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>
      <Header />
      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Kembali ke beranda
        </Link>
        <div className="mt-7 max-w-3xl">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">
            Informasi PINDAI
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            {biaya
              ? "Tinjau biaya berdasarkan jenis layanan dan lihat contoh perhitungan. Nominal dan status pada halaman ini merupakan ilustrasi catatan aplikasi."
              : cara
                ? "Alur berikut menjelaskan tahapan yang tersedia di aplikasi. Peninjauan pengajuan dan proses di luar aplikasi tetap diperlukan."
                : gadai
                  ? "Aplikasi mencatat informasi barang dan perhitungan gadai. Penilaian fisik, penitipan, dan perpindahan dana berlangsung di luar aplikasi."
                  : kredit
                    ? "Aplikasi mencatat pilihan pembiayaan barang dan ilustrasi cicilan. Pembelian barang dan perpindahan dana tidak dijalankan otomatis oleh aplikasi."
                    : pinjaman
                      ? "Bandingkan skema harian dan bulanan sebelum membuat akun. Nilai bersih dan kewajiban di sini adalah hasil hitung, bukan dana yang ditransfer."
                      : keamanan
                        ? "Berikut batas akses dan tanggung jawab aplikasi berdasarkan alur yang tersedia. Tidak ada klaim keamanan atau sertifikasi di luar keterangan yang dapat diperiksa."
                        : "Jawaban ringkas tentang pencatatan, perhitungan, dan batas layanan PINDAI."}
          </p>
        </div>

        {biaya || pinjaman ? (
          <section aria-labelledby="tarif-title" className="mt-9 space-y-6">
            {biaya && (
              <div id="kalkulator" className="scroll-mt-6">
                <h2 className="mb-4 text-xl font-semibold">
                  Contoh perhitungan
                </h2>
                <KalkulatorRingkas tarifBulanan={tarifBulanan} tarif={tarif} />
              </div>
            )}
            <div>
              <h2 id="tarif-title" className="mb-4 text-xl font-semibold">
                Skema pinjaman
              </h2>
              <div
                role="region"
                aria-label="Tabel skema pinjaman"
                tabIndex={0}
                className="overflow-x-auto rounded-2xl border border-slate-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2"
              >
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <caption className="sr-only">
                    Perbandingan ketentuan pinjaman harian dan bulanan
                  </caption>
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th scope="col" className="px-4 py-3">Ketentuan</th>
                      <th scope="col" className="px-4 py-3">Harian</th>
                      <th scope="col" className="px-4 py-3">Bulanan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <th scope="row" className="px-4 py-3 font-medium">
                        Tenor
                      </th>
                      <td className="px-4 py-3">
                        {TENOR_OPTIONS.join(", ")} hari
                      </td>
                      <td className="px-4 py-3">
                        {TENOR_BULANAN_OPTIONS.join(", ")} bulan
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-4 py-3 font-medium">
                        Pokok
                      </th>
                      <td className="px-4 py-3">
                        {formatRupiah(LOAN_LIMITS.minPokok)} sampai{" "}
                        {formatRupiah(LOAN_LIMITS.maxPokok)}
                      </td>
                      <td className="px-4 py-3">
                        {formatRupiah(BULANAN_LIMITS.minPokok)} sampai{" "}
                        {formatRupiah(BULANAN_LIMITS.maxPokok)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-4 py-3 font-medium">
                        Potongan awal
                      </th>
                      <td className="px-4 py-3">
                        Admin {persenTeks(tarif.adminPersen)} dari pokok
                        {tarif.asuransiPersen > 0
                          ? ` + asuransi ${persenTeks(tarif.asuransiPersen)}`
                          : ""}
                        {adaBiayaEkspres(tarif)
                          ? ` + ekspres ${rentangEkspres(tarif)} bila dipilih`
                          : ""}
                      </td>
                      <td className="px-4 py-3">
                        {tarifBulanan.persenBiayaLayananBulanan}% dari pokok
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-4 py-3 font-medium">
                        Bunga flat
                      </th>
                      <td className="px-4 py-3">
                        <span className="block">
                          {formatRupiah(LOAN_LIMITS.minPokok)}–{formatRupiah(499_999)}: tenor
                          7/14/21/28 hari, bunga 30/35/38/40%.
                        </span>
                        <span className="mt-1 block">
                          {formatRupiah(500_000)}–{formatRupiah(999_999)}: tenor 7/14/21/28 hari,
                          bunga 28/32/35%.
                        </span>
                        <span className="mt-1 block">
                          {formatRupiah(1_000_000)}: tenor 7/14/21/28 hari, bunga 26/28/29/30%.
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tarifBulanan.persenBungaBulanan1}%/{" "}
                        {tarifBulanan.persenBungaBulanan3}%/{" "}
                        {tarifBulanan.persenBungaBulanan6}% per bulan dari pokok
                        penuh untuk tenor 1/3/6 bulan (tarif dasar; bunga khusus
                        akun dapat berbeda)
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-4 py-3 font-medium">
                        Biaya cicilan
                      </th>
                      <td className="px-4 py-3">
                        Tidak ada skema cicilan bulanan
                      </td>
                      <td className="px-4 py-3">
                        {tarifBulanan.persenBiayaAdminCicilanBulanan}% dari
                        cicilan pada setiap pembayaran bulanan (tenor 1, 3, dan 6
                        bulan)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground sm:hidden">
                Geser tabel ke samping untuk melihat kolom bulanan.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Bunga harian mengikuti matriks nominal–tenor di atas dan
                ditampilkan langsung oleh kalkulator. Perpanjangan tenor di
                bawah {formatRupiah(500_000)} menaikkan bunga dari 30% ke
                35–40%. Jadwal cicilan bulanan adalah ilustrasi, bukan catatan
                pembayaran angsuran. Tim PINDAI mencatat pelunasan penuh saat
                kewajiban dinyatakan selesai. Denda pinjaman tunai{" "}
                {dendaPerHari}% per hari dari pokok, maksimum {maksDenda}%.
                Bunga, biaya, dan jadwal yang
                berlaku harus diperiksa pada rincian pengajuan Anda.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Gadai</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Potongan awal {GADAI_PRICING.upfrontDeductionPercent}%; sewa
                modal {GADAI_PRICING.sewaModalMinPercent} sampai{" "}
                {GADAI_PRICING.sewaModalMaxPercent}% per{" "}
                {GADAI_PRICING.periodeHari} hari dihitung dari sisa pokok. Batas
                hitung internal maksimal {GADAI_PRICING.ltvMaxPercent}% dari
                harga pasar yang dicantumkan. Taksiran aplikasi bukan
                pemeriksaan fisik.
              </p>
              <Link
                to="/layanan/gadai"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-900 underline underline-offset-4"
              >
                Rincian layanan gadai{" "}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            {biaya && (
              <p className="text-sm leading-6 text-slate-600">
                Kredit barang: pokok pembiayaan sampai{" "}
                {formatRupiah(KREDIT_BARANG_POKOK_MAKS)}. Tenor{" "}
                {TENOR_BULANAN_OPTIONS.join("/")} bulan, DP{" "}
                {BULANAN_PRICING.dpPersen}%, potongan awal{" "}
                {tarifBulanan.persenBiayaLayananBulanan}%, bunga flat{" "}
                {persenBungaPerBulan(1, tarifBulanan)}/
                {persenBungaPerBulan(3, tarifBulanan)}/
                {persenBungaPerBulan(6, tarifBulanan)}% per bulan; setiap
                cicilan bulanan dikenai biaya admin cicilan{" "}
                {tarifBulanan.persenBiayaAdminCicilanBulanan}% dari nominal
                cicilan.{" "}
                <Link
                  to="/layanan/kredit-barang"
                  className="font-semibold text-emerald-900 underline underline-offset-4"
                >
                  Baca rincian kredit barang
                </Link>
                .
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="min-h-11 bg-primary text-white hover:bg-primary/90"
              >
                <Link to="/auth">Buat akun</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/syarat-ketentuan">Baca syarat lengkap</Link>
              </Button>
            </div>
          </section>
        ) : null}

        {gadai || kredit ? (
          <section className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold">Yang dicatat aplikasi</h2>
            {gadai ? (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                <li>Deskripsi barang, nilai taksiran, dan pokok gadai.</li>
                <li>
                  Sewa modal {GADAI_PRICING.sewaModalMinPercent} sampai{" "}
                  {GADAI_PRICING.sewaModalMaxPercent}% per{" "}
                  {GADAI_PRICING.periodeHari} hari dari sisa pokok; batas hitung
                  maksimal {GADAI_PRICING.ltvMaxPercent}% dari harga pasar yang
                  dicantumkan.
                </li>
                <li>
                  Status dan riwayat di ledger internal. Penitipan dan
                  pemeriksaan barang tidak dilakukan aplikasi.
                </li>
              </ul>
            ) : (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                <li>Tenor baru 1, 3, atau 6 bulan dengan DP 0%.</li>
                <li>
                  Biaya awal {tarifBulanan.persenBiayaLayananBulanan}% dan bunga
                  flat dari pokok penuh: {persenBungaPerBulan(1, tarifBulanan)}%,{" "}
                  {persenBungaPerBulan(3, tarifBulanan)}%, atau{" "}
                  {persenBungaPerBulan(6, tarifBulanan)}% per bulan sesuai tenor.
                </li>
                <li>
                  Biaya admin cicilan{" "}
                  {tarifBulanan.persenBiayaAdminCicilanBulanan}% dari nominal
                  cicilan berlaku pada setiap pembayaran bulanan (tenor 1, 3, dan
                  6 bulan).
                </li>
                <li>
                  Pokok pembiayaan maksimal{" "}
                  {formatRupiah(KREDIT_BARANG_POKOK_MAKS)}; pembelian barang
                  ditangani di luar aplikasi.
                </li>
              </ul>
            )}
            <p className="mt-5 text-sm leading-6 text-slate-600">
              Semua nilai adalah perhitungan internal dan tidak dengan
              sendirinya membuktikan penyimpanan barang, pembayaran, atau
              pencairan.
            </p>
            <Button
              asChild
              className="mt-6 min-h-11 bg-primary text-white hover:bg-primary/90"
            >
              <Link to="/auth">Buat akun untuk melanjutkan</Link>
            </Button>
          </section>
        ) : null}

        {cara ? (
          <section className="mt-9">
            <ol className="divide-y divide-slate-200 border-y border-slate-200">
              {[
                [
                  "Pilih jenis pengajuan",
                  "Tentukan pinjaman tunai, gadai, atau kredit barang.",
                ],
                [
                  "Baca biaya dan ketentuan",
                  "Gunakan kalkulator dan periksa rincian yang ditampilkan aplikasi.",
                ],
                [
                  "Buat akun dan isi data",
                  "Lengkapi informasi yang diminta; proses identitas dapat mencakup dokumen dan verifikasi OTP WhatsApp.",
                ],
                [
                  "Kirim untuk ditinjau",
                  "Tim PINDAI memeriksa pengajuan. Status verifikasi identitas tidak sama dengan persetujuan pinjaman.",
                ],
                [
                  "Pantau catatan",
                  "Dashboard menampilkan status dan riwayat. Persetujuan bukan jaminan pencairan.",
                ],
              ].map(([step, desc], i) => (
                <li key={step} className="flex gap-4 py-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-sm font-semibold text-emerald-900">
                    {i + 1}
                  </span>
                  <div>
                    <h2 className="font-semibold">{step}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
              Pencairan, pelunasan, pembayaran, pemeriksaan fisik, dan penitipan
              barang berlangsung di luar aplikasi.
            </p>
            <Button
              asChild
              className="mt-5 min-h-11 bg-primary text-white hover:bg-primary/90"
            >
              <Link to="/auth">Mulai dengan akun</Link>
            </Button>
          </section>
        ) : null}

        {keamanan ? (
          <section className="mt-9 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldCheck
                  className="size-4 text-emerald-900"
                  aria-hidden="true"
                />
                Akses dan akun
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Dashboard memerlukan akun; kode email digunakan untuk masuk dan
                OTP WhatsApp untuk verifikasi nomor pada alur yang
                memerlukannya. Jaga kode OTP dan jangan membagikannya. Riwayat
                tidak ditampilkan ke publik.
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <LockKeyhole
                  className="size-4 text-emerald-900"
                  aria-hidden="true"
                />
                Data yang dicatat
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Pengajuan identitas dapat memerlukan NIK, nomor WhatsApp,
                informasi penghasilan, foto KTP, selfie dengan KTP, serta bukti
                penghasilan. Dokumen gambar yang diterima adalah{" "}
                {GAMBAR_DITERIMA.join(", ")} dengan batas{" "}
                {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB per berkas. Saat
                alur Peminjam digunakan, titik lokasi dikirim berkala, sekitar
                tiap {LOKASI_KEBIJAKAN.intervalDetik} detik; transaksi tertentu
                memerlukan titik yang berumur tidak lebih dari{" "}
                {DEFAULT_CONFIG.lokasiMaxUmurMenit} menit. Browser tidak
                mengirim lokasi setelah halaman ditutup.
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Batas pencatatan</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Aplikasi mencatat pengajuan, hasil hitung, perubahan status, dan
                riwayat. Aplikasi tidak memindahkan uang atau
                memeriksa/menyimpan barang. Catatan status bukan bukti
                transaksi.
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold">Akses informasi</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Informasi akun dan pengajuan tidak ditampilkan ke publik. Akses
                mengikuti akun dan peran; pendana yang diberi akses dapat
                melihat ringkasan pinjaman, bukan dokumen identitas.
              </p>
              <Link
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-900 underline underline-offset-4"
                to="/syarat-ketentuan"
              >
                Baca syarat dan ketentuan{" "}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          </section>
        ) : null}

        {faq ? (
          <section className="mt-9">
            <Accordion
              type="single"
              collapsible
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 sm:px-6"
            >
              {faqItems.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="min-h-12 text-left font-semibold">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-slate-600">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="mt-6 text-sm text-slate-600">
              Perlu membaca ketentuan lengkap?{" "}
              <Link
                className="font-semibold text-emerald-900 underline underline-offset-4"
                to="/syarat-ketentuan"
              >
                Buka Syarat &amp; Ketentuan
              </Link>
              .
            </p>
          </section>
        ) : null}
        {cara ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Proses di luar aplikasi</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Pencairan dana, cicilan, pelunasan, pemeriksaan fisik, serta
              penitipan atau pengembalian barang ditangani di luar aplikasi.
              PINDAI menyimpan catatan status dan hitungannya.
            </p>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

export { ROUTES as PUBLIC_INFO_ROUTES };

/** Rute publik: tarif denda dibaca dari pengaturan admin yang berlaku. */
export default function PublicInfoPage() {
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  return <PublicInfoPageView ketentuan={ketentuan} />;
}
