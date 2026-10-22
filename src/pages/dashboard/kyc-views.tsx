import { useAction, useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CreditCard,
  HeartHandshake,
  IdCard,
  Info,
  Loader2,
  Lock,
  MapPin,
  PencilLine,
  Phone,
  Play,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { UnggahDokumen, type DokumenTerunggah } from "@/components/admin/pengajuan-manual/UnggahDokumen";
import { KameraLive } from "@/components/kyc/KameraLive";
import { PindaiKtpOcr } from "@/components/kyc/PindaiKtpOcr";
import { PengajuanCepatSection } from "./pengajuan-cepat-views";
import type { DataKtp } from "@/lib/kycOcr";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP } from "@/components/ui/input-otp";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { penghasilanDariTeks } from "@/lib/dataDiri";
import { kelompokkanDigit } from "@/lib/money";
import {
  galatTahapKyc,
  ID_TAHAP_KYC,
  kekuranganLokalTahap,
  LABEL_SLOT_BERKAS,
  LABEL_STATUS_TAHAP,
  maskNik,
  maskRekening,
  maskWhatsApp,
  petunjukTahap,
  progresKyc,
  statusTahapKyc,
  tahapDariKekurangan,
  tahapDisarankan,
  tahapKyc,
  type BerkasKyc,
  type IdTahapKyc,
  type IsianKycLengkap,
  type OpsiStatusTahap,
  type StatusTahapKyc,
} from "@/lib/kycTahapan";
import {
  bolehTransisi,
  isKycVerified,
  KETERANGAN_STATUS_KYC,
  keteranganNomorWa,
  LABEL_STATUS_KYC,
  keputusanWajibAlasan,
  ringkasStatusKyc,
  type StatusKyc,
} from "@/lib/kycStatus";
import { normalisasiNomorWa } from "@/lib/otpWa";
import {
  pesanButuhPersetujuan,
  pesanVersiPersetujuanBerubah,
  POIN_PERSETUJUAN_KYC,
  RINGKASAN_PERSETUJUAN_KYC,
  VERSI_PERSETUJUAN_KYC,
} from "@/lib/persetujuanKyc";
import {
  bersihkanIsian,
  ringkasPemulihan,
  type IsianDraftKyc,
  type KunciDraftKyc,
} from "@/lib/draftKyc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useDraftKyc } from "@/hooks/useDraftKyc";
import { useMobileLifecycle } from "@/hooks/useMobileLifecycle";
import {
  simpanStempelOtp,
  bacaStempelOtp,
  hapusStempelOtp,
  keputusanTampilanOtp,
  sisaDetikDariServer,
  auditOtpEvent,
  type OtpResumeData,
} from "@/lib/otpResume";

/**
 * MODUL KYC, antarmuka nasabah.
 *
 * Alurnya berjenjang supaya data sensitif tidak diminta sekaligus:
 * 1) persetujuan pemrosesan data → 2) data identitas → 3) foto KTP →
 * 4) selfie dengan KTP → 5) nomor WhatsApp → 6) alamat → 7) informasi pendukung.
 *
 * Aturan yang dipegang di sini (semuanya juga dijaga server, lihat
 * `convex/kyc.ts`):
 * - **Persetujuan lebih dulu.** Tahap 2–7 terkunci selama server belum mencatat
 *   persetujuan; server juga menolak menyimpan isian/berkas apa pun tanpa itu.
 * - **Progres dari server.** Status, kelengkapan, dan keputusan petugas selalu
 *   dibaca dari `kycSaya`, antarmuka tidak pernah menyimpulkan sendiri, dan
 *   status "Terverifikasi" hanya muncul bila backend mengirimkannya.
 * - **Privasi di tampilan.** NIK, nomor WhatsApp, dan nomor rekening hanya
 *   ditampilkan bertopeng (`maskNik` dan kawan-kawan) di ringkasan; nilai utuh
 *   hanya ada di isian yang sedang diketik pemiliknya. Tidak ada data pribadi
 *   yang masuk URL, `console`, atau pesan notifikasi, halaman ini tidak pernah
 *   menulis ke `location`/`console`, dan pesan yang ditampilkan hanya kalimat
 *   dari server.
 * - **Gagal dengan jelas.** Setiap kegagalan (simpan, unggah, ajukan) tampil
 *   sebagai alert berisi pesan apa adanya dari server, dengan tombol ulang; bila
 *   penyebabnya persetujuan, pengguna diantar kembali ke tahap 1.
 */

type DataKyc = FunctionReturnType<typeof api.kyc.kycSaya>;
type RiwayatKyc = DataKyc["riwayat"][number];

/** Bentuk riwayat yang diterima bagian tampilan murni (dipakai uji render). */
export type RiwayatKycTampil = RiwayatKyc;

/** Terjemahan kode alasan terstruktur → kalimat untuk manusia. */
/* Pasca-paparan: perilaku `useMobileLifecycle`, resume OTP, dan pemulihan progres.
 * Ditulis di sini supaya cukup satu render test (lihat `kyc-views.render.test.tsx`).
 * -------------------------------------------------------------------------- */
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

