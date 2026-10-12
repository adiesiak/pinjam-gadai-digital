import { CheckCircle2, Database, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Id } from "@/convex/_generated/dataModel";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

/**
 * Tipe & komponen bersama panel admin.
 *
 * Skala ikon panel admin — jaga agar tetap seragam:
 * - `size-3.5` → inline di dalam teks, badge, marquee keamanan, item navigasi tab
 * - `size-4`   → di dalam tombol/tautan aksi dan spinner baris "Memuat…"
 * - `size-5`   → header kartu, empty state, dan layar gerbang (gate)
 * Ketebalan mengikuti bawaan lucide (2) — jangan menambahkan `strokeWidth`.
 */

export type LoanRow = {
  _id: Id<"loans">;
  _creationTime: number;
  nomorReferensi: string;
  pokokPinjaman: number;
  /** Nominal asli pengajuan — berbeda dari pokokPinjaman bila disetujui sebagian. */
  pokokDiajukan?: number;
  /** Bunga khusus nasabah (persen); null = default Pengaturan Sistem. */
  persenBunga: number | null;
  tujuan: string;
  status:
    | "diajukan"
    | "sedang_direview"
    | "disetujui"
    | "ditolak"
    | "dibatalkan"
    | "didanai"
    | "lunas";
  catatanReview?: string;
  namaLengkap: string;
  namaBank: string | null;
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
  userIdPeminjam: Id<"users">;
  /** Pendana yang ditetapkan admin (model 1 pinjaman = 1 pendana). */
  pendanaId?: Id<"users"> | null;
  pendanaNama?: string | null;
  tenorHari: number | null;
  /** Diisi (1/3/6 bln) bila pinjaman memakai skema bulanan. */
  tenorBulan: number | null;
  cicilanPerBulan: number | null;
  biayaLayananTotal: number | null;
  imbalHasilTotal: number | null;
  totalKewajiban: number | null;
  nik: string | null;
  nomorWhatsApp: string | null;
  penghasilanBulanan: number | null;
  sumberPenghasilan: string | null;
  dokKtpId: Id<"_storage"> | null;
  dokSelfieKtpId: Id<"_storage"> | null;
  dokSlipGajiId: Id<"_storage"> | null;
  lokasiAjukan: { lat: number; lng: number; akurasi: number } | null;
  jatuhTempoPada: number | null;
  sisaHari: number | null;
  hariTerlambat: number | null;
  dendaTerlambat: number | null;
  totalKewajibanDenganPenalti: number | null;
};

export type PawnRow = {
  _id: Id<"pawns">;
  _creationTime: number;
  nomorReferensi: string;
  deskripsiBarang: string;
  kategori: string;
  alamatPenilaian: string;
  status: "diajukan" | "sedang_dinilai" | "disetujui" | "ditolak" | "aktif" | "menunggu_pelepasan" | "lunas_dilepas";
  nilaiTaksiran?: number;
  hargaPasar: number | null;
  kondisiFisik: string | null;
  kodeRakVault: string | null;
  catatanReview?: string;
  namaLengkap: string;
  namaBank: string | null;
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
  /** Akun pemohon — dipakai untuk membuka data diri tersimpan di panel review. */
  userIdPeminjam: Id<"users">;
  /** Skema B: pokok & sisa pokok berjalan. */
  pokokGadai?: number;
  persenSewaModal?: number;
  sisaPokok?: number;
  dicairkanPada?: number;
};

/** Ringkasan pengajuan Kredit Barang (Skema C) untuk penghitung tab admin. */
export type KreditRow = {
  _id: Id<"kreditBarang">;
  status: "diajukan" | "sedang_ditinjau" | "disetujui" | "ditolak" | "didanai" | "lunas";
};

/** Tiga antrean pengajuan dari `admin.adminOverview`, dipakai bersama tab dan panel "Hari Ini". */
export type AdminOverviewData = {
  loans: LoanRow[];
  pawns: PawnRow[];
  kredit: KreditRow[];
};

