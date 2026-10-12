import { Camera, Loader2, MapPin, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * KARTU VERIFIKASI pada halaman publik `/cek-status/<token>`.
 *
 * Komponen ini SENGAJA murni (tanpa Convex, tanpa akses kamera) supaya bisa
 * dirender & diuji tanpa aplikasi penuh — lihat `KartuVerifikasi.render.test`.
 *
 * Komposisinya mengikuti alur yang diminta produk: penerima tautan melihat
 * izin lokasi + kamera lebih dulu, BARU masuk ke rincian kwitansi. Bedanya
 * dengan permintaan awal, komponen ini **menyatakan terbuka** bahwa satu foto
 * selfie dan titik lokasi akan dicatat (lihat `PENJELASAN_VERIFIKASI`).
 * Peminjam tidak boleh difoto dan dilacak diam-diam: menyembunyikan
 * pengumpulan data pribadi seperti itu tidak bisa dipertanggungjawabkan, dan
 * izin kamera/lokasi browser tetap muncul sendiri sehingga
 * menyembunyikannya hanya membuat halaman terasa menipu tanpa menambah
 * keamanan apa pun.
 */

/** Keadaan kartu: siap meminta izin, sedang bekerja, gagal, atau sudah selesai. */
export type StatusVerifikasi = "siap" | "memproses" | "gagal" | "selesai";

/** Kalimat yang dibaca peminjam sebelum memberi izin — jangan diperhalus. */
export const PENJELASAN_VERIFIKASI = [
  "PINDAI mengambil 1 foto selfie dari kamera depan untuk memastikan kwitansi ini dibuka oleh pemilik pinjamannya. Foto tidak ditampilkan di layar.",
  "Lokasi perangkat ikut dicatat saat verifikasi, lalu diperbarui otomatis setiap 10 detik selama halaman ini terbuka.",
  "Penolakan izin tetap membuka rincian tagihan Anda, tetapi PINDAI akan melihat bahwa verifikasi belum selesai.",
] as const;

export function KartuVerifikasi({
  status,
  pesan,
  onMulai,
  sudahVerifikasi,
}: {
  status: StatusVerifikasi;
  /** Pesan galat/informasi yang bisa dibaca peminjam; null saat tidak ada. */
  pesan: string | null;
  onMulai: () => void;
  /** Verifikasi sudah pernah diterima server untuk tautan ini. */
  sudahVerifikasi: boolean;
}) {
  const memproses = status === "memproses";
  const selesai = status === "selesai" || sudahVerifikasi;

  return (
    <section
      aria-labelledby="judul-verifikasi"
      className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {selesai ? <ShieldCheck className="size-5" /> : <Camera className="size-5" />}
        </span>
        <div className="min-w-0">
          <h2 id="judul-verifikasi" className="text-base font-semibold text-navy">
            {selesai ? "Verifikasi sudah diterima" : "Verifikasi identitas & lokasi"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Langkah ini menjaga kwitansi digital Anda tidak dibuka orang lain. Dibutuhkan
            izin kamera dan lokasi dari perangkat Anda.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {PENJELASAN_VERIFIKASI.map((baris) => (
          <li
            key={baris}
            className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600"
          >
            <span className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true">
              •
            </span>
            <span>{baris}</span>
          </li>
        ))}
      </ul>

      {pesan !== null && pesan !== "" && (
        <p
          role={status === "gagal" ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-3 py-2 text-xs leading-5 ${
            status === "gagal"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {pesan}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={onMulai}
          disabled={memproses}
          className="bg-[#064E3B] text-white hover:bg-[#021E17]"
        >
          {memproses ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MapPin className="mr-1.5 size-4" aria-hidden="true" />
          )}
          {selesai ? "Verifikasi ulang" : "Izinkan & mulai verifikasi"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Browser akan menampilkan permintaan izin kamera dan lokasi.
        </span>
      </div>
    </section>
  );
}
