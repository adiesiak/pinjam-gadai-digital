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
 * Ringkasan bulanan yang tidak melempar error saat input belum valid —
 * slider bergerak cepat, jadi nilai di luar rentang cukup tampil kosong.
 */
function simulasiBulananAman(pokok: number, tenorBulan: number) {
  try {
    return hitungSimulasiBulanan(pokok, tenorBulan);
  } catch {
    return null;
  }
}

/** Formulir pengajuan pinjaman. */
export function LoanForm({ onCreated }: { onCreated: (ref: string) => void }) {
  // Skema harian (1 jt / 30 hari) atau bulanan (1/3/6 bulan) — dua paket
  // harga berbeda; formulir menampilkan rincian sesuai skema terpilih.
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const [pokok, setPokok] = useState<number>(LOAN_LIMITS.maxPokok);
  const [tenorHari, setTenorHari] = useState<string>("30");
  const [tenorBulan, setTenorBulan] = useState<string>("3");
  const [tujuan, setTujuan] = useState<string>("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [namaBank, setNamaBank] = useState("");
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
        setCameraError("Kamera tidak bisa menampilkan gambar. Coba buka kamera lagi.");
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
      setError("Lokasi tidak bisa diambil dari perangkat ini.");
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
        setError("Lokasi gagal diambil. Izinkan akses lokasi pada browser, lalu coba lagi.");
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
      setError(`Ukuran foto ${label} maksimal 5 MB.`);
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
      if (!res.ok || !json.storageId) throw new Error(`Foto ${label} gagal dikirim. Coba lagi.`);
      setDok((p) => ({ ...p, [key]: { id: json.storageId ?? null, busy: false } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Foto ${label} gagal dikirim. Coba lagi.`);
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
      setCameraError("Kamera tidak tersedia. Buka aplikasi ini di perangkat yang memiliki kamera.");
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
            : "Kamera tidak bisa dibuka. Periksa izin kamera, lalu coba lagi.",
      );
      setCameraLoading(false);
    }
  };

  const captureCameraPhoto = () => {
    const video = cameraVideoRef.current;
    const activeDoc = cameraDoc;
    if (!activeDoc) return;
    if (!video || !cameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Tunggu sampai tampilan kamera siap, lalu ambil foto.");
      return;
    }

    const requestId = cameraRequestRef.current;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Foto tidak bisa diproses. Coba buka kamera lagi.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCameraCapturing(true);
    canvas.toBlob(
      (blob) => {
        if (cameraRequestRef.current !== requestId) return;
        if (!blob) {
          setCameraCapturing(false);
          setCameraError("Foto gagal diambil. Coba lagi.");
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
  // Batas pinjaman mengurangi jumlah maksimum kedua pilihan. Selama data dimuat,
  // gunakan batas awal agar penggeser tidak melewati batas yang berlaku.
  const plafonQuery = useQuery(api.lokasi.plafonSaya, {});
  const plafonSaya = plafonQuery ?? PLAFON_DEFAULT;
  // Batas per skema: harian Rp100 ribu–Rp1 juta / bulanan mengikuti aturan skema,
  // keduanya tidak boleh melebihi batas pinjaman efektif (maks. Rp10 juta).
  const MIN = bulanan ? BULANAN_LIMITS.minPokok : LOAN_LIMITS.minPokok;
  const BATAS_SKEMA = bulanan ? BULANAN_LIMITS.maxPokok : LOAN_LIMITS.maxPokok;
  const MAX = Math.min(BATAS_SKEMA, plafonSaya ?? BATAS_SKEMA);
  const STEP = bulanan ? 100_000 : 50_000;
  const melebihiPlafon = plafonSaya !== undefined && pokok > MAX;

  // Query plafon dapat datang terlambat atau berubah akibat override admin.
  // Batasi jumlah pinjaman agar penggeser dan perkiraan mengikuti batas terbaru.
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

  // Saat pilihan atau batas berubah, sesuaikan jumlah agar tetap dalam rentang yang diizinkan.
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
      setError("Selesaikan pengambilan foto atau tutup kamera sebelum mengirim formulir.");
      return;
    }
    if (Object.values(dok).some((file) => file.busy)) {
      setError("Tunggu sampai semua foto selesai dikirim.");
      return;
    }
    if (!bulanan && (pokok < MIN || pokok > MAX || !Number.isInteger(pokok))) {
      setError(
        `Jumlah pinjaman harus antara ${formatRupiah(MIN)} dan ${formatRupiah(MAX)}. Masukkan jumlah rupiah tanpa pecahan. Lama pinjaman paling lama ${LOAN_LIMITS.maxTenorHari} hari.`,
      );
      return;
    }
    if (bulanan && sim === null) {
      setError(
        `Jumlah pinjaman bulanan harus antara ${formatRupiah(BULANAN_LIMITS.minPokok)} dan ${formatRupiah(BULANAN_LIMITS.maxPokok)}. Pilih lama pinjaman: ${TENOR_BULANAN_OPTIONS.join(", ")} bulan.`,
      );
      return;
    }
    if (plafonSaya !== undefined && pokok > plafonSaya) {
      // Tampilkan alasan yang sama dengan pemeriksaan batas di server.
      setError(pesanPlafonTerlampaui(plafonSaya));
      return;
    }
    if (!bulanan && !tenorHari) {
      setError("Pilih berapa lama pinjaman.");
      return;
    }
    if (!tujuan) {
      setError("Pilih tujuan pinjaman.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap harus berisi minimal 3 karakter.");
      return;
    }
    if (namaBank.trim().length < 2 || namaBank.trim().length > 60) {
      setError("Nama bank atau dompet digital harus berisi 2 sampai 60 karakter.");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening atau dompet digital harus berisi 6 sampai 20 angka.");
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
      setError("Ambil foto KTP, selfie sambil memegang KTP, dan bukti penghasilan.");
      return;
    }
    if (lokasi === null) {
      setError("Lokasi Anda belum tercatat. Izinkan akses lokasi, lalu pilih 'Ambil lokasi'.");
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
        namaBank,
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
      setNamaBank("");
      setNomorRekening("");
      setCatatanPeminjam("");
      padRef.current?.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan gagal dikirim. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Formulir ini mencatat pengajuan dan perkiraan hitungannya. Data, dokumen, gambar tanda tangan, dan lokasi yang Anda kirim hanya menjadi masukan. PINDAI tidak memeriksa identitas atau lokasi Anda; perpindahan dana ditangani di luar aplikasi.
      </p>
      {/* Jumlah pinjaman */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {/* Pemilih skema harga: harian 1 jt / 30 hari, atau bulanan 1/3/6 bulan. */}
        <div role="group" aria-label="Pilih skema pinjaman" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          {([
            ["harian", "Pinjaman harian"],
            ["bulanan", "Pinjaman bulanan"],
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
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <span id="nominal-pinjaman-label" className="text-sm font-medium">Jumlah pinjaman</span>
          <span className="text-lg font-semibold tabular-nums text-primary">{formatRupiah(pokok)}</span>
        </div>
        <Slider
          className="mt-4"
          value={[pokok]}
          min={MIN}
          max={MAX}
          step={STEP}
          onValueChange={(v) => setPokok(v[0] ?? MIN)}
          id="nominal-pinjaman"
          aria-label="Jumlah pinjaman dalam rupiah"
          aria-labelledby="nominal-pinjaman-label"
          aria-valuetext={formatRupiah(pokok)}
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatRupiah(MIN)}</span>
          <span>{formatRupiah(MAX)}</span>
        </div>
        <p className={`mt-2 text-xs leading-5 ${melebihiPlafon ? "text-destructive" : "text-muted-foreground"}`}>
          {melebihiPlafon && plafonSaya !== undefined
            ? `Batas pinjaman Anda ${formatRupiah(plafonSaya)}. Kurangi jumlah pinjaman agar tidak melebihi batas.`
            : bulanan
              ? `Ini hanya perkiraan, bukan persetujuan pinjaman. Batas pinjaman Anda ${formatRupiah(MAX)}. Catatan pinjaman yang ditandai lunas tepat waktu di aplikasi dapat menaikkan batas hingga Rp10 juta. Catatan ini tersimpan pada ledger internal PINDAI.`
              : `Ini hanya perkiraan, bukan persetujuan pinjaman. Jumlah pinjaman harian ${formatRupiah(LOAN_LIMITS.minPokok)} sampai ${formatRupiah(MAX)}, paling lama ${LOAN_LIMITS.maxTenorHari} hari. Catatan pinjaman yang ditandai lunas tepat waktu di aplikasi dapat menaikkan batas hingga Rp10 juta. Catatan ini tersimpan pada ledger internal PINDAI.`}
        </p>

        {/* Ringkasan peminjam: nilai bersih dan total pembayaran. */}
        {bulanan && sim !== null ? (
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col gap-1 bg-emerald-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold text-emerald-800">Perkiraan pokok bersih pada model (belum dikirim; tanpa potongan di muka)</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">
                {formatRupiah(sim.pokokDibiayai)}
              </dd>
            </div>
            {sim.tenorBulan === 3 || sim.tenorBulan === 6 ? (
              <>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">Biaya admin 5% (diamortisasi)</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaAdminTotal)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">Biaya platform 2% (diamortisasi)</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaPlatformTotal)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">Total biaya tenor 7%</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaLayananTotal)}</dd>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="font-medium text-slate-700">Biaya layanan 3% (diamortisasi)</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaLayananTotal)}</dd>
              </div>
            )}
            <div className="bg-sky-50 px-3 py-2.5 text-sm">
              <dt className="font-semibold text-sky-900">
                Jadwal angsuran menurun · bunga {sim.persenBungaPerBulan}%/bulan dari sisa pokok
              </dt>
              <dd className="mt-2">
                <ol className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {sim.jadwal.map((angsuran) => (
                    <li key={angsuran.bulan} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-sky-900">Bulan {angsuran.bulan}</span>
                      <span className="font-semibold tabular-nums text-sky-800">{formatRupiah(angsuran.total)}</span>
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Total pembayaran ({sim.tenorBulan} bulan)</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(sim.totalPengembalian)}</dd>
            </div>
          </dl>
        ) : (
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col gap-1 bg-emerald-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold text-emerald-800">Perkiraan uang yang diterima (belum dikirim)</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">{formatRupiah(q.danaBersihDitransfer)}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Perkiraan total pembayaran</dt>
              <dd className="font-semibold tabular-nums">{formatRupiah(q.totalKewajibanPelunasan)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="loan-tenor-trigger">Pilih lama pinjaman</Label>
          <Select
            value={bulanan ? tenorBulan : tenorHari}
            onValueChange={(v) => (bulanan ? setTenorBulan(v) : setTenorHari(v))}
            disabled={submitting}
          >
            <SelectTrigger
              id="loan-tenor-trigger"
              aria-label="Lama pinjaman"
              aria-required="true"
              aria-invalid={error !== null && !tenorHari && !bulanan}
              aria-describedby={error !== null && !tenorHari && !bulanan ? "loan-form-error" : undefined}
              className="w-full"
            >
              <SelectValue placeholder="Pilih lama pinjaman" />
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
          <Label htmlFor="loan-purpose-trigger">Untuk apa pinjaman ini?</Label>
          <Select value={tujuan} onValueChange={setTujuan} disabled={submitting}>
            <SelectTrigger
              id="loan-purpose-trigger"
              aria-label="Tujuan pinjaman"
              aria-required="true"
              aria-invalid={error !== null && !tujuan}
              aria-describedby={error !== null && !tujuan ? "loan-form-error" : undefined}
              className="w-full"
            >
              <SelectValue placeholder="Pilih tujuan pinjaman" />
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
          <Label htmlFor="nama">Nama lengkap</Label>
          <Input id="nama" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Tulis nama lengkap" autoComplete="name" required aria-required="true" minLength={3} aria-invalid={error !== null && namaLengkap.trim().length < 3} aria-describedby={error !== null && namaLengkap.trim().length < 3 ? "loan-form-error" : undefined} disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank-tujuan">Nama bank atau dompet digital</Label>
          <Input id="bank-tujuan" value={namaBank} onChange={(e) => setNamaBank(e.target.value)} placeholder="BCA, Mandiri, DANA, OVO, GoPay" autoComplete="off" required aria-required="true" minLength={2} maxLength={60} aria-invalid={error !== null && (namaBank.trim().length < 2 || namaBank.trim().length > 60)} aria-describedby={error !== null && (namaBank.trim().length < 2 || namaBank.trim().length > 60) ? "loan-form-error" : undefined} disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening">Nomor rekening atau nomor dompet digital</Label>
          <Input id="rekening" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" autoComplete="off" required aria-required="true" aria-invalid={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))} aria-describedby={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, "")) ? "loan-form-error" : undefined} disabled={submitting} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catatan">Catatan tambahan (boleh dikosongkan)</Label>
        <Textarea id="catatan" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Ceritakan singkat tujuan penggunaan uang…" rows={2} disabled={submitting} />
      </div>

      {/* Tanda tangan canvas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Tanda tangan (opsional)
        </p>
        <p id="signature-help" className="mt-2 text-xs leading-5 text-muted-foreground">
          Bagian ini boleh dikosongkan. Gambar tanda tangan hanya disimpan di aplikasi dan tidak digunakan untuk memastikan identitas Anda.
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Area untuk menggambar tanda tangan (opsional)"
          aria-describedby="signature-help"
          className="mt-2 h-24 w-full touch-none rounded-xl border border-dashed border-slate-300 bg-white"
        />
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="ghost" aria-label="Hapus gambar tanda tangan" onClick={() => padRef.current?.clear()}>
            Hapus tanda tangan
          </Button>
        </div>
      </div>

      {/* Data diri dan dokumen */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Data diri dan dokumen (wajib)
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Nomor KTP dan foto dokumen disimpan bersama pengajuan. PINDAI belum memeriksa apakah data dan dokumen tersebut benar atau asli.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nik">Nomor KTP (NIK, 16 angka)</Label>
            <Input id="nik" type="text" inputMode="numeric" maxLength={16} required aria-required="true" aria-invalid={error !== null && nik.length !== 16} aria-describedby={error !== null && nik.length !== 16 ? "loan-form-error" : undefined} value={nik} onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))} placeholder="3204xxxxxxxxxxxx" className="tabular-nums" disabled={submitting} />
          </div>
          <div>
            <Label htmlFor="wa">Nomor WhatsApp (awali dengan 62)</Label>
            <Input id="wa" type="tel" inputMode="tel" autoComplete="tel" required aria-required="true" aria-invalid={error !== null && nomorWhatsApp.replace(/\D/g, "").length < 8} aria-describedby={error !== null && nomorWhatsApp.replace(/\D/g, "").length < 8 ? "loan-form-error" : undefined} value={nomorWhatsApp} onChange={(e) => setNomorWhatsApp(e.target.value.replace(/[^\d+]/g, ""))} placeholder="6281234567890" className="tabular-nums" disabled={submitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="penghasilan">Penghasilan per bulan (rupiah)</Label>
            <Input
              id="penghasilan"
              type="number"
              inputMode="numeric"
              min={500_000}
              max={100_000_000}
              step={1}
              value={penghasilan}
              onChange={(e) => setPenghasilan(e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="5000000"
              className="tabular-nums"
              required
              aria-required="true"
              aria-invalid={error !== null && (!Number.isSafeInteger(penghasilan) || penghasilan < 500_000 || penghasilan > 100_000_000)}
              aria-describedby="penghasilan-value"
              disabled={submitting}
            />
            <p id="penghasilan-value" className="text-xs text-muted-foreground">
              Isi dengan angka saja, misalnya 5000000. {penghasilan > 0 && Number.isSafeInteger(penghasilan) ? formatRupiah(penghasilan) : ""}
            </p>
          </div>
          <div>            <Label htmlFor="sumber">Dari mana penghasilan Anda? (contoh: gaji atau usaha)</Label>
            <Input id="sumber" value={sumberPenghasilan} required aria-required="true" aria-invalid={error !== null && sumberPenghasilan.trim().length < 3} aria-describedby={error !== null && sumberPenghasilan.trim().length < 3 ? "loan-form-error" : undefined} onChange={(e) => setSumberPenghasilan(e.target.value)} placeholder="Contoh: gaji, usaha" disabled={submitting} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {KYC_FILES.map(({ key, label }) => {
            const kameraAktif = cameraDoc?.key === key;
            const instruksi =
              key === "selfie"
                ? "Pastikan wajah dan KTP terlihat jelas di bingkai."
                : key === "ktp"
                  ? "Foto bagian depan KTP. Pastikan tulisannya terbaca."
                  : "Pastikan seluruh bukti penghasilan terlihat dan tulisannya terbaca.";

            return (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p id={`dok-label-${key}`} className="text-sm font-medium">{label}</p>
                    <p id={`dok-status-${key}`} role="status" aria-live="polite" className="mt-0.5 truncate text-xs text-muted-foreground">
                      {dok[key].busy
                        ? "Foto sedang dikirim…"
                        : dok[key].id
                          ? "Foto tersimpan di aplikasi. Identitas belum diperiksa."
                          : "Ambil foto dengan kamera. Ukuran maksimal 5 MB. Foto ini tidak memastikan identitas."}
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
                      {dok[key].busy ? "Mengirim foto…" : dok[key].id ? "Ambil ulang" : "Buka kamera"}
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
                        {cameraLoading ? "Menunggu izin kamera…" : "Tampilan kamera belum tersedia."}
                      </div>
                    )}
                    <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                      {cameraLoading
                        ? "Meminta izin kamera…"
                        : cameraError
                          ? "Kamera belum siap. Periksa pesan di bawah."
                          : cameraReady
                            ? "Kamera siap. Pastikan foto terlihat jelas."
                            : "Kamera sedang disiapkan…"}
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
                        Tutup kamera
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lokasi perangkat */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Lokasi Anda saat mengirim formulir (wajib)
            </p>
            {lokasi ? (
              <p role="status" aria-live="polite" className="mt-1 text-sm tabular-nums">
                <MapPin className="mr-1 inline size-4 text-emerald-600" />
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · perkiraan ketelitian ±{Math.round(lokasi.akurasi)} meter
              </p>
            ) : (
              <p role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">
                {lokBusy ? "Mengambil lokasi…" : "Lokasi belum tercatat. Izinkan akses lokasi pada browser."}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label={lokBusy ? "Sedang mengambil lokasi" : "Ambil lokasi"}
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
        Batas awal pinjaman adalah Rp1 juta. Jika pinjaman minimal Rp1 juta tercatat lunas tepat waktu di aplikasi, batas dapat naik hingga Rp10 juta. Catatan aplikasi tersimpan pada ledger internal PINDAI. Batas pinjaman Anda saat ini {formatRupiah(MAX)}. {bulanan ? "Jumlah cicilan ini hanya perkiraan. Aplikasi dapat mencatat pinjaman lunas sekaligus setelah masa pinjaman berakhir; catatan ini tersimpan pada ledger internal PINDAI." : `Pinjaman harian paling lama ${LOAN_LIMITS.maxTenorHari} hari.`} Perpindahan dana ditangani di luar aplikasi.
      </p>
    </form>
  );
}

/** Formulir pengajuan gadai. */
export function PawnForm({ onCreated }: { onCreated: () => void }) {
  const [deskripsiBarang, setDeskripsiBarang] = useState("");
  const [kategori, setKategori] = useState<string>("");
  const [alamatPenilaian, setAlamatPenilaian] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [namaBank, setNamaBank] = useState("");
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
      setError("Jelaskan barang lebih lengkap (minimal 10 karakter).");
      return;
    }
    if (!kategori) {
      setError("Pilih jenis barang.");
      return;
    }
    if (alamatPenilaian.trim().length < 10) {
      setError("Masukkan alamat tempat barang berada dengan lebih lengkap (minimal 10 karakter).");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap harus berisi minimal 3 karakter.");
      return;
    }
    if (namaBank.trim().length < 2 || namaBank.trim().length > 60) {
      setError("Nama bank atau dompet digital harus berisi 2 sampai 60 karakter.");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening atau dompet digital harus berisi 6 sampai 20 angka.");
      return;
    }
    setSubmitting(true);
    try {
      await createPawn({
        deskripsiBarang,
        kategori,
        alamatPenilaian,
        namaLengkap,
        namaBank,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
      });
      onCreated();
      setDeskripsiBarang("");
      setKategori("");
      setAlamatPenilaian("");
      setNamaLengkap("");
      setNamaBank("");
      setNomorRekening("");
      setCatatanPeminjam("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan gadai gagal dikirim. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Formulir ini hanya mencatat informasi yang Anda isi. Aplikasi belum memeriksa nama, alamat, atau barang Anda. Aplikasi juga tidak menjamin akan ada kunjungan, pemeriksaan, atau penyimpanan barang, dan perpindahan dana ditangani di luar aplikasi.
      </p>
      <div className="space-y-2">
        <Label htmlFor="barang">Jelaskan barang yang Anda ajukan</Label>
        <Textarea id="barang" value={deskripsiBarang} onChange={(e) => setDeskripsiBarang(e.target.value)} placeholder="Contoh: iPhone 14 Pro 256 GB, warna titanium, lengkap dengan kotak…" rows={3} required aria-required="true" minLength={10} aria-invalid={error !== null && deskripsiBarang.trim().length < 10} aria-describedby={error !== null && deskripsiBarang.trim().length < 10 ? "pawn-form-error" : undefined} disabled={submitting} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pawn-category-trigger">Jenis barang</Label>
        <Select value={kategori} onValueChange={setKategori} disabled={submitting}>
          <SelectTrigger
            id="pawn-category-trigger"
            aria-label="Jenis barang gadai"
            aria-required="true"
            aria-invalid={error !== null && !kategori}
            aria-describedby={error !== null && !kategori ? "pawn-form-error" : undefined}
            className="w-full"
          >
            <SelectValue placeholder="Pilih jenis barang" />
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
            Perkiraan jumlah pinjaman paling banyak {LTV_HINTS[kategori as CollateralCategory]}. Ini belum berarti pinjaman disetujui atau uang tersedia.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="alamat">Alamat tempat barang berada</Label>
        <Textarea id="alamat" value={alamatPenilaian} onChange={(e) => setAlamatPenilaian(e.target.value)} placeholder="Tulis alamat lengkap tempat barang berada…" rows={2} required aria-required="true" minLength={10} aria-invalid={error !== null && alamatPenilaian.trim().length < 10} aria-describedby={error !== null && alamatPenilaian.trim().length < 10 ? "pawn-form-error" : undefined} disabled={submitting} />
        <p className="text-xs leading-5 text-muted-foreground">
          Alamat ini hanya dicatat. Aplikasi belum memastikan barang berada di sana atau mengatur kunjungan untuk memeriksanya.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nama-gadai">Nama lengkap</Label>
          <Input id="nama-gadai" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Tulis nama lengkap" autoComplete="name" required aria-required="true" minLength={3} aria-invalid={error !== null && namaLengkap.trim().length < 3} aria-describedby={error !== null && namaLengkap.trim().length < 3 ? "pawn-form-error" : undefined} disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank-gadai">Nama bank atau dompet digital</Label>
          <Input id="bank-gadai" value={namaBank} onChange={(e) => setNamaBank(e.target.value)} placeholder="BCA, Mandiri, DANA, OVO, GoPay" autoComplete="off" required aria-required="true" minLength={2} maxLength={60} aria-invalid={error !== null && (namaBank.trim().length < 2 || namaBank.trim().length > 60)} aria-describedby={error !== null && (namaBank.trim().length < 2 || namaBank.trim().length > 60) ? "pawn-form-error" : undefined} disabled={submitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rekening-gadai">Nomor rekening atau nomor dompet digital</Label>
          <Input id="rekening-gadai" inputMode="numeric" value={nomorRekening} onChange={(e) => setNomorRekening(e.target.value)} placeholder="1234567890" className="tabular-nums" autoComplete="off" required aria-required="true" aria-invalid={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))} aria-describedby={error !== null && !/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, "")) ? "pawn-form-error" : undefined} disabled={submitting} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="catatan-gadai">Catatan tambahan (boleh dikosongkan)</Label>
        <Textarea id="catatan-gadai" value={catatanPeminjam} onChange={(e) => setCatatanPeminjam(e.target.value)} placeholder="Tuliskan kondisi atau kelengkapan barang…" rows={2} disabled={submitting} />
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
        Perkiraan harga dan kondisi barang serta nomor tempat penyimpanan hanya dicatat di aplikasi. Aplikasi tidak memeriksa barang atau memastikan barang sudah diterima dan disimpan. Status di aplikasi belum menandai barang sudah dikembalikan. Perpindahan dana ditangani di luar aplikasi.
      </p>
    </form>
  );
}
