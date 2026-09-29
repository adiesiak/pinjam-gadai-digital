import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Camera, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { KYC_FILES, MAX_FILE_BYTES, validateKycInput, type KycFileKey } from "@/lib/kyc";
import {
  BULANAN_LIMITS,
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
} from "@/lib/bulanan";
import {
  LOAN_LIMITS,
  LOAN_PURPOSE_OPTIONS,
  quoteLoan,
  TENOR_OPTIONS,
} from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { pesanPlafonTerlampaui, PLAFON_DEFAULT } from "@/lib/plafon";
import {
  COLLATERAL_CATEGORIES,
  LTV_HINTS,
  type CollateralCategory,
} from "@/lib/pawn";

/**
 * Simulasi bulanan yang tidak melempar error saat input belum valid —
 * slider bergerak cepat, jadi nilai di luar rentang cukup tampil kosong.
 */
function simulasiBulananAman(pokok: number, tenorBulan: number) {
  try {
    return hitungSimulasiBulanan(pokok, tenorBulan);
  } catch {
    return null;
  }
}

/** Form pengajuan pinjaman (KYC + GPS + tanda tangan canvas). */
export function LoanForm({ onCreated }: { onCreated: (ref: string) => void }) {
  // Skema harian (1 jt / 30 hari) atau bulanan (1/3/6 bulan) — dua paket
  // harga berbeda; formulir menampilkan rincian sesuai skema terpilih.
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const [pokok, setPokok] = useState<number>(LOAN_LIMITS.maxPokok);
  const [tenorHari, setTenorHari] = useState<string>("30");
  const [tenorBulan, setTenorBulan] = useState<string>("3");
  const [tujuan, setTujuan] = useState<string>("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // ===== Tanda tangan canvas =====
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#1c1a15",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, []);

  // ===== KYC =====
  const [nik, setNik] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [penghasilan, setPenghasilan] = useState<number>(5_000_000);
  const [sumberPenghasilan, setSumberPenghasilan] = useState("");
  const [dok, setDok] = useState<
    Record<KycFileKey, { id: Id<"_storage"> | null; busy: boolean }>
  >({
    ktp: { id: null, busy: false },
    selfie: { id: null, busy: false },
    slip: { id: null, busy: false },
  });
  const [cameraDoc, setCameraDoc] = useState<{ key: KycFileKey; label: string } | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraCapturing, setCameraCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);

  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video || !cameraStream) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => {
      if (cameraStreamRef.current === cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
        setCameraStream(null);
        setCameraReady(false);
        setCameraError("Pratinjau kamera tidak dapat diputar. Coba buka kamera kembali.");
      }
    });
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraRequestRef.current += 1;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  // ===== Lokasi real (GPS) =====
  const [lokasi, setLokasi] = useState<{
    lat: number;
    lng: number;
    akurasi: number;
    waktu: number;
  } | null>(null);
  const [lokBusy, setLokBusy] = useState(false);

  const createLoan = useMutation(api.loans.createLoanApplication);
  const generateUploadUrl = useMutation(api.loans.generateKycUploadUrl);

  const captureLokasi = () => {
    if (!("geolocation" in navigator)) {
      setError("Perangkat Anda tidak mendukung GPS.");
      return;
    }
    setLokBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLokasi({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          akurasi: pos.coords.accuracy,
          waktu: Date.now(),
        });
        setLokBusy(false);
      },
      (err) => {
        setError(`Gagal mengambil lokasi: ${err.message}. Izinkan akses lokasi di browser.`);
        setLokBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  // Minta izin GPS otomatis saat form dibuka. Dijadwalkan sebagai microtask
  // agar tidak memanggil setState langsung di dalam tubuh efek.
  useEffect(() => {
    queueMicrotask(captureLokasi);
  }, []);

  const handleFile = async (key: KycFileKey, label: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`${label} maksimal 5 MB.`);
      return;
    }
    setDok((p) => ({ ...p, [key]: { ...p[key], busy: true } }));
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const json = (await res.json()) as { storageId?: Id<"_storage"> };
      if (!res.ok || !json.storageId) throw new Error(`Unggah ${label} gagal.`);
      setDok((p) => ({ ...p, [key]: { id: json.storageId ?? null, busy: false } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unggah ${label} gagal.`);
      setDok((p) => ({ ...p, [key]: { ...p[key], busy: false } }));
    }
  };

  const stopCamera = () => {
    cameraRequestRef.current += 1;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraDoc(null);
    setCameraLoading(false);
    setCameraReady(false);
    setCameraCapturing(false);
    setCameraError(null);
  };

  const startCamera = async (key: KycFileKey, label: string) => {
    const requestId = ++cameraRequestRef.current;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraDoc({ key, label });
    setCameraLoading(true);
    setCameraReady(false);
    setCameraCapturing(false);
    setCameraError(null);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraLoading(false);
      setCameraError("Kamera tidak tersedia. Buka dashboard melalui HTTPS pada perangkat yang memiliki kamera.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: key === "selfie" ? "user" : "environment" } },
        audio: false,
      });
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setCameraLoading(false);
    } catch (err) {
      if (cameraRequestRef.current !== requestId) return;
      const name = err instanceof Error ? err.name : "";
      setCameraError(
        name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError"
          ? "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu coba lagi."
          : name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "Kamera tidak ditemukan pada perangkat ini."
            : "Gagal membuka kamera. Periksa perangkat dan izin kamera, lalu coba lagi.",
      );
      setCameraLoading(false);
    }
  };

  const captureCameraPhoto = () => {
    const video = cameraVideoRef.current;
    const activeDoc = cameraDoc;
    if (!activeDoc) return;
    if (!video || !cameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Tunggu sampai pratinjau kamera siap sebelum mengambil foto.");
      return;
    }

    const requestId = cameraRequestRef.current;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Foto tidak dapat diproses. Coba buka kamera kembali.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCameraCapturing(true);
    canvas.toBlob(
      (blob) => {
        if (cameraRequestRef.current !== requestId) return;
        if (!blob) {
          setCameraCapturing(false);
          setCameraError("Foto tidak berhasil diambil. Silakan coba lagi.");
          return;
        }
        const photo = new File([blob], `${activeDoc.key}-${Date.now()}.jpg`, { type: "image/jpeg" });
        stopCamera();
        void handleFile(activeDoc.key, activeDoc.label, photo);
      },
      "image/jpeg",
      0.9,
    );
  };

  const bulanan = skema === "bulanan";
  const tenorBulanNum = Number(tenorBulan);
  const sim = bulanan ? simulasiBulananAman(pokok, tenorBulanNum) : null;
  const q = quoteLoan(pokok);
  // Plafon efektif memotong sisi atas kedua skema. Selama query memuat,
  // gunakan plafon awal global agar slider tidak sementara melebihi kebijakan.
  const plafonQuery = useQuery(api.lokasi.plafonSaya, {});
  const plafonSaya = plafonQuery ?? PLAFON_DEFAULT;
  // Batas per skema: harian 100 rb–1 jt / bulanan 100 rb–mesin skema,
  // keduanya dipotong plafon tunai efektif (maks. Rp10 jt setelah kualifikasi).
  const MIN = bulanan ? BULANAN_LIMITS.minPokok : LOAN_LIMITS.minPokok;
  const BATAS_SKEMA = bulanan ? BULANAN_LIMITS.maxPokok : LOAN_LIMITS.maxPokok;
  const MAX = Math.min(BATAS_SKEMA, plafonSaya ?? BATAS_SKEMA);
  const STEP = bulanan ? 100_000 : 50_000;
  const melebihiPlafon = plafonSaya !== undefined && pokok > MAX;

  // Query plafon dapat datang terlambat atau berubah akibat override admin.
  // Jepit nominal agar slider dan simulasi selalu mengikuti batas efektif.
  useEffect(() => {
    const batasAtas = Math.min(BATAS_SKEMA, plafonSaya);
    let batal = false;
    queueMicrotask(() => {
      if (!batal) {
        setPokok((sebelumnya) => Math.min(Math.max(sebelumnya, MIN), batasAtas));
      }
    });
    return () => {
      batal = true;
    };
  }, [plafonSaya, BATAS_SKEMA, MIN]);

  // Saat berganti skema atau plafon, nominal dijepit ke rentang yang sah agar
  // slider tidak menampilkan nilai di luar batas.
  const gantiSkema = (next: "harian" | "bulanan") => {
    setSkema(next);
    setError(null);
    setPokok((p) => {
      const batasAtas =
        next === "bulanan"
          ? Math.min(BULANAN_LIMITS.maxPokok, plafonSaya ?? BULANAN_LIMITS.maxPokok)
          : Math.min(LOAN_LIMITS.maxPokok, plafonSaya ?? LOAN_LIMITS.maxPokok);
      return Math.min(Math.max(p, LOAN_LIMITS.minPokok), batasAtas);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (cameraDoc !== null) {
      setError("Selesaikan atau batalkan pengambilan foto dengan kamera sebelum mengirim pengajuan.");
      return;
    }
    if (Object.values(dok).some((file) => file.busy)) {
      setError("Tunggu sampai semua foto selesai diunggah sebelum mengirim pengajuan.");
      return;
    }
    if (!bulanan && (pokok < MIN || pokok > MAX || !Number.isInteger(pokok))) {
      setError(
        `Nominal pinjaman harus antara ${formatRupiah(MIN)} dan ${formatRupiah(MAX)} (rupiah bulat) dengan tenor maksimal ${LOAN_LIMITS.maxTenorHari} hari.`,
      );
      return;
    }
    if (bulanan && sim === null) {
      setError(
        `Skema bulanan menerima pokok ${formatRupiah(BULANAN_LIMITS.minPokok)}–${formatRupiah(BULANAN_LIMITS.maxPokok)} dengan tenor ${TENOR_BULANAN_OPTIONS.join("/")} bulan.`,
      );
      return;
    }
    if (plafonSaya !== undefined && pokok > plafonSaya) {
      // Pesan yang sama persis dengan penolakan server (lib/plafon.ts).
      setError(pesanPlafonTerlampaui(plafonSaya));
      return;
    }
    if (!bulanan && !tenorHari) {
      setError("Pilih tenor pinjaman.");
      return;
    }
    if (!tujuan) {
      setError("Pilih keperluan pinjaman.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    const kycError = validateKycInput({
      nik,
      nomorWhatsApp,
      penghasilanBulanan: penghasilan,
      sumberPenghasilan,
    });
    if (kycError) {
      setError(kycError);
      return;
    }
    if (!dok.ktp.id || !dok.selfie.id || !dok.slip.id) {
      setError("Unggah ketiga dokumen: KTP, selfie dengan KTP, dan slip gaji.");
      return;
    }
    if (lokasi === null) {
      setError("Lokasi belum terkunci — izinkan akses GPS lalu klik 'Ambil lokasi'.");
      return;
    }

    setSubmitting(true);
    try {
      const ttdDataUrl = padRef.current && !padRef.current.isEmpty()
        ? padRef.current.toDataURL("image/png")
        : undefined;
      const result = await createLoan({
        pokokPinjaman: pokok,
        // tenorHari tetap dikirim (diabaikan server) saat skema bulanan aktif.
        tenorHari: bulanan ? 30 : Number(tenorHari),
        tenorBulan: bulanan ? tenorBulanNum : undefined,
        tujuan,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
        tandaTangan: ttdDataUrl,
        nik: nik.replace(/\s+/g, ""),
        nomorWhatsApp: nomorWhatsApp.replace(/[\s+-]/g, ""),
        penghasilanBulanan: penghasilan,
        sumberPenghasilan,
        dokKtpId: dok.ktp.id,
        dokSelfieKtpId: dok.selfie.id,
        dokSlipGajiId: dok.slip.id,
        lokasiAjukan: lokasi,
      });
      onCreated(result.nomorReferensi);
      setTujuan("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
      padRef.current?.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Slider nominal */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {/* Pemilih skema harga: harian 1 jt / 30 hari, atau bulanan 1/3/6 bulan. */}
        <div role="group" aria-label="Pilih skema pinjaman" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {([
            ["harian", "Harian · s.d. 1 jt"],
            ["bulanan", "Bulanan · 1–6 bln"],
          ] as const).map(([nilai, label]) => (
            <button
              key={nilai}
              type="button"
              aria-pressed={skema === nilai}
              onClick={() => gantiSkema(nilai)}
              disabled={submitting}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                skema === nilai
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-slate-700"
              }`}
            >
              {label}
            </button>          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <span id="nominal-pinjaman-label" className="text-sm font-medium">Nominal pinjaman</span>
          <span className="text-lg font-semibold tabular-nums text-primary">{formatRupiah(pokok)}</span>
        </div>        <Slider
          className="mt-4"
          value={[pokok]}
          min={MIN}
          max={MAX}
          step={STEP}
          onValueChange={(v) => setPokok(v[0] ?? MIN)}
          id="nominal-pinjaman"
          aria-label="Nominal pinjaman dalam rupiah"
          aria-labelledby="nominal-pinjaman-label"
          aria-valuetext={formatRupiah(pokok)}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatRupiah(MIN)}</span>
          <span>{formatRupiah(MAX)}</span>
        </div>
        <p className={`mt-2 text-xs leading-5 ${melebihiPlafon ? "text-destructive" : "text-muted-foreground"}`}>
          {melebihiPlafon && plafonSaya !== undefined
            ? `Batas pinjaman Anda saat ini ${formatRupiah(plafonSaya)} — kurangi nominal atau hubungi tim PINDAI bila butuh penyesuaian plafon.`
            : bulanan
              ? `Skema bulanan: uang muka 0%, biaya layanan 3% (diamortisasi), bunga menurun. Plafon tunai efektif ${formatRupiah(MAX)}; plafon otomatis dapat naik hingga Rp10 juta setelah pinjaman pokok Rp1 juta lunas penuh.`
              : `Pinjaman tunai harian dibatasi ${formatRupiah(LOAN_LIMITS.minPokok)}–${formatRupiah(MAX)} dengan tenor maksimal ${LOAN_LIMITS.maxTenorHari} hari. Plafon dapat naik hingga Rp10 juta setelah pinjaman pokok Rp1 juta lunas penuh.`}
        </p>

        {/* Live financial breakdown — mengikuti skema terpilih. */}
        {bulanan && sim !== null ? (
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-muted-foreground">Uang muka (DP 0%)</dt>
              <dd className="tabular-nums">{formatRupiah(sim.dp)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-emerald-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold text-emerald-800">Dana diterima penuh</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">
                {formatRupiah(sim.pokokDibiayai)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-muted-foreground">
                Biaya layanan 3% ({formatRupiah(sim.biayaLayananPerBulan)}/bln)
              </dt>
              <dd className="tabular-nums">{formatRupiah(sim.biayaLayananTotal)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-muted-foreground">
                Bunga {sim.persenBungaPerBulan}%/bulan (menurun)
              </dt>
              <dd className="tabular-nums">{formatRupiah(sim.bungaTotal)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Cicilan per bulan</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(sim.cicilanPerBulan)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Total pengembalian ({sim.tenorBulan} bln)</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(sim.totalPengembalian)}</dd>
            </div>
          </dl>
        ) : (
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            {[
              ["Potongan Admin (3%)", `- ${formatRupiah(q.biayaAdmin)}`],
              ["Potongan Platform (2%)", `- ${formatRupiah(q.biayaPlatform)}`],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-1 bg-emerald-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold text-emerald-800">Dana Bersih (95%)</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">{formatRupiah(q.danaBersihDitransfer)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-muted-foreground">Bunga (30%)</dt>
              <dd className="tabular-nums">{formatRupiah(q.bunga)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Total Kewajiban (130%)</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(q.totalKewajibanPelunasan)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="loan-tenor-trigger">Tenor pinjaman</Label>
          <Select
            value={bulanan ? tenorBulan : tenorHari}
            onValueChange={(v) => (bulanan ? setTenorBulan(v) : setTenorHari(v))}
            disabled={submitting}
          >
            <SelectTrigger
              id="loan-tenor-trigger"
              aria-label="Tenor pinjaman"
              aria-required="true"
              aria-invalid={error !== null && !tenorHari && !bulanan}
              aria-describedby={error !== null && !tenorHari && !bulanan ? "loan-form-error" : undefined}
              className="w-full"
            >
              <SelectValue placeholder="Pilih tenor" />
            </SelectTrigger>
            <SelectContent>
              {bulanan
                ? TENOR_BULANAN_OPTIONS.map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      {t} bulan
                    </SelectItem>
                  ))
                : TENOR_OPTIONS.map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      {t} hari
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="loan-purpose-trigger">Keperluan</Label>
          <Select value={tujuan} onValueChange={setTujuan} disabled={submitting}>
            <SelectTrigger
              id="loan-purpose-trigger"
              aria-label="Keperluan pinjaman"
              aria-required="true"
              aria-invalid={error !== null && !tujuan}
              aria-describedby={error !== null && !tujuan ? "loan-form-error" : undefined}
              className="w-full"
            >
              <SelectValue placeholder="Pilih keperluan pinjaman" />
            </SelectTrigger>
            <SelectContent>
              {LOAN_PURPOSE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama">Nama lengkap (sesuai KTP)</Label>
          <Input id="nama" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Nama sesuai identitas" autoComplete="name" required aria-required="true" minLength={3} aria-invalid={error !== null && namaLengkap.trim().length < 3} aria-describedby={error !== null && namaLengkap.trim().length < 3 ? "loan-form-error" : undefined} disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening">Nomor rekening tujuan</Label>
          <Input id="rekening" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" autoComplete="off" required aria-required="true" aria-invalid={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))} aria-describedby={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, "")) ? "loan-form-error" : undefined} disabled={submitting} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catatan">Catatan untuk reviewer (opsional)</Label>
        <Textarea id="catatan" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Jelaskan singkat rencana penggunaan dana…" rows={2} disabled={submitting} />
      </div>

      {/* Tanda tangan canvas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Tanda tangan digital (canvas)
        </p>
        <p id="signature-help" className="mt-2 text-xs leading-5 text-muted-foreground">
          Opsional. Gambar tanda tangan dengan sentuhan atau mouse; formulir tetap dapat dikirim tanpa tanda tangan.
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Area gambar tanda tangan digital, opsional"
          aria-describedby="signature-help"
          className="mt-2 h-24 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" aria-label="Bersihkan tanda tangan" onClick={() => padRef.current?.clear()}>
            Bersihkan
          </Button>
        </div>
      </div>

      {/* KYC */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Verifikasi identitas (wajib)
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nik">NIK (16 digit)</Label>
            <Input id="nik" inputMode="numeric" maxLength={16} required aria-required="true" aria-invalid={error !== null && nik.length !== 16} aria-describedby={error !== null && nik.length !== 16 ? "loan-form-error" : undefined} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))} placeholder="3204xxxxxxxxxxxx" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <Label htmlFor="wa">Nomor WhatsApp</Label>
            <Input id="wa" inputMode="tel" autoComplete="tel" required aria-required="true" aria-invalid={error !== null && nomorWhatsApp.replace(/\D/g, "").length < 8} aria-describedby={error !== null && nomorWhatsApp.replace(/\D/g, "").length < 8 ? "loan-form-error" : undefined} value={nomorWhatsApp} onChange={(e) => setNomorWhatsApp(e.target.value.replace(/[^\d+]/g, ""))} placeholder="6281234567890" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <p id="penghasilan-label" className="text-sm font-medium">Penghasilan per bulan</p>
            <Slider
              className="mt-3"
              aria-labelledby="penghasilan-label"
              aria-label="Penghasilan per bulan dalam rupiah"
              aria-describedby="penghasilan-value"
              aria-valuetext={formatRupiah(penghasilan)}
              value={[penghasilan]}
              min={500_000}
              max={100_000_000}
              step={100_000}
              onValueChange={(v) => setPenghasilan(v[0] ?? 500_000)}
            />
            <p id="penghasilan-value" className="mt-1 text-sm font-semibold tabular-nums text-primary">
              {formatRupiah(penghasilan)}
            </p>
          </div>
          <div>
            <Label htmlFor="sumber">Sumber penghasilan</Label>
            <Input id="sumber" value={sumberPenghasilan} required aria-required="true" aria-invalid={error !== null && sumberPenghasilan.trim().length === 0} aria-describedby={error !== null && sumberPenghasilan.trim().length === 0 ? "loan-form-error" : undefined} onChange={(e) => setSumberPenghasilan(e.target.value)} placeholder="Gaji, usaha, dll." disabled={submitting} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {KYC_FILES.map(({ key, label }) => {
            const kameraAktif = cameraDoc?.key === key;
            const instruksi =
              key === "selfie"
                ? "Pastikan wajah dan KTP terlihat jelas di dalam bingkai."
                : key === "ktp"
                  ? "Ambil foto sisi depan KTP dengan tulisan terlihat jelas."
                  : "Pastikan bukti penghasilan tidak terpotong dan tulisannya terbaca.";

            return (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p id={`dok-label-${key}`} className="text-sm font-medium">{label}</p>
                    <p id={`dok-status-${key}`} role="status" aria-live="polite" className="mt-0.5 truncate text-xs text-muted-foreground">
                      {dok[key].busy
                        ? "Mengunggah foto…"
                        : dok[key].id
                          ? "Foto berhasil diunggah"
                          : "Wajib diambil langsung dengan kamera · Maks. 5 MB"}
                    </p>
                  </div>
                  {!kameraAktif && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`${dok[key].id ? "Ambil ulang" : "Buka kamera untuk"} ${label}`}
                      disabled={submitting || dok[key].busy || cameraLoading || cameraDoc !== null}
                      onClick={() => void startCamera(key, label)}
                    >
                      {dok[key].busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                      {dok[key].busy ? "Mengunggah…" : dok[key].id ? "Ambil ulang" : "Buka kamera"}
                    </Button>
                  )}
                </div>
                {kameraAktif && (
                  <div className="mt-3 space-y-3" aria-labelledby={`dok-label-${key}`}>
                    <p id={`camera-instructions-${key}`} className="text-xs leading-5 text-muted-foreground">
                      {key === "ktp"
                        ? `${instruksi} Sejajarkan kartu mengikuti bingkai pada pratinjau.`
                        : instruksi}
                    </p>
                    {cameraStream ? (
                      <div className="relative overflow-hidden rounded-lg bg-slate-950">
                        <video
                          ref={cameraVideoRef}
                          autoPlay
                          playsInline
                          muted
                          aria-label={`Pratinjau kamera untuk ${label}`}
                          aria-describedby={`camera-instructions-${key}`}
                          onCanPlay={() => {
                            if (cameraStreamRef.current) {
                              setCameraReady(true);
                              setCameraError(null);
                            }
                          }}
                          className="aspect-video max-h-80 w-full object-contain"
                        />
                        {key === "ktp" && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute left-1/2 top-1/2 aspect-[85.6/54] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-dashed border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]"
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                              Sesuaikan KTP di dalam bingkai
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex aspect-video max-h-80 items-center justify-center rounded-lg bg-slate-900 px-4 text-center text-sm text-white/80">
                        {cameraLoading ? "Menunggu izin kamera…" : "Pratinjau kamera belum tersedia."}
                      </div>
                    )}
                    <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                      {cameraLoading
                        ? "Meminta izin kamera…"
                        : cameraError
                          ? "Kamera belum siap. Periksa pesan di bawah."
                          : cameraReady
                            ? "Kamera siap. Pastikan foto jelas sebelum mengambil gambar."
                            : "Menyiapkan kamera…"}
                    </p>
                    {cameraError && (
                      <p role="alert" aria-live="assertive" className="text-sm text-destructive">
                        {cameraError}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {cameraError && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={cameraLoading}
                          onClick={() => void startCamera(key, label)}
                        >
                          Coba lagi
                        </Button>
                      )}
                      <Button
                        type="button"
                        disabled={!cameraReady || cameraLoading || cameraCapturing || dok[key].busy}
                        onClick={captureCameraPhoto}
                      >
                        {cameraCapturing ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                        {cameraCapturing ? "Memproses foto…" : "Ambil foto"}
                      </Button>
                      <Button type="button" variant="outline" onClick={stopCamera}>
                        Batalkan kamera
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lokasi real */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lokasi saat pengajuan (GPS wajib)
            </p>
            {lokasi ? (
              <p role="status" aria-live="polite" className="mt-1 text-sm tabular-nums">
                <MapPin className="mr-1 inline size-4 text-emerald-600" />
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
              </p>
            ) : (
              <p role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">
                {lokBusy ? "Mengunci posisi GPS…" : "Belum terkunci — izinkan akses lokasi di browser."}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label={lokBusy ? "Sedang mengambil lokasi GPS" : "Ambil lokasi GPS"}
            disabled={lokBusy || submitting}
            onClick={captureLokasi}
          >
            {lokBusy ? <Loader2 className="size-4 animate-spin" /> : "Ambil lokasi"}
          </Button>
        </div>
      </div>
      {error && (
        <p
          ref={errorRef}
          id="loan-form-error"
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting || cameraDoc !== null || Object.values(dok).some((file) => file.busy)}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
          </>
        ) : (
          <>
            Kirim Pengajuan <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        {bulanan ? (
          <>
            Dengan mengirim, Anda menyatakan data benar dan menyetujui skema bulanan: uang muka
            0%, biaya layanan 3%, dan bunga sesuai tenor. Plafon tunai efektif saat ini{" "}
            {formatRupiah(MAX)}; setelah pinjaman tunai pokok Rp1 juta lunas penuh, plafon otomatis
            naik menjadi Rp10 juta.
          </>
        ) : (
          <>
            Dengan mengirim, Anda menyatakan data benar dan menyetujui skema harian: potongan 5%,
            bunga 30%, total kewajiban 130%. Batas skema harian {formatRupiah(LOAN_LIMITS.maxPokok)}
            dengan tenor maksimal {LOAN_LIMITS.maxTenorHari} hari. Plafon tunai bulanan dapat naik
            hingga Rp10 juta setelah pinjaman pokok Rp1 juta lunas penuh.
          </>
        )}
      </p>
    </form>
  );
}

/** Form pengajuan gadai (barang + jadwal pemeriksaan). */
export function PawnForm({ onCreated }: { onCreated: () => void }) {
  const [deskripsiBarang, setDeskripsiBarang] = useState("");
  const [kategori, setKategori] = useState<string>("");
  const [alamatPenilaian, setAlamatPenilaian] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const createPawn = useMutation(api.loans.createPawnApplication);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (deskripsiBarang.trim().length < 10) {
      setError("Deskripsi barang wajib diisi (minimal 10 karakter).");
      return;
    }
    if (!kategori) {
      setError("Pilih kategori barang.");
      return;
    }
    if (alamatPenilaian.trim().length < 10) {
      setError("Alamat lokasi barang wajib diisi untuk penjadwalan pemeriksaan.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    setSubmitting(true);
    try {
      await createPawn({
        deskripsiBarang,
        kategori,
        alamatPenilaian,
        namaLengkap,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
      });
      onCreated();
      setDeskripsiBarang("");
      setKategori("");
      setAlamatPenilaian("");
      setNamaLengkap("");
      setNomorRekening("");
      setCatatanPeminjam("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan gadai.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="barang">Deskripsi barang</Label>
        <Textarea id="barang" value={deskripsiBarang} onChange={(e) => setDeskripsiBarang(e.target.value)} placeholder="Contoh: iPhone 14 Pro 256 GB, warna titanium, dus lengkap…" rows={3} required aria-required="true" minLength={10} aria-invalid={error !== null && deskripsiBarang.trim().length < 10} aria-describedby={error !== null && deskripsiBarang.trim().length < 10 ? "pawn-form-error" : undefined} disabled={submitting} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pawn-category-trigger">Kategori</Label>
        <Select value={kategori} onValueChange={setKategori} disabled={submitting}>
          <SelectTrigger
            id="pawn-category-trigger"
            aria-label="Kategori barang gadai"
            aria-required="true"
            aria-invalid={error !== null && !kategori}
            aria-describedby={error !== null && !kategori ? "pawn-form-error" : undefined}
            className="w-full"
          >
            <SelectValue placeholder="Pilih kategori barang" />
          </SelectTrigger>
          <SelectContent>
            {COLLATERAL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kategori && (
          <p className="text-xs text-muted-foreground">
            Perkiraan plafon dana: {LTV_HINTS[kategori as CollateralCategory]}.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="alamat">Alamat lokasi barang</Label>
        <Textarea id="alamat" value={alamatPenilaian} onChange={(e) => setAlamatPenilaian(e.target.value)} placeholder="Alamat lengkap tempat barang berada saat pemeriksaan…" rows={2} required aria-required="true" minLength={10} aria-invalid={error !== null && alamatPenilaian.trim().length < 10} aria-describedby={error !== null && alamatPenilaian.trim().length < 10 ? "pawn-form-error" : undefined} disabled={submitting} />
        <p className="text-xs leading-5 text-muted-foreground">
          Pemeriksaan dilakukan petugas di lokasi dengan pencatatan lokasi langsung
          (live location).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama-gadai">Nama lengkap (sesuai KTP)</Label>
          <Input id="nama-gadai" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Nama sesuai identitas" autoComplete="name" required aria-required="true" minLength={3} aria-invalid={error !== null && namaLengkap.trim().length < 3} aria-describedby={error !== null && namaLengkap.trim().length < 3 ? "pawn-form-error" : undefined} disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening-gadai">Nomor rekening tujuan</Label>
          <Input id="rekening-gadai" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" autoComplete="off" required aria-required="true" aria-invalid={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))} aria-describedby={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, "")) ? "pawn-form-error" : undefined} disabled={submitting} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catatan-gadai">Catatan tambahan (opsional)</Label>
        <Textarea id="catatan-gadai" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Kondisi barang, kelengkapan, atau jadwal yang sesuai…" rows={2} disabled={submitting} />
      </div>
      {error && (
        <p
          ref={errorRef}
          id="pawn-form-error"
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…
          </>
        ) : (
          <>
            Kirim pengajuan gadai <ArrowRight className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Nilai taksiran ditetapkan petugas saat pemeriksaan. Barang tersimpan aman
        hingga pelunasan.
      </p>
    </form>
  );
}
