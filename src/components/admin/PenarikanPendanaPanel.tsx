/**
 * Antrean penarikan pendana — jalur manual.
 *
 * Admin baru boleh menandai diproses setelah transfer keluar benar-benar
 * dilakukan. Referensi dan bukti wajib; mutation server menulis jurnal debit
 * akun kliring dan kredit saldo pendana dalam satu transaksi.
 */
import { useMutation, useQuery } from "convex/react";
import {
  Banknote,
  Check,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyQueue, MetrikKartu, PanelMemuat } from "@/components/admin/admin-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { formatTanggalWIB } from "@/lib/waktu";
import { unggahDokumen } from "@/lib/unggahDokumen";

type BarisPenarikan = {
  _id: Id<"withdrawals">;
  _creationTime: number;
  nomorReferensi: string;
  jumlah: number;
  biayaPencairan: number;
  jumlahBersih: number;
  namaBank: string;
  nomorRekening: string;
  jalur: "manual" | "otomatis";
  emailDana: string | null;
};

function KartuPenarikan({ row }: { row: BarisPenarikan }) {
  const proses = useMutation(api.admin.processWithdrawal);
  const tolak = useMutation(api.admin.rejectWithdrawal);
  const mintaUrl = useMutation(api.admin.generateWithdrawalProofUploadUrl);

  const [referensi, setReferensi] = useState("");
  const [bukti, setBukti] = useState<File | null>(null);
  const [setuju, setSetuju] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [konfirmasiTolak, setKonfirmasiTolak] = useState(false);
  const [busy, setBusy] = useState<"proses" | "tolak" | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpanProses(event: FormEvent) {
    event.preventDefault();
    setGalat(null);
    const ref = referensi.trim();
    if (ref.length < 4 || ref.length > 120) {
      setGalat("Referensi transfer keluar wajib diisi 4 sampai 120 karakter.");
      return;
    }
    if (bukti === null) {
      setGalat("Unggah bukti transfer keluar sebelum menandai diproses.");
      return;
    }
    if (!setuju) {
      setGalat("Centang konfirmasi bahwa transfer keluar sudah dilakukan.");
      return;
    }
    setBusy("proses");
    try {
      const buktiTransferId = await unggahDokumen(
        bukti,
        () => mintaUrl({}),
        "Bukti transfer keluar",
      );
      await proses({
        withdrawalId: row._id,
        referensiTransfer: ref,
        buktiTransferId,
      });
      toast.success(
        `Penarikan ${row.nomorReferensi} diproses. Saldo pendana dan jurnal sudah diperbarui.`,
      );
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Penarikan gagal diproses.");
    } finally {
      setBusy(null);
    }
  }

  async function simpanTolak(event: FormEvent) {
    event.preventDefault();
    setGalat(null);
    if (alasan.trim().length < 3) {
      setGalat("Isi alasan penolakan minimal 3 karakter.");
      return;
    }
    setBusy("tolak");
    try {
      await tolak({ withdrawalId: row._id, reason: alasan.trim() });
      toast.success("Penarikan ditolak. Alasan tercatat di Audit Trail.");
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Penarikan gagal ditolak.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            {row.nomorReferensi} · diminta {formatTanggalWIB(row._creationTime)}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-navy">
            {row.emailDana ?? "Akun pendana"}
          </p>
          <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
            {row.namaBank} · rekening {row.nomorRekening} · jalur{" "}
            {row.jalur === "manual" ? "manual" : "otomatis"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Diminta</p>
          <p className="text-lg font-bold tabular-nums text-navy">
            {formatRupiah(row.jumlah)}
          </p>
          <p className="text-[11px] tabular-nums text-slate-600">
            bersih {formatRupiah(row.jumlahBersih)}
          </p>
        </div>
      </div>

      <dl className="mt-2 grid gap-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Biaya pencairan</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {formatRupiah(row.biayaPencairan)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Transfer ke rekening</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {formatRupiah(row.jumlahBersih)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Jalur</dt>
          <dd className="font-medium text-slate-900">
            {row.jalur === "manual" ? "Transfer manual" : "Otomatis (tertutup)"}
          </dd>
        </div>
      </dl>

      <form onSubmit={simpanProses} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`ref-keluar-${row._id}`}>Referensi transfer keluar</Label>
            <Input
              id={`ref-keluar-${row._id}`}
              value={referensi}
              onChange={(event) => setReferensi(event.target.value)}
              placeholder="Nomor transaksi bank keluar"
              maxLength={120}
              disabled={busy !== null}
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor={`bukti-keluar-${row._id}`}>Bukti transfer keluar</Label>
            <Input
              id={`bukti-keluar-${row._id}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="mt-1 h-11"
              onChange={(event) => setBukti(event.target.files?.[0] ?? null)}
              disabled={busy !== null}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              JPG, PNG, WebP, atau PDF maksimal 5 MB. Wajib sebelum status diproses.
            </p>
          </div>
        </div>

        <label className="flex min-h-11 items-start gap-2 py-1 text-xs leading-5 text-slate-700">
          <input
            type="checkbox"
            checked={setuju}
            onChange={(event) => setSetuju(event.target.checked)}
            disabled={busy !== null}
            className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          />
          <span>
            Saya sudah mentransfer <strong>{formatRupiah(row.jumlahBersih)}</strong>{" "}
            ke rekening tujuan dan mengunggah buktinya. Tindakan ini mengurangi
            saldo pendana dan tidak bisa dibatalkan dari layar ini.
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

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            className="h-11 gap-1.5"
            disabled={busy !== null || !setuju}
          >
            {busy === "proses" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            Tandai sudah ditransfer
          </Button>
          {!konfirmasiTolak && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 gap-1.5 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              disabled={busy !== null}
              onClick={() => setKonfirmasiTolak(true)}
            >
              <X className="size-3.5" aria-hidden />
              Tolak
            </Button>
          )}
        </div>
      </form>

      {konfirmasiTolak && (
        <form
          onSubmit={simpanTolak}
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3"
        >
          <Label htmlFor={`alasan-tarik-${row._id}`} className="text-[11px] text-rose-900">
            Alasan penolakan
          </Label>
          <Textarea
            id={`alasan-tarik-${row._id}`}
            value={alasan}
            onChange={(event) => setAlasan(event.target.value)}
            placeholder="mis. rekening tidak valid atau permintaan ganda"
            maxLength={500}
            disabled={busy !== null}
            className="mt-1 bg-white"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              className="h-11 gap-1.5"
              disabled={busy !== null}
            >
              {busy === "tolak" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
              Kirim penolakan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11"
              disabled={busy !== null}
              onClick={() => setKonfirmasiTolak(false)}
            >
              Batal
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

export function PenarikanPendanaPanel() {
  const rows = useQuery(api.admin.pendingWithdrawals, {});
  if (rows === undefined) return <PanelMemuat />;

  const total = rows.reduce((sum, row) => sum + row.jumlah, 0);
  const bersih = rows.reduce((sum, row) => sum + row.jumlahBersih, 0);

  return (
    <section aria-labelledby="judul-penarikan-pendana" className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="rounded-xl bg-emerald-50 p-2 text-emerald-800">
            <Banknote className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 max-w-3xl">
            <h2 id="judul-penarikan-pendana" className="text-base font-bold text-slate-900">
              Penarikan Pendana
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Proses transfer keluar manual. Jangan tandai diproses sebelum dana
              benar-benar dikirim; server menulis jurnal debit akun kliring dan
              kredit saldo pendana dalam satu transaksi.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <MetrikKartu label="Antrean" nilai={String(rows.length)} />
          <MetrikKartu label="Nilai diminta" nilai={formatRupiah(total)} />
          <MetrikKartu label="Nilai bersih" nilai={formatRupiah(bersih)} />
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-950">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            Jalur otomatis tetap ditutup. Tombol di sini hanya mencatat transfer
            manual yang sudah dilakukan admin, bukan memerintahkan bank.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyQueue
          icon={Banknote}
          title="Tidak ada penarikan menunggu"
          deskripsi="Permintaan penarikan pendana yang siap ditransfer akan muncul di sini."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <KartuPenarikan key={row._id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
