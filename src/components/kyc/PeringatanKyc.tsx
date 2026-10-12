/**
 * Gerbang KYC di sisi UI — dua wajah untuk satu aturan yang sama.
 *
 * Server menolak pengajuan finansial bila modul KYC nasabah belum `VERIFIED`
 * (lihat `requireKycTerverifikasi` di `convex/kyc.ts`). `PeringatanKyc` MEMBERI
 * TAHU sebabnya lebih dulu — sebelum nasabah mengisi formulir panjang yang
 * pasti akan ditolak — dan menyediakan jalan menuju tab Verifikasi KYC.
 *
 * `IdentitasKycTerverifikasi` adalah kebalikannya: saat identitas SUDAH
 * diperiksa petugas, bagian data diri/dokumen di formulir pengajuan tidak perlu
 * diulang. Komponen itu menampilkan buktinya (nama, NIK bertopeng, nomor WA) —
 * bukan sekadar menyembunyikan isian, supaya nasabah tetap melihat data mana
 * yang dipakai pengajuannya.
 *
 * Keduanya bukan pengaman: pengaman sesungguhnya ada di server. Karena itu
 * `PeringatanKyc` sengaja tidak menyembunyikan formulir, hanya menonaktifkan
 * tombol kirim, dan badge hijau ini hanya muncul bila pemanggil sudah memegang
 * isian KYC yang lengkap (`lib/kyc.identitasPengajuanDariKyc`).
 */
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sensorNik } from "@/lib/kyc";

export function PeringatanKyc({ onBukaKyc }: { onBukaKyc?: () => void }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <p className="flex items-start gap-2 text-sm font-semibold leading-6">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        KYC diperlukan sebelum pengajuan dapat dikirim.
      </p>
      <p className="mt-1 text-xs leading-5">
        Selesaikan verifikasi identitas Anda di tab Verifikasi KYC. Setelah statusnya
        <span className="font-medium"> VERIFIED</span>, tombol kirim pengajuan aktif kembali.
      </p>
      {onBukaKyc !== undefined && (
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onBukaKyc}>
          Buka Verifikasi KYC
        </Button>
      )}
    </div>
  );
}

/**
 * Bukti bahwa bagian data diri sudah selesai: identitas & dokumen diambil dari
 * KYC yang diperiksa petugas, bukan diisi ulang di formulir pengajuan.
 *
 * Yang ditampilkan sengaja hanya RINGKASAN — nama, NIK bertopeng
 * (`sensorNik`), dan nomor WhatsApp — sebab halaman ini bisa dibuka di
 * perangkat bersama, sedangkan nomor identitas utuh tidak diperlukan nasabah
 * untuk memastikan datanya benar.
 *
 * Kalimat "Data disimpan aman" menggambarkan BATASNYA juga: nilai-nilainya
 * tersimpan di baris KYC nasabah (satu tempat), sehingga mengubahnya hanya
 * lewat tab Verifikasi KYC — formulir pengajuan tidak bisa diam-diam
 * menggantinya.
 */
export function IdentitasKycTerverifikasi({
  namaLengkap,
  nik,
  nomorWhatsApp,
  onBukaKyc,
}: {
  namaLengkap: string;
  /** NIK apa adanya dari KYC; ditampilkan bertopeng oleh komponen ini. */
  nik: string;
  nomorWhatsApp: string;
  /** Pindah ke tab Verifikasi KYC untuk memeriksa/mengubah data. */
  onBukaKyc?: () => void;
}) {
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
    >
      <p className="flex items-start gap-2 text-sm font-semibold leading-6">
        <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ✓ Identitas &amp; KYC Terverifikasi. Data disimpan aman.
      </p>
      <p className="mt-1 text-xs leading-5">
        Bagian data diri dan dokumen tidak perlu diisi ulang — pengajuan ini memakai data KYC
        yang sudah diperiksa petugas. Isi cukup nominal, tenor, tujuan, rekening, dan tanda
        tangan.
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {(
          [
            ["Nama sesuai KYC", namaLengkap],
            ["NIK", sensorNik(nik)],
            ["WhatsApp", nomorWhatsApp],
          ] as const
        ).map(([label, nilai]) => (
          <div key={label} className="min-w-0">
            <dt className="text-emerald-800/80">{label}</dt>
            <dd className="break-words font-medium tabular-nums text-emerald-950">{nilai}</dd>
          </div>
        ))}
      </dl>
      {onBukaKyc !== undefined && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 border-emerald-300 text-emerald-900"
          onClick={onBukaKyc}
        >
          Kelola data di Verifikasi KYC
        </Button>
      )}
    </div>
  );
}
