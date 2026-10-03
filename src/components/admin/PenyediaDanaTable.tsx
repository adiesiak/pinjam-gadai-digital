import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  BanknoteArrowUp,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  ShieldOff,
  TriangleAlert,
  Undo2,
  UserPlus,
  Wallet,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import {
  LABEL_METODE_TRANSFER,
  LABEL_TRANSFER,
  type RekapTransferPendana,
  type RingkasTransfer,
  type StatusTransfer,
} from "@/lib/transferPendana";

import { MetrikKartu } from "./admin-shared";

/** Format rupiah defensif: satu angka warisan non-bulat tidak boleh melumpuhkan panel. */
function rupiah(nilai: number): string {
  try {
    return formatRupiah(nilai);
  } catch {
    return `Rp ${Number(nilai).toLocaleString("id-ID")}`;
  }
}

function tanggalRingkas(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LABEL_STATUS: Record<string, string> = {
  didanai: "berjalan",
  lunas: "lunas",
  menunggu_verifikasi: "menunggu verifikasi",
  terverifikasi: "terverifikasi",
  ditolak: "ditolak",
  menunggu_proses: "menunggu diproses",
  diproses: "diproses",
};

/** Gaya badge status catatan transfer keuntungan penyedia dana. */
const META_TRANSFER: Record<StatusTransfer, string> = {
  belum_dicatat: "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100",
  dicatat: "border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  dibatalkan: "border-0 bg-amber-100 text-amber-800 hover:bg-amber-100",
};

/** Badge kecil status catatan transfer. */
function BadgeTransfer({ ringkas }: { ringkas: RingkasTransfer }) {
  return (
    <Badge className={`${META_TRANSFER[ringkas.status]} text-[10px]`}>
      {ringkas.status === "dicatat" && <BadgeCheck className="mr-1 size-3" />}
      {LABEL_TRANSFER[ringkas.status]}
    </Badge>
  );
}

function Kartu({
  label,
  nilai,
  detail,
  icon,
}: {
  label: string;
  nilai: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span><p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p></div>
      <p className="mt-3 break-words text-lg font-semibold tabular-nums">{nilai}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function BarisRincian({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-900">{nilai}</dd>
    </div>
  );
}

type Pinjaman = {
  loanId: Id<"loans">;
  referensi: string;
  status: string;
  pokokPinjaman: number;
  bunga: number;
  totalLunas: number;
  potonganAdmin: number;
  keuntunganPendana: number;
  keuntunganAdmin: number;
  waktu: number;
  transfer: RingkasTransfer;
};

/**
 * Tombol aksi catat/batal transfer untuk satu pinjaman lunas.
 *
 * Dipakai di dua tempat: kartu pinjaman pada dialog rincian dan kartu penyedia
 * dana pada daftar utama, supaya aturan kapan tombol muncul hanya ada di satu
 * tempat.
 */
function AksiTransfer({
  row,
  onCatat,
  onBatal,
}: {
  row: Pinjaman;
  onCatat: (row: Pinjaman) => void;
  onBatal: (row: Pinjaman) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <BadgeTransfer ringkas={row.transfer} />
      {row.status === "lunas" && row.transfer.status !== "dicatat" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => onCatat(row)}
        >
          <BanknoteArrowUp className="size-3" /> Catat transfer
        </Button>
      );
      {row.status !== "lunas" && (
        <span className="text-[10px] text-muted-foreground">menunggu lunas</span>
      )}
    </div>
  );
}

/**
 * Daftar pinjaman yang didanai pada dialog rincian (model 1 pinjaman = 1 pendana).
 *
 * Sengaja BUKAN tabel: sembilan kolom angka tidak pernah muat di dalam dialog
 * tanpa geser mendatar, jadi tiap pinjaman menjadi kartu ringkas dengan metrik
 * yang membungkus sendiri.
 */
function DaftarPinjaman({
  rows,
  onCatat,
  onBatal,
}: {
  rows: Pinjaman[];
  onCatat: (row: Pinjaman) => void;
  onBatal: (row: Pinjaman) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Belum ada pinjaman yang didanai akun ini.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-2">
      {rows.map((r) => (
        <li
          key={`${r.referensi}-${r.waktu}`}
          className="rounded-2xl border border-slate-200 p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-slate-600">{r.referensi}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {LABEL_STATUS[r.status] ?? r.status} · {tanggalRingkas(r.waktu)}
              </p>
            </div>
            <AksiTransfer row={r} onCatat={onCatat} onBatal={onBatal} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetrikKartu label="Pokok" nilai={rupiah(r.pokokPinjaman)} />
            <MetrikKartu label="Bunga" nilai={rupiah(r.bunga)} />
            <MetrikKartu label="Total kewajiban" nilai={rupiah(r.totalLunas)} />
            <MetrikKartu
              label="Potongan admin"
              nilai={r.potonganAdmin === 0 ? "—" : `− ${rupiah(r.potonganAdmin)}`}
            />
            <MetrikKartu label="Keuntungan penyedia" nilai={rupiah(r.keuntunganPendana)} />
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** Riwayat setoran/penarikan pada dialog rincian — membungkus, tanpa geser. */
function DaftarRiwayat({
  judul,
  rows,
  kosong,
}: {
  judul: string;
  rows: { referensi: string; jumlah: number; status: string }[];
  kosong: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <FileText className="size-3.5" aria-hidden /> {judul}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{kosong}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {rows.map((r) => (
            <li
              key={r.referensi}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
            >
              <span className="min-w-0 truncate font-mono text-slate-500">{r.referensi}</span>
              <span className="shrink-0 text-right">
                <span className="block tabular-nums">{rupiah(r.jumlah)}</span>
                <span className="block text-muted-foreground">
                  {LABEL_STATUS[r.status] ?? r.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// @@PART6@@