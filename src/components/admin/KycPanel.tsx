import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  FileText,
  FileWarning,
  History,
  Keyboard,
  ListFilter,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  BandingkanBukti,
  BingkaiBukti,
  CHECKLIST_KYC_KOSONG,
  ChecklistVerifikasi,
  checklistKurang,
  checklistLengkap,
  PenampilBukti,
  type BuktiTampil,
  type IdChecklistKyc,
} from "@/components/admin/BuktiKyc";
import { StatusKycBadge } from "@/components/StatusKycBadge";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useMediaQuery } from "@/hooks/use-media-query";
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

/**
 * Lebar kolom daftar antrean (px).
 *
 * Daftar ini alat bantu memilih, bukan isi pekerjaannya: yang diperiksa adalah
 * bukti di kolom detail. Karena itu lebarnya tetap 320px (bukan bagian dari grid
 * proporsional) supaya kolom detail selalu mengambil sisa lebar layar.
 */
const LEBAR_DAFTAR_KYC = 320;

/** Ambang layar untuk mengubah daftar antrean menjadi laci yang bisa dibuka. */
const KUERI_LAYAR_SEMPIT_KYC = "(max-width: 1279px)";

/** Nilai awal saringan status: "Perlu ditinjau" adalah antrean kerja sebenarnya. */
const STATUS_AWAL_KYC: StatusKyc = "PENDING_REVIEW";

/** Pintasan papan tombol di ruang verifikasi (hanya saat fokus tidak di isian). */
export const PINTASAN_KYC = [
  { tombol: "J", arti: "berikutnya" },
  { tombol: "K", arti: "sebelumnya" },
  { tombol: "A", arti: "setujui" },
  { tombol: "R", arti: "minta perbaikan" },
  { tombol: "X", arti: "tolak" },
] as const;

/**
 * Potong di TENGAH, bukan di ujung.
 *
 * Kode pengajuan punya makna di dua ujungnya (awalan jenis + nomor urut, akhiran
 * penanda hari), jadi memotong ekor akan menyembunyikan justru bagian yang
 * membedakan dua pengajuan. Hasilnya selalu satu baris tanpa pecah kata.
 */
export function potongTengah(teks: string, maks: number): string {
  if (teks.length <= maks) return teks;
  const sisa = maks - 1;
  const depan = Math.ceil(sisa / 2);
  const belakang = sisa - depan;
  return `${teks.slice(0, depan)}…${teks.slice(teks.length - belakang)}`;
}

/** Sudah berapa lama satu pengajuan menunggu tindakan. */
export function lamaMenunggu(diajukanPada: number | null, sekarang: number): string {
  if (diajukanPada === null) return "tanggal pengajuan tidak tercatat";
  const menit = Math.floor(Math.max(0, sekarang - diajukanPada) / 60_000);
  if (menit < 1) return "baru diajukan";
  if (menit < 60) return `menunggu ${menit} menit`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `menunggu ${jam} jam`;
  return `menunggu ${Math.floor(jam / 24)} hari`;
}

