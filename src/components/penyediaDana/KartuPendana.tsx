import { BadgeCheck, TriangleAlert, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RekapPendana } from "@/convex/penyediaDana";
import { formatRupiahAman } from "@/lib/money";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/**
 * Satu baris nilai pada kartu rekap: label di kiri, angka rupiah di kanan.
 * `garis` dipakai untuk baris total yang menutup sekelompok pecahan.
 */
function BarisNilai({
  label,
  nilai,
  kelas,
  garis,
}: {
  label: string;
  nilai: string;
  kelas: string;
  garis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2${
        garis === true ? " border-t border-slate-100 pt-1.5" : ""
      }`}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${kelas}`}>{nilai}</dd>
    </div>
  );
}

/**
 * Kartu rekap satu penyedia dana (model 1 pinjaman = 1 pendana): jumlah
 * pinjaman, pokok yang bekerja, keuntungan bersih pendana, dan potongan admin.
 *
 * Keuntungan dilaporkan TERPISAH antara pinjaman yang sudah lunas (uangnya
 * sudah masuk dan dibukukan) dan yang belum lunas (masih proyeksi). Menggabung
 * keduanya membuat penyedia dana membaca uang yang belum cair sebagai haknya.
 *
 * Murni presentasional — tanpa Convex — supaya bisa dirender langsung oleh uji
 * markup (`KartuPendana.render.test.tsx`).
 */
export function KartuPendana({ r }: { r: RekapPendana }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-semibold uppercase text-slate-900">
          <Wallet className="size-3.5 text-primary" aria-hidden /> {r.nama}
        </p>
        <Badge
          variant="outline"
          className="border-slate-200 text-[10px] font-medium text-slate-500"
        >
          {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} aktif · {r.jumlahLunas} lunas
        </Badge>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <BarisNilai
          label="Total disalurkan"
          nilai={rupiah(r.totalDisalurkan)}
          kelas="font-medium text-slate-900"
        />
        <BarisNilai
          label="Saldo berjalan"
          nilai={rupiah(r.saldoBerjalan)}
          kelas="font-medium text-slate-900"
        />
        {/* Keuntungan pinjaman yang BELUM lunas dilaporkan terpisah dari yang
            sudah lunas: hanya yang lunas yang uangnya sudah masuk (dibukukan). */}
        <BarisNilai
          label="Keuntungan sudah lunas"
          nilai={rupiah(r.keuntunganPendanaLunas)}
          kelas="font-semibold text-emerald-700"
        />
        <BarisNilai
          label="Keuntungan belum lunas (proyeksi)"
          nilai={rupiah(r.keuntunganPendanaBelumLunas)}
          kelas="font-medium text-amber-700"
        />
        <BarisNilai
          label="Total keuntungan pendana"
          nilai={rupiah(r.keuntunganPendana)}
          kelas="font-semibold text-emerald-700"
          garis
        />
        <BarisNilai
          label="Potongan admin sudah lunas"
          nilai={rupiah(r.keuntunganAdminLunas)}
          kelas="font-semibold text-amber-700"
        />
        <BarisNilai
          label="Potongan admin belum lunas (proyeksi)"
          nilai={rupiah(r.keuntunganAdminBelumLunas)}
          kelas="font-medium text-amber-700"
        />
        <BarisNilai
          label="Total potongan admin (dari uang kembali)"
          nilai={rupiah(r.keuntunganAdmin)}
          kelas="font-semibold text-amber-700"
          garis
        />
        <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5">
          <dt className="text-muted-foreground">Transfer keuntungan</dt>
          <dd className="text-right">
            {r.jumlahLunas === 0 ? (
              <span className="text-[11px] text-muted-foreground">belum ada pinjaman lunas</span>
            ) : r.transferBelumDicatat === 0 ? (
              <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
                <BadgeCheck className="mr-1 size-3" /> semua sudah dicatat
              </Badge>
            ) : (
              <span className="inline-flex flex-col items-end gap-0.5">
                <Badge className="border-0 bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
                  <TriangleAlert className="mr-1 size-3" /> {r.transferBelumDicatat} belum dicatat
                </Badge>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {rupiah(r.keuntunganBelumDicatat)}
                </span>
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
