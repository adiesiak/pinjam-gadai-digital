import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileCheck,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EContractWidget } from "@/components/EContract";
import { KonfirmasiAksi } from "@/components/admin/KonfirmasiAksi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { rincianPinjamanNyata } from "@/lib/rincianAliranDana";
import type { StatusKyc } from "@/lib/kycStatus";
import { STATUS_TERKUNCI, diTahapTinjauan, nominalTerkunci } from "@/lib/statusPinjaman";

import { namaHurufBesar } from "@/lib/nama";

import { formatDate } from "./admin-format";
import { type LoanRow } from "./admin-shared";
import { AliranDanaPinjaman } from "./AliranDanaPinjaman";
import { DialogCatatPelunasan } from "./CatatPelunasanDialog";
import { KirimRincianPinjaman } from "./KirimRincianPinjaman";
import { LoanKycPanel } from "./LoanKycPanel";
import { PanelDataDiriNasabah } from "./PanelDataDiriNasabah";
import { PenampilDokumen } from "./PenampilDokumen";
import {
  KotakAksiAdmin,
  KotakMetrikPengajuan,
  KotakProfilNasabah,
} from "./RingkasanEksekutifPengajuan";

// Sentinel NON-kosong: Radix Select menolak `<SelectItem value="">`, jadi
// "tidak diubah" dan "lepas pendana" memakai penandanya sendiri.
const PENDANA_TETAP = "__tetap";
const PENDANA_LEPAS = "__lepas";

/**
 * Micro-interaction tombol aksi modal: sedikit lebih terang + bayangan naik saat
 * disorot, mengecil saat ditekan. Temponya memakai token gerak aplikasi
 * (`--motion-normal` = 200 ms) supaya terasa sama dengan tombol lain di PINDAI.
 */
const MICRO_TOMBOL =
  "transition-all duration-[var(--motion-normal)] hover:shadow-md hover:brightness-105 active:scale-95";

