import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  FileText,
  HandCoins,
  LockKeyhole,
  Package,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaqLayanan } from "@/components/informasi/FaqLayanan";
import {
  FORM_HREF,
  InfoFooter,
  InfoHeader,
} from "@/components/informasi/InfoShell";
import { api } from "@/convex/_generated/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  persenBungaPerBulan,
  type TarifBulanan,
} from "@/lib/bulanan";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GADAI_PRICING, quoteGadai } from "@/lib/gadai";
import {
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
} from "@/lib/kredit";
import { LOKASI_KEBIJAKAN } from "@/lib/lokasi";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import { MAX_FILE_BYTES, GAMBAR_DITERIMA } from "@/lib/kyc";

/**
 * FAQ disusun dari tarif yang berlaku supaya jawaban denda tidak lagi ditulis
 * tetap: angka di halaman ini harus sama dengan yang dipakai mesin pinjaman.
 */
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

const SKEMA_KALKULATOR = [
  { id: "harian", label: "Harian" },
  { id: "bulanan", label: "Bulanan" },
  { id: "gadai", label: "Gadai" },
] as const;

type SkemaKalkulator = (typeof SKEMA_KALKULATOR)[number]["id"];

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
  const [skema, setSkema] = useState<SkemaKalkulator>("harian");
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
    <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-sky-100">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gold" />
      <div className="relative p-5 pt-7 sm:p-7 sm:pt-8 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
              <span className="flex size-7 items-center justify-center rounded-lg border border-gold/40 bg-card">
                <Calculator className="size-4" aria-hidden="true" />
              </span>
              Kalkulator biaya
            </p>
            <h2
              id="kalkulator-title"
              className="mt-3 font-judul text-[1.8rem] leading-[1.1] tracking-tight text-foreground sm:text-[2.2rem]"
            >
              Contoh perhitungan
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-700">
              Pilih skema, ubah nominal dan tenor, lalu baca ringkasan di
              sebelahnya. Angka bergerak tanpa memuat ulang halaman.
            </p>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-card px-3 py-1.5 text-xs font-medium text-slate-700">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Ilustrasi, bukan persetujuan
          </p>
        </div>

        <div
          role="group"
          aria-label="Pilih skema perhitungan"
          className="mt-6 grid grid-cols-3 gap-1 rounded-lg border border-sky-200 bg-card p-1"
        >
          {SKEMA_KALKULATOR.map((item) => {
            const aktif = skema === item.id;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                type="button"
                aria-pressed={aktif}
                aria-controls={`panel-${item.id}`}
                onClick={() => setSkema(item.id)}
                className={
                  aktif
                    ? "min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    : "min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div
          id="panel-harian"
          role="region"
          aria-labelledby="tab-harian"
          className={
            skema === "harian"
              ? "mt-4 grid gap-4 lg:grid-cols-[1.02fr_0.98fr]"
              : "hidden"
          }
        >
          <div className="rounded-2xl border border-sky-200 bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                  Skema harian
                </p>
                <h3 className="mt-1 font-judul text-xl leading-tight text-foreground">
                  Pinjaman harian
                </h3>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                {formatRupiah(LOAN_LIMITS.minPokok)} sampai{" "}
                {formatRupiah(LOAN_LIMITS.maxPokok)}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
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
                  onChange={(event) =>
                    pilihPokokHarian(Number(event.target.value))
                  }
                  className="mt-1 min-h-11 tabular-nums"
                />
              </div>
              <div>
                <Label htmlFor="tenor-harian">Tenor</Label>
                <select
                  id="tenor-harian"
                  value={tenorHarianEfektif}
                  onChange={(event) =>
                    setTenorHarian(
                      Number(
                        event.target.value,
                      ) as (typeof TENOR_OPTIONS)[number],
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-36"
                >
                  {TENOR_OPTIONS.map((hari) => {
                    const aktif = (
                      tenorHarianOpsi as readonly number[]
                    ).includes(hari);
                    return (
                      <option key={hari} value={hari} disabled={!aktif}>
                        {hari} hari{aktif ? "" : " (terkunci)"}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Tenor mengikuti batas nominal. Pilihan terkunci tidak tersedia
              untuk pokok ini.
            </p>
            {simulasiHarian ? null : (
              <p
                role="status"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
              >
                Masukkan pokok antara {formatRupiah(LOAN_LIMITS.minPokok)} dan{" "}
                {formatRupiah(LOAN_LIMITS.maxPokok)}.
              </p>
            )}
          </div>
          {simulasiHarian ? (
            <RingkasanKalkulator
              judul={`${tenorHarianEfektif} hari`}
              totalLabel="Kewajiban ilustratif"
              total={formatRupiah(simulasiHarian.totalKewajibanPelunasan)}
              baris={[
                {
                  label: `Potongan awal ${rincianPotonganDiMuka(tarif)}`,
                  nilai: formatRupiah(simulasiHarian.totalPotonganDiMuka),
                },
                {
                  label: "Dana bersih pada hitungan",
                  nilai: formatRupiah(simulasiHarian.danaBersihDitransfer),
                },
                {
                  label: `Bunga ${tarifHarian}%`,
                  nilai: formatRupiah(simulasiHarian.bunga),
                },
              ]}
              catatan="Dana bersih adalah pokok setelah potongan di muka. Kewajiban dihitung dari pokok dan bunga tenor terpilih."
            />
          ) : (
            <RingkasanKosong pesan="Ringkasan muncul setelah nominal berada dalam batas pinjaman harian." />
          )}
        </div>

        <div
          id="panel-bulanan"
          role="region"
          aria-labelledby="tab-bulanan"
          className={
            skema === "bulanan"
              ? "mt-4 grid gap-4 lg:grid-cols-[1.02fr_0.98fr]"
              : "hidden"
          }
        >
          <div className="rounded-2xl border border-sky-200 bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                  Skema bulanan
                </p>
                <h3 className="mt-1 font-judul text-xl leading-tight text-foreground">
                  Pinjaman bulanan
                </h3>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                {formatRupiah(BULANAN_LIMITS.minPokok)} sampai{" "}
                {formatRupiah(BULANAN_LIMITS.maxPokok)}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor="pokok-bulanan">Pokok pinjaman (Rp)</Label>
                <Input
                  id="pokok-bulanan"
                  type="number"
                  inputMode="numeric"
                  min={BULANAN_LIMITS.minPokok}
                  max={BULANAN_LIMITS.maxPokok}
                  step={10_000}
                  value={pokokBulanan}
                  onChange={(event) =>
                    setPokokBulanan(Number(event.target.value))
                  }
                  className="mt-1 min-h-11 tabular-nums"
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
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-36"
                >
                  {TENOR_BULANAN_OPTIONS.map((bulan) => (
                    <option key={bulan} value={bulan}>
                      {bulan} bulan
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Bunga mengikuti tenor. Biaya admin cicilan dihitung pada setiap
              pembayaran bulanan.
            </p>
            {simulasiBulanan ? null : (
              <p
                role="status"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
              >
                Masukkan pokok antara {formatRupiah(BULANAN_LIMITS.minPokok)}{" "}
                dan {formatRupiah(BULANAN_LIMITS.maxPokok)}.
              </p>
            )}
          </div>
          {simulasiBulanan ? (
            <RingkasanKalkulator
              judul={`${tenorBulanan} bulan`}
              totalLabel="Cicilan per bulan"
              total={formatRupiah(simulasiBulanan.cicilanPerBulan)}
              baris={[
                {
                  label: `Potongan awal ${tarifBulanan.persenBiayaLayananBulanan}%`,
                  nilai: formatRupiah(simulasiBulanan.potonganDiMuka),
                },
                {
                  label: "Dana bersih pada hitungan",
                  nilai: formatRupiah(simulasiBulanan.danaDiterima),
                },
                {
                  label: `Bunga flat ${simulasiBulanan.persenBungaPerBulan}% per bulan`,
                  nilai: formatRupiah(simulasiBulanan.bungaPerBulan),
                },
                {
                  label: "Bunga selama tenor",
                  nilai: formatRupiah(simulasiBulanan.bungaTotal),
                },
                {
                  label: "Admin cicilan selama tenor",
                  nilai: formatRupiah(simulasiBulanan.biayaAdminCicilanTotal),
                },
                {
                  label: "Cicilan bulan terakhir (pembulatan pokok)",
                  nilai: formatRupiah(simulasiBulanan.cicilanTerakhir),
                },
                {
                  label: "Total jadwal cicilan",
                  nilai: formatRupiah(simulasiBulanan.totalPengembalian),
                },
              ]}
              catatan="Cicilan per bulan sudah termasuk biaya admin cicilan bila berlaku. Jadwal ini ilustrasi, bukan catatan pembayaran."
            />
          ) : (
            <RingkasanKosong pesan="Ringkasan muncul setelah nominal berada dalam batas pinjaman bulanan." />
          )}
        </div>

        <div
          id="panel-gadai"
          role="region"
          aria-labelledby="tab-gadai"
          className={
            skema === "gadai"
              ? "mt-4 grid gap-4 lg:grid-cols-[1.02fr_0.98fr]"
              : "hidden"
          }
        >
          <div className="rounded-2xl border border-sky-200 bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                  Gadai
                </p>
                <h3 className="mt-1 font-judul text-xl leading-tight text-foreground">
                  Hitung gadai
                </h3>
              </div>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                LTV {GADAI_PRICING.ltvMaxPercent}% · sewa{" "}
                {GADAI_PRICING.sewaModalMinPercent}–{
                  GADAI_PRICING.sewaModalMaxPercent
                }%
              </span>
            </div>
            <div className="mt-5 max-w-sm">
              <Label htmlFor="pokok-gadai">Pokok acuan gadai (Rp)</Label>
              <Input
                id="pokok-gadai"
                type="number"
                inputMode="numeric"
                min={100_000}
                step={10_000}
                value={pokokGadai}
                onChange={(event) => setPokokGadai(Number(event.target.value))}
                className="mt-1 min-h-11 tabular-nums"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Batas hitung maksimal {GADAI_PRICING.ltvMaxPercent}% dari harga
              pasar yang dicantumkan. Taksiran aplikasi bukan pemeriksaan fisik.
            </p>
            {simulasiGadai ? null : (
              <p
                role="status"
                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
              >
                Masukkan pokok gadai berupa angka positif.
              </p>
            )}
          </div>
          {simulasiGadai ? (
            <RingkasanKalkulator
              judul={`${GADAI_PRICING.periodeHari} hari`}
              totalLabel="Kewajiban awal ilustratif"
              total={formatRupiah(simulasiGadai.totalKewajibanAwal)}
              baris={[
                {
                  label: "Potongan awal",
                  nilai: formatRupiah(simulasiGadai.potonganDiMuka),
                },
                {
                  label: "Dana bersih pada hitungan",
                  nilai: formatRupiah(simulasiGadai.danaBersihDitransfer),
                },
                {
                  label: `Sewa periode awal ${simulasiGadai.persenSewaModal}%`,
                  nilai: formatRupiah(simulasiGadai.sewaModalPeriode),
                },
              ]}
              catatan="Sewa modal dihitung dari sisa pokok untuk satu periode. Angka ini belum termasuk perpanjangan atau biaya di luar ketentuan gadai."
            />
          ) : (
            <RingkasanKosong pesan="Ringkasan muncul setelah pokok gadai diisi dengan angka positif." />
          )}
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-700">
          Hasil ini ilustrasi hitung, bukan persetujuan atau bukti pencairan.
          Skema bulanan memakai bunga flat dari pokok penuh; admin cicilan 2%
          berlaku pada setiap pembayaran bulanan. Periksa angka final pada
          rincian pengajuan.
        </p>
      </div>
    </div>
  );
}

type BarisRingkasan = { label: string; nilai: string };

function RingkasanKalkulator({
  judul,
  totalLabel,
  total,
  baris,
  catatan,
}: {
  judul: string;
  totalLabel: string;
  total: string;
  baris: readonly BarisRingkasan[];
  catatan: string;
}) {
  return (
    <aside className="relative flex flex-col overflow-hidden rounded-2xl border border-gold/40 bg-card p-5 sm:p-6">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gold" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
          Ringkasan ilustrasi
        </p>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          {judul}
        </span>
      </div>
      <dl aria-live="polite" className="mt-4 flex-1">
        <div>
          <dt className="text-sm text-muted-foreground">{totalLabel}</dt>
          <dd className="mt-1 font-judul text-[2rem] leading-none tabular-nums text-gold-foreground">
            {total}
          </dd>
        </div>
        <div className="mt-4 divide-y divide-dashed divide-border border-t border-border">
          {baris.map((item) => (
            <div
              key={item.label}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
            >
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">
                {item.nilai}
              </dd>
            </div>
          ))}
        </div>
      </dl>
      <p className="mt-4 border-t border-dashed border-border pt-3 text-xs leading-5 text-muted-foreground">
        {catatan}
      </p>
    </aside>
  );
}

function RingkasanKosong({ pesan }: { pesan: string }) {
  return (
    <aside className="flex flex-col justify-center rounded-2xl border border-dashed border-gold/40 bg-card p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
        Ringkasan ilustrasi
      </p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{pesan}</p>
    </aside>
  );
}

type JenisLayanan = "pinjaman" | "gadai" | "kredit";

function faqLayananUntuk(jenis: JenisLayanan): {
  judul: string;
  deskripsi: string;
  daftar: readonly { q: string; a: string }[];
  pesanChat: string;
} {
  if (jenis === "pinjaman") {
    return {
      judul: "Pertanyaan sebelum mengajukan pinjaman",
      deskripsi:
        "Tiga hal yang paling sering ditanyakan tentang tenor, potongan, dan status pencairan.",
      daftar: [
        {
          q: "Apakah bunga harian dan bulanan sama?",
          a: `Tidak. Bunga harian dihitung flat untuk tenor ${TENOR_OPTIONS[0]}–${TENOR_OPTIONS[TENOR_OPTIONS.length - 1]} hari; skema bulanan punya tarif per tenor ${TENOR_BULANAN_OPTIONS.join("/")} bulan. Kalkulator menampilkan keduanya.`,
        },
        {
          q: "Kapan potongan biaya dilakukan?",
          a: "Potongan di muka dihitung dari pokok dan mengurangi dana yang diterima. Rincian potongan tampil di kalkulator dan rincian pengajuan.",
        },
        {
          q: "Apakah status di aplikasi berarti dana sudah cair?",
          a: "Tidak. Status adalah catatan aplikasi. Pencairan dan pelunasan ditangani di luar aplikasi; persetujuan bukan jaminan transfer.",
        },
      ],
      pesanChat:
        "Halo PINDAI, saya sedang membaca halaman Pinjaman tunai dan ingin bertanya tentang tenor dan biaya.",
    };
  }

  if (jenis === "gadai") {
    return {
      judul: "Pertanyaan sebelum menggadaikan barang",
      deskripsi:
        "Tiga hal yang perlu jelas sebelum barang dan nilai taksiran dicatat.",
      daftar: [
        {
          q: "Apakah barang saya disimpan PINDAI?",
          a: "Aplikasi hanya mencatat deskripsi barang, taksiran, pokok, dan status. Penitipan serta pemeriksaan fisik barang ditangani di luar aplikasi.",
        },
        {
          q: "Bagaimana batas LTV dihitung?",
          a: `Batas hitung internal maksimal ${GADAI_PRICING.ltvMaxPercent}% dari harga pasar yang dicantumkan. Taksiran aplikasi bukan pemeriksaan fisik; angka final ditetapkan petugas.`,
        },
        {
          q: "Apa yang harus saya lakukan jika terlambat?",
          a: "Hubungi CS sebelum jatuh tempo. Pilihan penanganan mengikuti perjanjian gadai dan catatan pinjaman Anda; jangan menunggu sampai status berubah.",
        },
      ],
      pesanChat:
        "Halo PINDAI, saya sedang membaca halaman Gadai dan ingin bertanya tentang taksiran dan batas LTV.",
    };
  }

  return {
    judul: "Pertanyaan sebelum mengajukan kredit barang",
    deskripsi:
      "Tiga hal yang perlu dibaca sebelum memilih barang, DP, dan tenor.",
    daftar: [
      {
        q: "Berapa DP minimum?",
        a: `DP wajib ${KREDIT_PRICING.dpMinPersen}–${KREDIT_PRICING.dpMaxPersen}% dari harga barang untuk pengajuan baru.`,
      },
      {
        q: "Apakah PINDAI membeli barangnya?",
        a: "Pembelian barang ditangani di luar aplikasi. PINDAI mencatat pilihan pembiayaan, DP, tenor, dan jadwal cicilan.",
      },
      {
        q: "Apakah jadwal cicilan di aplikasi adalah tagihan resmi?",
        a: "Jadwal adalah ilustrasi perhitungan. Tagihan dan pembayaran mengikuti perjanjian serta catatan pinjaman Anda.",
      },
    ],
    pesanChat:
      "Halo PINDAI, saya sedang membaca halaman Kredit barang dan ingin bertanya tentang DP dan tenor.",
  };
}

const NAVIGASI_LAYANAN = [
  { href: "/layanan", label: "Semua layanan", jenis: null },
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai", jenis: "pinjaman" },
  { href: "/layanan/gadai", label: "Gadai", jenis: "gadai" },
  { href: "/layanan/kredit-barang", label: "Kredit barang", jenis: "kredit" },
] as const;

function NavigasiLayanan({ jenis }: { jenis: JenisLayanan | null }) {
  return (
    <nav
      aria-label="Jenis layanan"
      className="mt-8 flex flex-wrap gap-2 border-y border-border py-3"
    >
      {NAVIGASI_LAYANAN.map((item) => {
        const aktif = item.jenis === jenis;
        return (
          <Link
            key={item.href}
            to={item.href}
            aria-current={aktif ? "page" : undefined}
            className={
              aktif
                ? "inline-flex min-h-11 items-center rounded-lg border border-primary/30 bg-secondary px-3 text-sm font-semibold text-primary"
                : "inline-flex min-h-11 items-center rounded-lg border border-transparent px-3 text-sm text-muted-foreground hover:bg-muted hover:text-primary"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function RingkasanLayanan({ jenis }: { jenis: JenisLayanan }) {
  const isi =
    jenis === "pinjaman"
      ? [
          {
            label: "Tenor harian",
            nilai: `${TENOR_OPTIONS[0]}–${TENOR_OPTIONS[TENOR_OPTIONS.length - 1]} hari`,
          },
          {
            label: "Cicilan bulanan",
            nilai: `${TENOR_BULANAN_OPTIONS.join("/")} bulan`,
          },
          {
            label: "Mulai dari",
            nilai: formatRupiah(LOAN_LIMITS.minPokok),
          },
        ]
      : jenis === "gadai"
        ? [
            {
              label: "Batas hitung",
              nilai: `${GADAI_PRICING.ltvMaxPercent}% harga pasar`,
            },
            {
              label: "Sewa modal",
              nilai: `${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% / ${GADAI_PRICING.periodeHari} hari`,
            },
            {
              label: "Potongan awal",
              nilai: `${GADAI_PRICING.upfrontDeductionPercent}%`,
            },
          ]
        : [
            {
              label: "Uang muka",
              nilai: `${KREDIT_PRICING.dpMinPersen}–${KREDIT_PRICING.dpMaxPersen}%`,
            },
            {
              label: "Tenor",
              nilai: `${KREDIT_TENOR_PENGAJUAN_OPTIONS.join("/")} bulan`,
            },
            {
              label: "Pokok maksimal",
              nilai: formatRupiah(KREDIT_BARANG_POKOK_MAKS),
            },
          ];

  return (
    <aside className="rounded-2xl border border-gold/40 bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
        Ringkasan {jenis === "pinjaman" ? "pinjaman" : jenis}
      </p>
      <dl className="mt-4 divide-y divide-border">
        {isi.map((baris) => (
          <div
            key={baris.label}
            className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
          >
            <dt className="text-sm text-muted-foreground">{baris.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {baris.nilai}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        Angka mengikuti mesin harga. Batas per akun tetap mengikuti plafon yang
        tersedia.
      </p>
    </aside>
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
  const jenisLayanan: JenisLayanan | null = pinjaman
    ? "pinjaman"
    : gadai
      ? "gadai"
      : kredit
        ? "kredit"
        : null;
  const faqKonteks = jenisLayanan === null ? null : faqLayananUntuk(jenisLayanan);
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
      : gadai
        ? HandCoins
        : kredit
          ? Package
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
    <div className="min-h-screen bg-background text-foreground">
      <InfoHeader />
      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={jenisLayanan ? "/layanan" : "/"}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {jenisLayanan ? "Semua layanan" : "Kembali ke beranda"}
          </Link>
          {jenisLayanan ? (
            <p className="text-xs font-medium text-muted-foreground">
              Layanan / <span className="text-foreground">{title}</span>
            </p>
          ) : null}
        </div>

        <div
          className={
            jenisLayanan
              ? "mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start"
              : "mt-7 max-w-3xl"
          }
        >
          <div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
              Informasi PINDAI
            </p>
            <h1 className="mt-2 font-judul text-[2.2rem] leading-[1.08] tracking-tight text-foreground sm:text-[2.8rem]">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
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
          {jenisLayanan ? <RingkasanLayanan jenis={jenisLayanan} /> : null}
        </div>
        {jenisLayanan ? <NavigasiLayanan jenis={jenisLayanan} /> : null}

        {biaya || pinjaman ? (
          <section aria-labelledby="tarif-title" className="mt-9 space-y-6">
            {biaya && (
              <section
                id="kalkulator"
                aria-labelledby="kalkulator-title"
                className="scroll-mt-6"
              >
                <KalkulatorRingkas tarifBulanan={tarifBulanan} tarif={tarif} />
              </section>
            )}
            <div>
              <h2 id="tarif-title" className="mb-4 text-xl font-semibold">
                Skema pinjaman
              </h2>
              <div
                role="region"
                aria-label="Tabel skema pinjaman"
                tabIndex={0}
                className="overflow-x-auto rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <caption className="sr-only">
                    Perbandingan ketentuan pinjaman harian dan bulanan
                  </caption>
                  <thead className="bg-muted text-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-3">Ketentuan</th>
                      <th scope="col" className="px-4 py-3">Harian</th>
                      <th scope="col" className="px-4 py-3">Bulanan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
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
                          7/14/21/28 hari, bunga 32/37/40/42%.
                        </span>
                        <span className="mt-1 block">
                          {formatRupiah(500_000)}–{formatRupiah(999_999)}: tenor 7/14/21/28 hari,
                          bunga 30/34/36/37%.
                        </span>
                        <span className="mt-1 block">
                          {formatRupiah(1_000_000)}: tenor 7/14/21/28 hari, bunga 28/30/31/32%.
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          Tenor harian bisa 7–50 hari. Angka di atas adalah tarif acuan
                          7/14/21/28 hari; tenor 8–27 dan 29–50 hari dihitung dari acuan
                          terdekat, dengan tarif perpanjangan untuk hari ke-29 ke atas.
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tarifBulanan.persenBungaBulanan1}% /{" "}
                        {tarifBulanan.persenBungaBulanan3}% /{" "}
                        {tarifBulanan.persenBungaBulanan6}% /{" "}
                        {tarifBulanan.persenBungaBulanan9}% /{" "}
                        {tarifBulanan.persenBungaBulanan12}% per bulan dari pokok
                        penuh untuk tenor 1/3/6/9/12 bulan (tarif dasar; bunga
                        khusus akun dapat berbeda)
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
              <p className="mt-2 text-xs text-muted-foreground sm:hidden">
                Geser tabel ke samping untuk melihat kolom bulanan.
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Bunga harian mengikuti matriks nominal–tenor di atas dan
                ditampilkan langsung oleh kalkulator. Perpanjangan tenor di
                bawah {formatRupiah(500_000)} menaikkan bunga dari 32% ke
                37–42%. Jadwal cicilan bulanan adalah ilustrasi, bukan catatan
                pembayaran angsuran. Tim PINDAI mencatat pelunasan penuh saat
                kewajiban dinyatakan selesai. Denda pinjaman tunai{" "}
                {dendaPerHari}% per hari dari pokok, maksimum {maksDenda}%.
                Bunga, biaya, dan jadwal yang
                berlaku harus diperiksa pada rincian pengajuan Anda.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold">Gadai</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
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
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
              >
                Rincian layanan gadai{" "}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            {biaya && (
              <p className="text-sm leading-6 text-muted-foreground">
                Kredit barang: pokok pembiayaan sampai{" "}
                {formatRupiah(KREDIT_BARANG_POKOK_MAKS)}. Tenor{" "}
                {KREDIT_TENOR_PENGAJUAN_OPTIONS.join("/")} bulan, DP wajib{" "}
                {KREDIT_PRICING.dpMinPersen}–{KREDIT_PRICING.dpMaxPersen}%,
                potongan awal{" "}
                {tarifBulanan.persenBiayaLayananBulanan}%, bunga flat{" "}
                {persenBungaPerBulan(1, tarifBulanan)}/
                {persenBungaPerBulan(3, tarifBulanan)}/
                {persenBungaPerBulan(6, tarifBulanan)}% per bulan; setiap
                cicilan bulanan dikenai biaya admin cicilan{" "}
                {tarifBulanan.persenBiayaAdminCicilanBulanan}% dari nominal
                cicilan.{" "}
                <Link
                  to="/layanan/kredit-barang"
                  className="font-semibold text-primary underline underline-offset-4"
                >
                  Baca rincian kredit barang
                </Link>
                .
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to={FORM_HREF}>Buat akun</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/syarat-ketentuan">Baca syarat lengkap</Link>
              </Button>
            </div>
          </section>
        ) : null}

        {gadai || kredit ? (
          <section className="mt-9 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
                Catatan aplikasi
              </p>
              <h2 className="mt-2 font-judul text-2xl leading-tight text-foreground">
                Yang dicatat aplikasi
              </h2>
              {gadai ? (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>Deskripsi barang, nilai taksiran, dan pokok gadai.</li>
                  <li>
                    Sewa modal {GADAI_PRICING.sewaModalMinPercent} sampai{" "}
                    {GADAI_PRICING.sewaModalMaxPercent}% per{" "}
                    {GADAI_PRICING.periodeHari} hari dari sisa pokok; batas
                    hitung maksimal {GADAI_PRICING.ltvMaxPercent}% dari harga
                    pasar yang dicantumkan.
                  </li>
                  <li>
                    Status dan riwayat di catatan internal PINDAI. Penitipan dan
                    pemeriksaan barang tidak dilakukan aplikasi.
                  </li>
                </ul>
              ) : (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>
                    Tenor baru 1, 3, atau 6 bulan dengan DP wajib{" "}
                    {KREDIT_PRICING.dpMinPersen}–{KREDIT_PRICING.dpMaxPersen}%
                    dari harga barang.
                  </li>
                  <li>
                    Biaya awal {tarifBulanan.persenBiayaLayananBulanan}% dan
                    bunga flat dari pokok setelah DP:{" "}
                    {persenBungaPerBulan(1, tarifBulanan)}%,{" "}
                    {persenBungaPerBulan(3, tarifBulanan)}%, atau{" "}
                    {persenBungaPerBulan(6, tarifBulanan)}% per bulan sesuai
                    tenor.
                  </li>
                  <li>
                    Biaya admin cicilan{" "}
                    {tarifBulanan.persenBiayaAdminCicilanBulanan}% dari nominal
                    cicilan berlaku pada setiap pembayaran bulanan.
                  </li>
                  <li>
                    Pokok pembiayaan maksimal{" "}
                    {formatRupiah(KREDIT_BARANG_POKOK_MAKS)} setelah DP;
                    pembelian barang ditangani di luar aplikasi.
                  </li>
                </ul>
              )}
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                Semua nilai adalah perhitungan internal dan tidak dengan
                sendirinya membuktikan penyimpanan barang, pembayaran, atau
                pencairan.
              </p>
            </div>

            <aside className="rounded-2xl border border-gold/40 bg-card p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
                Sebelum mengajukan
              </p>
              <h2 className="mt-2 font-judul text-2xl leading-tight text-foreground">
                Siapkan tiga hal ini.
              </h2>
              <ol className="mt-5 divide-y divide-border">
                {(gadai
                  ? [
                      "Deskripsi barang dan nilai pasar yang ingin dicatat.",
                      `Batas LTV ${GADAI_PRICING.ltvMaxPercent}% serta sewa modal ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per ${GADAI_PRICING.periodeHari} hari.`,
                      "Kesadaran bahwa pemeriksaan fisik dan penitipan berlangsung di luar aplikasi.",
                    ]
                  : [
                      "Barang dan harga yang ingin dibiayai.",
                      `Uang muka ${KREDIT_PRICING.dpMinPersen}–${KREDIT_PRICING.dpMaxPersen}% dari harga barang.`,
                      `Tenor ${KREDIT_TENOR_PENGAJUAN_OPTIONS.join("/")} bulan serta total cicilan yang harus dibaca.`,
                    ]
                ).map((langkah, i) => (
                  <li key={langkah} className="flex gap-3 py-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-gold/45 bg-secondary font-mono text-xs text-gold-foreground">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {langkah}
                    </p>
                  </li>
                ))}
              </ol>
              <Button
                asChild
                className="mt-5 min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to={FORM_HREF}>Buat akun untuk melanjutkan</Link>
              </Button>
              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                Angka final diperiksa petugas sebelum akad.
              </p>
            </aside>
          </section>
        ) : null}

        {cara ? (
          <section className="mt-9">
            <ol className="divide-y divide-border border-y border-border">
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
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <h2 className="font-semibold">{step}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-xl border border-border bg-card p-4 text-sm leading-6 text-foreground">
              Pencairan, pelunasan, pembayaran, pemeriksaan fisik, dan penitipan
              barang berlangsung di luar aplikasi.
            </p>
            <Button
              asChild
              className="mt-5 min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link to={FORM_HREF}>Mulai dengan akun</Link>
            </Button>
          </section>
        ) : null}

        {keamanan ? (
          <section className="mt-9 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldCheck
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                Akses dan akun
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Dashboard memerlukan akun; kode email digunakan untuk masuk dan
                OTP WhatsApp untuk verifikasi nomor pada alur yang
                memerlukannya. Jaga kode OTP dan jangan membagikannya. Riwayat
                tidak ditampilkan ke publik.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <LockKeyhole
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                Data yang dicatat
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
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
            <article className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold">Batas pencatatan</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Aplikasi mencatat pengajuan, hasil hitung, perubahan status, dan
                riwayat. Aplikasi tidak memindahkan uang atau
                memeriksa/menyimpan barang. Catatan status bukan bukti
                transaksi.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold">Akses informasi</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Informasi akun dan pengajuan tidak ditampilkan ke publik. Akses
                mengikuti akun dan peran; pendana yang diberi akses dapat
                melihat ringkasan pinjaman, bukan dokumen identitas.
              </p>
              <Link
                className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"
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
              className="overflow-hidden rounded-2xl border border-border bg-card px-4 sm:px-6"
            >
              {faqItems.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="min-h-12 text-left font-semibold">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="mt-6 text-sm text-muted-foreground">
              Perlu membaca ketentuan lengkap?{" "}
              <Link
                className="font-semibold text-primary underline underline-offset-4"
                to="/syarat-ketentuan"
              >
                Buka Syarat &amp; Ketentuan
              </Link>
              .
            </p>
          </section>
        ) : null}
        {cara ? (
          <section className="mt-8 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Proses di luar aplikasi</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Pencairan dana, cicilan, pelunasan, pemeriksaan fisik, serta
              penitipan atau pengembalian barang ditangani di luar aplikasi.
              PINDAI menyimpan catatan status dan hitungannya.
            </p>
          </section>
        ) : null}
      </main>
      {faqKonteks ? (
        <FaqLayanan
          id={`faq-${jenisLayanan ?? "layanan"}`}
          judul={faqKonteks.judul}
          deskripsi={faqKonteks.deskripsi}
          daftar={faqKonteks.daftar}
          pesanChat={faqKonteks.pesanChat}
        />
      ) : null}
      <InfoFooter />
    </div>
  );
}

export { ROUTES as PUBLIC_INFO_ROUTES };

/** Rute publik: tarif denda dibaca dari pengaturan admin yang berlaku. */
export default function PublicInfoPage() {
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  return <PublicInfoPageView ketentuan={ketentuan} />;
}
