import { useAction, useMutation, useQuery } from "convex/react";
import { ClipboardList, Loader2, MapPin, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EContractWidget } from "@/components/EContract";
import { StatusBadge } from "@/components/StatusBadge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel, quoteLoan } from "@/lib/loan";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { LTV_HINTS, type CollateralCategory } from "@/lib/pawn";
import { formatDate, type LoanRow, type PawnRow } from "./admin-shared";

// =====================================================================
// Dialog review pinjaman
// =====================================================================

export function LoanReviewDialog({
  row,
  onClose,
}: {
  row: LoanRow | null;
  onClose: () => void;
}) {
  const markInReview = useMutation(api.loans.markLoanInReview);
  const approve = useMutation(api.loans.approveLoan);
  const reject = useMutation(api.loans.rejectLoan);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (row === null) return null;
  const q = quoteLoan(row.pokokPinjaman);
  const pending = row.status === "diajukan";
  const inReview = row.status === "sedang_direview";
  const decided = row.status === "disetujui" || row.status === "ditolak";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Keputusan tersimpan.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="tabular-nums">
              {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <StatusBadge status={row.status} kind="loan" />
          </div>
          <DialogDescription className="tabular-nums">
            {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <LoanKycPanel row={row} />

        <EContractWidget kind="loan" loanId={row._id} />

        <dl className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Rekening tujuan", row.nomorRekening],
            ["Keperluan", loanPurposeLabel(row.tujuan)],
            ["Tenor", row.tenorHari !== null ? `${row.tenorHari} hari` : "—"],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ["Biaya Admin (3%)", formatRupiah(q.biayaAdmin)],
            ["Biaya Platform (2%)", formatRupiah(q.biayaPlatform)],
            ["Dana bersih (95%)", formatRupiah(q.danaBersihDitransfer)],
            ["Bunga (30%)", formatRupiah(q.bunga)],
            ["Total kewajiban (130%)", formatRupiah(q.totalKewajibanPelunasan)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border/60 bg-muted/40"
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
                ? `Terlambat ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Jatuh tempo hari ini"
                  : `Jatuh tempo ${row.sisaHari} hari lagi`}
            </p>
            <p className="mt-1 text-sm">
              Batas {formatDate(row.jatuhTempoPada)} · total dengan denda{" "}
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

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-pinjaman">
                Alasan (wajib untuk penolakan)
              </Label>
              <Textarea
                id="alasan-pinjaman"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: verifikasi dokumen belum lengkap…"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {pending && (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    run("review", () => markInReview({ loanId: row._id }))
                  }
                >
                  {busy === "review" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Mulai review
                </Button>
              )}
              <Button
                className="gradient-primary border-0"
                disabled={busy !== null}
                onClick={() => run("approve", () => approve({ loanId: row._id }))}
              >
                {busy === "approve" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Setujui
              </Button>
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => run("reject", () => reject({ loanId: row._id, reason }))}
              >
                {busy === "reject" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tolak dengan alasan
              </Button>
            </div>
          </>
        )}

        {row.catatanReview && (
          <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan keputusan</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Panel KYC + lokasi pengajuan + kirim pengingat WhatsApp
// =====================================================================

export function LoanKycPanel({ row }: { row: LoanRow }) {
  const urls = useQuery(api.admin.dokumenKycUrls, { loanId: row._id });
  const sendWa = useAction(api.whatsapp.sendReminder);
  const [waBusy, setWaBusy] = useState(false);

  const lokasi = row.lokasiAjukan;
  const petaHref = lokasi
    ? `https://www.openstreetmap.org/?mlat=${lokasi.lat}&mlon=${lokasi.lng}#map=16/${lokasi.lat}/${lokasi.lng}`
    : null;

  const kirim = async () => {
    setWaBusy(true);
    try {
      await sendWa({ loanId: row._id });
      toast.success("Pengingat WhatsApp terkirim & tercatat di log.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim pengingat.");
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-sky-100 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Data KYC peminjam
      </p>
      {urls === undefined ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat data KYC…
        </div>
      ) : urls === null ? (
        <p className="text-sm text-muted-foreground">Data KYC tidak ditemukan untuk pinjaman ini.</p>
      ) : (
        <>
          <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <p className="text-muted-foreground">
              NIK: <span className="tabular-nums text-navy">{urls.nik ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              WhatsApp: <span className="tabular-nums text-navy">{urls.nomorWhatsApp ?? "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Penghasilan: <span className="tabular-nums text-navy">{urls.penghasilanBulanan !== null ? formatRupiah(urls.penghasilanBulanan) : "—"}</span>
            </p>
            <p className="text-muted-foreground">
              Sumber: <span className="text-navy">{urls.sumberPenghasilan ?? "—"}</span>
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["KTP", urls.ktpUrl],
              ["Selfie + KTP", urls.selfieUrl],
              ["Slip gaji", urls.slipUrl],
            ] as const).map(([label, url]) =>
              url ? (
                <WatermarkedDoc key={label} src={url} label={label} />
              ) : (
                <span
                  key={label}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3 py-6 text-xs text-muted-foreground"
                >
                  {label} tidak tersedia
                </span>
              ),
            )}
          </div>
          <div className="rounded-xl border border-sky-100 bg-secondary/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="size-3.5 text-primary" /> Lokasi saat pengajuan
            </p>
            {lokasi ? (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
                {petaHref && (
                  <>
                    {" · "}
                    <a href={petaHref} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                      Buka peta
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Tidak ada (pengajuan sebelum fitur lokasi).</p>
            )}
          </div>
          <RiwayatLokasiMini userId={row.userIdPeminjam} />
          {row.nomorWhatsApp && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gradient-primary rounded-full border-0"
                disabled={waBusy}
                onClick={kirim}
              >
                {waBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-3.5" />}
                Kirim pengingat WhatsApp
              </Button>
              <a
                href={`https://wa.me/${row.nomorWhatsApp}?text=${encodeURIComponent(
                  `Halo ${row.namaLengkap}, kami dari PINDAI (Pinjam & Gadai Digital). Pinjaman Anda ${row.nomorReferensi} memiliki total kewajiban ${formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}${(row.hariTerlambat ?? 0) > 0 ? ` (termasuk denda keterlambatan ${formatRupiah(row.dendaTerlambat ?? 0)})` : ""}. Mohon lakukan pelunasan tepat waktu. Terima kasih.`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_oklch(0.7_0.15_160/0.6)] transition-transform hover:-translate-y-0.5 hover:bg-emerald-600"
              >
                <Send className="size-3.5" /> Kirim Tagihan WA
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 5 titik lokasi terakhir peminjam — ringkasan untuk reviewer. */
function RiwayatLokasiMini({ userId }: { userId: Id<"users"> }) {
  const riwayat = useQuery(api.tracking.riwayatAdmin, { userId, limit: 5 });
  if (riwayat === undefined) return null;
  if (riwayat.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Belum ada jejak lokasi berkelanjutan dari peminjam ini.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-sky-100 bg-secondary/40 px-3 py-2.5">
      <p className="text-xs font-medium">Jejak lokasi terakhir ({riwayat.length})</p>
      <ul className="mt-1.5 space-y-1">
        {riwayat.map((t) => (
          <li key={t._id} className="text-xs tabular-nums text-muted-foreground">
            {new Date(t.waktu).toLocaleString("id-ID")} · {t.lat.toFixed(5)}, {t.lng.toFixed(5)} · ±{Math.round(t.akurasi)} m
          </li>
        ))}
      </ul>
    </div>
  );
}

// =====================================================================
// Dialog review gadai + taksiran
// =====================================================================

export function PawnReviewDialog({
  row,
  onClose,
  onAppraise,
}: {
  row: PawnRow | null;
  onClose: () => void;
  onAppraise: () => void;
}) {
  const markInAppraisal = useMutation(api.loans.markPawnInAppraisal);
  const reject = useMutation(api.loans.rejectPawn);
  const releasePawn = useMutation(api.loans.releasePawn);

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (row === null) return null;
  const pending = row.status === "diajukan";
  const inAppraisal = row.status === "sedang_dinilai";
  const decided = row.status === "disetujui" || row.status === "ditolak";

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Keputusan tersimpan.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="max-w-72 text-base leading-snug">
              {row.deskripsiBarang}
            </DialogTitle>
            <StatusBadge status={row.status} kind="pawn" />
          </div>
          <DialogDescription className="tabular-nums">
            {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-white">
          {[
            ["Pemohon", row.namaLengkap],
            ["Email", row.emailPeminjam ?? "—"],
            ["Rekening tujuan", row.nomorRekening],
            ["Kategori", row.kategori],
            ["Alamat penilaian", row.alamatPenilaian],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            [
              "Nilai taksiran",
              row.nilaiTaksiran !== undefined
                ? formatRupiah(row.nilaiTaksiran)
                : "Belum dinilai",
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        <EContractWidget kind="pawn" pawnId={row._id} pawnRef={row.nomorReferensi} />

        <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-4 py-3">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">
            Pemeriksaan wajib dilakukan di lokasi dengan pencatatan live
            location. Catat hasil kunjungan sebelum menetapkan taksiran.
          </p>
        </div>

        {!decided && (
          <>
            <div className="space-y-2">
              <Label htmlFor="alasan-gadai">Alasan (wajib untuk penolakan)</Label>
              <Textarea
                id="alasan-gadai"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: barang tidak dapat diverifikasi kepemilikannya…"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {pending && (
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    run("appraisal", () => markInAppraisal({ pawnId: row._id }))
                  }
                >
                  {busy === "appraisal" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Jadwalkan penilaian
                </Button>
              )}
              {inAppraisal && (
                <Button onClick={onAppraise}>
                  <ClipboardList className="mr-2 size-4" />
                  Input taksiran
                </Button>
              )}
              {row.status === "menunggu_pelepasan" && (
                <Button
                  disabled={busy !== null}
                  onClick={() =>
                    run("release", () => releasePawn({ pawnId: row._id }))
                  }
                >
                  {busy === "release" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Rilis barang
                </Button>
              )}
              <Button
                variant="destructive"
                disabled={busy !== null}
                onClick={() => run("reject", () => reject({ pawnId: row._id, reason }))}
              >
                {busy === "reject" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tolak dengan alasan
              </Button>
            </div>
          </>
        )}

        {row.catatanReview && (
          <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan penilaian</p>
            <p className="mt-1 text-sm">{row.catatanReview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AppraisalDialog({
  pawn,
  onClose,
}: {
  pawn: PawnRow | null;
  onClose: () => void;
}) {
  const approvePawn = useMutation(api.loans.approvePawn);
  const [taksiran, setTaksiran] = useState("");
  const [hargaPasar, setHargaPasar] = useState("");
  const [kondisi, setKondisi] = useState("");
  const [rak, setRak] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pawn === null) return null;

  const parsed = (() => {
    try {
      return parseRupiah(taksiran);
    } catch {
      return null;
    }
  })();
  const parsedPasar = (() => {
    if (hargaPasar.trim() === "") return null;
    try {
      return parseRupiah(hargaPasar);
    } catch {
      return null;
    }
  })();
  const hint =
    LTV_HINTS[pawn.kategori as CollateralCategory] ??
    "hingga 60% dari nilai taksiran";

  const ltvPersen =
    parsedPasar !== null && parsedPasar > 0 && parsed !== null
      ? Math.round((parsed / parsedPasar) * 100)
      : null;
  const ltvMelebihi = ltvPersen !== null && ltvPersen > 70;

  const submit = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan nilai taksiran rupiah bulat yang valid.");
      return;
    }
    if (ltvMelebihi) {
      setError("LTV " + ltvPersen + "% melebihi batas maksimum 70% dari harga pasar.");
      return;
    }
    setBusy(true);
    try {
      await approvePawn({
        pawnId: pawn._id,
        nilaiTaksiran: parsed,
        ...(parsedPasar !== null ? { hargaPasar: parsedPasar } : {}),
        ...(kondisi.trim() ? { kondisiFisik: kondisi.trim() } : {}),
        ...(rak.trim() ? { kodeRakVault: rak.trim().toUpperCase() } : {}),
      });
      toast.success("Appraisal tersimpan & gadai disetujui.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan taksiran.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Appraisal gadai</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {pawn.deskripsiBarang}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="harga-pasar">Harga pasar (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                <Input
                  id="harga-pasar"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={hargaPasar}
                  onChange={(e) => setHargaPasar(e.target.value)}
                  onBlur={() => {
                    if (parsedPasar !== null) setHargaPasar(formatRupiah(parsedPasar).replace("Rp ", ""));
                  }}
                  placeholder="12.000.000"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taksiran">Nilai taksiran (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                <Input
                  id="taksiran"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={taksiran}
                  onChange={(e) => setTaksiran(e.target.value)}
                  onBlur={() => {
                    if (parsed !== null) setTaksiran(formatRupiah(parsed).replace("Rp ", ""));
                  }}
                  placeholder="8.000.000"
                  disabled={busy}
                />
              </div>
            </div>
          </div>
          {ltvPersen !== null && (
            <p className={ltvMelebihi ? "text-xs font-medium text-destructive" : "text-xs font-medium text-emerald-600"}>
              LTV otomatis: {ltvPersen}% dari harga pasar (maksimum 70%).
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="kondisi">Kondisi fisik</Label>
              <Input
                id="kondisi"
                value={kondisi}
                onChange={(e) => setKondisi(e.target.value)}
                placeholder="Mis. 95% mulus, dus + charger lengkap"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rak">Kode rak brankas</Label>
              <Input
                id="rak"
                value={rak}
                onChange={(e) => setRak(e.target.value)}
                placeholder="Mis. A-12"
                disabled={busy}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Acuan plafon kategori {pawn.kategori}: {hint}. Dana yang dicairkan
            kepada nasabah mengikuti kebijakan LTV yang berlaku.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy || parsed === null}>
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Menyimpan…
              </>
            ) : (
              "Setujui gadai"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
