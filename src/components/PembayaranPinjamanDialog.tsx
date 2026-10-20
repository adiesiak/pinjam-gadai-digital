import { Info, RefreshCw, ShieldCheck, TrendingDown, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { ManualPaymentEvidenceForm } from "@/components/ManualPaymentEvidenceForm";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import {
  hitungRencanaPembayaran,
  LABEL_MODE_PEMBAYARAN,
  opsiPerpanjangan,
  type ModePembayaranPinjaman,
} from "@/lib/perpanjanganPinjaman";
import { formatRupiah, kelompokkanDigit } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";

type PinjamanSaya = NonNullable<FunctionReturnType<typeof api.loans.getMyLoan>>;

const PENJELASAN: Record<ModePembayaranPinjaman, string> = {
  pelunasan_total:
    "Pokok dan bunga periode ini dibayar sekaligus. Setelah dicocokkan, pinjaman ditutup.",
  bunga_saja:
    "Bunga periode ini dilunasi, pokok tetap utuh, dan jatuh tempo diperpanjang.",
  cicil_pokok:
    "Bunga dan sebagian pokok dibayar. Bunga periode berikutnya dihitung ulang dari sisa pokok.",
};

/** Tier minimum produk: sisa pokok tidak boleh jatuh di bawah batas ini. */
const MIN_SISA_POKOK = 100_000;

export function IsiPembayaranPinjaman({
  loan,
  onClose,
}: {
  loan: PinjamanSaya | null;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ModePembayaranPinjaman>("bunga_saja");
  const [principalText, setPrincipalText] = useState(() => {
    const sisa = loan?.sisaPokok ?? 0;
    return String(Math.max(0, Math.min(100_000, sisa - MIN_SISA_POKOK)));
  });
  const [extensionDays, setExtensionDays] = useState(0);
  // `konfirmasi` menyimpan sidik rencana yang sudah dikonfirmasi. Bila isian
  // berubah, sidiknya ikut berubah dan formulir bukti otomatis ditutup — tanpa
  // effect yang memanggil setState.
  const [konfirmasi, setKonfirmasi] = useState<string | null>(null);
  const [sekarang] = useState(() => Date.now());

  const sisaPokok = loan?.sisaPokok ?? 0;
  const principalPaid = useMemo(() => {
    const digit = principalText.replace(/\D/g, "");
    return digit === "" ? 0 : Number(digit);
  }, [principalText]);
  // Hanya jalur cicil pokok yang mengubah dasar tier. Bayar bunga saja dan
  // pelunasan total tetap memakai pokok berjalan, bukan isian cicilan yang
  // mungkin masih tersimpan dari tab sebelumnya.
  const principalSesudah =
    mode === "cicil_pokok" ? Math.max(0, sisaPokok - principalPaid) : sisaPokok;
  const opsi = useMemo(
    () => (principalSesudah >= MIN_SISA_POKOK ? opsiPerpanjangan(principalSesudah) : []),
    [principalSesudah],
  );
  // Pilihan tenor diturunkan dari opsi yang sah. Saat sisa pokok berubah dan
  // tenor lama tidak lagi tersedia, yang pertama dipakai — tanpa setState di
  // dalam effect.
  const extensionTerpilih = opsi.some((o) => o.hari === extensionDays)
    ? extensionDays
    : (opsi[0]?.hari ?? 0);

  const pinjamanHitung = useMemo(() => {
    if (loan === null) return null;
    const bungaBerjalan =
      loan.nextInterestAmount ??
      (loan.pelunasan === null
        ? loan.quote.bunga
        : loan.pelunasan.totalKewajibanPelunasan - loan.sisaPokok);
    return {
      pokokPinjaman: loan.pokokPinjaman,
      remainingPrincipal: loan.sisaPokok,
      nextInterestAmount: Math.max(0, bungaBerjalan),
      nextDueDate: loan.nextDueDate ?? loan.pelunasan?.jatuhTempoPada,
      tenorHari: loan.tenorHari ?? undefined,
      tenorBulan: loan.tenorBulan ?? undefined,
      persenBunga: loan.persenBunga ?? undefined,
    };
  }, [loan]);

  const hasil = useMemo(() => {
    if (pinjamanHitung === null || loan === null) {
      return { rencana: null, galat: "Pinjaman tidak ditemukan." };
    }
    if (loan.tenorBulan !== null) {
      return { rencana: null, galat: "Pembayaran ini hanya tersedia untuk pinjaman harian." };
    }
    if (mode !== "pelunasan_total" && opsi.length === 0) {
      return { rencana: null, galat: "Sisa pokok belum memenuhi tier perpanjangan." };
    }
    try {
      return {
        rencana: hitungRencanaPembayaran({
          loan: pinjamanHitung,
          mode,
          extensionDays: mode === "pelunasan_total" ? undefined : extensionTerpilih,
          principalPaid: mode === "cicil_pokok" ? principalPaid : 0,
          waktuTransaksi: sekarang,
        }),
        galat: null,
      };
    } catch (error) {
      return {
        rencana: null,
        galat: error instanceof Error ? error.message : "Rencana pembayaran tidak dapat dihitung.",
      };
    }
  }, [loan, pinjamanHitung, mode, opsi.length, extensionTerpilih, principalPaid, sekarang]);

  const rencana = hasil.rencana;
  const bisaKirim =
    loan !== null &&
    !loan.pembayaranMenunggu &&
    rencana !== null &&
    hasil.galat === null;
  const sidikRencana = `${mode}-${extensionTerpilih}-${principalPaid}-${rencana?.totalDue ?? 0}`;
  const siapBayar = bisaKirim && konfirmasi === sidikRencana;
  const maxCicilan = Math.max(0, sisaPokok - MIN_SISA_POKOK);

  const isiCepat = (persen: number) => {
    const nominal = Math.min(maxCicilan, Math.round((sisaPokok * persen) / 100));
    setPrincipalText(String(nominal));
  };

  return (
    <>
      <DialogHeader>
          <DialogTitle>Atur pembayaran pinjaman</DialogTitle>
          <DialogDescription>
            {loan === null
              ? ""
              : `${loan.nomorReferensi} · sisa pokok ${formatRupiah(loan.sisaPokok)} · jatuh tempo ${
                  loan.pelunasan === null
                    ? "—"
                    : formatTanggalWIB(loan.pelunasan.jatuhTempoPada)
                }`}
          </DialogDescription>
        </DialogHeader>

        {loan?.pembayaranMenunggu && (
          <p
            role="status"
            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900"
          >
            Ada bukti pembayaran yang sedang dicocokkan admin. Tunggu hasilnya
            sebelum mengirim bukti baru.
          </p>
        )}

        {loan !== null && !loan.pembayaranMenunggu && (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              <Info className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden />
              Angka di bawah adalah pratinjau. Perubahan resmi dicatat setelah admin
              mencocokkan mutasi bank.
            </div>

            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as ModePembayaranPinjaman)}
              className="mt-1"
            >
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-slate-100 p-1">
                <TabsTrigger
                  value="pelunasan_total"
                  className="h-auto flex-col gap-0.5 px-2 py-2 text-[11px] sm:flex-row sm:text-xs"
                >
                  <Wallet className="size-4" aria-hidden />
                  Pelunasan total
                </TabsTrigger>
                <TabsTrigger
                  value="bunga_saja"
                  className="h-auto flex-col gap-0.5 px-2 py-2 text-[11px] sm:flex-row sm:text-xs"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  Bayar bunga saja
                </TabsTrigger>
                <TabsTrigger
                  value="cicil_pokok"
                  className="h-auto flex-col gap-0.5 px-2 py-2 text-[11px] sm:flex-row sm:text-xs"
                >
                  <TrendingDown className="size-4" aria-hidden />
                  Cicil pokok
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pelunasan_total">
                <p className="mt-3 text-sm leading-6 text-slate-700">{PENJELASAN.pelunasan_total}</p>
              </TabsContent>
              <TabsContent value="bunga_saja">
                <p className="mt-3 text-sm leading-6 text-slate-700">{PENJELASAN.bunga_saja}</p>
                <TenorPicker
                  opsi={opsi}
                  value={extensionTerpilih}
                  onChange={setExtensionDays}
                  pokok={principalSesudah}
                />
              </TabsContent>
              <TabsContent value="cicil_pokok">
                <p className="mt-3 text-sm leading-6 text-slate-700">{PENJELASAN.cicil_pokok}</p>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="cicilan-pokok">Nominal cicilan pokok</Label>
                  <Input
                    id="cicilan-pokok"
                    inputMode="numeric"
                    value={kelompokkanDigit(principalText)}
                    onChange={(e) => setPrincipalText(e.target.value.replace(/\D/g, ""))}
                    aria-describedby="cicilan-pokok-bantuan"
                    className="tabular-nums"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[25, 50, 100].map((persen) => (
                      <Button
                        key={persen}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs"
                        onClick={() => isiCepat(persen)}
                      >
                        {persen === 100 ? "Maksimum" : `${persen}%`}
                      </Button>
                    ))}
                  </div>
                  <p id="cicilan-pokok-bantuan" className="text-[11px] leading-5 text-muted-foreground">
                    Maksimum {formatRupiah(maxCicilan)} agar sisa pokok tetap minimal{" "}
                    {formatRupiah(MIN_SISA_POKOK)}. Untuk melunasi penuh, pilih tab
                    pelunasan total.
                  </p>
                </div>
                <TenorPicker
                  opsi={opsi}
                  value={extensionTerpilih}
                  onChange={setExtensionDays}
                  pokok={principalSesudah}
                />
              </TabsContent>
            </Tabs>

            {hasil.galat !== null ? (
              <p role="alert" className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {hasil.galat}
              </p>
            ) : rencana !== null ? (
              <RingkasanRencana rencana={rencana} />
            ) : null}

            {!siapBayar ? (
              <Button
                type="button"
                disabled={!bisaKirim}
                className="mt-4 h-11 w-full gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
                onClick={() => setKonfirmasi(sidikRencana)}
              >
                <ShieldCheck className="size-4" aria-hidden />
                Lanjut kirim bukti pembayaran
              </Button>
            ) : null}
          </>
        )}

        {loan !== null && siapBayar && rencana !== null && !loan.pembayaranMenunggu && (
          <ManualPaymentEvidenceForm
            key={sidikRencana}
            jenis="pinjaman"
            targetId={loan._id}
            reference={`${loan.nomorReferensi} · ${LABEL_MODE_PEMBAYARAN[mode]}`}
            suggestedAmount={rencana.totalDue}
            kunciJumlah
            pembayaran={{
              paymentType: mode,
              ...(mode === "pelunasan_total"
                ? {}
                : {
                    extensionDays: extensionTerpilih,
                    principalAmount: mode === "cicil_pokok" ? principalPaid : 0,
                  }),
            }}
            onBerhasil={onClose}
          />
        )}

      <Button type="button" variant="outline" className="mt-2 h-11 w-full" onClick={onClose}>
        Tutup
      </Button>
    </>
  );
}

