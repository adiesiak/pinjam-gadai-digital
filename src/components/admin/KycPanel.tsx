import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  FileWarning,
  History,
  Loader2,
  ScanLine,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  adaFilterKyc,
  akibatKeputusanKyc,
  FILTER_HASIL_KYC,
  FILTER_KYC_KOSONG,
  judulKonfirmasiKeputusan,
  LABEL_FILTER_HASIL_KYC,
  LABEL_STATUS_DOKUMEN_KYC,
  rentangTanggal,
  ringkasFilterKyc,
  ringkasJumlahKyc,
  type FilterHasilKyc,
  type FilterKyc,
} from "@/lib/kycAdmin";
import { formatRupiah } from "@/lib/money";
import { AMBANG_KEYAKINAN_TINGGI, tingkatKeyakinan } from "@/lib/kycOcr";
import {
  KETERANGAN_STATUS_KYC,
  KYC_STATUS,
  LABEL_STATUS_KYC,
  keputusanWajibAlasan,
  tujuanSah,
  type StatusKyc,
} from "@/lib/kycStatus";
import { cn } from "@/lib/utils";

/**
 * KONSOL PEMERIKSAAN KYC — sisi petugas.
 *
 * Satu tempat untuk mencari satu nasabah di antara seluruh pengajuan KYC,
 * menyaringnya menurut status/tanggal/HASIL PEMENTADAN, memeriksa identitas
 * secara terstruktur, lalu memutuskan.
 *
 * Tata letak: SPLIT VIEW 40% daftar : 60% rincian. Kolom kanan berketinggian
 * tetap dengan STICKY ACTION HEADER, sehingga tombol keputusan selalu terlihat
 * tanpa menggulir — isi dokumen saja yang bergulir di dalam sub-tab.
 *
 * Aturan yang dipegang di sini:
 * - PENYARINGAN ada di server (`convex/kyc.ts` memakai `lib/kycAdmin.ts`); panel
 *   hanya mengirim kata kunci/status/tanggal/hasil dan menampilkan apa yang
 *   dikembalikan. Jadi daftar di layar tidak pernah berbeda dari yang dihitung
 *   server, dan status yang dikirim klien tidak pernah dianggap fakta.
 * - Tombol keputusan hanya menampilkan tujuan yang SAH dari status sekarang
 *   (`tujuanSah(status, "admin")`) — server tetap menolak yang lain.
 * - Setiap keputusan penting lewat DIALOG KONFIRMASI yang menyebut akibatnya
 *   bagi nasabah; keputusan hanya dikirim setelah petugas menekan tombol di
 *   dialog. Server mencatat setiap perubahan ke riwayat + audit trail.
 * - Dokumen KTP/selfie hanya tampil di sini (admin ber-TOTP) sebagai gambar
 *   ber-watermark dari URL bertanda tangan — tidak pernah ke sisi penyedia dana.
 */

type DaftarKyc = FunctionReturnType<typeof api.kyc.daftarKycAdmin>;
type ItemKyc = DaftarKyc["item"][number];
type DetailKyc = NonNullable<FunctionReturnType<typeof api.kyc.detailKycAdmin>>;

/** Bentuk data yang diterima bagian tampilan murni (dipakai uji render). */
export type ItemKycTampil = ItemKyc;
export type DetailKycTampil = DetailKyc;

/**
 * Urutan pilihan status di panel: yang menunggu tindakan lebih dulu.
 * `KYC_STATUS` tetap sumber kebenaran daftar status; di sini hanya urutannya
 * yang diatur supaya antrean kerja tampil paling depan.
 */
const URUTAN_SARING: StatusKyc[] = [
  "PENDING_REVIEW",
  "NEEDS_CORRECTION",
  "REVERIFICATION_REQUIRED",
  "IN_PROGRESS",
  "VERIFIED",
  "REJECTED",
  ...KYC_STATUS.filter((s) => s === "NOT_STARTED"),
];

/** Penanda "tanpa saringan status" untuk `Select` (Radix menolak nilai kosong). */
const SEMUA_STATUS = "__semua";

/** Sub-tab panel rincian. */
type TabDetail = "berkas" | "identitas" | "sistem";

