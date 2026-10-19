/**
 * Panel Penagihan — meja kerja admin untuk keterlambatan & penagihan PINDAI.
 *
 * Isinya mengikuti modul server `convex/penagihan.ts`: aturan penagihan yang
 * dapat ditinjau, daftar kasus per tahap tunggakan, penugasan petugas, riwayat
 * komunikasi, janji pembayaran, eskalasi, catatan penyelesaian, pembaruan status
 * pembayaran, pengaduan nasabah, dan laporan.
 *
 * Batas yang dijaga panel ini (bukan sekadar salinan keterangan server):
 *  - Kontak & informasi finansial nasabah DITAMPILKAN TERSAMAR dari server.
 *    Angka utuh hanya muncul setelah petugas menekan tombol buka kontak — dan
 *    pembukaan itu tercatat di audit trail oleh server.
 *  - Tindakan yang menghubungi nasabah hanya dapat dicatat di dalam jendela jam
 *    kontak yang diatur; di luar jendela tombolnya dimatikan.
 *  - Kasus yang ditugaskan kepada petugas lain tidak dapat ditindak dari sini.
 *  - Pesan diperiksa lebih dulu dengan penjaga pesan yang sama seperti server,
 *    sehingga ancaman, intimidasi, penyebaran data pribadi, kontak ke pihak
 *    lain, klaim hukum, dan janji menyesatkan tidak pernah terkirim.
 *  - Pembaruan status pembayaran dan catatan penyelesaian diberi label tegas
 *    sebagai CATATAN PETUGAS: tidak ada uang berpindah dan ledger tidak berubah.
 *
 * Tipe baris di bawah mencerminkan bentuk yang dikembalikan `convex/penagihan.ts`
 * (satu pembacaan di perbatasan data), karena modul server adalah sumber
 * kebenarannya.
 */
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Eye,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { SkeletonKartu, SkeletonTabel } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah, parseNominalRupiah } from "@/lib/money";
import {
  LABEL_KATEGORI_PENGADUAN,
  LABEL_SALURAN_TINDAKAN,
  periksaPesanPenagihan,
} from "@/lib/penagihan";

import { formatDate } from "./admin-format";
import { SuratSomasi } from "./SuratSomasi";
import {
  EmptyQueue,
  MetrikKartu,
  PanelMemuat,
  SubTabFilter,
  type OpsiSubTab,
} from "./admin-shared";

/* ==================================================================== */
/* Tipe data di perbatasan server                                       */
/* ==================================================================== */

type OpsiNilai = { nilai: string; label: string };

type Aturan = {
  aktif: boolean;
  ambang: { ringan: number; sedang: number; berat: number };
  ambangDefault: { ringan: number; sedang: number; berat: number };
  jamKontak: { mulai: number; selesai: number };
  jamKontakDefault: { mulai: number; selesai: number };
  diperbaruiPada: number | null;
  diperbaruiOlehLabel: string | null;
  daftar: {
    tahap: { kode: string; label: string; tingkat: number; keterangan: string }[];
    eskalasi: { tingkat: number; label: string; keterangan: string; butuhPersetujuan: boolean }[];
    statusKasus: OpsiNilai[];
    jenisTindakan: OpsiNilai[];
    saluran: string[];
    hasil: OpsiNilai[];
    statusJanji: OpsiNilai[];
    statusPembayaran: OpsiNilai[];
    statusPengaduan: OpsiNilai[];
    kategoriPengaduan: string[];
    prioritasPengaduan: OpsiNilai[];
    jenisPenyelesaian: OpsiNilai[];
    pihakDihubungi: string[];
  };
};

type BarisKasus = {
  loanId: Id<"loans">;
  nomorReferensi: string;
  namaLengkap: string;
  jumlahKewajiban: number;
  jatuhTempoPada: number | null;
  hariTerlambat: number;
  dendaTerlambat: number;
  tahapKode: string;
  tahapLabel: string;
  tahapTingkat: number;
  perluTindakan: boolean;
  eskalasiDisarankan: number;
  tingkatEskalasi: number;
  eskalasiLabel: string | null;
  kasusId: string | null;
  statusKasus: string;
  statusKasusLabel: string;
  petugasLabel: string | null;
  bolehSayaTangani: boolean;
  statusPembayaran: string;
  statusPembayaranLabel: string;
  nominalDibayar: number;
  jumlahTindakan: number;
  tindakanTerakhirPada: number | null;
  janjiAktif: { id: Id<"penagihanJanji">; nominal: number; tanggalJanji: number } | null;
  pengaduanTerbuka: number;
  somasi: {
    nomorSurat: string;
    pada: number;
    diserahkanPada: number | null;
    diserahkanMelalui: string | null;
  } | null;
  kontak: { whatsapp: string | null; rekening: string | null };
  /** Server memutuskan: masih di dalam jendela jam kontak atau tidak. */
  bolehKontakSekarang: boolean;
};

type Riwayat = {
  kasus: {
    status: string;
    tingkatEskalasi: number;
    statusPembayaran: string;
    sebabSelesai?: string;
  } | null;
  tindakan: {
    _id: string;
    jenisLabel: string;
    saluran: string;
    hasilLabel: string;
    pihak: string;
    nomorTujuan: string | null;
    isiPesan: string | null;
    catatan: string | null;
    petugasLabel: string;
    waktu: number;
  }[];
  janji: {
    _id: Id<"penagihanJanji">;
    nominal: number;
    tanggalJanji: number;
    kanal: string;
    status: string;
    catatan?: string;
    dibuatOlehLabel: string;
    dibuatPada: number;
    ditutupPada?: number;
    hasilCatatan?: string;
  }[];
  pembayaran: {
    _id: string;
    status: string;
    nominal: number;
    totalKewajiban: number;
    catatan?: string;
    petugasLabel: string;
    waktu: number;
  }[];
  penyelesaian: {
    _id: string;
    jenis: string;
    nominal: number;
    totalKewajiban: number;
    alasan: string;
    petugasLabel: string;
    waktu: number;
  }[];
  pengaduan: {
    _id: string;
    kategori: string;
    isi: string;
    status: string;
    dibuatPada: number;
    penyelesaian?: string;
  }[];
};

type Pengaduan = {
  _id: Id<"pengaduanNasabah">;
  nomorReferensi: string | null;
  kanal: string;
  kategori: string;
  isi: string;
  status: string;
  statusLabel: string;
  prioritas: string;
  prioritasLabel: string;
  jumlahPesan: number;
  pesanTerakhir: string | null;
  pesanTerakhirArah: string | null;
  petugasLabel: string | null;
  penyelesaian: string | null;
  dibuatPada: number;
};

type PesanPengaduan = {
  _id: Id<"pengaduanPesan">;
  arah: string;
  isi: string;
  penulisLabel: string;
  dibuatPada: number;
};

type Laporan = {
  totalKasus: number;
  perTahap: Record<string, number>;
  perPetugas: { petugas: string; jumlah: number }[];
  belumDitugaskan: number;
  kasusAktif: number;
  janjiAktif: number;
  janjiDipenuhi: number;
  janjiDilanggar: number;
  totalSisaKewajiban: number;
  tanpaTindakan: number;
  pengaduan: { baru: number; ditinjau: number; selesai: number; ditolak: number };
};

type Petugas = { id: Id<"users">; label: string };

/* ==================================================================== */
/* Gaya bersama                                                         */
/* ==================================================================== */

const KARTU = "space-y-4 rounded-2xl border border-slate-200 bg-white p-5";
const CATATAN_AMAN =
  "rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600";
const CATATAN_PENTING =
  "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900";
const CATATAN_BAHAYA =
  "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800";
