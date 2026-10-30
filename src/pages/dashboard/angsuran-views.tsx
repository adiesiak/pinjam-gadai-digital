import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ManualPaymentEvidenceForm, ManualPaymentEvidenceHistory } from "@/components/ManualPaymentEvidenceForm";
import { ContractPrintButton } from "@/components/contract/ContractPrintButton";
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
import {
  HAK_CIPTA_PINDAI,
  NAMA_ENTITAS_PINDAI,
  PENERBIT_KUITANSI,
  PENAFIAN_PINDAI,
} from "@/lib/branding";
import { buatIcs, namaBerkasIcs, type AcaraKalender } from "@/lib/kalenderIcs";
import { formatRupiah } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";
import { EmptyState } from "./empty-state";

type DataAngsuran = FunctionReturnType<typeof api.angsuran.myAngsuran>;
type Grup = DataAngsuran["grup"][number];
type Baris = Grup["angsuran"][number];
type Kuitansi = { grup: Grup; baris: Baris };

/**
 * Acara kalender dari tagihan yang BELUM lunas.
 *
 * Angsuran yang sudah lunas tidak dimasukkan: kalender yang masih memuat
 * tagihan lama akan mengingatkan nasabah untuk sesuatu yang sudah dibayar.
 * Tanggalnya diambil apa adanya dari server, bukan dihitung ulang di layar.
 */
function acaraJadwal(data: DataAngsuran): AcaraKalender[] {
  return data.grup.flatMap((grup) =>
    grup.angsuran
      .filter((baris) => baris.status !== "lunas")
      .map((baris) => ({
        uid: `angsuran-${baris._id}`,
        judul: `Angsuran ${baris.nomor}/${grup.ringkasan.jumlah} · ${grup.nomorReferensi}`,
        deskripsi: `Total ${formatRupiah(baris.total)}. Bayar dari halaman Cicilan PINDAI, lalu unggah bukti transfernya.`,
        mulai: baris.jatuhTempoPada,
      })),
  );
}