/** Ringkasan ledger internal untuk lencana tab — mengikuti `admin.ledgerSummary`. */
export type LedgerSummary = {
  totalDebit: number;
  totalKredit: number;
  entryCount: number;
  seimbang: boolean;
  /** Total biaya platform yang sudah dijurnal (platform:FEE, sisi debit). */
  pendapatanPlatform: number;
};

/** Satu pilihan pada baris sub-tab: label, tooltip, dan predikat penyaring. */
export type OpsiSubTab<T> = {
  id: string;
  label: string;
  /** Penjelasan isi sub-tab — dipakai sebagai tooltip tombol. */
  hint: string;
  cocok: (baris: T) => boolean;
};

/**
 * Lencana angka seragam untuk menu admin: netral, "OK" hijau, "!" merah
 * berdenyut, lain kuning. Dipakai sidebar desktop, chip modul, dan bilah bawah
 * agar satu status tampil sama di semua tempat.
 */
export function LencanaTab({ badge }: { badge: string | null }) {
  if (badge === null || badge === undefined || badge === "0") return null;
  const warna =
    badge === "OK"
      ? "bg-emerald-100 text-emerald-700"
      : badge === "!"
        ? "animate-pulse bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${warna}`}
    >
      {badge}
    </span>
  );
}

/**
 * Baris sub-tab status: grup tombol `aria-pressed` dengan jumlah tiap sub-tab.
 *
 * Sengaja bukan `role="tab"`: ini penyaring satu daftar, bukan panel terpisah,
 * sehingga tidak butuh pasangan `tablist`/`tabpanel` yang bisa salah dipasang.
 */
