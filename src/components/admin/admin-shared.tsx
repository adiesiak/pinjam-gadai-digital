import { Database, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Id } from "@/convex/_generated/dataModel";

export type LoanRow = {
  _id: Id<"loans">;
  _creationTime: number;
  nomorReferensi: string;
  pokokPinjaman: number;
  tujuan: string;
  status: "diajukan" | "sedang_direview" | "disetujui" | "ditolak" | "didanai" | "lunas";
  catatanReview?: string;
  namaLengkap: string;
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
  userIdPeminjam: Id<"users">;
  tenorHari: number | null;
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
  nomorRekening: string;
  catatanPeminjam?: string;
  emailPeminjam: string | null;
  /** Skema B: pendanaan & sisa pokok berjalan. */
  pokokGadai?: number;
  persenSewaModal?: number;
  sisaPokok?: number;
  dicairkanPada?: number;
};

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {reference} · {date} · {subtitle}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{status}</div>
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

export function VaultLogo3D({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="vaultBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="55%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <radialGradient id="vaultDial" cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="60%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>
      </defs>
      <rect x="4" y="8" width="56" height="46" rx="12" fill="url(#vaultBody)" />
      <rect x="12" y="16" width="40" height="30" rx="8" fill="#0C4A6E" opacity="0.25" />
      <circle cx="32" cy="31" r="10" fill="url(#vaultDial)" />
      <circle cx="32" cy="31" r="4" fill="#065F46" opacity="0.55" />
      <rect x="29" y="29" width="6" height="3" rx="1.5" fill="#F0FDF4" />
      <rect x="14" y="54" width="8" height="6" rx="2" fill="#0284C7" />
      <rect x="42" y="54" width="8" height="6" rx="2" fill="#0284C7" />
      <ellipse cx="24" cy="14" rx="10" ry="3" fill="white" opacity="0.35" />
    </svg>
  );
}

export function SecurityBar({ seimbang, killSwitch }: { seimbang: boolean; killSwitch: boolean }) {
  return (
    <div className={`overflow-hidden border-b ${killSwitch ? "border-red-200 bg-red-50" : "border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50"}`}>
      <div className="animate-marquee flex w-max items-center gap-8 py-1.5 text-[11px] font-medium text-navy">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex items-center gap-8 pr-8" aria-hidden={dup === 1}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-600" /> SSL Active
            </span>
            <span className="flex items-center gap-1.5">
              {seimbang ? (
                <><Lock className="size-3.5 text-emerald-600" /> Ledger Balanced</>
              ) : (
                <><ShieldAlert className="size-3.5 animate-pulse text-amber-600" /> Ledger menunggu transaksi</>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-3.5 text-sky-600" /> Backup Ready
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
