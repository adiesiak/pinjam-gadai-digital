/**
 * Bagian "alur dan dokumen" di beranda.
 *
 * Empat langkah tidak diulang lagi di sini: demo di atasnya sudah
 * memperlihatkan alurnya. Yang tersisa adalah dua hal yang tidak terlihat di
 * layar, yaitu berkas yang harus disiapkan dan dokumen yang terbit setelah
 * pengajuan. Daftarnya mengikuti `lib/kyc` dan generator PDF, bukan janji
 * tambahan.
 *
 * Redesign beranda mengganti dua kartu menjadi dua kolom daftar bernomor. Garis
 * rambut membuat urutan dokumen lebih mudah dipindai daripada dua kotak putih.
 */
import { JudulBagian } from "./JudulBagian";

const SIAPKAN = [
  "KTP atas nama Anda sendiri",
  "Selfie sambil memegang KTP",
  "Bukti penghasilan terbaru",
  "Nomor WhatsApp aktif dan rekening pencairan",
] as const;

const DITERIMA = [
  "Rincian pinjaman (PDF) berisi potongan dan total kewajiban",
  "Perjanjian dengan tanda tangan dan kode verifikasi",
  "Kuitansi tiap pembayaran yang sudah dicocokkan",
  "Pengingat jatuh tempo lewat WhatsApp",
] as const;

function DaftarDokumen({
  judul,
  baris,
}: {
  judul: string;
  baris: readonly string[];
}) {
  return (
    <div>
      <p className="flex items-center gap-2 border-b border-border pb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
        {judul}
      </p>
      <ol className="divide-y divide-border">
        {baris.map((teks, i) => (
          <li
            key={teks}
            className="flex gap-3 py-3 text-sm leading-6 text-foreground"
          >
            <span className="mt-0.5 font-mono text-xs tabular-nums text-gold-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{teks}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DokumenPerlindungan({
  judul,
  deskripsi,
}: {
  judul: string;
  deskripsi: string;
}) {
  return (
    <section
      aria-labelledby="dokumen-judul"
      className="border-t border-border bg-secondary"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-14">
          <JudulBagian
            id="dokumen-judul"
            nomor="03"
            label="Alur & dokumen"
            judul={judul}
            deskripsi={deskripsi}
            className="max-w-xl border-t-0 pt-0"
          />
          <div className="grid gap-8 sm:grid-cols-2">
            <DaftarDokumen judul="Disiapkan sebelum mengajukan" baris={SIAPKAN} />
            <div className="sm:border-l sm:border-border sm:pl-8">
              <DaftarDokumen
                judul="Diterima setelah pengajuan"
                baris={DITERIMA}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