/** Tanggal acuan urutan antrean: kapan diajukan, atau kapan terakhir diperbarui. */
function acuanAntrean(item: ItemKycTampil): number {
  return item.diajukanPada ?? item.diperbaruiPada;
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
  const kode = item.kodePeminjam;
  return (
    <button
      type="button"
      onClick={() => onPilih(item.userId)}
      aria-pressed={aktif}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
        aktif
          ? "border-emerald-700 bg-emerald-50/60"
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      {/* Baris 1: nama nasabah + status KYC-nya. */}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-5 text-navy">
          {item.nama}
        </p>
        <StatusKycBadge status={item.status} />
      </div>

      {/* Baris 2: email + kode pengajuan. Dua nasabah bernama sama dibedakan
          dari sini, dan kode panjang tidak pernah pecah baris. */}
      <div className="flex items-center justify-between gap-2 text-[11px] leading-4">
        <span className="min-w-0 truncate text-muted-foreground">
          {item.email ?? "tanpa email"}
        </span>
        <span
          className="shrink-0 whitespace-nowrap font-mono text-[10px] text-slate-600"
          title={kode ?? "tanpa kode nasabah"}
        >
          {kode === null ? "tanpa kode nasabah" : potongTengah(kode, 18)}
        </span>
      </div>

      {/* Baris 3: tanda masalah (atau berkas lengkap) + lama menunggu. */}
      {/* Nada lencana mengikuti ARTINYA, bukan seleranya: merah = ada masalah
          yang menghalangi keputusan, hijau = pemeriksaan dasar sudah beres.
          Kuning/amber disimpan untuk status "menunggu" (lencana status di atas). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Tanda nada={berkasKurang ? "merah" : "hijau"}>
          <FileWarning className="size-3.5 shrink-0" aria-hidden />
          {berkasKurang ? `${item.kekurangan.length} berkas/isi kurang` : "berkas lengkap"}
        </Tanda>
        {!item.nomorWhatsAppTerbukti && (
          <Tanda nada="merah">
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
          <Tanda nada="merah">
            <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> aturan lama
          </Tanda>
        )}
        {mesin !== null && (
          <Tanda nada={mesin.diterapkan === true ? "hijau" : "abu"}>
            mesin: {LABEL_STATUS_KYC[mesin.keputusan]}
            {mesin.diterapkan === true ? "" : " (tidak diterapkan)"}
          </Tanda>
        )}
        <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] tabular-nums text-slate-600">
          {lamaMenunggu(item.diajukanPada, Date.now())}
        </span>
      </div>
    </button>
  );
}

/** Kendali saringan satu daftar antrean KYC (dipakai kolom tetap & laci). */
type KendaliDaftarKyc = {
  cari: string;
  setCari: (nilai: string) => void;
  status: StatusKyc | null;
  setStatus: (nilai: StatusKyc | null) => void;
  hasil: FilterHasilKyc;
  setHasil: (nilai: FilterHasilKyc) => void;
  dari: string;
  setDari: (nilai: string) => void;
  sampai: string;
  setSampai: (nilai: string) => void;
  kosongkan: () => void;
};

/**
 * Isi daftar antrean: satu baris pencarian + status + tombol saringan lanjutan,
 * lalu daftar pengajuan yang bergulir sendiri.
 *
 * Dipisah dari `KycPanel` karena markup yang sama dipakai dua tempat: kolom
 * tetap di layar lebar dan laci di layar sempit. Yang berubah hanya pembungkusnya,
 * jadi saringan tidak mungkin berbeda antara keduanya.
 */
function IsiDaftarKyc({
  kendali,
  daftar,
  item,
  filterRingkas,
  dipilih,
  onPilih,
  idPrefix,
}: {
  kendali: KendaliDaftarKyc;
  daftar: DaftarKyc | undefined;
  /**
   * Baris yang ditampilkan, SUDAH terurut oleh `KycPanel` (terlama dulu).
   * Dikirim terpisah dari `daftar` supaya urutan tampilan dan urutan pintasan
   * J/K tidak pernah berbeda.
   */
  item: readonly ItemKycTampil[];
  filterRingkas: FilterKyc;
  dipilih: Id<"users"> | null;
  onPilih: (userId: Id<"users">) => void;
  /** Awalan `id` agar label & kontrol laci tidak bentrok dengan kolom tetap. */
  idPrefix: string;
}) {
  const saringanLanjutAktif = kendali.hasil !== "semua" || kendali.dari !== "" || kendali.sampai !== "";
  const totalSemua =
    daftar === undefined ? null : Object.values(daftar.cacah).reduce((t, n) => t + n, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-slate-200 bg-slate-50/70 p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              className="h-9 bg-white pl-8 pr-8 text-xs"
              aria-label="Cari nasabah berdasarkan nama, email, atau kode pengajuan"
              placeholder="Cari nama, email, atau kode…"
              value={kendali.cari}
              onChange={(e) => kendali.setCari(e.target.value)}
            />
            {kendali.cari !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bersihkan pencarian"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 text-slate-600"
                onClick={() => kendali.setCari("")}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>

          <Select
            value={kendali.status ?? SEMUA_STATUS}
            onValueChange={(v) => kendali.setStatus(v === SEMUA_STATUS ? null : (v as StatusKyc))}
          >
            <SelectTrigger
              className="h-9 w-[10.5rem] shrink-0 bg-white px-2.5 text-xs"
              aria-label="Saring menurut status KYC"
              title={
                kendali.status === null ? "Semua status" : LABEL_STATUS_KYC[kendali.status]
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="min-w-[15rem]">
              <SelectItem value={SEMUA_STATUS}>
                Semua status{totalSemua === null ? "" : ` (${totalSemua})`}
              </SelectItem>
              {URUTAN_SARING.map((s) => (
                <SelectItem key={s} value={s}>
                  {LABEL_STATUS_KYC[s]} {daftar === undefined ? "" : `(${daftar.cacah[s] ?? 0})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="relative shrink-0"
                aria-label="Saringan lanjutan: hasil pemeriksaan dan rentang tanggal diajukan"
                title="Saringan lanjutan"
              >
                <ListFilter className="size-4" aria-hidden />
                {saringanLanjutAktif && (
                  <span
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-700"
                    aria-hidden
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3 p-3">
              <div className="space-y-1.5">
                <label
                  className="text-[11px] font-semibold text-slate-800"
                  htmlFor={`${idPrefix}-hasil`}
                >
                  Hasil pemeriksaan
                </label>
                <Select
                  value={kendali.hasil}
                  onValueChange={(v) => kendali.setHasil(v as FilterHasilKyc)}
                >
                  <SelectTrigger
                    id={`${idPrefix}-hasil`}
                    className="w-full bg-white text-xs"
                    aria-label="Saring menurut hasil pemeriksaan"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="min-w-[19rem]">
                    {FILTER_HASIL_KYC.map((pilihan) => (
                      <SelectItem key={pilihan} value={pilihan}>
                        {LABEL_FILTER_HASIL_KYC[pilihan]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-800">
                  Rentang tanggal diajukan
                </p>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    aria-label="Diajukan dari tanggal"
                    value={kendali.dari}
                    max={kendali.sampai === "" ? undefined : kendali.sampai}
                    onChange={(e) => kendali.setDari(e.target.value)}
                    className="h-8 min-w-0 flex-1 text-xs"
                  />
                  <span className="shrink-0 text-[11px] text-slate-600">s/d</span>
                  <Input
                    type="date"
                    aria-label="Diajukan sampai tanggal"
                    value={kendali.sampai}
                    min={kendali.dari === "" ? undefined : kendali.dari}
                    onChange={(e) => kendali.setSampai(e.target.value)}
                    className="h-8 min-w-0 flex-1 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <p className="text-[11px] leading-4 text-slate-600">
                  {adaFilterKyc(filterRingkas) ? "Saringan aktif." : "Belum ada saringan."}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={kendali.kosongkan}>
                  Kosongkan
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <p className="text-[11px] tabular-nums text-slate-600">
          {daftar === undefined
            ? "Memuat antrean…"
            : `${ringkasJumlahKyc(daftar.tampil, daftar.total)} · urut terlama dulu`}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {daftar === undefined ? (
          <SkeletonBarisDaftar baris={4} />
        ) : item.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-700">
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
          item.map((baris) => (
            <BarisKyc
              key={baris.userId}
              item={baris}
              aktif={baris.userId === dipilih}
              onPilih={onPilih}
            />
          ))
        )}
      </div>
    </div>
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
/**
 * BUKTI BERKAS KTP/selfie/bukti penghasilan: grid besar bersisi rasio asli,
 * penampil ber-zoom, dan mode bandingkan KTP ↔ selfie.
 *
 * Ini pekerjaan inti petugas, jadi fotonya yang paling banyak mendapat ruang:
 * minimal dua kolom, area bukti minimal 60% tinggi layar, dan setiap foto bisa
 * dibuka besar untuk melihat detail kecil (NIK, tanda tangan, kecocokan wajah).
 * Metadata pemeriksaan server tetap ditulis di bawah tiap foto supaya tidak ada
 * foto yang tampak "sudah dinilai" tanpa dasarnya.
 */
function KycDokumenRingkas({ detail }: { detail: DetailKycTampil }) {
  const [bandingkan, setBandingkan] = useState(false);
  const [penampil, setPenampil] = useState<number | null>(null);

  const slot = detail.berkas.map((meta) => {
    const url =
      meta.slot === "ktp"
        ? detail.url.ktp
        : meta.slot === "selfie"
          ? detail.url.selfie
          : detail.url.buktiPenghasilan;
    const bukti: BuktiTampil = {
      id: meta.slot,
      label: meta.label,
      url,
      lebar: meta.lebar,
      tinggi: meta.tinggi,
    };
    return { meta, bukti, url };
  });
  const siapDibuka = slot.filter((s) => s.url !== null).map((s) => s.bukti);
  const ktp = slot.find((s) => s.meta.slot === "ktp");
  const selfie = slot.find((s) => s.meta.slot === "selfie");
  const bisaBandingkan =
    ktp !== undefined && ktp.url !== null && selfie !== undefined && selfie.url !== null;

  const buka = (id: string) => {
    const posisi = siapDibuka.findIndex((b) => b.id === id);
    if (posisi >= 0) setPenampil(posisi);
  };

  // Berpindah pengajuan mengembalikan alat bantu ke keadaan awal: daftar berkas
  // dan mode tampilan milik pengajuan sebelumnya tidak boleh terbawa.
  useEffect(() => {
    setPenampil(null);
    setBandingkan(false);
  }, [detail.userId]);

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

      {/* Satu baris alat: cara membuka penampil + mode bandingkan. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-4 text-slate-700">
          Klik foto untuk membuka penampil ber-zoom: gulir untuk zoom, tombol putar 90°, seret untuk
          menggeser, dan panah untuk pindah berkas.
        </p>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Pembungkus `span` supaya alasan terkuncinya tetap terbaca
                  meski tombolnya `disabled` (tombol mati tidak memicu tooltip). */}
              <span className="shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant={bandingkan ? "sukses" : "outline"}
                  aria-pressed={bandingkan}
                  disabled={!bisaBandingkan}
                  onClick={() => setBandingkan((b) => !b)}
                >
                  <Columns2 className="size-4" aria-hidden />
                  Bandingkan KTP ↔ Selfie
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-[11px] leading-5">
              {bisaBandingkan
                ? "Tampilkan foto KTP dan selfie berdampingan."
                : "Butuh foto KTP dan selfie yang sudah diunggah."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {bandingkan && ktp !== undefined && selfie !== undefined ? (
        <BandingkanBukti kiri={ktp.bukti} kanan={selfie.bukti} />
      ) : (
        <div className="grid min-h-[60dvh] grid-cols-2 content-start gap-3">
          {slot.map(({ meta, bukti, url }) => (
            <div key={meta.slot} className="flex min-w-0 flex-col gap-1">
              <BingkaiBukti
                bukti={bukti}
                onBuka={url === null ? undefined : () => buka(bukti.id)}
              />
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
          ))}
        </div>
      )}
      <p className="text-[10px] leading-4 text-muted-foreground">
        Dokumen ini privat: URL-nya bertanda tangan & berumur pendek, hanya keluar untuk admin
        ber-TOTP, dan tidak pernah ditampilkan ke pendana atau pemantau.
      </p>

      {/* Penampil ber-zoom: daftar berkasnya hanya yang benar-benar bisa dibuka. */}
      <PenampilBukti
        daftar={siapDibuka}
        indeks={penampil}
        onPindah={setPenampil}
        onTutup={() => setPenampil(null)}
      />
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
const AKSI_UTAMA: Array<{
  ke: StatusKyc;
  label: string;
  kelas: string;
  ikon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  {
    ke: "NEEDS_CORRECTION",
    label: "Minta Perbaikan",
    kelas:
      "border border-amber-400 bg-white text-amber-800 hover:bg-amber-50 rounded-xl px-4 py-2 text-xs font-semibold",
    ikon: FileWarning,
  },
  {
    ke: "REJECTED",
    label: "Tolak KYC",
    kelas:
      "border-2 border-red-600 bg-white text-red-700 hover:bg-red-50 rounded-xl px-4 py-2 text-xs font-semibold",
    ikon: ShieldAlert,
  },
  {
    ke: "VERIFIED",
    label: "Setujui Verifikasi KYC",
    kelas:
      "bg-emerald-800 hover:bg-emerald-900 text-white font-semibold px-5 py-2 rounded-xl text-xs shadow-sm",
    ikon: CheckCircle2,
  },
];

/**
 * `dipilihAwal` hanya dipakai uji render (harness merender ke string, sehingga
 * efek "buka pengajuan terlama" tidak pernah berjalan di sana). Di aplikasi,
 * panel ini selalu dipanggil tanpa prop.
 */
export function KycPanel({ dipilihAwal = null }: { dipilihAwal?: Id<"users"> | null } = {}) {
  const [cari, setCari] = useState("");
  // Bawaannya "Perlu ditinjau": itu antrean kerja petugas. Pengajuan yang masih
  // "Sedang diisi" (belum diajukan nasabah) tidak ikut tampil sampai petugas
  // mengubah saringannya sendiri.
  const [status, setStatus] = useState<StatusKyc | null>(STATUS_AWAL_KYC);
  const [hasil, setHasil] = useState<FilterHasilKyc>("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [dipilih, setDipilih] = useState<Id<"users"> | null>(dipilihAwal);
  const [catatan, setCatatan] = useState("");
  const [catatanSalah, setCatatanSalah] = useState(false);
  const [checklist, setChecklist] = useState<Record<IdChecklistKyc, boolean>>(CHECKLIST_KYC_KOSONG);
  const [konfirmasi, setKonfirmasi] = useState<StatusKyc | null>(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<TabDetail>("berkas");
  const [daftarDilipat, setDaftarDilipat] = useState(false);
  const [laciTerbuka, setLaciTerbuka] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  const layarSempit = useMediaQuery(KUERI_LAYAR_SEMPIT_KYC);

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

  const kosongkanFilter = useCallback(() => {
    setCari(FILTER_KYC_KOSONG.cari);
    setStatus(FILTER_KYC_KOSONG.status);
    setHasil(FILTER_KYC_KOSONG.hasil);
    setDari("");
    setSampai("");
  }, []);

  /**
   * Buka satu pengajuan. Catatan, checklist, dan galat selalu direset: itu milik
   * pengajuan yang sedang dibuka, bukan milik ruang kerja. Checklist keputusan
   * sebelumnya tidak boleh ikut mencentang pengajuan berikutnya.
   */
  const pilihNasabah = useCallback((id: Id<"users">) => {
    setDipilih(id);
    setCatatan("");
    setCatatanSalah(false);
    setChecklist(CHECKLIST_KYC_KOSONG);
    setGalat(null);
    setTab("berkas");
  }, []);

  /**
   * Urutan antrean: TERLAMA dulu.
   *
   * Server mengirim yang terbaru lebih dulu (bawaan untuk pemantauan), tetapi
   * pekerjaan petugas adalah membereskan yang paling lama menunggu. Pengurutan
   * ini murni tampilan atas baris yang sudah dikirim server; tidak ada baris yang
   * ditambah atau disembunyikan di sini.
   */
  const itemAntrean = useMemo(
    () => [...(daftar?.item ?? [])].sort((a, b) => acuanAntrean(a) - acuanAntrean(b)),
    [daftar],
  );

  const indeksTerpilih = useMemo(
    () => itemAntrean.findIndex((i) => i.userId === dipilih),
    [itemAntrean, dipilih],
  );

  // Bukti pengajuan TERLAMA dibuka sendiri supaya petugas tidak menatap layar
  // kosong. Berlaku juga saat pengajuan yang sedang dibuka keluar dari antrean
  // (baru saja diputuskan, atau tersaring keluar): pilihan tidak boleh mengunci
  // panel pada baris yang tidak ada lagi di daftar.
  useEffect(() => {
    if (itemAntrean.length === 0) return;
    if (dipilih !== null && itemAntrean.some((i) => i.userId === dipilih)) return;
    pilihNasabah(itemAntrean[0].userId);
  }, [dipilih, itemAntrean, pilihNasabah]);

  const pindahKe = useCallback(
    (selisih: number) => {
      const posisi = itemAntrean.findIndex((i) => i.userId === dipilih);
      if (posisi < 0) return;
      const tujuan = posisi + selisih;
      if (tujuan < 0 || tujuan >= itemAntrean.length) return;
      setLaciTerbuka(false);
      pilihNasabah(itemAntrean[tujuan].userId);
    },
    [dipilih, itemAntrean, pilihNasabah],
  );

  /** Kirim keputusan ke server — HANYA setelah dikonfirmasi petugas. */
  const putuskan = async (keputusan: StatusKyc) => {
    if (dipilih === null) return;
    // Penerus dihitung SEBELUM keputusan dikirim: setelah tersimpan, pengajuan
    // ini bisa keluar dari saringan (mis. saringan "Perlu ditinjau"), sehingga
    // posisinya tidak lagi bisa dicari di daftar.
    const berikutnya = itemAntrean[indeksTerpilih + 1]?.userId ?? null;
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
      setCatatanSalah(false);
      setChecklist(CHECKLIST_KYC_KOSONG);
      toast.success(`Keputusan tersimpan: ${LABEL_STATUS_KYC[keputusan]}. Tercatat di audit trail.`);
      if (berikutnya !== null) pilihNasabah(berikutnya);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Keputusan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const tujuan = detail === null || detail === undefined ? [] : tujuanSah(detail.status, "admin");
  const statusSaatIni = detail === null || detail === undefined ? null : detail.status;
  const catatanCukup = catatan.trim().length >= 3;
  const checklistSiap = checklistLengkap(checklist);
  const checklistKurangItem = checklistKurang(checklist);
  const cacah = daftar?.cacah ?? null;
  const totalSemua = cacah === null ? null : Object.values(cacah).reduce((t, n) => t + n, 0);

  const ubahChecklist = (id: IdChecklistKyc, tercentang: boolean) =>
    setChecklist((nilai) => ({ ...nilai, [id]: tercentang }));

  /**
   * Minta konfirmasi satu keputusan, atau jelaskan kenapa belum bisa.
   *
   * Catatan yang kurang TIDAK mematikan tombolnya: petugas justru perlu bisa
   * menekan Tolak/Minta Perbaikan untuk menandai kolom catatan merah. Yang
   * benar-benar dikunci hanya yang tidak sah dari status sekarang dan Setujui
   * dengan checklist wajib belum lengkap.
   */
  const mintaKonfirmasi = useCallback(
    (ke: StatusKyc) => {
      const sah = statusSaatIni === null ? [] : tujuanSah(statusSaatIni, "admin");
      if (busy || !sah.includes(ke)) return;
      if (keputusanWajibAlasan(ke) && catatan.trim().length < 3) {
        setCatatanSalah(true);
        return;
      }
      if (ke === "VERIFIED" && !checklistLengkap(checklist)) return;
      setCatatanSalah(false);
      setKonfirmasi(ke);
    },
    [busy, catatan, checklist, statusSaatIni],
  );

  /**
   * Pintasan papan tombol ruang verifikasi.
   *
   * Diabaikan saat fokus berada di isian (petugas sedang menulis catatan) dan
   * saat ada dialog terbuka (konfirmasi keputusan atau penampil berkas), supaya
   * huruf yang diketik tidak pernah berubah menjadi keputusan.
   */
  useEffect(() => {
    const tangani = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const sasaran = e.target as HTMLElement | null;
      if (
        sasaran !== null &&
        (sasaran.tagName === "INPUT" ||
          sasaran.tagName === "TEXTAREA" ||
          sasaran.tagName === "SELECT" ||
          sasaran.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]') !== null) return;
      const tombol = e.key.toUpperCase();
      if (tombol === "J") {
        e.preventDefault();
        pindahKe(1);
      } else if (tombol === "K") {
        e.preventDefault();
        pindahKe(-1);
      } else if (tombol === "A" || tombol === "R" || tombol === "X") {
        e.preventDefault();
        mintaKonfirmasi(tombol === "A" ? "VERIFIED" : tombol === "R" ? "NEEDS_CORRECTION" : "REJECTED");
      }
    };
    document.addEventListener("keydown", tangani);
    return () => document.removeEventListener("keydown", tangani);
  }, [mintaKonfirmasi, pindahKe]);

  /** Salin kode pengajuan tanpa harus menyeleksi teks monospace-nya. */
  const salinKode = async (kode: string | null) => {
    if (kode === null) return;
    try {
      await navigator.clipboard.writeText(kode);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 2000);
    } catch {
      setGalat("Kode pengajuan tidak bisa disalin otomatis. Salin manual dari daftar antrean.");
    }
  };

  /** Aturan mesin yang masih gagal / belum pasti — dipakai peringatan konfirmasi. */
  const ditandaiMesin =
    detail === null || detail === undefined || detail.keputusanOtomatis === null
      ? []
      : detail.keputusanOtomatis.aturan
          .filter((r) => r.status !== "lulus")
          .map((r) => r.judul);

  const detailSiap = detail !== null && detail !== undefined;

  /** Alasan kecil yang ditulis di samping tombol yang sedang terkunci. */
  const alasanNonaktif: string[] = [];
  if (detailSiap && tujuan.length === 0) {
    alasanNonaktif.push(
      "Tidak ada keputusan yang sah dari status ini. Nasabah harus mengajukan lebih dulu (status Menunggu peninjauan).",
    );
  }

  const kendali: KendaliDaftarKyc = {
    cari,
    setCari,
    status,
    setStatus,
    hasil,
    setHasil,
    dari,
    setDari,
    sampai,
    setSampai,
    kosongkan: kosongkanFilter,
  };

  return (
    <div className="animate-masuk flex flex-col gap-3 lg:h-[calc(100dvh-8.5rem)] lg:overflow-hidden">
      {/* ===== Baris ringkas: pintasan antrean (kiri) + cacah antrean (kanan).
          Kartu judul modul sengaja tidak diulang di sini: namanya sudah ada di
          breadcrumb kepala panel, dan tinggi layar lebih berharga untuk bukti. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={indeksTerpilih <= 0}
            onClick={() => pindahKe(-1)}
            aria-label="Pengajuan sebelumnya (pintasan K)"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Sebelumnya
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={indeksTerpilih < 0 || indeksTerpilih >= itemAntrean.length - 1}
            onClick={() => pindahKe(1)}
            aria-label="Pengajuan berikutnya (pintasan J)"
          >
            Berikutnya
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <span className="text-[11px] tabular-nums text-slate-600">
            {indeksTerpilih >= 0
              ? `Pengajuan ${indeksTerpilih + 1} dari ${itemAntrean.length}`
              : itemAntrean.length === 0
                ? "Antrean kosong"
                : "Belum ada pengajuan dipilih"}
          </span>
          {layarSempit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-haspopup="dialog"
              onClick={() => setLaciTerbuka(true)}
            >
              <ListFilter className="size-4" aria-hidden />
              Daftar antrean
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={daftarDilipat}
              onClick={() => setDaftarDilipat((v) => !v)}
            >
              {daftarDilipat ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
              {daftarDilipat ? "Tampilkan daftar" : "Lipat daftar"}
            </Button>
          )}
        </div>
        <p className="text-xs font-medium tabular-nums text-slate-700" aria-live="polite">
          {cacah === null
            ? "Memuat antrean…"
            : `${totalSemua ?? 0} pengajuan · ${cacah.PENDING_REVIEW ?? 0} perlu ditinjau`}
        </p>
      </div>

      {/* ===== Daftar antrean 320px (bisa dilipat) : rincian mengambil sisa lebar ===== */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-1 gap-3",
          !layarSempit && !daftarDilipat && "xl:grid-cols-[320px_minmax(0,1fr)]",
        )}
      >
        {/* ---------- KOLOM KIRI: daftar antrean ---------- */}
        <section
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
            layarSempit || daftarDilipat ? "hidden" : "hidden xl:flex",
          )}
        >
          <IsiDaftarKyc
            kendali={kendali}
            daftar={daftar}
            item={itemAntrean}
            filterRingkas={filterRingkas}
            dipilih={dipilih}
            onPilih={pilihNasabah}
            idPrefix="kolom"
          />

        </section>

        {/* ---------- KOLOM KANAN: rincian + keputusan ---------- */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {dipilih === null ? (
            /* Empty state: belum ada nasabah dipilih */
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <div className="relative flex size-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                <FileText className="size-6 text-slate-500" aria-hidden />
                <span className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-emerald-800 text-white">
                  <ShieldCheck className="size-3.5" aria-hidden />
                </span>
              </div>
              <p className="text-sm font-semibold text-navy">Belum ada pengajuan dipilih</p>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                Pilih satu pengajuan KYC di daftar antrean untuk melihat foto berkas, hasil OCR, data
                identitas, dan mengambil keputusan verifikasi.
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
              {/* KEPALA RINGKAS satu baris: nama, status, kode (bisa disalin), tanggal. */}
              <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="min-w-0 truncate text-sm font-semibold text-navy">
                    {detail.namaLengkap ?? "Nasabah"}
                  </p>
                  <StatusKycBadge status={detail.status} className="shrink-0" />
                  <span className="flex min-w-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 pl-1.5 pr-0.5">
                    <code
                      className="truncate font-mono text-[11px] text-slate-700"
                      title={detail.kodePeminjam ?? "tanpa kode nasabah"}
                    >
                      {detail.kodePeminjam === null
                        ? "tanpa kode nasabah"
                        : potongTengah(detail.kodePeminjam, 20)}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-6"
                      aria-label="Salin kode pengajuan"
                      title="Salin kode pengajuan"
                      onClick={() => void salinKode(detail.kodePeminjam)}
                    >
                      {tersalin ? (
                        <Check className="size-3.5 text-emerald-800" aria-hidden />
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                    </Button>
                  </span>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-600">
                    diajukan {waktu(detail.diajukanPada)}
                  </span>
                </div>
                {galat !== null && (
                  <p role="alert" className="mt-1 text-[11px] leading-4 text-red-700">
                    {galat}
                  </p>
                )}
              </header>

              {/* SUB-TAB INTERNAL — hanya area baca yang bergulir */}
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(v as TabDetail)}
                className="flex min-h-0 flex-1 flex-col gap-0"
              >
                <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-2 pt-2">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
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

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {/* Bukti di KIRI, hasil OCR di KANAN: petugas mencocokkan teks
                      mesin dengan fotonya tanpa berpindah tab. */}
                  <TabsContent value="berkas" className="mt-0">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
                      <div className="min-w-0">
                        <KycDokumenRingkas detail={detail} />
                      </div>
                      <aside className="min-w-0 space-y-3">
                        <KycOcrRingkas detail={detail} />
                        <KycKetidaksesuaianRingkas detail={detail} />
                      </aside>
                    </div>
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

              {/* ===== BAR AKSI: checklist, catatan, dan tiga keputusan. Menempel
                  di bawah panel sehingga selalu terlihat tanpa menggulir. ===== */}
              <footer className="sticky bottom-0 z-20 shrink-0 space-y-2 border-t border-slate-200 bg-white p-3 shadow-[0_-2px_10px_rgba(15,23,42,0.06)] lg:static">
                <ChecklistVerifikasi
                  nilai={checklist}
                  onUbah={ubahChecklist}
                  nonaktif={busy || tujuan.length === 0}
                />

                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[15rem] flex-1">
                    <label
                      className="text-[11px] font-semibold text-slate-800"
                      htmlFor="catatan-keputusan-kyc"
                    >
                      Catatan keputusan{" "}
                      {tujuan.some((ke) => keputusanWajibAlasan(ke))
                        ? "(wajib untuk Tolak / Minta Perbaikan)"
                        : "(opsional)"}
                    </label>
                    <Input
                      id="catatan-keputusan-kyc"
                      className={cn(
                        "mt-1 h-9 bg-white text-xs",
                        catatanSalah &&
                          "border-red-600 focus-visible:border-red-700 focus-visible:ring-red-600/30",
                      )}
                      aria-invalid={catatanSalah || undefined}
                      aria-describedby={catatanSalah ? "pesan-catatan-kyc" : undefined}
                      placeholder="Catatan keputusan (nasabah membaca ini)"
                      value={catatan}
                      maxLength={300}
                      onChange={(e) => {
                        setCatatan(e.target.value);
                        if (e.target.value.trim().length >= 3) setCatatanSalah(false);
                      }}
                    />
                    {catatanSalah && (
                      <p
                        id="pesan-catatan-kyc"
                        role="alert"
                        className="mt-1 text-[11px] font-semibold leading-4 text-red-700"
                      >
                        {catatan.trim() === ""
                          ? "Catatan wajib diisi"
                          : "Catatan wajib diisi (minimal 3 karakter)"}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {AKSI_UTAMA.map((aksi) => {
                      const sah = tujuan.includes(aksi.ke);
                      const checklistMengunci = aksi.ke === "VERIFIED" && !checklistSiap;
                      const terkunci = busy || !sah || checklistMengunci;
                      const alasan = busy
                        ? "Menunggu keputusan sebelumnya selesai disimpan."
                        : !sah
                          ? "Tidak sah dari status KYC saat ini."
                          : checklistMengunci
                            ? `Checklist wajib belum lengkap: ${checklistKurangItem.join(", ")}.`
                            : null;
                      const Ikon = aksi.ikon;
                      return (
                        <TooltipProvider key={aksi.ke} delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* Pembungkus `span` supaya alasan terkunci tetap
                                  terbaca saat tombolnya nonaktif. */}
                              <span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className={cn(aksi.kelas, !sah && "opacity-60")}
                                  disabled={terkunci}
                                  aria-disabled={terkunci}
                                  onClick={() => mintaKonfirmasi(aksi.ke)}
                                >
                                  <Ikon className="mr-1.5 size-3.5" aria-hidden />
                                  {aksi.label}
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64 text-[11px] leading-5">
                              {alasan ??
                                `Kirim keputusan: ${aksi.label}. Ada dialog konfirmasi sebelum tersimpan.`}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>

                {/* Microcopy yang tidak boleh hilang: VERIFIED bukan persetujuan pinjaman. */}
                <p className="text-[11px] leading-4 text-slate-600">
                  Status VERIFIED berarti identitas sudah diperiksa — bukan persetujuan pinjaman dan
                  bukan bukti dana cair.
                </p>

                {alasanNonaktif.length > 0 && (
                  <ul className="space-y-0.5 text-[11px] leading-4 text-slate-700">
                    {alasanNonaktif.map((alasan) => (
                      <li key={alasan}>{alasan}</li>
                    ))}
                  </ul>
                )}

                <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <Keyboard className="size-3.5 shrink-0" aria-hidden />
                  Pintasan: {PINTASAN_KYC.map((p) => `${p.tombol} ${p.arti}`).join(" · ")}
                </p>
              </footer>
            </>
          )}
        </section>
      </div>

      {/* Laci daftar antrean untuk layar < 1280px. Isinya sama dengan kolom tetap. */}
      <Sheet open={laciTerbuka} onOpenChange={setLaciTerbuka}>
        <SheetContent side="left" className="flex w-[min(92vw,22rem)] flex-col gap-0 p-0">
          <SheetHeader className="border-b border-slate-200 px-3 py-2 text-left">
            <SheetTitle className="text-sm text-navy">Daftar antrean KYC</SheetTitle>
            <SheetDescription className="text-[11px] leading-4 text-slate-600">
              Pilih satu pengajuan untuk membukanya di panel detail.
            </SheetDescription>
          </SheetHeader>
          <IsiDaftarKyc
            kendali={kendali}
            daftar={daftar}
            item={itemAntrean}
            filterRingkas={filterRingkas}
            dipilih={dipilih}
            onPilih={(id) => {
              pilihNasabah(id);
              setLaciTerbuka(false);
            }}
            idPrefix="laci"
          />
        </SheetContent>
      </Sheet>

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
