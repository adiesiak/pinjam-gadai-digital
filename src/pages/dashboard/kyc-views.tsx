import { useAction, useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Clock3,
  Loader2,
  Play,
  Save,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import { UnggahDokumen, type DokumenTerunggah } from "@/components/admin/pengajuan-manual/UnggahDokumen";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { penghasilanDariTeks } from "@/lib/dataDiri";
import { cn } from "@/lib/utils";
import {
  KETERANGAN_STATUS_KYC,
  LABEL_STATUS_KYC,
  keputusanWajibAlasan,
  ringkasStatusKyc,
  type StatusKyc,
} from "@/lib/kycStatus";

/**
 * MODUL KYC — bagian dashboard nasabah.
 *
 * Mandiri: tidak ada satu pun field pengajuan pinjaman di sini, dan menyimpan
 * KYC tidak membuat catatan pinjaman (lihat `convex/kyc.ts`). Alurnya:
 * mulai → isi & simpan progres (boleh setengah jalan) → ajukan peninjauan →
 * baca keputusan petugas.
 *
 * Server yang memutuskan segalanya: transisi status, kelengkapan, dan apakah
 * berkas boleh ditautkan. Bagian ini hanya menampilkan keadaan itu dan
 * menyembunyikan tindakan yang memang tidak sah, serta selalu menampilkan
 * pesan galat dari server apa adanya.
 */

type DataKyc = FunctionReturnType<typeof api.kyc.kycSaya>;
type RiwayatKyc = DataKyc["riwayat"][number];

/** Bentuk riwayat yang diterima bagian tampilan murni (dipakai uji render). */
export type RiwayatKycTampil = RiwayatKyc;

/** Terjemahan kode alasan terstruktur → kalimat untuk manusia. */
const ALASAN: Record<string, string> = {
  kyc_dimulai: "Nasabah memulai modul KYC",
  kyc_diajukan: "Diajukan untuk peninjauan petugas",
  perbaikan_dikirim_ulang: "Dikirim ulang setelah perbaikan",
  verifikasi_ulang_diajukan: "Diajukan untuk verifikasi ulang",
  pengajuan_ditarik_karena_diubah: "Pengajuan ditarik karena data diubah",
  peninjauan_ulang_dimulai: "Peninjauan ulang dimulai setelah data diperbaiki",
  data_identitas_berubah: "Data identitas penting berubah setelah verifikasi",
  identitas_terverifikasi: "Identitas diverifikasi petugas",
  identitas_ditolak: "Pengajuan KYC ditolak petugas",
  perbaikan_diminta: "Petugas meminta perbaikan",
  verifikasi_ulang_diminta_petugas: "Petugas menandai perlu verifikasi ulang",
};

function kalimatAlasan(alasan: string): string {
  return ALASAN[alasan] ?? alasan.replace(/_/g, " ");
}

function waktu(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/* ==========================================================================
 * Bagian tampilan MURNI (bisa diuji tanpa Convex)
 * ========================================================================== */

/** Judul modul: status sekarang, artinya, dan apa yang masih kurang. */
export function KycStatusHeader({
  status,
  kekurangan,
  lengkap,
  diperbaruiPada,
}: {
  status: StatusKyc;
  kekurangan: string[];
  lengkap: boolean;
  diperbaruiPada: number | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ClipboardCheck className="size-4" aria-hidden /> Verifikasi identitas (KYC)
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {KETERANGAN_STATUS_KYC[status]}
          </p>
        </div>
        <StatusKycBadge status={status} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Kelengkapan berkas
          </p>
          <p className="mt-1 text-xs font-medium">
            {lengkap
              ? "Lengkap — siap diajukan."
              : `Masih kurang ${kekurangan.length} hal sebelum bisa diajukan.`}
          </p>
          {!lengkap && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-muted-foreground">
              {kekurangan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Perubahan terakhir
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
            <Clock3 className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            {diperbaruiPada === null ? "Belum ada isian" : waktu(diperbaruiPada)}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Tersimpan otomatis di server saat Anda menekan simpan.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Pil status KYC yang tampil di SEMUA tab dashboard (di luar bagian KYC).
 *
 * Alasannya: status KYC perlu terlihat tanpa harus membuka tabnya — mis. saat
 * nasabah sedang menyiapkan pengajuan pinjaman. Kalimatnya diambil dari
 * `ringkasStatusKyc()` supaya satu status tidak pernah dijelaskan dengan dua
 * cara berbeda di halaman yang berbeda.
 */
export function KycStatusStrip({ status, onBuka }: { status: StatusKyc; onBuka: () => void }) {
  const perluTindakan =
    status === "NOT_STARTED" ||
    status === "NEEDS_CORRECTION" ||
    status === "REJECTED" ||
    status === "REVERIFICATION_REQUIRED";
  return (
    <button
      type="button"
      onClick={onBuka}
      className={cn(
        "mt-4 flex w-full flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-left transition-colors",
        perluTindakan
          ? "border-amber-200 bg-amber-50/70 hover:bg-amber-50"
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <StatusKycBadge status={status} />
      <span className="min-w-0 flex-1 text-xs leading-5 text-slate-700">
        {ringkasStatusKyc(status)}
      </span>
      <span className="text-[11px] font-medium text-primary">
        {perluTindakan ? "Lanjutkan verifikasi →" : "Lihat Verifikasi KYC →"}
      </span>
    </button>
  );
}

/** Daftar riwayat perubahan status — waktu, aktor, alasan, catatan. */
export function KycRiwayatList({ riwayat }: { riwayat: RiwayatKycTampil[] }) {
  if (riwayat.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-muted-foreground sm:p-5">
        Belum ada riwayat. Perubahan status akan tercatat di sini lengkap dengan waktu, pelaku, dan
        alasannya.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold text-navy">Riwayat KYC</h3>
      <ol className="mt-3 space-y-3">
        {riwayat.map((item, index) => (
          <li key={`${item.waktu}-${index}`} className="flex gap-3">
            <span className="mt-1 flex size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {item.dari === "-" ? "Baru" : LABEL_STATUS_KYC[item.dari as StatusKyc]}{" "}
                <ArrowRight className="inline size-3" aria-hidden />{" "}
                {LABEL_STATUS_KYC[item.ke as StatusKyc]}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {kalimatAlasan(item.alasan)} · oleh {item.aktorLabel} ({item.aktor}) ·{" "}
                {waktu(item.waktu)}
              </p>
              {item.catatan !== null && (
                <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] leading-4 text-slate-700">
                  “{item.catatan}”
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Kotak keputusan petugas yang MERUGIKAN: alasannya wajib terbaca nasabah. */
export function KycKeputusanAlert({
  status,
  catatan,
  olehLabel,
  pada,
}: {
  status: StatusKyc;
  catatan: string | null;
  olehLabel: string | null;
  pada: number | null;
}) {
  if (!keputusanWajibAlasan(status) && status !== "REVERIFICATION_REQUIRED") return null;
  const nada =
    status === "REJECTED"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  const judul =
    status === "REJECTED"
      ? "Pengajuan KYC ditolak"
      : status === "NEEDS_CORRECTION"
        ? "Perlu perbaikan sebelum diajukan ulang"
        : "Perlu verifikasi ulang";
  return (
    <div role="alert" className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${nada}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> {judul}
      </p>
      {catatan !== null && <p className="mt-1">Catatan petugas: “{catatan}”</p>}
      {olehLabel !== null && (
        <p className="mt-1 opacity-80">
          Diputuskan oleh {olehLabel}
          {pada === null ? "" : ` pada ${waktu(pada)}`}
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
 * Isian
 * ========================================================================== */

type Isian = DataKyc["isian"];

const KELAS_LABEL = "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";

/**
 * Formulir KYC. Dipisah dari `KycSection` dan diberi `key` dari stempel server
 * supaya setelah simpan berhasil form memuat nilai yang BENAR-BENAR tersimpan
 * (sudah dinormalkan server), bukan teks mentah yang baru diketik.
 */
function KycForm({
  data,
  terkunci,
  busy,
  onSimpan,
  onAjukan,
  mintaUrl,
  periksa,
}: {
  data: DataKyc;
  /** PENDING_REVIEW: isian dikunci sampai petugas memutuskan. */
  terkunci: boolean;
  busy: boolean;
  onSimpan: (
    nilai: Isian,
    berkas: { ktpId?: Id<"_storage"> | null; selfieKtpId?: Id<"_storage"> | null; buktiPenghasilanId?: Id<"_storage"> | null },
  ) => Promise<boolean>;
  onAjukan: () => Promise<void>;
  mintaUrl: () => Promise<string>;
  periksa: (id: Id<"_storage">, label: string) => Promise<void>;
}) {
  const [nilai, setNilai] = useState<Isian>(data.isian);
  const [berkas, setBerkas] = useState<{
    ktp: DokumenTerunggah | null;
    selfie: DokumenTerunggah | null;
    bukti: DokumenTerunggah | null;
  }>({
    ktp: data.dokumen.ktpId === null ? null : { id: data.dokumen.ktpId, nama: "Berkas tersimpan" },
    selfie:
      data.dokumen.selfieKtpId === null
        ? null
        : { id: data.dokumen.selfieKtpId, nama: "Berkas tersimpan" },
    bukti:
      data.dokumen.buktiPenghasilanId === null
        ? null
        : { id: data.dokumen.buktiPenghasilanId, nama: "Berkas tersimpan" },
  });

  const ubah = (kunci: keyof Isian, teks: string) =>
    setNilai((sebelumnya) => ({ ...sebelumnya, [kunci]: teks }));

  /** Kirim isian + perubahan berkas; `true` bila server menerimanya. */
  const simpan = async (): Promise<boolean> => {
    return onSimpan(nilai, {
      ktpId: berkas.ktp?.id ?? null,
      selfieKtpId: berkas.selfie?.id ?? null,
      buktiPenghasilanId: berkas.bukti?.id ?? null,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold text-navy">Isian identitas</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Isi semampunya lalu simpan — progres boleh setengah jalan dan bisa dilanjutkan kapan saja.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className={KELAS_LABEL} htmlFor="kyc-nama">
            Nama lengkap sesuai KTP
          </Label>
          <Input
            id="kyc-nama"
            className="mt-1"
            value={nilai.namaLengkap}
            disabled={terkunci}
            onChange={(e) => ubah("namaLengkap", e.target.value)}
          />
        </div>
        <div>
          <Label className={KELAS_LABEL} htmlFor="kyc-nik">
            NIK (16 angka)
          </Label>
          <Input
            id="kyc-nik"
            className="mt-1"
            inputMode="numeric"
            value={nilai.nik}
            disabled={terkunci}
            onChange={(e) => ubah("nik", e.target.value)}
          />
        </div>
        <div>
          <Label className={KELAS_LABEL} htmlFor="kyc-wa">
            Nomor WhatsApp (62…)
          </Label>
          <Input
            id="kyc-wa"
            className="mt-1"
            inputMode="tel"
            placeholder="6281234567890"
            value={nilai.nomorWhatsApp}
            disabled={terkunci}
            onChange={(e) => ubah("nomorWhatsApp", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className={KELAS_LABEL} htmlFor="kyc-alamat">
            Alamat
          </Label>
          <Input
            id="kyc-alamat"
            className="mt-1"
            value={nilai.alamat}
            disabled={terkunci}
            onChange={(e) => ubah("alamat", e.target.value)}
          />
        </div>
        <div>
          <Label className={KELAS_LABEL} htmlFor="kyc-pekerjaan">
            Pekerjaan
          </Label>
          <Input
            id="kyc-pekerjaan"
            className="mt-1"
            value={nilai.pekerjaan}
            disabled={terkunci}
            onChange={(e) => ubah("pekerjaan", e.target.value)}
          />
        </div>
        <div>
          <Label className={KELAS_LABEL} htmlFor="kyc-penghasilan">
            Penghasilan per bulan (Rp)
          </Label>
          <Input
            id="kyc-penghasilan"
            className="mt-1"
            inputMode="numeric"
            placeholder="5000000"
            value={nilai.penghasilan}
            disabled={terkunci}
            onChange={(e) => ubah("penghasilan", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className={KELAS_LABEL} htmlFor="kyc-sumber">
            Sumber penghasilan
          </Label>
          <Input
            id="kyc-sumber"
            className="mt-1"
            placeholder="Gaji bulanan, usaha warung, dll."
            value={nilai.sumberPenghasilan}
            disabled={terkunci}
            onChange={(e) => ubah("sumberPenghasilan", e.target.value)}
          />
        </div>
        <div>
          <Label className={KELAS_LABEL} htmlFor="kyc-bank">
            Bank
          </Label>
          <Input
            id="kyc-bank"
            className="mt-1"
            value={nilai.namaBank}
            disabled={terkunci}
            onChange={(e) => ubah("namaBank", e.target.value)}
          />
        </div>
        <div>
          <Label className={KELAS_LABEL} htmlFor="kyc-rekening">
            Nomor rekening
          </Label>
          <Input
            id="kyc-rekening"
            className="mt-1"
            inputMode="numeric"
            value={nilai.nomorRekening}
            disabled={terkunci}
            onChange={(e) => ubah("nomorRekening", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className={KELAS_LABEL} htmlFor="kyc-catatan">
            Catatan untuk petugas (opsional)
          </Label>
          <Textarea
            id="kyc-catatan"
            className="mt-1"
            rows={2}
            value={nilai.catatanPeminjam}
            disabled={terkunci}
            onChange={(e) => ubah("catatanPeminjam", e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Berkas pendukung
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <UnggahDokumen
            label="Foto KTP"
            keterangan="Seluruh KTP terlihat, tidak silau, tidak terpotong."
            accept="image/*"
            nilai={berkas.ktp}
            onUbah={(d) => setBerkas((s) => ({ ...s, ktp: d }))}
            mintaUrl={mintaUrl}
            periksa={periksa}
            disabled={terkunci}
          />
          <UnggahDokumen
            label="Selfie dengan KTP"
            keterangan="Wajah dan KTP terlihat dalam satu foto."
            accept="image/*"
            nilai={berkas.selfie}
            onUbah={(d) => setBerkas((s) => ({ ...s, selfie: d }))}
            mintaUrl={mintaUrl}
            periksa={periksa}
            disabled={terkunci}
          />
          <UnggahDokumen
            label="Bukti penghasilan"
            keterangan="Slip gaji, buku tabungan, atau surat keterangan usaha."
            accept="image/*"
            nilai={berkas.bukti}
            onUbah={(d) => setBerkas((s) => ({ ...s, bukti: d }))}
            mintaUrl={mintaUrl}
            periksa={periksa}
            disabled={terkunci}
          />
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Berkas diperiksa server setelah diunggah: yang bukan gambar ditolak sebelum tersimpan.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          disabled={terkunci || busy}
          onClick={() => void simpan()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Simpan progres
        </Button>
        <Button
          type="button"
          className="gap-1.5"
          disabled={terkunci || busy || !data.lengkap}
          onClick={() => void onAjukan()}
        >
          <ShieldCheck className="size-4" />
          {data.status === "REVERIFICATION_REQUIRED"
            ? "Ajukan verifikasi ulang"
            : data.status === "NEEDS_CORRECTION"
              ? "Kirim ulang pengajuan"
              : "Ajukan peninjauan"}
        </Button>
      </div>
      {!data.lengkap && (
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Tombol ajukan aktif setelah isian lengkap dan ketiga berkas terunggah.
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
 * Bagian yang tersambung server
 * ========================================================================== */

export function KycSection() {
  const data = useQuery(api.kyc.kycSaya);
  const mulai = useMutation(api.kyc.mulaiKyc);
  const simpan = useMutation(api.kyc.simpanProgresKyc);
  const ajukan = useMutation(api.kyc.ajukanKyc);
  const buatUrl = useMutation(api.kyc.urlUnggahBerkasKyc);
  const periksa = useAction(api.berkasIdentitas.periksaIsiBerkasKyc);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat status KYC…
      </div>
    );
  }

  /** Jalankan satu langkah; galat dari server ditampilkan apa adanya. */
  const jalankan = async (langkah: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setGalat(null);
    try {
      await langkah();
      return true;
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Langkah KYC gagal. Coba lagi.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const simpanProgres = async (
    nilai: Isian,
    berkas: {
      ktpId?: Id<"_storage"> | null;
      selfieKtpId?: Id<"_storage"> | null;
      buktiPenghasilanId?: Id<"_storage"> | null;
    },
  ): Promise<boolean> => {
    const berhasil = await jalankan(() =>
      simpan({
        namaLengkap: nilai.namaLengkap,
        nik: nilai.nik,
        nomorWhatsApp: nilai.nomorWhatsApp,
        alamat: nilai.alamat,
        pekerjaan: nilai.pekerjaan,
        penghasilanBulanan: penghasilanDariTeks(nilai.penghasilan),
        sumberPenghasilan: nilai.sumberPenghasilan,
        namaBank: nilai.namaBank,
        nomorRekening: nilai.nomorRekening,
        catatanPeminjam: nilai.catatanPeminjam,
        ...berkas,
      }),
    );
    if (berhasil) toast.success("Progres KYC tersimpan.");
    return berhasil;
  };

  const ajukanPeninjauan = async () => {
    const berhasil = await jalankan(() => ajukan({}));
    if (berhasil) toast.success("Pengajuan KYC dikirim untuk peninjauan.");
  };

  const terkunci = data.status === "PENDING_REVIEW";

  return (
    <section className="space-y-4">
      <KycStatusHeader
        status={data.status}
        kekurangan={data.kekurangan}
        lengkap={data.lengkap}
        diperbaruiPada={data.diperbaruiPada}
      />

      {data.status === "NOT_STARTED" && !data.adaBaris && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4 sm:p-5">
          <p className="text-sm font-semibold text-navy">Mulai KYC</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Verifikasi identitas dipakai untuk pengajuan pinjaman/gadai Anda. Tidak ada biaya dan
            tidak otomatis membuat pengajuan.
          </p>
          <Button
            type="button"
            className="mt-3 gap-1.5"
            disabled={busy}
            onClick={() =>
              void jalankan(() => mulai({})).then((ok) => {
                if (ok) toast.success("KYC dimulai. Isi data Anda di bawah.");
              })
            }
          >
            <Play className="size-4" /> Mulai KYC
          </Button>
        </div>
      )}

      <KycKeputusanAlert
        status={data.status}
        catatan={data.keputusanCatatan}
        olehLabel={data.diputuskanOlehLabel}
        pada={data.diputuskanPada}
      />

      {data.status === "VERIFIED" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <BadgeCheck className="size-3.5 shrink-0" aria-hidden /> Identitas terverifikasi
          </p>
          <p className="mt-1">
            Status ini berarti identitas Anda sudah diperiksa petugas — bukan persetujuan pinjaman
            dan bukan bukti dana cair. Mengubah nama, NIK, atau berkas identitas akan memicu
            verifikasi ulang.
          </p>
        </div>
      )}

      {terkunci && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock3 className="size-3.5 shrink-0" aria-hidden /> Isian dikunci sementara
          </p>
          <p className="mt-1">
            Pengajuan Anda sedang ditinjau petugas. Isian tidak bisa diubah supaya petugas menilai
            data yang sama dengan yang Anda kirim.
          </p>
        </div>
      )}

      {data.status !== "NOT_STARTED" && (
        <KycForm
          key={`${data.diperbaruiPada ?? 0}`}
          data={data}
          terkunci={terkunci}
          busy={busy}
          onSimpan={simpanProgres}
          onAjukan={ajukanPeninjauan}
          mintaUrl={() => buatUrl({})}
          periksa={(id, label) => periksa({ id, label }).then(() => undefined)}
        />
      )}

      {galat !== null && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Langkah KYC belum berhasil</AlertTitle>
          <AlertDescription>{galat}</AlertDescription>
        </Alert>
      )}

      <KycRiwayatList riwayat={data.riwayat} />
    </section>
  );
}
