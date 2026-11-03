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

type BarisKredit = {
  _id: Id<"deposits">;
  _creationTime: number;
  nomorReferensi: string;
  jumlah: number;
  referensiTransfer: string;
  referensiMutasi: string | null;
  buktiUrl: string | null;
  fileContentType: string | null;
  emailDana: string | null;
};

function metodeLabel(metode: BarisSetoran["metodePembayaran"]): string {
  if (metode === "qris") return "QRIS";
  if (metode === "transfer") return "Transfer bank";
  return "Metode tidak dicatat";
}

/**
 * Satu setoran yang menunggu keputusan admin.
 *
 * Pencocokan menyimpan referensi dan nominal mutasi lalu mengkreditkan saldo
 * pendana dalam satu mutation. Tombolnya sengaja butuh konfirmasi eksplisit:
 * tindakan ini menulis jurnal dan tidak bisa dibatalkan dari layar ini.
 */
function KartuSetoran({
  row,
  punyaBukti,
}: {
  row: BarisSetoran;
  punyaBukti: boolean;
}) {
  const cocokkan = useMutation(api.admin.matchDepositEvidence);
  const kreditLama = useMutation(api.admin.creditLegacyDeposit);
  const tolak = useMutation(api.admin.rejectDeposit);
  const [referensi, setReferensi] = useState("");
  const [referensiLama, setReferensiLama] = useState("");
  const [jumlah, setJumlah] = useState(String(row.jumlah));
  const [setuju, setSetuju] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [konfirmasiTolak, setKonfirmasiTolak] = useState(false);
  const [busy, setBusy] = useState<"cocok" | "lama" | "tolak" | null>(null);
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
    if (!setuju) {
      setGalat("Centang konfirmasi bahwa mutasi bank sudah diperiksa.");
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
        "Setoran dicocokkan dan saldo pendana dikreditkan. Jurnal tercatat di Audit Trail.",
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Bukti gagal dicocokkan.");
    } finally {
      setBusy(null);
    }
  };

  const simpanKreditLama = async (event: FormEvent) => {
    event.preventDefault();
    setGalat(null);
    const ref = referensiLama.trim();
    if (ref.length < 4 || ref.length > 120) {
      setGalat("Referensi mutasi wajib diisi 4 sampai 120 karakter.");
      return;
    }
    if (!setuju) {
      setGalat("Centang konfirmasi bahwa mutasi bank sudah diperiksa.");
      return;
    }
    setBusy("lama");
    try {
      await kreditLama({ depositId: row._id, referensiMutasi: ref });
      toast.success(
        "Setoran lama dikreditkan. Saldo pendana dan jurnal sudah diperbarui.",
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Setoran gagal dikreditkan.");
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
          <label className="flex min-h-11 items-start gap-2 py-1 text-[11px] leading-5 text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={setuju}
              onChange={(event) => setSetuju(event.target.checked)}
              disabled={busy !== null}
              className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            />
            <span>
              Saya sudah mencocokkan referensi dan nominal mutasi bank. Tindakan
              ini mengkreditkan saldo pendana dan menulis jurnal.
            </span>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              className="h-11 gap-1.5"
              disabled={busy !== null || row.buktiUrl === null || !setuju}
            >
              {busy === "cocok" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              Cocokkan &amp; kredit saldo
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

      {!punyaBukti && (
        <form
          onSubmit={simpanKreditLama}
          className="mt-3 grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-[1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`ref-lama-${row._id}`} className="text-[11px] text-emerald-950">
              Referensi mutasi bank
            </Label>
            <Input
              id={`ref-lama-${row._id}`}
              value={referensiLama}
              onChange={(event) => setReferensiLama(event.target.value)}
              placeholder="Nomor transaksi pada mutasi rekening"
              maxLength={120}
              disabled={busy !== null}
              className="bg-white"
            />
            <label className="flex min-h-11 items-start gap-2 py-1 text-[11px] leading-5 text-emerald-950">
              <input
                type="checkbox"
                checked={setuju}
                onChange={(event) => setSetuju(event.target.checked)}
                disabled={busy !== null}
                className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              />
              <span>
                Mutasi sudah diperiksa. Kreditkan nominal setoran lama ini ke saldo
                pendana.
              </span>
            </label>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              size="sm"
              className="h-11 gap-1.5"
              disabled={busy !== null || !setuju}
            >
              {busy === "lama" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3.5" aria-hidden />
              )}
              Kredit setoran lama
            </Button>
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

function KartuKreditSetoran({ row }: { row: BarisKredit }) {
  const kredit = useMutation(api.admin.creditMatchedDeposit);
  const [setuju, setSetuju] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim(event: FormEvent) {
    event.preventDefault();
    setGalat(null);
    if (!setuju) {
      setGalat("Centang konfirmasi bahwa mutasi bank sudah diperiksa.");
      return;
    }
    setBusy(true);
    try {
      await kredit({ depositId: row._id });
      toast.success(
        `Setoran ${row.nomorReferensi} dikreditkan. Saldo pendana dan jurnal sudah diperbarui.`,
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Setoran gagal dikreditkan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-emerald-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {row.nomorReferensi}
          </p>
          <p className="mt-0.5 break-words text-sm font-semibold text-navy">
            {row.emailDana ?? "Akun pendana"}
          </p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            Referensi transfer: {row.referensiTransfer} · mutasi{" "}
            {row.referensiMutasi ?? "tidak tercatat"}
          </p>
        </div>
        <p className="text-base font-bold tabular-nums text-navy">
          {formatRupiah(row.jumlah)}
        </p>
      </div>

      {row.buktiUrl !== null && (
        <a
          href={row.buktiUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-success-foreground underline-offset-4 hover:underline"
        >
          <FileSearch className="size-3.5" aria-hidden />
          {row.fileContentType === "application/pdf"
            ? "Buka bukti PDF"
            : "Buka bukti transfer"}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      )}

      <form onSubmit={kirim} className="mt-2 space-y-2">
        <label className="flex min-h-11 items-start gap-2 py-1 text-[11px] leading-5 text-slate-700">
          <input
            type="checkbox"
            checked={setuju}
            onChange={(event) => setSetuju(event.target.checked)}
            disabled={busy}
            className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          />
          <span>
            Mutasi bank sudah diperiksa. Kreditkan nominal ini ke saldo pendana;
            tindakan ini menulis jurnal dan tidak bisa diulang.
          </span>
        </label>
        {galat !== null && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
          >
            {galat}
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          className="h-11 gap-1.5"
          disabled={busy || !setuju}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          Kreditkan saldo
        </Button>
      </form>
    </article>
  );
}

/**
 * Antrean rekonsiliasi setoran pendana.
 *
 * Dua sumber dipertahankan karena baris lama tidak punya bukti unggahan:
 * `pendingDepositEvidence` untuk bukti baru, `pendingDeposits` untuk warisan.
 * Keduanya bisa dikreditkan manual; kartu bukti memakai referensi dan nominal
 * mutasi, sedangkan baris lama memakai referensi mutasi tanpa file.
 */
export function RekonsiliasiSetoranPendana() {
  const bukti = useQuery(api.admin.pendingDepositEvidence, {});
  const lama = useQuery(api.admin.pendingDeposits, {});
  const siapKredit = useQuery(api.admin.pendingDepositCredits, {});

  if (bukti === undefined || lama === undefined || siapKredit === undefined) {
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
  const totalMenunggu = semua.length + siapKredit.length;
  const nilai =
    semua.reduce((total, row) => total + row.jumlah, 0) +
    siapKredit.reduce((total, row) => total + row.jumlah, 0);

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
              Cocokkan bukti transfer dengan mutasi bank lalu kreditkan saldo
              pendana. Setiap kredit menulis jurnal dan Audit Trail.
            </p>
          </div>
        </div>
        <Badge className="border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
          {totalMenunggu} menunggu
        </Badge>
      </header>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          Pencocokan mengkreditkan saldo dan menulis jurnal. Pastikan mutasi bank
          benar sebelum mencentang konfirmasi. Penolakan tidak mengembalikan dana.
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetrikKartu label="Menunggu" nilai={totalMenunggu} />
        <MetrikKartu label="Nilai setoran" nilai={formatRupiah(nilai)} />
        <MetrikKartu label="Dengan bukti" nilai={denganBukti.length} />
      </dl>

      {siapKredit.length > 0 && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
              Sudah dicocokkan, belum dikreditkan
            </h4>
            <span className="text-[11px] text-emerald-900">{siapKredit.length} baris</span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-emerald-950">
            Baris ini berasal dari pencocokan lama yang hanya menyimpan metadata.
            Kreditkan sekali setelah mutasi bank diperiksa; jangan mencocokkan ulang.
          </p>
          <div className="mt-2 space-y-2">
            {siapKredit.map((row) => (
              <KartuKreditSetoran key={row._id} row={row} />
            ))}
          </div>
        </div>
      )}

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
            Baris warisan ini tidak punya file bukti. Kredit hanya boleh dilakukan
            setelah admin memeriksa mutasi bank dan mengisi referensinya.
          </p>
          <div className="mt-2 space-y-2.5">
            {tanpaBukti.map((row) => (
              <KartuSetoran key={row._id} row={row} punyaBukti={false} />
            ))}
          </div>
        </div>
      )}

      {totalMenunggu === 0 && (
        <div className="mt-4">
          <EmptyQueue
            icon={Receipt}
            title="Tidak ada setoran menunggu"
            deskripsi="Setoran pendana dengan bukti transfer akan muncul di sini untuk dicocokkan dengan mutasi bank."
            poin={[
              "Periksa bukti, referensi, dan nominal sebelum mengkreditkan.",
              "Setiap kredit menulis jurnal dan tidak bisa dibatalkan dari layar ini.",
            ]}
          />
        </div>
      )}
    </section>
  );
}