function waktu(ms: number | null): string {
  if (ms === null) return "Belum ada";
  return new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Jam:menit lokal bentuk `HH.mm`, untuk indikator simpan otomatis. */
function jamMenit(ms: number): string {
  return new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Pelaku pada riwayat, dalam kata yang dipakai nasabah sehari-hari.
 *
 * `aktorLabel` tidak dipakai: isinya bisa memuat email atau id internal petugas,
 * dan nasabah tidak butuh tahu siapa orangnya — cukup dari pihak mana perubahan
 * itu datang.
 */
export function labelAktorKyc(aktor: string): string {
  return aktor === "nasabah" ? "Anda" : aktor === "admin" ? "Petugas" : "Sistem";
}

/**
 * Kemajuan 3 tahap besar: nomor tahap yang sedang diisi, berapa tahap yang sudah
 * lengkap, dan persennya. Satu-satunya sumber angka bagi penghitung "Tahap X
 * dari 3", supaya tidak ada dua hitungan berbeda di layar yang sama.
 *
 * Sebuah tahap dihitung lengkap hanya bila SELURUH langkah di dalamnya lengkap —
 * aturannya sengaja sama dengan bilah 3 tahap di atasnya.
 */
export function progresStageKyc(
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>,
  aktif: IdTahapKyc,
): { nomor: 1 | 2 | 3; lengkap: number; total: 3; persen: number } {
  const lengkap = STAGE_KYC.filter(
    (stage) => ringkasStatusStage(statusPerTahap, stage.nomor) === "lengkap",
  ).length;
  return {
    nomor: stageUntukTahap(aktif),
    lengkap,
    total: 3,
    persen: Math.round((lengkap / 3) * 100),
  };
}

/**
 * Riwayat pemeriksaan baru berguna setelah pengajuan keluar dari pengisian.
 *
 * Selama statusnya "Sedang diisi" tidak ada keputusan petugas untuk dibaca, jadi
 * kartunya hanya memakan ruang di bawah formulir yang masih panjang. Setelah
 * diajukan, riwayatnya justru yang paling dicari nasabah.
 */
export function tampilkanRiwayatKyc(status: StatusKyc): boolean {
  return status !== "IN_PROGRESS" && status !== "NOT_STARTED";
}

/* ==========================================================================
 * Bagian tampilan MURNI (bisa dirender & diuji tanpa Convex)
 * ========================================================================== */

/**
 * Jeda tombol "Kirim kode" sebelum boleh ditekan lagi (detik), ketentuan
 * produk. Server punya pembatas sendiri yang lebih panjang, jadi hitung mundur
 * ini adalah lapisan UX, bukan pengganti penjagaan di server.
 */
const DETIK_UBAH_KIRIM_ULANG_OTP = 30;

/**
 * Jeda sebelum isian yang baru diketik disimpan sendiri (ms).
 *
 * Cukup lama agar nasabah tidak memicu satu simpanan per huruf, cukup pendek
 * agar indikator "Tersimpan otomatis" terasa langsung.
 */
const AUTOSAVE_DIAM_MS = 1200;

/* ==========================================================================
 * STEPPER TIGA STAGE (bagian tampilan MURNI)
 * ========================================================================== */

/**
 * Peta langkah KYC ke 3 stage besar.
 *
 * Kenapa dipetakan, bukan mengganti `TAHAPAN_KYC`: urutan, syarat, dan transisi
 * status tetap milik `lib/kycTahapan.ts` & `lib/kycStatus.ts`. Peta ini HANYA
 * lapisan navigasi di atasnya, sehingga mengubah tampilan tidak bisa mengubah
 * aturan pengajuan.
 *
 * Urutannya sengaja mengikuti alur data: kontak & OTP lebih dulu (petugas butuh
 * nomor aktif), lalu identitas visual (KTP + selfie), terakhir rekening &
 * finansial sebagai data pencairan.
 *
 * Penamaan: `stage` hanya nama di dalam kode. Di antarmuka kata yang dipakai
 * selalu "tahap", supaya nasabah tidak berhadapan dengan dua istilah untuk hal
 * yang sama.
 */
export const STAGE_KYC: ReadonlyArray<{
  nomor: 1 | 2 | 3;
  judul: string;
  ringkas: string;
  tahap: readonly IdTahapKyc[];
}> = [
  {
    nomor: 1,
    judul: "Kontak & OTP",
    ringkas: "Persetujuan pemrosesan data, identitas, dan nomor WhatsApp aktif.",
    tahap: ["persetujuan", "identitas", "whatsapp"],
  },
  {
    nomor: 2,
    judul: "Live KTP & Selfie",
    ringkas: "Foto KTP dan selfie diambil langsung dari kamera aplikasi.",
    tahap: ["ktp", "selfie"],
  },
  {
    nomor: 3,
    // Judul ini ikut berubah saat kontak darurat masuk ke stage 3: "Rekening &
    // Finansial" tidak lagi mewakili isinya, dan label yang tidak cocok dengan
    // isinya membuat nasabah salah menebak di mana harus mengisi alamat.
    judul: "Alamat & Rekening",
    ringkas: "Alamat tinggal, kontak darurat, penghasilan, dan rekening pencairan.",
    tahap: ["alamat", "darurat", "pendukung"],
  },
];

/** Stage yang memuat sebuah langkah (1–3); dipakai menentukan posisi & navigasi. */
export function stageUntukTahap(id: IdTahapKyc): 1 | 2 | 3 {
  const stage = STAGE_KYC.find((s) => s.tahap.includes(id));
  return stage?.nomor ?? 1;
}

/** Semua langkah dalam satu stage, sesuai urutan `STAGE_KYC`. */
export function tahapStage(nomor: 1 | 2 | 3): readonly IdTahapKyc[] {
  return STAGE_KYC.find((s) => s.nomor === nomor)?.tahap ?? [];
}

/** Definisi satu stage (judul, ringkasan, dan langkah-langkahnya). */
export function stageKyc(nomor: 1 | 2 | 3): (typeof STAGE_KYC)[number] {
  return STAGE_KYC.find((s) => s.nomor === nomor) ?? STAGE_KYC[0];
}

/**
 * Ringkasan status SATU tahap dari status langkah-langkah di dalamnya.
 *
 * Dipakai bersama oleh bilah 3 tahap di sidebar, bilah lekat di ponsel, dan
 * lencana di kepala kartu tahap. Kalau tiap tempat menghitung sendiri, satu
 * layar bisa menyebut "Selesai" sementara layar lain menyebut "Belum diisi"
 * untuk tahap yang sama.
 */
export function ringkasStatusStage(
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>,
  nomor: 1 | 2 | 3,
): StatusTahapKyc {
  const statusLangkah = tahapStage(nomor).map((id) => statusPerTahap[id]);
  if (statusLangkah.includes("perlu-diperbaiki")) return "perlu-diperbaiki";
  return statusLangkah.every((s) => s === "lengkap") ? "lengkap" : "belum";
}

/**
 * Langkah pertama tahap BERIKUTNYA, atau `null` bila yang dibuka tahap terakhir.
 *
 * Tombol "Lanjut" memindahkan satu TAHAP, bukan satu langkah: seluruh isian
 * satu tahap ada di layar yang sama, jadi melangkah per isian hanya mengulang
 * layar yang baru saja diisi.
 */
export function tahapBerikutStage(aktif: IdTahapKyc): IdTahapKyc | null {
  const nomor = stageUntukTahap(aktif);
  if (nomor === 3) return null;
  return tahapStage((nomor + 1) as 2 | 3)[0] ?? null;
}

/** Langkah pertama tahap SEBELUMNYA, atau `null` bila sudah di tahap pertama. */
export function tahapSebelumStage(aktif: IdTahapKyc): IdTahapKyc | null {
  const nomor = stageUntukTahap(aktif);
  if (nomor === 1) return null;
  return tahapStage((nomor - 1) as 1 | 2)[0] ?? null;
}

/**
 * Menu tahap di sidebar hanya berguna selama KYC belum selesai: begitu identitas
 * terverifikasi, modulnya menampilkan halaman pengajuan cepat dan sidebar cukup
 * memuat menu layanan. Sebelum KYC dimulai pun belum ada tahap untuk dipilih.
 */
export function tampilkanMenuTahapKyc(status: StatusKyc): boolean {
  return status !== "NOT_STARTED" && !isKycVerified(status);
}

/**
 * Rekap menu tahap dari baris KYC yang TERSIMPAN: status tiap tahap, tahap yang
 * paling masuk akal dibuka, dan apakah tahapnya masih terkunci.
 *
 * Dipakai kolom sidebar, yang hanya memegang hasil query, jadi statusnya
 * mengikuti yang sudah tersimpan; draft yang belum disimpan bisa membuat modul
 * KYC di kolom isi tampak lebih maju daripada menunya.
 */
export function menuTahapKyc(data: {
  status: StatusKyc;
  kekurangan: readonly string[];
  persetujuanAktif: boolean;
  isian: IsianKycLengkap;
  dokumen: { ktpId: string | null; selfieKtpId: string | null; buktiPenghasilanId: string | null };
}): {
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>;
  tahapAktif: IdTahapKyc;
  terkunci: boolean;
} {
  const berkas: BerkasKyc = {
    ktp: data.dokumen.ktpId,
    selfie: data.dokumen.selfieKtpId,
    bukti: data.dokumen.buktiPenghasilanId,
  };
  const opsi: OpsiStatusTahap = {
    kekurangan: data.kekurangan,
    perluPerbaikan: data.status === "NEEDS_CORRECTION",
    persetujuanAktif: data.persetujuanAktif,
  };
  return {
    statusPerTahap: Object.fromEntries(
      ID_TAHAP_KYC.map((id) => [id, statusTahapKyc(id, data.isian, berkas, opsi)]),
    ) as Record<IdTahapKyc, StatusTahapKyc>,
    tahapAktif: tahapDisarankan(data.status, data.isian, berkas, opsi),
    terkunci: !data.persetujuanAktif,
  };
}

/**
 * Tahap yang dibuka bila sebuah stage dipilih dari bilah 3 stage: langkah
 * PERTAMA stage itu. `null` bila stage itu memang sedang dibuka — memilih stage
 * yang sudah aktif tidak boleh memindahkan pengguna ke langkah lain di dalamnya.
 */
export function tahapUntukPilihStage(nomor: 1 | 2 | 3, aktif: IdTahapKyc): IdTahapKyc | null {
  if (stageUntukTahap(aktif) === nomor) return null;
  return tahapStage(nomor)[0] ?? null;
}

/**
 * Bilah progres 3 tahap besar di atas wizard, menggantikan daftar langkah
 * memanjang sebagai navigasi utama.
 *
 * Status tiap stage diringkas dari langkah-langkah di dalamnya: "lengkap" hanya
 * bila SELURUH langkahnya lengkap; "perlu-diperbaiki" bila ada langkah yang
 * ditandai petugas; selebihnya "belum". Ringkasan ini sengaja dihitung dari
 * data yang sama dengan daftar detail, jadi dua tempat tidak bisa berbeda arti.
 *
 * Reflow (audit-005 #11): tiga kartu baru sejajar SEJAK `lg`. Di bawah itu
 * bilahnya menumpuk karena tiap kartu memuat dua sampai tiga baris teks, jadi
 * menjejerkannya pada 640px membuat nama tahap membungkus dan sulit dibaca.
 */
export function KycStepperTigaTahap({
  aktif,
  statusPerTahap,
  onPilih,
  terkunci,
  tumpuk = false,
}: {
  aktif: IdTahapKyc;
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>;
  /** Dipanggil dengan tahap yang harus dibuka; tak dipanggil bila stage sudah aktif. */
  onPilih: (id: IdTahapKyc) => void;
  /** true selama persetujuan belum tercatat (hanya stage 1 yang boleh dibuka). */
  terkunci: boolean;
  /** Tetap menumpuk di semua lebar: menu sidebar hanya selebar 16rem. */
  tumpuk?: boolean;
}) {
  const stageAktif = stageUntukTahap(aktif);
  return (
    <nav aria-label="Tahapan verifikasi KYC" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <ol className={cn("flex flex-col gap-2", !tumpuk && "lg:flex-row lg:items-stretch")}>
        {STAGE_KYC.map((stage) => {
          const ringkas = ringkasStatusStage(statusPerTahap, stage.nomor);
          const iniAktif = stage.nomor === stageAktif;
          const bolehDibuka = !terkunci || stage.nomor === 1;
          return (
            <li key={stage.nomor} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  const tujuan = tahapUntukPilihStage(stage.nomor, aktif);
                  if (tujuan !== null) onPilih(tujuan);
                }}
                disabled={!bolehDibuka}
                aria-current={iniAktif ? "step" : undefined}
                className={cn(
                  "flex h-full w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2",
                  iniAktif
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                  !bolehDibuka && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
                    ringkas === "lengkap"
                      ? "bg-emerald-800 text-white"
                      : iniAktif
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {ringkas === "lengkap" ? <CheckCircle2 className="size-4" /> : stage.nomor}
                </span>
                <span className="min-w-0 flex-1">
                  {/* Satu string, bukan beberapa node teks: label tahap harus
                      terbaca utuh (termasuk oleh pembaca layar) sebagai
                      "Tahap 1: Kontak & OTP". */}
                  <span className="block text-xs font-semibold text-slate-900">
                    {`Tahap ${stage.nomor}: ${stage.judul}`}
                  </span>
                  {/* Tanpa hitungan langkah: penghitung "Tahap X dari 3" di atas
                      dan kartu sisa wajib sudah menyebut kemajuannya, dan angka
                      ketiga (mis. "1/3 langkah") membuat nasabah menghitung sendiri. */}
                  <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                    {ringkas === "lengkap"
                      ? "Selesai"
                      : ringkas === "perlu-diperbaiki"
                        ? "Perlu perbaikan dari petugas"
                        : iniAktif
                          ? "Sedang diisi"
                          : "Belum diisi"}
                  </span>
                  {iniAktif && (
                    <span className="mt-1 block text-[10px] leading-4 text-emerald-900">
                      {stage.ringkas}
                    </span>
                  )}
                </span>
                {!bolehDibuka && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Penanda bidang yang boleh dikosongkan.
 *
 * Yang menentukan bidang itu menghalangi pengajuan adalah aturan server
 * (`kekuranganKyc`), bukan bentuk labelnya. Tanpa penanda, nasabah mengisi
 * kolom yang tidak diminta atau ragu menekan simpan karena merasa belum lengkap.
 */
function PenandaOpsional() {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
      Opsional
    </span>
  );
}

/**
 * Judul satu LANGKAH di dalam kartu tahap.
 *
 * Satu tahap memuat dua sampai tiga langkah (mis. tahap 3 = alamat, kontak
 * darurat, informasi pendukung), jadi tiap rumpun isian perlu namanya sendiri —
 * tanpa itu nasabah hanya melihat satu kartu panjang tanpa penanda bagian mana
 * yang sedang diisi.
 *
 * Lencana keadaannya memakai `LABEL_STATUS_TAHAP` yang sama dengan lencana
 * tahap, sehingga tidak ada dua istilah untuk keadaan yang sama.
 */
function JudulLangkah({ id, status }: { id: IdTahapKyc; status: StatusTahapKyc }) {
  const langkah = tahapKyc(id);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h4 id={`kyc-langkah-${id}`} className="text-xs font-semibold text-foreground">
        {langkah.judul}
      </h4>
      {!langkah.wajib && <PenandaOpsional />}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          status === "lengkap"
            ? "bg-emerald-100 text-emerald-700"
            : status === "perlu-diperbaiki"
              ? "bg-amber-100 text-amber-800"
              : "bg-muted text-muted-foreground",
        )}
      >
        {LABEL_STATUS_TAHAP[status]}
      </span>
    </div>
  );
}

/**
 * Menu tahap KYC untuk kolom sidebar, tepat di bawah menu peran: bilah 3 tahap
 * yang selalu menumpuk.
 *
 * Isinya memakai komponen yang sama dengan navigasi di `KycSection`, jadi dua
 * tempat tidak bisa menampilkan tahap yang berbeda arti. Daftar langkah per
 * stage TIDAK diulang di sini: bilah 3 tahap sudah menjadi navigasinya, dan
 * daftar kedua di kolom sempit hanya membuat nasabah menebak mana yang ditekan.
 * Di bawah `lg` ia tidak dirender: sidebar menumpuk di atas formulir, dan kartu
 * tahap di sana hanya mendorong isian ke bawah layar.
 */
export function KycMenuSidebar({
  aktif,
  statusPerTahap,
  terkunci,
  onPilih,
}: {
  aktif: IdTahapKyc;
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>;
  terkunci: boolean;
  onPilih: (id: IdTahapKyc) => void;
}) {
  return (
    <section aria-label="Tahap verifikasi KYC" className="hidden lg:block">
      {/* Gaya label disamakan dengan judul grup menu di sidebar ("Admin",
          "Menu layanan") supaya kolom ini terbaca sebagai satu sistem menu. */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        Tahap verifikasi
      </p>
      <div className="mt-2.5">
        <KycStepperTigaTahap
          aktif={aktif}
          statusPerTahap={statusPerTahap}
          onPilih={onPilih}
          terkunci={terkunci}
          tumpuk
        />
      </div>
    </section>
  );
}

/**
 * Bilah tahap LEKAT untuk ponsel: satu baris "Tahap X dari 3" + bilah kemajuan +
 * tiga tombol tahap, menempel tepat di bawah bar atas (h-14).
 *
 * Kenapa terpisah dari `KycStepperTigaTahap`: di ponsel tiga kartu tahap yang
 * menumpuk memakan hampir sepertiga layar dan ikut tergulung ke atas begitu
 * isian mulai diisi, sehingga nasabah kehilangan jejak tahap mana yang sedang
 * dibuka. Bentuknya karena itu diringkas menjadi satu baris yang menempel, dan
 * sejak `lg` bilah ini hilang — di sana tahapnya sudah ada di kolom sidebar dan
 * penghitung di kartu status yang menggantikannya.
 *
 * Angka yang dipakai sama dengan penghitung di kartu status (`progresStageKyc`),
 * jadi dua tempat itu tidak bisa menyebut tahap yang berbeda.
 */
export function KycBilahTahapLekat({
  aktif,
  statusPerTahap,
  terkunci,
  onPilih,
}: {
  aktif: IdTahapKyc;
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>;
  /** true selama persetujuan belum tercatat (hanya tahap 1 yang boleh dibuka). */
  terkunci: boolean;
  /** Dipanggil dengan langkah pertama tahap yang dipilih. */
  onPilih: (id: IdTahapKyc) => void;
}) {
  const tahap = progresStageKyc(statusPerTahap, aktif);
  const stage = stageKyc(tahap.nomor);
  return (
    <div className="sticky top-14 z-20 -mx-3 border-b border-border bg-slate-50/95 px-3 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4 lg:hidden">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Tahap {tahap.nomor} dari 3</p>
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">{stage.judul}</p>
      </div>
      <Progress
        value={tahap.persen}
        aria-label={`Tahap verifikasi KYC: ${tahap.lengkap} dari 3 tahap selesai`}
        className="mt-1.5 h-1.5"
      />
      <ol className="mt-2 flex gap-1.5" aria-label="Tahapan verifikasi KYC">
        {STAGE_KYC.map((s) => {
          const ringkas = ringkasStatusStage(statusPerTahap, s.nomor);
          const iniAktif = s.nomor === tahap.nomor;
          const bolehDibuka = !terkunci || s.nomor === 1;
          return (
            <li key={s.nomor} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  const tujuan = tahapUntukPilihStage(s.nomor, aktif);
                  if (tujuan !== null) onPilih(tujuan);
                }}
                disabled={!bolehDibuka}
                aria-current={iniAktif ? "step" : undefined}
                className={cn(
                  "flex min-h-9 w-full items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2",
                  iniAktif
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  !bolehDibuka && "cursor-not-allowed opacity-60",
                )}
              >
                {/* Ikut ditandai agar tahap yang sudah selesai bisa dikenali
                    tanpa membuka kartunya satu per satu. */}
                {ringkas === "lengkap" && (
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                )}
                Tahap {s.nomor}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Judul modul + penghitung tunggal "Tahap X dari 3". */
export function KycStatusHeader({
  status,
  kekurangan,
  lengkap,
  tahapAktif,
  statusPerTahap,
  onBuka,
}: {
  status: StatusKyc;
  kekurangan: string[];
  lengkap: boolean;
  /** Langkah yang sedang dibuka; menentukan nomor tahap besarnya. */
  tahapAktif: IdTahapKyc;
  statusPerTahap: Record<IdTahapKyc, StatusTahapKyc>;
  /** Buka tahap yang menangani sebuah label kekurangan. */
  onBuka: (id: IdTahapKyc) => void;
}) {
  const tahap = progresStageKyc(statusPerTahap, tahapAktif);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <ShieldCheck className="size-4" aria-hidden /> Verifikasi identitas (KYC)
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {KETERANGAN_STATUS_KYC[status]}
          </p>
        </div>
        <StatusKycBadge status={status} />
      </div>

      {/* PENGHITUNG TUNGGAL (permintaan pemilik): "Tahap X dari 3" + bilahnya.
          Hitungan per langkah — "2 dari 8 tahap siap", "0/3 langkah" — dibuang:
          dengan tiga angka berbeda di layar, nasabah menghitung sendiri dan
          mengira harus mengisi delapan hal sebelum boleh mengirim. */}
      <div className="mt-3 hidden flex-wrap items-center gap-x-3 gap-y-2 lg:flex">
        <p className="text-xs font-semibold text-foreground">
          Tahap {tahap.nomor} dari {tahap.total}
        </p>
        <Progress
          value={tahap.persen}
          aria-label={`Tahap verifikasi KYC: ${tahap.lengkap} dari ${tahap.total} tahap selesai`}
          className="h-1.5 min-w-32 flex-1"
        />
        <p className="text-xs text-muted-foreground">{STAGE_KYC[tahap.nomor - 1]?.judul}</p>
      </div>
      <div className="mt-2">
        <p className="text-xs font-medium text-foreground">
          {lengkap
            ? "Lengkap, siap diajukan."
            : `${kekurangan.length} hal sebelum bisa diajukan.`}
        </p>
        {/* Tiap kekurangan menunjuk tahap yang menanganinya (peta
            `TAHAP_DARI_KEKURANGAN`), jadi nasabah bisa langsung menuju
            isiannya, bukan menebak tahap mana yang dimaksud. Label yang belum
            punya tahap tetap tampil, tetapi sebagai teks biasa. */}
        {!lengkap && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {kekurangan.map((item) => {
              const tujuan = tahapDariKekurangan(item);
              return (
                <li key={item}>
                  {tujuan === null ? (
                    <span className="inline-flex rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] leading-4 text-muted-foreground">
                      {item}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBuka(tujuan)}
                      aria-label={`${item}: buka ${tahapKyc(tujuan).judul}`}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-medium leading-4 text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {item}
                      <ArrowRight className="size-3" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Pil status KYC yang tampil di semua tab dashboard (di luar bagian KYC). */
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
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <StatusKycBadge status={status} />
      <span className="min-w-0 flex-1 text-xs leading-5 text-foreground">
        {ringkasStatusKyc(status)}
      </span>
      <span className="text-[11px] font-medium text-primary">
        {perluTindakan ? "Lanjutkan verifikasi →" : "Lihat Verifikasi KYC →"}
      </span>
    </button>
  );
}

/**
 * Baris aksi satu tahap: SATU tombol utama (emerald) plus tombol "Kembali",
 * umpan balik simpan otomatis di sebelahnya, dan satu baris "Sisa wajib" di
 * atasnya. Letaknya di AKHIR formulir, ikut alur halaman — bukan melayang di
 * dasar layar, karena bilah melayang itu menutupi isian yang sedang dibaca saat
 * halaman digulir. Tingginya 44px supaya nyaman ditekan dengan ibu jari, bukan
 * 36px seperti tombol lain.
 *
 * Tombol "Simpan progres" dihapus karena simpan berjalan sendiri (lihat efek
 * autosave di `KycSection`): tombol simpan manual hanya menambah satu pilihan
 * yang tidak mengubah apa pun. Tombol gerbang "Siap diajukan setelah N isian
 * lagi" juga dihapus — sisa wajibnya kini satu baris penuh yang bisa diklik.
 */
export function KycBarisAksi({
  busy,
  menyimpan,
  bolehKembali,
  tahapTerakhir,
  bolehLanjut,
  bolehAjukan,
  tampilkanAjukan,
  labelAjukan,
  sisaWajib,
  tersimpanPada,
  catatan,
  onSebelumnya,
  onLanjut,
  onAjukan,
  onBukaKurang,
  judulTujuan,
}: {
  busy: boolean;
  /** Sedang menyimpan progres (bukan aksi lain seperti verifikasi OTP). */
  menyimpan: boolean;
  /** false di tahap pertama: tidak ada tempat mundur. */
  bolehKembali: boolean;
  /** true di tahap terakhir: tombol utamanya "Ajukan verifikasi". */
  tahapTerakhir: boolean;
  bolehLanjut: boolean;
  bolehAjukan: boolean;
  /** false untuk status VERIFIED: tidak ada lagi yang perlu diajukan. */
  tampilkanAjukan: boolean;
  labelAjukan: string;
  /** Jumlah isian WAJIB yang masih menghalangi pengajuan. */
  sisaWajib: number;
  /**
   * Judul tahap yang menampung isian kurang, atau `null` bila tahap itu memang
   * yang sedang dibuka: menyebut tujuannya supaya baris sisa wajib tidak
   * memindahkan pengguna tanpa penjelasan.
   */
  judulTujuan: string | null;
  tersimpanPada: number | null;
  /** Kalimat keadaan yang perlu dijelaskan (mis. menunggu peninjauan). */
  catatan: string | null;
  onSebelumnya: () => void;
  onLanjut: () => void;
  onAjukan: () => void;
  onBukaKurang: () => void;
}) {
  // Satu tombol utama per layar: di tahap terakhir ia mengajukan, di tahap lain
  // ia melanjutkan. Labelnya ikut status, jadi nasabah tidak pernah menemukan
  // tombol yang pasti ditolak server.
  const pakaiAjukan = tahapTerakhir && tampilkanAjukan;
  const labelUtama = pakaiAjukan ? labelAjukan : "Lanjut";
  const bolehUtama = !busy && (pakaiAjukan ? bolehAjukan : bolehLanjut);
  return (
    <div className="mt-4 border-t border-border bg-card pt-3">
      {/* Sisa wajib WAJIB selalu terlihat (kriteria selesai) dan bisa diklik
          untuk melompat ke isian yang kurang. Dulu ini tombol Outline yang
          bersaing dengan aksi utama; sebagai satu baris penuh ia terbaca sebagai
          keterangan, bukan pilihan kedua. */}
      {sisaWajib > 0 && (
        <button
          type="button"
          onClick={onBukaKurang}
          className="mb-2 flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-left text-[11px] font-medium leading-4 text-amber-900 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>Sisa wajib: {sisaWajib} isian</span>
          {judulTujuan !== null && <span className="break-words">· buka {judulTujuan}</span>}
          <ArrowRight className="ml-auto size-3.5 shrink-0" aria-hidden />
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-1.5"
          disabled={busy || !bolehKembali}
          onClick={onSebelumnya}
        >
          <ArrowLeft className="size-4" /> Kembali
        </Button>

        <Button
          type="button"
          className="h-11 gap-1.5 rounded-xl bg-emerald-800 px-6 py-2.5 font-semibold text-white hover:bg-emerald-900"
          disabled={!bolehUtama}
          onClick={pakaiAjukan ? onAjukan : onLanjut}
        >
          {pakaiAjukan ? <ShieldCheck className="size-4" /> : <ArrowRight className="size-4" />}
          {labelUtama}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
        <span className="flex items-center gap-1.5" role="status" aria-live="polite">
          {menyimpan ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Menyimpan…
            </>
          ) : (
            <>
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
              {tersimpanPada === null
                ? "Belum ada isian tersimpan"
                : `Tersimpan otomatis ${jamMenit(tersimpanPada)}`}
            </>
          )}
        </span>
        {catatan !== null && (
          <span className="flex items-center gap-1.5">
            <PencilLine className="size-3.5 shrink-0" aria-hidden />
            {catatan}
          </span>
        )}
      </div>
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
      <p className="mt-1 opacity-80">Perbaiki pada tahap yang ditandai “Perlu diperbaiki”, lalu kirim ulang.</p>
    </div>
  );
}

/** Riwayat perubahan status, waktu, aktor, alasan, catatan. */
export function KycRiwayatList({ riwayat }: { riwayat: RiwayatKycTampil[] }) {
  if (riwayat.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground sm:p-5">
        Belum ada riwayat. Setiap perubahan status tercatat di sini lengkap dengan waktu, pelaku, dan
        alasannya.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold text-navy">Riwayat pemeriksaan</h3>
      <ol className="mt-3 space-y-3">
        {riwayat.map((item, index) => (
          <li key={`${item.waktu}-${index}`} className="flex gap-3">
            <span className="mt-1 flex size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                {item.dari === "-" ? "Baru" : LABEL_STATUS_KYC[item.dari as StatusKyc]}{" "}
                <ArrowRight className="inline size-3" aria-hidden />{" "}
                {LABEL_STATUS_KYC[item.ke as StatusKyc]}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {kalimatAlasan(item.alasan)} · oleh {labelAktorKyc(item.aktor)} · {waktu(item.waktu)}
              </p>
              {item.catatan !== null && (
                <p className="mt-1 rounded-lg bg-muted px-2 py-1 text-[11px] leading-4 text-foreground">
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

/**
 * Saran bank/e-wallet untuk kolom pencairan.
 *
 * Kolomnya tetap bebas diisi; daftar ini hanya mempercepat pengetikan dan
 * mengurangi salah ketik nama bank, yang membuat petugas tidak bisa mencocokkan
 * tujuan pencairan. Bank besar lebih dulu, lalu dompet digital.
 */
/**
 * Saran hubungan kontak darurat. Sama seperti daftar bank di bawah: hanya
 * mempercepat pengetikan, kolomnya tetap bebas diisi karena hubungan keluarga
 * tidak selalu punya satu kata yang pas.
 */
const SARAN_HUBUNGAN_DARURAT = [
  "Keluarga",
  "Pasangan",
  "Orang tua",
  "Anak",
  "Saudara",
  "Teman",
  "Rekan kerja",
] as const;

const SARAN_BANK_DAN_EWALLET = [
  "BCA",
  "BRI",
  "BNI",
  "Mandiri",
  "BSI",
  "BTN",
  "CIMB Niaga",
  "Permata",
  "Danamon",
  "Bank Jago",
  "DANA",
  "OVO",
  "GoPay",
  "ShopeePay",
  "LinkAja",
] as const;

/**
 * Saran sumber penghasilan untuk kolom tahap pendukung.
 *
 * Bentuk kolomnya sama dengan kolom bank di bawah: saran ketik, bukan pilihan
 * tertutup, karena satu orang sering punya lebih dari satu sumber (mis. gaji +
 * usaha sampingan) dan tidak semua pekerjaan punya satu nama baku. Daftarnya
 * sengaja memakai kata yang dipakai orang sehari-hari, bukan istilah kategori
 * kredit.
 */
const SARAN_SUMBER_PENGHASILAN = [
  "Gaji bulanan",
  "Usaha sendiri",
  "Freelance",
  "Dagang",
  "Hasil tani",
  "Buruh harian",
  "Pensiunan",
] as const;

/** Batas karakter catatan nasabah — dijaga di layar, server menerima teks apa pun. */
const MAKS_CATATAN_KYC = 500;

/**
 * Petunjuk foto sebagai akordeon tertutup: di tahap ini ruangnya dipakai lebih
 * dulu untuk mengunggah, dan isinya tetap satu sumber dengan `petunjukTahap`.
 */
export function KycPetunjukFoto({ tahapId }: { tahapId: IdTahapKyc }) {
  const petunjuk = petunjukTahap(tahapId);
  if (petunjuk.length === 0) return null;
  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-xl border border-border bg-muted/40 px-3"
    >
      <AccordionItem value="petunjuk" className="border-b-0">
        <AccordionTrigger className="py-2.5 text-xs font-semibold text-muted-foreground hover:no-underline">
          <span className="flex items-center gap-1.5">
            <Camera className="size-3.5" aria-hidden /> Petunjuk foto ({petunjuk.length} langkah)
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3 text-xs">
          <ul className="space-y-2">
            {petunjuk.map((poin, urutan) => (
              <li key={poin.judul} className="flex gap-2">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                  {urutan + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-foreground">
                    {poin.judul}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {poin.isi}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
            Aplikasi hanya memeriksa format (JPG/PNG/WEBP), ukuran, dan keterbacaan berkas. Keaslian
            KTP tidak ditentukan dari format atau kualitas gambar, penilaian akhir tetap pada
            petugas.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/**
 * Judul tahap yang menerima fokus setiap kali tahap berganti, supaya pengguna
 * keyboard/pembaca layar tidak tertinggal di kontrol tahap sebelumnya.
 *
 * Sengaja komponen terpisah: di `KycSection` ada cabang "sedang memuat" sebelum
 * JSX, dan hook yang ditulis setelah cabang seperti itu membuat jumlah hook
 * berbeda antara render termuat dan belum termuat, pelanggaran aturan hook.
 */
function JudulTahap({ nomor, judul }: { nomor: number; judul: string }) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [nomor, judul]);
  return (
    <h3
      id="kyc-tahap-judul"
      ref={ref}
      tabIndex={-1}
      className="text-sm font-semibold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {/* Tanpa nomor: judul ini menyebut LANGKAH mana yang dibuka, sementara
          nomor yang dibaca nasabah adalah "Tahap X dari 3" di atasnya. */}
      {judul}
      <span className="sr-only"> (tahap {nomor} dari 3)</span>
    </h3>
  );
}

/**
 * Penjadwal simpan otomatis formulir KYC.
 *
 * Komponen terpisah, bukan efek di dalam `KycSection`: `KycSection` sudah
 * memilih cabang "sedang memuat" sebelum formulirnya, jadi efek yang ditulis
 * setelah cabang itu membuat jumlah hook berbeda antara render belum-termuat
 * dan render termuat. React menolaknya ("Rendered more hooks than during the
 * previous render") begitu data server tiba. Sebagai komponen anak, hook di
 * sini baru dipasang bersama formulirnya, dan dilepas saat formulir tidak
 * ditampilkan.
 */
function AutosaveKyc({
  kunci,
  terkunci,
  busy,
  simpan,
}: {
  /** Stempel isian terakhir; `null` bila tidak ada draft yang perlu disimpan. */
  kunci: string | null;
  /** Persetujuan belum tercatat: server akan menolak simpanan. */
  terkunci: boolean;
  busy: boolean;
  simpan: () => Promise<unknown>;
}) {
  const terakhir = useRef<string | null>(null);
  // Fungsi simpan dibaca dari ref supaya efek penjadwal tidak diulang hanya
  // karena induknya render lagi dengan closure baru.
  const simpanTerbaru = useRef(simpan);
  useEffect(() => {
    simpanTerbaru.current = simpan;
  }, [simpan]);

  useEffect(() => {
    if (kunci === null) {
      terakhir.current = null;
      return;
    }
    if (terkunci || busy) return;
    if (terakhir.current === kunci) return;
    const timer = window.setTimeout(() => {
      terakhir.current = kunci;
      void simpanTerbaru.current();
    }, AUTOSAVE_DIAM_MS);
    return () => window.clearTimeout(timer);
  }, [kunci, terkunci, busy]);

  return null;
}

/* ==========================================================================
 * Bagian yang tersambung server
 * ========================================================================== */

/** Slot berkas yang dipakai antarmuka (nama pendek untuk kunci di `url`). */
type SlotBerkasUi = "ktp" | "selfie" | "bukti";

/**
 * Pratinjau berkas yang dipilih pengguna tetapi BELUM tersimpan di server.
 * `url` adalah URL objek lokal (`URL.createObjectURL`), hanya hidup di tab ini,
 * tidak pernah dikirim ke mana pun, dan dibersihkan saat berkas diganti atau
 * halaman ditinggalkan. `null` bila browser tidak mendukungnya.
 */
type PratinjauLokal = { url: string | null; nama: string };

/** Hasil unggahan satu slot yang belum disimpan ke baris KYC. */
type BerkasDraft = DokumenTerunggah & { file?: File };

/** Isian yang sudah disunting pengguna tetapi belum tersimpan. */
type DraftKyc = {
  /** Stempel data tersimpan saat draft dibuat, draft diabaikan bila server berubah. */
  stempel: string;
  isian: IsianKycLengkap;
  berkas: Record<SlotBerkasUi, BerkasDraft | null>;
};

export function KycSection({
  tahapPilihan: tahapPilihanAtas = null,
  onPilihTahap,
}: {
  /** Tahap yang dipilih dari menu sidebar; null berarti modul memilih sendiri. */
  tahapPilihan?: IdTahapKyc | null;
  /** Dipanggil saat tahap berganti, supaya menu sidebar ikut berpindah. */
  onPilihTahap?: (id: IdTahapKyc) => void;
} = {}) {
  const data = useQuery(api.kyc.kycSaya);
  const mulai = useMutation(api.kyc.mulaiKyc);
  const setujui = useMutation(api.kyc.catatPersetujuanKyc);
  const simpan = useMutation(api.kyc.simpanProgresKyc);
  const ajukan = useMutation(api.kyc.ajukanKyc);
  const buatUrl = useMutation(api.kyc.urlUnggahBerkasKyc);
  const periksa = useAction(api.berkasIdentitas.periksaIsiBerkasKyc);
  // OTP WhatsApp: satu-satunya jalur verifikasi nomor, dijalankan mesin OTP di
  // server (`convex/otpWhatsapp.ts`). Halaman ini tidak pernah memegang token
  // maupun memanggil gateway, hanya meminta kode dan mengirim kode yang diketik.
  const mintaOtp = useAction(api.otpWhatsapp.mintaOtpWa);
  const verifikasiOtp = useMutation(api.otpWhatsapp.verifikasiOtpWa);

  const [draft, setDraft] = useState<DraftKyc | null>(null);
  /** Pratinjau berkas yang baru dipilih (belum tersimpan) per slot. */
  const [pratinjau, setPratinjau] = useState<Partial<Record<SlotBerkasUi, PratinjauLokal>>>({});
  // Berkas KTP yang sedang dipilih, dipegang terpisah supaya OCR bisa dibaca
  // dari berkas asli di perangkat (tidak perlu bolak-balik ke storage).
  const [fileKtp, setFileKtp] = useState<File | null>(null);
  // Snapshot OCR KTP terakhir (hasil mesin, apa adanya). Dikirim bareng simpanan
  // supaya mesin keputusan otomatis di server bisa menilai keterbacaan & kecocokan
  // teks KTP, snapshot mewakili APA yang dibaca mesin, bukan yang dikoreksi.
  const [ocrKtp, setOcrKtp] = useState<{
    konfidensi: number;
    nik: string | null;
    nama: string | null;
    alamat: string | null;
  } | null>(null);
  const [tahapLokal, setTahapLokal] = useState<IdTahapKyc | null>(null);
  // Dua sumber: pilihan dari menu sidebar (diprop-kan pemanggil) dan pilihan di
  // dalam modul. Yang dari pemanggil menang bila ada, tapi modul tetap bisa
  // dipakai sendiri tanpa prop itu (mis. di luar dashboard).
  const tahapPilihan = tahapPilihanAtas ?? tahapLokal;
  const [centangSetuju, setCentangSetuju] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kodeOtp, setKodeOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpResumeStatus, setOtpResumeStatus] = useState<string | null>(null);
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  /** Sisa detik sebelum tombol "Kirim kode" boleh ditekan lagi (30 detik). */
  const [detikUlangOtp, setDetikUlangOtp] = useState(0);
  /** Slot yang sedang dibuka di kamera live; `null` = tidak ada kamera aktif. */
  const [kameraSlot, setKameraSlot] = useState<SlotBerkasUi | null>(null);
  /** Foto hasil kamera live, menunggu diproses lewat jalur unggah yang sama. */
  const [berkasKamera, setBerkasKamera] = useState<File | null>(null);
  /** Kolom yang dipulihkan dari draft localStorage, untuk memberi tahu pengguna. */
  const [kolomDipulihkan, setKolomDipulihkan] = useState<KunciDraftKyc[]>([]);
  /** Isian hasil gabungan draft (server selalu menang); null bila tak ada draft. */
  const [isianDipulihkan, setIsianDipulihkan] = useState<IsianDraftKyc | null>(null);
  /**
   * Menandai penyimpanan progres yang sedang berjalan, bukan semua aksi.
   * Baris aksi memakainya untuk menulis "Menyimpan…", dan itu tidak boleh
   * menyala saat pengguna sedang memverifikasi OTP atau mengunggah berkas.
   */
  const [menyimpan, setMenyimpan] = useState(false);
  /**
   * Nasabah TERVERIFIKASI bisa memilih melihat data KYC-nya sekali lagi.
   * Bawaannya `false`: wizard tujuh tahap disembunyikan dan yang tampil adalah
   * formulir pengajuan cepat satu halaman.
   */
  const [bukaDataKyc, setBukaDataKyc] = useState(false);

  // --- Draft lokal (anti-data-loss) ---
  // Kunci penyimpanan per pengguna. Tanpa pengguna yang diketahui, draft tidak
  // ditulis sama sekali, lebih baik kehilangan draft daripada mencampurnya
  // dengan akun lain di perangkat yang sama.
  const { user } = useAuth();
  const stempelAwal = data === undefined ? "" : `${data.adaBaris}:${data.diperbaruiPada ?? 0}`;
  const isianUntukDraft: IsianDraftKyc = bersihkanIsian(
    (draft !== null && draft.stempel.startsWith(stempelAwal) ? draft.isian : data?.isian) ?? {},
  );
  const { pulihkan: pulihkanDraft, bersihkan: bersihkanDraft } = useDraftKyc({
    userId: user?._id ?? "",
    isian: isianUntukDraft,
    // Selama persetujuan belum tercatat, formulir memang terkunci, tidak ada
    // yang perlu diamankan, dan menulis draft justru bisa memulihkan isian yang
    // belum boleh dipakai.
    aktif: data?.persetujuanAktif === true,
  });
  const sudahCobaPulih = useRef(false);
  /** Tahap pembuka: diisi sekali saat data tiba, lalu tidak dihitung ulang. */
  const tahapAwal = useRef<IdTahapKyc | null>(null);

  // Nilai terakhir pratinjau juga dipegang ref supaya URL objeknya bisa
  // dibersihkan saat komponen dilepas. Efek pembersih ini sengaja ditulis
  // SEBELUM cabang "sedang memuat" di bawah: kalau diletakkan sesudahnya,
  // jumlah hook berbeda antara render termuat dan belum termuat.
  const pratinjauRef = useRef<Partial<Record<SlotBerkasUi, PratinjauLokal>>>({});
  useEffect(() => {
    return () => {
      for (const item of Object.values(pratinjauRef.current)) {
        if (item !== undefined && item.url !== null) URL.revokeObjectURL(item.url);
      }
      pratinjauRef.current = {};
    };
  }, []);

  const { state: lifecycle, markRestored } = useMobileLifecycle();
  const lifecycleDeps = [
    lifecycle.isPageRestored,
    markRestored ?? (() => {}),
  ] as const;

  // --- Resume OTP (tidak ada OTP plaintext yang disimpan/dibaca di sini) ---
  // Stempel yang tersimpan hanya menyimpan `kind` + `purpose` + opsional
  // `sessionId`/`serverExpiresAt` yang diterima dari server, bukan kode OTP.
  const otpStempel = bacaStempelOtp("verifikasi_nomor");
  const otpKeputusan = keputusanTampilanOtp(otpStempel);
  const otpServerSisa = sisaDetikDariServer(otpStempel);

  // Saat halaman kembali (tab di-restore / kembali dari background), coba resume
  // status sesi OTP dari server. Jangan buat OTP session baru hanya karena halaman
  // kembali aktif; cukup tanyakan status yang tersimpan dan perbarui UI.
  useEffect(() => {
    if (!lifecycle.isPageRestored) return;

    if (otpKeputusan.adaStempel) {
      setOtpResumeStatus(
        otpKeputusan.serverKetahuiMasihBerlaku
          ? otpServerSisa !== null
            ? `Kode OTP masih berlaku (sekitar ${otpServerSisa} detik lagi).`
            : "Kode OTP masih berlaku (server belum menyatakan kedaluwarsa)."
          : otpKeputusan.serverKetahuiExpired
            ? "Kode OTP sudah kedaluwarsa. Silakan kirim kode baru."
            : "Sesi OTP ditemukan; harap verifikasi ulang kode.",
      );
      auditOtpEvent("OTP_SESSION_RESUMED", { adaStempel: true, tidakTahuExpiry: otpKeputusan.tidakTahuExpiry });
    } else {
      // Tidak ada sesi yang stempelnya tersimpan; halaman kembali ke kondisi
      // awal tanpa membuat sesi baru secara otomatis.
      auditOtpEvent("OTP_SESSION_RESUME_UNAVAILABLE", { adaStempel: false });
    }
  }, [...lifecycleDeps, otpKeputusan, otpServerSisa]);

  // --- Restore progres melihat dari server saat kembali ---
  // Progres sebenarnya selalu dibaca dari server (`data.isian` / `data.dokumen`).
  // Yang kita lakukan di sini hanyalah menampilkan notifikasi kecil kalau user
  // kembali ke halaman dan server sudah memiliki progres tersimpan, supaya user
  // tahu sesuatu tidak hilang.
  const adaProgresTersimpan =
    data?.adaBaris &&
    (data?.isian.namaLengkap !== null &&
      data?.isian.namaLengkap !== undefined &&
      data?.isian.namaLengkap !== "" ||
      data?.isian.nik !== null &&
      data?.isian.nik !== undefined &&
      data?.isian.nik !== "" ||
      data?.isian.nomorWhatsApp !== null &&
      data?.isian.nomorWhatsApp !== undefined &&
      data?.isian.nomorWhatsApp !== "" ||
      data?.isian.alamat !== null &&
      data?.isian.alamat !== undefined &&
      data?.isian.alamat !== "" ||
      data?.isian.pekerjaan !== null &&
      data?.isian.pekerjaan !== undefined &&
      data?.isian.pekerjaan !== "" ||
      data?.isian.sumberPenghasilan !== null &&
      data?.isian.sumberPenghasilan !== undefined &&
      data?.isian.sumberPenghasilan !== "" ||
      data?.isian.catatanPeminjam !== null &&
      data?.isian.catatanPeminjam !== undefined &&
      data?.isian.catatanPeminjam !== "" ||
      data?.isian.namaKontakDarurat !== null &&
      data?.isian.namaKontakDarurat !== undefined &&
      data?.isian.namaKontakDarurat !== "" ||
      data?.isian.nomorKontakDarurat !== null &&
      data?.isian.nomorKontakDarurat !== undefined &&
      data?.isian.nomorKontakDarurat !== "" ||
      data?.isian.hubunganKontakDarurat !== null &&
      data?.isian.hubunganKontakDarurat !== undefined &&
      data?.isian.hubunganKontakDarurat !== "" ||
      data?.dokumen.ktpId !== null &&
      data?.dokumen.ktpId !== undefined &&
      data?.dokumen.ktpId !== "" ||
      data?.dokumen.selfieKtpId !== null &&
      data?.dokumen.selfieKtpId !== undefined &&
      data?.dokumen.selfieKtpId !== "" ||
      data?.dokumen.buktiPenghasilanId !== null &&
      data?.dokumen.buktiPenghasilanId !== undefined &&
      data?.dokumen.buktiPenghasilanId !== "");

  useEffect(() => {
    if (!lifecycle.isPageRestored) return;
    if (!adaProgresTersimpan) return;

    setRestoredNote("Progress Anda berhasil dipulihkan.");
    auditOtpEvent("KYC_DRAFT_RESTORED", { adaProgres: true });
    markRestored?.();    }, [
      ...lifecycleDeps,
      adaProgresTersimpan,
    ]);

  // --- Pulihkan draft SEKALI, saat baris KYC dari server pertama diketahui ---
  // Dijalankan lewat efek (bukan saat render) supaya render ganda di mode ketat
  // tidak membuang hasil pemulihan, dan hanya sekali supaya ketikan pengguna
  // sesudahnya tidak pernah ditimpa draft.
  useEffect(() => {
    if (sudahCobaPulih.current || data === undefined) return;
    sudahCobaPulih.current = true;
    if (!data.persetujuanAktif) return;
    const hasil = pulihkanDraft(bersihkanIsian(data.isian));
    if (hasil.dipulihkan.length === 0) return;
    setIsianDipulihkan(hasil.isian);
    setKolomDipulihkan(hasil.dipulihkan);
    auditOtpEvent("KYC_DRAFT_LOKAL_DIPULIHKAN", { jumlah: hasil.dipulihkan.length });
  }, [data, pulihkanDraft]);

  // Hitung mundur kirim ulang OTP: satu `setTimeout` per detik, dibatalkan saat
  // detiknya habis atau komponen berganti tahap, tidak ada interval yang
  // tertinggal hidup.
  useEffect(() => {
    if (detikUlangOtp === 0) return;
    const timer = window.setTimeout(() => setDetikUlangOtp((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [detikUlangOtp]);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat status KYC…
      </div>
    );
  }

  // Id dokumen dari server dipakai apa adanya (bertipe `Id<"_storage">`), bukan
  // disalin lewat `BerkasKyc` yang hanya peduli "ada atau tidak ada".
  const dataPasti = data;
  const dokumenTersimpan = dataPasti.dokumen;
  const berkasTersimpan: BerkasKyc = {
    ktp: dokumenTersimpan.ktpId,
    selfie: dokumenTersimpan.selfieKtpId,
    bukti: dokumenTersimpan.buktiPenghasilanId,
  };

  // ===== Jalur pengajuan cepat (pasca-KYC) =====
  // Identitas sudah TERVERIFIKASI: wizard tujuh tahap tidak lagi ditampilkan,
  // dan pengajuan diajukan dari satu halaman. Semua data identitas diambil dari
  // baris KYC yang sudah diperiksa petugas, tidak ada yang diketik ulang, dan
  // tidak ada mutasi server baru. Nasabah tetap bisa membuka kembali data KYC-nya
  // (mis. ingin mengganti rekening) lewat tautan di halaman itu.
  if (isKycVerified(dataPasti.status) && !bukaDataKyc) {
    return (
      <PengajuanCepatSection
        ktp={{
          namaLengkap: dataPasti.isian.namaLengkap,
          nik: dataPasti.isian.nik,
          nomorWhatsApp: dataPasti.isian.nomorWhatsApp,
          penghasilanBulanan: penghasilanDariTeks(dataPasti.isian.penghasilan),
          sumberPenghasilan: dataPasti.isian.sumberPenghasilan,
          namaBank: dataPasti.isian.namaBank,
          nomorRekening: dataPasti.isian.nomorRekening,
          dokKtpId: dokumenTersimpan.ktpId,
          dokSelfieKtpId: dokumenTersimpan.selfieKtpId,
          dokSlipGajiId: dokumenTersimpan.buktiPenghasilanId,
        }}
        onLihatDataKyc={() => setBukaDataKyc(true)}
      />
    );
  }
  // Draft hanya berlaku untuk data tersimpan yang SAMA: stempel berubah setiap
  // kali server mencatat simpanan baru, sehingga setelah simpan berhasil layar
  // otomatis menampilkan nilai yang benar-benar tersimpan (sudah dinormalkan
  // server), tanpa `useEffect` yang bisa menimpa ketikan yang belum disimpan.
  const stempelServer = `${dataPasti.adaBaris}:${dataPasti.diperbaruiPada ?? 0}:${dataPasti.persetujuan?.versi ?? "-"}`;
  const draftAktif = draft !== null && draft.stempel === stempelServer ? draft : null;
  // Urutan kepercayaan: ketikan pengguna (`draftAktif`) → isian server yang sudah
  // ditambal draft lokal → isian server apa adanya. Draft hanya menambal kolom
  // kosong, jadi nilai yang sudah tersimpan tidak pernah diturunkan.
  const isian: IsianKycLengkap =
    draftAktif?.isian ??
    (isianDipulihkan === null ? dataPasti.isian : { ...dataPasti.isian, ...isianDipulihkan });
  const berkas: Record<SlotBerkasUi, BerkasDraft | null> = draftAktif?.berkas ?? {
    ktp:
      dokumenTersimpan.ktpId === null
        ? null
        : { id: dokumenTersimpan.ktpId, nama: "Berkas tersimpan" },
    selfie:
      dokumenTersimpan.selfieKtpId === null
        ? null
        : { id: dokumenTersimpan.selfieKtpId, nama: "Berkas tersimpan" },
    bukti:
      dokumenTersimpan.buktiPenghasilanId === null
        ? null
        : { id: dokumenTersimpan.buktiPenghasilanId, nama: "Berkas tersimpan" },
  };
  const berkasUntukStatus: BerkasKyc = {
    ktp: berkas.ktp?.id ?? null,
    selfie: berkas.selfie?.id ?? null,
    bukti: berkas.bukti?.id ?? null,
  };
  const opsi: OpsiStatusTahap = {
    kekurangan: dataPasti.kekurangan,
    perluPerbaikan: dataPasti.status === "NEEDS_CORRECTION",
    persetujuanAktif: dataPasti.persetujuanAktif,
  };
  const statusPerTahap = Object.fromEntries(
    ID_TAHAP_KYC.map((id) => [id, statusTahapKyc(id, isian, berkasUntukStatus, opsi)]),
  ) as Record<IdTahapKyc, StatusTahapKyc>;
  const progres = progresKyc(isian, berkasUntukStatus, opsi);

  const terkunci = !dataPasti.persetujuanAktif;
  // Kalau dihitung ulang tiap render, wizard berpindah tahap sendiri begitu
  // tahap yang sedang diisi menjadi "lengkap" (mis. nomor WhatsApp selesai diketik).
  if (tahapAwal.current === null) {
    tahapAwal.current = tahapDisarankan(dataPasti.status, isian, berkasUntukStatus, opsi);
  }
  const tahapAktif = tahapPilihan ?? tahapAwal.current;
  const tahap = tahapKyc(tahapAktif);
  // Satu hitungan untuk nomor tahap, bilah kemajuan, dan bilah lekat di ponsel:
  // `progresStageKyc` menurunkan semuanya dari `statusPerTahap` yang sama.
  const tahapBesar = progresStageKyc(statusPerTahap, tahap.id);
  const nomorStage = tahapBesar.nomor;
  const stage = stageKyc(nomorStage);
  const langkahStage = tahapStage(nomorStage);
  // Galat & kekurangan dihitung untuk SELURUH langkah tahap ini, bukan hanya
  // langkah yang menjadi pintu masuk. Sejak satu tahap tampil dalam satu layar,
  // pesan di dekat isian harus tetap muncul walau pengguna masuk dari langkah
  // lain di tahap yang sama; kunci isian unik per langkah, jadi penyaringan per
  // kunci tetap menemukan pesan yang benar.
  const galatTahap = langkahStage.flatMap((id) => galatTahapKyc(id, isian, berkasUntukStatus));
  const kurangTahap = langkahStage.flatMap((id) =>
    kekuranganLokalTahap(id, isian, berkasUntukStatus),
  );
  const ringkasStage = ringkasStatusStage(statusPerTahap, nomorStage);
  // Tombol "ajukan" hanya aktif bila transisinya memang SAH menurut
  // `lib/kycStatus.ts`, bukan sekadar "isian lengkap". Dengan begitu nasabah
  // tidak pernah diantar ke tombol yang pasti ditolak server: setelah DITOLAK
  // ia harus menyunting data dulu (pengajuan dimulai ulang), dan setelah
  // TERVERIFIKASI tidak ada lagi yang perlu diajukan.
  const bolehAjukan =
    !terkunci && dataPasti.lengkap && bolehTransisi(dataPasti.status, "PENDING_REVIEW", "nasabah");
  /** Label tombol ajukan mengikuti langkah yang sah menurut status saat ini. */
  const labelAjukan =
    dataPasti.status === "REVERIFICATION_REQUIRED"
      ? "Ajukan verifikasi ulang"
      : dataPasti.status === "NEEDS_CORRECTION"
        ? "Kirim ulang pengajuan"
        : "Ajukan peninjauan";
  /**
   * Catatan status di baris aksi. Hanya keadaan yang benar-benar perlu
   * dijelaskan yang ditaruh di sini; kalimat umum seperti "semua tahap wajib
   * sudah siap" atau "ajukan aktif setelah semua tahap wajib siap" dibuang
   * karena tombol ajukan sudah menyebut sendiri sisa isiannya.
   */
  // Peringatan verifikasi ulang untuk status VERIFIED TIDAK diulang di sini: kartu
  // hijau di atas formulir sudah menyebutnya, dan kalimat yang sama dua kali
  // membuat nasabah mengira ada dua syarat berbeda.
  const catatanAksi =
    dataPasti.status === "REJECTED"
        ? "Perbaiki data yang diminta petugas lalu simpan; pengajuan dimulai ulang otomatis."
        : dataPasti.status === "PENDING_REVIEW"
          ? "Sedang menunggu peninjauan petugas. Menyimpan perubahan menarik pengajuan kembali."
          : null;

  const ubah = (kunci: keyof IsianKycLengkap, nilai: string) =>
    setDraft({ stempel: stempelServer, isian: { ...isian, [kunci]: nilai }, berkas });

  /**
   * Normalisasi nomor WhatsApp SAAT DIKETIK: `08xxx` (dan `8xxx`) langsung
   * disimpan sebagai `628xxx`, jadi peminjam tidak perlu menghapus nol di depan
   * sendiri, sumber kesalahan format yang paling sering. Hanya digit yang
   * diterima, dan bentuk `62…` yang sudah benar dibiarkan apa adanya.
   */
  const ubahNomorWa = (mentah: string) => {
    const digit = mentah.replace(/\D/g, "").slice(0, 15);
    let rapi = digit;
    if (rapi.startsWith("08")) rapi = `628${rapi.slice(2)}`;
    else if (rapi.startsWith("8")) rapi = `62${rapi}`;
    else if (rapi.startsWith("0")) rapi = `62${rapi.slice(1)}`;
    ubah("nomorWhatsApp", rapi);
  };
  /**
   * Pasang/lepas pratinjau lokal satu slot. URL objek yang digantikan langsung
   * dicabut supaya blob lama tidak menumpuk di memori tab.
   */
  const gantiPratinjau = (slot: SlotBerkasUi, nilai: PratinjauLokal | null) => {
    const lama = pratinjauRef.current[slot];
    if (lama !== undefined && lama.url !== null) URL.revokeObjectURL(lama.url);
    const berikutnya = { ...pratinjauRef.current };
    if (nilai === null) delete berikutnya[slot];
    else berikutnya[slot] = nilai;
    pratinjauRef.current = berikutnya;
    setPratinjau(berikutnya);
  };

  /** Berkas baru dipilih: tampilkan pratinjau lokal sampai (bila) tersimpan. */
  const tampilkanPratinjau = (slot: SlotBerkasUi, file: File) => {
    const url =
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null;
    gantiPratinjau(slot, { url, nama: file.name });
  };

  const ubahBerkas = (slot: SlotBerkasUi, nilai: DokumenTerunggah | null) => {
    setDraft({ stempel: stempelServer, isian, berkas: { ...berkas, [slot]: nilai } });
    // Berkas dihapus atau diganti: pratinjau lokal yang lama tidak berlaku lagi,
    // supaya yang tampil hanya berkas yang benar-benar sedang diproses.
    gantiPratinjau(slot, null);
    if (slot === "ktp" && nilai === null) {
      setFileKtp(null);
      // Foto dihapus: snapshot OCR untuk foto itu tidak berlaku lagi.
      setOcrKtp(null);
    }
  };

  /**
   * Terapkan hasil OCR ke draf formulir. Nilai yang tidak terbaca TIDAK
   * menimpa isian yang sudah ada, dan pengguna tetap bisa mengoreksi kolomnya
   * sebelum menyimpan, OCR tidak pernah menyimpan sendiri ke server.
   */
  const terapkanOcrKtp = (ktp: DataKtp) => {
    setDraft({
      stempel: stempelServer,
      isian: {
        ...isian,
        namaLengkap: ktp.nama ?? isian.namaLengkap,
        nik: ktp.nik ?? isian.nik,
        alamat: ktp.alamat ?? isian.alamat,
      },
      berkas,
    });                    toast.success(
                      "Data yang terbaca dari foto diisikan ke formulir. Periksa dulu, lalu betulkan yang perlu.",
                    );
  };

  const menuju = (id: IdTahapKyc) => {
    setTahapLokal(id);
    onPilihTahap?.(id);
    setGalat(null);
  };

  /**
   * Simpan SATU langkah. Mengembalikan `true` bila server menerima.
   * Galat dari server ditampilkan apa adanya; galat persetujuan mengantar
   * pengguna kembali ke tahap 1.
   */
  const jalankan = async (langkah: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setGalat(null);
    try {
      await langkah();
      return true;
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Langkah KYC gagal. Coba lagi.";
      setGalat(pesan);
      if (pesanButuhPersetujuan(pesan) || pesanVersiPersetujuanBerubah(pesan)) {
        // Lewat `menuju` supaya menu sidebar ikut berpindah ke tahap 1.
        menuju("persetujuan");
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const simpanProgres = async (opsi: { diam?: boolean } = {}): Promise<boolean> => {
    setMenyimpan(true);
    const berhasil = await jalankan(() =>
      simpan({
        namaLengkap: isian.namaLengkap,
        nik: isian.nik,
        nomorWhatsApp: isian.nomorWhatsApp,
        alamat: isian.alamat,
        pekerjaan: isian.pekerjaan,
        penghasilanBulanan: penghasilanDariTeks(isian.penghasilan),
        sumberPenghasilan: isian.sumberPenghasilan,
        namaBank: isian.namaBank,
        nomorRekening: isian.nomorRekening,
        catatanPeminjam: isian.catatanPeminjam,
        namaKontakDarurat: isian.namaKontakDarurat,
        nomorKontakDarurat: isian.nomorKontakDarurat,
        hubunganKontakDarurat: isian.hubunganKontakDarurat,
        ktpId: berkas.ktp?.id ?? null,
        selfieKtpId: berkas.selfie?.id ?? null,
        buktiPenghasilanId: berkas.bukti?.id ?? null,
        // Snapshot OCR ikut disimpan bersama isian & berkas (bukan lewat jalur
        // terpisah) supaya ia selalu sejalan dengan berkas KTP yang tersimpan.
        ocrKtp,
      }),
    );
    setMenyimpan(false);
    if (berhasil && opsi.diam !== true) toast.success("Progres KYC tersimpan.");
    return berhasil;
  };

  /**
   * Kunci isian yang terakhir dikirim ke server. Dipakai efek autosave supaya
   * data yang sama tidak disimpan berulang kali: tanpa kunci ini, perubahan
   * `busy` saat menyimpan akan menjadwalkan simpanan berikutnya tanpa henti.
   */
  const kunciAutosave =
    draft === null
      ? null
      : JSON.stringify([
          draft.isian,
          draft.berkas.ktp?.id ?? null,
          draft.berkas.selfie?.id ?? null,
          draft.berkas.bukti?.id ?? null,
          ocrKtp,
        ]);
  // Autosave dipasang oleh `<AutosaveKyc>` di dalam cabang formulir, bukan
  // sebagai efek di sini: efek setelah cabang "sedang memuat" mengubah jumlah
  // hook antar-render. Toast-nya dibungkam (`diam`) — indikator kecil
  // "Tersimpan otomatis HH.mm" di bawah tombol utama sudah cukup.

  const setujuiPemrosesan = async () => {
    const berhasil = await jalankan(() => setujui({ versi: VERSI_PERSETUJUAN_KYC }));
    if (berhasil) {
      toast.success("Persetujuan pemrosesan data tercatat.");
      menuju("identitas");
    }
  };

  const ajukanPeninjauan = async () => {
    // Simpan dulu (tanpa toast) supaya isian & snapshot OCR TERBARU tersimpan
    // sebelum mesin keputusan otomatis berjalan di server.
    if (!(await simpanProgres({ diam: true }))) return;
    setBusy(true);
    setGalat(null);
    try {
      const hasil = await ajukan({});
      // Mesin hanya menerapkan VERIFIED sendiri. Hasil lain (ada yang gagal /
      // belum bisa dipastikan) DICATAT sebagai bahan peninjauan, jadi statusnya
      // tetap menunggu petugas, pesannya pun tidak menjanjikan perbaikan
      // otomatis, hanya menunjuk pemeriksaan yang gagal.
      if (hasil.status === "VERIFIED") {
        toast.success(
          "Seluruh syarat yang bisa diperiksa sistem terpenuhi. KYC otomatis terverifikasi.",
        );
      } else if (hasil.otomatis?.keputusan === "NEEDS_CORRECTION") {
        toast.warning(
          "Pemeriksaan otomatis menemukan hal yang bisa dirapikan. Lihat panel pemeriksaan otomatis; petugas tetap meninjau pengajuan ini.",
        );
      } else {
        toast.success("Pengajuan KYC dikirim untuk peninjauan petugas.");
      }
      // Pengajuan sudah di server: draft lokal tidak berlaku lagi dan dibuang
      // HANYA di titik ini, supaya refresh sebelum terkirim masih memulihkan.
      bersihkanDraft();
      setKolomDipulihkan([]);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pengajuan KYC gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  /** Simpan lalu pindah ke TAHAP berikutnya (tanpa memaksa bila ada galat). */
  const simpanDanLanjut = async () => {
    // Tanpa toast: simpanan sudah dibiasakan lewat autosave, jadi "Lanjut" cukup
    // memindahkan tahap dan tidak menambah notifikasi untuk hal yang sama.
    const berhasil = await simpanProgres({ diam: true });
    if (!berhasil) return;
    const berikutnya = tahapBerikutStage(tahapPilihan ?? tahapAwal.current ?? "persetujuan");
    if (berikutnya !== null) menuju(berikutnya);
  };

  /**
   * Minta kode OTP ke nomor yang TERSIMPAN. Server menolak (dan itu memang
   * benar) bila nomor belum tersimpan atau permintaan terlalu sering, pesannya
   * ditampilkan apa adanya.
   */
  const kirimKodeOtp = async () => {
    setOtpBusy(true);
    setGalat(null);
    try {
      const hasil = await mintaOtp({ tujuan: "verifikasi_nomor" });
      if (hasil.ok) {
        // Hitung mundur 30 detik pada tombol kirim: mencegah pengguna menekan
        // berulang dan menghabiskan kuota gateway. Server tetap punya pembatas
        // sendiri (`OTP_COOLDOWN_MS`); pesannya ditampilkan apa adanya bila
        // hitung mundur ini selesai lebih dulu.
        setDetikUlangOtp(DETIK_UBAH_KIRIM_ULANG_OTP);
        toast.success("Kode verifikasi dikirim ke WhatsApp nomor Anda. Berlaku 5 menit.");
      } else {
        setGalat(hasil.pesan);
      }
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Gagal meminta kode verifikasi.");
    } finally {
      setOtpBusy(false);
    }
  };

  /**
   * Kirim kode yang diketik. Verifikasi sungguhan terjadi di server; halaman ini
   * tidak pernah menyimpulkan sendiri bahwa nomornya terverifikasi.
   */
  const verifikasiKodeOtp = async () => {
    setOtpBusy(true);
    setGalat(null);
    try {
      const hasil = await verifikasiOtp({ tujuan: "verifikasi_nomor", kode: kodeOtp });
      if (hasil.ok) {
        setKodeOtp("");
        toast.success("Nomor WhatsApp terverifikasi. Status ini terlihat petugas KYC.");
      } else {
        setGalat(hasil.pesan);
      }
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Verifikasi kode gagal.");
    } finally {
      setOtpBusy(false);
    }
  };

  // ===== Kondisi awal: KYC belum pernah disentuh =====
  if (!data.adaBaris && data.status === "NOT_STARTED") {
    return (
      <section className="space-y-4">
        {/* Tanpa pil status di sini: modul KYC hanya dirender di dalam tab KYC,
            jadi pil yang mengajak pindah ke tab itu hanya mengulang kartu di
            bawahnya. Keadaan "belum dimulai" sudah dinamai kartunya sendiri. */}
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Verifikasi identitas belum dimulai</EmptyTitle>
            <EmptyDescription>
              KYC memastikan identitas Anda benar sebelum layanan pinjaman/gadai diproses. Prosesnya
              bertahap dan bisa disimpan di tengah jalan. Tidak ada biaya dan tidak otomatis membuat
              pengajuan pinjaman.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                void jalankan(() => mulai({})).then((ok) => {
                  if (ok) {
                    toast.success("KYC dimulai. Baca dan setujui penjelasan pemrosesan data.");
                    menuju("persetujuan");
                  }
                })
              }
            >
              <Play className="size-4" /> Mulai KYC
            </Button>
            {galat !== null && (
              <p role="alert" className="text-[11px] leading-4 text-destructive">
                {galat}
              </p>
            )}
          </EmptyContent>
        </Empty>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl bg-slate-50 p-3 sm:p-4">
      <AutosaveKyc
        kunci={kunciAutosave}
        terkunci={terkunci}
        busy={busy}
        simpan={() => simpanProgres({ diam: true })}
      />
      <KycStatusHeader
        status={data.status}
        kekurangan={data.kekurangan}
        lengkap={data.lengkap}
        tahapAktif={tahap.id}
        statusPerTahap={statusPerTahap}
        onBuka={menuju}
      />

      {data.status === "VERIFIED" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <BadgeCheck className="size-3.5 shrink-0" aria-hidden /> Identitas terverifikasi
          </p>
          <p className="mt-1">
            Status ini dikonfirmasi server: identitas Anda sudah diperiksa petugas, bukan
            persetujuan pinjaman dan bukan bukti dana cair. Mengubah nama, NIK, atau berkas
            identitas akan memicu verifikasi ulang.
          </p>
          {bukaDataKyc && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5 rounded-xl"
              onClick={() => setBukaDataKyc(false)}
            >
              <ArrowRight className="size-3.5" aria-hidden /> Kembali ke pengajuan cepat
            </Button>
          )}
        </div>
      )}

      {data.status === "PENDING_REVIEW" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock3 className="size-3.5 shrink-0" aria-hidden /> Menunggu peninjauan petugas
          </p>
          <p className="mt-1">
            Isian dikunci sementara supaya petugas menilai data yang sama dengan yang Anda kirim.
            Anda masih bisa melihat semua tahap dan status pemeriksaannya di bawah.
          </p>
        </div>
      )}

      <KycKeputusanAlert
        status={data.status}
        catatan={data.keputusanCatatan}
        olehLabel={data.diputuskanOlehLabel}
        pada={data.diputuskanPada}
      />

      {galat !== null && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Langkah KYC belum berhasil</AlertTitle>
          <AlertDescription>
            <span>{galat}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5"
              disabled={busy}
              onClick={() => void simpanProgres()}
            >
              <Save className="size-3.5" /> Coba simpan lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Notifikasi pemulihan progres / status sesi saat kembali dari latar. */}
      {restoredNote !== null && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> {restoredNote}
          </p>
        </div>
      )}
      {/* Draft lokal yang dipulihkan. Kalimatnya menyebut KOLOM apa saja yang
          dikembalikan supaya pengguna tahu asal datanya, bukan dikejutkan. */}
      {kolomDipulihkan.length > 0 && ringkasPemulihan(kolomDipulihkan) !== null && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> Isian Anda dipulihkan
          </p>
          <p className="mt-1">{ringkasPemulihan(kolomDipulihkan)}</p>
          <p className="mt-1">Periksa kembali isiannya, lalu simpan seperti biasa.</p>
        </div>
      )}

      {otpResumeStatus !== null && otpResumeStatus !== "Sesi OTP ditemukan; harap verifikasi ulang kode." && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-3.5 shrink-0" aria-hidden /> {otpResumeStatus}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:gap-6">
        {/* Navigasi tahap hanya di bawah `lg`: sejak `lg` tahapnya ada di kolom
            sidebar (`KycMenuSidebar`), jadi kolom isi ini memuat formulirnya
            saja. Di ponsel sidebar menumpuk di atas isi, dan tiga kartu tahap di
            sana hanya mendorong isian ke bawah layar. */}
        {/* Navigasi tahap untuk ponsel. Sejak `lg` tahapnya ada di kolom sidebar,
            jadi bilah ini hilang dan penghitung di kartu status yang
            menggantikannya. */}
        <KycBilahTahapLekat
          aktif={tahap.id}
          statusPerTahap={statusPerTahap}
          terkunci={terkunci}
          onPilih={menuju}
        />

        <div
          id="kyc-tahap-isi"
          role="region"
          aria-labelledby="kyc-tahap-judul"
          className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
        >
          <p className="sr-only" role="status" aria-live="polite">
            Tahap {nomorStage} dari 3: {stage.judul}
          </p>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <JudulTahap nomor={nomorStage} judul={stage.judul} />
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{stage.ringkas}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                ringkasStage === "lengkap"
                  ? "bg-emerald-100 text-emerald-700"
                  : ringkasStage === "perlu-diperbaiki"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {LABEL_STATUS_TAHAP[ringkasStage]}
            </span>
          </div>

          {terkunci && langkahStage.length > 1 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Langkah lain di tahap ini terbuka setelah persetujuan pemrosesan data tercatat di
              server.
            </p>
          )}

          <div className="mt-4">
            {/* Tahap 1, langkah 1: persetujuan & penjelasan pemrosesan data. */}
            {nomorStage === 1 && (
              <section
                aria-labelledby="kyc-langkah-persetujuan"
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <JudulLangkah id="persetujuan" status={statusPerTahap.persetujuan} />
              <div className="mt-3 space-y-4">
                {/* Ringkasan 3 poin (data apa, untuk apa, siapa yang melihat) + satu
                    kalimat soal lokasi perangkat. Sisanya tetap ada persis seperti
                    teksnya, tapi di balik "Baca selengkapnya", supaya kotak
                    centangnya tidak tenggelam di bawah delapan kartu penjelasan. */}
                <ol className="space-y-2.5">
                  {POIN_PERSETUJUAN_KYC.slice(0, 3).map((poin, urutan) => (
                    <li key={poin.judul} className="flex gap-2.5">
                      <span
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-900"
                        aria-hidden
                      >
                        {urutan + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-foreground">
                          {poin.judul}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                          {poin.isi}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>

                <p className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-4 text-muted-foreground">
                  Saat Anda mengirim pengajuan, lokasi perangkat dicatat sekali untuk memastikan
                  pengajuan dibuat dari tempat yang wajar. Tidak ada pelacakan yang berjalan terus.
                </p>

                <Accordion
                  type="single"
                  collapsible
                  className="rounded-xl border border-border bg-card px-3"
                >
                  <AccordionItem value="sisanya" className="border-b-0">
                    <AccordionTrigger className="py-3 text-xs font-semibold text-foreground hover:no-underline">
                      Baca selengkapnya ({POIN_PERSETUJUAN_KYC.length - 3} poin lain)
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-3 pb-1">
                        {POIN_PERSETUJUAN_KYC.slice(3).map((poin) => (
                          <li key={poin.judul}>
                            <p className="text-xs font-semibold text-foreground">{poin.judul}</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                              {poin.isi}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {data.persetujuanAktif ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-900">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> Persetujuan tercatat
                      di server
                    </p>
                    <p className="mt-1">
                      {waktu(data.persetujuan?.pada ?? null)} · versi teks{" "}
                      {data.persetujuan?.versi ?? "tidak tercatat"}. Menarik persetujuan dapat dilakukan lewat tim
                      PINDAI dan berarti pengajuan KYC tidak dapat dilanjutkan.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="kyc-setuju"
                        checked={centangSetuju}
                        onCheckedChange={(nilai) => setCentangSetuju(nilai === true)}
                        disabled={busy}
                      />
                      <label htmlFor="kyc-setuju" className="text-xs leading-5 text-foreground">
                        {RINGKASAN_PERSETUJUAN_KYC}
                      </label>
                    </div>
                    <Button
                      type="button"
                      className="gap-1.5"
                      disabled={busy || !centangSetuju}
                      onClick={() => void setujuiPemrosesan()}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                      Setujui & isi data
                    </Button>
                    {!centangSetuju && (
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        Isian di layar ini terbuka setelah Anda menyetujui pemrosesan data.
                      </p>
                    )}
                  </div>
                )}
              </div>
              </section>
            )}

            {/* Tahap 1, langkah 2: data identitas. */}
            {nomorStage === 1 && !terkunci && (
              <section
                aria-labelledby="kyc-langkah-identitas"
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <JudulLangkah id="identitas" status={statusPerTahap.identitas} />
              <FieldSet className="mt-3">
                <FieldLegend variant="label" className="sr-only">
                  Data identitas
                </FieldLegend>
                <FieldGroup>
                  <Field data-invalid={galatTahap.some((g) => g.kunci === "namaLengkap")}>
                    <FieldLabel htmlFor="kyc-nama">Nama lengkap sesuai KTP</FieldLabel>
                    <Input
                      id="kyc-nama"
                      value={isian.namaLengkap}
                      onChange={(e) => ubah("namaLengkap", e.target.value)}
                      placeholder="Mis. Rani Puspita"
                      autoComplete="name"
                      required
                      aria-required="true"
                      aria-invalid={galatTahap.some((g) => g.kunci === "namaLengkap")}
                      disabled={busy}
                    />
                    <FieldError
                      errors={galatTahap.filter((g) => g.kunci === "namaLengkap").map((g) => ({ message: g.pesan }))}
                    />
                    <FieldDescription>
                      Tulis persis seperti di KTP, tanpa gelar atau singkatan.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={galatTahap.some((g) => g.kunci === "nik")}>
                    <FieldLabel htmlFor="kyc-nik">NIK (nomor KTP)</FieldLabel>
                    <Input
                      id="kyc-nik"
                      inputMode="numeric"
                      className="tabular-nums"
                      value={isian.nik}
                      onChange={(e) => ubah("nik", e.target.value.replace(/\D/g, ""))}
                      placeholder="16 angka"
                      maxLength={16}
                      autoComplete="off"
                      required
                      aria-required="true"
                      aria-invalid={galatTahap.some((g) => g.kunci === "nik")}
                      disabled={busy}
                    />
                    <FieldError
                      errors={galatTahap.filter((g) => g.kunci === "nik").map((g) => ({ message: g.pesan }))}
                    />
                    <FieldDescription>
                      NIK dipakai hanya untuk verifikasi identitas. Di ringkasan, NIK ditampilkan
                      bertopeng ({maskNik(isian.nik)}) dan tidak pernah dimasukkan ke URL, log, atau
                      notifikasi.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldSet>
              </section>
            )}

            {/* Tahap 2: dokumen KTP dan selfie. Dua kotak unggah, masing-masing
                sudah membawa judulnya sendiri dari `LABEL_SLOT_BERKAS`, jadi
                tidak perlu judul langkah tambahan yang mengulang nama yang
                sama. */}
            {nomorStage === 2 &&
              !terkunci &&
              (["ktp", "selfie"] as const).map((slotDokumen) => (
              <section
                key={slotDokumen}
                aria-label={LABEL_SLOT_BERKAS[slotDokumen]}
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <div className="space-y-3">
                <UnggahDokumen
                  label={LABEL_SLOT_BERKAS[slotDokumen]}
                  keterangan={
                    slotDokumen === "ktp"
                      ? "Foto diambil lewat kamera aplikasi. Seluruh sisi KTP harus terlihat dan teksnya terbaca."
                      : "Petugas memakai foto ini untuk mencocokkan wajah Anda dengan KTP. Wajah dan KTP harus terlihat dalam satu foto, tanpa penutup wajah."
                  }
                  accept="image/jpeg,image/png,image/webp"
                  nilai={berkas[slotDokumen]}
                  onUbah={(d) => ubahBerkas(slotDokumen, d)}
                  onBerkasDipilih={(file) => {
                    tampilkanPratinjau(slotDokumen, file);
                    if (slotDokumen === "ktp") {
                      setFileKtp(file);
                      // Foto baru: snapshot OCR foto sebelumnya tidak berlaku lagi.
                      setOcrKtp(null);
                    }
                  }}
                  // Galeri dimatikan untuk KTP & selfie: berkas WAJIB datang dari
                  // kamera dalam aplikasi, sehingga tidak ada jalan memilih foto
                  // lama dari galeri.
                  onMintaKamera={() => setKameraSlot(slotDokumen)}
                  // Hasil kamera hanya diberikan ke slot yang kameranya sedang
                  // TERBUKA. Sejak KTP dan selfie tampil dalam satu layar, dua
                  // kotak unggah hidup berdampingan; tanpa penjagaan ini satu
                  // tangkapan foto akan diunggah ke kedua slot sekaligus.
                  berkasKamera={kameraSlot === slotDokumen ? berkasKamera : null}
                  onBerkasKameraDiproses={() => setBerkasKamera(null)}
                  mintaUrl={() => buatUrl({})}
                  periksa={(id, label) => periksa({ id, label }).then(() => undefined)}
                  disabled={busy}
                />
                <KameraLive
                  buka={kameraSlot === slotDokumen}
                  onTutup={() => setKameraSlot(null)}
                  judul={
                    slotDokumen === "ktp" ? "Ambil foto KTP (kamera langsung)" : "Ambil selfie dengan KTP (kamera langsung)"
                  }
                  keterangan={
                    slotDokumen === "ktp"
                      ? "Kamera dibuka di dalam PINDAI, bukan aplikasi kamera HP, jadi pengisian tidak terputus."
                      : "Pastikan wajah dan KTP Anda berada dalam bingkai, tanpa penutup wajah."
                  }
                  bingkai={slotDokumen === "ktp" ? "ktp" : "selfie"}
                  arahAwal={slotDokumen === "ktp" ? "belakang" : "depan"}
                  onAmbil={(file) => setBerkasKamera(file)}
                  disabled={busy}
                />
                {slotDokumen === "ktp" && fileKtp !== null && (
                  <PindaiKtpOcr
                    file={fileKtp}
                    form={{ namaLengkap: isian.namaLengkap, nik: isian.nik, alamat: isian.alamat }}
                    onTerapkan={terapkanOcrKtp}
                    onHasil={(ktp, konfidensi) =>
                      setOcrKtp({
                        konfidensi,
                        nik: ktp.nik,
                        nama: ktp.nama,
                        alamat: ktp.alamat,
                      })
                    }
                    disabled={busy}
                  />
                )}
                {pratinjau[slotDokumen]?.url != null && (
                  <WatermarkedDoc
                    src={pratinjau[slotDokumen]!.url!}
                    label={`Pratinjau ${LABEL_SLOT_BERKAS[slotDokumen].toLowerCase()}${pratinjau[slotDokumen]!.nama === "" ? "" : ` (${pratinjau[slotDokumen]!.nama})`} (belum tersimpan)`}
                  />
                )}
                {berkas[slotDokumen] === null && data.url[slotDokumen] !== null && (
                  <p className="text-[11px] leading-4 text-amber-700">
                    Berkas lama akan diganti setelah Anda menyimpan.
                  </p>
                )}
                {berkasTersimpan[slotDokumen] !== null && (
                  <WatermarkedDoc
                    src={data.url[slotDokumen] ?? ""}
                    label={`${LABEL_SLOT_BERKAS[slotDokumen]} tersimpan`}
                  />
                )}
                {/* Petunjuk di bawah kolom unggah supaya peringatan "sesuai
                    petunjuk di atas" tetap menunjuk ke tempat yang benar. */}
                <KycPetunjukFoto tahapId={slotDokumen} />
                {statusPerTahap[slotDokumen] === "perlu-diperbaiki" && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                    Petugas meminta berkas ini diganti. Unggah foto baru sesuai petunjuk di atas, lalu
                    simpan.
                  </p>
                )}
              </div>
              </section>
            ))}

            {/* Tahap 1, langkah 3: nomor WhatsApp + verifikasi OTP. */}
            {nomorStage === 1 && !terkunci && (
              <section
                aria-labelledby="kyc-langkah-whatsapp"
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <JudulLangkah id="whatsapp" status={statusPerTahap.whatsapp} />
              <div className="mt-3 max-w-md space-y-3">
              <Field
                data-invalid={galatTahap.some((g) => g.kunci === "nomorWhatsApp")}
              >
                <FieldLabel htmlFor="kyc-wa">Nomor WhatsApp aktif</FieldLabel>
                <Input
                  id="kyc-wa"
                  inputMode="tel"
                  className="tabular-nums"
                  value={isian.nomorWhatsApp}
                  onChange={(e) => ubahNomorWa(e.target.value)}
                  placeholder="6281234567890"
                  autoComplete="tel"
                  required
                  aria-required="true"
                  aria-invalid={galatTahap.some((g) => g.kunci === "nomorWhatsApp")}
                  disabled={busy}
                />
                <FieldError
                  errors={galatTahap
                    .filter((g) => g.kunci === "nomorWhatsApp")
                    .map((g) => ({ message: g.pesan }))}
                />
                <FieldDescription>
                  Diawali kode negara 62 tanpa tanda +. Petugas memakai nomor ini untuk menghubungi
                  Anda soal pengajuan, nomor tidak ditampilkan ke pengguna lain
                  {isian.nomorWhatsApp.trim() === "" ? "" : ` (tersimpan sebagai ${maskWhatsApp(isian.nomorWhatsApp)})`}.
                </FieldDescription>
              </Field>

                {/* Verifikasi nomor lewat kode OTP WhatsApp. Hasilnya tersimpan di
                    modul KYC sebagai salah satu hasil pemeriksaan (`nomorWhatsAppTerverifikasi`),
                    dan hanya berubah lewat verifikasi server. */}
                <div className="rounded-2xl border border-border bg-muted/40 p-3">
                  <div className="flex items-center gap-2">
                    {data.nomorWhatsAppTerbukti ? (
                      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                    ) : (
                      <ShieldAlert className="size-4 text-amber-600" aria-hidden />
                    )}
                    <p className="text-xs font-semibold">
                      {data.nomorWhatsAppTerbukti
                        ? "Nomor WhatsApp terverifikasi"
                        : "Nomor WhatsApp belum diverifikasi"}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {keteranganNomorWa(data.nomorWhatsAppTerbukti)}
                  </p>
                  {data.nomorWhatsAppTerverifikasi !== null && (
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Dibuktikan {waktu(data.nomorWhatsAppTerverifikasi.pada)} untuk nomor{" "}
                      {maskWhatsApp(data.nomorWhatsAppTerverifikasi.nomor)}.
                    </p>
                  )}
                  {normalisasiNomorWa(isian.nomorWhatsApp) !==
                  normalisasiNomorWa(data.isian.nomorWhatsApp) ? (
                    <p className="mt-2 text-[11px] leading-5 text-amber-700">
                      Simpan dulu nomor di atas, lalu kirim kode verifikasi, kode hanya berlaku untuk
                      nomor yang tersimpan.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || otpBusy || detikUlangOtp > 0}
                        onClick={kirimKodeOtp}
                      >
                        {otpBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Phone className="size-4" />
                        )}
                        {detikUlangOtp > 0
                          ? `Kirim ulang dalam ${detikUlangOtp} detik`
                          : "Kirim kode ke WhatsApp"}
                      </Button>
                      <Input
                        inputMode="numeric"
                        className="h-9 w-28 tabular-nums"
                        value={kodeOtp}
                        onChange={(e) => setKodeOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6 digit"
                        aria-label="Kode OTP WhatsApp"
                        autoComplete="one-time-code"
                        disabled={busy || otpBusy || data.nomorWhatsAppTerbukti}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || otpBusy || kodeOtp.length !== 6}
                        onClick={verifikasiKodeOtp}
                      >
                        <ShieldCheck className="size-4" /> Verifikasi
                      </Button>
                    </div>
                  )}
                </div>

                {otpResumeStatus !== null && (
                  <p className="text-[11px] leading-4 text-amber-700" role="status">
                    {otpResumeStatus}
                  </p>
                )}
              </div>
              </section>
            )}

            {/* Tahap 3, langkah 1: alamat & pekerjaan. */}
            {nomorStage === 3 && !terkunci && (
              <section
                aria-labelledby="kyc-langkah-alamat"
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <JudulLangkah id="alamat" status={statusPerTahap.alamat} />
              <FieldGroup className="mt-3">
                <Field data-invalid={galatTahap.some((g) => g.kunci === "alamat")}>
                  <FieldLabel htmlFor="kyc-alamat">Alamat tempat tinggal</FieldLabel>
                  <Textarea
                    id="kyc-alamat"
                    rows={2}
                    value={isian.alamat}
                    onChange={(e) => ubah("alamat", e.target.value)}
                    placeholder="Jalan, nomor, kelurahan, kota"
                    aria-invalid={galatTahap.some((g) => g.kunci === "alamat")}
                    disabled={busy}
                  />
                  <FieldError
                    errors={galatTahap.filter((g) => g.kunci === "alamat").map((g) => ({ message: g.pesan }))}
                  />
                  <FieldDescription>
                    Opsional. Membantu petugas menilai pengajuan dan memverifikasi tempat usaha bila
                    dipakai untuk pinjaman.
                  </FieldDescription>
                </Field>
                <Field data-invalid={galatTahap.some((g) => g.kunci === "pekerjaan")}>
                  <FieldLabel htmlFor="kyc-pekerjaan">Pekerjaan</FieldLabel>
                  <Input
                    id="kyc-pekerjaan"
                    value={isian.pekerjaan}
                    onChange={(e) => ubah("pekerjaan", e.target.value)}
                    placeholder="Mis. Karyawan swasta, pedagang"
                    aria-invalid={galatTahap.some((g) => g.kunci === "pekerjaan")}
                    disabled={busy}
                  />
                  <FieldError
                    errors={galatTahap.filter((g) => g.kunci === "pekerjaan").map((g) => ({ message: g.pesan }))}
                  />
                  <FieldDescription>
                    Sebutkan yang paling menggambarkan penghasilan Anda sekarang, mis. “karyawan
                    swasta” atau “pedagang pasar”.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              </section>
            )}

            {/* Tahap 3, langkah 2: KONTAK DARURAT (opsional).
                Kolom ini tidak pernah menghalangi pengajuan; ia hanya jalan
                menghubungi nasabah saat nomor utamanya tidak aktif. Kalimat
                pengantar menyebut aturannya sekaligus — "opsional" per kolom
                membuat orang mengira boleh mengisi separuh, padahal yang ditolak
                hanya nilai yang salah bentuk. */}
            {nomorStage === 3 && !terkunci && (
              <section
                aria-labelledby="kyc-langkah-darurat"
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <JudulLangkah id="darurat" status={statusPerTahap.darurat} />
              <FieldGroup className="mt-3">
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Boleh dikosongkan seluruhnya. Kolom yang dibiarkan kosong tidak menahan pengajuan;
                  yang ditolak hanya kolom yang diisi dengan nilai berbentuk salah.
                </p>
                <Field data-invalid={galatTahap.some((g) => g.kunci === "namaKontakDarurat")}>
                  <FieldLabel htmlFor="kyc-darurat-nama">
                    Nama kontak darurat <PenandaOpsional />
                  </FieldLabel>
                  <Input
                    id="kyc-darurat-nama"
                    value={isian.namaKontakDarurat}
                    onChange={(e) => ubah("namaKontakDarurat", e.target.value)}
                    placeholder="Mis. Siti Rahayu"
                    aria-invalid={galatTahap.some((g) => g.kunci === "namaKontakDarurat")}
                    disabled={busy}
                  />
                  <FieldError
                    errors={galatTahap
                      .filter((g) => g.kunci === "namaKontakDarurat")
                      .map((g) => ({ message: g.pesan }))}
                  />
                  <FieldDescription>
                    Dipakai hanya bila petugas perlu menghubungi Anda dan nomor Anda sendiri tidak bisa
                    dihubungi.
                  </FieldDescription>
                </Field>
                <Field data-invalid={galatTahap.some((g) => g.kunci === "nomorKontakDarurat")}>
                  <FieldLabel htmlFor="kyc-darurat-nomor">
                    Nomor WhatsApp / telepon kontak darurat <PenandaOpsional />
                  </FieldLabel>
                  <Input
                    id="kyc-darurat-nomor"
                    inputMode="tel"
                    autoComplete="off"
                    value={isian.nomorKontakDarurat}
                    onChange={(e) => ubah("nomorKontakDarurat", e.target.value)}
                    placeholder="62812xxxxxxx"
                    aria-invalid={galatTahap.some((g) => g.kunci === "nomorKontakDarurat")}
                    disabled={busy}
                  />
                  <FieldError
                    errors={galatTahap
                      .filter((g) => g.kunci === "nomorKontakDarurat")
                      .map((g) => ({ message: g.pesan }))}
                  />
                  <FieldDescription>
                    Format 62… seperti nomor WhatsApp Anda. Angka yang salah ketik lebih buruk daripada
                    kolom ini kosong.
                  </FieldDescription>
                </Field>
                <Field data-invalid={galatTahap.some((g) => g.kunci === "hubunganKontakDarurat")}>
                  <FieldLabel htmlFor="kyc-darurat-hubungan">
                    Hubungan dengan Anda <PenandaOpsional />
                  </FieldLabel>
                  <Input
                    id="kyc-darurat-hubungan"
                    list="kyc-darurat-hubungan-saran"
                    autoComplete="off"
                    value={isian.hubunganKontakDarurat}
                    onChange={(e) => ubah("hubunganKontakDarurat", e.target.value)}
                    placeholder="Mis. keluarga, pasangan, teman"
                    aria-invalid={galatTahap.some((g) => g.kunci === "hubunganKontakDarurat")}
                    disabled={busy}
                  />
                  {/* `datalist` bawaan browser: saran ketik tanpa menutup kolom
                      bagi hubungan lain yang tidak ada di daftar. */}
                  <datalist id="kyc-darurat-hubungan-saran">
                    {SARAN_HUBUNGAN_DARURAT.map((nama) => (
                      <option key={nama} value={nama} />
                    ))}
                  </datalist>
                  <FieldError
                    errors={galatTahap
                      .filter((g) => g.kunci === "hubunganKontakDarurat")
                      .map((g) => ({ message: g.pesan }))}
                  />
                  <FieldDescription>
                    Dipakai petugas untuk memperkenalkan diri saat menelepon, mis. “saya dari PINDAI,
                    rekan kerja Bapak”.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              </section>
            )}

            {/* Tahap 3, langkah 3: informasi pendukung + bukti penghasilan. */}
            {nomorStage === 3 && !terkunci && (
              <section
                aria-labelledby="kyc-langkah-pendukung"
                className="border-t border-border pt-4 first:border-t-0 first:pt-0"
              >
              <JudulLangkah id="pendukung" status={statusPerTahap.pendukung} />
              <div className="mt-3 space-y-4">
                <FieldGroup>
                  <Field data-invalid={galatTahap.some((g) => g.kunci === "penghasilan")}>
                    <FieldLabel htmlFor="kyc-penghasilan">Penghasilan per bulan</FieldLabel>
                    <div className="relative">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                      >
                        Rp
                      </span>
                      {/* Yang TERLIHAT selalu bentuk berkelompok ("8.000.000"),
                          sedangkan yang disimpan tetap digit mentah. Nilai dari
                          server juga sudah berkelompok, jadi tanpa pengelompokan
                          ini kolom berubah bentuk begitu satu angka diketik. */}
                      <Input
                        id="kyc-penghasilan"
                        inputMode="numeric"
                        autoComplete="off"
                        className="pl-8 tabular-nums"
                        value={kelompokkanDigit(isian.penghasilan)}
                        onChange={(e) => ubah("penghasilan", e.target.value.replace(/\D/g, ""))}
                        placeholder="5.000.000"
                        aria-invalid={galatTahap.some((g) => g.kunci === "penghasilan")}
                        disabled={busy}
                      />
                    </div>
                    <FieldError
                      errors={galatTahap
                        .filter((g) => g.kunci === "penghasilan")
                        .map((g) => ({ message: g.pesan }))}
                    />
                    <FieldDescription>
                      Angka saja, pemisah ribuan ditambahkan otomatis.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={galatTahap.some((g) => g.kunci === "sumberPenghasilan")}>
                    <FieldLabel htmlFor="kyc-sumber">Sumber penghasilan</FieldLabel>
                    <Input
                      id="kyc-sumber"
                      list="kyc-sumber-saran"
                      autoComplete="off"
                      value={isian.sumberPenghasilan}
                      onChange={(e) => ubah("sumberPenghasilan", e.target.value)}
                      placeholder="Pilih dari daftar atau tulis sendiri"
                      aria-invalid={galatTahap.some((g) => g.kunci === "sumberPenghasilan")}
                      disabled={busy}
                    />
                    <datalist id="kyc-sumber-saran">
                      {SARAN_SUMBER_PENGHASILAN.map((nama) => (
                        <option key={nama} value={nama} />
                      ))}
                    </datalist>
                    <FieldError
                      errors={galatTahap
                        .filter((g) => g.kunci === "sumberPenghasilan")
                        .map((g) => ({ message: g.pesan }))}
                    />
                    <FieldDescription>
                      Tekan kolomnya untuk melihat pilihan, atau tulis sendiri bila tidak ada yang
                      cocok. Boleh menyebut lebih dari satu sumber.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={galatTahap.some((g) => g.kunci === "namaBank")}>
                    <FieldLabel htmlFor="kyc-bank">
                      Bank / e-wallet <PenandaOpsional />
                    </FieldLabel>
                    <Input
                      id="kyc-bank"
                      list="kyc-bank-saran"
                      autoComplete="off"
                      value={isian.namaBank}
                      onChange={(e) => ubah("namaBank", e.target.value)}
                      placeholder="Mis. BCA, DANA"
                      aria-invalid={galatTahap.some((g) => g.kunci === "namaBank")}
                      disabled={busy}
                    />
                    {/* `datalist` bawaan browser: memberi saran ketik tanpa
                        menutup kolom bagi bank lain yang tidak ada di daftar. */}
                    <datalist id="kyc-bank-saran">
                      {SARAN_BANK_DAN_EWALLET.map((nama) => (
                        <option key={nama} value={nama} />
                      ))}
                    </datalist>
                    <FieldError
                      errors={galatTahap
                        .filter((g) => g.kunci === "namaBank")
                        .map((g) => ({ message: g.pesan }))}
                    />
                    <FieldDescription>
                      Bank atau dompet digital tempat dana dicairkan bila pengajuan disetujui, mis.
                      “BCA” atau “DANA”. Nama di luar daftar saran tetap diterima.
                    </FieldDescription>
                  </Field>
                  <Field data-invalid={galatTahap.some((g) => g.kunci === "nomorRekening")}>
                    <FieldLabel htmlFor="kyc-rekening">
                      Nomor rekening <PenandaOpsional />
                    </FieldLabel>
                    <Input
                      id="kyc-rekening"
                      inputMode="numeric"
                      autoComplete="off"
                      // Batas 20 angka mengikuti aturan pencairan pinjaman
                      // ("6 sampai 20 angka"), bukan batas KYC yang lebih longgar.
                      maxLength={20}
                      className="tabular-nums"
                      value={isian.nomorRekening}
                      onChange={(e) => ubah("nomorRekening", e.target.value.replace(/\D/g, ""))}
                      placeholder="Mis. 1234567890"
                      aria-invalid={galatTahap.some((g) => g.kunci === "nomorRekening")}
                      disabled={busy}
                    />
                    <FieldError
                      errors={galatTahap
                        .filter((g) => g.kunci === "nomorRekening")
                        .map((g) => ({ message: g.pesan }))}
                    />
                    <FieldDescription>
                      6 sampai 20 angka. Dipakai bila pengajuan disetujui; di ringkasan tampil
                      bertopeng ({maskRekening(isian.nomorRekening)}).
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="kyc-catatan">
                      Catatan untuk petugas <PenandaOpsional />
                    </FieldLabel>
                    <Textarea
                      id="kyc-catatan"
                      rows={2}
                      maxLength={MAKS_CATATAN_KYC}
                      value={isian.catatanPeminjam}
                      onChange={(e) => ubah("catatanPeminjam", e.target.value)}
                      placeholder="Mis. lebih enak dihubungi sore hari setelah jam 4"
                      disabled={busy}
                    />
                    <FieldDescription>
                      {isian.catatanPeminjam.length}/{MAKS_CATATAN_KYC} karakter. Petugas membaca ini
                      sebelum menghubungi Anda.
                    </FieldDescription>
                  </Field>
                </FieldGroup>

                <div className="space-y-3">
                  <UnggahDokumen
                    label={LABEL_SLOT_BERKAS.bukti}
                    keterangan="Slip gaji, mutasi rekening, atau surat keterangan usaha."
                    accept="image/jpeg,image/png,image/webp"
                    nilai={berkas.bukti}
                    onUbah={(d) => ubahBerkas("bukti", d)}
                    onBerkasDipilih={(file) => tampilkanPratinjau("bukti", file)}
                    mintaUrl={() => buatUrl({})}
                    periksa={(id, label) => periksa({ id, label }).then(() => undefined)}
                    disabled={busy}
                  />
                  {pratinjau.bukti?.url != null && (
                    <WatermarkedDoc
                      src={pratinjau.bukti.url}
                      label={`Pratinjau bukti penghasilan${pratinjau.bukti.nama === "" ? "" : ` (${pratinjau.bukti.nama})`} (belum tersimpan)`}
                    />
                  )}
                  {berkasTersimpan.bukti !== null && (
                    <WatermarkedDoc
                      src={data.url.buktiPenghasilan ?? ""}
                      label={LABEL_SLOT_BERKAS.bukti}
                    />
                  )}
                  <KycPetunjukFoto tahapId="pendukung" />
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                    <CircleDashed className="size-3.5" aria-hidden /> Ringkasan data Anda
                  </p>
                  <dl className="mt-2 space-y-1 text-[11px] leading-4 text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <dt>NIK</dt>
                      <dd className="tabular-nums">{maskNik(isian.nik)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>WhatsApp</dt>
                      <dd className="tabular-nums">{maskWhatsApp(isian.nomorWhatsApp)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Rekening</dt>
                      <dd className="tabular-nums">{maskRekening(isian.nomorRekening)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
              </section>
            )}
          </div>

          {/* Satu daftar "yang masih kurang" per TAHAP — bukan per kolom: pesan
              tiap kolom sudah muncul tepat di bawah kolomnya (`FieldError`),
              jadi mengulang seluruhnya di sini hanya mengucapkan kalimat yang
              sama dua kali. Yang tersisa adalah label kelengkapan dari aturan
              yang sama dengan server (`kekuranganKyc`), termasuk berkas yang
              belum diunggah — satu-satunya hal yang tidak punya baris galat
              sendiri. */}
          {!terkunci && kurangTahap.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-2">
              <p className="text-[11px] font-semibold text-foreground">
                Yang masih kurang di tahap ini
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-muted-foreground">
                {kurangTahap.map((pesan) => (
                  <li key={pesan}>{pesan}</li>
                ))}
              </ul>
            </div>
          )}

            {/* Aksi utama tahap ini. */}
            <KycBarisAksi
              busy={busy}
              menyimpan={menyimpan}
              bolehKembali={tahapSebelumStage(tahap.id) !== null}
              tahapTerakhir={nomorStage === 3}
              // Saat persetujuan belum tercatat server menolak semua simpanan
              // (`pastikanPersetujuan`), jadi tombol maju di sini hanya berakhir galat.
              bolehLanjut={!terkunci}
              bolehAjukan={bolehAjukan}
              tampilkanAjukan={data.status !== "VERIFIED"}
              labelAjukan={labelAjukan}
              sisaWajib={data.kekurangan.length}
              tersimpanPada={data.diperbaruiPada}
              catatan={catatanAksi}
              onSebelumnya={() => {
                const sebelumnya = tahapSebelumStage(tahap.id);
                if (sebelumnya !== null) menuju(sebelumnya);
              }}
              onLanjut={() => void simpanDanLanjut()}
              onAjukan={() => void ajukanPeninjauan()}
              onBukaKurang={() => menuju(progres.tahapBerikutnya)}
              judulTujuan={
                // Pintasan ini hanya berguna bila isian yang kurang ada di tahap
                // LAIN; kalau masih di tahap ini, isiannya sudah ada di layar.
                stageUntukTahap(progres.tahapBerikutnya) === nomorStage
                  ? null
                  : tahapKyc(progres.tahapBerikutnya).judul
              }
            />
        </div>
      </div>

      {data.keputusanOtomatis !== null && (
        <KycPemeriksaanOtomatis keputusan={data.keputusanOtomatis} />
      )}

      {tampilkanRiwayatKyc(data.status) && <KycRiwayatList riwayat={data.riwayat} />}
    </section>
  );
}

/**
 * KOTAK HASIL PEMERIKSAAN OTOMATIS, sisi nasabah.
 *
 * Menampilkan waktu, alasan, hasil SETIAP pemeriksaan, versi aturan, sumber, dan
 * pelakunya. Yang tidak boleh hilang: keterangan bahwa hasil yang belum
 * DITERAPKAN tidak mengubah status apa pun. Mesin hanya menerapkan `VERIFIED`;
 * hasil lain dicatat sebagai bahan peninjauan, jadi tanpa kalimat itu nasabah
 * bisa menyangka statusnya sudah diputuskan mesin padahal masih menunggu petugas.
 *
 * Bentuk ringkas secara bawaan: daftar sampai sembilan aturan dengan pesan dan
 * rinciannya bisa setinggi layar ponsel sendiri, dan kartu ini muncul persis di
 * bawah tahap yang sedang dikerjakan. Yang selalu terlihat: putusan mesin, cacah
 * hasil yang perlu diperhatikan, dan peringatan status di atas. Daftar lengkapnya
 * dibuka atas permintaan; tidak ada keterangan yang dihapus, hanya pindah lipatan,
 * dan urutan aturannya tetap sama dengan yang dipakai meja kerja petugas.
 */
export function KycPemeriksaanOtomatis({
  keputusan,
}: {
  keputusan: NonNullable<DataKyc["keputusanOtomatis"]>;
}) {
  // Hanya cacah yang PERLU DIPERHATIKAN diberi angka; "lulus" cukup diwakili
  // selisihnya terhadap jumlah aturan, jadi barisnya tidak menumpuk empat angka
  // yang tiga di antaranya tidak perlu ditindaklanjuti.
  const cacahGagal = keputusan.aturan.filter((r) => r.status === "gagal").length;
  const cacahBelumPasti = keputusan.aturan.filter((r) => r.status === "tidak_pasti").length;
  const cacat = [
    cacahGagal > 0 ? `${cacahGagal} gagal` : null,
    cacahBelumPasti > 0 ? `${cacahBelumPasti} belum pasti` : null,
  ].filter((teks): teks is string => teks !== null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ShieldAlert className="size-3.5" aria-hidden /> Pemeriksaan otomatis terakhir
        </p>
        <span className="text-[11px] text-muted-foreground">{waktu(keputusan.waktu)}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-foreground">{keputusan.ringkasan}</p>
      {/* Hasil yang TIDAK diterapkan tidak mengubah status apa pun. Tanpa
          kalimat ini, nasabah bisa menyangka statusnya sudah diputuskan mesin. */}
      {!keputusan.diterapkan && (
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Hasil ini <strong>belum mengubah status</strong>, pengajuan tetap menunggu keputusan
          petugas. Perbaiki hal di bawah lalu kirim ulang untuk diperiksa lagi.
        </p>
      )}
      <Accordion type="single" collapsible className="mt-1.5">
        <AccordionItem value="rincian" className="border-b-0">
          <AccordionTrigger className="min-h-11 gap-2 px-1 py-2 text-[11px] font-medium text-muted-foreground hover:no-underline">
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left">
              Rincian {keputusan.aturan.length} pemeriksaan
              {cacat.length > 0 && (
                <span className="font-semibold text-foreground">{cacat.join(" · ")}</span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <KycDaftarAturanOtomatis aturan={keputusan.aturan} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p className="mt-2 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
        Versi aturan {keputusan.versiAturan} · sumber {keputusan.sumber} · pelaku {keputusan.aktor}.
        Keputusan otomatis tidak membuktikan keaslian KTP dan tidak diverifikasi ke Dukcapil.
      </p>
    </div>
  );
}

/**
 * Daftar hasil per aturan: lencana status, judul, pesan mesin apa adanya, lalu
 * rincian pengukurannya.
 *
 * Dipisah dari kartunya karena lipatan hanya merender isinya saat dibuka, jadi
 * tanpa pemisahan ini tidak ada cara menguji isi tersembunyi itu. Urutannya
 * sengaja persis urutan aturan mesin, sama dengan yang dibaca petugas di meja
 * kerja, supaya kedua sisi bisa dibandingkan baris per baris.
 */
export function KycDaftarAturanOtomatis({
  aturan,
}: {
  aturan: NonNullable<DataKyc["keputusanOtomatis"]>["aturan"];
}) {
  return (
    <ul className="space-y-1.5">
      {aturan.map((r) => (
        <li key={r.id} className="flex flex-col gap-2.5 text-[11px] sm:flex-row sm:items-start">
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 font-medium ${
              r.status === "lulus"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : r.status === "gagal"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {r.status === "lulus" ? "Lulus" : r.status === "gagal" ? "Gagal" : "Belum pasti"}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{r.judul}</span>
            {" · "}
            {r.pesan}
            {r.detail.length > 0 && (
              <span className="block text-muted-foreground">{r.detail.join("; ")}.</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
