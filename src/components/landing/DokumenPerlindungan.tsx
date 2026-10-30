/**
 * Bagian "alur dan dokumen" di beranda.
 *
 * Demo alur di bawahnya memperlihatkan layar; bagian ini menjawab pertanyaan
 * yang tidak terlihat di layar: berkas apa yang harus disiapkan, dan dokumen
 * apa yang terbit setelah pengajuan. Daftar dokumen mengikuti yang benar-benar
 * diminta `lib/kyc` dan yang dicetak generator PDF, bukan janji tambahan.
 */
import { Check, FileText } from "lucide-react";

import { JudulBagian } from "./JudulBagian";

const LANGKAH = [
  {
    judul: "Masuk dengan OTP WhatsApp",
    isi: "Nomor WhatsApp menerima kode 6 angka. Tidak ada kata sandi yang perlu diingat.",
  },
  {
    judul: "Lengkapi verifikasi",
    isi: "Identitas, KTP, selfie dengan KTP, dan bukti penghasilan diperiksa sebelum pengajuan bisa dikirim.",
  },
  {
    judul: "Pilih nominal dan tenor",
    isi: "Potongan, bunga, dan total kewajiban tampil sebelum tombol kirim ditekan.",
  },
  {
    judul: "Dokumen terbit",
    isi: "Rincian pinjaman dan perjanjian bisa diunduh; kuitansi terbit setiap pembayaran dicocokkan.",
  },
] as const;

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
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <JudulBagian
          id="dokumen-judul"
          label="Alur & dokumen"
          judul={judul}
          deskripsi={deskripsi}
          className="max-w-2xl border-t-0 pt-0"
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          {/* Empat langkah dibaca sebagai satu urutan, jadi tempatnya satu
              kartu berderet dengan nomor serif di kiri, bukan empat kotak
              setara yang memecah urutannya. */}
          <ol className="overflow-hidden rounded-kartu border border-border bg-card">
            {LANGKAH.map((langkah, i) => (
              <li
                key={langkah.judul}
                className="flex gap-4 border-b border-border px-5 py-4 last:border-b-0"
              >
                <span className="font-judul w-8 shrink-0 text-lg leading-none tabular-nums text-gold-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {langkah.judul}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {langkah.isi}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="grid gap-4">
            <div className="rounded-kartu border border-border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                Disiapkan sebelum mengajukan
              </p>
              <ul className="mt-3 space-y-1.5">
                {SIAPKAN.map((baris) => (
                  <li
                    key={baris}
                    className="flex items-start gap-2 text-xs leading-5 text-slate-700"
                  >
                    <Check
                      className="mt-1 size-3 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {baris}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-kartu border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                <FileText className="size-3.5 text-primary" aria-hidden="true" />
                Diterima setelah pengajuan
              </p>
              <ul className="mt-3 space-y-1.5">
                {DITERIMA.map((baris) => (
                  <li
                    key={baris}
                    className="flex items-start gap-2 text-xs leading-5 text-slate-700"
                  >
                    <Check
                      className="mt-1 size-3 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {baris}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
