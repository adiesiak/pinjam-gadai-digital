import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { CheckCircle2, FileWarning, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import { WatermarkedDoc } from "@/components/WatermarkedDoc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import {
  KETERANGAN_STATUS_KYC,
  LABEL_STATUS_KYC,
  keputusanWajibAlasan,
  tujuanSah,
  type StatusKyc,
} from "@/lib/kycStatus";
import { cn } from "@/lib/utils";

/**
 * ANTREAN KYC — sisi petugas.
 *
 * Satu tempat untuk memutuskan pengajuan verifikasi identitas: daftar antrean
 * (dengan cacah per status), rincian isian + berkas ber-watermark, riwayat
 * perubahan status, dan tombol keputusan.
 *
 * Aturan yang dipegang di sini AGRAR tidak berbeda dari server:
 * - Tombol yang tampil hanya tujuan yang SAH dari status sekarang
 *   (`tujuanSah(status, "admin")` dari `lib/kycStatus.ts`) — transisi di luar
 *   daftar itu tidak pernah bisa dikirim.
 * - Tombol tolak/minta-perbaikan tetap nonaktif sampai catatan diisi, karena
 *   server menolaknya (dan nasabah berhak tahu alasannya).
 * - Pesan galat server ditampilkan apa adanya: UI tidak menebak sendiri.
 */

type DaftarKyc = FunctionReturnType<typeof api.kyc.daftarKycAdmin>;
type ItemKyc = DaftarKyc["item"][number];
type DetailKyc = NonNullable<FunctionReturnType<typeof api.kyc.detailKycAdmin>>;

/** Bentuk data yang diterima bagian tampilan murni (dipakai uji render). */
export type ItemKycTampil = ItemKyc;
export type DetailKycTampil = DetailKyc;

const URUTAN_SARING: StatusKyc[] = [
  "PENDING_REVIEW",
  "NEEDS_CORRECTION",
  "REVERIFICATION_REQUIRED",
  "IN_PROGRESS",
  "VERIFIED",
  "REJECTED",
];

const JUDUL_KEPUTUSAN: Record<string, string> = {
  VERIFIED: "Verifikasi",
  NEEDS_CORRECTION: "Minta perbaikan",
  REJECTED: "Tolak",
  REVERIFICATION_REQUIRED: "Tandai perlu verifikasi ulang",
};

