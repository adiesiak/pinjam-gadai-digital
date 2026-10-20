import { TriangleAlert } from "lucide-react";

import { KepalaFolio } from "@/components/penyediaDana/bagian-folio";
import { FOLIO } from "@/components/penyediaDana/folio";
import { formatRupiah } from "@/lib/money";

/** Angka ringkasan keuntungan yang dibutuhkan komponen ini. */
export type AngkaRingkasanKeuntungan = {
  /** Keuntungan pendana yang sudah dibukukan (pinjaman lunas). */
  totalKeuntunganPendanaLunas: number;
  /** Keuntungan pendana yang masih perkiraan (pinjaman berjalan). */
  totalKeuntunganPendanaBelumLunas: number;
  /** Jumlah keduanya. */
  totalKeuntunganPendana: number;
  /** Biaya platform (layanan) dari uang yang kembali (berjalan + lunas). */
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
      kotak: "border-emerald-300/70 bg-emerald-50/50",
      penanda: "bg-emerald-600",
      judul: "text-emerald-800",
      angka: "text-emerald-800",
    },
    amber: {
      kotak: "border-amber-300/70 bg-amber-50/60",
      penanda: "bg-amber-500",
      judul: "text-amber-800",
      angka: "text-amber-700",
    },
    slate: {
      kotak: "border-slate-200 bg-white",
      penanda: "bg-navy",
      judul: "text-slate-600",
      angka: "text-navy",
    },
  }[warna];

  return (
    <div className={`rounded-lg border px-4 py-3 ${gaya.kotak}`}>
      <p
        className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${gaya.judul}`}
      >
        {/* Penanda kotak kecil: satu warna untuk satu makna angka, bukan hiasan. */}
        <span aria-hidden className={`size-2 shrink-0 rounded-[2px] ${gaya.penanda}`} />
        {judul}
      </p>
      <p className={`mt-1.5 text-xl font-semibold leading-tight ${FOLIO.angka} ${gaya.angka}`}>
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
  pribadi = false,
}: {
  ringkasan: AngkaRingkasanKeuntungan;
  /**
   * Portofolio pribadi: ruang pendana hanya mengirim alokasi atas nama pembaca,
   * jadi label "Seluruh pendana" akan salah di sana.
   */
  pribadi?: boolean;
}) {
  return (
    <section aria-label="Ringkasan keuntungan pendana" className="animate-masuk mt-3">
      <KepalaFolio
        nomor={6}
        judul="Ringkasan keuntungan"
        aksi={
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {pribadi ? "Alokasi atas nama Anda" : "Seluruh pendana"}
          </p>
        }
      />

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
        Imbal Hasil pendana dihitung <strong>tetap 30%</strong> dari pokok untuk siklus
        <strong> 30 hari</strong>; perpanjangan atau cicil pokok nasabah tidak mengubah angkanya.
        Angka <strong>perkiraan</strong> baru menjadi uang pendana saat pinjamannya lunas. Biaya
        platform (layanan) {formatRupiah(ringkasan.totalKeuntunganAdmin)} (dibukukan{" "}
        {formatRupiah(ringkasan.totalKeuntunganAdminLunas)} · perkiraan{" "}
        {formatRupiah(ringkasan.totalKeuntunganAdminBelumLunas)}) diambil dari uang yang kembali,
        bukan dari Imbal Hasil saja, jadi pokok tetap kembali utuh. Cara hitungnya ada di bagian
        “Aturan perhitungan” pada halaman ini.
      </p>

      {ringkasan.totalTransferBelumDicatat > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {ringkasan.totalTransferBelumDicatat} transfer keuntungan belum dicatat (
          {formatRupiah(ringkasan.nilaiTransferBelumDicatat)})
        </p>
      )}
    </section>
  );
}
