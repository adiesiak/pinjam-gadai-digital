import { Database, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Id } from "@/convex/_generated/dataModel";

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
  status: "diajukan" | "sedang_direview" | "disetujui" | "ditolak" | "didanai" | "lunas";
  catatanReview?: string;
  namaLengkap: string;
  namaBank: string | null;
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
  userIdPeminjam: Id<"users">;
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

/**
 * Satu metrik label/nilai untuk kartu panel admin.
 *
 * Dipakai menggantikan kolom tabel yang terlalu banyak: di layar selebar
 * laptop, tabel 12 kolom hanya bisa dibaca dengan menggeser mendatar, jadi
 * barisnya ditampilkan sebagai kartu berisi metrik 2 kolom.
 */
export function MetrikKartu({ label, nilai }: { label: string; nilai: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
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
      className="flex w-full items-start justify-between gap-3 px-3 py-4 text-left transition-colors hover:bg-muted/50 sm:items-center sm:gap-4 sm:px-5"
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

export function EmptyQueue({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-sky-200 bg-white/70 px-6 py-14 text-center">
      <Icon className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        Antrean akan terisi otomatis saat nasabah mengirim pengajuan.
      </p>
    </div>
  );
}

export function SecurityBar({ seimbang, killSwitch }: { seimbang: boolean; killSwitch: boolean }) {
  return (
    <div className={`animate-masuk overflow-hidden border-b ${killSwitch ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="animate-marquee flex w-max items-center gap-8 py-1.5 text-[11px] font-medium text-navy">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex items-center gap-8 pr-8" aria-hidden={dup === 1}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-600" /> SSL Aktif
            </span>
            <span className="flex items-center gap-1.5">
              {seimbang ? (
                <><Lock className="size-3.5 text-emerald-600" /> Ledger Seimbang</>
              ) : (
                <><ShieldAlert className="size-3.5 animate-pulse text-amber-600" /> Ledger menunggu transaksi</>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-sky-600" /> Backup Siap
            </span>
            <span className="text-muted-foreground">
              Pengumuman sistem: semua aksi admin tercatat di audit trail.
            </span>
            {killSwitch && (
              <span className="flex items-center gap-1.5 font-bold text-red-600">
                <ShieldAlert className="size-3.5 animate-pulse" /> KILL SWITCH AKTIF — pengajuan diblokir
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
