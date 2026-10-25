/**
 * Bagian "alur dan dokumen" di beranda.
 *
 * Demo alur di bawahnya memperlihatkan layar; bagian ini menjawab pertanyaan
 * yang tidak terlihat di layar: berkas apa yang harus disiapkan, dan dokumen
 * apa yang terbit setelah pengajuan. Daftar dokumen mengikuti yang benar-benar
 * diminta `lib/kyc` dan yang dicetak generator PDF, bukan janji tambahan.
 */
import { Check, FileText } from "lucide-react";

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
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Alur &amp; dokumen
          </p>
          <h2
            id="dokumen-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            {judul}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{deskripsi}</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <ol className="grid gap-3 sm:grid-cols-2">
            {LANGKAH.map((langkah, i) => (
              <li
                key={langkah.judul}
                className="rounded-kartu border border-border bg-card p-4"
              >
                <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-primary">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">
                  {langkah.judul}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {langkah.isi}
                </p>
              </li>
            ))}
          </ol>

          <div className="grid gap-3">
            <div className="rounded-kartu border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Disiapkan sebelum mengajukan
              </p>
              <ul className="mt-2.5 space-y-1.5">
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

            <div className="rounded-kartu border border-border bg-card p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <FileText className="size-3.5 text-primary" aria-hidden="true" />
                Diterima setelah pengajuan
              </p>
              <ul className="mt-2.5 space-y-1.5">
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
