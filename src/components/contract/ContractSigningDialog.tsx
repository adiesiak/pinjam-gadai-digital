import SignaturePad from "signature_pad";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Eraser,
  FileDown,
  Loader2,
  PenLine,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import {
  bolehKirimPerjanjian,
  KELAS_TOMBOL_SETUJU_PERJANJIAN,
  tandaTanganSiap,
} from "@/lib/perjanjianTtd";
import {
  labelStatusKontrak,
  statusKontrak,
} from "@/lib/kontrakStatus";
import { lengkapiQrCetak } from "@/lib/qrDokumen";
import { cn } from "@/lib/utils";

import { ContractPrintButton } from "./ContractPrintButton";
import { wrapContractHtml } from "./contract-doc";

export type AksiTandaTangan = {
  dataUrl: string | null;
  mode: "elektronik" | "manual";
};

type Alur = "elektronik" | "manual";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  reference: string;
  borrowerName: string;
  html: string;
  signature: string | null;
  signedAt: number | null;
  consentAt: number | null;
  consentVersion: string | null;
  consentMode?: "elektronik" | "manual" | null;
  /** Waktu bukti TTD manual diterima; menentukan status "manual_diterima". */
  manualAt?: number | null;
  /** Bukti berkas TTD manual yang sudah diterima (khusus admin). */
  manualProof?: ReactNode;
  /** Nama berkas PDF; sebaiknya memuat nomor referensi. */
  fileName?: string;
  /** `peminjam` menampilkan pemilih dua jalur; `admin` tetap alur fasilitasi. */
  mode?: "admin" | "peminjam";
  /** Jalur yang disorot saat dialog dibuka. */
  alurAwal?: Alur;
  signingDisabledReason?: string | null;
  /** `null` = hanya mencatat persetujuan; tanda tangan disiapkan manual. */
  onSign: (aksi: AksiTandaTangan) => Promise<void>;
};