function waktu(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Ukuran berkas untuk dibaca petugas (KB/MB) — bukan angka byte mentah. */
function ukuranBerkas(byte: number | null): string {
  if (byte === null) return "ukuran tidak tercatat";
  if (byte >= 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(byte / 1024))} KB`;
}

/* ==========================================================================
 * Bagian tampilan MURNI
 * ========================================================================== */

/** Satu baris antrean. */
export function BarisKyc({
  item,
  aktif,
  onPilih,
}: {
  item: ItemKycTampil;
  aktif: boolean;
  onPilih: (userId: Id<"users">) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPilih(item.userId)}
      aria-pressed={aktif}
      className={cn(
        "flex w-full flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        aktif ? "border-primary/40 bg-primary/[0.06]" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.nama}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {item.email ?? "tanpa email"} · diajukan {waktu(item.diajukanPada)}
        </p>
      </div>
      {item.kekurangan.length > 0 && (
        <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <FileWarning className="size-3.5 shrink-0" aria-hidden />
          {item.kekurangan.length} berkas/isi kurang
        </span>
      )}
      {/* Putusan yang diambil dengan aturan lama harus kelihatan DARI DAFTAR —
          bukan hanya setelah membuka satu per satu. */}
      {item.aturanUsang && (
        <span className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900">
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden /> aturan lama
        </span>
      )}
      <StatusKycBadge status={item.status} />
    </button>
  );
}

/** Rincian satu pengajuan: isian, kelengkapan, dan berkas ber-watermark. */
export function KycDetailRingkas({ detail }: { detail: DetailKycTampil }) {
  const barisIsian: Array<[string, string]> = [
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
    ["Catatan nasabah", detail.catatanPeminjam ?? "—"],
  ];

  return (
    <div className="space-y-3">
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

      {/* Dasar pemrosesan: petugas tidak memverifikasi identitas tanpa persetujuan
          pemrosesan data yang tercatat dan masih berlaku. */}
      {detail.persetujuanAktif ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
          Persetujuan pemrosesan data tercatat {waktu(detail.persetujuan?.pada ?? null)} (versi{" "}
          {detail.persetujuan?.versi ?? "—"}) oleh {detail.persetujuan?.olehLabel ?? "—"}.
        </p>
      ) : (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
        >
          Nasabah <strong>belum memiliki persetujuan pemrosesan data yang berlaku</strong>. Jangan
          verifikasi identitas sebelum dasar pemrosesan tercatat.
        </p>
      )}

      {/* HASIL PEMERIKSAAN nomor WhatsApp: nomor yang terbukti aktif lewat kode
          OTP. Petugas memakainya sebagai bahan pertimbangan — belum terverifikasi
          TIDAK otomatis menggagalkan pengajuan, tetapi wajib terlihat. */}
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

      {/* Dasar ATURAN putusan terakhir: "terverifikasi" tanpa menyebut atas
          aturan apa tidak bisa ditelusuri bila aturannya berubah. */}
      {detail.aturanTerverifikasi !== null && (
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
      )}

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

      <dl className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {barisIsian.map(([label, nilai]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-3 py-2 text-xs">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-right font-medium">{nilai}</dd>
          </div>
        ))}
      </dl>

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
              {meta.ada ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Diperiksa server: {meta.jenis ?? "—"} · {ukuranBerkas(meta.ukuranByte)} ·{" "}
                  {meta.lebar !== null && meta.tinggi !== null
                    ? `${meta.lebar}×${meta.tinggi} px`
                    : "dimensi —"}{" "}
                  · sidik jari {(meta.sidikJari ?? "—").slice(0, 12)} · aturan{" "}
                  {meta.versiAturan ?? "—"}
                </p>
              ) : (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  Belum diperiksa server — berkas belum bisa ditautkan.
                </p>
              )}
              {meta.aturanUsang && (
                <p className="text-[10px] leading-4 text-amber-800">
                  Diperiksa dengan aturan lama — pertimbangkan pemeriksaan ulang.
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

/* ==========================================================================
 * Panel yang tersambung server
 * ========================================================================== */

export function KycPanel() {
  const [saring, setSaring] = useState<StatusKyc | null>("PENDING_REVIEW");
  const [dipilih, setDipilih] = useState<Id<"users"> | null>(null);
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const daftar = useQuery(api.kyc.daftarKycAdmin, saring === null ? {} : { status: saring });
  const detail = useQuery(api.kyc.detailKycAdmin, dipilih === null ? "skip" : { userId: dipilih });
  const tinjau = useMutation(api.kyc.tinjauKyc);

  const putuskan = async (keputusan: StatusKyc) => {
    if (dipilih === null) return;
    setBusy(true);
    setGalat(null);
    try {
      await tinjau({
        userId: dipilih,
        keputusan: keputusan as "VERIFIED" | "NEEDS_CORRECTION" | "REJECTED" | "REVERIFICATION_REQUIRED",
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      setCatatan("");
      toast.success(`Keputusan tersimpan: ${LABEL_STATUS_KYC[keputusan]}.`);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Keputusan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const tujuan = detail === null || detail === undefined ? [] : tujuanSah(detail.status, "admin");
  const catatanCukup = catatan.trim().length >= 3;

  return (
    <div className="space-y-4">
      {/* ===== Cacah per status + saringan ===== */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSaring(null)}
          aria-pressed={saring === null}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium",
            saring === null
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          Semua {daftar === undefined ? "" : `(${daftar.total})`}
        </button>
        {URUTAN_SARING.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setSaring(status)}
            aria-pressed={saring === status}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium",
              saring === status
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {LABEL_STATUS_KYC[status]}{" "}
            {daftar === undefined ? "" : `(${daftar.cacah[status] ?? 0})`}
          </button>
        ))}
      </div>

      {galat !== null && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {galat}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ===== Daftar antrean ===== */}
        <div className="space-y-2">
          {daftar === undefined ? (
            <SkeletonBarisDaftar baris={4} />
          ) : daftar.item.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-muted-foreground">
              Tidak ada pengajuan pada status ini.
            </div>
          ) : (
            daftar.item.map((item) => (
              <BarisKyc
                key={item.userId}
                item={item}
                aktif={item.userId === dipilih}
                onPilih={(id) => {
                  setDipilih(id);
                  setCatatan("");
                  setGalat(null);
                }}
              />
            ))
          )}
        </div>

        {/* ===== Rincian + keputusan ===== */}
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {dipilih === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden /> Pilih satu pengajuan untuk melihat isian,
              berkasnya, dan memutuskan.
            </p>
          ) : detail === undefined ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat rincian…
            </p>
          ) : detail === null ? (
            <p className="text-xs text-muted-foreground">
              Baris KYC nasabah ini tidak ditemukan (mungkin akunnya sudah dihapus).
            </p>
          ) : (
            <div className="space-y-4">
              <KycDetailRingkas detail={detail} />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-navy">
                  <ShieldAlert className="size-3.5" aria-hidden /> Keputusan petugas
                </p>
                {tujuan.length === 0 ? (
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    Tidak ada keputusan yang sah dari status ini. Nasabah harus mengajukan lebih dulu
                    (status Menunggu peninjauan).
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Status VERIFIED berarti identitas sudah diperiksa — bukan persetujuan pinjaman
                      dan bukan bukti dana cair.
                    </p>
                    <Input
                      className="mt-2 bg-white"
                      placeholder="Catatan keputusan (wajib untuk menolak / minta perbaikan)"
                      value={catatan}
                      maxLength={300}
                      onChange={(e) => setCatatan(e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tujuan.map((ke) => {
                        const butuhAlasan = keputusanWajibAlasan(ke);
                        return (
                          <Button
                            key={ke}
                            type="button"
                            size="sm"
                            variant={ke === "VERIFIED" ? "default" : "outline"}
                            className="gap-1.5"
                            disabled={busy || (butuhAlasan && !catatanCukup)}
                            title={
                              butuhAlasan && !catatanCukup ? "Isi catatan minimal 3 karakter" : undefined
                            }
                            onClick={() => void putuskan(ke)}
                          >
                            {ke === "VERIFIED" ? (
                              <CheckCircle2 className="size-3.5" />
                            ) : (
                              <ShieldAlert className="size-3.5" />
                            )}
                            {JUDUL_KEPUTUSAN[ke] ?? LABEL_STATUS_KYC[ke]}
                          </Button>
                        );
                      })}
                    </div>
                    {tujuan.some((ke) => keputusanWajibAlasan(ke)) && !catatanCukup && (
                      <p className="mt-1.5 text-[11px] text-amber-800">
                        Menolak atau meminta perbaikan wajib disertai catatan (minimal 3 karakter) —
                        nasabah membacanya.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-navy">Riwayat status</p>
                <div className="mt-2">
                  <KycRiwayatRingkas riwayat={detail.riwayat} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