type LoanRowWithOptionalProps = LoanRow & {
  readonly persenBunga?: number | null;
  readonly promoBungaPersenNormal?: number | null;
  readonly promoBungaNama?: string | null;
  readonly promoDiskonAdmin?: number | null;
};

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
  // Penetapan pendana + koreksi nominal memakai jalur yang sama dengan ruang
  // pendana, sehingga nama pendana langsung tampil di sana.
  const simpanPendana = useMutation(api.penyediaDana.ubahDataPinjaman);

  // Konfirmasi khusus: pinjaman yang sudah berpindah dana (punya alokasi/jurnal)
  // hanya boleh dihapus bila admin menyatakannya sadar. Default mati.
  const [hapusMenyeluruh, setHapusMenyeluruh] = useState(false);
  const [pendana, setPendana] = useState<string>(PENDANA_TETAP);
  const [nominalPendana, setNominalPendana] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Accordion Danger Zone di dasar modal (bukan destroy sampai dikonfirmasi). */
  const [bukaDanger, setBukaDanger] = useState(false);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  // Galat penghapusan dipisah dari `error` supaya pesannya tampil TEPAT di
  // samping tombol Hapus dan centang "Hapus menyeluruh" — bukan jauh di bagian
  // atas dialog tempat admin tidak melihatnya setelah menggulir ke bawah.
  const [errorHapus, setErrorHapus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"detail" | "aliran" | "perjanjian">("detail");
  /** Modal lampiran foto KTP/selfie — dibuka dari Kotak Profil Nasabah. */
  const [lampiranTerbuka, setLampiranTerbuka] = useState(false);
  /** Rincian lengkap (data diri, KYC, koordinat, kontrak) disembunyikan dulu. */
  const [bukaRincian, setBukaRincian] = useState(false);
  // Dialog pelunasan manual: isinya pindah ke komponen bersama
  // `DialogCatatPelunasan`, dipakai juga oleh Ruang Pendana.
  const [pelunasanTerbuka, setPelunasanTerbuka] = useState(false);

  // Pratinjau pesan WhatsApp yang akan dikirim — admin melihat persis isinya
  // sebelum menekan tombol, termasuk kalimat persetujuan sebagian.
  const pratinjau = useQuery(
    api.whatsapp.previewStatusPinjaman,
    row === null ? ("skip" as const) : { loanId: row._id, alasan: "" },
  );
  // Kandidat pendana = semua akun yang pernah menjadi pendana. Hanya
  // admin (sesi TOTP) yang boleh membacanya, sama seperti server.
  const kandidatQ = useQuery(
    api.penyediaDana.kandidatPendana,
    row === null ? ("skip" as const) : {},
  );
  // Profil & risiko NASABAH (bukan salinan di baris pinjaman): status KYC dan
  // skor integritas dibaca dari master, supaya kotak ringkas tidak pernah
  // menampilkan penilaian yang sudah kedaluwarsa. Query-nya sama dengan yang
  // dipakai panel "Lihat Profil Nasabah", jadi tidak ada perhitungan kedua.
  const profilQ = useQuery(
    api.nasabah.detailNasabah,
    row === null ? ("skip" as const) : { userId: row.userIdPeminjam },
  );
  // URL lampiran KYC (KTP/selfie/slip) hanya dibaca peninjau admin; dipakai
  // tombol kecil di kotak profil agar gambar dokumen tidak memenuhi layar.
  const dokumenQ = useQuery(
    api.admin.dokumenKycUrls,
    row === null ? ("skip" as const) : { loanId: row._id },
  );
  // Sasaran status & nominal menyesuaikan saat dialog dibuka untuk baris lain.
  //
  // Disesuaikan SAAT RENDER lewat `_id`, bukan lewat effect + identitas objek:
  // query reaktif Convex bisa mengirim objek baru untuk baris yang sama, dan
  // effect yang mengikuti identitas objek akan menghapus ketikan admin di
  // tengah proses review. Penyetelan saat render adalah pola React untuk
  // "menyesuaikan state ketika prop berubah" — tidak memicu render berantai.
  const idBaris: string | null = row?._id ?? null;
  const [idTerakhir, setIdTerakhir] = useState<string | null>(idBaris);
  if (idBaris !== idTerakhir) {
    setIdTerakhir(idBaris);
    setPendana(PENDANA_TETAP);
    setNominalPendana("");
    setHapusMenyeluruh(false);
    setError(null);
    setErrorHapus(null);
    setLampiranTerbuka(false);
    setBukaRincian(false);
    setBukaDanger(false);
    setKonfirmasiHapus(false);
    setPelunasanTerbuka(false);
  }

  if (row === null) return null;
  // Nominal pengajuan asli — sama dengan pokokPinjaman kecuali admin menyetujui
  // sebagian. Dibaca toleran supaya baris lama tanpa field ini tetap aman.
  const pokokDiajukan =
    (row as { pokokDiajukan?: number }).pokokDiajukan ?? row.pokokPinjaman;
  const rowWithOptional = row as LoanRowWithOptionalProps;

  // ===== Ringkasan eksekutif (tiga kotak) =====
  // Angka metrik diambil dari mesin uang yang SAMA dengan ledger
  // (`rincianPinjamanNyata` → `quoteLoan`/`bagiHasilPinjaman`), bukan rumus yang
  // ditulis ulang di JSX kotak.
  const rincian = rincianPinjamanNyata({
    pokokPinjaman: row.pokokPinjaman,
    tenorBulan: row.tenorBulan,
    persenBunga: rowWithOptional.persenBunga ?? null,
    cairEkspres: row.cairEkspres,
    tarifBiaya: row.tarifBiaya,
    promoBungaPersenNormal: rowWithOptional.promoBungaPersenNormal ?? null,
    promoBungaNama: rowWithOptional.promoBungaNama ?? null,
    promoDiskonAdmin: rowWithOptional.promoDiskonAdmin ?? null,
  });
  const tenorTeks =
    row.tenorBulan !== null ? `${row.tenorBulan} bulan` : `${row.tenorHari ?? 30} hari`;
  const lampiranSiap =
    dokumenQ !== undefined &&
    dokumenQ !== null &&
    Boolean(dokumenQ.ktpUrl || dokumenQ.selfieUrl || dokumenQ.slipUrl);
  const jumlahLampiran =
    dokumenQ === undefined || dokumenQ === null
      ? 0
      : [dokumenQ.ktpUrl, dokumenQ.selfieUrl, dokumenQ.slipUrl].filter((u) => u !== null)
          .length;

  // Tombol kotak aksi memakai aturan transisi yang sama dengan server
  // (`lib/statusPinjaman`): "Setujui" = pindah ke Disalurkan (`didanai`),
  // "Tolak" = `ditolak`; posisi yang sudah ditutup tidak ditawari tindakan.
  const bolehSetujui = row.status !== "didanai" && !STATUS_TERKUNCI.includes(row.status);
  const bolehTolak = !STATUS_TERKUNCI.includes(row.status) && row.status !== "ditolak";
  const bolehKirimWa =
    row.status !== "lunas" && (pratinjau?.nomorWhatsApp ?? null) !== null;
  const terkunciTeks =
    row.status === "lunas"
      ? "Pinjaman sudah lunas — posisinya ditutup."
      : row.status === "dibatalkan"
        ? "Pengajuan sudah dibatalkan; nasabah membuat pengajuan baru bila masih dibutuhkan."
        : row.status === "ditolak"
          ? "Pengajuan ini sudah ditolak."
          : row.status === "didanai"
            ? "Pengajuan sudah disetujui dan dananya ditandai tersalurkan."
            : undefined;
  const waTerkunciTeks =
    pratinjau == null
      ? "Pratinjau pesan WhatsApp sedang dimuat."
      : pratinjau.nomorWhatsApp === null
        ? "Nomor WhatsApp nasabah belum ada di data KYC."
        : undefined;

  const runDelete = async () => {
    setBusy("delete");
    setErrorHapus(null);
    try {
      await deleteLoan({
        loanId: row._id,
        ...(hapusMenyeluruh ? { bersihkanDana: true } : {}),
      });
      toast.success(
        hapusMenyeluruh
          ? "Pinjaman dan baris turunannya dihapus; jurnal ledger dipertahankan. Tercatat di Audit Trail."
          : "Data pinjaman dihapus dan tercatat di Audit Trail.",
      );
      setKonfirmasiHapus(false);
      onClose();
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal menghapus data pinjaman.";
      setErrorHapus(pesan);
      toast.error(pesan);
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
      const pesan = err instanceof Error ? err.message : "Gagal menyimpan keputusan.";
      setError(pesan);
      // Persetujuan berhenti karena belum ada pendana. Bawa admin ke kartu
      // pendana di tab Aliran, tempat aksi satu-klik "Setujui & salurkan" ada
      // — bukan membiarkannya menebak tab mana yang harus dibuka.
      if (pesan.includes("belum punya penyedia dana")) setActiveTab("aliran");
    } finally {
      setBusy(null);
    }
  };

  const runPendana = async () => {
    const pokokBaru = nominalPendana.trim() === "" ? null : Number(nominalPendana);
    if (pokokBaru !== null && (!Number.isSafeInteger(pokokBaru) || pokokBaru <= 0)) {
      setError("Nominal yang disetujui harus rupiah bulat positif.");
      return;
    }
    setBusy("pendana");
    setError(null);
    try {
      // Jalur ini HANYA mencatat pendana/pendana dilepas tanpa mencairkan dana.
      // Pencairan satu-klik ada di `pilihDanSalurkan`.
      const hasil = await simpanPendana({
        loanId: row._id,
        ...(pendana === PENDANA_TETAP
          ? {}
          : pendana === PENDANA_LEPAS
            ? { pendanaEmail: null }
            : { pendanaUserId: pendana as Id<"users"> }),
        ...(pokokBaru !== null && pokokBaru !== row.pokokPinjaman
          ? { pokokDisetujui: pokokBaru }
          : {}),
      });
      toast.success(
        hasil.perubahan.length === 0
          ? "Tidak ada perubahan pendana atau nominal."
          : `Tersimpan: ${hasil.perubahan.join(", ")}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pendana.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Satu klik: pendana + nominal yang sedang diketik disimpan, lalu dana
   * ditandai tersalurkan — tanpa berpindah tab untuk menekan tombol kedua.
   *
   * Pinjaman yang masih `diajukan`/`sedang_direview` disetujui lebih dulu lewat
   * jalur kanonik `danaiPinjaman`, jalur yang sama dengan tombol "Setujui
   * Pengajuan". Pinjaman `disetujui` memakai `cairkanSekarang` di server.
   */
  const pilihDanSalurkan = async (pendanaUserId: Id<"users"> | null) => {
    const pokokBaru = nominalPendana.trim() === "" ? null : Number(nominalPendana);
    if (pokokBaru !== null && (!Number.isSafeInteger(pokokBaru) || pokokBaru <= 0)) {
      setError("Nominal yang disetujui harus rupiah bulat positif.");
      return;
    }
    const sudahDisetujui = row.status === "disetujui";
    setBusy(pendanaUserId === null ? "pendana-sekarang" : `pendana-${pendanaUserId}`);
    setError(null);
    try {
      const hasil = await simpanPendana({
        loanId: row._id,
        ...(pendanaUserId === null ? {} : { pendanaUserId }),
        ...(pokokBaru !== null && pokokBaru !== row.pokokPinjaman
          ? { pokokDisetujui: pokokBaru }
          : {}),
        ...(sudahDisetujui ? { cairkanSekarang: true } : {}),
      });
      if (!sudahDisetujui) {
        // Tahap sebelum persetujuan: setujui + salurkan lewat jalur yang sama
        // dengan tombol "Setujui Pengajuan", supaya perjanjian, jadwal angsuran,
        // notifikasi WhatsApp, dan rincian resmi tetap tercatat.
        await fund({ loanId: row._id });
        toast.success(
          "Pengajuan disetujui, pendana tercatat, dan dana ditandai tersalurkan. Rincian pinjaman dikirim otomatis ke peminjam.",
        );
      } else if (hasil.dicairkan) {
        toast.success(
          "Pendana tercatat dan dana ditandai tersalurkan. Rincian pinjaman dikirim otomatis ke peminjam.",
        );
      } else if (hasil.perubahan.length === 0) {
        toast.success("Pendana tidak berubah; dana belum ditandai tersalurkan.");
      } else {
        toast.success(
          `Tersimpan: ${hasil.perubahan.join(", ")}. Dana belum ditandai tersalurkan.`,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyalurkan dana.");
    } finally {
      setBusy(null);
    }
  };

  // Pendana yang belum memegang pinjaman ini — ditampilkan sebagai daftar
  // satu-klik pada tahap siap cair. Pendana sekarang tidak diulang di sini.
  const kandidatLain = (kandidatQ?.rows ?? []).filter((r) => r.userId !== row.pendanaId);
  /** Tahap sebelum dana turun: pendana boleh ditetapkan dan langsung dicairkan. */
  const bisaSalurkan = diTahapTinjauan(row.status) && !nominalTerkunci(row.status);
  /** Belum ada pendana sama sekali — aksi cair akan berhenti tanpa hasil. */
  const perluPendana =
    diTahapTinjauan(row.status) && row.pendanaId == null && row.pendanaNama == null;

  /**
   * Tanpa pendana, tombol "setujui/salurkan" di tab Detail hanya akan gagal.
   * Antar admin ke kartu pendana, tempat satu klik sudah mencakup keduanya.
   */
  const arahkanPilihPendana = () => {
    setActiveTab("aliran");
    toast.info(
      "Pilih pendana di kartu Pendana & pencairan — satu klik langsung menyetujui dan menyalurkan dana.",
    );
  };

  const lokasi = row.lokasiAjukan;
  const petaHref = lokasi != null
    ? `https://www.openstreetmap.org/?mlat=${lokasi.lat}&mlon=${lokasi.lng}#map=16/${lokasi.lat}/${lokasi.lng}`
    : null;

  // ── Header (fixed) ──────────────────────────────────────────────────────
  // Label status memakai istilah yang dibaca admin, dipetakan dari empat status
  // kanonik: belum diputuskan → "Ditinjau", dana sudah turun → "Disalurkan",
  // ditolak → "Ditolak", selesai → "Lunas" (dipakai bersama ruang pendana).
  const statusLabel =
    row.status === "lunas"
      ? "Lunas"
      : row.status === "didanai"
        ? "Disalurkan"
        : row.status === "ditolak"
          ? "Ditolak"
          : "Ditinjau";
  const statusKelas =
    row.status === "lunas" || row.status === "didanai"
      ? "border-success-border bg-success-soft text-success-foreground"
      : row.status === "ditolak"
        ? "border-rose-200/80 bg-rose-100 text-rose-800"
        : "border-amber-200/80 bg-amber-100 text-amber-800";

  // Header kaca: menempel di puncak modal (area tab di bawahnya yang menggulir),
  // jadi identitas pengajuan + lencana status selalu terlihat saat admin membaca
  // dokumen. `pr-14` menyisakan ruang untuk tombol tutup X.
  const header = (
    <div className="sticky top-0 z-20 flex items-center gap-4 border-b border-slate-200/60 bg-white px-5 py-5 pr-14">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold tracking-tight text-primary-foreground">
        {String(row.pokokPinjaman).slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        {/* Tanpa `truncate`: nominal dan nama pemohon dibaca utuh, termasuk pada
            nama panjang — admin memverifikasi identitas dari baris ini. */}
        <SheetTitle className="break-words text-base font-semibold text-slate-900 tabular-nums">
          {formatRupiah(row.pokokPinjaman)} · {namaHurufBesar(row.namaLengkap)}
        </SheetTitle>
        <SheetDescription className="mt-0.5 break-words text-xs text-muted-foreground tabular-nums">
          {row.nomorReferensi} · diajukan {formatDate(row._creationTime)}
        </SheetDescription>
      </div>
      <span
        className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${statusKelas}`}
        aria-label={`Status pinjaman: ${statusLabel}`}
      >
        {statusLabel}
      </span>
    </div>
  );

  // ── Ringkasan eksekutif: tiga kotak yang menentukan keputusan ──────────
  // Urutannya METRIK → PROFIL → AKSI: mata membaca nominal & tagihan dulu,
  // lalu memastikan siapa nasabahnya, baru memutuskan. Rincian panjang (data
  // diri, KYC, koordinat, kontrak, aliran dana) tetap tersedia di bawah, tetapi
  // TERTUTUP — supaya layar pertama bukan dinding data.
  const kotakRingkas = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KotakMetrikPengajuan
        pokok={row.pokokPinjaman}
        tenorTeks={tenorTeks}
        potonganDiMuka={rincian.potonganDiMuka}
        bunga={rincian.imbalHasil}
        totalPelunasan={rincian.totalKembali}
        namaBank={row.namaBank}
        nomorRekening={row.nomorRekening}
      />
      <KotakProfilNasabah
        nama={namaHurufBesar(row.namaLengkap)}
        nomorWhatsApp={row.nomorWhatsApp ?? profilQ?.profil?.nomorWhatsApp ?? null}
        statusKyc={
          profilQ === undefined
            ? undefined
            : ((profilQ?.kyc?.status ?? null) as StatusKyc | null)
        }
        skor={profilQ?.profilRisiko.skor ?? null}
        skorDinilai={profilQ?.profilRisiko.dinilai ?? true}
        grade={profilQ?.profilRisiko.grade ?? null}
        gradeSistem={profilQ?.risiko.gradeSistem}
        gradeDitimpa={profilQ?.risiko.ditimpa ?? false}
        lampiranSiap={lampiranSiap}
        jumlahLampiran={jumlahLampiran}
        onLihatLampiran={() => setLampiranTerbuka(true)}
      />
      <KotakAksiAdmin
        busy={busy}
        labelSetujui={
          row.status === "disetujui" ? "Tandai dana tersalurkan" : "Setujui Pengajuan"
        }
        bolehSetujui={bolehSetujui}
        bolehTolak={bolehTolak}
        bolehKirimWa={bolehKirimWa}
        sudahLunas={row.status === "lunas"}
        setujuTerkunci={bolehSetujui ? undefined : terkunciTeks}
        waTerkunci={bolehKirimWa ? undefined : waTerkunciTeks}
        onSetujui={() => {
          if (perluPendana) {
            arahkanPilihPendana();
            return;
          }
          void (row.status === "disetujui"
            ? run("setuju", () => fund({ loanId: row._id }))
            : run("setuju", () => ubahStatus({ loanId: row._id, status: "didanai" })));
        }}
        onTolak={() => void run("tolak", () => ubahStatus({ loanId: row._id, status: "ditolak" }))}
        onKirimWa={() =>
          void run("wa", () =>
            kirimStatus({ loanId: row._id, alasan: "", statusLama: row.status }),
          )
        }
      />
    </div>
  );

  // ── Tab 1: Detail & Dokumen ────────────────────────────────────────────
  const tabDetail = (
    <div className="space-y-4">
      {kotakRingkas}

      {/* Galat perubahan status tampil di sini, bukan di balik toast: dialog
          tetap terbuka setelah gagal, jadi admin perlu membaca sebabnya. */}
      {error !== null && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
        >
          {error}
        </p>
      )}

      {/* Dokumen rincian untuk peminjam. Terpisah dari tombol keputusan karena
          kiriman ini tidak mengubah status apa pun, dan dibuka untuk seluruh
          pinjaman yang barisnya bisa dibuka admin. */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3">
        <p className="text-sm font-semibold text-slate-800">Dokumen rincian pinjaman</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          Kirim rincian resmi sebagai PDF ke peminjam, atau simpan untuk diserahkan sendiri.
          Setelah dana tersalurkan, rincian dikirim otomatis lewat WhatsApp (email sebagai
          cadangan).
        </p>
        <div className="mt-2">
          <KirimRincianPinjaman loanId={row._id} />
        </div>
      </section>

      {/* Rincian pendukung: bukan dihapus, hanya ditutup sampai diminta. */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3">
        <button
          type="button"
          onClick={() => setBukaRincian((x) => !x)}
          aria-expanded={bukaRincian}
          className="flex w-full items-start justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors duration-[var(--motion-fast)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              Rincian lengkap &amp; lampiran pengajuan
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
              Data diri tersimpan, KYC &amp; foto dokumen, koordinat perangkat, kontrak digital,
              dan rincian aliran dana.
            </span>
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-slate-500 transition-transform duration-[var(--motion-normal)] ${bukaRincian ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {bukaRincian && (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
      {/* Kolom kiri: data diri + KYC */}
      <div className="space-y-4">
        <PanelDataDiriNasabah userId={row.userIdPeminjam} />
        <LoanKycPanel row={row} />
      </div>

      {/* Kolom kanan: koordinat dulu, lalu ringkasan, lalu kontrak — disusun
          vertikal rapat (`flex flex-col gap-3`) supaya mata turun satu jalur. */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* Koordinat perangkat */}
        {lokasi !== null && petaHref ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <MapPin className="size-4 text-primary" />
              Koordinat perangkat
            </p>
            <p className="mt-2 text-sm tabular-nums text-slate-700">
              {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
            </p>
            <a
              href={petaHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <MapPin className="size-3.5" />
              Buka di peta
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <MapPin className="size-4 text-muted-foreground" />
              Koordinat perangkat
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Tidak ada (pengajuan sebelum fitur lokasi).
            </p>
          </div>
        )}

        <Separator />

        {/* Ringkasan detail peminjam */}
        <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Ringkasan pemohon
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Pemohon", namaHurufBesar(row.namaLengkap)],
              ["Email", row.emailPeminjam ?? "—"],
              ["Bank / e-wallet", row.namaBank ?? "Tidak dicatat (data lama)"],
              ["Rekening / akun", row.nomorRekening ?? "—"],
              ["Keperluan", loanPurposeLabel(row.tujuan)],
              [
                "Skema",
                row.tenorBulan !== null
                  ? `Bulanan — ${row.tenorBulan} bulan`
                  : `Harian — ${row.tenorHari ?? 30} hari`,
              ],
              ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid gap-0.5 sm:grid-cols-[minmax(0,140px)_1fr] sm:items-start sm:gap-3"
              >
                <dt className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm">
                  {label}
                </dt>
                {/* Tanpa `truncate`: email, nama, bank, dan nomor rekening harus
                    terbaca utuh — nilainya disalin admin untuk verifikasi. */}
                <dd className="min-w-0 break-words text-sm leading-5 text-slate-800">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <EContractWidget kind="loan" loanId={row._id} />
      </div>
          </div>
        )}
      </section>
    </div>
  );

  // ── Tab 2: Aliran Uang & Pendana ───────────────────────────────────────
  const tabAliran = (
    // Dua kolom hanya di layar sangat lebar: matriks aliran punya empat kolom
    // sendiri, jadi membelah panel lebih awal membuat angkanya pecah per digit.
    <div className="grid gap-4 2xl:grid-cols-2 2xl:gap-5">
      {/* Kolom kiri: matriks aliran uang — rapat, tanpa gulir horizontal */}
      <div className="flex min-w-0 flex-col gap-3">
        <AliranDanaPinjaman
          pokokPinjaman={row.pokokPinjaman}
          tenorBulan={row.tenorBulan}
          tenorHari={row.tenorHari}
          persenBunga={rowWithOptional.persenBunga}
          cairEkspres={row.cairEkspres}
          tarifBiaya={row.tarifBiaya}
          promoBungaPersenNormal={rowWithOptional.promoBungaPersenNormal ?? null}
          promoBungaNama={rowWithOptional.promoBungaNama ?? null}
          promoDiskonAdmin={rowWithOptional.promoDiskonAdmin ?? null}
          sudahLunas={row.status === "lunas"}
        />

        {/* Jadwal bayar (skema bulanan) atau ringkasan harian */}
        {row.tenorBulan !== null && row.tenorBulan === 3 && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Rincian bulanan (3 bulan)
            </p>
            <div className="mt-3 grid grid-cols-[1fr_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Cicilan per bulan</span>
              <span className="text-right font-semibold tabular-nums text-slate-800">
                {formatRupiah(row.cicilanPerBulan ?? 0)}
              </span>
              <span className="text-muted-foreground">Biaya admin (2%/cicilan)</span>
              <span className="text-right tabular-nums text-slate-800">
                {formatRupiah(row.biayaLayananTotal ?? 0)}
              </span>
            </div>
          </div>
        )}

        {/* Status jatuh tempo */}
        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`text-[11px] font-medium uppercase tracking-[0.16em] ${
                (row.hariTerlambat ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {(row.hariTerlambat ?? 0) > 0
                ? `Tanggal acuan terlewati ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Tanggal acuan hari ini"
                  : `Tanggal acuan dalam ${row.sisaHari} hari`}
            </p>
            <p className="mt-1 text-xs tabular-nums text-slate-700">
              Akumulasi terkaya (lunas) {formatRupiah(row.totalKewajibanDenganPenalti ?? row.totalKewajiban ?? 0)}
              {(row.dendaTerlambat ?? 0) > 0 && (
                <span className="tabular-nums text-destructive">
                  {" "}
                  · denda {formatRupiah(row.dendaTerlambat ?? 0)}
                </span>
              )}
            </p>
          </div>
        )}

        {row.status === "lunas" && (
          <div className="rounded-2xl border border-success-border bg-success-soft px-4 py-3 text-sm text-success-foreground">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4" /> Pinjaman ini sudah <strong>lunas</strong>
            </p>
            <p className="mt-1 text-xs text-success-foreground">
              Status ditutup; perubahan tidak dapat diubah lagi.
            </p>
          </div>
        )}
      </div>

      {/* Kolom kanan: pendana & alokasi disandingkan dengan matriks di desktop
          (dua kolom `md:grid-cols-2`), jadi admin bisa membandingkan angka
          aliran dengan penentuan pendananya tanpa menggulir bolak-balik. */}
      <div className="min-w-0 space-y-3">
        {row.status !== "lunas" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Pendana &amp; pencairan
              </p>
              {row.status === "disetujui" && (
                <span className="rounded-full border border-success-border bg-success-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-foreground">
                  Siap disalurkan
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {row.status === "disetujui"
                ? "Klik satu nama: pendana tercatat, perjanjian mengikuti persetujuan pengajuan, dan dana langsung ditandai tersalurkan."
                : row.status === "didanai"
                  ? "Dana sudah tersalurkan. Mengganti pendana di sini hanya mengoreksi catatan kepemilikan, bukan memindahkan uang."
                  : "Klik satu nama untuk menyetujui sekaligus menyalurkan dana. Bila dana belum siap, catat pendananya saja di bagian bawah."}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-700">
              <Users className="size-3.5 text-primary" />
              Pendana sekarang:{" "}
              <span className="font-medium">{row.pendanaNama ?? "belum ada"}</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Bila pendana sudah menempatkan dana lewat dompet aplikasi, pinjaman
              dicatat sebagai pendanaan dompet. Bila dananya masuk di luar
              aplikasi, pinjaman ditandai{" "}
              <span className="font-medium text-slate-700">
                dana di luar aplikasi
              </span>{" "}
              dan keuntungan pendana dibayar lewat antrean transfer, bukan dari
              dompetnya.
            </p>

            {diTahapTinjauan(row.status) && !nominalTerkunci(row.status) && (
              <div className="mt-3">
                <Label htmlFor="nominal-disetujui" className="text-[11px] text-muted-foreground">
                  Nominal disetujui (Rp)
                </Label>
                <Input
                  id="nominal-disetujui"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={50_000}
                  placeholder={`Tercatat: ${formatRupiah(row.pokokPinjaman)}`}
                  value={nominalPendana}
                  onChange={(e) => setNominalPendana(e.target.value)}
                  disabled={busy !== null}
                />
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Maksimal {formatRupiah(pokokDiajukan)}. Kosongkan bila tidak diubah.
                </p>
              </div>
            )}

            {/* Galat aksi pendana tampil di kartu ini juga — aksi satu-klik
                berada di tab Aliran, jauh dari kotak galat di tab Detail. */}
            {error !== null && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
              >
                {error}
              </p>
            )}

            {bisaSalurkan && (
              <div className="mt-3 space-y-2">
                {row.pendanaNama != null && row.pendanaNama !== "" && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success-border bg-success-soft px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-success-foreground">
                        {row.pendanaNama}
                      </p>
                      <p className="text-[11px] text-success-foreground/80">
                        {row.status === "disetujui"
                          ? "Pendana sekarang · siap dicairkan"
                          : "Pendana sekarang"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void pilihDanSalurkan(null)}
                      className="h-9 gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      {busy === "pendana-sekarang" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="size-3.5" />
                      )}
                      {row.status === "disetujui" ? "Salurkan dana" : "Setujui & salurkan"}
                    </Button>
                  </div>
                )}

                {kandidatQ === undefined ? (
                  <p className="text-[11px] text-muted-foreground">Memuat daftar pendana…</p>
                ) : kandidatLain.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                    {row.pendanaNama == null
                      ? "Belum ada akun yang pernah menjadi pendana. Beri akses di ruang pendana lebih dulu."
                      : "Tidak ada pendana lain yang bisa dipilih."}
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      {row.pendanaNama == null
                        ? "Pilih pendana:"
                        : row.status === "disetujui"
                          ? "Ganti pendana sekaligus salurkan:"
                          : "Setujui sekaligus salurkan:"}
                    </p>
                    <ul className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                      {kandidatLain.map((r) => (
                        <li key={r.userId}>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void pilihDanSalurkan(r.userId)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors duration-[var(--motion-fast)] hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-slate-900">
                                {r.nama}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {r.email ?? "tanpa email"}
                                {r.aksesAktif ? "" : " · pendana lama"}
                              </span>
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success-foreground">
                              {busy === `pendana-${r.userId}` ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ArrowRight className="size-3.5" />
                              )}
                              {row.status === "disetujui" ? "Pilih & salurkan" : "Setujui & salurkan"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Jalur cadangan: mencatat pendana TANPA mencairkan dana — dipakai
                bila dana belum siap, atau untuk melepas pendana yang salah. */}
            <div
              className={bisaSalurkan ? "mt-3 border-t border-slate-100 pt-3" : "mt-3"}
            >
              <p className="text-[11px] font-medium text-slate-600">
                {bisaSalurkan ? "Hanya catat pendana (tanpa mencairkan dana)" : "Koreksi pendana"}
              </p>
              <div className="mt-2">
                <Label htmlFor="pendana-pinjaman" className="text-[11px] text-muted-foreground">
                  Pendana
                </Label>
                <Select value={pendana} onValueChange={setPendana}>
                  <SelectTrigger id="pendana-pinjaman">
                    <SelectValue placeholder="Tidak diubah" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PENDANA_TETAP}>Tidak diubah</SelectItem>
                    {(kandidatQ?.rows ?? []).map((r) => (
                      <SelectItem key={r.userId} value={r.userId}>
                        {r.nama}
                        {r.email ? ` — ${r.email}` : ""}
                        {r.aksesAktif ? "" : " (pendana lama)"}
                      </SelectItem>
                    ))}
                    <SelectItem value={PENDANA_LEPAS} disabled={nominalTerkunci(row.status)}>
                      Lepas pendana (tanpa pemilik dana)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {kandidatQ === undefined
                    ? "Memuat daftar pendana…"
                    : kandidatQ.rows.length === 0
                      ? "Belum ada akun yang pernah menjadi pendana. Beri akses di ruang pendana lebih dulu."
                      : "Daftar ini memuat semua akun yang pernah menjadi pendana, termasuk pendana lama."}
                </p>
              </div>
              <Button
                disabled={busy !== null}
                onClick={() => void runPendana()}
                className="mt-3 transition-all duration-[var(--motion-normal)] hover:brightness-105 hover:shadow-md active:scale-95"
              >
                {busy === "pendana" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Simpan pendana
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );

  // Persetujuan manual tidak memakai gambar KYC lama sebagai tanda tangan akad.
  const ttdElektronik =
    row.persetujuanMode !== "manual" && row.tandaTanganAda === true;

  // ── Tab 3: Perjanjian & WhatsApp ───────────────────────────────────────
  const tabPerjanjian = (
    <div className="space-y-3">
      {/* Status dokumen perjanjian + ttd */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Status perjanjian
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-white p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Dokumen perjanjian</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Kontrak digital tersedia di ruang persetujuan. Admin dapat membuka widget kontrak
              dari panel ini untuk melihat isi dokumen yang disepakati.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Tanda tangan peminjam",
              value:
                row.ttdManualAda === true
                  ? "TTD manual"
                  : ttdElektronik
                    ? "Elektronik"
                    : "Belum ada",
              detail:
                row.ttdManualAda === true && row.ttdManualPada != null
                  ? `Bukti diterima ${formatDate(row.ttdManualPada)}${row.ttdManualOleh ? ` oleh ${row.ttdManualOleh}` : ""}`
                  : ttdElektronik && row.tandaTanganPada != null
                    ? `Dicatat ${formatDate(row.tandaTanganPada)}`
                    : "Belum ada gambar tanda tangan tersimpan",
              icon: FileCheck,
            },
            {
              label: "Persetujuan pengajuan",
              value: row.persetujuanPengajuanPada != null ? "Tercatat" : "Belum",
              detail:
                row.persetujuanPengajuanPada != null
                  ? `Syarat ${row.persetujuanPengajuanVersi ?? "lama"} · ${formatDate(row.persetujuanPengajuanPada)}`
                  : "Checkbox syarat belum dicentang saat mengajukan",
              icon: ShieldCheck,
            },
            {
              label: "Persetujuan perjanjian",
              value:
                row.persetujuanSyaratPada == null
                  ? "Belum"
                  : row.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION
                    ? "Tersetujui"
                    : "Versi lama",
              detail:
                row.persetujuanSyaratPada == null
                  ? "Perjanjian belum disetujui peminjam"
                  : row.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION
                    ? row.ttdManualAda === true
                      ? `Syarat ${row.persetujuanSyaratVersi} · ${formatDate(row.persetujuanSyaratPada)} · TTD manual diterima`
                      : ttdElektronik
                        ? `Syarat ${row.persetujuanSyaratVersi} · ${formatDate(row.persetujuanSyaratPada)}`
                        : `Syarat ${row.persetujuanSyaratVersi} · ${formatDate(row.persetujuanSyaratPada)} · TTD manual belum dicatat`
                    : `Disetujui pada syarat ${row.persetujuanSyaratVersi ?? "lama"} — perlu tanda tangan ulang`,
              icon: ShieldCheck,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200/80 bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <item.icon className="size-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">{item.label}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{item.value}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
        {row.persetujuanSyaratPada == null ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Perjanjian ini belum disetujui peminjam. Pencairan tetap bisa berjalan,
            tetapi checkbox syarat perjanjian baru tercatat saat peminjam membuka menu
            Perjanjian di dashboard — atau lewat widget kontrak di bawah ini.
          </p>
        ) : row.ttdManualAda === true ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
            Bukti TTD manual sudah diterima dan tercatat. Berkas dapat dibuka kembali dari
            widget kontrak di bawah untuk arsip.
          </p>
        ) : !ttdElektronik ? (
          <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
            Persetujuan sudah tercatat tanpa gambar tanda tangan. Buka widget kontrak untuk
            mengunduh PDF, lalu unggah kembali berkas yang sudah ditandatangani basah sebagai
            bukti TTD manual.
          </p>
        ) : null}
      </div>

      {/* Pratinjau WhatsApp */}
      {pratinjau !== undefined && pratinjau !== null && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-success-foreground">
              <MessageCircle className="size-4" />
              Pratinjau pesan WhatsApp
            </p>
            {pratinjau.nomorWhatsApp === null && (
              <span className="text-xs font-medium text-amber-700">nomor belum ada di KYC</span>
            )}
          </div>
          {/* Gelembung bergaya chat: isi pesan apa adanya (font-mono + baris
              dipertahankan) supaya admin melihat persis yang diterima peminjam. */}
          <div className="mt-3 rounded-2xl border border-success-border/80 bg-success-soft p-4 font-mono text-xs leading-5 text-success-foreground">
            <p className="whitespace-pre-line">{pratinjau.isi}</p>
          </div>
        </div>
      )}

      {/* Draft WhatsApp (admin bisa mengedit catatan sebelum dikirim) */}
      {row.status !== "lunas" && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Draft pesan WhatsApp
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pesan yang dikirim otomatis ke peminjam sesuai status pinjaman. Admin dapat
            mengirim ulang jika diperlukan.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy !== null || pratinjau === undefined || pratinjau?.nomorWhatsApp === null}
              variant="outline"
              className="gap-1.5 transition-all duration-[var(--motion-normal)] hover:shadow-md hover:brightness-105 active:scale-95"
              onClick={() =>
                run("wa", () =>
                  kirimStatus({ loanId: row._id, alasan: "", statusLama: row.status }),
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
        </div>
      )}

      {/* Widget kontrak */}
      <EContractWidget kind="loan" loanId={row._id} />
    </div>
  );

  // ── Danger Zone accordion (dasar modal) ────────────────────────────────
  // Aksi hapus dipisah dari footer aksi utama dan disembunyikan di dalam
  // accordion paling bawah supaya tidak pernah tertekan karena salah klik.
  const dangerZone = (
    <div className="rounded-xl border border-rose-200/60 bg-rose-50 p-3 text-rose-700">
      <button
        type="button"
        onClick={() => setBukaDanger((x) => !x)}
        aria-expanded={bukaDanger}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors duration-[var(--motion-fast)] hover:bg-rose-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-rose-600" />
          <span className="text-sm font-semibold text-rose-800">
            Danger Zone · Hapus Pinjaman
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-rose-700 transition-transform duration-[var(--motion-normal)] ${bukaDanger ? "rotate-180" : ""}`}
        />
      </button>

      {bukaDanger && (
        <div className="mt-2 space-y-3 border-t border-rose-200/60 px-1 pt-3">
          <p className="text-xs leading-5 text-rose-700">
            Menghapus pinjaman <strong>{row.nomorReferensi}</strong> tidak dapat dibatalkan.
            Penghapusan tetap tercatat di Audit Trail.
          </p>

          <label className="flex items-start gap-2 text-xs leading-5 text-rose-800">
            <Checkbox
              checked={hapusMenyeluruh}
              onCheckedChange={(v) => setHapusMenyeluruh(v === true)}
              className="mt-0.5 border-rose-300 data-[state=checked]:bg-rose-600 data-[state=checked]:text-white"
              aria-label="Hapus menyeluruh termasuk data turunan"
            />
            <span>
              <span className="font-semibold">Hapus menyeluruh</span> — ikut menghapus
              alokasi dana, catatan transfer, dan bukti bayar. Jurnal ledger tetap utuh
              sebagai riwayat.
            </span>
          </label>

          {errorHapus && (
            <p
              role="alert"
              className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700"
            >
              {errorHapus}
            </p>
          )}

          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => setKonfirmasiHapus(true)}
            className={`w-full sm:w-auto ${MICRO_TOMBOL}`}
          >
            {busy === "delete" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Hapus Pinjaman{hapusMenyeluruh ? " (menyeluruh)" : ""}
          </Button>
        </div>
      )}
    </div>
  );

  // ── Footer aksi (menempel di dasar modal) ──────────────────────────────
  // Footer aksi kaca: menempel di dasar modal, jadi keputusan bisa disimpan
  // tanpa menggulir balik setelah membaca dokumen panjang.
  const footerAksi = (
    <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 bg-white p-4 shadow-lg">
      {row.status === "lunas" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-success-foreground" />
          Pinjaman ini sudah lunas — tidak ada tindakan yang tersedia.
        </div>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Keputusan cepat ada di kotak <strong>Aksi admin</strong> (tab Detail &amp; Dokumen):
            setujui, tolak, atau kirim notifikasi WhatsApp — semuanya tercatat di Audit Trail.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Setelah dana ditandai tersalurkan, langkah berikutnya adalah
                menutup posisi — bukan mengulang keputusan. */}
            {row.status === "didanai" && (
              <Button
                disabled={busy !== null}
                onClick={() => setPelunasanTerbuka(true)}
                className={`rounded-xl bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-900 ${MICRO_TOMBOL}`}
              >
                Catat pelunasan
              </Button>
            )}

            {row.status !== "didanai" && (
              <Button
                disabled={busy !== null}
                onClick={() => {
                  if (perluPendana) {
                    arahkanPilihPendana();
                    return;
                  }
                  void run("fund", () => fund({ loanId: row._id }));
                }}
                className={`rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 ${MICRO_TOMBOL}`}
              >
                {busy === "fund" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tandai dana tersalurkan
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      {/* Panel samping yang lebar di desktop — bukan modal 5xl: tabel antrean di
          belakangnya tetap terlihat, tetapi angka rupiah, nama, dan tombol tidak
          lagi dipaksa muat ke dalam ~640px. Lebar 52vw lama membuat tiga kotak
          ringkas dan matriks aliran dana terpotong per digit. Header & footer
          menempel; hanya area tab yang menggulir. */}
      <SheetContent
        side="right"
        className="w-full gap-0 border-l border-slate-200 bg-white p-0 shadow-2xl sm:w-[92vw] sm:max-w-[1100px] xl:w-[78vw] xl:max-w-[1240px]"
      >
        {/* Header fixed */}
        {header}

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="flex flex-wrap gap-2 border-b border-slate-200/60 bg-white px-5 pt-4">
            <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl border border-white/80 bg-white p-1.5 shadow-xs">
              <TabsTrigger value="detail" className="gap-2 text-sm">
                <FileText className="size-4" />
                Detail &amp; Dokumen
              </TabsTrigger>
              <TabsTrigger value="aliran" className="gap-2 text-sm">
                <Wallet className="size-4" />
                Aliran Uang &amp; Pendana
              </TabsTrigger>
              <TabsTrigger value="perjanjian" className="gap-2 text-sm">
                <FileCheck className="size-4" />
                Perjanjian &amp; WhatsApp
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <TabsContent value="detail" className="mt-0">
              {tabDetail}
            </TabsContent>
            <TabsContent value="aliran" className="mt-0">
              {tabAliran}
            </TabsContent>
            <TabsContent value="perjanjian" className="mt-0">
              {tabPerjanjian}
            </TabsContent>

            {row.status !== "lunas" && dangerZone}
          </div>
        </Tabs>

        {/* Footer menempel */}
        {footerAksi}
      </SheetContent>
    </Sheet>

    {/* Lampiran foto: dibuka dari kotak Profil Nasabah sebagai MODAL, supaya
        gambar dokumen tidak memenuhi layar review (angka & keputusan tetap
        terlihat di belakangnya). Tanda air verifikasi ikut tampil saat foto
        diperbesar — lihat `PenampilDokumen`. */}
    <Dialog open={lampiranTerbuka} onOpenChange={setLampiranTerbuka}>
      <DialogContent className="max-h-[85vh] w-full overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lampiran foto KTP &amp; selfie</DialogTitle>
          <DialogDescription>
            Lampiran pengajuan {row.nomorReferensi} — {namaHurufBesar(row.namaLengkap)}. Foto
            diambil dari baris KYC nasabah (satu tempat), bukan salinan per pengajuan.
          </DialogDescription>
        </DialogHeader>

        {dokumenQ === undefined ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat lampiran…
          </p>
        ) : dokumenQ === null ? (
          <p className="text-sm text-muted-foreground">
            Lampiran tidak ditemukan untuk pengajuan ini. Nasabah dapat mengunggahnya di tab
            Verifikasi KYC.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["KTP", dokumenQ.ktpUrl],
              ["Selfie + KTP", dokumenQ.selfieUrl],
              ["Bukti penghasilan", dokumenQ.slipUrl],
              ["Kartu Keluarga", dokumenQ.kartuKeluargaUrl],
              ["Bukti domisili", dokumenQ.buktiDomisiliUrl],
            ] as const).map(([label, url]) =>
              url ? (
                <PenampilDokumen key={label} src={url} label={label} />
              ) : (
                <span
                  key={label}
                  className="inline-flex items-center justify-center rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  {label} tidak tersedia
                </span>
              ),
            )}
          </div>
        )}
        {dokumenQ !== null && dokumenQ !== undefined && dokumenQ.atmDititipkan && (
          <p className="mt-3 rounded-lg border border-success-border bg-success-soft px-3 py-2 text-xs leading-5 text-success-foreground">
            Kartu ATM dititipkan — nomor tanda terima{" "}
            <strong className="font-mono">{dokumenQ.nomorTandaTerimaAtm ?? "belum dicatat"}</strong>.
            PIN tidak diminta dan tidak disimpan.
          </p>
        )}
      </DialogContent>
    </Dialog>

    <DialogCatatPelunasan
      open={pelunasanTerbuka}
      onClose={() => setPelunasanTerbuka(false)}
      loanId={row._id}
      nama={namaHurufBesar(row.namaLengkap)}
      nomorReferensi={row.nomorReferensi}
    />

    <KonfirmasiAksi
      open={konfirmasiHapus}
      onOpenChange={(terbuka) => {
        if (!terbuka && busy === null) setKonfirmasiHapus(false);
      }}
      judul={`Hapus ${hapusMenyeluruh ? "menyeluruh " : ""}pinjaman ${row.nomorReferensi}?`}
      deskripsi={
        hapusMenyeluruh
          ? "Alokasi dana, catatan transfer, dan bukti bayar ikut dihapus. Jurnal ledger dan Audit Trail tetap tersimpan."
          : "Data dengan transaksi terkait akan ditolak. Centang Hapus menyeluruh bila server menolak karena dana sudah berpindah. Audit Trail tetap tersimpan."
      }
      labelKonfirmasi={hapusMenyeluruh ? "Hapus menyeluruh" : "Hapus pinjaman"}
      busy={busy === "delete"}
      onConfirm={() => void runDelete()}
    />
    </>
  );
}