/** Dialog pencatatan checkbox dan gambar tanda tangan pada ledger internal. */
export function ContractSigningDialog({
  open,
  onOpenChange,
  title,
  reference,
  borrowerName,
  html,
  signature: signatureTersimpan,
  signedAt,
  consentAt,
  consentVersion,
  consentMode = null,
  manualAt = null,
  manualProof,
  fileName = "kontrak-pindai.pdf",
  mode = "admin",
  alurAwal = "elektronik",
  signingDisabledReason = null,
  onSign,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  /** HTML pratinjau ber-QR, disimpan bersama sumbernya (pola `useQrDataUrl`). */
  const [pratinjauQr, setPratinjauQr] = useState<{ sumber: string; hasil: string } | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const [alur, setAlur] = useState<Alur>(alurAwal);
  const [konfirmasiManual, setKonfirmasiManual] = useState(false);

  // Reset state setiap kali dialog dibuka memakai pola "adjusting state during
  // render" — menghindari setState di dalam efek yang memicu cascading render.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setConsentChecked(true);
      setHasSignature(false);
      setError(null);
      setAlur(alurAwal);
      setKonfirmasiManual(false);
    }
  }

  // Persetujuan manual tidak boleh memakai gambar KYC lama sebagai tanda tangan
  // akad. Gambar itu tetap boleh ditampilkan sebagai catatan lama, tetapi bukan
  // tanda tangan elektronik yang sah untuk perjanjian ini.
  const signature = consentMode === "manual" ? null : signatureTersimpan;
  const status = statusKontrak({
    persetujuanPada: consentAt,
    persetujuanVersi: consentVersion,
    persetujuanMode: consentMode,
    ttdDataUrl: signature,
    ttdPada: signedAt,
    ttdManualPada: manualAt,
  });
  const label = labelStatusKontrak(status);
  const sudahDisetujui = status !== "belum" && status !== "versi_lama";
  const fullySigned = status === "elektronik" || status === "manual_diterima";
  /** Persetujuan sudah tercatat, gambar tanda tangan belum — siap TTD manual. */
  const menungguTandaTangan = status === "manual";

  const siapTandaTangan = tandaTanganSiap(hasSignature, signature);
  const alurManual = mode === "peminjam" && alur === "manual";
  const electronicButuhTtd = mode === "peminjam" && alur === "elektronik";
  const bolehSimpan =
    bolehKirimPerjanjian({ busy, consentChecked }) &&
    (!menungguTandaTangan || siapTandaTangan) &&
    (!electronicButuhTtd || siapTandaTangan);

  // Pratinjau di dalam dialog juga memakai QR yang sudah lengkap. Tanpa ini,
  // iframe bisa menampilkan kotak "QR" kosong saat pembuatan QR belum selesai.
  useEffect(() => {
    if (!html.includes("verif-qr-kosong")) return;
    let aktif = true;
    void lengkapiQrCetak(html).then((hasil) => {
      if (aktif) setPratinjauQr({ sumber: html, hasil });
    });
    return () => {
      aktif = false;
    };
  }, [html]);

  const pratinjau =
    pratinjauQr !== null && pratinjauQr.sumber === html ? pratinjauQr.hasil : html;

  useEffect(() => {
    if (!open || fullySigned || signingDisabledReason !== null || alurManual) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#172b3a",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    // Menggambar = menyetujui. `beginStroke` menyalakan persetujuan lebih dulu
    // (saat itu kanvas masih kosong), lalu `endStroke` menyegarkan keadaan
    // tanda tangan. Dua peristiwa dipasang supaya peminjam yang menyentuh kanvas
    // tetapi belum menyelesaikan satu goresan tetap tercentang saat menggambar.
    const mulaiGores = () => setConsentChecked(true);
    const selesaiGores = () => {
      setHasSignature(!pad.isEmpty());
      if (!pad.isEmpty()) setConsentChecked(true);
    };
    pad.addEventListener("beginStroke", mulaiGores);
    pad.addEventListener("endStroke", selesaiGores);
    padRef.current = pad;

    const resize = () => {
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
      setHasSignature(!pad.isEmpty());
    };

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.removeEventListener("beginStroke", mulaiGores);
      pad.removeEventListener("endStroke", selesaiGores);
      pad.off();
      if (padRef.current === pad) padRef.current = null;
    };
  }, [open, fullySigned, signingDisabledReason, alurManual]);

  const submit = async () => {
    const pad = padRef.current;
    // Persetujuan tetap dijaga di sini: kotak yang dimatikan sendiri oleh
    // pengguna tidak boleh diam-diam dianggap setuju. Karena kotaknya terisi
    // otomatis, keadaan ini hanya terjadi bila pengguna memang membatalkannya.
    if (!consentChecked) {
      setError("Peminjam perlu menyetujui syarat dan ketentuan terlebih dahulu.");
      return;
    }
    // Jalur manual TIDAK mengirim gambar lama: persetujuan dicatat, lalu
    // dokumen diunduh untuk ditandatangani basah.
    const dataUrl = alurManual
      ? null
      : pad !== null && !pad.isEmpty()
        ? pad.toDataURL("image/png")
        : signature !== null
          ? signature
          : null;
    // Persetujuan tanpa tanda tangan tetap sah untuk alur TTD manual. Namun
    // saat persetujuan SUDAH tersimpan, tombol ini hanya untuk melengkapi
    // gambar tanda tangan, jadi kanvas kosong tidak boleh mengirim ulang.
    if (dataUrl === null && menungguTandaTangan && !alurManual) {
      setHasSignature(false);
      setError(
        "Bubuhkan tanda tangan terlebih dahulu, atau tutup dialog dan gunakan dokumen untuk TTD manual.",
      );
      return;
    }
    if (alurManual && !sudahDisetujui) {
      // Konfirmasi sudah ditangani sebelum submit; penjaga ini untuk jalur
      // pemanggilan tak terduga.
      setError("Konfirmasi persetujuan TTD manual terlebih dahulu.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSign({
        dataUrl,
        mode: dataUrl === null ? "manual" : "elektronik",
      });
      toast.success(
        dataUrl === null
          ? "Persetujuan perjanjian tersimpan. Unduh dokumen untuk TTD manual."
          : "Catatan persetujuan dan gambar tanda tangan tersimpan.",
      );
      // Tanpa tanda tangan, dialog tetap terbuka agar tombol unduh langsung
      // terlihat. Setelah ada gambar, alur selesai dan tutup.
      if (dataUrl !== null) onOpenChange(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Gagal menyimpan akad.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const mintaKonfirmasi = () => {
    if (alurManual) {
      setKonfirmasiManual(true);
      return;
    }
    if (mode === "admin" && !siapTandaTangan && !menungguTandaTangan) {
      setKonfirmasiManual(true);
      return;
    }
    void submit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* `p-0 sm:p-0` wajib: header/kaki dialog ini menempel ke tepi (full-bleed),
            jadi padding bawaan DialogContent harus mati di semua breakpoint. */}
        <DialogContent className="flex max-h-[92dvh] w-full flex-col overflow-hidden p-0 sm:max-w-4xl sm:p-0">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-5 pr-12 text-left sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  label.nada === "selesai"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : label.nada === "info"
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : label.nada === "peringatan"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-slate-200 text-muted-foreground"
                }
              >
                {fullySigned || menungguTandaTangan ? (
                  <BadgeCheck className="size-3.5" />
                ) : (
                  <PenLine className="size-3.5" />
                )}
                {label.label}
              </Badge>
              <span className="text-xs tabular-nums text-muted-foreground">
                Syarat {CONTRACT_TERMS_VERSION}
              </span>
            </div>
            <DialogTitle className="text-left text-lg font-semibold tracking-tight text-navy">
              {title}
            </DialogTitle>
            <DialogDescription className="text-left tabular-nums">
              {reference} · Peminjam: {borrowerName}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <section aria-label="Pratinjau syarat dan ketentuan" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-navy">
                    Perjanjian dan rincian pengajuan
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tinjau nama, angka, dan ketentuan sebelum peminjam menyetujui perjanjian.
                  </p>
                </div>
                <ContractPrintButton
                  html={html}
                  label="Unduh PDF"
                  fileName={fileName}
                />
              </div>
              <iframe
                title={`Pratinjau ${title}`}
                srcDoc={wrapContractHtml(pratinjau)}
                sandbox=""
                className="h-96 w-full rounded-xl border border-slate-200 bg-white sm:h-[30rem]"
              />
            </section>

            {fullySigned ? (
              <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                      <BadgeCheck className="size-4" /> Persetujuan dan tanda tangan tersimpan
                    </p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">
                      Versi tampilan {consentVersion} ·{" "}
                      {consentAt === null ? "—" : new Date(consentAt).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                    {status === "manual_diterima" ? "TTD manual" : "Peminjam"}
                  </Badge>
                </div>
                {signature !== null ? (
                  <img
                    src={signature}
                    alt={`Gambar tanda tangan yang dicatat untuk nama ${borrowerName}`}
                    className="h-20 max-w-full rounded-lg border border-emerald-100 bg-white object-contain p-2"
                  />
                ) : (
                  <p className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs leading-5 text-emerald-900">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                    Berkas kontrak bertanda tangan manual sudah diterima admin. Gambar tanda
                    tangan elektronik tidak diisi karena tanda tangan dibubuhkan pada dokumen cetak.
                  </p>
                )}
                {signature !== null && signedAt !== null && (
                  <p className="text-xs text-emerald-800">
                    Gambar dicatat pada {new Date(signedAt).toLocaleString("id-ID")}.
                  </p>
                )}
              </section>
            ) : signingDisabledReason !== null ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <p className="text-xs leading-5 text-amber-900">{signingDisabledReason}</p>
              </div>
            ) : (
              <>
                {menungguTandaTangan && (
                  <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-semibold text-sky-950">
                          <BadgeCheck className="size-4" /> Persetujuan perjanjian tersimpan
                        </p>
                        <p className="mt-1 text-xs leading-5 text-sky-900">
                          Versi tampilan {consentVersion} ·{" "}
                          {consentAt === null ? "—" : new Date(consentAt).toLocaleString("id-ID")}
                        </p>
                      </div>
                      <Badge className="bg-sky-700 text-white hover:bg-sky-700">
                        Disetujui
                      </Badge>
                    </div>
                    <p className="text-xs leading-5 text-sky-900">
                      Gambar tanda tangan belum dicatat. Unduh dokumen untuk ditandatangani
                      manual, atau bubuhkan tanda tangan elektronik di kanvas bawah ini.
                    </p>
                    <ContractPrintButton
                      html={html}
                      label="Unduh untuk TTD manual"
                      fileName={fileName}
                    />
                  </section>
                )}

                {/* Pilihan dua jalur hanya untuk peminjam: admin memfasilitasi
                    perangkat di hadapan peminjam dan tidak perlu memilih. */}
                {mode === "peminjam" && !sudahDisetujui && (
                  <section aria-labelledby="pilih-alur-ttd" className="space-y-2">
                    <div>
                      <h3 id="pilih-alur-ttd" className="text-sm font-semibold text-navy">
                        Pilih cara menyetujui
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keduanya mencatat persetujuan syarat. Pilih tanda tangan elektronik
                        sekarang, atau setujui lalu unduh untuk ditandatangani manual.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(
                        [
                          {
                            nilai: "elektronik" as const,
                            judul: "Tanda tangan elektronik",
                            isi: "Gambar tanda tangan di kanvas. Kode verifikasi kontrak langsung terbit.",
                            Ikon: PenLine,
                          },
                          {
                            nilai: "manual" as const,
                            judul: "TTD manual",
                            isi: "Setujui sekarang, unduh PDF, lalu tandatangani dengan tinta.",
                            Ikon: FileDown,
                          },
                        ] as const
                      ).map((pilihan) => {
                        const aktif = alur === pilihan.nilai;
                        return (
                          <button
                            key={pilihan.nilai}
                            type="button"
                            aria-pressed={aktif}
                            onClick={() => {
                              setAlur(pilihan.nilai);
                              setError(null);
                            }}
                            className={cn(
                              "flex min-h-11 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                              aktif
                                ? "border-primary bg-primary/5"
                                : "border-slate-200 bg-white hover:border-primary/60",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                                aktif
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              <pilihan.Ikon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-slate-900">
                                {pilihan.judul}
                              </span>
                              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                                {pilihan.isi}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  <p className="text-xs leading-5 text-amber-900">
                    {mode === "peminjam"
                      ? "Baca seluruh perjanjian sebelum menyetujui. Persetujuan ini dicatat pada ledger internal PINDAI; perpindahan dana tetap ditangani di luar aplikasi."
                      : "Serahkan perangkat kepada peminjam untuk membaca dan menandatangani sendiri; jangan mengisi atas nama orang lain. Sesi yang tercatat adalah sesi admin."}
                  </p>
                </div>

                {signature !== null && consentVersion !== CONTRACT_TERMS_VERSION && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    Ada gambar lama tanpa catatan checkbox untuk tampilan versi{" "}
                    {CONTRACT_TERMS_VERSION}. Pemeriksaan ulang hanya memperbarui catatan
                    aplikasi.
                  </p>
                )}

                {!alurManual && (
                  <section className="space-y-2" aria-labelledby="signature-heading">
                    <div>
                      <h3 id="signature-heading" className="text-sm font-semibold text-navy">
                        Gambar tanda tangan pada pengajuan
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Tanda tangan elektronik opsional. Gambar yang dibubuhkan di sini
                        disimpan pada pengajuan; jika dikosongkan, dokumen tetap dapat diunduh
                        untuk TTD manual.
                      </p>
                    </div>
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <canvas
                        ref={canvasRef}
                        aria-label="Kanvas tanda tangan Peminjam"
                        className="h-28 w-full touch-none"
                      />
                      <span className="pointer-events-none absolute inset-x-4 bottom-8 border-b border-dashed border-slate-200" />
                      <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-400">
                        Peminjam · {borrowerName}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      disabled={busy}
                      onClick={() => {
                        padRef.current?.clear();
                        setHasSignature(false);
                        setError(null);
                      }}
                    >
                      <Eraser className="mr-1.5 size-3.5" /> Hapus tanda tangan
                    </Button>
                  </section>
                )}

                {alurManual && !menungguTandaTangan && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-sky-950">
                      <FileDown className="size-4" /> Setujui lalu unduh PDF
                    </p>
                    <p className="mt-1 text-xs leading-5 text-sky-900">
                      Setelah disetujui, dokumen dapat diunduh dan ditandatangani. Admin akan
                      mengunggah kembali berkasnya sebagai bukti TTD manual.
                    </p>
                  </div>
                )}

                <label
                  htmlFor="borrower-contract-consent"
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6"
                >
                  <Checkbox
                    id="borrower-contract-consent"
                    checked={consentChecked}
                    disabled={busy}
                    onCheckedChange={(checked) => {
                      setConsentChecked(checked === true);
                      if (checked === true) setError(null);
                    }}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-navy">
                      Saya telah membaca dan menyetujui isi perjanjian ini (versi{" "}
                      {CONTRACT_TERMS_VERSION}).
                    </span>{" "}
                    Persetujuan ini dicatat pada perjanjian. Kotak ini terisi otomatis saat
                    perjanjian dibuka dan saat tanda tangan dibubuhkan — peminjam masih bisa
                    membatalkannya sendiri sebelum menekan tombol kirim.
                  </span>
                </label>
              </>
            )}

            {manualProof}

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          {/* Sticky action bar: Batal selalu tersedia; persetujuan bisa disimpan
              tanpa tanda tangan, sedangkan setelah disetujui tombol hanya aktif
              untuk melengkapi gambar tanda tangan. */}
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">
              {fullySigned
                ? "Perjanjian ini sudah ditandatangani dan tercatat di ledger internal."
                : signingDisabledReason !== null
                  ? "Penandatanganan perjanjian dinonaktifkan untuk pengajuan ini."
                  : menungguTandaTangan
                    ? siapTandaTangan
                      ? "Tanda tangan siap disimpan untuk melengkapi persetujuan yang sudah tercatat."
                      : "Persetujuan sudah tersimpan. Unduh dokumen untuk TTD manual atau bubuhkan tanda tangan di kanvas."
                    : !consentChecked
                      ? "Persetujuan belum dicentang; centang kembali untuk menyimpan."
                      : alurManual
                        ? "Persetujuan akan dicatat tanpa gambar tanda tangan, lalu dokumen siap diunduh."
                        : siapTandaTangan
                          ? "Persetujuan dan tanda tangan siap disimpan pada perjanjian."
                          : "Persetujuan dapat disimpan tanpa tanda tangan; dokumen tetap dapat diunduh untuk TTD manual."}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                {mode === "peminjam" ? "Tutup" : "Batal"}
              </Button>
              {!fullySigned &&
                signingDisabledReason === null &&
                !(menungguTandaTangan && alurManual) && (
                  <Button
                    type="button"
                    className={KELAS_TOMBOL_SETUJU_PERJANJIAN}
                    disabled={!bolehSimpan}
                    onClick={mintaKonfirmasi}
                  >
                    {busy ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : alurManual ? (
                      <FileDown className="mr-2 size-4" />
                    ) : (
                      <PenLine className="mr-2 size-4" />
                    )}
                    {busy
                      ? "Menyimpan…"
                      : menungguTandaTangan
                        ? "Simpan Tanda Tangan"
                        : alurManual
                          ? "Setujui & Unduh TTD Manual"
                          : siapTandaTangan
                            ? "Setujui & Tandatangani Perjanjian"
                            : "Setujui Perjanjian"}
                  </Button>
                )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={konfirmasiManual} onOpenChange={setKonfirmasiManual}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui tanpa tanda tangan?</AlertDialogTitle>
            <AlertDialogDescription>
              Persetujuan syarat akan dicatat tanpa gambar tanda tangan elektronik.
              Dokumen tetap dapat diunduh, ditandatangani manual, lalu buktinya diunggah
              admin. Persetujuan tidak bisa dibatalkan dari layar ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                setKonfirmasiManual(false);
                void submit();
              }}
              className="bg-emerald-800 text-white hover:bg-emerald-900"
            >
              Ya, setujui untuk TTD manual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
