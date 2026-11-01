import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ExternalLink,
  FileSearch,
  Loader2,
  Receipt,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyQueue, MetrikKartu, PanelMemuat } from "@/components/admin/admin-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";

type BarisSetoran = {
  _id: Id<"deposits">;
  nomorReferensi: string;
  jumlah: number;
  referensiTransfer: string;
  metodePembayaran: "qris" | "transfer" | null;
  tanggalTransfer: number | null;
  emailDana: string | null;
  buktiUrl: string | null;
  fileContentType: string | null;
};

function metodeLabel(metode: BarisSetoran["metodePembayaran"]): string {
  if (metode === "qris") return "QRIS";
  if (metode === "transfer") return "Transfer bank";
  return "Metode tidak dicatat";
}

/**
 * Satu setoran yang menunggu keputusan admin.
 *
 * Pencocokan hanya menyimpan referensi dan nominal mutasi. Saldo pendana tidak
 * disentuh karena gerbang pembayaran masih tertutup; kartu ini tidak boleh
 * menampilkan tombol yang seolah-olah sudah mengkreditkan uang.
 */
function KartuSetoran({
  row,
  punyaBukti,
}: {
  row: BarisSetoran;
  punyaBukti: boolean;
}) {
  const cocokkan = useMutation(api.admin.matchDepositEvidence);
  const tolak = useMutation(api.admin.rejectDeposit);
  const [referensi, setReferensi] = useState("");
  const [jumlah, setJumlah] = useState(String(row.jumlah));
  const [alasan, setAlasan] = useState("");
  const [konfirmasiTolak, setKonfirmasiTolak] = useState(false);
  const [busy, setBusy] = useState<"cocok" | "tolak" | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const simpanCocok = async (event: FormEvent) => {
    event.preventDefault();
    setGalat(null);
    const ref = referensi.trim();
    if (ref.length < 4 || ref.length > 120) {
      setGalat("Referensi mutasi wajib diisi 4 sampai 120 karakter.");
      return;
    }
    const nominal = Number(jumlah);
    if (!Number.isSafeInteger(nominal) || nominal !== row.jumlah) {
      setGalat("Nominal mutasi harus sama persis dengan nominal setoran.");
      return;
    }
    setBusy("cocok");
    try {
      await cocokkan({
        depositId: row._id,
        referensiMutasi: ref,
        jumlahMutasi: nominal,
      });
      toast.success(
        "Bukti setoran dicocokkan. Saldo belum berubah sampai jalur pembayaran aktif.",
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Bukti gagal dicocokkan.");
    } finally {
      setBusy(null);
    }
  };

  const simpanTolak = async (event: FormEvent) => {
    event.preventDefault();
    setGalat(null);
    if (alasan.trim().length < 3) {
      setGalat("Isi alasan penolakan minimal 3 karakter.");
      return;
    }
    setBusy("tolak");
    try {
      await tolak({ depositId: row._id, reason: alasan.trim() });
      toast.success("Setoran ditolak. Alasan tercatat di Audit Trail.");
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Setoran gagal ditolak.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {row.nomorReferensi}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-navy">
            {row.emailDana ?? "Akun pendana"}
          </p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            {metodeLabel(row.metodePembayaran)} · transfer{" "}
            {row.tanggalTransfer === null
              ? "tanpa tanggal"
              : formatTanggalWIB(row.tanggalTransfer)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Diklaim</p>
          <p className="text-lg font-bold tabular-nums text-navy">
            {formatRupiah(row.jumlah)}
          </p>
        </div>
      </div>

      <p className="mt-2 break-words rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 text-slate-600">
        Referensi transfer: <span className="font-medium text-slate-900">{row.referensiTransfer}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {row.buktiUrl !== null ? (
          <a
            href={row.buktiUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-success-foreground underline-offset-4 hover:underline"
          >
            <FileSearch className="size-3.5" aria-hidden />
            {row.fileContentType === "application/pdf"
              ? "Buka bukti PDF"
              : "Buka bukti transfer"}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : punyaBukti ? (
          <span className="text-amber-700">Bukti tidak dapat dibuka.</span>
        ) : null}
        {!punyaBukti && (
          <span className="text-[11px] text-muted-foreground">
            Setoran lama tanpa bukti unggahan.
          </span>
        )}
      </div>

      {punyaBukti && (
        <form onSubmit={simpanCocok} className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
          <div className="space-y-1.5">
            <Label htmlFor={`ref-setoran-${row._id}`}>Referensi mutasi bank</Label>
            <Input
              id={`ref-setoran-${row._id}`}
              value={referensi}
              onChange={(e) => setReferensi(e.target.value)}
              placeholder="Nomor transaksi pada mutasi rekening"
              maxLength={120}
              disabled={busy !== null}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`jumlah-setoran-${row._id}`}>Nominal diterima</Label>
            <Input
              id={`jumlah-setoran-${row._id}`}
              type="number"
              min="1"
              step="1"
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              disabled={busy !== null}
              className="tabular-nums"
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null || row.buktiUrl === null}
            >
              {busy === "cocok" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              Cocokkan bukti
            </Button>
            {!konfirmasiTolak && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                disabled={busy !== null}
                onClick={() => setKonfirmasiTolak(true)}
              >
                <X className="size-3.5" aria-hidden />
                Tolak
              </Button>
            )}
          </div>
        </form>
      )}

      {(!punyaBukti || konfirmasiTolak) && (
        <form
          onSubmit={simpanTolak}
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3"
        >
          <Label htmlFor={`alasan-setoran-${row._id}`} className="text-[11px] text-rose-900">
            Alasan penolakan
          </Label>
          <Textarea
            id={`alasan-setoran-${row._id}`}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="mis. mutasi tidak ditemukan atau nominal tidak sesuai"
            maxLength={500}
            disabled={busy !== null}
            className="mt-1 bg-white"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              className="gap-1.5"
              disabled={busy !== null}
            >
              {busy === "tolak" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              Kirim penolakan
            </Button>
            {punyaBukti && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setKonfirmasiTolak(false)}
              >
                Batal
              </Button>
            )}
          </div>
        </form>
      )}

      {galat !== null && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {galat}
        </p>
      )}
    </article>
  );
}

/**
 * Antrean rekonsiliasi setoran pendana.
 *
 * Dua sumber dipertahankan karena baris lama tidak punya bukti unggahan:
 * `pendingDepositEvidence` untuk bukti baru, `pendingDeposits` untuk warisan.
 * Keduanya hanya mengubah metadata keputusan; tidak ada jurnal atau saldo yang
 * bergerak di panel ini.
 */
export function RekonsiliasiSetoranPendana() {
  const bukti = useQuery(api.admin.pendingDepositEvidence, {});
  const lama = useQuery(api.admin.pendingDeposits, {});

  if (bukti === undefined || lama === undefined) {
    return <PanelMemuat baris={3} />;
  }

  const denganBukti: BarisSetoran[] = bukti.map((row) => ({
    _id: row._id,
    nomorReferensi: row.nomorReferensi,
    jumlah: row.jumlah,
    referensiTransfer: row.referensiTransfer,
    metodePembayaran: row.metodePembayaran,
    tanggalTransfer: row.tanggalTransfer,
    emailDana: row.emailDana,
    buktiUrl: row.buktiUrl,
    fileContentType: row.fileContentType,
  }));
  const tanpaBukti: BarisSetoran[] = lama.map((row) => ({
    _id: row._id,
    nomorReferensi: row.nomorReferensi,
    jumlah: row.jumlah,
    referensiTransfer: row.referensiTransfer,
    metodePembayaran: row.metodePembayaran,
    tanggalTransfer: row.tanggalTransfer,
    emailDana: row.emailDana,
    buktiUrl: row.buktiUrl,
    fileContentType: null,
  }));
  const semua = [...denganBukti, ...tanpaBukti];
  const nilai = semua.reduce((total, row) => total + row.jumlah, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <Receipt className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Rekonsiliasi Setoran Pendana</h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              Cocokkan bukti transfer dengan mutasi bank. Keputusan di sini hanya
              metadata; saldo pendana tidak berubah sampai jalur pembayaran aktif.
            </p>
          </div>
        </div>
        <Badge className="border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
          {semua.length} menunggu
        </Badge>
      </header>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          Pencocokan tidak mengkreditkan saldo. Jangan gunakan tombol ini sebagai
          bukti uang sudah masuk ke PINDAI. Penolakan juga tidak mengembalikan dana.
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetrikKartu label="Menunggu" nilai={semua.length} />
        <MetrikKartu label="Nilai setoran" nilai={formatRupiah(nilai)} />
        <MetrikKartu label="Dengan bukti" nilai={denganBukti.length} />
      </dl>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Bukti transfer
          </h4>
          <span className="text-[11px] text-muted-foreground">{denganBukti.length} baris</span>
        </div>
        {denganBukti.length === 0 ? (
          <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-4 text-xs text-muted-foreground">
            Tidak ada setoran dengan bukti yang menunggu pencocokan.
          </p>
        ) : (
          <div className="mt-2 space-y-2.5">
            {denganBukti.map((row) => (
              <KartuSetoran key={row._id} row={row} punyaBukti />
            ))}
          </div>
        )}
      </div>

      {tanpaBukti.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Setoran lama tanpa bukti
            </h4>
            <span className="text-[11px] text-muted-foreground">{tanpaBukti.length} baris</span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Baris warisan ini tidak punya file bukti. Hanya penolakan yang tersedia;
            jangan mencocokkan tanpa bukti yang bisa diperiksa.
          </p>
          <div className="mt-2 space-y-2.5">
            {tanpaBukti.map((row) => (
              <KartuSetoran key={row._id} row={row} punyaBukti={false} />
            ))}
          </div>
        </div>
      )}

      {semua.length === 0 && (
        <div className="mt-4">
          <EmptyQueue
            icon={Receipt}
            title="Tidak ada setoran menunggu"
            deskripsi="Setoran pendana dengan bukti transfer akan muncul di sini untuk dicocokkan dengan mutasi bank."
            poin={[
              "Periksa bukti dan referensi sebelum mengambil keputusan.",
              "Pencocokan tidak memindahkan uang atau mengubah saldo.",
            ]}
          />
        </div>
      )}
    </section>
  );
}
