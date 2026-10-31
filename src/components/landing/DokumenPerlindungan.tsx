/**
 * Bagian "alur dan dokumen" di beranda.
 *
 * Empat langkah tidak diulang lagi di sini: demo di atasnya sudah
 * memperlihatkan alurnya. Yang tersisa adalah dua hal yang tidak terlihat di
 * layar, yaitu berkas yang harus disiapkan dan dokumen yang terbit setelah
 * pengajuan. Daftarnya mengikuti `lib/kyc` dan generator PDF, bukan janji
 * tambahan.
 */
import { Check, FileText } from "lucide-react";

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
  ikon,
}: {
  judul: string;
  baris: readonly string[];
  ikon?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
        {ikon ? <FileText className="size-4 text-primary" aria-hidden="true" /> : null}
        {judul}
      </p>
      <ul className="mt-3 space-y-2">
        {baris.map((teks) => (
          <li
            key={teks}
            className="flex items-start gap-2.5 text-sm leading-6 text-foreground"
          >
            <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            {teks}
          </li>
        ))}
      </ul>
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
      className="border-t border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-12">
          <JudulBagian
            id="dokumen-judul"
            label="Alur & dokumen"
            judul={judul}
            deskripsi={deskripsi}
            className="max-w-xl border-t-0 pt-0"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <DaftarDokumen judul="Disiapkan sebelum mengajukan" baris={SIAPKAN} />
            <DaftarDokumen
              judul="Diterima setelah pengajuan"
              baris={DITERIMA}
              ikon
            />
          </div>
        </div>
      </div>
    </section>
  );
}