export function SubTabFilter<T>({
  nama,
  opsi,
  aktif,
  onPilih,
  baris,
}: {
  /** Label grup untuk pembaca layar. */
  nama: string;
  opsi: readonly OpsiSubTab<T>[];
  /** Id sub-tab yang sedang dipilih. */
  aktif: string;
  onPilih: (id: string) => void;
  /** Sumber hitungan jumlah baris per sub-tab. */
  baris: readonly T[];
}) {
  return (
    <div role="group" aria-label={nama} className="flex flex-wrap gap-1.5">
      {opsi.map((o) => {
        const dipilih = o.id === aktif;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={dipilih}
            title={o.hint}
            onClick={() => onPilih(o.id)}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors",
              dipilih
                ? "border-primary bg-primary text-primary-foreground"
                : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary",
            )}
          >
            {o.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                dipilih ? "bg-white/25" : "bg-slate-100 text-slate-600",
              )}
            >
              {baris.filter(o.cocok).length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Satu metrik label/nilai untuk kartu panel admin.
 *
 * Dipakai menggantikan kolom tabel yang terlalu banyak: di layar selebar
 * laptop, tabel 12 kolom hanya bisa dibaca dengan menggeser mendatar, jadi
 * barisnya ditampilkan sebagai kartu berisi metrik 2 kolom.
 */
export function MetrikKartu({
  label,
  nilai,
  className,
}: {
  label: string;
  nilai: ReactNode;
  /**
   * Kelas tambahan untuk kartu ini — dipakai pemanggil yang memerlukan permukaan
   * berbeda (mis. kaca di modal detail pinjaman). Bawaannya tetap kartu netral
   * abu-abu yang sudah dipakai panel-panel lain, jadi tidak ada panel yang
   * berubah tampilannya karena penambahan ini.
   */
  className?: string;
}) {
  return (
    <div
      className={cn("min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2", className)}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-medium tabular-nums text-slate-900">
        {nilai}
      </dd>
    </div>
  );
}

export function QueueRow({
  reference,
  date,
  title,
  subtitle,
  status,
  onOpen,
}: {
  reference: string;
  date: string;
  title: string;
  subtitle: string;
  status: ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start justify-between gap-3 px-3 py-4 text-left transition-colors hover:bg-muted/50 active:bg-muted/70 sm:items-center sm:gap-4 sm:px-5"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground sm:truncate sm:leading-normal">
          {reference} · {date} · {subtitle}
        </p>
      </div>
      <div className="shrink-0 pt-0.5 sm:flex sm:items-center sm:gap-3">{status}</div>
    </button>
  );
}

/**
 * Placeholder pemuatan berpola untuk panel admin: baris rangka yang
 * menyerupai daftar sungguhan, menggantikan spinner + teks "Memuat…".
 * Tujuannya supaya tidak ada lompatan tata letak saat data tiba, dan agar
 * keadaan memuat terlihat seperti bagian dari produk — bukan jeda kosong.
 * Teksnya tetap disediakan untuk pembaca layar.
 *
 * Bentuknya kini tinggal memanggil `SkeletonBarisDaftar` bersama supaya seluruh
 * aplikasi memakai satu rangka daftar yang sama — tinggi baris, jarak, dan
 * lencananya tidak bisa lagi menyimpang antar panel.
 */
export function PanelMemuat({ baris = 3 }: { baris?: number }) {
  return <SkeletonBarisDaftar baris={baris} />;
}

export function EmptyQueue({
  icon: Icon,
  title,
  deskripsi,
  poin,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** Kalimat penjelas; ada bawaan bila tidak diisi. */
  deskripsi?: string;
  /** Daftar singkat apa yang akan muncul di tab ini saat ada data. */
  poin?: string[];
}) {
  return (
    <div className="animate-masuk rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50/70 px-6 py-12 text-center sm:py-14">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-sm font-semibold text-navy">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {deskripsi ?? "Antrean akan terisi otomatis saat nasabah mengirim pengajuan."}
      </p>
      {poin && poin.length > 0 && (
        <ul className="mx-auto mt-5 flex max-w-sm flex-col gap-2 text-left">
          {poin.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs leading-5 text-slate-600"
            >
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kelas bersama satu lencana kesehatan sistem (statis, bukan berjalan). */
const KELAS_KESEHATAN = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium";
const KESEHATAN_BAIK = "border-emerald-200 bg-emerald-50 text-emerald-700";
const KESEHATAN_PERHATIAN = "border-amber-200 bg-amber-50 text-amber-800";
const KESEHATAN_DARURAT = "border-red-200 bg-red-50 text-red-700 font-semibold";

/**
 * System Health Badges — pengganti running text (marquee) di kepala panel.
 *
 * Marquee lama memaksa admin menunggu teks berjalan untuk melihat status
 * keamanan; lencana statis di pojok kanan menampilkan ketiganya sekaligus dan
 * bisa dibaca kapan saja. Isinya tidak berubah: SSL, keseimbangan ledger,
 * kesiapan backup — plus peringatan merah bila kill switch sedang aktif.
 */
export function SecurityBar({ seimbang, killSwitch }: { seimbang: boolean; killSwitch: boolean }) {
  return (
    <div className={`border-b ${killSwitch ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-slate-50"}`}>
      <div
        role="status"
        aria-label="Kesehatan sistem"
        className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-end gap-1.5 px-3 py-1.5 sm:px-6"
      >
        <span className={`${KELAS_KESEHATAN} ${KESEHATAN_BAIK}`}>
          <ShieldCheck className="size-3.5" aria-hidden="true" /> SSL Aktif
        </span>
        {seimbang ? (
          <span className={`${KELAS_KESEHATAN} ${KESEHATAN_BAIK}`}>
            <Lock className="size-3.5" aria-hidden="true" /> Ledger Seimbang
          </span>
        ) : (
          <span className={`${KELAS_KESEHATAN} ${KESEHATAN_PERHATIAN}`}>
            <ShieldAlert className="size-3.5" aria-hidden="true" /> Ledger menunggu transaksi
          </span>
        )}
        <span className={`${KELAS_KESEHATAN} ${KESEHATAN_BAIK}`}>
          <Database className="size-3.5" aria-hidden="true" /> Backup Siap
        </span>
        {killSwitch && (
          <span className={`${KELAS_KESEHATAN} ${KESEHATAN_DARURAT}`}>
            <ShieldAlert className="size-3.5 animate-pulse" aria-hidden="true" /> Kill switch aktif — pengajuan diblokir
          </span>
        )}
      </div>
    </div>
  );
}