function waktu(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Ukuran berkas untuk dibaca petugas (KB/MB) — bukan angka byte mentah. */
function ukuranBerkas(byte: number | null): string {
  if (byte === null) return "ukuran tidak tercatat";
  if (byte >= 1024 * 1024) return `${(byte / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(byte / 1024))} KB`;
}

/** Lencana kecil untuk hasil mesin / tanda pemeriksaan pada baris daftar. */
function Tanda({ nada, children }: { nada: "amber" | "merah" | "hijau" | "abu"; children: React.ReactNode }) {
  const kelas = {
    amber: "bg-amber-50 text-amber-800",
    merah: "bg-red-50 text-red-700",
    hijau: "bg-emerald-50 text-emerald-700",
    abu: "bg-slate-100 text-slate-600",
  }[nada];
  return (
    <span className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[11px]", kelas)}>{children}</span>
  );
}

/* ==========================================================================
 * Bagian tampilan MURNI
 * ========================================================================== */

/**
 * Satu baris antrean: identitas, kode nasabah, tanda pemeriksaan, status.
 *
 * Nama ditampilkan UTUH (tanpa `truncate`) supaya petugas bisa membedakan dua
 * nasabah bernama panjang tanpa membuka satu per satu; baris boleh membungkus.
 *
 * Catatan soal lencana "mesin": keputusan otomatis adalah fakta MAHAL (satu
 * pembacaan berindeks per baris), jadi `daftarKycAdmin` hanya mengisinya saat
 * saringan hasil mesin memang dipilih. Kalau `keputusanOtomatis` null, lencana
 * mesin tidak ditampilkan sama sekali — bukan ditampilkan sebagai "belum ada
 * keputusan", karena yang tidak dibaca tidak boleh diklaim.
 */
export function BarisKyc({
  item,
  aktif,
  onPilih,
}: {
  item: ItemKycTampil;
  aktif: boolean;
  onPilih: (userId: Id<"users">) => void;
}) {
  const mesin = item.keputusanOtomatis;
  const berkasKurang = item.kekurangan.length > 0;
  return (
    <button
      type="button"
      onClick={() => onPilih(item.userId)}
      aria-pressed={aktif}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
        aktif
          ? "border-emerald-600 bg-emerald-50/40"
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-navy">{item.nama}</p>
          <p className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">
            {item.email ?? "tanpa email"} · {item.kodePeminjam ?? "tanpa kode nasabah"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            diajukan {waktu(item.diajukanPada)}
          </p>
        </div>
        <StatusKycBadge status={item.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Tanda nada={berkasKurang ? "amber" : "hijau"}>
          <FileWarning className="size-3.5 shrink-0" aria-hidden />
          {berkasKurang ? `${item.kekurangan.length} berkas/isi kurang` : "berkas lengkap"}
        </Tanda>
        {!item.nomorWhatsAppTerbukti && (
          <Tanda nada="amber">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> WhatsApp belum OTP
          </Tanda>
        )}
        {item.verifikasiUlangTertunda && (
          <Tanda nada="merah">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> perlu verifikasi ulang
          </Tanda>
        )}
        {/* Putusan yang diambil dengan aturan lama harus kelihatan DARI DAFTAR —
            bukan hanya setelah membuka satu per satu. */}
        {item.aturanUsang && (
          <Tanda nada="amber">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> aturan lama
          </Tanda>
        )}
        {mesin !== null && (
          <Tanda nada={mesin.diterapkan === true ? "hijau" : "abu"}>
            mesin: {LABEL_STATUS_KYC[mesin.keputusan]}
            {mesin.diterapkan === true ? "" : " (tidak diterapkan)"}
          </Tanda>
        )}
      </div>
    </button>
  );
}

/** Baris "label — nilai" untuk data identitas dan metadata pemeriksaan. */
function Baris({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{nilai}</dd>
    </div>
  );
}

/** Judul bagian rincian — dipakai berulang supaya hierarki tetap sama. */
function JudulBagian({
  ikon: Ikon,
  judul,
  keterangan,
}: {
  ikon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  judul: string;
  keterangan?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-navy">
        <Ikon className="size-3.5" aria-hidden />
        {judul}
      </p>
      {keterangan !== undefined && (
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{keterangan}</p>
      )}
    </div>
  );
}

/**
 * HASIL OCR yang tersimpan — apa yang dibaca mesin dari foto KTP.
 *
 * Ditampilkan sebagai PEMBACAAN, bukan bukti: keyakinan yang rendah dinyatakan
 * rendah, dan nilai yang tidak terbaca dinyatakan tidak terbaca (bukan dikosongkan
 * diam-diam sampai tampak seperti data sah).
 */
export function OcrKtpKyc({ ocr }: { ocr: DetailKycTampil["ocrKtp"] }) {
  if (ocr === null) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
        Belum ada hasil OCR KTP untuk nasabah ini. Ketidaksesuaian teks KTP belum bisa diperiksa —
        nilai tidak dikarang.
      </p>
    );
  }
  const tingkat = tingkatKeyakinan(ocr.konfidensi);
  const tingkatTeks = tingkat === "tinggi" ? "tinggi" : tingkat === "sedang" ? "sedang" : "rendah";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tanda nada={tingkat === "rendah" ? "merah" : tingkat === "sedang" ? "amber" : "hijau"}>
          <ScanLine className="size-3.5 shrink-0" aria-hidden />
          Keyakinan {Math.round(ocr.konfidensi)} ({tingkatTeks}
          {tingkat === "tinggi" ? `, ambang ${AMBANG_KEYAKINAN_TINGGI}` : ""})
        </Tanda>
        <span className="text-[11px] text-muted-foreground">
          dipindai {waktu(ocr.pada)} · sumber {ocr.sumber}
        </span>
      </div>
      <dl className="mt-2 divide-y divide-slate-100">
        <Baris label="NIK terbaca" nilai={ocr.nik ?? "tidak terbaca"} />
        <Baris label="Nama terbaca" nilai={ocr.nama ?? "tidak terbaca"} />
        <Baris label="Alamat terbaca" nilai={ocr.alamat ?? "tidak terbaca"} />
      </dl>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        OCR hanya membaca teks dari gambar. Ia bukan bukti keaslian KTP dan tidak diverifikasi ke
        Dukcapil.
      </p>
    </div>
  );
}

/**
 * KETIDAKSESUAIAN teks KTP ↔ isian, dipisah material (NIK/nama) dan lunak.
 *
 * Daftar kosong BUKAN berarti "data pasti cocok": hanya field yang benar-benar
 * terbaca mesin yang bisa dibandingkan, jadi kalimatnya menyebut itu.
 */