/** Unduh jadwal sebagai berkas `.ics` — dibuka aplikasi kalender ponsel. */
function unduhJadwalKalender(data: DataAngsuran) {
  const isi = buatIcs(acaraJadwal(data), {
    namaKalender: "Jadwal tagihan PINDAI",
  });
  const blob = new Blob([isi], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = namaBerkasIcs();
  tautan.rel = "noopener";
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nada visual mengikuti status, bukan warna acak. */
const NADA: Record<TampilanAngsuran, string> = {
  lunas: "border-success-border bg-success-soft text-success-foreground",
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
      {baris.buktiUrl != null && (
        <div className="flex items-baseline justify-between gap-2 sm:col-span-2 sm:block">
          <dt className="text-muted-foreground">Bukti bayar</dt>
          <dd className="sm:mt-0.5">
            <a
              href={baris.buktiUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-emerald-800 underline-offset-4 hover:underline"
            >
              Lihat bukti transfer
            </a>
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
            className="h-11 gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
            onClick={() => onBayar(berikutnya)}
          >
            <ReceiptText className="size-4" aria-hidden />
            Bayar transfer manual
          </Button>
        )}
        <span className="text-[11px] leading-5 text-muted-foreground">
          Nomor rekening PINDAI tampil di dialog pembayaran, lalu unggah buktinya di sana.
        </span>
      </div>
    </article>
  );
}

/**
 * Tagihan berikutnya untuk tab Ringkasan.
 *
 * Hanya dipakai bila pinjaman punya LEBIH DARI SATU angsuran (skema bulanan).
 * Pinjaman harian sudah menampilkan kewajiban yang sama di kartu pinjaman;
 * mengulanginya di sini hanya membuat Ringkasan punya dua angka besar yang
 * mirip. Angka diambil dari `myAngsuran` — sumber yang sama dengan halaman
 * Cicilan dan rekonsiliasi admin — jadi tidak ada perhitungan kedua di layar.
 */
export function TagihanBerikutnyaRingkas({
  data,
  onBukaCicilan,
}: {
  data: DataAngsuran;
  onBukaCicilan: () => void;
}) {
  const terdekat = useMemo(() => {
    const kandidat = data.grup
      .filter((grup) => grup.ringkasan.jumlah > 1)
      .map((grup) => ({ grup, baris: grup.ringkasan.berikutnya }))
      .filter((x): x is { grup: Grup; baris: Baris } => x.baris !== null);
    kandidat.sort((a, b) => a.baris.jatuhTempoPada - b.baris.jatuhTempoPada);
    return kandidat[0] ?? null;
  }, [data]);

  if (terdekat === null) return null;
  const { grup, baris } = terdekat;
  const tagihan = baris.total + baris.dendaBerjalan;
  const waktu =
    baris.hariTerlambat > 0
      ? `terlambat ${baris.hariTerlambat} hari`
      : baris.sisaHari === 0
        ? "jatuh tempo hari ini"
        : `${baris.sisaHari} hari lagi`;
  const menunggu = baris.status === "menunggu_verifikasi";

  return (
    <section
      aria-labelledby="judul-tagihan-berikutnya"
      className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${
        baris.tampilan === "terlambat"
          ? "border-red-200 bg-red-50/40"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="judul-tagihan-berikutnya" className="text-xs text-muted-foreground">
            Tagihan berikutnya ·{" "}
            <span className="font-mono font-semibold text-navy">{grup.nomorReferensi}</span>
          </p>
          <p className="mt-1 break-words text-2xl font-semibold tabular-nums text-emerald-800">
            {formatRupiah(tagihan)}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Angsuran {baris.nomor} dari {grup.ringkasan.jumlah} · jatuh tempo{" "}
            {formatTanggalWIB(baris.jatuhTempoPada)} · {waktu}
          </p>
        </div>
        <Lencana tampilan={baris.tampilan} />
      </div>

      {baris.dendaBerjalan > 0 && (
        <p className="mt-3 rounded-xl border border-red-200 bg-white/70 px-3 py-2 text-xs leading-5 text-red-800">
          Sudah termasuk denda {formatRupiah(baris.dendaBerjalan)}. Denda berhenti
          bertambah setelah bukti transfer diterima.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
          onClick={onBukaCicilan}
        >
          <ReceiptText className="size-4" aria-hidden />
          {menunggu ? "Lihat status verifikasi" : "Buka halaman Cicilan"}
        </Button>
        <span className="text-[11px] leading-5 text-muted-foreground">
          {menunggu
            ? "Bukti sudah dikirim dan sedang dicocokkan. Tidak perlu mengirim ulang."
            : "Pilih angsuran di sana, lalu unggah bukti transfer."}
        </span>
      </div>
    </section>
  );
}

function DaftarAngsuran({
  grup,
  onKuitansi,
}: {
  grup: Grup;
  onKuitansi: (baris: Baris) => void;
}) {
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
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Lencana tampilan={baris.tampilan} />
                {baris.status === "lunas" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-11 gap-1.5 px-3 text-xs"
                    onClick={() => onKuitansi(baris)}
                  >
                    <ReceiptText className="size-3.5" aria-hidden />
                    Kuitansi
                  </Button>
                )}
              </div>
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
  const [bayar, setBayar] = useState<Kuitansi | null>(null);
  const [kuitansi, setKuitansi] = useState<Kuitansi | null>(null);

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

  const adaTagihan = acaraJadwal(data).length > 0;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Cicilan</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Tagihan per angsuran, denda yang menempel pada tagihan yang telat, dan
            bukti transfer untuk dicocokkan tim PINDAI. Angka di halaman ini
            dihitung server dari jadwal pinjaman Anda.
          </p>
        </div>
        {adaTagihan && (
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 gap-2"
            onClick={() => unduhJadwalKalender(data)}
          >
            <CalendarPlus className="size-4" aria-hidden />
            Simpan ke kalender
          </Button>
        )}
      </div>

      {adaTagihan && (
        <p className="text-xs leading-5 text-muted-foreground">
          Berkas kalender berisi tanggal jatuh tempo yang belum lunas, dengan
          pengingat sehari sebelumnya. Buka berkasnya di ponsel untuk menambahkannya.
        </p>
      )}

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
          <DaftarAngsuran
            grup={grup}
            onKuitansi={(baris) => setKuitansi({ grup, baris })}
          />
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
            <DialogTitle>Bayar angsuran {bayar?.baris.nomor ?? ""}</DialogTitle>
            <DialogDescription>
              {bayar === null
                ? ""
                : `${bayar.grup.nomorReferensi} · jatuh tempo ${formatTanggalWIB(bayar.baris.jatuhTempoPada)}. Transfer ke rekening PINDAI di bawah, atau pindai QRIS, lalu unggah buktinya.`}
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

      <KuitansiDialog data={kuitansi} onClose={() => setKuitansi(null)} />
    </div>
  );
}

/** Teks masuk ke HTML cetak; escape dulu supaya nomor referensi tidak bisa
 * menyusupkan markup ke dokumen kuitansi. */
function escapeHtml(teks: string): string {
  return teks.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function htmlKuitansi(grup: Grup, baris: Baris): string {
  const denda = baris.dendaDibayar ?? 0;
  return `
    <div class="kop">
      <div class="kop-kiri">
        <div>
          <p class="kop-judul">PINDAI</p>
          <p class="kop-sub">Kuitansi pembayaran angsuran</p>
          <p class="kop-sub">${PENERBIT_KUITANSI}</p>
        </div>
      </div>
      <div class="kop-kanan">
        <span class="kop-badge">LUNAS</span>
        <span class="kop-ref">${escapeHtml(grup.nomorReferensi)}</span>
      </div>
    </div>
    <h1>Kuitansi Angsuran ${baris.nomor}</h1>
    <p>Jatuh tempo ${formatTanggalWIB(baris.jatuhTempoPada)}. Dana diterima ${baris.dibayarPada === null ? "sesuai bukti transfer" : formatTanggalWIB(baris.dibayarPada)} dan sudah dicocokkan admin.</p>
    <table class="rincian">
      <tbody>
        <tr><td>Pokok</td><td class="angka">${formatRupiah(baris.pokok)}</td></tr>
        <tr><td>Bunga</td><td class="angka">${formatRupiah(baris.bunga)}</td></tr>
        <tr><td>Biaya admin</td><td class="angka">${formatRupiah(baris.biayaAdmin)}</td></tr>
        <tr><td>Denda keterlambatan</td><td class="angka">${formatRupiah(denda)}</td></tr>
        <tr class="total"><td>Total dibayar</td><td class="angka">${formatRupiah(baris.totalDibayar)}</td></tr>
      </tbody>
    </table>
    <p>Kuitansi ini dihasilkan dari jadwal angsuran PINDAI dan bukti transfer yang telah dicocokkan admin.</p>
    <div class="warning">
      <strong>Himbauan Keamanan Transaksi</strong>
      <p>PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp maupun email.</p>
    </div>
    <p style="margin-top:16px;font-size:10px;line-height:1.5;color:#64748b">${PENAFIAN_PINDAI}<br/>${HAK_CIPTA_PINDAI}</p>
  `;
}

function KuitansiDialog({ data, onClose }: { data: Kuitansi | null; onClose: () => void }) {
  const baris = data?.baris ?? null;
  const denda = baris?.dendaDibayar ?? 0;
  return (
    <Dialog
      open={data !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kuitansi angsuran {baris?.nomor ?? ""}</DialogTitle>
          <DialogDescription>
            {data === null || baris === null
              ? ""
              : `${data.grup.nomorReferensi} · ${baris.dibayarPada === null ? "sudah lunas" : `dibayar ${formatTanggalWIB(baris.dibayarPada)}`}`}
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {PENERBIT_KUITANSI}
            </span>
          </DialogDescription>
        </DialogHeader>
        {data !== null && baris !== null && (
          <>
            <dl className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Pokok</dt>
                <dd className="tabular-nums">{formatRupiah(baris.pokok)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Bunga</dt>
                <dd className="tabular-nums">{formatRupiah(baris.bunga)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd className="tabular-nums">{formatRupiah(baris.biayaAdmin)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Denda keterlambatan</dt>
                <dd className="tabular-nums">{formatRupiah(denda)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2 font-semibold text-emerald-800">
                <dt>Total dibayar</dt>
                <dd className="tabular-nums">{formatRupiah(baris.totalDibayar)}</dd>
              </div>
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">
              Angka ini dari jadwal angsuran dan bukti transfer yang sudah dicocokkan admin.
            </p>
            <p className="border-t border-slate-100 pt-3 text-[10px] leading-4 text-muted-foreground">
              Diterbitkan oleh {NAMA_ENTITAS_PINDAI}. {PENAFIAN_PINDAI}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {baris.buktiUrl != null && (
                <a
                  href={baris.buktiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline"
                >
                  Lihat bukti transfer
                </a>
              )}
              <ContractPrintButton
                html={htmlKuitansi(data.grup, baris)}
                label="Cetak kuitansi"
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
