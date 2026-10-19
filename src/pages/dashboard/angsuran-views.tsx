import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ManualPaymentEvidenceForm, ManualPaymentEvidenceHistory } from "@/components/ManualPaymentEvidenceForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import {
  LABEL_TAMPILAN_ANGSURAN,
  type TampilanAngsuran,
} from "@/lib/angsuran";
import { formatRupiah } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";
import { EmptyState } from "./empty-state";

type DataAngsuran = FunctionReturnType<typeof api.angsuran.myAngsuran>;
type Grup = DataAngsuran["grup"][number];
type Baris = Grup["angsuran"][number];

/** Nada visual mengikuti status, bukan warna acak. */
const NADA: Record<TampilanAngsuran, string> = {
  lunas: "border-emerald-200 bg-emerald-50 text-emerald-800",
  menunggu_verifikasi: "border-sky-200 bg-sky-50 text-sky-800",
  terlambat: "border-red-200 bg-red-50 text-red-700",
  hari_ini: "border-amber-300 bg-amber-50 text-amber-900",
  segera: "border-amber-200 bg-amber-50 text-amber-800",
  belum: "border-slate-200 bg-slate-50 text-slate-700",
};

function Lencana({ tampilan }: { tampilan: TampilanAngsuran }) {
  const Ikon =
    tampilan === "lunas"
      ? CheckCircle2
      : tampilan === "menunggu_verifikasi"
        ? Clock3
        : tampilan === "terlambat" || tampilan === "hari_ini"
          ? AlertTriangle
          : CalendarClock;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${NADA[tampilan]}`}
    >
      <Ikon className="size-3.5" aria-hidden />
      {LABEL_TAMPILAN_ANGSURAN[tampilan]}
    </span>
  );
}

/** Rincian satu baris — selalu terbuka supaya angka tidak tersembunyi. */
function RincianBaris({ baris }: { baris: Baris }) {
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <dt className="text-muted-foreground">Pokok</dt>
        <dd className="tabular-nums sm:mt-0.5">{formatRupiah(baris.pokok)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <dt className="text-muted-foreground">Bunga</dt>
        <dd className="tabular-nums sm:mt-0.5">{formatRupiah(baris.bunga)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <dt className="text-muted-foreground">Biaya admin</dt>
        <dd className="tabular-nums sm:mt-0.5">{formatRupiah(baris.biayaAdmin)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <dt className="font-medium text-slate-700">Total</dt>
        <dd className="font-semibold tabular-nums sm:mt-0.5">{formatRupiah(baris.total)}</dd>
      </div>
      {baris.dendaBerjalan > 0 && (
        <div className="flex items-baseline justify-between gap-2 text-red-700 sm:col-span-2 sm:block">
          <dt>Denda berjalan ({baris.hariTerlambat} hari)</dt>
          <dd className="font-semibold tabular-nums sm:mt-0.5">
            +{formatRupiah(baris.dendaBerjalan)}
          </dd>
        </div>
      )}
      {baris.status === "lunas" && (
        <div className="flex items-baseline justify-between gap-2 text-emerald-800 sm:col-span-2 sm:block">
          <dt>Dibayar</dt>
          <dd className="tabular-nums sm:mt-0.5">
            {baris.dibayarPada === null ? "—" : formatTanggalWIB(baris.dibayarPada)}
            {baris.dendaDibayar !== null && baris.dendaDibayar > 0
              ? ` · denda ${formatRupiah(baris.dendaDibayar)}`
              : ""}
          </dd>
        </div>
      )}
    </dl>
  );
}

function KartuBerikutnya({
  grup,
  onBayar,
}: {
  grup: Grup;
  onBayar: (baris: Baris) => void;
}) {
  const berikutnya = grup.ringkasan.berikutnya;
  if (berikutnya === null) return null;
  const tagihan = berikutnya.total + berikutnya.dendaBerjalan;

  return (
    <article className="glass-card rounded-2xl border p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Tagihan berikutnya · Pinjaman{" "}
            <span className="font-mono font-semibold text-navy">{grup.nomorReferensi}</span>
          </p>
          <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-emerald-800">
            {formatRupiah(tagihan)}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Angsuran {berikutnya.nomor} dari {grup.ringkasan.jumlah} · jatuh tempo{" "}
            {formatTanggalWIB(berikutnya.jatuhTempoPada)}
            {berikutnya.sisaHari >= 0
              ? ` · ${berikutnya.sisaHari === 0 ? "hari ini" : `${berikutnya.sisaHari} hari lagi`}`
              : ` · lewat ${berikutnya.hariTerlambat} hari`}
          </p>
        </div>
        <Lencana tampilan={berikutnya.tampilan} />
      </div>

      {berikutnya.dendaBerjalan > 0 && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          Tagihan sudah termasuk denda {formatRupiah(berikutnya.dendaBerjalan)} (
          {berikutnya.hariTerlambat} hari × tarif yang berlaku). Denda berhenti
          bertambah saat bukti transfer diterima.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {berikutnya.status === "menunggu_verifikasi" ? (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
            Bukti transfer sudah dikirim dan sedang dicocokkan tim PINDAI. Tidak
            perlu mengirim ulang.
          </p>
        ) : (
          <Button
            type="button"
            className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
            onClick={() => onBayar(berikutnya)}
          >
            <ReceiptText className="size-4" aria-hidden />
            Bayar angsuran
          </Button>
        )}
        <span className="text-[11px] leading-5 text-muted-foreground">
          Transfer manual ke rekening resmi, lalu unggah bukti di halaman ini.
        </span>
      </div>
    </article>
  );
}

function DaftarAngsuran({ grup }: { grup: Grup }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Jadwal angsuran {grup.nomorReferensi}
        </h3>
        <p className="text-xs text-muted-foreground">
          {grup.tenorBulan === null ? `${grup.tenorHari} hari` : `${grup.tenorBulan} bulan`} ·{" "}
          {grup.ringkasan.lunas}/{grup.ringkasan.jumlah} lunas
        </p>
      </div>
      <ol className="mt-3 space-y-2">
        {grup.angsuran.map((baris) => (
          <li
            key={baris._id}
            className={`rounded-xl border p-3 sm:p-4 ${
              baris.tampilan === "terlambat" ? "border-red-200" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Angsuran {baris.nomor}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    jatuh tempo {formatTanggalWIB(baris.jatuhTempoPada)}
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-slate-600">
                  {formatRupiah(baris.total)}
                  {baris.dendaBerjalan > 0 ? ` + denda ${formatRupiah(baris.dendaBerjalan)}` : ""}
                </p>
              </div>
              <Lencana tampilan={baris.tampilan} />
            </div>
            <RincianBaris baris={baris} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Halaman Cicilan peminjam.
 *
 * Semua angka berasal dari `angsuran.myAngsuran` (server). Halaman ini tidak
 * menghitung total, denda, atau sisa kewajiban sendiri — yang tampil sama
 * dengan yang dicocokkan admin. Backfill dipanggil sekali untuk pinjaman lama
 * yang cair sebelum tabel angsuran ada.
 */
export function AngsuranSection() {
  const data = useQuery(api.angsuran.myAngsuran, {});
  const pastikan = useMutation(api.angsuran.pastikanAngsuranSaya);
  const sudahPastikan = useRef(false);
  const [bayar, setBayar] = useState<{ grup: Grup; baris: Baris } | null>(null);

  useEffect(() => {
    if (data === undefined || sudahPastikan.current) return;
    if (data.grup.length > 0) return;
    sudahPastikan.current = true;
    void pastikan({});
  }, [data, pastikan]);

  if (data === undefined) {
    return (
      <div role="status" aria-live="polite" className="mt-6">
        <span className="sr-only">Memuat jadwal angsuran…</span>
        <SkeletonBarisDaftar baris={3} />
      </div>
    );
  }

  if (data.grup.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Belum ada angsuran"
        body="Jadwal angsuran dibuat otomatis saat pinjaman dicairkan. Setelah itu, tagihan berikutnya, rincian tiap angsuran, dan bukti transfer tampil di halaman ini."
      />
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Cicilan</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Tagihan per angsuran, denda yang menempel pada tagihan yang telat, dan
          bukti transfer untuk dicocokkan tim PINDAI. Angka di halaman ini
          dihitung server dari jadwal pinjaman Anda.
        </p>
      </div>

      {data.ringkasan.terlambat > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          {data.ringkasan.terlambat} angsuran terlambat. Denda berjalan{" "}
          {formatRupiah(data.ringkasan.dendaBerjalan)} dan berhenti bertambah
          setelah bukti transfer diterima.
        </p>
      )}

      {data.grup.map((grup) => (
        <div key={grup.loanId} className="space-y-4">
          <KartuBerikutnya
            grup={grup}
            onBayar={(baris) => setBayar({ grup, baris })}
          />
          <DaftarAngsuran grup={grup} />
        </div>
      ))}

      <ManualPaymentEvidenceHistory />

      <Dialog
        open={bayar !== null}
        onOpenChange={(open) => {
          if (!open) setBayar(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Bayar angsuran {bayar?.baris.nomor ?? ""}
            </DialogTitle>
            <DialogDescription>
              {bayar === null
                ? ""
                : `${bayar.grup.nomorReferensi} · jatuh tempo ${formatTanggalWIB(bayar.baris.jatuhTempoPada)}. Transfer sesuai nominal, lalu unggah bukti.`}
            </DialogDescription>
          </DialogHeader>
          {bayar !== null && (
            <ManualPaymentEvidenceForm
              jenis="pinjaman"
              targetId={bayar.grup.loanId}
              angsuranId={bayar.baris._id as Id<"angsuran">}
              reference={`${bayar.grup.nomorReferensi} · angsuran ${bayar.baris.nomor}`}
              suggestedAmount={bayar.baris.total + bayar.baris.dendaBerjalan}
              kunciJumlah
              onBerhasil={() => setBayar(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
