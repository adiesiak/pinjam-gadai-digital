import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowRight, Camera, Loader2, MapPin, Save, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import SignaturePad from "signature_pad";

import {
  IdentitasKycTerverifikasi,
  MedanDariKyc,
  PeringatanKyc,
} from "@/components/kyc/PeringatanKyc";
import { JebakanFormulir } from "@/components/JebakanFormulir";
import { kunciIdempotensiBaru } from "@/lib/gerbangKirim";
import { Button } from "@/components/ui/button";
import { BilahTakTentu } from "@/components/ui/loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCegahTinggalkan, useKirimSekali } from "@/hooks/use-cegah-tinggalkan";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { adaPerubahan } from "@/lib/formInteraksi";
import {
  KYC_FILES,
  MAX_FILE_BYTES,
  identitasDasarKyc,
  identitasPengajuanDariKyc,
  validateKycInput,
  type KycFileKey,
} from "@/lib/kyc";
import { isKycVerified } from "@/lib/kycStatus";
import {
  BULANAN_LIMITS,
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
} from "@/lib/bulanan";
import {
  LOAN_LIMITS,
  LOAN_PURPOSE_OPTIONS,
  quotePinjaman,
  TENOR_OPTIONS,
} from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  batasDiajukan,
  kalimatBatasPlafon,
  pesanPlafonTerlampaui,
  pesanPlafonTersediaTerlampaui,
  PLAFON_DEFAULT,
  PLAFON_NAIK_SETELAH_LUNAS,
  pokokDalamPlafon,
  type RingkasanPlafon,
} from "@/lib/plafon";
import {
  COLLATERAL_CATEGORIES,
  LTV_HINTS,
  type CollateralCategory,
} from "@/lib/pawn";

/**
 * Ringkasan bulanan yang tidak melempar error saat input belum valid —
 * slider bergerak cepat, jadi nilai di luar rentang cukup tampil kosong.
 */
function simulasiBulananAman(pokok: number, tenorBulan: number, persenBunga?: number) {
  try {
    return hitungSimulasiBulanan(
      pokok,
      tenorBulan,
      persenBunga === undefined ? {} : { persenBungaPerBulan: persenBunga },
    );
  } catch {
    return null;
  }
}