const SALURAN_LANGSUNG = ["whatsapp", "telepon", "sms", "tatap_muka"];

function labelSaluran(nilai: string): string {
  return (LABEL_SALURAN_TINDAKAN as Record<string, string>)[nilai] ?? nilai;
}

/** Warna lencana prioritas — kritis harus langsung terlihat di antrean. */
function nadaPrioritas(prioritas: string): string {
  if (prioritas === "kritis") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (prioritas === "tinggi") return "border-amber-200 bg-amber-50 text-amber-700";
  if (prioritas === "rendah") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-primary/20 bg-primary/5 text-primary";
}

function labelKategoriPengaduan(nilai: string): string {
  return (LABEL_KATEGORI_PENGADUAN as Record<string, string>)[nilai] ?? nilai;
}

/** Warna lencana mengikuti tingkat tahap tunggakan (0 = lancar). */
function nadaTahap(tingkat: number): string {
  if (tingkat >= 4) return "bg-red-100 text-red-700";
  if (tingkat === 3) return "bg-orange-100 text-orange-700";
  if (tingkat === 2) return "bg-amber-100 text-amber-800";
  if (tingkat === 1) return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function LabelTahap({ tingkat, label }: { tingkat: number; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${nadaTahap(tingkat)}`}
    >
      {label}
    </span>
  );
}

/** Nilai tanggal `<input type="date">` → epoch ms pada 08:00 WIB hari itu. */
function tanggalKeEpoch(nilai: string): number | null {
  if (nilai.trim() === "") return null;
  const ms = new Date(`${nilai}T08:00:00+07:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function LabelNilai({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{nilai}</p>
    </div>
  );
}

/* ==================================================================== */
/* Dialog satu kasus                                                    */
/* ==================================================================== */

function KasusDialog({
  baris,
  aturan,
  petugas,
  aktif,
  bolehKontak,
  onTutup,
}: {
  baris: BarisKasus;
  aturan: Aturan;
  petugas: Petugas[];
  aktif: boolean;
  bolehKontak: boolean;
  onTutup: () => void;
}) {
  const riwayatData = useQuery(api.penagihan.riwayatPenagihan, { loanId: baris.loanId });
  const bukaKontak = useMutation(api.penagihan.bukaKontakPeminjam);
  const tugaskan = useMutation(api.penagihan.tugaskanPetugas);
  const catatTindakan = useMutation(api.penagihan.catatTindakan);
  const catatJanji = useMutation(api.penagihan.catatJanjiBayar);
  const tutupJanji = useMutation(api.penagihan.tutupJanji);
  const eskalasi = useMutation(api.penagihan.eskalasiKasus);
  const catatPenyelesaian = useMutation(api.penagihan.catatPenyelesaian);
  const perbaruiPembayaran = useMutation(api.penagihan.perbaruiStatusPembayaran);

  const [busy, setBusy] = useState<string | null>(null);
  const [kontakPenuh, setKontakPenuh] = useState<{
    nomorWhatsApp: string | null;
    nomorRekening: string;
    namaBank: string | null;
  } | null>(null);

  // Penugasan
  const [petugasPilihan, setPetugasPilihan] = useState<string>("__tetap__");

  // Tindakan / komunikasi
  const [jenis, setJenis] = useState("pengingat");
  const [saluran, setSaluran] = useState("whatsapp");
  const [hasil, setHasil] = useState("terhubung");
  const [isiPesan, setIsiPesan] = useState("");
  const [catatanTindakan, setCatatanTindakan] = useState("");

  // Janji pembayaran
  const [nominalJanji, setNominalJanji] = useState("");
  const [tanggalJanji, setTanggalJanji] = useState("");
  const [kanalJanji, setKanalJanji] = useState("whatsapp");
  const [catatanJanji, setCatatanJanji] = useState("");

  // Eskalasi, penyelesaian, pembayaran
  const [catatanEskalasi, setCatatanEskalasi] = useState("");
  const [jenisSelesai, setJenisSelesai] = useState("restrukturisasi");
  const [nominalSelesai, setNominalSelesai] = useState("");
  const [alasanSelesai, setAlasanSelesai] = useState("");
  const [statusBayar, setStatusBayar] = useState("bayar_sebagian");
  const [nominalBayar, setNominalBayar] = useState("");
  const [catatanBayar, setCatatanBayar] = useState("");

  const bolehTindak = aktif && baris.bolehSayaTangani;
  const saluranLangsung = SALURAN_LANGSUNG.includes(saluran);
  const pesanDiblokirLokasi = !bolehKontak && saluranLangsung;
  const periksaPesan =
    isiPesan.trim() === "" ? null : periksaPesanPenagihan(isiPesan);

  const jalankan = async (kunci: string, aksi: () => Promise<unknown>, pesanSukses: string) => {
    setBusy(kunci);
    try {
      await aksi();
      toast.success(pesanSukses);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tindakan gagal disimpan.");
    } finally {
      setBusy(null);
    }
  };

  // Nominal penagihan bukan pokok pinjaman: pembayaran sebagian bisa di bawah
  // minimum pinjaman, jadi jangan memakai `parseRupiah` yang membatasi 100 rb.
  const nominalDari = (teks: string): number | null => {
    try {
      return parseNominalRupiah(teks);
    } catch {
      return null;
    }
  };

  return (
    <Dialog open onOpenChange={(terbuka) => (terbuka ? undefined : onTutup())}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {baris.namaLengkap}
            <LabelTahap tingkat={baris.tahapTingkat} label={baris.tahapLabel} />
          </DialogTitle>
          <DialogDescription>
            {baris.nomorReferensi} · terlambat {baris.hariTerlambat} hari · kasus{" "}
            {baris.statusKasusLabel} · petugas {baris.petugasLabel ?? "belum ditugaskan"}
          </DialogDescription>
        </DialogHeader>

        {/* --- Ringkasan ledger internal --- */}
        <dl className="grid gap-2 sm:grid-cols-3">
          <MetrikKartu label="Kewajiban (ledger internal)" nilai={formatRupiah(baris.jumlahKewajiban)} />
          <MetrikKartu label="Denda keterlambatan" nilai={formatRupiah(baris.dendaTerlambat)} />
          <MetrikKartu
            label="Jatuh tempo"
            nilai={baris.jatuhTempoPada === null ? "—" : formatDate(baris.jatuhTempoPada)}
          />
          <MetrikKartu label="Status pembayaran" nilai={baris.statusPembayaranLabel} />
          <MetrikKartu label="Dibayar dicatat" nilai={formatRupiah(baris.nominalDibayar)} />
          <MetrikKartu
            label="Eskalasi"
            nilai={baris.eskalasiLabel ?? "Belum dieskalasi"}
          />
        </dl>
        <p className={CATATAN_AMAN}>
          Semua angka berasal dari catatan ledger internal PINDAI — bukan tagihan resmi dan bukan
          bukti mutasi. Nomor kontak & rekening di bawah tampil tersamar; angka utuhnya hanya
          terbuka lewat tombol buka kontak yang tercatat di audit trail.
        </p>

        {!aktif && (
          <p className={CATATAN_BAHAYA}>
            <strong>Modul penagihan sedang dinonaktifkan.</strong> Server akan menolak setiap
            tindakan sampai modul diaktifkan kembali di bagian Aturan.
          </p>
        )}
        {!baris.bolehSayaTangani && (
          <p className={CATATAN_BAHAYA}>
            Kasus ini ditugaskan kepada <strong>{baris.petugasLabel ?? "petugas lain"}</strong>.
            Hanya petugas pemegang kasus (atau penyelia yang memindahkan penugasan) yang dapat
            menindaknya — pindahkan penugasan lebih dulu bila perlu.
          </p>
        )}
        {!bolehKontak && (
          <p className={CATATAN_PENTING}>
            Di luar jam kontak {aturan.jamKontak.mulai}:00–{aturan.jamKontak.selesai}:00 WIB.
            Tindakan yang menghubungi nasabah (WhatsApp, telepon, SMS, tatap muka) tidak dapat
            dicatat sekarang; gunakan catatan sistem atau coba lagi di dalam jendela tersebut.
          </p>
        )}

        {/* --- Surat somasi: hanya muncul setelah jatuh tempo terlewati --- */}
        <SuratSomasi loanId={baris.loanId} />

        {/* --- Kontak tersamar + buka kontak --- */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Lock className="size-4 text-emerald-600" /> Kontak & informasi finansial
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <LabelNilai
              label="WhatsApp (tersamar)"
              nilai={kontakPenuh?.nomorWhatsApp ?? baris.kontak.whatsapp ?? "belum diisi"}
            />
            <LabelNilai
              label="Rekening (tersamar)"
              nilai={
                kontakPenuh === null
                  ? (baris.kontak.rekening ?? "—")
                  : `${kontakPenuh.nomorRekening}${kontakPenuh.namaBank ? ` · ${kontakPenuh.namaBank}` : ""}`
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={busy !== null || !baris.bolehSayaTangani}
            onClick={() =>
              void jalankan(
                "kontak",
                async () => {
                  const kontak = await bukaKontak({ loanId: baris.loanId });
                  setKontakPenuh({
                    nomorWhatsApp: kontak.nomorWhatsApp,
                    nomorRekening: kontak.nomorRekening,
                    namaBank: kontak.namaBank,
                  });
                },
                "Kontak dibuka — pembukaan ini tercatat di audit trail.",
              )
            }
          >
            {busy === "kontak" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Eye className="mr-2 size-4" />
            )}
            Buka kontak (tercatat audit)
          </Button>
        </div>

        {/* --- Penugasan --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <UserCheck className="size-4 text-primary" /> Penugasan petugas
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Label htmlFor={`petugas-${baris.loanId}`}>Petugas</Label>
              <Select value={petugasPilihan} onValueChange={setPetugasPilihan}>
                <SelectTrigger id={`petugas-${baris.loanId}`} className="w-full">
                  <SelectValue placeholder="Pilih petugas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__tetap__">
                    {baris.petugasLabel === null
                      ? "Belum ditugaskan"
                      : `Tetap: ${baris.petugasLabel}`}
                  </SelectItem>
                  <SelectItem value="__lepas__">Lepas penugasan</SelectItem>
                  {petugas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy !== null || petugasPilihan === "__tetap__"}
              onClick={() =>
                void jalankan(
                  "tugaskan",
                  () =>
                    tugaskan({
                      loanId: baris.loanId,
                      petugasUserId:
                        petugasPilihan === "__lepas__" ? null : (petugasPilihan as Id<"users">),
                    }),
                  "Penugasan disimpan & tercatat audit.",
                )
              }
            >
              {busy === "tugaskan" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan penugasan
            </Button>
          </div>
          <p className={CATATAN_AMAN}>
            Perpindahan penugasan adalah tindakan penyelia dan dicatat audit — termasuk saat kasus
            dipindahkan dari petugas lain.
          </p>
        </div>

        {/* --- Catat tindakan / komunikasi --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <MessageSquare className="size-4 text-primary" /> Catat tindakan & komunikasi
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`jenis-${baris.loanId}`}>Jenis tindakan</Label>
              <Select value={jenis} onValueChange={setJenis}>
                <SelectTrigger id={`jenis-${baris.loanId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aturan.daftar.jenisTindakan.map((o) => (
                    <SelectItem key={o.nilai} value={o.nilai}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`saluran-${baris.loanId}`}>Saluran</Label>
              <Select value={saluran} onValueChange={setSaluran}>
                <SelectTrigger id={`saluran-${baris.loanId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aturan.daftar.saluran.map((s) => (
                    <SelectItem key={s} value={s}>
                      {labelSaluran(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`hasil-${baris.loanId}`}>Hasil</Label>
              <Select value={hasil} onValueChange={setHasil}>
                <SelectTrigger id={`hasil-${baris.loanId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aturan.daftar.hasil.map((o) => (
                    <SelectItem key={o.nilai} value={o.nilai}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor={`pesan-${baris.loanId}`}>Isi pesan (opsional, diperiksa server)</Label>
            <Textarea
              id={`pesan-${baris.loanId}`}
              value={isiPesan}
              onChange={(e) => setIsiPesan(e.target.value)}
              placeholder="Halo … catatan aplikasi PINDAI …"
              rows={3}
            />
            {periksaPesan !== null && !periksaPesan.ok && (
              <p className={`mt-2 ${CATATAN_BAHAYA}`}>
                {periksaPesan.alasan}
                {periksaPesan.temuan.length > 0 && (
                  <span className="mt-1 block">
                    Frasa yang terdeteksi:{" "}
                    {periksaPesan.temuan.map((t) => `“${t.frasa}” (${t.kategori})`).join(", ")}
                  </span>
                )}
              </p>
            )}
            {periksaPesan !== null && periksaPesan.ok && (
              <p className="mt-2 text-xs text-emerald-700">
                Isi pesan lolos pemeriksaan: tanpa ancaman, intimidasi, penyebaran data, kontak
                pihak lain, klaim hukum, atau janji menyesatkan.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={`catatan-${baris.loanId}`}>Catatan petugas (opsional)</Label>
            <Input
              id={`catatan-${baris.loanId}`}
              value={catatanTindakan}
              onChange={(e) => setCatatanTindakan(e.target.value)}
              placeholder="Ringkas hasil kontak…"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Waktu diambil dari server; petugas dari sesi. Pihak yang dihubungi selalu peminjam.
            </p>
            <Button
              disabled={
                busy !== null ||
                !bolehTindak ||
                pesanDiblokirLokasi ||
                (periksaPesan !== null && !periksaPesan.ok)
              }
              onClick={() =>
                void jalankan(
                  "tindakan",
                  () =>
                    catatTindakan({
                      loanId: baris.loanId,
                      jenis,
                      saluran,
                      hasil,
                      isiPesan: isiPesan.trim() === "" ? undefined : isiPesan,
                      catatan: catatanTindakan.trim() === "" ? undefined : catatanTindakan,
                    }),
                  "Tindakan tercatat di riwayat komunikasi.",
                )
              }
            >
              {busy === "tindakan" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan tindakan
            </Button>
          </div>
          {pesanDiblokirLokasi && (
            <p className={CATATAN_PENTING}>
              Saluran ini menghubungi nasabah secara langsung, jadi hanya bisa dicatat di dalam jam
              kontak.
            </p>
          )}
        </div>

        {/* --- Janji pembayaran --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <CheckCircle2 className="size-4 text-emerald-600" /> Janji pembayaran
          </p>
          {baris.janjiAktif !== null && (
            <CatatanJanjiAktif
              nominal={baris.janjiAktif.nominal}
              tanggal={baris.janjiAktif.tanggalJanji}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor={`nominal-janji-${baris.loanId}`}>Nominal (Rp)</Label>
              <Input
                id={`nominal-janji-${baris.loanId}`}
                inputMode="numeric"
                value={nominalJanji}
                onChange={(e) => setNominalJanji(e.target.value)}
                placeholder="1.000.000"
                className="tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor={`tanggal-janji-${baris.loanId}`}>Tanggal janji</Label>
              <Input
                id={`tanggal-janji-${baris.loanId}`}
                type="date"
                value={tanggalJanji}
                onChange={(e) => setTanggalJanji(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`kanal-janji-${baris.loanId}`}>Kanal</Label>
              <Select value={kanalJanji} onValueChange={setKanalJanji}>
                <SelectTrigger id={`kanal-janji-${baris.loanId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aturan.daftar.saluran.map((s) => (
                    <SelectItem key={s} value={s}>
                      {labelSaluran(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`catatan-janji-${baris.loanId}`}>Catatan</Label>
              <Input
                id={`catatan-janji-${baris.loanId}`}
                value={catatanJanji}
                onChange={(e) => setCatatanJanji(e.target.value)}
                placeholder="Opsional"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={busy !== null || !bolehTindak}
              onClick={() => {
                const nominal = nominalDari(nominalJanji);
                const tanggal = tanggalKeEpoch(tanggalJanji);
                if (nominal === null || tanggal === null) {
                  toast.error("Nominal dan tanggal janji wajib diisi dengan benar.");
                  return;
                }
                void jalankan(
                  "janji",
                  () =>
                    catatJanji({
                      loanId: baris.loanId,
                      nominal,
                      tanggalJanji: tanggal,
                      kanal: kanalJanji,
                      catatan: catatanJanji.trim() === "" ? undefined : catatanJanji,
                    }),
                  "Janji pembayaran dicatat & muncul di riwayat.",
                );
              }}
            >
              {busy === "janji" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Catat janji
            </Button>
          </div>

          {riwayatData !== undefined && riwayatData !== null && (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {(riwayatData as unknown as Riwayat).janji.map((j) => (
                <li key={j._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatRupiah(j.nominal)} · {formatDate(j.tanggalJanji)} ·{" "}
                      {labelSaluran(j.kanal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {j.status} · dibuat {j.dibuatOlehLabel} {formatDate(j.dibuatPada)}
                      {j.hasilCatatan ? ` · ${j.hasilCatatan}` : ""}
                    </p>
                  </div>
                  {j.status === "aktif" && (
                    <div className="flex shrink-0 gap-1.5">
                      {(["dipenuhi", "dilanggar", "dibatalkan"] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          disabled={busy !== null || !bolehTindak}
                          onClick={() =>
                            void jalankan(
                              `janji-${j._id}-${s}`,
                              () => tutupJanji({ janjiId: j._id, status: s }),
                              `Janji ditandai ${s}.`,
                            )
                          }
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {(riwayatData as unknown as Riwayat).janji.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  Belum ada janji pembayaran pada kasus ini.
                </li>
              )}
            </ul>
          )}
        </div>

        {/* --- Eskalasi --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <AlertTriangle className="size-4 text-amber-600" /> Eskalasi bertingkat
          </p>
          <ul className="space-y-1.5">
            {aturan.daftar.eskalasi.map((e) => (
              <li
                key={e.tingkat}
                className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${
                  e.tingkat === baris.tingkatEskalasi
                    ? "border-primary/40 bg-primary/5 text-navy"
                    : "border-slate-100 bg-white text-slate-600"
                }`}
              >
                <span className="font-semibold">Tingkat {e.tingkat}</span>
                <span>
                  {e.label} — {e.keterangan}
                  {e.butuhPersetujuan ? " (perlu catatan persetujuan penyelia)" : ""}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Label htmlFor={`eskalasi-${baris.loanId}`}>Catatan persetujuan / alasan</Label>
            <Textarea
              id={`eskalasi-${baris.loanId}`}
              value={catatanEskalasi}
              onChange={(e) => setCatatanEskalasi(e.target.value)}
              rows={2}
              placeholder="Wajib untuk tingkat yang memerlukan persetujuan penyelia."
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Eskalasi hanya menaikkan perhatian internal — tanpa tekanan, ancaman, atau tindakan di
              luar prosedur.
            </p>
            <Button
              disabled={busy !== null || !bolehTindak}
              onClick={() =>
                void jalankan(
                  "eskalasi",
                  () =>
                    eskalasi({
                      loanId: baris.loanId,
                      catatan: catatanEskalasi.trim() === "" ? undefined : catatanEskalasi,
                    }),
                  "Tingkat eskalasi dinaikkan & tercatat.",
                )
              }
            >
              {busy === "eskalasi" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Naikkan tingkat eskalasi
            </Button>
          </div>
        </div>

        {/* --- Status pembayaran --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ClipboardList className="size-4 text-primary" /> Perbarui status pembayaran
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`status-bayar-${baris.loanId}`}>Status</Label>
              <Select value={statusBayar} onValueChange={setStatusBayar}>
                <SelectTrigger id={`status-bayar-${baris.loanId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aturan.daftar.statusPembayaran.map((o) => (
                    <SelectItem key={o.nilai} value={o.nilai}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`nominal-bayar-${baris.loanId}`}>Nominal dicatat (Rp)</Label>
              <Input
                id={`nominal-bayar-${baris.loanId}`}
                inputMode="numeric"
                value={nominalBayar}
                onChange={(e) => setNominalBayar(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor={`catatan-bayar-${baris.loanId}`}>Catatan</Label>
              <Input
                id={`catatan-bayar-${baris.loanId}`}
                value={catatanBayar}
                onChange={(e) => setCatatanBayar(e.target.value)}
                placeholder="Mis. transfer bank, menunggu verifikasi"
              />
            </div>
          </div>
          <p className={CATATAN_PENTING}>
            Ini <strong>catatan petugas atas apa yang dilaporkan nasabah</strong> — bukan bukti
            transfer dan tidak mengubah ledger. Pelunasan tetap dicatat lewat jalur
            pinjaman/pembayaran yang berlaku.
          </p>
          <div className="flex justify-end">
            <Button
              disabled={busy !== null || !bolehTindak}
              onClick={() => {
                const nominal = statusBayar === "belum_bayar" ? 0 : nominalDari(nominalBayar);
                if (nominal === null) {
                  toast.error("Nominal pembayaran tidak valid.");
                  return;
                }
                void jalankan(
                  "bayar",
                  () =>
                    perbaruiPembayaran({
                      loanId: baris.loanId,
                      status: statusBayar,
                      nominal,
                      catatan: catatanBayar.trim() === "" ? undefined : catatanBayar,
                    }),
                  "Status pembayaran dicatat pada kasus.",
                );
              }}
            >
              {busy === "bayar" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan status pembayaran
            </Button>
          </div>
        </div>

        {/* --- Penyelesaian --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ShieldAlert className="size-4 text-emerald-600" /> Catat penyelesaian
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`jenis-selesai-${baris.loanId}`}>Jenis penyelesaian</Label>
              <Select value={jenisSelesai} onValueChange={setJenisSelesai}>
                <SelectTrigger id={`jenis-selesai-${baris.loanId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aturan.daftar.jenisPenyelesaian.map((o) => (
                    <SelectItem key={o.nilai} value={o.nilai}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`nominal-selesai-${baris.loanId}`}>Nominal kesepakatan (Rp)</Label>
              <Input
                id={`nominal-selesai-${baris.loanId}`}
                inputMode="numeric"
                value={nominalSelesai}
                onChange={(e) => setNominalSelesai(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor={`alasan-selesai-${baris.loanId}`}>Alasan (min. 10 karakter)</Label>
              <Input
                id={`alasan-selesai-${baris.loanId}`}
                value={alasanSelesai}
                onChange={(e) => setAlasanSelesai(e.target.value)}
              />
            </div>
          </div>
          <p className={CATATAN_AMAN}>
            Keputusan penyelesaian <strong>dicatat, tidak dieksekusi</strong>: tidak ada dana yang
            berpindah dan tidak ada jurnal yang ditulis. Nominal pelunasan diperiksa terhadap
            kewajiban pada ledger internal.
          </p>
          <div className="flex justify-end">
            <Button
              disabled={busy !== null || !bolehTindak}
              onClick={() => {
                const nominal = nominalSelesai.trim() === "" ? 0 : nominalDari(nominalSelesai);
                if (nominal === null) {
                  toast.error("Nominal penyelesaian tidak valid.");
                  return;
                }
                void jalankan(
                  "selesai",
                  () =>
                    catatPenyelesaian({
                      loanId: baris.loanId,
                      jenis: jenisSelesai,
                      nominal,
                      alasan: alasanSelesai,
                    }),
                  "Penyelesaian dicatat & kasus ditutup.",
                );
              }}
            >
              {busy === "selesai" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Catat penyelesaian
            </Button>
          </div>
        </div>

        {/* --- Riwayat komunikasi & keputusan --- */}
        <div className={KARTU}>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <BellRing className="size-4 text-primary" /> Riwayat komunikasi & keputusan
          </p>
          {riwayatData === undefined ? (
            <PanelMemuat baris={2} />
          ) : riwayatData === null ? (
            <p className="text-sm text-muted-foreground">Riwayat tidak ditemukan.</p>
          ) : (
            (() => {
              const r = riwayatData as unknown as Riwayat;
              if (
                r.tindakan.length === 0 &&
                r.pembayaran.length === 0 &&
                r.penyelesaian.length === 0 &&
                r.pengaduan.length === 0
              ) {
                return (
                  <p className="text-sm text-muted-foreground">
                    Belum ada tindakan tercatat. Setiap tindakan yang disimpan akan muncul di sini
                    lengkap dengan waktu, petugas, dan hasilnya.
                  </p>
                );
              }
              return (
                <ul className="space-y-2">
                  {r.tindakan.map((t) => (
                    <li key={t._id} className="rounded-xl border border-slate-100 px-3 py-2">
                      <p className="text-sm font-medium">
                        {t.jenisLabel} · {labelSaluran(t.saluran)} · hasil {t.hasilLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.waktu)} · petugas {t.petugasLabel} · pihak {t.pihak}
                        {t.nomorTujuan ? ` · tujuan ${t.nomorTujuan}` : ""}
                      </p>
                      {t.isiPesan !== null && (
                        <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs leading-5 text-slate-700">
                          “{t.isiPesan}”
                        </p>
                      )}
                      {t.catatan !== null && (
                        <p className="mt-1 text-xs text-slate-600">Catatan: {t.catatan}</p>
                      )}
                    </li>
                  ))}
                  {r.pembayaran.map((p) => (
                    <li key={p._id} className="rounded-xl border border-slate-100 px-3 py-2">
                      <p className="text-sm font-medium tabular-nums">
                        Status pembayaran: {p.status} · {formatRupiah(p.nominal)} dari kewajiban{" "}
                        {formatRupiah(p.totalKewajiban)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.waktu)} · petugas {p.petugasLabel} · catatan petugas, bukan
                        bukti transfer
                      </p>
                      {p.catatan && <p className="mt-1 text-xs text-slate-600">{p.catatan}</p>}
                    </li>
                  ))}
                  {r.penyelesaian.map((p) => (
                    <li key={p._id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                      <p className="text-sm font-medium">
                        Penyelesaian: {p.jenis} · {formatRupiah(p.nominal)} dari kewajiban{" "}
                        {formatRupiah(p.totalKewajiban)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.waktu)} · petugas {p.petugasLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-700">{p.alasan}</p>
                    </li>
                  ))}
                  {r.pengaduan.map((p) => (
                    <li key={p._id} className="rounded-xl border border-slate-100 px-3 py-2">
                      <p className="text-sm font-medium">
                        Pengaduan: {labelKategoriPengaduan(p.kategori)} · {p.status}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.dibuatPada)}</p>
                      <p className="mt-1 text-xs text-slate-600">{p.isi}</p>
                      {p.penyelesaian && (
                        <p className="mt-1 text-xs text-slate-700">
                          Penyelesaian: {p.penyelesaian}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              );
            })()
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onTutup}>
            <XCircle className="mr-2 size-4" /> Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Kalimat ringkas janji pembayaran yang sedang aktif.
 *
 * Dipisah menjadi komponen supaya nada pentingnya tampil sebagai teks — bukan
 * tertukar menjadi daftar kelas CSS — dan supaya batas janji dijelaskan apa
 * adanya: kesepakatan petugas dengan nasabah, bukan jaminan pembayaran.
 */
function CatatanJanjiAktif({ nominal, tanggal }: { nominal: number; tanggal: number }) {
  return (
    <p className={CATATAN_PENTING}>
      Janji aktif: <strong>{formatRupiah(nominal)}</strong> pada {formatDate(tanggal)}. Janji ini
      berasal dari kesepakatan petugas dengan nasabah dan tetap catatan aplikasi — bukan jaminan
      pembayaran maupun bukti mutasi.
    </p>
  );
}

/* ==================================================================== */
/* Bagian: pengaduan                                                    */
/* ==================================================================== */

/**
 * Daftar pesan dalam utas — MURNI (tanpa server) supaya bisa diuji dengan
 * `renderToStaticMarkup` (lihat `PenagihanPengaduan.render.test.tsx`).
 *
 * Arah pesan selalu ditampilkan ("Petugas"/"Nasabah") dan tidak pernah
 * disimpulkan dari warna saja, supaya tetap terbaca tanpa penglihatan warna.
 */
export function DaftarPesanUtas({ pesan }: { pesan: PesanPengaduan[] }) {
  if (pesan.length === 0) {
    return <p className="mt-1 text-[11px] text-muted-foreground">Belum ada pesan.</p>;
  }
  return (
    <ul className="mt-2 space-y-2">
      {pesan.map((m) => (
        <li
          key={m._id}
          className={
            m.arah === "petugas"
              ? "rounded-lg border border-primary/20 bg-white px-3 py-2"
              : "rounded-lg border border-slate-200 bg-white px-3 py-2"
          }
        >
          <p className="text-[11px] font-medium text-muted-foreground">
            {m.arah === "petugas" ? "Petugas" : "Nasabah"} · {m.penulisLabel} ·{" "}
            {formatDate(m.dibuatPada)}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-slate-700">{m.isi}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Utas percakapan satu pengaduan.
 *
 * Ditampilkan hanya saat petugas membukanya (bukan untuk setiap baris): utas
 * memuat pesan nasabah dari WhatsApp/telepon, jadi membacanya harus merupakan
 * tindakan sadar petugas — bukan efek samping memuat daftar.
 *
 * Riwayat dan pengirim pesan tidak dapat disunting: server hanya menerima
 * penambahan (`tambahPesanPengaduan`).
 */
function UtasPengaduan({ pengaduanId }: { pengaduanId: Id<"pengaduanNasabah"> }) {
  const data = useQuery(api.penagihan.pesanPengaduan, { pengaduanId });
  const tambah = useMutation(api.penagihan.tambahPesanPengaduan);
  const [pesan, setPesan] = useState("");
  const [dariNasabah, setDariNasabah] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-navy">Utas percakapan</p>
      {data === undefined ? (
        <PanelMemuat baris={2} />
      ) : (
        <DaftarPesanUtas pesan={data as unknown as PesanPengaduan[]} />
      )}
      <div className="mt-3 space-y-2">
        <Label htmlFor={`pesan-${pengaduanId}`}>Tambah pesan</Label>
        <Textarea
          id={`pesan-${pengaduanId}`}
          value={pesan}
          onChange={(e) => setPesan(e.target.value)}
          rows={2}
          placeholder="Tuliskan balasan atau catatan percakapan apa adanya."
        />
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={dariNasabah}
            onChange={(e) => setDariNasabah(e.target.checked)}
          />
          Pesan ini dari nasabah (dicatat petugas)
        </label>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={busy || pesan.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                await tambah({
                  pengaduanId,
                  isi: pesan,
                  arah: dariNasabah ? "nasabah" : "petugas",
                });
                toast.success("Pesan ditambahkan ke utas pengaduan.");
                setPesan("");
                setDariNasabah(false);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Pesan gagal disimpan.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Kirim pesan
          </Button>
        </div>
      </div>
    </div>
  );
}

function PengaduanBagian({ aturan, kasus }: { aturan: Aturan; kasus: BarisKasus[] }) {
  const data = useQuery(api.penagihan.daftarPengaduan);
  const buka = useMutation(api.penagihan.bukaPengaduan);
  const tangani = useMutation(api.penagihan.tanganiPengaduan);
  const [busy, setBusy] = useState<string | null>(null);
  const [loanId, setLoanId] = useState<string>("__umum__");
  const [kanal, setKanal] = useState("whatsapp");
  const [kategori, setKategori] = useState("permintaan_penjelasan");
  const [isi, setIsi] = useState("");
  const [catatanTangani, setCatatanTangani] = useState<Record<string, string>>({});
  const ubahPrioritas = useMutation(api.penagihan.ubahPrioritasPengaduan);
  const [prioritasPilih, setPrioritasPilih] = useState<Record<string, string>>({});
  const [catatanPrioritas, setCatatanPrioritas] = useState<Record<string, string>>({});
  const [utasTerbuka, setUtasTerbuka] = useState<Record<string, boolean>>({});

  const jalankan = async (kunci: string, aksi: () => Promise<unknown>, pesan: string) => {
    setBusy(kunci);
    try {
      await aksi();
      toast.success(pesan);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tindakan gagal disimpan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className={KARTU}>
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <ShieldAlert className="size-4 text-amber-600" /> Catat pengaduan nasabah
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label htmlFor="pengaduan-kasus">Catatan pinjaman (opsional)</Label>
            <Select value={loanId} onValueChange={setLoanId}>
              <SelectTrigger id="pengaduan-kasus" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__umum__">Tanpa catatan pinjaman</SelectItem>
                {kasus.map((k) => (
                  <SelectItem key={k.loanId} value={k.loanId}>
                    {k.nomorReferensi} · {k.namaLengkap}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pengaduan-kanal">Kanal masuk</Label>
            <Select value={kanal} onValueChange={setKanal}>
              <SelectTrigger id="pengaduan-kanal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aturan.daftar.saluran.map((s) => (
                  <SelectItem key={s} value={s}>
                    {labelSaluran(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pengaduan-kategori">Kategori</Label>
            <Select value={kategori} onValueChange={setKategori}>
              <SelectTrigger id="pengaduan-kategori" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aturan.daftar.kategoriPengaduan.map((k) => (
                  <SelectItem key={k} value={k}>
                    {labelKategoriPengaduan(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="pengaduan-isi">Uraian pengaduan (min. 10 karakter)</Label>
          <Textarea
            id="pengaduan-isi"
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            rows={3}
            placeholder="Apa yang disampaikan nasabah, apa adanya."
          />
        </div>
        <div className="flex justify-end">
          <Button
            disabled={busy !== null || isi.trim().length < 10}
            onClick={() =>
              void jalankan(
                "buka",
                () =>
                  buka({
                    loanId: loanId === "__umum__" ? undefined : (loanId as Id<"loans">),
                    kanal,
                    kategori,
                    isi,
                  }),
                "Pengaduan dicatat dengan status Baru.",
              )
            }
          >
            {busy === "buka" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Catat pengaduan
          </Button>
        </div>
      </div>

      <div className={KARTU}>
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <ClipboardList className="size-4 text-primary" /> Daftar pengaduan
        </p>
        {data === undefined ? (
          <PanelMemuat baris={2} />
        ) : data.length === 0 ? (
          <EmptyQueue
            icon={ShieldAlert}
            title="Belum ada pengaduan"
            deskripsi="Pengaduan yang dicatat tim akan muncul di sini beserta status dan penyelesaiannya."
          />
        ) : (
          <ul className="space-y-3">
            {(data as unknown as Pengaduan[]).map((p) => (
              <li key={p._id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {labelKategoriPengaduan(p.kategori)} · {p.statusLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.nomorReferensi ?? "tanpa catatan pinjaman"} · {labelSaluran(p.kanal)} ·{" "}
                      {formatDate(p.dibuatPada)}
                      {p.petugasLabel ? ` · ditangani ${p.petugasLabel}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={nadaPrioritas(p.prioritas)}>
                      Prioritas {p.prioritasLabel}
                    </Badge>
                    <Badge variant="outline">{p.statusLabel}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{p.isi}</p>
                {p.penyelesaian !== null && (
                  <p className="mt-1 text-xs text-slate-600">Penyelesaian: {p.penyelesaian}</p>
                )}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-40">
                    <Label htmlFor={`prioritas-${p._id}`}>Prioritas</Label>
                    <Select
                      value={prioritasPilih[p._id] ?? p.prioritas}
                      onValueChange={(v) =>
                        setPrioritasPilih((m) => ({ ...m, [p._id]: v }))
                      }
                    >
                      <SelectTrigger id={`prioritas-${p._id}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {aturan.daftar.prioritasPengaduan.map((o) => (
                          <SelectItem key={o.nilai} value={o.nilai}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-56 flex-1">
                    <Label htmlFor={`catatan-prioritas-${p._id}`}>
                      Catatan prioritas (wajib bila Kritis)
                    </Label>
                    <Input
                      id={`catatan-prioritas-${p._id}`}
                      value={catatanPrioritas[p._id] ?? ""}
                      onChange={(e) =>
                        setCatatanPrioritas((m) => ({ ...m, [p._id]: e.target.value }))
                      }
                      placeholder="mis. nasabah mengancam menyebarkan data"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void jalankan(
                        `prioritas-${p._id}`,
                        () =>
                          ubahPrioritas({
                            pengaduanId: p._id,
                            prioritas: prioritasPilih[p._id] ?? p.prioritas,
                            catatan: catatanPrioritas[p._id],
                          }),
                        "Prioritas pengaduan diperbarui.",
                      )
                    }
                  >
                    Simpan prioritas
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setUtasTerbuka((m) => ({ ...m, [p._id]: !m[p._id] }))
                    }
                  >
                    {utasTerbuka[p._id] ? "Tutup utas" : `Buka utas (${p.jumlahPesan})`}
                  </Button>
                </div>
                {utasTerbuka[p._id] && <UtasPengaduan pengaduanId={p._id} />}
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-56 flex-1">
                    <Label htmlFor={`selesaikan-${p._id}`}>Catatan penyelesaian / alasan</Label>
                    <Input
                      id={`selesaikan-${p._id}`}
                      value={catatanTangani[p._id] ?? ""}
                      onChange={(e) =>
                        setCatatanTangani((m) => ({ ...m, [p._id]: e.target.value }))
                      }
                      placeholder="Wajib untuk status Selesai/Ditolak (min. 10 karakter)"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { status: "ditinjau", label: "Tinjau" },
                        { status: "selesai", label: "Selesai" },
                        { status: "ditolak", label: "Tolak" },
                      ] as const
                    ).map((aksi) => (
                      <Button
                        key={aksi.status}
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() =>
                          void jalankan(
                            `pengaduan-${p._id}-${aksi.status}`,
                            () =>
                              tangani({
                                pengaduanId: p._id,
                                status: aksi.status,
                                penyelesaian: catatanTangani[p._id],
                              }),
                            `Pengaduan dipindahkan ke ${aksi.label}.`,
                          )
                        }
                      >
                        {aksi.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Bagian: laporan                                                      */
/* ==================================================================== */

function LaporanBagian({ aturan }: { aturan: Aturan }) {
  const data = useQuery(api.penagihan.laporanPenagihan);
  if (data === undefined) {
    // Laporan = kartu metrik lalu tabel. Rangkanya mengikuti keduanya, bukan
    // satu spinner di tengah panel yang membuat tinggi halaman melompat.
    return (
      <div role="status" aria-live="polite" className="space-y-5">
        <span className="sr-only">Memuat laporan penagihan…</span>
        <div aria-hidden="true" className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SkeletonKartu key={i} className="rounded-xl p-3" />
            ))}
          </div>
          <SkeletonTabel kolom={4} baris={4} />
        </div>
      </div>
    );
  }
  const laporan = data as unknown as Laporan;
  return (
    <div className="space-y-5">
      <div className={KARTU}>
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <BarChart3 className="size-4 text-primary" /> Ringkasan penagihan
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Ambang tahap yang berlaku: ringan ≤ {aturan.ambang.ringan} hari, sedang ≤{" "}
          {aturan.ambang.sedang} hari, berat ≤ {aturan.ambang.berat} hari, di atas itu macet. Semua
          angka dihitung dari kasus yang benar-benar ada.
        </p>
        <dl className="grid gap-2 sm:grid-cols-3">
          <MetrikKartu label="Total kasus" nilai={`${laporan.totalKasus}`} />
          <MetrikKartu label="Kasus aktif" nilai={`${laporan.kasusAktif}`} />
          <MetrikKartu label="Belum ditugaskan" nilai={`${laporan.belumDitugaskan}`} />
          <MetrikKartu label="Janji aktif" nilai={`${laporan.janjiAktif}`} />
          <MetrikKartu label="Janji dipenuhi" nilai={`${laporan.janjiDipenuhi}`} />
          <MetrikKartu label="Janji dilanggar" nilai={`${laporan.janjiDilanggar}`} />
          <MetrikKartu label="Tanpa tindakan" nilai={`${laporan.tanpaTindakan}`} />
          <MetrikKartu
            label="Sisa kewajiban tercatat"
            nilai={formatRupiah(Math.max(0, laporan.totalSisaKewajiban))}
          />
          <MetrikKartu
            label="Pengaduan (baru/ditinjau/selesai/ditolak)"
            nilai={`${laporan.pengaduan.baru}/${laporan.pengaduan.ditinjau}/${laporan.pengaduan.selesai}/${laporan.pengaduan.ditolak}`}
          />
        </dl>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className={KARTU}>
          <p className="text-sm font-semibold text-navy">Per tahap tunggakan</p>
          <ul className="space-y-1.5">
            {aturan.daftar.tahap.map((t) => (
              <li
                key={t.kode}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <LabelTahap tingkat={t.tingkat} label={t.label} />
                  <span className="text-xs text-muted-foreground">{t.keterangan}</span>
                </span>
                <span className="tabular-nums font-semibold">{laporan.perTahap[t.kode] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={KARTU}>
          <p className="text-sm font-semibold text-navy">Beban per petugas</p>
          {laporan.perPetugas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada kasus yang ditugaskan kepada petugas.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {laporan.perPetugas.map((p) => (
                <li
                  key={p.petugas}
                  className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="truncate">{p.petugas}</span>
                  <span className="tabular-nums font-semibold">{p.jumlah}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={CATATAN_AMAN}>
            Kasus tanpa petugas dihitung terpisah sebagai “belum ditugaskan”, sehingga beban tiap
            petugas tidak terlihat lebih besar daripada kenyataannya.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Bagian: aturan                                                       */
/* ==================================================================== */

function AturanBagian({ aturan }: { aturan: Aturan }) {
  const simpan = useMutation(api.penagihan.simpanAturan);
  const [busy, setBusy] = useState(false);
  const [aktif, setAktif] = useState(aturan.aktif);
  const [ringan, setRingan] = useState(String(aturan.ambang.ringan));
  const [sedang, setSedang] = useState(String(aturan.ambang.sedang));
  const [berat, setBerat] = useState(String(aturan.ambang.berat));
  const [jamMulai, setJamMulai] = useState(String(aturan.jamKontak.mulai));
  const [jamSelesai, setJamSelesai] = useState(String(aturan.jamKontak.selesai));

  const angkakan = (teks: string, bawaan: number): number => {
    const n = Number(teks);
    return Number.isFinite(n) ? Math.floor(n) : bawaan;
  };

  return (
    <div className={KARTU}>
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        <SlidersHorizontal className="size-4 text-primary" /> Aturan penagihan
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        Aturan ini dapat diubah dan ditinjau; setiap perubahan tercatat di audit trail. Jendela jam
        kontak menahan tindakan yang menghubungi nasabah di luar jam tersebut — di server, bukan
        hanya di tampilan.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
        <div>
          <p className="text-sm font-medium">Modul penagihan aktif</p>
          <p className="text-xs text-muted-foreground">
            Saat nonaktif, seluruh tindakan penagihan ditolak server.
          </p>
        </div>
        <Switch checked={aktif} onCheckedChange={setAktif} aria-label="Aktifkan modul penagihan" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { label: "Ambang ringan (hari)", nilai: ringan, set: setRingan, bawaan: aturan.ambangDefault.ringan },
            { label: "Ambang sedang (hari)", nilai: sedang, set: setSedang, bawaan: aturan.ambangDefault.sedang },
            { label: "Ambang berat (hari)", nilai: berat, set: setBerat, bawaan: aturan.ambangDefault.berat },
          ] as const
        ).map((f) => (
          <div key={f.label}>
            <Label htmlFor={`ambang-${f.label}`}>{f.label}</Label>
            <Input
              id={`ambang-${f.label}`}
              type="number"
              min={1}
              max={365}
              value={f.nilai}
              onChange={(e) => f.set(e.target.value)}
              className="tabular-nums"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Default {f.bawaan} hari.</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { label: "Jam kontak mulai (WIB)", nilai: jamMulai, set: setJamMulai, bawaan: aturan.jamKontakDefault.mulai },
            { label: "Jam kontak selesai (WIB)", nilai: jamSelesai, set: setJamSelesai, bawaan: aturan.jamKontakDefault.selesai },
          ] as const
        ).map((f) => (
          <div key={f.label}>
            <Label htmlFor={`jam-${f.label}`}>{f.label}</Label>
            <Input
              id={`jam-${f.label}`}
              type="number"
              min={0}
              max={23}
              value={f.nilai}
              onChange={(e) => f.set(e.target.value)}
              className="tabular-nums"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Default {f.bawaan}:00 WIB.</p>
          </div>
        ))}
      </div>

      <p className={CATATAN_PENTING}>
        Nomor kontak dan informasi finansial nasabah tetap tampil tersamar di seluruh panel ini,
        dan setiap pembukaan nomor utuh tercatat di audit trail.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {aturan.diperbaruiPada === null
            ? "Belum pernah diubah — memakai nilai bawaan."
            : `Terakhir diubah ${formatDate(aturan.diperbaruiPada)} oleh ${aturan.diperbaruiOlehLabel ?? "admin"}.`}
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await simpan({
                aktif,
                ambangRingan: angkakan(ringan, aturan.ambangDefault.ringan),
                ambangSedang: angkakan(sedang, aturan.ambangDefault.sedang),
                ambangBerat: angkakan(berat, aturan.ambangDefault.berat),
                jamMulai: angkakan(jamMulai, aturan.jamKontakDefault.mulai),
                jamSelesai: angkakan(jamSelesai, aturan.jamKontakDefault.selesai),
              });
              toast.success("Aturan penagihan disimpan & tercatat di audit.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Aturan gagal disimpan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Simpan aturan
        </Button>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* Panel utama                                                          */
/* ==================================================================== */

type TabPenagihan = "kasus" | "pengaduan" | "laporan" | "aturan";

export function PenagihanPanel() {
  const kasusData = useQuery(api.penagihan.daftarKasus);
  const aturanData = useQuery(api.penagihan.aturanPenagihan);
  const petugasData = useQuery(api.penagihan.petugasPenagihan);
  const [tab, setTab] = useState<TabPenagihan>("kasus");
  const [filter, setFilter] = useState("semua");
  const [detailLoan, setDetailLoan] = useState<Id<"loans"> | null>(null);

  if (kasusData === undefined || aturanData === undefined) {
    return <PanelMemuat />;
  }

  const aturan = aturanData as unknown as Aturan;
  const baris = kasusData.baris as unknown as BarisKasus[];
  const petugas = (petugasData ?? []) as unknown as Petugas[];

  const opsi: OpsiSubTab<BarisKasus>[] = [
    { id: "semua", label: "Semua", hint: "Seluruh kasus keterlambatan.", cocok: () => true },
    {
      id: "macet",
      label: "Macet",
      hint: "Melewati ambang berat — perlu penanganan khusus.",
      cocok: (b) => b.tahapKode === "macet",
    },
    {
      id: "berat",
      label: "Berat",
      hint: "Perlu penanganan terarah dan penawaran restrukturisasi.",
      cocok: (b) => b.tahapKode === "berat",
    },
    {
      id: "sedang",
      label: "Sedang",
      hint: "Perlu kontak terarah.",
      cocok: (b) => b.tahapKode === "sedang",
    },
    {
      id: "ringan",
      label: "Ringan",
      hint: "Cukup pengingat ramah.",
      cocok: (b) => b.tahapKode === "ringan",
    },
    {
      id: "tanpa-petugas",
      label: "Belum ditugaskan",
      hint: "Kasus yang belum punya petugas penanggung jawab.",
      cocok: (b) => b.petugasLabel === null,
    },
    {
      id: "pengaduan",
      label: "Pengaduan terbuka",
      hint: "Kasus dengan pengaduan nasabah yang belum selesai.",
      cocok: (b) => b.pengaduanTerbuka > 0,
    },
  ];
  const opsiAktif = opsi.find((o) => o.id === filter) ?? opsi[0];
  const tersaring = baris.filter(opsiAktif.cocok);
  const dipilih = detailLoan === null ? null : (baris.find((b) => b.loanId === detailLoan) ?? null);

  const TABS: { id: TabPenagihan; label: string; Icon: typeof ClipboardList }[] = [
    { id: "kasus", label: "Kasus", Icon: BellRing },
    { id: "pengaduan", label: "Pengaduan", Icon: ShieldAlert },
    { id: "laporan", label: "Laporan", Icon: BarChart3 },
    { id: "aturan", label: "Aturan", Icon: SlidersHorizontal },
  ];

  return (
    <div className="animate-masuk space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
              tab === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary"
            }`}
          >
            <t.Icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {!kasusData.aktif && tab === "kasus" && (
        <p className={CATATAN_BAHAYA}>
          Modul penagihan sedang dinonaktifkan. Daftar tetap dapat ditinjau, tetapi server akan
          menolak setiap tindakan sampai modul diaktifkan kembali di tab Aturan.
        </p>
      )}

      {tab === "kasus" && (
        <div className="space-y-4">
          <p className={CATATAN_AMAN}>
            Daftar ini memuat kontak & informasi finansial dalam bentuk tersamar. Nomor utuh hanya
            terbuka lewat tombol <strong>Buka kontak</strong> di dalam kasus, dan pembukaan itu
            tercatat di audit trail. Petugas hanya dapat menindak kasus yang ditugaskan kepadanya.
          </p>

          {baris.length === 0 ? (
            <EmptyQueue
              icon={BellRing}
              title="Tidak ada keterlambatan tercatat"
              deskripsi="Kasus akan muncul di sini saat catatan pinjaman melewati jatuh tempo aplikasi."
              poin={[
                "Klasifikasi tunggakan mengikuti ambang yang dapat diatur",
                "Penugasan petugas beserta riwayat komunikasi",
                "Janji pembayaran, eskalasi, dan catatan penyelesaian",
              ]}
            />
          ) : (
            <>
              <SubTabFilter
                nama="Sub-tab tahap tunggakan"
                opsi={opsi}
                aktif={opsiAktif.id}
                onPilih={setFilter}
                baris={baris}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Jendela kontak {kasusData.jamKontak.mulai}:00–{kasusData.jamKontak.selesai}:00
                  WIB — {kasusData.bolehKontakSekarang ? "sedang terbuka" : "sedang tertutup"}.
                </p>
                {!kasusData.bolehKontakSekarang && (
                  <p className="text-xs font-medium text-amber-700">
                    Tindakan yang menghubungi nasabah dinonaktifkan sampai jendela kontak terbuka.
                  </p>
                )}
              </div>

              {tersaring.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
                  Tidak ada kasus pada filter {opsiAktif.label}.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                  {tersaring.map((b) => (
                    <li key={b.loanId}>
                      <button
                        type="button"
                        onClick={() => setDetailLoan(b.loanId)}
                        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {b.namaLengkap}
                            <LabelTahap tingkat={b.tahapTingkat} label={b.tahapLabel} />
                            {b.pengaduanTerbuka > 0 && (
                              <Badge variant="outline" className="text-amber-700">
                                {b.pengaduanTerbuka} pengaduan
                              </Badge>
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {b.nomorReferensi} · terlambat {b.hariTerlambat} hari · kewajiban{" "}
                            {formatRupiah(b.jumlahKewajiban)} · {b.statusKasusLabel} ·{" "}
                            {b.statusPembayaranLabel} · petugas {b.petugasLabel ?? "belum ditugaskan"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Kontak tersamar: WA {b.kontak.whatsapp ?? "—"} · rekening{" "}
                            {b.kontak.rekening ?? "—"} ·                            {b.jumlahTindakan} tindakan tercatat
                            {b.janjiAktif !== null
                              ? ` · janji ${formatRupiah(b.janjiAktif.nominal)} pada ${formatDate(b.janjiAktif.tanggalJanji)}`
                              : ""}
                            {b.somasi !== null
                              ? ` · somasi ${formatDate(b.somasi.pada)}${b.somasi.diserahkanPada !== null ? " (diserahkan)" : ""}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {!b.bolehSayaTangani && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              <Lock className="size-3" /> petugas lain
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                            {b.bolehKontakSekarang ? (
                              <Phone className="size-3.5" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            Buka
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {tab === "pengaduan" && <PengaduanBagian aturan={aturan} kasus={baris} />}
      {tab === "laporan" && <LaporanBagian aturan={aturan} />}
      {tab === "aturan" && <AturanBagian aturan={aturan} />}

      {dipilih !== null && (
        <KasusDialog
          baris={dipilih}
          aturan={aturan}
          petugas={petugas}
          aktif={kasusData.aktif}
          bolehKontak={kasusData.bolehKontakSekarang}
          onTutup={() => setDetailLoan(null)}
        />
      )}
    </div>
  );
}