/** Pembungkus modal: isi dipisah agar bisa dirender tanpa portal Radix. */
export function PembayaranPinjamanDialog({
  loan,
  onClose,
}: {
  loan: PinjamanSaya | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={loan !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <IsiPembayaranPinjaman loan={loan} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function TenorPicker({
  opsi,
  value,
  onChange,
  pokok,
}: {
  opsi: { hari: number; persenBunga: number }[];
  value: number;
  onChange: (hari: number) => void;
  pokok: number;
}) {
  if (opsi.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
        Tier perpanjangan belum tersedia untuk sisa pokok {formatRupiah(pokok)}.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-700">Perpanjang jatuh tempo</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {opsi.map((o) => {
          const aktif = o.hari === value;
          return (
            <button
              key={o.hari}
              type="button"
              onClick={() => onChange(o.hari)}
              aria-pressed={aktif}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                aktif
                  ? "border-emerald-700 bg-emerald-800 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <span className="block font-semibold">+{o.hari} hari</span>
              <span className={aktif ? "text-emerald-50" : "text-muted-foreground"}>
                tier {o.persenBunga}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RingkasanRencana({
  rencana,
}: {
  rencana: NonNullable<ReturnType<typeof hitungRencanaPembayaran>>;
}) {
  const penuh = rencana.mode === "pelunasan_total";
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white">
      <div className="bg-emerald-800 px-4 py-3 text-white">
        <p className="text-[11px] uppercase tracking-[0.12em] text-emerald-100">
          Total wajib bayar hari ini
        </p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums">
          {formatRupiah(rencana.totalDue)}
        </p>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        <Baris label="Bunga periode ini" nilai={formatRupiah(rencana.interestDue)} />
        {rencana.principalPaid > 0 && !penuh && (
          <Baris label="Cicilan pokok" nilai={formatRupiah(rencana.principalPaid)} />
        )}
        {rencana.lateFee > 0 && (
          <Baris
            label={`Denda ${rencana.hariTerlambat} hari`}
            nilai={formatRupiah(rencana.lateFee)}
            nada="denda"
          />
        )}
        {penuh ? (
          <Baris label="Sisa pokok dilunasi" nilai={formatRupiah(rencana.principalSebelum)} />
        ) : (
          <>
            <Baris
              label="Sisa pokok setelah dicocokkan"
              nilai={formatRupiah(rencana.principalSesudah)}
            />
            <Baris
              label={`Tier bunga baru (${rencana.tierRate}%)`}
              nilai={formatRupiah(rencana.nextInterestAmount)}
            />
            <Baris
              label="Jatuh tempo baru"
              nilai={
                rencana.nextDueDate === null
                  ? "Pinjaman ditutup"
                  : formatTanggalWIB(rencana.nextDueDate)
              }
            />
          </>
        )}
      </dl>
      <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] leading-5 text-slate-600">
        {penuh
          ? "Pinjaman berstatus lunas setelah mutasi bank cocok."
          : `Bunga periode berikutnya ${formatRupiah(rencana.nextInterestAmount)} (${rencana.tierRate}% × ${formatRupiah(rencana.principalSesudah)}).`}
      </p>
    </section>
  );
}

function Baris({
  label,
  nilai,
  nada,
}: {
  label: string;
  nilai: string;
  nada?: "denda";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className={nada === "denda" ? "text-red-700" : "text-muted-foreground"}>{label}</dt>
      <dd
        className={`text-right tabular-nums ${
          nada === "denda" ? "font-medium text-red-700" : "font-medium text-slate-900"
        }`}
      >
        {nilai}
      </dd>
    </div>
  );
}