/** Formulir pengajuan pinjaman. */
export function LoanForm({
  onCreated,
  onBukaKyc,
}: {
  onCreated: (ref: string) => void;
  /** Pindah ke tab Verifikasi KYC — dipakai gerbang KYC di UI. */
  onBukaKyc?: () => void;
}) {
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
  // Jejak anti-pengiriman-palsu: cap waktu formulir dibuka dan kolom jebakan.
  // Cap waktunya dibuat sekali saat komponen dipasang, jadi percobaan ulang
  // setelah gagal tetap memakai waktu buka yang sama.
  const [formDibukaPada] = useState(() => Date.now());
  const [jebakan, setJebakan] = useState("");
  // Satu kunci per formulir: percobaan ulang setelah gagal mengembalikan
  // pengajuan yang SAMA, bukan yang kedua.
  const [kunciKirim] = useState(() => kunciIdempotensiBaru());
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  /** Tanda tangan wajib: true selama area tanda tangan masih kosong. */
  const [ttdKosong, setTtdKosong] = useState(true);

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
    const syncTtd = () => setTtdKosong(pad.isEmpty());
    pad.addEventListener("endStroke", syncTtd);
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
      syncTtd();
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
  // Persetujuan Syarat & Ketentuan saat mengirim formulir.
  const [setujuOpen, setSetujuOpen] = useState(false);
  const [setujuCentang, setSetujuCentang] = useState(false);
  // Unggah bukti penghasilan dari galeri/berkas, bukan hanya kamera.
  const slipInputRef = useRef<HTMLInputElement | null>(null);

  // ===== Praisi dari data diri tersimpan =====
  // Data diri yang sudah disimpan (oleh nasabah atau admin) dipakai untuk
  // mengisi formulir sekali saja, dan hanya ke kolom yang masih KOSONG — supaya
  // tidak pernah menimpa ketikan yang sudah dimulai. Dijadwalkan sebagai
  // microtask karena setState langsung di dalam efek dilarang aturan
  // react-hooks (pola yang sama dipakai pengambilan lokasi di atas).
  const dataDiriTersimpan = useQuery(api.profilNasabah.dataDiriSaya);
  const praisiRef = useRef(false);
  useEffect(() => {
    if (praisiRef.current || dataDiriTersimpan === undefined) return;
    praisiRef.current = true;
    const d = dataDiriTersimpan.data;
    queueMicrotask(() => {
      setNik((v) => (v === "" ? d.nik : v));
      setNomorWhatsApp((v) => (v === "" ? d.nomorWhatsApp : v));
      setPenghasilan((v) =>
        (v === 5_000_000 || v === 0) && d.penghasilanBulanan !== null ? d.penghasilanBulanan : v,
      );
      setSumberPenghasilan((v) => (v === "" && d.pekerjaan !== "" ? d.pekerjaan : v));
      setNamaLengkap((v) => (v === "" ? d.namaLengkap : v));
      setNamaBank((v) => (v === "" ? d.namaBank : v));
      setNomorRekening((v) => (v === "" ? d.nomorRekening : v));
    });
  }, [dataDiriTersimpan]);

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
  // Gerbang izin server: percobaan mencurigakan tercatat dan kunci sementara
  // ditegakkan sebelum pengajuan dikirim.
  const mintaIzin = useMutation(api.gerbangKirim.mintaIzinKirim);
  const generateUploadUrl = useMutation(api.loans.generateKycUploadUrl);
  // Periksa ISI berkas (magic bytes) sesudah unggah: batas "harus gambar" yang
  // hanya hidup di form dan metadata MIME bisa dilewati dengan mengirim berkas
  // lain langsung ke URL unggah.
  const periksaIsi = useAction(api.berkasIdentitas.periksaIsiBerkasKyc);

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
      () => {
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
      await periksaIsi({ id: json.storageId, label });
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
  const bungaQuery = useQuery(api.lokasi.bungaSaya, {});
  const bungaSaya = bungaQuery ?? undefined;
  const sim = bulanan ? simulasiBulananAman(pokok, tenorBulanNum, bungaSaya) : null;
  const q = quotePinjaman({ pokokPinjaman: pokok, persenBunga: bungaSaya });
  // Batas pinjaman dari SERVER (`nasabah.plafonRingkasSaya`): plafon master
  // dipotong pokok pinjaman berjalan, memakai `ringkasPlafon` yang sama dengan
  // validasi `loans.createLoanApplication`. Selama belum termuat, `ringkas` null
  // dan layar tidak menyebut angka batas apa pun — penggesernya pun terkunci.
  const plafonQuery = useQuery(api.nasabah.plafonRingkasSaya, {});
  const ringkas: RingkasanPlafon | null = plafonQuery ?? null;
  const batasTerbaca = ringkas !== null;
  // Gerbang KYC: server menolak pengajuan tanpa KYC VERIFIED, jadi UI
  // mencerminkannya lebih dulu supaya formulir panjang tidak diisi sia-sia.
  const kycQuery = useQuery(api.kyc.kycSaya, {});
  const kycSiap = isKycVerified(kycQuery?.status);
  // Identitas yang SUDAH diperiksa petugas dipakai ulang: bagian data diri &
  // dokumen tidak ditanyakan dua kali. `null` berarti belum bisa dipakai ulang
  // (status belum VERIFIED, isian belum lengkap, atau berkasnya hilang dari
  // baris KYC) — dan saat itu formulir menampilkan bagian data diri seperti
  // biasa, jadi tidak pernah ada isian yang "hilang" tanpa jejak.
  const identitasKyc = kycSiap
    ? identitasPengajuanDariKyc({
        namaLengkap: kycQuery?.isian.namaLengkap,
        nik: kycQuery?.isian.nik,
        nomorWhatsApp: kycQuery?.isian.nomorWhatsApp,
        penghasilanBulanan: kycQuery?.isian.penghasilanBulanan,
        sumberPenghasilan: kycQuery?.isian.sumberPenghasilan,
        ktpId: kycQuery?.dokumen.ktpId,
        selfieKtpId: kycQuery?.dokumen.selfieKtpId,
        buktiPenghasilanId: kycQuery?.dokumen.buktiPenghasilanId,
      })
    : null;
  const identitasTersimpan = identitasKyc !== null;
  // Nama untuk akad & ledger: dari KYC bila sudah terverifikasi, kalau tidak
  // dari isian formulir.
  const namaPengajuan = identitasKyc === null ? namaLengkap : identitasKyc.namaLengkap;

  // ===== Draf pengajuan (tabel `draftPinjaman`) =====
  // Draf menyimpan isian NON-IDENTITAS supaya pekerjaan tidak hilang saat
  // nasabah pindah ke WhatsApp/galeri atau menutup halaman. Draf BUKAN
  // pengajuan: ia tidak menahan plafon, tidak masuk antrean review, dan
  // pengirimannya tetap lewat tombol "Kirim Pengajuan" (yang digerbangi KYC).
  const draftQuery = useQuery(api.draftPinjaman.draftSaya, {});
  const simpanDraft = useMutation(api.draftPinjaman.simpanDraft);
  const hapusDraft = useMutation(api.draftPinjaman.hapusDraft);
  const [draftId, setDraftId] = useState<Id<"draftPinjaman"> | null>(null);
  const [draftDipulihkan, setDraftDipulihkan] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  // Pulihkan draf SEKALI saat query selesai memuat.
  useEffect(() => {
    if (draftDipulihkan || draftQuery === undefined) return;
    queueMicrotask(() => {
      setDraftDipulihkan(true);
      if (draftQuery === null) return;
      setDraftId(draftQuery._id);
      setSkema(draftQuery.skema === "bulanan" ? "bulanan" : "harian");
      setPokok(draftQuery.pokokPinjaman);
      setTenorHari(String(draftQuery.tenorHari));
      if (draftQuery.tenorBulan !== null) setTenorBulan(String(draftQuery.tenorBulan));
      setTujuan(draftQuery.tujuan);
      if (draftQuery.catatanPeminjam !== null) setCatatanPeminjam(draftQuery.catatanPeminjam);
      setDraftNotice("Draf dipulihkan. Lanjutkan isian Anda, lalu kirim bila sudah siap.");
    });
  }, [draftQuery, draftDipulihkan]);

  const simpanDraf = async () => {
    if (draftBusy) return;
    setDraftBusy(true);
    setError(null);
    try {
      const hasil = await simpanDraft({
        ...(draftId !== null ? { draftId } : {}),
        skema,
        pokokPinjaman: pokok,
        tenorHari: bulanan ? 30 : Number(tenorHari),
        ...(bulanan ? { tenorBulan: tenorBulanNum } : {}),
        tujuan: tujuan.trim(),
        ...(catatanPeminjam.trim() !== "" ? { catatanPeminjam: catatanPeminjam.trim() } : {}),
      });
      setDraftId(hasil.draftId);
      setDraftNotice(
        "Draf tersimpan di server. Anda dapat menutup halaman dan melanjutkannya kapan saja.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draf gagal disimpan. Silakan coba lagi.");
    } finally {
      setDraftBusy(false);
    }
  };
  // Batas per skema: harian Rp100 ribu–Rp1 juta / bulanan mengikuti aturan skema,
  // keduanya tidak boleh melebihi SISA batas pinjaman nasabah.
  const MIN = bulanan ? BULANAN_LIMITS.minPokok : LOAN_LIMITS.minPokok;
  const BATAS_SKEMA = bulanan ? BULANAN_LIMITS.maxPokok : LOAN_LIMITS.maxPokok;
  // Sisa yang boleh ditawarkan = TERSEDIA dari server, dipotong batas skema.
  // Belum termuat → batas awal hanya menahan penggeser; angkanya tidak dicetak.
  const sisaBatas = batasDiajukan(ringkas?.tersedia ?? PLAFON_DEFAULT, BATAS_SKEMA);
  const adaSisa = sisaBatas >= MIN;
  const MAX = adaSisa ? sisaBatas : MIN;
  const STEP = bulanan ? 100_000 : 50_000;

  // Kalimat batas & keterangan nominal disusun dari ANGKA SERVER yang sama:
  // kartu ringkasan, penggeser, dan pesan galat tidak bisa saling bertentangan.
  const ungkapBatas =
    ringkas === null
      ? "Batas pinjaman Anda sedang dibaca dari server."
      : kalimatBatasPlafon(ringkas);
  const keteranganNominal = !adaSisa
    ? `${ungkapBatas} Belum ada sisa yang bisa diajukan untuk skema ini — lunasi pinjaman berjalan lebih dulu, atau hubungi tim PINDAI bila batasnya perlu ditinjau.`
    : !batasTerbaca
      ? "Ini hanya perkiraan, bukan persetujuan pinjaman. Batas pinjaman Anda sedang dibaca; penggeser terbuka setelah angkanya tersimpan."
      : bulanan
        ? `Ini hanya perkiraan, bukan persetujuan pinjaman. ${ungkapBatas} Catatan pinjaman yang ditandai lunas tepat waktu di aplikasi dapat menaikkan batas hingga ${formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)}.`
        : `Ini hanya perkiraan, bukan persetujuan pinjaman. Jumlah pinjaman harian ${formatRupiah(MIN)} sampai ${formatRupiah(MAX)}, paling lama ${LOAN_LIMITS.maxTenorHari} hari. ${ungkapBatas} Catatan pinjaman yang ditandai lunas tepat waktu di aplikasi dapat menaikkan batas hingga ${formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)}.`;

  // Query batas dapat datang terlambat atau berubah akibat override admin.
  // Batasi jumlah pinjaman agar penggeser dan perkiraan mengikuti batas terbaru.
  useEffect(() => {
    let batal = false;
    queueMicrotask(() => {
      if (!batal) {
        setPokok((sebelumnya) => Math.min(Math.max(sebelumnya, MIN), MAX));
      }
    });
    return () => {
      batal = true;
    };
  }, [MAX, MIN]);

  // Saat pilihan atau batas berubah, sesuaikan jumlah agar tetap dalam rentang yang diizinkan.
  const gantiSkema = (next: "harian" | "bulanan") => {
    setSkema(next);
    setError(null);
    setPokok((p) => {
      const batasAtas = batasDiajukan(
        ringkas?.tersedia ?? PLAFON_DEFAULT,
        next === "bulanan" ? BULANAN_LIMITS.maxPokok : LOAN_LIMITS.maxPokok,
      );
      return Math.min(Math.max(p, LOAN_LIMITS.minPokok), Math.max(batasAtas, LOAN_LIMITS.minPokok));
    });
  };

  // Kiriman dikunci sekali-pakai: tombol `disabled` baru berlaku SETELAH React
  // merender ulang, sedangkan klik ganda dan Enter berulang datang lebih dahulu.
  const kirimSekali = useKirimSekali();
  const bukaKunciKirim = kirimSekali.buka;
  useEffect(() => {
    if (!submitting) bukaKunciKirim();
  }, [submitting, bukaKunciKirim]);

  // Peringatan "belum disimpan" hanya untuk isian yang benar-benar diisi
  // pengguna — nilai bawaan (pokok, tenor, penghasilan) bukan perubahan, jadi
  // membuka formulir lalu berpindah tab tidak pernah memunculkan peringatan.
  const kotorLoan =
    adaPerubahan(
      {
        tujuan: "",
        namaLengkap: "",
        namaBank: "",
        nomorRekening: "",
        catatanPeminjam: "",
        nik: "",
        nomorWhatsApp: "",
        sumberPenghasilan: "",
        ttdKosong: true,
      },
      {
        tujuan,
        namaLengkap,
        namaBank,
        nomorRekening,
        catatanPeminjam,
        nik,
        nomorWhatsApp,
        sumberPenghasilan,
        ttdKosong,
      },
    ) || dok.ktp.id !== null || dok.selfie.id !== null || dok.slip.id !== null;
  const perluDicegahLoan = useCegahTinggalkan(kotorLoan);

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
    if (!adaSisa) {
      setError(keteranganNominal);
      return;
    }
    if (ringkas !== null && !pokokDalamPlafon(pokok, ringkas.tersedia)) {
      // Kalimat yang sama persis dengan `loans.createLoanApplication`.
      setError(
        ringkas.terpakai > 0
          ? pesanPlafonTersediaTerlampaui(ringkas)
          : pesanPlafonTerlampaui(ringkas.maksimal),
      );
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
    // Nama diambil dari KYC saat identitas sudah terverifikasi.
    if (namaPengajuan.trim().length < 3) {
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
    // Bagian data diri hanya diperiksa saat formulir memang menanyakannya:
    // ketika KYC sudah terverifikasi, nilainya diambil dari baris KYC nasabah
    // (lihat `identitasPengajuanDariKyc`) dan tidak ada isian untuk diperiksa.
    if (!identitasTersimpan) {
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
        setError(
          "Lengkapi foto KTP, selfie sambil memegang KTP, dan bukti penghasilan (kamera atau berkas).",
        );
        return;
      }
    }
    if (lokasi === null) {
      setError("Lokasi Anda belum tercatat. Izinkan akses lokasi, lalu pilih 'Ambil lokasi'.");
      return;
    }
    // Tanda tangan wajib — pengajuan tidak diteruskan tanpa gambar tanda tangan.
    const pad = padRef.current;
    if (pad === null || pad.isEmpty()) {
      setError("Tanda tangan wajib diisi di area tanda tangan sebelum mengirim.");
      return;
    }

    // Semua validasi lolos — minta persetujuan Syarat & Ketentuan dulu.
    setSetujuCentang(false);
    setSetujuOpen(true);
  };

  /** Kirim pengajuan setelah pengguna mencentang Syarat & Ketentuan. */
  const kirimPengajuan = async () => {
    const pad = padRef.current;
    // Identitas pengiriman: dari isian formulir, ATAU dari baris KYC nasabah
    // ketika identitasnya sudah terverifikasi. Keduanya menghasilkan muatan
    // yang sama — server tetap memeriksa berkasnya sendiri.
    const dokKtpId = identitasKyc === null ? dok.ktp.id : identitasKyc.dokKtpId;
    const dokSelfieId = identitasKyc === null ? dok.selfie.id : identitasKyc.dokSelfieKtpId;
    const dokSlipId = identitasKyc === null ? dok.slip.id : identitasKyc.dokSlipGajiId;
    // Jaga-jaga: jangan kirim bila dokumen/lokasi hilang antara validasi dan klik setuju.
    if (pad === null || !dokKtpId || !dokSelfieId || !dokSlipId || lokasi === null) return;
    // Satu pengiriman saja, walau tombol setuju ditekan berulang.
    if (!kirimSekali.kunci()) return;
    setSubmitting(true);
    try {
      const izin = await mintaIzin({ jebakan, formDibukaPada });
      if (!izin.ok) {
        setError(izin.alasan ?? "Pengajuan tidak dapat diproses. Coba lagi.");
        bukaKunciKirim();
        return;
      }
      const ttdDataUrl = pad.toDataURL("image/png");

      const result = await createLoan({
        pokokPinjaman: pokok,
        // tenorHari tetap dikirim (diabaikan server) saat skema bulanan aktif.
        tenorHari: bulanan ? 30 : Number(tenorHari),
        tenorBulan: bulanan ? tenorBulanNum : undefined,
        tujuan,
        namaLengkap: namaPengajuan,
        namaBank,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
        tandaTangan: ttdDataUrl,
        // Persetujuan Syarat & Ketentuan dicatat server bersama versinya.
        persetujuanSyarat: true,
        nik: identitasKyc === null ? nik.replace(/\s+/g, "") : identitasKyc.nik,
        nomorWhatsApp:
          identitasKyc === null
            ? nomorWhatsApp.replace(/[\s+-]/g, "")
            : identitasKyc.nomorWhatsApp,
        penghasilanBulanan:
          identitasKyc === null ? penghasilan : identitasKyc.penghasilanBulanan,
        sumberPenghasilan:
          identitasKyc === null ? sumberPenghasilan : identitasKyc.sumberPenghasilan,
        dokKtpId: dokKtpId as Id<"_storage">,
        dokSelfieKtpId: dokSelfieId as Id<"_storage">,
        dokSlipGajiId: dokSlipId as Id<"_storage">,
        lokasiAjukan: lokasi,
        jebakan,
        formDibukaPada,
        kunciIdempotensi: kunciKirim,
      });
      // Pengajuan sudah menjadi catatan resmi — drafnya tidak diperlukan lagi.
      if (draftId !== null) {
        await hapusDraft({ draftId }).catch(() => {
          /* Gagal menghapus draf tidak menggagalkan pengajuan yang sudah tercatat. */
        });
        setDraftId(null);
      }
      onCreated(result.nomorReferensi);
      setTujuan("");
      setNamaLengkap("");
      setNamaBank("");
      setNomorRekening("");
      setCatatanPeminjam("");
      padRef.current?.clear();
      setTtdKosong(true);
      setSetujuOpen(false);
      setSetujuCentang(false);
    } catch (err) {
      setSetujuOpen(false);
      setError(err instanceof Error ? err.message : "Pengajuan gagal dikirim. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <JebakanFormulir nilai={jebakan} onUbah={setJebakan} />
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Formulir ini mencatat pengajuan dan perkiraan hitungannya. Data, dokumen, gambar tanda tangan, dan lokasi yang Anda kirim hanya menjadi masukan. Data identitas dan lokasi Anda dicatat sebagai masukan pengajuan; perpindahan dana ditangani di luar aplikasi.
      </p>
      {/* Identitas sudah diperiksa petugas: formulir ini fokus pada parameter
          pengajuan, dan buktinya ditampilkan di sini — bukan sekadar disembunyikan. */}
      {identitasKyc !== null && (
        <IdentitasKycTerverifikasi
          namaLengkap={identitasKyc.namaLengkap}
          nik={identitasKyc.nik}
          nomorWhatsApp={identitasKyc.nomorWhatsApp}
          onBukaKyc={onBukaKyc}
        />
      )}
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
        {/* Penggeser hanya muncul saat memang ada sisa: batas atas yang dicetak
            belum pernah lebih tinggi dari yang diterima server, dan keadaan
            "sisa habis" dijelaskan sebagai kalimat, bukan rentang palsu. */}
        {adaSisa && (
          <>
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
              disabled={submitting || !batasTerbaca}
              onValueChange={(v) => setPokok(v[0] ?? MIN)}
              id="nominal-pinjaman"
              aria-label="Jumlah pinjaman dalam rupiah"
              aria-labelledby="nominal-pinjaman-label"
              aria-valuetext={formatRupiah(pokok)}
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{formatRupiah(MIN)}</span>
              {/* Batas atas baru dicetak setelah server menjawab. */}
              <span>{batasTerbaca ? formatRupiah(MAX) : "…"}</span>
            </div>
          </>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{keteranganNominal}</p>

        {/* Ringkasan peminjam: nilai bersih dan total pembayaran. */}
        {bulanan && sim !== null ? (
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col gap-1 bg-emerald-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold text-emerald-800">Perkiraan dana bersih setelah potongan di muka (belum dicairkan)</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">
                {formatRupiah(sim.danaDiterima)}
              </dd>
            </div>
            {sim.tenorBulan === 3 || sim.tenorBulan === 6 ? (
              <>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">Biaya admin 2% (dipotong di muka)</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaAdminTotal)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">Biaya platform 0% (dihapus)</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaPlatformTotal)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">Total potongan di muka 2%</dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaLayananTotal)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-medium text-slate-700">
                    Biaya admin cicilan 2% dari nominal cicilan ({sim.tenorBulan} kali bayar)
                  </dt>
                  <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaAdminCicilanTotal)}</dd>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1 bg-white px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="font-medium text-slate-700">Biaya layanan 2% (dipotong di muka)</dt>
                <dd className="font-medium tabular-nums">{formatRupiah(sim.biayaLayananTotal)}</dd>
              </div>
            )}
            <div className="bg-sky-50 px-3 py-2.5 text-sm">
              <dt className="font-semibold text-sky-900">
                Jadwal angsuran rata · bunga {sim.persenBungaPerBulan}%/bulan flat dari pokok penuh
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
              {/* Label dipasang manual: Radix hanya mengisi wajah trigger dari
                  item yang sudah pernah dirender, jadi tanpa children ini
                  dropdown tenor tampak kosong sampai dibuka sekali. */}
              <SelectValue placeholder="Pilih lama pinjaman">
                {bulanan ? `${tenorBulan} bulan` : `${tenorHari} hari`}
              </SelectValue>
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
        {/* Nama hanya ditanyakan bila belum ada identitas terverifikasi: saat
            sudah terverifikasi, nama yang dipakai akad adalah nama di KYC. */}
        {identitasKyc === null && (
          <div className="space-y-2">
            <Label htmlFor="nama">Nama lengkap</Label>
            <Input id="nama" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Tulis nama lengkap" autoComplete="name" required aria-required="true" minLength={3} aria-invalid={error !== null && namaLengkap.trim().length < 3} aria-describedby={error !== null && namaLengkap.trim().length < 3 ? "loan-form-error" : undefined} disabled={submitting} />
          </div>
        )}
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
          Tanda tangan (wajib)
        </p>
        <p id="signature-help" className="mt-2 text-xs leading-5 text-muted-foreground">
          Tanda tangan wajib dibubuhkan di sini. Gambar tanda tangan disimpan sebagai lampiran pengajuan.
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Area untuk menggambar tanda tangan (wajib)"
          aria-describedby="signature-help"
          className={`mt-2 h-24 w-full touch-none rounded-xl border border-dashed bg-white ${ttdKosong && error !== null ? "border-destructive" : "border-slate-300"}`}
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Hapus gambar tanda tangan"
            onClick={() => {
              padRef.current?.clear();
              setTtdKosong(true);
            }}
          >
            Hapus tanda tangan
          </Button>
        </div>
      </div>

      {/* Data diri dan dokumen — hanya saat identitasnya belum terverifikasi.
          Setelah VERIFIED, isian & berkasnya dipakai ulang dari baris KYC
          (badge hijau di atas formulir), sehingga tidak ada yang ditanyakan
          dua kali; berkas yang sudah diperiksa petugas tidak diunggah ulang. */}
      {!identitasTersimpan && (
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
                          ? "Foto tersimpan di aplikasi."
                          : key === "slip"
                            ? "Ambil dengan kamera atau pilih berkas dari galeri. Ukuran maksimal 5 MB."
                            : "Ambil foto dengan kamera. Ukuran maksimal 5 MB."}
                    </p>
                  </div>
                  {!kameraAktif && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
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
                      {key === "slip" && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Pilih berkas ${label} dari galeri`}
                            disabled={submitting || dok[key].busy || cameraLoading || cameraDoc !== null}
                            onClick={() => slipInputRef.current?.click()}
                          >
                            <Upload className="size-3.5" />
                            Pilih berkas
                          </Button>
                          <input
                            ref={slipInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            tabIndex={-1}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              void handleFile("slip", label, file);
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
                {/* Bilah tak tentu: unggahan tidak melaporkan berapa byte yang
                    terkirim, jadi tidak ada persen — hanya tanda bahwa foto ini
                    masih dikirim. */}
                {dok[key].busy && (
                  <BilahTakTentu className="mt-2" label="Mengunggah foto… jangan tutup halaman ini." />
                )}
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
      )}

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

      {/* Pop-up Syarat & Ketentuan — wajib dicentang sebelum pengajuan dikirim. */}
      <Dialog
        open={setujuOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setSetujuOpen(open);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              Syarat &amp; Ketentuan
            </DialogTitle>
            <DialogDescription>
              Bacalah ringkasan ini sebelum mengirim pengajuan.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm leading-6 text-slate-600">
            {[
              "PINDAI mencatat pengajuan, perhitungan, dan status — bukan memindahkan dana.",
              "Bunga flat 30% dari pokok dan biaya dipotong di muka sesuai tenor yang dipilih.",
              "Persetujuan pengajuan bukan jaminan pencairan; keputusan dibuat tim PINDAI dan tercatat pada audit trail.",
              "Keterlambatan dikenai denda 2% per hari dari pokok (maksimum 100%).",
              "Data dan dokumen yang Anda kirim hanya dibuka oleh akun Anda dan tim PINDAI.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-500">
            Versi {CONTRACT_TERMS_VERSION}.{" "}
            <Link
              to="/syarat-ketentuan"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Baca ketentuan selengkapnya
            </Link>
            .
          </p>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={setujuCentang}
              onChange={(event) => setSetujuCentang(event.target.checked)}
            />
            <span>Saya telah membaca dan menyetujui Syarat &amp; Ketentuan PINDAI.</span>
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSetujuOpen(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void kirimPengajuan()}
              disabled={!setujuCentang || submitting}
            >
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {submitting ? "Mengirim…" : "Setuju & kirim"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Penanda perubahan belum terkirim: terlihat sebelum peringatan keluar
          muncul, supaya pengguna tidak kaget saat peramban bertanya. */}
      {perluDicegahLoan && !submitting && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Pengajuan ini belum dikirim dan isiannya belum tersimpan. Menutup halaman atau memuat
          ulang akan menghilangkannya.
        </p>
      )}

      {draftNotice !== null && (
        <p
          role="status"
          className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900"
        >
          {draftNotice}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={draftBusy || submitting}
        onClick={simpanDraf}
      >
        {draftBusy ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Menyimpan draf…
          </>
        ) : (
          <>
            <Save className="mr-2 size-4" /> Simpan draf (bukan pengajuan)
          </>
        )}
      </Button>

      {kycQuery !== undefined && !kycSiap && <PeringatanKyc onBukaKyc={onBukaKyc} />}

      <Button
        type="submit"
        className="w-full"
        disabled={
          submitting ||
          !kycSiap ||
          !batasTerbaca ||
          !adaSisa ||
          cameraDoc !== null ||
          Object.values(dok).some((file) => file.busy)
        }
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
        Batas awal {formatRupiah(PLAFON_DEFAULT)}. Pinjaman minimal Rp1 juta yang tercatat lunas tepat waktu menaikkan batas sampai {formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)}. {ungkapBatas} {bulanan ? "Jumlah cicilan ini perkiraan; pelunasan dicatat penuh saat tenor berakhir." : `Pinjaman harian paling lama ${LOAN_LIMITS.maxTenorHari} hari.`} Semua tersimpan di PINDAI, dan perpindahan dana ditangani di luar aplikasi.
      </p>
    </form>
  );
}

/** Formulir pengajuan gadai. */
export function PawnForm({
  onCreated,
  onBukaKyc,
}: {
  onCreated: () => void;
  /** Pindah ke tab Verifikasi KYC — dipakai gerbang KYC di UI. */
  onBukaKyc?: () => void;
}) {
  const [deskripsiBarang, setDeskripsiBarang] = useState("");
  const [kategori, setKategori] = useState<string>("");
  const [alamatPenilaian, setAlamatPenilaian] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [namaBank, setNamaBank] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Jejak anti-pengiriman-palsu, sama seperti formulir pinjaman di berkas ini.
  const [formDibukaPada] = useState(() => Date.now());
  const [jebakan, setJebakan] = useState("");
  const [kunciKirim] = useState(() => kunciIdempotensiBaru());
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const createPawn = useMutation(api.loans.createPawnApplication);
  /** Gerbang izin yang sama dengan formulir pinjaman di berkas ini. */
  const mintaIzinGadai = useMutation(api.gerbangKirim.mintaIzinKirim);
  // Lihat LoanForm: gerbang KYC dicerminkan di UI; server tetap penentu.
  const kycQuery = useQuery(api.kyc.kycSaya, {});
  const kycSiap = isKycVerified(kycQuery?.status);
  // Gadai hanya menyimpan NAMA pemohon (tanpa NIK/WA/berkas), jadi hanya nama
  // yang dipakai ulang dari KYC. Nama bank & rekening tetap diisi di sini:
  // keduanya tujuan pencairan yang perlu dipastikan ulang per pengajuan.
  const identitasKyc = kycSiap ? identitasDasarKyc(kycQuery?.isian) : identitasDasarKyc(null);
  const namaGadai = identitasKyc.namaLengkap !== "" ? identitasKyc.namaLengkap : namaLengkap;

  // Lihat LoanForm: kunci sekali-pakai menutup celah antara klik dan render
  // ulang tombol, dan peringatan keluar hanya muncul bila isian benar-benar diisi.
  const kirimSekali = useKirimSekali();
  const bukaKunciKirim = kirimSekali.buka;
  useEffect(() => {
    if (!submitting) bukaKunciKirim();
  }, [submitting, bukaKunciKirim]);

  const kotorPawn = adaPerubahan(
    {
      deskripsiBarang: "",
      kategori: "",
      alamatPenilaian: "",
      namaLengkap: "",
      namaBank: "",
      nomorRekening: "",
      catatanPeminjam: "",
    },
    {
      deskripsiBarang,
      kategori,
      alamatPenilaian,
      namaLengkap,
      namaBank,
      nomorRekening,
      catatanPeminjam,
    },
  );
  const perluDicegahPawn = useCegahTinggalkan(kotorPawn);

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
    // Nama yang diperiksa adalah nama YANG DIKIRIM: dari KYC bila ada.
    if (namaGadai.trim().length < 3) {
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
    if (!kirimSekali.kunci()) return;
    setSubmitting(true);
    try {
      const izin = await mintaIzinGadai({ jebakan, formDibukaPada });
      if (!izin.ok) {
        setError(izin.alasan ?? "Pengajuan tidak dapat diproses. Coba lagi.");
        bukaKunciKirim();
        return;
      }
      await createPawn({
        deskripsiBarang,
        kategori,
        alamatPenilaian,
        namaLengkap: namaGadai,
        namaBank,
        nomorRekening,
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
        jebakan,
        formDibukaPada,
        kunciIdempotensi: kunciKirim,
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
      <JebakanFormulir nilai={jebakan} onUbah={setJebakan} />
      {/* Nama sudah diperiksa petugas lewat KYC: pengajuan gadai tidak perlu
          menanyakannya lagi, dan buktinya ditampilkan di sini. */}
      {identitasKyc.namaLengkap !== "" && (
        <IdentitasKycTerverifikasi
          namaLengkap={identitasKyc.namaLengkap}
          petunjuk="Nama pemohon dipakai dari KYC yang sudah diperiksa petugas. Isi cukup data barang, alamat, rekening, dan catatan."
          onBukaKyc={onBukaKyc}
        />
      )}
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Formulir ini hanya mencatat informasi yang Anda isi.{" "}
        {identitasKyc.namaLengkap !== ""
          ? "Nama pemohon memakai data KYC yang sudah diperiksa petugas; alamat dan barang yang Anda isi belum diperiksa."
          : "Aplikasi belum memeriksa nama, alamat, atau barang Anda."}{" "}
        Aplikasi juga tidak menjamin akan ada kunjungan, pemeriksaan, atau penyimpanan barang, dan perpindahan dana ditangani di luar aplikasi.
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
        {/* Nama dari KYC bila sudah diperiksa petugas; kalau belum, medan
            isiannya tetap tampil (lihat LoanForm: satu pola untuk semua produk). */}
        {identitasKyc.namaLengkap !== "" ? (
          <MedanDariKyc
            id="nama-gadai"
            label="Nama lengkap"
            nilai={identitasKyc.namaLengkap}
            petunjuk="Nama ini yang tercatat pada pengajuan gadai."
          />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="nama-gadai">Nama lengkap</Label>
            <Input id="nama-gadai" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} placeholder="Tulis nama lengkap" autoComplete="name" required aria-required="true" minLength={3} aria-invalid={error !== null && namaLengkap.trim().length < 3} aria-describedby={error !== null && namaLengkap.trim().length < 3 ? "pawn-form-error" : undefined} disabled={submitting} />
          </div>
        )}
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
      {perluDicegahPawn && !submitting && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Pengajuan gadai ini belum dikirim dan isiannya belum tersimpan. Menutup halaman akan
          menghilangkannya.
        </p>
      )}

      {kycQuery !== undefined && !kycSiap && <PeringatanKyc onBukaKyc={onBukaKyc} />}

      <Button type="submit" className="w-full" disabled={submitting || !kycSiap}>
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
        Perkiraan harga dan kondisi barang serta nomor tempat penyimpanan dicatat di aplikasi. Pemeriksaan dan penyimpanan barang ditangani tim PINDAI di luar aplikasi. Status di aplikasi belum menandai barang sudah dikembalikan. Perpindahan dana ditangani di luar aplikasi.
      </p>
    </form>
  );
}
