import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  Calculator,
  Coins,
  Loader2,
  Package,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { WaOtpDialog } from "@/components/WaOtpDialog";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { persenBungaPerBulan } from "@/lib/bulanan";
import {
  KATALOG_CONTOH,
  KREDIT_ASUMSI_AWAL,
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
  quoteKreditBarang,
  skemaBulananKredit,
  type KreditBarangQuote,
} from "@/lib/kredit";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

import { EmptyState, Loading } from "./feedback";

/** Harga barang awal pada kalkulator (contoh umum elektronik). */
const HARGA_AWAL = 10_000_000;

/** Angka persen dengan desimal gaya Indonesia (2,5 → "2,5"). */
function persenId(v: number): string {
  return v.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** Lokasi spesifik tidak termasuk informasi yang dibagikan kepada Pendana. */
function KeteranganWilayah() {
  return (
    <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
      Wilayah umum belum tersedia untuk dibagikan; alamat dan koordinat tidak ditampilkan. Dokumen identitas dan dokumen asli hanya dapat diakses admin berwenang.
    </p>
  );
}

/** Baris rincian label–nilai untuk kartu hasil. */
function Baris({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={cn("min-w-0 text-xs", strong ? "text-slate-900" : "text-muted-foreground")}>
          {label}
        </p>
        {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn("min-w-0 break-words text-right tabular-nums", strong ? "text-sm font-semibold" : "text-sm")}>
        {value}
      </p>
    </div>
  );
}

/**
 * Tab "Kredit Barang": catatan pengajuan dan alokasi simulasi internal, lalu kalkulator.
 */
export function KreditBarangSection() {
  return (
    <div className="flex flex-col gap-10">
      <PeluangKreditSection />
      <PortofolioKreditSection />
      <KalkulatorKreditSection />
    </div>
  );
}

/**
 * Kalkulator simulasi barang & imbal hasil hipotetis (Skema C). Semua angka dihitung
 * engine `quoteKreditBarang` (integer rupiah, HALF-UP) sebagai ilustrasi internal
 * yang sama dengan perhitungan aplikasi; bukan bukti pengajuan atau pendanaan.
 */
function KalkulatorKreditSection() {
  const [hargaInput, setHargaInput] = useState(HARGA_AWAL.toLocaleString("id-ID"));
  const [namaTerpilih, setNamaTerpilih] = useState<string | null>(null);
  const [dpPersen, setDpPersen] = useState<number>(KREDIT_ASUMSI_AWAL.dpPersen);
  const [tenorBulan, setTenorBulan] = useState<number>(KREDIT_ASUMSI_AWAL.tenorBulan);
  const [marginPersenPerBulan, setMarginPersenPerBulan] = useState<number>(
    KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
  );
  const [porsiPendanaPersen, setPorsiPendanaPersen] = useState<number>(
    KREDIT_ASUMSI_AWAL.porsiPendanaPersen,
  );

  // Tenor 1/3/6 bulan memakai skema bulanan (DP 0%, bunga menurun) — slider DP
  // dan margin tidak berpengaruh, jadi diganti keterangan otomatis engine.
  const bulanan = skemaBulananKredit(tenorBulan);

  // ===== Validasi harga barang (rentang skema kredit barang) =====
  const { harga, hargaError } = useMemo(() => {
    if (hargaInput.trim() === "") {
      return { harga: null as number | null, hargaError: null as string | null };
    }
    try {
      const nilai = parseRupiah(hargaInput);
      if (
        nilai < KREDIT_PRICING.minHargaBarang ||
        nilai > KREDIT_BARANG_POKOK_MAKS
      ) {
        return {
          harga: null,
          hargaError: `Harga barang untuk pengajuan baru harus antara ${formatRupiah(KREDIT_PRICING.minHargaBarang)} dan ${formatRupiah(KREDIT_BARANG_POKOK_MAKS)}.`,
        };
      }
      return { harga: nilai, hargaError: null };
    } catch (err) {
      return {
        harga: null,
        hargaError: err instanceof Error ? err.message : "Harga barang tidak valid.",
      };
    }
  }, [hargaInput]);

  const quote = useMemo<KreditBarangQuote | null>(() => {
    if (harga === null) return null;
    try {
      return quoteKreditBarang({
        hargaBarang: harga,
        dpPersen,
        tenorBulan,
        marginPersenPerBulan,
        porsiPendanaPersen,
      });
    } catch {
      return null;
    }
  }, [harga, dpPersen, tenorBulan, marginPersenPerBulan, porsiPendanaPersen]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">
            Skema C
          </Badge>
          <Badge className="border-0 bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100">
            Elektronik &amp; Marketplace
          </Badge>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Kalkulator simulasi Imbal Hasil Kredit Barang</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Ilustrasi perhitungan barang dari merchant yang dicantumkan. Data, harga, dan merchant tidak diverifikasi; aplikasi tidak memproses pembelian atau pembayaran barang. Pengajuan baru memiliki pokok simulasi maksimal{" "}
          {formatRupiah(KREDIT_BARANG_POKOK_MAKS)} dan tenor 1, 3, atau 6 bulan; catatan lama tetap ditampilkan sebagai data ledger.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ===== Panel input simulasi ===== */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Simulasi Barang</h3>

          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="kredit-harga" className="text-xs text-muted-foreground">
              Harga acuan barang yang dicantumkan (tidak diverifikasi)
            </Label>
            <Input
              id="kredit-harga"
              required
              aria-required="true"
              inputMode="numeric"
              placeholder="10.000.000"
              value={hargaInput}
              aria-invalid={hargaError !== null}
              aria-describedby={hargaError !== null ? "kredit-harga-error" : undefined}
              onChange={(e) => {
                setHargaInput(e.target.value);
                setNamaTerpilih(null);
              }}
              className="tabular-nums"
            />
            {hargaError !== null && (
              <p id="kredit-harga-error" role="alert" aria-live="assertive" className="text-xs text-red-600">
                {hargaError}
              </p>
            )}
            {namaTerpilih !== null && (
              <p className="text-xs text-muted-foreground">Contoh terpilih: {namaTerpilih}</p>
            )}
          </div>

          <div className="mt-3">
            <p id="kredit-catalog-label" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="size-3.5" />
              Pilih dari contoh barang
            </p>
            <div role="group" aria-labelledby="kredit-catalog-label" className="mt-2 flex flex-wrap gap-1.5">
              {KATALOG_CONTOH.filter((item) => item.harga <= KREDIT_BARANG_POKOK_MAKS).map((item) => {
                const aktif = namaTerpilih === item.nama;
                return (
                  <button
                    key={item.nama}
                    type="button"
                    aria-pressed={aktif}
                    onClick={() => {
                      setHargaInput(item.harga.toLocaleString("id-ID"));
                      setNamaTerpilih(item.nama);
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      aktif
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary",
                    )}
                  >
                    {item.nama} · {formatRupiah(item.harga)}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="my-5" />

          {/* Uang muka */}
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Uang muka simulasi (DP)</Label>
            <span className="text-xs font-semibold tabular-nums">
              {bulanan ? 0 : persenId(dpPersen)}% · {formatRupiah(quote?.dp ?? 0)}
            </span>
          </div>
          {bulanan ? (
            <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-800">
              Model simulasi tenor {tenorBulan} bulan memakai DP 0%; ini bukan bukti pendanaan atau pembelian barang.
            </p>
          ) : (
            <>
              <Slider
                className="mt-3"
                min={KREDIT_PRICING.dpMinPersen}
                max={KREDIT_PRICING.dpMaxPersen}
                step={5}
                value={[dpPersen]}
                onValueChange={(v) => setDpPersen(v[0] ?? KREDIT_PRICING.dpMinPersen)}
                aria-label="Persen uang muka"
                aria-describedby="kredit-dp-help"
                aria-valuetext={`${persenId(dpPersen)} persen`}
              />
              <p id="kredit-dp-help" className="mt-1.5 text-xs text-muted-foreground">
                Rentang {KREDIT_PRICING.dpMinPersen}–{KREDIT_PRICING.dpMaxPersen}% dari harga acuan yang dimasukkan.
              </p>
            </>
          )}

          {/* Tenor */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Tenor simulasi</Label>
            <span className="text-xs font-semibold tabular-nums">{tenorBulan} bulan</span>
          </div>
          <div role="group" aria-label="Pilih tenor simulasi" className="mt-2 grid grid-cols-3 gap-1.5">
            {KREDIT_TENOR_PENGAJUAN_OPTIONS.map((bulan) => {
              const aktif = bulan === tenorBulan;
              return (
                <button
                  key={bulan}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => setTenorBulan(bulan)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    aktif
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary",
                  )}
                >
                  {bulan} bln
                </button>
              );
            })}
          </div>

          {/* Imbal Hasil */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Imbal Hasil simulasi per bulan</Label>
            <span className="text-xs font-semibold tabular-nums">
              {persenId(bulanan ? persenBungaPerBulan(tenorBulan) : marginPersenPerBulan)}% ·
              {quote !== null ? ` ${formatRupiah(quote.marginPerBulan)}` : " —"}
            </span>
          </div>
          {bulanan ? (
            <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Bunga simulasi mengikuti tenor: 10%/bln (1 bulan), 8%/bln (3–5 bulan), 7,5%/bln
              (≥ 6 bulan). Ini perhitungan internal, bukan janji atau bukti pembayaran kepada Pendana.
            </p>
          ) : (
            <>
              <Slider
                className="mt-3"
                min={KREDIT_PRICING.marginMinPersenPerBulan}
                max={KREDIT_PRICING.marginMaxPersenPerBulan}
                step={0.25}
                value={[marginPersenPerBulan]}
                onValueChange={(v) =>
                  setMarginPersenPerBulan(v[0] ?? KREDIT_PRICING.marginMinPersenPerBulan)
                }
                aria-label="Persen Imbal Hasil simulasi per bulan"
                aria-describedby="kredit-margin-help"
                aria-valuetext={`${persenId(marginPersenPerBulan)} persen per bulan`}
              />
              <p id="kredit-margin-help" className="mt-1.5 text-xs text-muted-foreground">
                Rentang {persenId(KREDIT_PRICING.marginMinPersenPerBulan)}–
                {persenId(KREDIT_PRICING.marginMaxPersenPerBulan)}% per bulan dari pokok acuan; angka ilustrasi, bukan hak atau janji pembayaran.
              </p>
            </>
          )}

          {/* Porsi pendanaan */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Porsi alokasi simulasi</Label>
            <span className="text-xs font-semibold tabular-nums">
              {persenId(porsiPendanaPersen)}%
            </span>
          </div>
          <Slider
            className="mt-3"
            min={KREDIT_PRICING.minPorsiPendanaPersen}
            max={100}
            step={5}
            value={[porsiPendanaPersen]}
            onValueChange={(v) =>
              setPorsiPendanaPersen(v[0] ?? KREDIT_PRICING.minPorsiPendanaPersen)
            }
            aria-label="Porsi alokasi simulasi"
            aria-describedby="kredit-porsi-help"
            aria-valuetext={`${persenId(porsiPendanaPersen)} persen`}
          />
          <p id="kredit-porsi-help" className="mt-1.5 text-xs text-muted-foreground">
            Persentase ini hanya membagi target pada ledger simulasi; bukan komitmen pendanaan atau bukti dana tersedia.
          </p>
        </section>

        {/* ===== Panel hasil ===== */}
        <div className="flex flex-col gap-4">
          {quote === null ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
              <Calculator className="mx-auto size-5 text-slate-400" />
              <p className="mt-4 text-sm font-medium">Masukkan harga barang yang valid</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Rentang harga barang untuk model simulasi adalah{" "}
                {formatRupiah(KREDIT_PRICING.minHargaBarang)} sampai{" "}
                {formatRupiah(KREDIT_BARANG_POKOK_MAKS)}.
              </p>
            </div>
          ) : (
            <>
              {/* Sisi Konsumen */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ShoppingBag className="size-4 text-slate-500" />
                    Rincian simulasi Konsumen
                  </h3>
                  <Badge className="border-0 bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100">
                    Tenor {tenorBulan} bulan
                  </Badge>
                </div>
                <div className="mt-3 divide-y divide-slate-100">
                  <Baris label="Harga acuan barang (tidak diverifikasi)" value={formatRupiah(quote.hargaBarang)} strong />
                  <Baris
                    label="Uang muka simulasi (DP)"
                    value={formatRupiah(quote.dp)}
                    hint={`${persenId(dpPersen)}% dari harga barang`}
                  />
                  <Baris
                    label="Pokok acuan simulasi (tidak ditransfer)"
                    value={formatRupiah(quote.pokokDibiayai)}
                    hint={`Batas pokok pada model pengajuan baru ${formatRupiah(KREDIT_BARANG_POKOK_MAKS)}`}
                  />
                  <Baris
                    label={`Biaya layanan simulasi (${persenId(KREDIT_PRICING.biayaLayananPersen)}%)`}
                    value={formatRupiah(quote.biayaLayanan)}
                    hint="Asumsi perhitungan; bukan bukti pembayaran"
                  />
                  <Baris
                    label="Imbal Hasil simulasi per bulan"
                    value={formatRupiah(quote.marginPerBulan)}
                    hint={`${persenId(marginPersenPerBulan)}% dari pokok acuan simulasi`}
                  />
                  <Baris
                    label="Cicilan simulasi per bulan"
                    value={formatRupiah(quote.cicilanPerBulan)}
                    hint={`Pokok acuan ÷ ${tenorBulan} + Imbal Hasil simulasi bulanan`}
                    strong
                  />
                  {quote.cicilanTerakhir !== quote.cicilanPerBulan && (
                    <Baris
                      label="Cicilan simulasi terakhir"
                      value={formatRupiah(quote.cicilanTerakhir)}
                      hint="Menyesuaikan selisih pembulatan dalam model"
                    />
                  )}
                  <Baris
                    label="Total kewajiban simulasi Konsumen"
                    value={formatRupiah(quote.totalDibayarKonsumen)}
                    hint="Penjumlahan komponen dalam model; bukan pembayaran aktual"
                    strong
                  />
                </div>
              </section>

              {/* Sisi Pendana */}
              <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm ring-1 ring-emerald-100">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <TrendingUp className="size-4" />
                    </span>
                    Imbal Hasil simulasi Pendana
                  </h3>
                </div>
                <div className="mt-4 rounded-xl bg-emerald-50/70 px-4 py-3">
                  <p className="text-xs text-emerald-800/80">Total hipotetis pada model simulasi</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
                    {formatRupiah(quote.totalDiterima)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-800/80">
                    Pokok acuan simulasi {formatRupiah(quote.porsiPendana)} + Imbal Hasil simulasi{" "}
                    {formatRupiah(quote.imbalHasil)}; tidak ditransfer
                  </p>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Porsi alokasi simulasi Anda</span>
                    <span className="tabular-nums">
                      {persenId(quote.porsiPendanaPersen)}% dari pokok acuan simulasi
                    </span>
                  </div>
                  <Progress className="mt-2" value={quote.porsiPendanaPersen} />
                </div>

                <div className="mt-3 divide-y divide-slate-100">
                  <Baris
                    label="Imbal Hasil simulasi per bulan"
                    value={formatRupiah(quote.imbalHasilPerBulan)}
                    hint="Ilustrasi proporsional dengan porsi alokasi simulasi"
                  />
                  <Baris
                    label={`Total Imbal Hasil simulasi × ${tenorBulan} bulan`}
                    value={formatRupiah(quote.imbalHasil)}
                    strong
                  />
                  <Baris
                    label="Persentase Imbal Hasil simulasi"
                    value={`${persenId(quote.persenImbalHasil)}%`}
                    hint={`Setara ${persenId(quote.persenImbalHasilTahunan)}% per tahun dari porsi alokasi simulasi`}
                    strong
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* ===== Jadwal cicilan ===== */}
      {quote !== null && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Jadwal simulasi cicilan Konsumen</h3>
            <Badge className="border-0 bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100">
              {tenorBulan} bulan · {bulanan ? "bunga menurun" : "cicilan flat"}
            </Badge>
          </div>
          <div className="mt-4 max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">
                    Bulan
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Pokok simulasi
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Imbal Hasil simulasi
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Cicilan simulasi
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Sisa pokok simulasi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {quote.jadwal.map((row) => (
                  <tr key={row.bulan}>
                    <td className="py-2 pr-3 text-muted-foreground">{row.bulan}</td>
                    <td className="py-2 text-right">{formatRupiah(row.pokok)}</td>
                    <td className="py-2 text-right text-emerald-700">
                      {formatRupiah(row.margin)}
                    </td>
                    <td className="py-2 text-right font-medium">{formatRupiah(row.total)}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatRupiah(row.sisaPokok)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Angka dihitung mesin simulasi PINDAI (rupiah bulat, pembulatan HALF-UP) untuk ilustrasi saja. Tampilan, slider, atau status aplikasi bukan kontrak, persetujuan, komitmen pendanaan, maupun janji pembayaran.
          </p>
        </section>
      )}
    </div>
  );
}

/** Kolom peluang kredit barang yang dipakai kartu Alokasi Dana. */
type JadwalKredit = {
  bulan: number;
  pokok: number;
  imbalHasil: number;
  biayaLayanan: number;
  total: number;
  sisaPokok: number;
};

type PeluangKredit = {
  _id: Id<"kreditBarang">;
  nomorReferensi: string;
  kodePeminjam: string;
  statusVerifikasi: string;
  namaBarang: string;
  kategori: string;
  merchant: string;
  hargaBarang: number;
  dp: number;
  dpPersen: number;
  pokokDibiayai: number;
  tenorBulan: number;
  marginPersenPerBulan: number;
  cicilanPerBulan: number;
  imbalHasilTotal: number;
  persenImbalHasil: number;
  persenImbalHasilTahunan: number;
  biayaLayanan: number;
  biayaLayananDiMuka: number;
  biayaLayananPerBulan: number;
  totalDibayarKonsumen: number;
  jadwalPembayaran: JadwalKredit[];
  catatanJadwal: string;
  terkumpul: number;
  sisaKebutuhan: number;
};

/**
 * Catatan kredit barang yang berstatus disetujui di aplikasi dan belum mencapai
 * target alokasi ledger simulasi; tidak ada perpindahan dana eksternal.
 */
function PeluangKreditSection() {
  const peluang = useQuery(api.pendana.marketplaceKredit);

  return (
    <section>
      <div className="flex items-center gap-2">
        <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">Skema C</Badge>
        <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3" /> Status aplikasi
        </Badge>
      </div>
      <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
        Simulasi Alokasi Kredit Barang
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Parameter barang dan status review dicatat pada aplikasi. Slider dan tombol alokasi hanya memperbarui ledger simulasi internal; tidak ada dana yang dikirim ke merchant atau Peminjam, dan angka imbal hasil bukan janji pembayaran.
      </p>

      {peluang === undefined ? (
        <Loading />
      ) : peluang.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={ShoppingBag}
            title="Belum ada catatan kredit barang"
            body="Catatan pengajuan yang berstatus disetujui di aplikasi akan tampil di sini dengan target simulasi ledger."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {peluang.map((row) => (
            <PeluangKreditCard key={row._id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function PeluangKreditCard({ row }: { row: PeluangKredit }) {
  const alokasi = useMutation(api.pendana.alokasiKreditBarang);
  const waOtpStatus = useQuery(api.security.myWaOtpStatus, {});
  const [open, setOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [waNomorPendana, setWaNomorPendana] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  const full = row.sisaKebutuhan <= 0;
  const pct = Math.min(100, Math.round((row.terkumpul / row.pokokDibiayai) * 100));
  const estimasi =
    parsed !== null && parsed > 0
      ? Math.floor(
          (row.imbalHasilTotal * Math.min(parsed, row.sisaKebutuhan)) / row.pokokDibiayai,
        )
      : 0;

  const alokasikan = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan jumlah rupiah bulat yang valid.");
      return;
    }
    // OTP WA wajib (bila diaktifkan Pendana) — verifikasi dulu, lanjut di callback.
    if (waOtpStatus?.aktif) {
      if (waNomorPendana.replace(/\D/g, "").length < 8) {
        setError("Masukkan nomor WhatsApp Anda (format 62…) untuk menerima kode OTP.");
        return;
      }
      setOtpOpen(true);
      return;
    }
    await eksekusi(null);
  };

  const eksekusi = async (kodeOtp: string | null) => {
    setBusy(true);
    try {
      await alokasi({
        kreditId: row._id,
        jumlah: parsed!,
        ...(kodeOtp !== null ? { kodeOtp } : {}),
      });
      toast.success("Catatan alokasi simulasi tersimpan di ledger internal. Tidak ada dana yang ditransfer.");
      setOpen(false);
      setOtpOpen(false);
      setJumlah("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Pencatatan alokasi simulasi gagal: ${err.message}. Tidak ada transfer yang diproses.`
          : "Pencatatan alokasi simulasi gagal. Tidak ada transfer yang diproses.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">
            Kredit Barang · {row.kategori}
          </Badge>
          <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
            <BadgeCheck className="mr-1 size-3" /> Status aplikasi: {row.statusVerifikasi}
          </Badge>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Kode peminjam</p>
        <p className="font-mono text-sm font-semibold tracking-wide">{row.kodePeminjam}</p>
        <p className="mt-2 text-lg font-semibold">{row.namaBarang}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.nomorReferensi} · kategori {row.kategori} · sumber barang yang dicantumkan: {row.merchant}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Harga acuan (tidak diverifikasi)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatRupiah(row.hargaBarang)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uang muka simulasi (DP)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{row.dpPersen}% · {formatRupiah(row.dp)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pokok acuan simulasi</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatRupiah(row.pokokDibiayai)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tenor simulasi</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{row.tenorBulan} bulan</dd>
        </div>
      </dl>

      <section className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-xs">
        <h3 className="font-semibold">Rincian perhitungan simulasi</h3>
        <dl className="mt-2 space-y-1.5">
          <Baris label="Total biaya layanan simulasi" value={formatRupiah(row.biayaLayanan)} />
          <Baris
            label={row.biayaLayananDiMuka > 0 ? "Asumsi potongan biaya layanan simulasi di muka" : "Biaya layanan simulasi per bulan (rata-rata)"}
            value={formatRupiah(row.biayaLayananDiMuka > 0 ? row.biayaLayananDiMuka : row.biayaLayananPerBulan)}
          />
          <Baris label="Imbal Hasil simulasi total" value={`${formatRupiah(row.imbalHasilTotal)} · ${persenId(row.persenImbalHasil)}% (${persenId(row.persenImbalHasilTahunan)}%/tahun)`} />
          <Baris label="Total kewajiban simulasi Konsumen" value={formatRupiah(row.totalDibayarKonsumen)} hint="Bukan tagihan atau bukti pembayaran" strong />
        </dl>
        <p className="mt-2 border-t border-slate-100 pt-2 text-muted-foreground">Catatan aplikasi (bukan tagihan atau bukti transaksi): {row.catatanJadwal}</p>
      </section>

      <section className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-xs">
        <h3 className="font-semibold">Ilustrasi jadwal simulasi</h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {row.jadwalPembayaran.map((cicilan) => (
            <li key={cicilan.bulan} className="py-2">
              <div className="flex justify-between gap-3">
                <span>Bulan simulasi {cicilan.bulan}</span>
                <span className="font-semibold tabular-nums">{formatRupiah(cicilan.total)}</span>
              </div>
              <p className="mt-1 text-right text-muted-foreground">
                Pokok simulasi {formatRupiah(cicilan.pokok)} · Imbal Hasil simulasi {formatRupiah(cicilan.imbalHasil)} · layanan simulasi {formatRupiah(cicilan.biayaLayanan)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Progress pendanaan */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">Alokasi tercatat di ledger simulasi</span>
          <span className="tabular-nums text-muted-foreground">
            {formatRupiah(row.terkumpul)} / {formatRupiah(row.pokokDibiayai)}
          </span>
        </div>
        <Progress className="mt-1.5 h-2.5" value={pct} />
        <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
          Sisa target alokasi simulasi {formatRupiah(row.sisaKebutuhan)} · margin simulasi {persenId(row.marginPersenPerBulan)}%/bulan
        </p>
      </div>

      {full ? (
        <Badge className="mt-4 border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3.5" /> Target simulasi tercapai
        </Badge>
      ) : (
        <>
          <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
            <Coins className="mr-1.5 size-4" />
            Catat alokasi simulasi
          </Button>
          <KeteranganWilayah />
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat alokasi simulasi — Kredit Barang</DialogTitle>
            <DialogDescription>
              {row.nomorReferensi} · target alokasi simulasi yang tersisa {formatRupiah(row.sisaKebutuhan)}. Nilai yang dicatat melebihi sisa akan ditolak.
            </DialogDescription>
          </DialogHeader>
          <KeteranganWilayah />
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`kredit-alo-${row.nomorReferensi}`}>Jumlah alokasi pada ledger simulasi</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id={`kredit-alo-${row.nomorReferensi}`}
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  onBlur={() => {
                    if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
                  }}
                  placeholder={`Maks ${formatRupiah(row.sisaKebutuhan)}`}
                  disabled={busy}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Estimasi imbal hasil simulasi:{" "}
                <span className="font-semibold tabular-nums text-emerald-700">
                  {formatRupiah(estimasi)}
                </span>{" "}
                (proporsional porsi pokok)
              </p>
            </div>
            {error !== null && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {waOtpStatus?.aktif && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Label htmlFor={`kredit-alo-wa-${row.nomorReferensi}`}>
                  Nomor WhatsApp verifikasi (62…)
                </Label>
                <Input
                  id={`kredit-alo-wa-${row.nomorReferensi}`}
                  inputMode="tel"
                  value={waNomorPendana}
                  onChange={(e) => setWaNomorPendana(e.target.value)}
                  placeholder="628123456789"
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  Verifikasi OTP melindungi tindakan akun sebelum catatan alokasi simulasi disimpan (5 menit, sekali pakai); tidak memverifikasi dana atau transfer.
                </p>
              </div>
            )}
            <Button className="w-full" disabled={busy || parsed === null} onClick={alokasikan}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan catatan alokasi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {waNomorPendana !== "" && (
        <WaOtpDialog
          open={otpOpen}
          onOpenChange={setOtpOpen}
          tujuan={waNomorPendana.replace(/\D/g, "")}
          alasan={`Alokasi Dana Kredit Barang ${row.nomorReferensi}`}
          onVerified={() => void eksekusi(null)}
        />
      )}
    </article>
  );
}

/** Riwayat catatan alokasi simulasi kredit barang milik Pendana. */
function PortofolioKreditSection() {
  const rows = useQuery(api.pendana.myKreditFundings);

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Catatan alokasi simulasi Kredit Barang saya</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Catatan alokasi dan perhitungan imbal hasil simulasi pada ledger internal. Tidak ada pencairan ke merchant.
      </p>

      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={TrendingUp}
            title="Belum ada alokasi kredit barang"
            body="Catatan alokasi simulasi akan tampil di sini bersama status internal dan rincian perhitungannya."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((f) => (
            <li
              key={f._id}
              className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold tracking-wide">{f.kodePeminjam}</p>
                  <p className="mt-1 text-sm font-semibold">{f.namaBarang} · {f.kategori}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className="font-mono">{f.nomorReferensi}</span> →{" "}
                    <span className="font-mono">{f.kreditRef}</span> · merchant {f.merchant}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Status aplikasi: {f.statusPersetujuanTim}</p>
                </div>
                {f.statusAlokasi === "selesai" ? (
                  <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Lunas (ledger)
                  </Badge>
                ) : f.statusAlokasi === "dibatalkan" ? (
                  <Badge variant="destructive">Dibatalkan pada ledger</Badge>
                ) : f.statusKredit === "didanai" ? (
                  <Badge className="border-0 bg-sky-100 text-sky-700 hover:bg-sky-100">Catatan berjalan di ledger</Badge>
                ) : (
                  <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
                    Dalam simulasi alokasi
                  </Badge>
                )}
              </div>

              <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Alokasi tercatat di ledger</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(f.jumlahAlokasi)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Imbal hasil simulasi</dt>
                  <dd className="font-medium tabular-nums text-emerald-700">
                    {formatRupiah(f.imbalHasil)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Total simulasi jika status ledger lunas</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(f.totalDiterima)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Tenor &amp; cicilan simulasi</dt>
                  <dd className="tabular-nums">
                    {f.tenorBulan} bulan
                    {f.cicilanPerBulan !== null ? ` · ${formatRupiah(f.cicilanPerBulan)}/bln` : ""}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Entri simulasi tercatat</dt>
                  <dd className="tabular-nums">
                    {f.dibayarBulan}/{f.tenorBulan} bulan
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Total biaya layanan simulasi</dt>
                  <dd className="tabular-nums">{f.biayaLayanan !== null ? formatRupiah(f.biayaLayanan) : "Tidak tersedia"}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Total kewajiban simulasi Konsumen</dt>
                  <dd className="tabular-nums">{f.totalDibayarKonsumen !== null ? formatRupiah(f.totalDibayarKonsumen) : "Tidak tersedia"}</dd>
                </div>
              </dl>

              <div className="mt-4">
                <div className="flex justify-between gap-3 text-xs">
                  <span className="font-medium">Progres entri ledger simulasi</span>
                  <span className="tabular-nums text-muted-foreground">{f.dibayarBulan} dari {f.tenorBulan} cicilan</span>
                </div>
                <Progress className="mt-2 h-2.5" value={Math.min(100, Math.round((f.dibayarBulan / f.tenorBulan) * 100))} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Catatan: entri ledger hanya menunjukkan perubahan data tersimpan; bukan bukti cicilan dibayar atau dana diterima Pendana.
              </p>

              <section className="mt-4 rounded-xl border border-slate-200 px-3 py-3 text-xs">
                <h3 className="font-semibold">Ilustrasi jadwal dan perincian</h3>
                <p className="mt-1 text-muted-foreground">
                  {f.biayaLayananDiMuka !== null && f.biayaLayananDiMuka > 0
                    ? `Biaya layanan simulasi ${formatRupiah(f.biayaLayananDiMuka)} dihitung di muka dalam model; tidak ada penagihan.`
                    : `Biaya layanan simulasi per bulan rata-rata ${formatRupiah(f.biayaLayananPerBulan)} dihitung dalam model; tidak ada penagihan.`}
                </p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {f.jadwalPembayaran.map((cicilan, index) => (
                    <li key={cicilan.bulan} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">Bulan simulasi {cicilan.bulan}</span>
                        <span className={index < f.dibayarBulan ? "text-emerald-700" : "text-muted-foreground"}>
                          {index < f.dibayarBulan ? "Entri simulasi tercatat" : "Belum ada entri"}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-3">
                        <span className="text-muted-foreground">Pokok simulasi {formatRupiah(cicilan.pokok)} · Imbal Hasil simulasi {formatRupiah(cicilan.imbalHasil)}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{formatRupiah(cicilan.total)}</span>
                      </div>
                      <p className="mt-1 text-right text-muted-foreground">Biaya layanan simulasi {formatRupiah(cicilan.biayaLayanan)}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {f.statusAlokasi === "selesai"
                  ? "Status alokasi selesai tercatat di ledger internal. Ini bukan bukti pelunasan atau pencairan dana ke dompet Anda."
                  : f.statusKredit === "didanai"
                    ? "Target alokasi ledger tercapai. Tidak ada dana yang diteruskan ke merchant; progres hanya berdasarkan entri internal."
                    : f.statusKredit === "ditolak"
                      ? "Status pengajuan ditolak tercatat di aplikasi; tidak ada pengembalian dana eksternal yang diproses."
                      : "Target alokasi ledger belum tercapai; jadwal yang ditampilkan hanya simulasi dan tidak ada pembayaran aktual."}
              </p>
              <KeteranganWilayah />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
