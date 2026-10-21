import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ExternalLink,
  FileSearch,
  Landmark,
  RefreshCw,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RekonsiliasiPembayaranPinjaman } from "@/components/admin/RekonsiliasiPembayaranPinjaman";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";

type Data = NonNullable<
  ReturnType<typeof useQuery<typeof api.angsuran.daftarBuktiAngsuran>>
>;
type Baris = Data["rows"][number];

/** Tiga digit terakhir nominal — pembeda antar transfer yang nominalnya mirip. */
function tigaDigitNominal(nominal: number): string {
  return String(nominal % 1000).padStart(3, "0");
}

/**
 * Panel verifikasi satu bukti transfer — dibuka sebagai laci samping.
 *
 * Antrean di belakangnya tetap terlihat, jadi petugas bisa membandingkan
 * beberapa mutasi sekaligus. Satu tombol utama: "Verifikasi & tandai lunas".
 * Server tetap menuntut referensi mutasi bank dan nominal yang cocok; tombol
 * ini mencatat bukti perpindahan dana, bukan sekadar persetujuan.
 */
function PanelVerifikasiBukti({ row, onClose }: { row: Baris; onClose: () => void }) {
  const verifikasi = useMutation(api.angsuran.verifikasiBuktiAngsuran);
  const tertaut = row.kandidat.find((k) => k.angsuranId === row.angsuranId);
  const awal =
    tertaut?.angsuranId ?? row.saran?.angsuranId ?? row.kandidat[0]?.angsuranId ?? null;
  const [angsuranId, setAngsuranId] = useState<string>(awal ?? "");
  const terpilih = row.kandidat.find((k) => k.angsuranId === angsuranId) ?? null;
  const [referensi, setReferensi] = useState("");
  const [jumlah, setJumlah] = useState(String(terpilih?.seharusnya ?? row.jumlah));
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const pilih = (id: string) => {
    setAngsuranId(id);
    const k = row.kandidat.find((x) => x.angsuranId === id);
    if (k !== undefined) setJumlah(String(k.seharusnya));
  };

  const kirim = async (keputusan: "terima" | "tolak") => {
    setGalat(null);
    if (angsuranId === "") {
      setGalat("Pilih angsuran yang dicocokkan.");
      return;
    }
    if (keputusan === "terima") {
      if (referensi.trim().length < 4) {
        setGalat("Referensi mutasi bank wajib diisi (minimal 4 karakter).");
        return;
      }
      const nominal = Number(jumlah);
      if (!Number.isSafeInteger(nominal) || nominal <= 0) {
        setGalat("Nominal mutasi harus rupiah bulat positif.");
        return;
      }
    }
    setBusy(true);
    try {
      await verifikasi({
        receiptId: row._id as Id<"manualPaymentReceipts">,
        angsuranId: angsuranId as Id<"angsuran">,
        keputusan,
        ...(keputusan === "terima"
          ? { referensiMutasi: referensi.trim(), jumlahMutasi: Number(jumlah) }
          : {}),
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      toast.success(
        keputusan === "terima"
          ? "Mutasi dicocokkan. Angsuran ditandai lunas."
          : "Bukti ditolak. Angsuran kembali menunggu pembayaran.",
      );
      onClose();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Bukti gagal diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(terbuka) => {
        if (!terbuka && !busy) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 border-l border-slate-200 bg-white p-0 sm:w-[48vw] sm:max-w-none xl:w-[44vw]"
      >
        <SheetHeader className="border-b border-slate-200 px-4 pt-4 pb-3 pr-12">
          <SheetTitle className="text-base">Cocokkan mutasi</SheetTitle>
          <SheetDescription>
            {row.namaPeminjam} · bukti {row.nomorReferensi}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Nominal diklaim
                </dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
                  {formatRupiah(row.jumlah)}
                </dd>
                <dd className="text-[11px] tabular-nums text-muted-foreground">
                  3 digit akhir {tigaDigitNominal(row.jumlah)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Pinjaman
                </dt>
                <dd className="mt-0.5 font-medium text-slate-800">{row.nomorPinjaman}</dd>
                <dd className="text-[11px] text-muted-foreground">
                  {row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`} ·
                  transfer {formatTanggalWIB(row.tanggalTransfer)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
              {row.buktiUrl === null ? (
                <span className="text-amber-700">Bukti tidak dapat dibuka.</span>
              ) : (
                <a
                  href={row.buktiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-emerald-800 underline-offset-4 hover:underline"
                >
                  <FileSearch className="size-3.5" aria-hidden /> Buka bukti transfer
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
              <span className="text-muted-foreground">
                {row.metodePembayaran === "transfer" ? "Transfer bank" : "QRIS"} · ref{" "}
                {row.referensiTransfer}
              </span>
            </div>
          </section>

          {row.saran !== null && (
            <p
              className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
                row.saran.selisih === 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              Saran server: angsuran {row.saran.nomor} · {formatRupiah(row.saran.seharusnya)}
              {row.saran.selisih === 0
                ? " · nominal cocok"
                : ` · selisih ${formatRupiah(row.saran.selisih)}`}
            </p>
          )}

          {row.kandidat.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              Tidak ada angsuran terbuka pada pinjaman ini. Bukti tidak dapat dicocokkan sampai
              jadwal angsuran tersedia.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`angsuran-sheet-${row._id}`}>Angsuran</Label>
                <select
                  id={`angsuran-sheet-${row._id}`}
                  value={angsuranId}
                  onChange={(e) => pilih(e.target.value)}
                  disabled={busy}
                  className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm disabled:opacity-50"
                >
                  {row.kandidat.map((k) => (
                    <option key={k.angsuranId} value={k.angsuranId}>
                      Angsuran {k.nomor} · {formatRupiah(k.seharusnya)} · jatuh tempo{" "}
                      {formatTanggalWIB(k.jatuhTempoPada)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`mutasi-sheet-${row._id}`}>Referensi mutasi bank</Label>
                <Input
                  id={`mutasi-sheet-${row._id}`}
                  value={referensi}
                  onChange={(e) => setReferensi(e.target.value)}
                  placeholder="Nomor transaksi pada mutasi rekening"
                  maxLength={120}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`jumlah-sheet-${row._id}`}>Nominal mutasi diterima</Label>
                <Input
                  id={`jumlah-sheet-${row._id}`}
                  type="number"
                  min="1"
                  step="1"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  disabled={busy}
                  className="tabular-nums"
                />
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Harus sama dengan tagihan termasuk denda. Server menolak angka yang berbeda.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`catatan-sheet-${row._id}`}>Catatan (opsional)</Label>
                <Input
                  id={`catatan-sheet-${row._id}`}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Catatan pencocokan atau alasan penolakan"
                  maxLength={500}
                  disabled={busy}
                />
              </div>
            </div>
          )}

          {galat !== null && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {galat}
            </p>
          )}
        </div>

        <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3">
          <Button
            type="button"
            disabled={busy || row.kandidat.length === 0}
            onClick={() => void kirim("terima")}
            className="w-full gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900"
          >
            <Check className="size-4" aria-hidden /> Verifikasi &amp; Tandai Lunas
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void kirim("tolak")}
              className="flex-1 gap-1.5 text-destructive"
            >
              <X className="size-4" aria-hidden /> Tolak bukti
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Batal
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Satu baris antrean: identitas, nominal + 3 digit akhir, dan satu pintu masuk. */
function BarisAntrean({ row, onBuka }: { row: Baris; onBuka: () => void }) {
  const cocok = row.saran?.selisih === 0;
  return (
    <li className="grid gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{row.namaPeminjam}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {row.nomorPinjaman} · bukti {row.nomorReferensi} ·{" "}
          {row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Nominal
        </p>
        <p className="text-sm font-semibold tabular-nums text-slate-900">
          {formatRupiah(row.jumlah)}
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          3 digit akhir {tigaDigitNominal(row.jumlah)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          Tagihan
        </p>
        <p className="text-sm tabular-nums text-slate-800">
          {row.saran === null ? "—" : formatRupiah(row.saran.seharusnya)}
        </p>
        {row.saran !== null && (
          <p
            className={`text-[11px] leading-4 ${cocok ? "text-emerald-800" : "text-amber-800"}`}
          >
            {cocok ? "Nominal cocok" : `Selisih ${formatRupiah(row.saran.selisih)}`}
          </p>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        variant={cocok ? "default" : "outline"}
        disabled={row.kandidat.length === 0}
        onClick={onBuka}
        className={
          cocok
            ? "gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900"
            : "gap-1.5 justify-self-start md:justify-self-end"
        }
      >
        Verifikasi
        <ArrowRight className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}

/**
 * Rekonsiliasi angsuran — meja kerja admin, bukan formulir peminjam.
 *
 * Admin mencocokkan mutasi M-Banking/E-Wallet yang sudah ia lihat sendiri:
 * daftar memuat nama, ID transaksi (nomor bukti), nominal, dan tiga digit
 * akhir nominal sebagai pembeda. Detail pencocokan dibuka di laci samping,
 * sehingga antrean tetap terlihat sementara satu bukti diproses.
 */
export function RekonsiliasiAngsuran() {
  const data = useQuery(api.angsuran.daftarBuktiAngsuran, {});
  const backfill = useMutation(api.angsuran.pastikanSemuaAngsuran);
  const [busy, setBusy] = useState(false);
  const [dipilih, setDipilih] = useState<string | null>(null);

  if (data === undefined) {
    return <SkeletonBarisDaftar baris={3} />;
  }

  const barisAktif = data.rows.find((r) => r._id === dipilih) ?? null;

  return (
    <div className="space-y-4">
      <RekonsiliasiPembayaranPinjaman />

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Landmark className="size-3.5" aria-hidden /> Antrean rekonsiliasi
          </p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">
            {data.rows.length === 0
              ? "Tidak ada mutasi menunggu"
              : `${data.rows.length} bukti menunggu dicocokkan`}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Cocokkan dengan mutasi rekening yang Anda lihat sendiri. Verifikasi menulis jurnal
            pokok/bunga/biaya/denda, menaikkan plafon bila seluruh angsuran lunas tepat waktu, dan
            menerbitkan tiket doorprize kuartal.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const hasil = await backfill({});
              toast.success(
                hasil.dibuat === 0
                  ? "Semua pinjaman berjalan sudah punya jadwal."
                  : `${hasil.dibuat} pinjaman mendapat jadwal angsuran.`,
              );
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Backfill gagal.");
            } finally {
              setBusy(false);
            }
          }}
          className="gap-1.5"
        >
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden />
          Siapkan jadwal pinjaman lama
        </Button>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-semibold">Antrean bersih</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            Bukti transfer yang dikirim peminjam muncul di sini. Setelah dicocokkan, angsuran
            berubah lunas dan barisnya hilang dari antrean.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <span>Peminjam &amp; ID transaksi</span>
            <span>Nominal</span>
            <span>Tagihan</span>
            <span className="text-right">Aksi</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.rows.map((row) => (
              <BarisAntrean
                key={row._id}
                row={row}
                onBuka={() => setDipilih(row._id)}
              />
            ))}
          </ul>
        </div>
      )}

      {barisAktif !== null && (
        <PanelVerifikasiBukti row={barisAktif} onClose={() => setDipilih(null)} />
      )}
    </div>
  );
}
