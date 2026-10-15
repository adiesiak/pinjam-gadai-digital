import { TriangleAlert } from "lucide-react";

import { formatRupiah } from "@/lib/money";

/** Angka ringkasan keuntungan yang dibutuhkan komponen ini. */
export type AngkaRingkasanKeuntungan = {
  /** Keuntungan pendana yang sudah dibukukan (pinjaman lunas). */
  totalKeuntunganPendanaLunas: number;
  /** Keuntungan pendana yang masih perkiraan (pinjaman berjalan). */
  totalKeuntunganPendanaBelumLunas: number;
  /** Jumlah keduanya. */
  totalKeuntunganPendana: number;
  /** Potongan admin dari uang yang kembali (berjalan + lunas). */
  totalKeuntunganAdmin: number;
  totalKeuntunganAdminLunas: number;
  totalKeuntunganAdminBelumLunas: number;
  /** Pinjaman lunas yang catatan transfer keuntungannya belum dibuat admin. */
  totalTransferBelumDicatat: number;
  nilaiTransferBelumDicatat: number;
};

/** Satu kartu angka ringkasan: judul kecil, angka besar, catatan satu baris. */
function KartuAngka({
  judul,
  nilai,
  catatan,
  warna,
}: {
  judul: string;
  nilai: string;
  catatan: string;
  warna: "emerald" | "amber" | "slate";
}) {
  const gaya = {
    emerald: {
      kotak: "border-emerald-200 bg-emerald-50/60",
      garis: "bg-emerald-500",
      judul: "text-emerald-800",
      angka: "text-emerald-800",
    },
    amber: {
      kotak: "border-amber-200 bg-amber-50/60",
      garis: "bg-amber-500",
      judul: "text-amber-800",
      angka: "text-amber-700",
    },
    slate: {
      kotak: "border-slate-200 bg-white",
      garis: "bg-navy",
      judul: "text-slate-500",
      angka: "text-navy",
    },
  }[warna];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md ${gaya.kotak}`}
    >
      {/* Garis warna di tepi kiri: penanda blok yang terbaca sebelum angkanya. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${gaya.garis}`} />
      <p
        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] ${gaya.judul}`}
      >
        {judul}
      </p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums leading-tight ${gaya.angka}`}>
        {nilai}
      </p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{catatan}</p>
    </div>
  );
}

/**
 * Ringkasan keuntungan pendana — bentuk ringkas di puncak ruang penyedia
 * dana (dan panel admin yang menampilkannya).
 *
 * Pertanyaan pendana cuma dua: **berapa yang sudah jadi uang** dan
 * **berapa yang masih perkiraan**. Karena itu angkanya dipisah menjadi kartu,
 * bukan dirangkai menjadi kalimat bertumpuk.
 *
 * Labelnya sengaja sama persis dengan kepala kolom tabel rekap pendana
 * ("Dibukukan (lunas)", "Perkiraan (belum lunas)", "Total keuntungan"):
 * sebelumnya istilah yang sama ditulis dengan tiga susunan berbeda di tiga
 * tempat, sehingga angka yang setara terlihat seperti angka yang berlainan.
 * Penjelasan istilahnya tidak lagi ditempel sebagai ikon `?` di sini — semuanya
 * ada di panel "Aturan perhitungan".
 *
 * Murni presentasional — tanpa Convex — supaya bisa dirender langsung oleh uji
 * markup (`RingkasanKeuntungan.render.test.tsx`).
 */
export function RingkasanKeuntungan({
  ringkasan,
}: {
  ringkasan: AngkaRingkasanKeuntungan;
}) {
  return (
    <section aria-label="Ringkasan keuntungan pendana" className="animate-masuk mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-navy">Ringkasan keuntungan</h2>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Seluruh pendana
        </p>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <KartuAngka
          judul="Dibukukan (lunas)"
          nilai={formatRupiah(ringkasan.totalKeuntunganPendanaLunas)}
          catatan="keuntungan yang sudah menjadi hak pendana"
          warna="emerald"
        />
        <KartuAngka
          judul="Perkiraan (belum lunas)"
          nilai={formatRupiah(ringkasan.totalKeuntunganPendanaBelumLunas)}
          catatan="hitungan atas pinjaman yang masih berjalan — belum dibukukan"
          warna="amber"
        />
        <KartuAngka
          judul="Total keuntungan"
          nilai={formatRupiah(ringkasan.totalKeuntunganPendana)}
          catatan="dibukukan + perkiraan"
          warna="slate"
        />
      </div>

      <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
        Angka <strong>perkiraan</strong> baru menjadi uang pendana saat pinjamannya lunas.
        Potongan admin {formatRupiah(ringkasan.totalKeuntunganAdmin)} (dibukukan{" "}
        {formatRupiah(ringkasan.totalKeuntunganAdminLunas)} · perkiraan{" "}
        {formatRupiah(ringkasan.totalKeuntunganAdminBelumLunas)}) diambil dari uang yang kembali,
        bukan dari Imbal Hasil saja — pokok tetap kembali utuh. Cara hitungnya ada di bagian
        “Aturan perhitungan” pada halaman ini.
      </p>

      {ringkasan.totalTransferBelumDicatat > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {ringkasan.totalTransferBelumDicatat} transfer keuntungan belum dicatat (
          {formatRupiah(ringkasan.nilaiTransferBelumDicatat)})
        </p>
      )}
    </section>
  );
}
