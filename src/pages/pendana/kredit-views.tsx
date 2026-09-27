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
  KREDIT_PRICING,
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
        <p className={cn("text-xs", strong ? "text-slate-900" : "text-muted-foreground")}>
          {label}
        </p>
        {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn("shrink-0 tabular-nums", strong ? "text-sm font-semibold" : "text-sm")}>
        {value}
      </p>
    </div>
  );
}

/**
 * Tab "Kredit Barang": peluang pendanaan nyata (pengajuan yang disetujui tim),
 * portofolio Alokasi Dana Pendana, lalu kalkulator simulasi.
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
 * Kalkulator simulasi barang & Imbal Hasil (Skema C). Semua angka dihitung
 * engine `quoteKreditBarang` (integer rupiah, HALF-UP) sehingga identik dengan
 * perhitungan saat pengajuan/pendanaan terbit.
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
        nilai > KREDIT_PRICING.maxHargaBarang
      ) {
        return {
          harga: null,
          hargaError: `Harga barang harus antara ${formatRupiah(KREDIT_PRICING.minHargaBarang)} dan ${formatRupiah(KREDIT_PRICING.maxHargaBarang)}.`,
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
        <h2 className="text-lg font-semibold tracking-tight">
          Kalkulator Imbal Hasil Kredit Barang
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Simulasi barang dari merchant mitra — marketplace maupun toko elektronik. Konsumen
          membayar uang muka lalu mencicil sisa harga; Pendana menerima Imbal Hasil flat per bulan
          selama tenor, proporsional dengan Alokasi Dana.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ===== Panel input simulasi ===== */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Simulasi Barang</h3>

          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="kredit-harga" className="text-xs text-muted-foreground">
              Harga barang di merchant mitra
            </Label>
            <Input
              id="kredit-harga"
              inputMode="numeric"
              placeholder="10.000.000"
              value={hargaInput}
              aria-invalid={hargaError !== null}
              onChange={(e) => {
                setHargaInput(e.target.value);
                setNamaTerpilih(null);
              }}
              className="tabular-nums"
            />
            {hargaError !== null && (
              <p role="alert" className="text-xs text-red-600">
                {hargaError}
              </p>
            )}
            {namaTerpilih !== null && (
              <p className="text-xs text-muted-foreground">Contoh terpilih: {namaTerpilih}</p>
            )}
          </div>

          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="size-3.5" />
              Pilih dari contoh barang
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {KATALOG_CONTOH.map((item) => {
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
                      "rounded-full border px-3 py-1 text-xs transition-colors",
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
            <Label className="text-xs text-muted-foreground">Uang muka (DP)</Label>
            <span className="text-xs font-semibold tabular-nums">
              {bulanan ? 0 : persenId(dpPersen)}% · {formatRupiah(quote?.dp ?? 0)}
            </span>
          </div>
          {bulanan ? (
            <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-800">
              Tenor {tenorBulan} bulan memakai DP 0% — pendanaan penuh, tanpa uang muka.
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
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Rentang {KREDIT_PRICING.dpMinPersen}–{KREDIT_PRICING.dpMaxPersen}% dari harga barang.
              </p>
            </>
          )}

          {/* Tenor */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Tenor cicilan</Label>
            <span className="text-xs font-semibold tabular-nums">{tenorBulan} bulan</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {KREDIT_PRICING.tenorBulanOptions.map((bulan) => {
              const aktif = bulan === tenorBulan;
              return (
                <button
                  key={bulan}
                  type="button"
                  aria-pressed={aktif}
                  onClick={() => setTenorBulan(bulan)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-medium tabular-nums transition-colors",
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
            <Label className="text-xs text-muted-foreground">Imbal Hasil per bulan</Label>
            <span className="text-xs font-semibold tabular-nums">
              {persenId(bulanan ? persenBungaPerBulan(tenorBulan) : marginPersenPerBulan)}% ·
              {quote !== null ? ` ${formatRupiah(quote.marginPerBulan)}` : " —"}
            </span>
          </div>
          {bulanan ? (
            <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Bunga menurun otomatis dari tenor: 10%/bln (1 bulan), 8%/bln (3–5 bulan), 7,5%/bln
              (≥ 6 bulan) — hak Pendana, dibayar bersamaan cicilan bulanan.
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
                aria-label="Persen Imbal Hasil per bulan"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Rentang {persenId(KREDIT_PRICING.marginMinPersenPerBulan)}–
                {persenId(KREDIT_PRICING.marginMaxPersenPerBulan)}% per bulan dari pokok dibiayai.
              </p>
            </>
          )}

          {/* Porsi pendanaan */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <Label className="text-xs text-muted-foreground">Porsi pendanaan saya</Label>
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
            aria-label="Porsi pendanaan"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Minimum {KREDIT_PRICING.minPorsiPendanaPersen}% dari pokok dibiayai; sisanya dapat
            didanai Pendana lain.
          </p>
        </section>

        {/* ===== Panel hasil ===== */}
        <div className="flex flex-col gap-4">
          {quote === null ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
              <Calculator className="mx-auto size-5 text-slate-400" />
              <p className="mt-4 text-sm font-medium">Masukkan harga barang yang valid</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Harga barang yang bisa didanai adalah{" "}
                {formatRupiah(KREDIT_PRICING.minHargaBarang)} sampai{" "}
                {formatRupiah(KREDIT_PRICING.maxHargaBarang)}.
              </p>
            </div>
          ) : (
            <>
              {/* Sisi Konsumen */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <ShoppingBag className="size-4 text-slate-500" />
                    Rincian Konsumen
                  </h3>
                  <Badge className="border-0 bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100">
                    Tenor {tenorBulan} bulan
                  </Badge>
                </div>
                <div className="mt-3 divide-y divide-slate-100">
                  <Baris label="Harga barang" value={formatRupiah(quote.hargaBarang)} strong />
                  <Baris
                    label="Uang muka (DP)"
                    value={formatRupiah(quote.dp)}
                    hint={`${persenId(dpPersen)}% dari harga barang`}
                  />
                  <Baris
                    label="Pokok dibiayai"
                    value={formatRupiah(quote.pokokDibiayai)}
                    hint="Sisa harga setelah DP — bagian yang didanai Pendana"
                  />
                  <Baris
                    label={`Biaya layanan (${persenId(KREDIT_PRICING.biayaLayananPersen)}%)`}
                    value={formatRupiah(quote.biayaLayanan)}
                    hint="Dibayar di muka oleh Konsumen"
                  />
                  <Baris
                    label="Imbal Hasil per bulan"
                    value={formatRupiah(quote.marginPerBulan)}
                    hint={`${persenId(marginPersenPerBulan)}% dari pokok dibiayai`}
                  />
                  <Baris
                    label="Cicilan per bulan"
                    value={formatRupiah(quote.cicilanPerBulan)}
                    hint={`Pokok ÷ ${tenorBulan} + Imbal Hasil bulanan`}
                    strong
                  />
                  {quote.cicilanTerakhir !== quote.cicilanPerBulan && (
                    <Baris
                      label="Cicilan terakhir"
                      value={formatRupiah(quote.cicilanTerakhir)}
                      hint="Menyerap selisih pembulatan pokok"
                    />
                  )}
                  <Baris
                    label="Total dibayar Konsumen"
                    value={formatRupiah(quote.totalDibayarKonsumen)}
                    hint="DP + biaya layanan + pokok dibiayai + total Imbal Hasil"
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
                    Keuntungan Pendana
                  </h3>
                </div>
                <div className="mt-4 rounded-xl bg-emerald-50/70 px-4 py-3">
                  <p className="text-xs text-emerald-800/80">Total diterima Pendana</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
                    {formatRupiah(quote.totalDiterima)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-800/80">
                    Porsi pokok {formatRupiah(quote.porsiPendana)} + Imbal Hasil{" "}
                    {formatRupiah(quote.imbalHasil)}
                  </p>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Bagian yang Anda danai</span>
                    <span className="tabular-nums">
                      {persenId(quote.porsiPendanaPersen)}% dari pokok dibiayai
                    </span>
                  </div>
                  <Progress className="mt-2" value={quote.porsiPendanaPersen} />
                </div>

                <div className="mt-3 divide-y divide-slate-100">
                  <Baris
                    label="Imbal Hasil per bulan"
                    value={formatRupiah(quote.imbalHasilPerBulan)}
                    hint="Proporsional dengan porsi pendanaan"
                  />
                  <Baris
                    label={`Imbal Hasil × ${tenorBulan} bulan`}
                    value={formatRupiah(quote.imbalHasil)}
                    strong
                  />
                  <Baris
                    label="Persen Imbal Hasil"
                    value={`${persenId(quote.persenImbalHasil)}%`}
                    hint={`Setara ${persenId(quote.persenImbalHasilTahunan)}% per tahun dari porsi pendanaan`}
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
            <h3 className="text-sm font-semibold">Jadwal Cicilan Konsumen</h3>
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
                    Pokok
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Imbal Hasil
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Cicilan
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Sisa Pokok
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
            Angka dihitung mesin PINDAI (integer rupiah, pembulatan HALF-UP) dan dipakai sama persis
            saat kontrak pendanaan diterbitkan. Imbal Hasil mengikuti margin yang disepakati pada
            peluang pendanaan.
          </p>
        </section>
      )}
    </div>
  );
}

/** Kolom peluang kredit barang yang dipakai kartu Alokasi Dana. */
type PeluangKredit = {
  _id: Id<"kreditBarang">;
  nomorReferensi: string;
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
  pemohonInisial: string;
  terkumpul: number;
  sisaKebutuhan: number;
};

/**
 * Peluang pendanaan kredit barang: pengajuan yang sudah lolos verifikasi tim
 * PINDAI dan belum terpenuhi penuh. Alokasi Dana dicatat di jurnal ledger
 * (debit akun kredit barang, kredit dompet Pendana).
 */
function PeluangKreditSection() {
  const peluang = useQuery(api.pendana.marketplaceKredit);

  return (
    <section>
      <div className="flex items-center gap-2">
        <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">Skema C</Badge>
        <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3" /> Terverifikasi tim PINDAI
        </Badge>
      </div>
      <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
        Peluang Pendanaan Kredit Barang
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Barang marketplace &amp; toko elektronik yang sudah disetujui tim PINDAI. Setelah pendanaan
        penuh, pokok diteruskan ke merchant mitra dan hak Imbal Hasil Anda proporsional dengan porsi
        pokok yang didanai.
      </p>

      {peluang === undefined ? (
        <Loading />
      ) : peluang.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={ShoppingBag}
            title="Belum ada peluang kredit barang"
            body="Pengajuan kredit barang yang disetujui tim PINDAI akan tampil di sini beserta sisa kebutuhan pendanaannya."
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
      toast.success("Alokasi Dana tercatat di jurnal pendanaan.");
      setOpen(false);
      setOtpOpen(false);
      setJumlah("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alokasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">
            Kredit Barang
          </Badge>
          <Badge className="border-0 bg-slate-100 text-[10px] text-slate-700 hover:bg-slate-100">
            {row.kategori}
          </Badge>
        </div>
        <p className="mt-2 text-lg font-semibold">{row.namaBarang}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.nomorReferensi} · {row.merchant} · Pemohon {row.pemohonInisial}
        </p>
      </div>

      {/* Rincian transparansi */}
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs">
        <div>
          <dt className="text-muted-foreground">Harga barang</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatRupiah(row.hargaBarang)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Uang muka Konsumen</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {row.dpPersen}% · {formatRupiah(row.dp)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tenor</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {row.tenorBulan} bulan · {formatRupiah(row.cicilanPerBulan)}/bln
          </dd>
        </div>
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-slate-200 px-3 py-2">
          <dt className="text-muted-foreground">Pokok dibiayai</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{formatRupiah(row.pokokDibiayai)}</dd>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
          <dt className="text-emerald-800/80">Hak Imbal Hasil (100%)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatRupiah(row.imbalHasilTotal)} · {persenId(row.persenImbalHasil)}% (
            {persenId(row.persenImbalHasilTahunan)}%/tahun)
          </dd>
        </div>
      </dl>

      {/* Progress pendanaan */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">Dana terkumpul</span>
          <span className="tabular-nums text-muted-foreground">
            {formatRupiah(row.terkumpul)} / {formatRupiah(row.pokokDibiayai)}
          </span>
        </div>
        <Progress className="mt-1.5 h-2.5" value={pct} />
        <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
          Sisa kebutuhan {formatRupiah(row.sisaKebutuhan)} · margin Imbal Hasil{" "}
          {persenId(row.marginPersenPerBulan)}%/bulan
        </p>
      </div>

      {full ? (
        <Badge className="mt-4 border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3.5" /> Terpenuhi penuh oleh Pendana
        </Badge>
      ) : (
        <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
          <Coins className="mr-1.5 size-4" />
          Alokasikan Dana Sekarang
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alokasikan Dana — Kredit Barang</DialogTitle>
            <DialogDescription>
              {row.nomorReferensi} · sisa kebutuhan {formatRupiah(row.sisaKebutuhan)}. Alokasi
              melebihi sisa akan ditolak server (anti-overfunding).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`kredit-alo-${row.nomorReferensi}`}>Jumlah alokasi</Label>
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
                Estimasi Imbal Hasil Anda:{" "}
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
                  Proteksi transaksi aktif — kode OTP dikirim ke nomor ini sebelum alokasi diproses
                  (5 menit, sekali pakai).
                </p>
              </div>
            )}
            <Button className="w-full" disabled={busy || parsed === null} onClick={alokasikan}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Konfirmasi Alokasi
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

/** Portofolio Alokasi Dana kredit barang milik Pendana. */
function PortofolioKreditSection() {
  const rows = useQuery(api.pendana.myKreditFundings);

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Portofolio Kredit Barang Saya</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Setiap Alokasi Dana Anda ke kredit barang, beserta hak Imbal Hasil dan status pencairannya
        ke merchant mitra.
      </p>

      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={TrendingUp}
            title="Belum ada alokasi kredit barang"
            body="Alokasikan Dana pada peluang di atas — posisi Anda tampil di sini lengkap dengan status pengajuan dan hak Imbal Hasilnya."
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
                  <p className="text-sm font-semibold">{f.namaBarang}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <span className="font-mono">{f.nomorReferensi}</span> →{" "}
                    <span className="font-mono">{f.kreditRef}</span> · {f.merchant} · {f.kategori}
                  </p>
                </div>
                {f.statusAlokasi === "selesai" ? (
                  <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Imbal Hasil Cair
                  </Badge>
                ) : f.statusAlokasi === "dibatalkan" ? (
                  <Badge variant="destructive">Dibatalkan</Badge>
                ) : (
                  <Badge className="border-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
                    Dalam Pendanaan
                  </Badge>
                )}
              </div>

              <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Dana dialokasikan</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(f.jumlahAlokasi)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Hak Imbal Hasil</dt>
                  <dd className="font-medium tabular-nums text-emerald-700">
                    {formatRupiah(f.imbalHasil)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Total diterima saat lunas</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(f.totalDiterima)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Tenor &amp; cicilan</dt>
                  <dd className="tabular-nums">
                    {f.tenorBulan} bulan
                    {f.cicilanPerBulan !== null ? ` · ${formatRupiah(f.cicilanPerBulan)}/bln` : ""}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Progres cicilan Konsumen</dt>
                  <dd className="tabular-nums">
                    {f.dibayarBulan}/{f.tenorBulan} bulan
                  </dd>
                </div>
              </dl>

              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {f.statusAlokasi === "selesai"
                  ? "Posisi selesai — porsi pokok dan Imbal Hasil sudah cair ke dompet Anda."
                  : f.statusKredit === "didanai"
                    ? `Pendanaan penuh — pokok diteruskan ke merchant mitra. Setiap cicilan Konsumen (bulan ${f.dibayarBulan + 1} berikutnya) mengalirkan porsi pokok + Imbal Hasil ke dompet Anda.`
                    : f.statusKredit === "ditolak"
                      ? "Pengajuan ditolak tim PINDAI — dana Anda dikembalikan ke dompet pada proses penutupan posisi."
                      : "Menunggu pendanaan penuh dari Pendana lain; dana Anda terkunci pada posisi ini."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