export function KetidaksesuaianKtp({
  ketidaksesuaian,
  adaOcr,
}: {
  ketidaksesuaian: DetailKycTampil["ketidaksesuaian"];
  adaOcr: boolean;
}) {
  const total = ketidaksesuaian.material.length + ketidaksesuaian.lunak.length;
  if (total === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700">
        {adaOcr
          ? "Tidak ada perbedaan yang TERBACA mesin antara teks KTP dan isian. Ini bukan bukti bahwa data pasti cocok."
          : "Belum bisa dibandingkan: hasil OCR KTP belum tersedia."}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {ketidaksesuaian.material.map((b) => (
        <li
          key={`material-${b.field}`}
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-900"
        >
          <strong>{b.label} tidak cocok (material).</strong> KTP: “{b.ocr}” · isian: “{b.form}”.
        </li>
      ))}
      {ketidaksesuaian.lunak.map((b) => (
        <li
          key={`lunak-${b.field}`}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900"
        >
          {b.label} berbeda (bukan material). KTP: “{b.ocr}” · isian: “{b.form}”.
        </li>
      ))}
    </ul>
  );
}

/**
 * HASIL PEMERIKSAAN OTOMATIS terakhir — bahan pertimbangan petugas.
 *
 * Petugas perlu melihat APA yang sudah diperiksa mesin, apa yang GAGAL atau
 * belum bisa dipastikan, dan — yang paling penting — apakah hasilnya sampai
 * mengubah status. Mesin hanya boleh MENERAPKAN `VERIFIED`, jadi hasil lain di
 * sini murni catatan: keputusan tetap milik petugas, dan pengajuan tidak
 * tertutup dari jalur verifikasi mereka.
 */
