import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EContractWidget } from "@/components/EContract";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { loanPurposeLabel, quotePinjaman } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  ALASAN_MIN_PANJANG,
  LABEL_STATUS_PINJAMAN,
  nominalTerkunci,
  STATUS_PINJAMAN,
  type StatusPinjaman,
} from "@/lib/statusPinjaman";

import { formatDate } from "./admin-format";
import { type LoanRow } from "./admin-shared";
import { LoanKycPanel } from "./LoanKycPanel";

export function LoanReviewDialog({
  row,
  onClose,
}: {
  row: LoanRow | null;
  onClose: () => void;
}) {
  const ubahStatus = useMutation(api.loans.ubahStatusPinjaman);
  const fund = useMutation(api.loans.danaiPinjaman);
  const deleteLoan = useMutation(api.loans.hapusPinjaman);
  const kirimStatus = useAction(api.whatsapp.kirimStatusPinjaman);

  const [reason, setReason] = useState("");
  const [statusTujuan, setStatusTujuan] = useState<StatusPinjaman>("disetujui");
  const [nominal, setNominal] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pratinjau pesan WhatsApp yang akan dikirim — admin melihat persis isinya
  // sebelum menekan tombol, termasuk kalimat persetujuan sebagian.
  const pratinjau = useQuery(
    api.whatsapp.previewStatusPinjaman,
    row === null ? ("skip" as const) : { loanId: row._id, alasan: reason },
  );

  // Sasaran status & nominal ikut menyesuaikan saat dialog dibuka untuk baris lain.
  useEffect(() => {
    if (row === null) return;
    setStatusTujuan(row.status === "didanai" ? "lunas" : "disetujui");
    setNominal("");
    setReason("");
    setError(null);
  }, [row]);

  if (row === null) return null;
  // Nominal pengajuan asli — sama dengan pokokPinjaman kecuali admin menyetujui
  // sebagian. Dibaca toleran supaya baris lama tanpa field ini tetap aman.
  const pokokDiajukan =
    (row as { pokokDiajukan?: number }).pokokDiajukan ?? row.pokokPinjaman;
  const q = quotePinjaman({
    pokokPinjaman: row.pokokPinjaman,
    persenBunga: row.persenBunga ?? undefined,
  });


  const runDelete = async () => {
    const trimmedReason = deleteReason.trim();
    if (trimmedReason.length < 10) {
      setError("Alasan penghapusan wajib minimal 10 karakter.");
      return;
    }
    if (!window.confirm(`Hapus permanen pinjaman ${row.nomorReferensi}? Audit Trail tetap tersimpan. Data dengan transaksi terkait akan ditolak.`)) return;
    setBusy("delete");
    setError(null);
    try {
      await deleteLoan({ loanId: row._id, reason: trimmedReason });
      toast.success("Data pinjaman dihapus dan tercatat di Audit Trail.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus data pinjaman.");
    } finally {
      setBusy(null);
    }
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Perubahan status internal tersimpan pada ledger.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="tabular-nums">
              Pokok pinjaman · {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <StatusBadge status={row.status} kind="loan" />
          </div>
          <DialogDescription className="tabular-nums">
            Catatan pengajuan internal · {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <LoanKycPanel row={row} />

        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Nominal, tanggal acuan, alokasi, dan status lunas di panel ini mengikuti catatan ledger internal; perpindahan dana ditangani di luar aplikasi.
        </p>

        <EContractWidget kind="loan" loanId={row._id} />

        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Bank / e-wallet yang dicatat", row.namaBank ?? "Tidak dicatat (data lama)"],
            ["Rekening / akun yang dicatat", row.nomorRekening],
            ["Keperluan", loanPurposeLabel(row.tujuan)],
            [
              "Skema",
              row.tenorBulan !== null
                ? `Bulanan — ${row.tenorBulan} bulan`
                : `Harian — ${row.tenorHari ?? 30} hari`,
            ],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ...(row.tenorBulan !== null
              ? ([
                  ["Uang muka (DP 0%)", formatRupiah(0)],
                  ["Pokok pinjaman (dasar hitungan)", formatRupiah(row.pokokPinjaman)],
                  [
                    `Biaya layanan (${row.tenorBulan === 3 || row.tenorBulan === 6 ? "5%" : "3%"} dari pokok, dipotong di muka)`,
                    formatRupiah(
                      row.biayaLayananTotal ??
                        Math.max(
                          0,
                          (row.totalKewajiban ?? 0) -
                            row.pokokPinjaman -
                            (row.imbalHasilTotal ?? 0),
                        ),
                    ),
                  ],
                  ["Bunga flat dari pokok penuh", formatRupiah(row.imbalHasilTotal ?? 0)],
                  ["Cicilan per bulan (ilustrasi)", formatRupiah(row.cicilanPerBulan ?? 0)],
                  ["Total pengembalian", formatRupiah(row.totalKewajiban ?? 0)],
                ] as Array<[string, string]>)
              : ([
                  ["Biaya admin (2%)", formatRupiah(q.biayaAdmin)],
                  ["Biaya platform (3%)", formatRupiah(q.biayaPlatform)],
                  ["Nilai bersih (95% dari pokok)", formatRupiah(q.danaBersihDitransfer)],
                  ["Bunga (30%)", formatRupiah(q.bunga)],
                  ["Total kewajiban (130%)", formatRupiah(q.totalKewajibanPelunasan)],
                ] as Array<[string, string]>)),
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-3 py-3 sm:gap-4 sm:px-4">
              <dt className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm">{label}</dt>
              <dd className="min-w-0 break-words text-right text-xs leading-5 sm:text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                (row.hariTerlambat ?? 0) > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {(row.hariTerlambat ?? 0) > 0
                ? `Tanggal acuan terlewati ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Tanggal acuan hari ini"
                  : `Tanggal acuan dalam ${row.sisaHari} hari`}
            </p>
            <p className="mt-1 text-sm">
              Tanggal acuan {formatDate(row.jatuhTempoPada)} · total dengan denda{" "}
              <span className="font-semibold tabular-nums">
                {formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}
              </span>
              {(row.dendaTerlambat ?? 0) > 0 && (
                <span className="tabular-nums text-destructive">
                  {" "}
                  (denda {formatRupiah(row.dendaTerlambat ?? 0)})
                </span>
              )}
            </p>
          </div>
        )}

        {row.status === "lunas" ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Pinjaman ini sudah <strong>lunas</strong> — posisinya ditutup dan statusnya tidak dapat
            diubah lagi.
          </p>
        ) : (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Ubah status pinjaman
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Perubahan status hanya mengubah catatan internal — tidak ada uang yang berpindah.
                Peminjam otomatis menerima kabar lewat WhatsApp berisi status dan alasan di bawah.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="status-tujuan" className="text-[11px] text-muted-foreground">
                  Status baru
                </Label>
                <Select
                  value={statusTujuan}
                  onValueChange={(v) => setStatusTujuan(v as StatusPinjaman)}
                >
                  <SelectTrigger id="status-tujuan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_PINJAMAN.filter((s) => s !== "diajukan" && s !== row.status).map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {LABEL_STATUS_PINJAMAN[s]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              {statusTujuan === "disetujui" && !nominalTerkunci(row.status) && (
                <div>
                  <Label htmlFor="pokok-disetujui" className="text-[11px] text-muted-foreground">
                    Nominal disetujui (Rp)
                  </Label>
                  <Input
                    id="pokok-disetujui"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pokokDiajukan}
                    step={50_000}
                    placeholder={`Penuh: ${formatRupiah(pokokDiajukan)}`}
                    value={nominal}
                    onChange={(e) => setNominal(e.target.value)}
                    disabled={busy !== null}
                  />
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Boleh lebih kecil dari pengajuan ({formatRupiah(pokokDiajukan)}), tidak boleh
                    lebih besar. Kosongkan untuk menyetujui penuh.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="alasan-pinjaman">
                Alasan perubahan (wajib, dikirim ke peminjam)
              </Label>
              <Textarea
                id="alasan-pinjaman"
                aria-invalid={reason.trim().length < ALASAN_MIN_PANJANG}
                aria-describedby="alasan-pinjaman-help"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: dokumen penghasilan belum lengkap / nilai jaminan menyesuaikan taksiran…"
              />
              <p id="alasan-pinjaman-help" className="text-xs text-muted-foreground">
                Minimal {ALASAN_MIN_PANJANG} karakter. Alasan tercatat di Audit Trail dan ikut
                dikirim sebagai kabar WhatsApp.
              </p>
            </div>

            {pratinjau !== undefined && pratinjau !== null && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                  <Send className="size-3" aria-hidden /> Pratinjau WhatsApp
                  {pratinjau.nomorWhatsApp === null && " — nomor belum ada di KYC"}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-emerald-900">{pratinjau.isi}</p>
              </div>
            )}

            {error && (
              <p
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy !== null || reason.trim().length < ALASAN_MIN_PANJANG}
                onClick={() =>
                  run("status", () =>
                    ubahStatus({
                      loanId: row._id,
                      status: statusTujuan,
                      reason,
                      ...(statusTujuan === "disetujui" && nominal.trim() !== ""
                        ? { pokokDisetujui: Number(nominal) }
                        : {}),
                    }),
                  )
                }
              >
                {busy === "status" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Simpan status & kirim WhatsApp
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={busy !== null || pratinjau === undefined || pratinjau?.nomorWhatsApp === null}
                onClick={() =>
                  run("wa", () =>
                    kirimStatus({ loanId: row._id, alasan: reason, statusLama: row.status }),
                  )
                }
              >
                {busy === "wa" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Kirim ulang WhatsApp
              </Button>
            </div>
          </section>
        )}

        {row.status === "disetujui" && (
          <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs leading-5 text-emerald-900">
              Tandai dana tersalurkan agar tanggal acuan dan jadwal pelunasan aktif pada ledger internal. Pencairan/transfer tetap ditangani di luar aplikasi.
            </p>
            <Button
              disabled={busy !== null}
              onClick={() => run("fund", () => fund({ loanId: row._id }))}
            >
              {busy === "fund" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Tandai dana tersalurkan (ledger internal)
            </Button>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-200 pt-4">
          <Label htmlFor="alasan-hapus-pinjaman">Hapus data salah input</Label>
          <Textarea
            id="alasan-hapus-pinjaman"
            rows={2}
            maxLength={500}
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="Alasan penghapusan wajib (minimal 10 karakter)…"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Hanya data tanpa alokasi, jurnal, pembayaran atau catatan terkait yang bisa dihapus. Catatan Audit Trail tetap disimpan.
          </p>
          <Button variant="destructive" disabled={busy !== null || deleteReason.trim().length < 10} onClick={() => void runDelete()}>
            {busy === "delete" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
            Hapus pinjaman
          </Button>
        </div>

        {row.catatanReview && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan keputusan</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
