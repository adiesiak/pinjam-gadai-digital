/**
 * Kartu limit pembiayaan + voucher milik nasabah.
 *
 * Angka limit dan kelayakan voucher datang dari `voucher.daftarVoucherSaya`
 * (server). Komponen ini tidak menghitung plafon, boost, atau potongan sendiri:
 * yang tampil adalah angka yang sama dengan yang dipakai validasi pengajuan.
 *
 * Voucher yang minimal pengajuannya di atas limit tetap ditampilkan, tetapi
 * nonaktif dan menjelaskan sebabnya — menyembunyikannya membuat nasabah tidak
 * tahu kenapa vouchernya "hilang".
 */
import { useQuery } from "convex/react";
import { Ticket, X } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { tanggalRingkas } from "@/lib/jatuhTempo";
import { formatRupiah } from "@/lib/money";
import {
  LABEL_JENIS_VOUCHER,
  type JenisVoucher,
  type VoucherRingkas,
} from "@/lib/voucher";

export type VoucherDenganKelayakan = VoucherRingkas & {
  layak: boolean;
  alasan: string | null;
};

/** Angka limit yang dikirim server untuk kartu ini. */
export type LimitVoucher = {
  maksimal: number;
  terpakai: number;
  tersedia: number;
  boostTersedia: number;
  batasPengajuan: number;
};

/**
 * Isi slide-over voucher — presentasional supaya bisa dirender di uji markup.
 */
export function DaftarVoucherSheet({
  daftar,
  batasPengajuan,
}: {
  daftar: readonly VoucherDenganKelayakan[];
  batasPengajuan: number;
}) {
  if (daftar.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-600">
        Belum ada voucher atas nama Anda. Voucher apresiasi terbit otomatis
        setelah pinjaman lunas tepat waktu saat promo kuartalan berjalan.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs leading-5 text-muted-foreground">
        Batas pengajuan Anda sekarang {formatRupiah(batasPengajuan)}. Pilih
        voucher di formulir pengajuan saat mengajukan.
      </p>
      <ul className="space-y-2">
        {daftar.map((voucher) => (
          <li
            key={voucher._id}
            className={`rounded-lg border px-3 py-3 ${
              voucher.layak
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-slate-200 bg-slate-50/70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5 text-navy">
                  {voucher.judul}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
                  {LABEL_JENIS_VOUCHER[voucher.jenis as JenisVoucher] ?? voucher.jenis}
                  {" · "}
                  {voucher.jenis === "boost_plafon"
                    ? `tambah limit ${formatRupiah(voucher.nilai)}`
                    : `potongan ${formatRupiah(voucher.nilai)}`}
                  {" · "}
                  berlaku sampai {tanggalRingkas(voucher.berlakuSampai)}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                  Minimal pengajuan {formatRupiah(voucher.minPokok)} · kode{" "}
                  <span className="font-mono">{voucher.kode}</span>
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                  voucher.layak
                    ? "border-emerald-300 bg-white text-emerald-800"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {voucher.layak ? "Bisa dipakai" : "Belum bisa"}
              </span>
            </div>
            {!voucher.layak && voucher.alasan !== null && (
              <p className="mt-1.5 text-[11px] leading-5 text-amber-900">
                {voucher.alasan}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Kartu limit + badge voucher untuk tab Ringkasan dashboard peminjam.
 *
 * Badge sengaja tombol, bukan tautan: isinya daftar yang dibaca di tempat
 * (slide-over), dan pengajuan tetap dilakukan dari formulir.
 */
export function KartuLimitVoucher({ className = "" }: { className?: string }) {
  const data = useQuery(api.voucher.daftarVoucherSaya, {});
  const [buka, setBuka] = useState(false);

  if (data === undefined) {
    return (
      <section
        aria-label="Limit pembiayaan dan voucher"
        className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}
      >
        <span className="sr-only">Memuat limit dan voucher…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-8 w-52" />
      </section>
    );
  }
  // Admin tidak punya plafon pinjaman; server menjawab `null`.
  if (data === null) return null;

  const { limit, daftar, jumlahAktif } = data;

  return (
    <section
      aria-labelledby="judul-limit-voucher"
      className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            id="judul-limit-voucher"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
          >
            Limit pembiayaan Anda
          </p>
          <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums text-navy">
            {formatRupiah(limit.batasPengajuan)}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Plafon {formatRupiah(limit.maksimal)} dipotong{" "}
            {formatRupiah(limit.terpakai)} pinjaman berjalan
            {limit.boostTersedia > 0
              ? `, ditambah ${formatRupiah(limit.boostTersedia)} dari voucher tambah limit`
              : ""}
            .
          </p>
        </div>

        <Sheet open={buka} onOpenChange={setBuka}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ticket className="size-4" aria-hidden />🎟️ {jumlahAktif} voucher aktif
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Voucher Anda</SheetTitle>
              <SheetDescription>
                Daftar voucher atas nama akun ini, beserta kelayakannya terhadap
                limit saat ini.
              </SheetDescription>
            </SheetHeader>
            <DaftarVoucherSheet
              daftar={daftar}
              batasPengajuan={limit.batasPengajuan}
            />
            <button
              type="button"
              onClick={() => setBuka(false)}
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X className="size-3.5" aria-hidden /> Tutup
            </button>
          </SheetContent>
        </Sheet>
      </div>

      {limit.terpakai > 0 && (
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-500">
          {limit.jumlahAktif} pinjaman berjalan menahan{" "}
          {formatRupiah(limit.terpakai)} dari plafon. Voucher tidak mengubah
          pemakaian plafon: potongan biaya hanya membuat dana yang Anda terima
          lebih besar.
        </p>
      )}
    </section>
  );
}