export function KeputusanOtomatisKyc({
  keputusan,
}: {
  keputusan: NonNullable<DetailKycTampil["keputusanOtomatis"]>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700">
      <p className="font-semibold text-slate-900">
        Pemeriksaan otomatis terakhir: {LABEL_STATUS_KYC[keputusan.keputusan as StatusKyc]} ·{" "}
        {keputusan.diterapkan ? "sudah mengubah status" : "status TIDAK diubah"} ·{" "}
        {waktu(keputusan.waktu)}
      </p>
      <p className="mt-1">{keputusan.ringkasan}</p>
      <ul className="mt-1.5 space-y-1">
        {keputusan.aturan.map((r) => (
          <li key={r.id}>
            <span className="font-medium">
              {r.status === "lulus" ? "Lulus" : r.status === "gagal" ? "Gagal" : "Belum pasti"}
            </span>{" "}
            — {r.judul}: {r.pesan}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px]">
        Aturan {keputusan.versiAturan} · sumber {keputusan.sumber} · pelaku {keputusan.aktor}. Pemeriksaan
        otomatis tidak membuktikan keaslian KTP dan tidak diverifikasi ke Dukcapil.
      </p>
    </div>
  );
}

/** Riwayat status versi ringkas untuk petugas. */
export function KycRiwayatRingkas({ riwayat }: { riwayat: DetailKycTampil["riwayat"] }) {
  if (riwayat.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Belum ada perubahan status.</p>;
  }
  return (
    <ul className="space-y-2">
      {riwayat.map((item, index) => (
        <li key={`${item.waktu}-${index}`} className="text-[11px] leading-5">
          <span className="font-medium">
            {item.dari === "-" ? "Baru" : LABEL_STATUS_KYC[item.dari as StatusKyc]} →{" "}
            {LABEL_STATUS_KYC[item.ke as StatusKyc]}
          </span>{" "}
          <span className="text-muted-foreground">
            · {item.alasan.replace(/_/g, " ")} · {item.aktorLabel} ({item.aktor}) · {waktu(item.waktu)}
            {item.versiAturan === null ? "" : ` · aturan ${item.versiAturan}`}
          </span>
          {item.catatan !== null && <span className="block text-slate-700">“{item.catatan}”</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * JEJAK AUDIT nasabah — baris append-only dari `auditLog` untuk pengguna ini.
 *
 * Berbeda dari riwayat status di atas: riwayat hanya mencatat TRANSISI status,
 * sedangkan audit mencatat setiap aksi (termasuk keputusan yang tidak mengubah
 * status, mis. verifikasi ulang yang diminta, dan aksi modul lain atas data
 * nasabah yang sama).
 */
export function KycAuditRingkas({ audit }: { audit: DetailKycTampil["audit"] }) {
  if (audit.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Belum ada entri audit untuk nasabah ini.</p>;
  }
  return (
    <ul className="space-y-2">
      {audit.map((a, index) => (
        <li key={`${a.waktu}-${index}`} className="text-[11px] leading-5">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
            {a.aksi}
          </span>{" "}
          <span className="text-muted-foreground">
            · {a.aktorLabel} · {waktu(a.waktu)}
          </span>
          {a.detail !== null && <span className="block text-slate-700">{a.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Bagian-bagian rincian.
 *
 * Dipisah menjadi komponen kecil supaya KONSOL dapat menyusunnya ulang ke
 * dalam sub-tab TANPA menyalin markup: `KycDetailRingkas` merangkainya kembali
 * persis seperti sebelumnya (dipakai uji render), sedangkan panel memakai
 * potongan yang sama di tab yang sesuai.
 * ------------------------------------------------------------------------- */

/** Kepala rincian: status, waktu diajukan/diputuskan, dan penjelasan statusnya. */
function KycKepalaRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusKycBadge status={detail.status} />
        <span className="text-[11px] text-muted-foreground">
          Diajukan {waktu(detail.diajukanPada)} · keputusan terakhir {waktu(detail.diputuskanPada)}
          {detail.diputuskanOlehLabel === null ? "" : ` oleh ${detail.diputuskanOlehLabel}`}
        </span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {KETERANGAN_STATUS_KYC[detail.status]}
      </p>
    </>
  );
}

/** Dasar pemrosesan data (PDP) — wajib ada sebelum verifikasi. */
function KycPdpRingkas({ detail }: { detail: DetailKycTampil }) {
  if (detail.persetujuanAktif) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
        Persetujuan pemrosesan data tercatat {waktu(detail.persetujuan?.pada ?? null)} (versi{" "}
        {detail.persetujuan?.versi ?? "—"}) oleh {detail.persetujuan?.olehLabel ?? "—"}.
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
    >
      Nasabah <strong>belum memiliki persetujuan pemrosesan data yang berlaku</strong>. Jangan
      verifikasi identitas sebelum dasar pemrosesan tercatat.
    </p>
  );
}

/** Tabel data identitas tersimpan. */
function KycIdentitasRingkas({ detail }: { detail: DetailKycTampil }) {
  const barisIsian: Array<[string, React.ReactNode]> = [
    ["Kode nasabah", detail.kodePeminjam ?? "—"],
    ["Email", detail.email ?? "—"],
    ["Nama sesuai KTP", detail.namaLengkap ?? "—"],
    ["NIK", detail.nik ?? "—"],
    ["WhatsApp", detail.nomorWhatsApp ?? "—"],
    ["Alamat", detail.alamat ?? "—"],
    ["Pekerjaan", detail.pekerjaan ?? "—"],
    [
      "Penghasilan per bulan",
      detail.penghasilanBulanan === null ? "—" : formatRupiah(detail.penghasilanBulanan),
    ],
    ["Sumber penghasilan", detail.sumberPenghasilan ?? "—"],
    // Kontak darurat ditampilkan untuk PETUGAS: satu-satunya gunanya kolom ini
    // adalah saat nomor utama tidak bisa dihubungi, dan itu selalu terjadi saat
    // petugas sedang bekerja.
    [
      "Kontak darurat",
      detail.namaKontakDarurat === null
        ? "—"
        : `${detail.namaKontakDarurat}${detail.hubunganKontakDarurat === null ? "" : ` (${detail.hubunganKontakDarurat})`}`,
    ],
    ["Nomor kontak darurat", detail.nomorKontakDarurat ?? "—"],
    ["Catatan nasabah", detail.catatanPeminjam ?? "—"],
  ];
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={ShieldCheck}
        judul="Data identitas"
        keterangan="Nilai yang tersimpan setelah dinormalkan server (nama huruf besar, NIK digit saja)."
      />
      <dl className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {barisIsian.map(([label, nilai]) => (
          <Baris key={label} label={label} nilai={nilai} />
        ))}
      </dl>
    </div>
  );
}

/** Status bukti OTP nomor WhatsApp. */
function KycOtpRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={ScanLine}
        judul="Status OTP WhatsApp"
        keterangan="Kode OTP membuktikan nomor itu AKTIF dan dikuasai pemakainya — bukan bahwa nomor itu milik nama di KTP."
      />
      <p
        className={
          detail.nomorWhatsAppTerbukti
            ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
            : "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
        }
      >
        {detail.nomorWhatsAppTerbukti ? (
          <>
            Nomor WhatsApp <strong>dibuktikan aktif lewat kode OTP</strong> (
            {detail.nomorWhatsAppTerverifikasi?.metode ?? "wa_otp"}) pada{" "}
            {waktu(detail.nomorWhatsAppTerverifikasi?.pada ?? null)}.
          </>
        ) : detail.nomorWhatsAppTerverifikasi === null ? (
          <>
            Nomor WhatsApp <strong>belum diverifikasi</strong> lewat kode OTP.
          </>
        ) : (
          <>
            Bukti OTP terakhir <strong>tidak lagi cocok</strong> dengan nomor yang tersimpan (nomor
            berubah setelah diverifikasi) — minta nasabah memverifikasi ulang nomornya.
          </>
        )}
      </p>
    </div>
  );
}

/** Grid berkas KTP/selfie/bukti penghasilan beserta metadata pemeriksaannya. */
function KycDokumenRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={FileWarning}
        judul="Status dokumen"
        keterangan="“Siap” berarti ISI berkas sudah diperiksa server (magic bytes) — bukan penilaian bahwa KTP-nya asli."
      />
      {detail.kekurangan.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          <p className="font-semibold">Isian belum lengkap — tidak bisa diverifikasi:</p>
          <ul className="mt-1 list-disc pl-4">
            {detail.kekurangan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {/* URL dipisah dari metadata pemeriksaannya karena `WatermarkedDoc`
          tidak menerima `src` null. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {detail.berkas.map((meta) => {
          const url =
            meta.slot === "ktp"
              ? detail.url.ktp
              : meta.slot === "selfie"
                ? detail.url.selfie
                : detail.url.buktiPenghasilan;
          return (
            <div key={meta.slot} className="space-y-1">
              {url === null ? (
                <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[11px] text-muted-foreground">
                  {meta.label}: belum diunggah
                </div>
              ) : (
                <WatermarkedDoc src={url} label={meta.label} />
              )}
              <p className="text-[10px] leading-4 font-medium text-slate-700">
                {LABEL_STATUS_DOKUMEN_KYC[meta.statusDokumen as keyof typeof LABEL_STATUS_DOKUMEN_KYC] ??
                  meta.statusDokumen}
              </p>
              {meta.ada ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Diperiksa server: {meta.jenis ?? "—"} · {ukuranBerkas(meta.ukuranByte)} ·{" "}
                  {meta.lebar !== null && meta.tinggi !== null
                    ? `${meta.lebar}×${meta.tinggi} px`
                    : "dimensi —"}{" "}
                  · sidik jari {(meta.sidikJari ?? "—").slice(0, 12)} · aturan{" "}
                  {meta.versiAturan ?? "—"}
                </p>
              ) : meta.tertaut ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Berkas tersimpan, tetapi ISI-nya belum lolos pemeriksaan server — jadi belum bisa
                  dinilai dari sini.
                </p>
              ) : (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Belum ada berkas tersimpan untuk slot ini.
                </p>
              )}
              {meta.aturanUsang && (
                <p className="text-[10px] leading-4 font-medium text-amber-800">
                  Berkas ini diperiksa dengan aturan lama — pertimbangkan memeriksa ulang.
                </p>
              )}
              {meta.dipakaiAkunLain > 0 && (
                <p role="alert" className="text-[10px] leading-4 font-medium text-red-700">
                  Berkas dengan isi yang sama dipakai di {meta.dipakaiAkunLain} akun lain — periksa
                  kemungkinan penyalahgunaan identitas.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">
        Dokumen ini privat: URL-nya bertanda tangan & berumur pendek, hanya keluar untuk admin
        ber-TOTP, dan tidak pernah ditampilkan ke pendana atau pemantau.
      </p>
    </div>
  );
}

/** Hasil OCR KTP. */
function KycOcrRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={ScanLine}
        judul="Hasil OCR KTP"
        keterangan="Pemindaian berjalan di perangkat nasabah; hasilnya tersimpan sebagai bacaan mesin (sumber: klien)."
      />
      <OcrKtpKyc ocr={detail.ocrKtp} />
    </div>
  );
}

/** Ketidaksesuaian teks KTP terhadap isian. */
function KycKetidaksesuaianRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={ShieldAlert}
        judul="Ketidaksesuaian data"
        keterangan="Perbedaan material (NIK/nama) dan lunak (mis. alamat) antara teks KTP dan isian."
      />
      <KetidaksesuaianKtp
        ketidaksesuaian={detail.ketidaksesuaian}
        adaOcr={detail.ocrKtp !== null}
      />
    </div>
  );
}

/** Hasil pemeriksaan otomatis terakhir. */
function KycOtomatisRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={ShieldAlert}
        judul="Hasil pemeriksaan otomatis"
        keterangan="Mesin hanya boleh MENERAPKAN “Terverifikasi”. Hasil lain adalah bahan peninjauan, bukan keputusan."
      />
      {detail.keputusanOtomatis === null ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700">
          Mesin keputusan otomatis belum pernah memeriksa pengajuan ini (pemeriksaan berjalan saat
          pengajuan dikirim).
        </p>
      ) : (
        <KeputusanOtomatisKyc keputusan={detail.keputusanOtomatis} />
      )}
    </div>
  );
}

/** Dasar aturan putusan (bila sudah pernah diverifikasi). */
function KycAturanRingkas({ detail }: { detail: DetailKycTampil }) {
  if (detail.aturanTerverifikasi === null) return null;
  return (
    <p
      className={
        detail.aturanUsang
          ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
          : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700"
      }
    >
      Diverifikasi dengan aturan <strong>{detail.aturanTerverifikasi.versi}</strong> pada{" "}
      {waktu(detail.aturanTerverifikasi.pada)} (aturan berlaku: {detail.versiAturan}).
      {detail.keteranganAturanUsang === null ? "" : ` ${detail.keteranganAturanUsang}`}
    </p>
  );
}

/** Riwayat transisi status. */
function KycRiwayatSection({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian ikon={History} judul="Riwayat KYC" keterangan="Setiap transisi status beserta aktor dan alasannya." />
      <KycRiwayatRingkas riwayat={detail.riwayat} />
    </div>
  );
}

/** Jejak audit append-only. */
function KycAuditSection({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-2">
      <JudulBagian
        ikon={ScrollText}
        judul="Audit trail"
        keterangan="Jejak append-only semua aksi atas nasabah ini (20 terbaru). Sumber: auditLog."
      />
      <KycAuditRingkas audit={detail.audit} />
    </div>
  );
}

/** Rincian satu pengajuan menurut urutan pemeriksaan petugas (bentuk lengkap). */
export function KycDetailRingkas({ detail }: { detail: DetailKycTampil }) {
  return (
    <div className="space-y-4">
      <KycKepalaRingkas detail={detail} />
      <KycPdpRingkas detail={detail} />
      <KycIdentitasRingkas detail={detail} />
      <KycOtpRingkas detail={detail} />
      <KycDokumenRingkas detail={detail} />
      <KycOcrRingkas detail={detail} />
      <KycKetidaksesuaianRingkas detail={detail} />
      <KycOtomatisRingkas detail={detail} />
      <KycAturanRingkas detail={detail} />
      <KycRiwayatSection detail={detail} />
      <KycAuditSection detail={detail} />
    </div>
  );
}

/**
 * Bukti pendukung di dalam dialog konfirmasi — dipisah dari portal Radix supaya
 * bisa dirender langsung oleh uji (Radix tidak memasang portal pada render
 * statis).
 *
 * Tujuannya: petugas melihat apa yang akan DIBACA nasabah (catatannya), apa
 * yang masih kurang, dan apa yang masih ditandai mesin SEBELUM menekan tombol —
 * termasuk saat ia mengambil alih keputusan dari mesin secara manual.
 */
export function IsiKonfirmasiKeputusan({
  keputusan,
  catatan,
  kekurangan,
  ditandaiMesin,
}: {
  keputusan: StatusKyc;
  catatan: string;
  kekurangan: readonly string[];
  ditandaiMesin: readonly string[];
}) {
  return (
    <div className="space-y-2 py-2 text-xs">
      {catatan.trim() === "" ? (
        <p className="text-muted-foreground">Tanpa catatan.</p>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
          Catatan: “{catatan.trim()}”
        </p>
      )}
      {kekurangan.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          Isian/berkas yang masih kurang: {kekurangan.join(", ")}.
        </p>
      )}
      {keputusan === "VERIFIED" && ditandaiMesin.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          Pemeriksaan otomatis masih menandai: {ditandaiMesin.join("; ")}. Anda mengambil alih
          keputusan ini secara manual.
        </p>
      )}
      <p className="text-[11px] leading-5 text-muted-foreground">
        Keputusan dicatat server-side beserta waktu, aktor, alasan, dan versi aturan — dan tidak bisa
        dikirim dari perangkat mana pun tanpa hak admin ber-TOTP.
      </p>
    </div>
  );
}

/* ==========================================================================
 * Panel yang tersambung server
 * ========================================================================== */

/**
 * Tiga tombol keputusan utama. Kelasnya SENGAJA eksplisit supaya bobot
 * visualnya menandai tingkat risiko: Setujui = solid emerald, Minta Perbaikan =
 * outline amber, Tolak = ghost merah.
 */
const AKSI_UTAMA: Array<{ ke: StatusKyc; label: string; kelas: string }> = [
  {
    ke: "NEEDS_CORRECTION",
    label: "Minta Perbaikan",
    kelas: "border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-xl px-4 py-2 text-xs font-semibold",
  },
  {
    ke: "REJECTED",
    label: "Tolak KYC",
    kelas: "text-red-600 hover:bg-red-50 rounded-xl px-4 py-2 text-xs font-semibold",
  },
  {
    ke: "VERIFIED",
    label: "Setujui Verifikasi KYC",
    kelas:
      "bg-emerald-800 hover:bg-emerald-900 text-white font-semibold px-5 py-2 rounded-xl text-xs shadow-sm",
  },
];

export function KycPanel() {
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState<StatusKyc | null>(null);
  const [hasil, setHasil] = useState<FilterHasilKyc>("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [dipilih, setDipilih] = useState<Id<"users"> | null>(null);
  const [catatan, setCatatan] = useState("");
  const [konfirmasi, setKonfirmasi] = useState<StatusKyc | null>(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<TabDetail>("berkas");

  // Saringan dikirim apa adanya ke server; ia yang memutuskan hasilnya.
  const daftar = useQuery(api.kyc.daftarKycAdmin, {
    ...(status === null ? {} : { status }),
    ...(cari.trim() === "" ? {} : { cari: cari.trim() }),
    ...(hasil === "semua" ? {} : { hasil }),
    ...(dari === "" ? {} : { dari }),
    ...(sampai === "" ? {} : { sampai }),
  });
  const detail = useQuery(api.kyc.detailKycAdmin, dipilih === null ? "skip" : { userId: dipilih });
  const tinjau = useMutation(api.kyc.tinjauKyc);

  const rentang = rentangTanggal(dari, sampai);
  const filterRingkas: FilterKyc = { cari, status, hasil, dari: rentang.dari, sampai: rentang.sampai };

  const kosongkanFilter = () => {
    setCari(FILTER_KYC_KOSONG.cari);
    setStatus(FILTER_KYC_KOSONG.status);
    setHasil(FILTER_KYC_KOSONG.hasil);
    setDari("");
    setSampai("");
  };

  const pilihNasabah = (id: Id<"users">) => {
    setDipilih(id);
    setCatatan("");
    setGalat(null);
    setTab("berkas");
  };

  /** Kirim keputusan ke server — HANYA setelah dikonfirmasi petugas. */
  const putuskan = async (keputusan: StatusKyc) => {
    if (dipilih === null) return;
    setKonfirmasi(null);
    setBusy(true);
    setGalat(null);
    try {
      await tinjau({
        userId: dipilih,
        keputusan: keputusan as "VERIFIED" | "NEEDS_CORRECTION" | "REJECTED" | "REVERIFICATION_REQUIRED",
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      setCatatan("");
      toast.success(`Keputusan tersimpan: ${LABEL_STATUS_KYC[keputusan]}. Tercatat di audit trail.`);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Keputusan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const tujuan = detail === null || detail === undefined ? [] : tujuanSah(detail.status, "admin");
  const catatanCukup = catatan.trim().length >= 3;
  const cacah = daftar?.cacah ?? null;
  const totalSemua = cacah === null ? null : Object.values(cacah).reduce((t, n) => t + n, 0);

  /** Aturan mesin yang masih gagal / belum pasti — dipakai peringatan konfirmasi. */
  const ditandaiMesin =
    detail === null || detail === undefined || detail.keputusanOtomatis === null
      ? []
      : detail.keputusanOtomatis.aturan
          .filter((r) => r.status !== "lulus")
          .map((r) => r.judul);

  const detailSiap = detail !== null && detail !== undefined;

  return (
    <div className="animate-masuk flex flex-col gap-4 lg:h-[calc(100vh-100px)] lg:overflow-hidden">
      {/* ===== Split view 40% daftar : 60% rincian ===== */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ---------- KOLOM KIRI: daftar antrean ---------- */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Header kolom kiri: pencarian + saringan ringkas */}
          <div className="shrink-0 space-y-2.5 border-b border-slate-200 bg-slate-50/70 p-3">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="bg-white pl-9 pr-10"
                aria-label="Cari nasabah berdasarkan nama, email, atau kode nasabah"
                placeholder="Cari nama, email, atau kode nasabah…"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
              />
              {cari !== "" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Bersihkan pencarian"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setCari("")}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select
                value={status ?? SEMUA_STATUS}
                onValueChange={(v) => setStatus(v === SEMUA_STATUS ? null : (v as StatusKyc))}
              >
                <SelectTrigger className="w-full bg-white" aria-label="Saring menurut status KYC">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEMUA_STATUS}>
                    Semua status{totalSemua === null ? "" : ` (${totalSemua})`}
                  </SelectItem>
                  {URUTAN_SARING.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LABEL_STATUS_KYC[s]} {cacah === null ? "" : `(${cacah[s] ?? 0})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={hasil} onValueChange={(v) => setHasil(v as FilterHasilKyc)}>
                <SelectTrigger className="w-full bg-white" aria-label="Saring menurut hasil pemeriksaan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_HASIL_KYC.map((pilihan) => (
                    <SelectItem key={pilihan} value={pilihan}>
                      {LABEL_FILTER_HASIL_KYC[pilihan]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <Input
                  type="date"
                  aria-label="Diajukan dari tanggal"
                  value={dari}
                  max={sampai === "" ? undefined : sampai}
                  onChange={(e) => setDari(e.target.value)}
                  className="h-7 min-w-0 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
                <span className="text-[11px] text-muted-foreground">s/d</span>
                <Input
                  type="date"
                  aria-label="Diajukan sampai tanggal"
                  value={sampai}
                  min={dari === "" ? undefined : dari}
                  onChange={(e) => setSampai(e.target.value)}
                  className="h-7 min-w-0 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
              </div>
              {adaFilterKyc(filterRingkas) && (
                <Button type="button" variant="outline" size="sm" onClick={kosongkanFilter}>
                  Kosongkan
                </Button>
              )}
            </div>

            <p className="text-[11px] tabular-nums text-muted-foreground">
              {daftar === undefined
                ? "Memuat…"
                : ringkasJumlahKyc(daftar.tampil, daftar.total)}
            </p>
          </div>

          {galat !== null && (
            <p
              role="alert"
              className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {galat}
            </p>
          )}

          {/* Daftar bergulir sendiri — tidak menggoyangkan kolom kanan */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {daftar === undefined ? (
              <SkeletonBarisDaftar baris={4} />
            ) : daftar.item.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-muted-foreground">
                {adaFilterKyc(filterRingkas) ? (
                  <>
                    Tidak ada pengajuan KYC yang cocok dengan {ringkasFilterKyc(filterRingkas).join(" dan ")}.
                    Kosongkan filter untuk melihat seluruh antrean.
                  </>
                ) : (
                  <>Belum ada pengajuan KYC pada status ini.</>
                )}
              </div>
            ) : (
              daftar.item.map((item) => (
                <BarisKyc
                  key={item.userId}
                  item={item}
                  aktif={item.userId === dipilih}
                  onPilih={pilihNasabah}
                />
              ))
            )}
          </div>
        </section>

        {/* ---------- KOLOM KANAN: rincian + keputusan ---------- */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-100px)]">
          {dipilih === null ? (
            /* Empty state: belum ada nasabah dipilih */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="relative flex size-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                <FileText className="size-7 text-slate-400" aria-hidden />
                <span className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-emerald-800 text-white">
                  <ShieldCheck className="size-3.5" aria-hidden />
                </span>
              </div>
              <p className="text-sm font-semibold text-navy">Belum ada pengajuan dipilih</p>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                Pilih satu pengajuan KYC di daftar sebelah kiri untuk melihat foto berkas, hasil OCR,
                data identitas, dan mengambil keputusan verifikasi.
              </p>
            </div>
          ) : detail === undefined ? (
            <p className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat rincian…
            </p>
          ) : detail === null ? (
            <p className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
              Baris KYC nasabah ini tidak ditemukan (mungkin akunnya sudah dihapus).
            </p>
          ) : (
            <>
              {/* STICKY ACTION HEADER — selalu terlihat, keputusan tanpa menggulir */}
              <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-navy">
                      {detail.namaLengkap ?? "Nasabah"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusKycBadge status={detail.status} />
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {detail.kodePeminjam ?? "tanpa kode nasabah"} · diajukan{" "}
                        {waktu(detail.diajukanPada)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {AKSI_UTAMA.map((aksi) => {
                      const sah = tujuan.includes(aksi.ke);
                      const butuhAlasan = keputusanWajibAlasan(aksi.ke);
                      const terkunci = busy || !sah || (butuhAlasan && !catatanCukup);
                      return (
                        <Button
                          key={aksi.ke}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(aksi.kelas, !sah && "opacity-50")}
                          disabled={terkunci}
                          title={
                            !sah
                              ? "Tidak sah dari status KYC saat ini"
                              : butuhAlasan && !catatanCukup
                                ? "Isi catatan minimal 3 karakter"
                                : undefined
                          }
                          onClick={() => setKonfirmasi(aksi.ke)}
                        >
                          {aksi.ke === "VERIFIED" ? (
                            <CheckCircle2 className="mr-1.5 size-3.5" />
                          ) : (
                            <ShieldAlert className="mr-1.5 size-3.5" />
                          )}
                          {aksi.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Catatan keputusan — ikut menempel agar tak perlu menggulir */}
                {tujuan.length === 0 ? (
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    Tidak ada keputusan yang sah dari status ini. Nasabah harus mengajukan lebih dulu
                    (status Menunggu peninjauan).
                  </p>
                ) : (
                  <div className="mt-3 space-y-1">
                    <Input
                      className="bg-white"
                      aria-label="Catatan keputusan"
                      placeholder="Catatan keputusan (wajib untuk menolak / minta perbaikan)"
                      value={catatan}
                      maxLength={300}
                      onChange={(e) => setCatatan(e.target.value)}
                    />
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      Status VERIFIED berarti identitas sudah diperiksa — bukan persetujuan pinjaman
                      dan bukan bukti dana cair.
                      {tujuan.some((ke) => keputusanWajibAlasan(ke)) && !catatanCukup
                        ? " Menolak atau meminta perbaikan wajib disertai catatan (minimal 3 karakter) — nasabah membacanya."
                        : ""}
                    </p>
                  </div>
                )}
              </header>

              {/* SUB-TAB INTERNAL — hanya area baca yang bergulir */}
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as TabDetail)}
                className="flex min-h-0 flex-1 flex-col gap-0"
              >
                <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-4 pt-3">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                    <TabsTrigger value="berkas" className="gap-1.5 text-xs">
                      <FileWarning className="size-3.5" />
                      Foto Berkas &amp; OCR
                    </TabsTrigger>
                    <TabsTrigger value="identitas" className="gap-1.5 text-xs">
                      <ShieldCheck className="size-3.5" />
                      Data Identitas Nasabah
                    </TabsTrigger>
                    <TabsTrigger value="sistem" className="gap-1.5 text-xs">
                      <History className="size-3.5" />
                      Hasil Sistem &amp; Riwayat
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                  <TabsContent value="berkas" className="mt-0 space-y-4">
                    <KycDokumenRingkas detail={detail} />
                    <KycOcrRingkas detail={detail} />
                    <KycKetidaksesuaianRingkas detail={detail} />
                  </TabsContent>

                  <TabsContent value="identitas" className="mt-0 space-y-4">
                    <KycIdentitasRingkas detail={detail} />
                    <KycOtpRingkas detail={detail} />
                  </TabsContent>

                  <TabsContent value="sistem" className="mt-0 space-y-4">
                    <section className="space-y-2">
                      <JudulBagian
                        ikon={ShieldCheck}
                        judul="Persetujuan pemrosesan data (PDP)"
                        keterangan="Dasar pemrosesan yang wajib ada sebelum identitas diverifikasi."
                      />
                      <KycPdpRingkas detail={detail} />
                    </section>
                    <KycOtomatisRingkas detail={detail} />
                    {detail.aturanTerverifikasi !== null && (
                      <section className="space-y-2">
                        <JudulBagian
                          ikon={ScrollText}
                          judul="Dasar aturan putusan"
                          keterangan="Versi aturan yang dipakai saat putusan terakhir diambil."
                        />
                        <KycAturanRingkas detail={detail} />
                      </section>
                    )}
                    <KycRiwayatSection detail={detail} />
                    <KycAuditSection detail={detail} />
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </section>
      </div>

      {/* ===== Dialog konfirmasi satu keputusan ===== */}
      <AlertDialog
        open={konfirmasi !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setKonfirmasi(null);
        }}
      >
        <AlertDialogContent>
          {konfirmasi !== null && detailSiap && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {judulKonfirmasiKeputusan(konfirmasi, detail.namaLengkap ?? "nasabah ini")}
                </AlertDialogTitle>
                <AlertDialogDescription>{akibatKeputusanKyc(konfirmasi)}</AlertDialogDescription>
              </AlertDialogHeader>
              <IsiKonfirmasiKeputusan
                keputusan={konfirmasi}
                catatan={catatan}
                kekurangan={detail.kekurangan}
                ditandaiMesin={ditandaiMesin}
              />
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                // Dialog tidak ditutup oleh Radix dulu: keputusan dikirim dulu ke
                // server, dan penutupan terjadi di `putuskan()`/galat.
                e.preventDefault();
                if (konfirmasi !== null) void putuskan(konfirmasi);
              }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Ya, simpan keputusan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
