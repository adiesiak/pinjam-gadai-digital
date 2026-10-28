/**
 * Gerbang KYC di sisi UI — tiga wajah untuk satu aturan yang sama.
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
 * `MedanDariKyc` adalah wujud ketiga di dalam FORMULIR: satu medan yang nilainya
 * datang dari KYC, bukan dari isian nasabah. Dipakai per-ruas (nama/NIK/nomor
 * WA) supaya bagian yang bisa dipakai ulang hilang dari layar TANPA
 * menyembunyikan ruas yang datanya belum ada.
 *
 * Ketiganya bukan pengaman: pengaman sesungguhnya ada di server. Karena itu
 * `PeringatanKyc` sengaja tidak menyembunyikan formulir, hanya menonaktifkan
 * tombol kirim, dan pemakaian ulang hanya terjadi bila pemanggil memegang isian
 * KYC yang sah (`lib/kyc.identitasPengajuanDariKyc` / `identitasDasarKyc`).
 */
import { BadgeCheck, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sensorNik } from "@/lib/kyc";
import { formatTanggalWIB } from "@/lib/waktu";

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
/**
 * Satu MEDAN FORMULIR yang nilainya dipakai ulang dari KYC.
 *
 * Bentuknya sengaja read-only (bukan `<input disabled>`): nilainya bukan isian
 * yang dinonaktifkan, melainkan DATA yang sudah diperiksa petugas. Menampilkannya
 * sebagai teks + penanda "dari KYC" membuat batas itu jelas — nasabah tidak
 * mencoba mengetik di kotak yang tidak bisa diubah, dan kalau perlu mengubahnya
 * ia tahu jalurnya lewat tab Verifikasi KYC.
 *
 * Nilai yang ditampilkan adalah nilai yang BENAR-BENAR dikirim pengajuan;
 * pemanggil memakai sumber yang sama untuk validasi & muatan mutation.
 */
export function MedanDariKyc({
  id,
  label,
  nilai,
  petunjuk,
}: {
  id: string;
  label: string;
  nilai: string;
  /** Keterangan tambahan di bawah medan (mis. "dipakai untuk kontrak"). */
  petunjuk?: string;
}) {
  return (
    <div className="space-y-2">
      <span id={`${id}-label`} className="flex flex-wrap items-center gap-1.5 text-sm font-medium leading-none">
        {label}
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <BadgeCheck className="size-3" aria-hidden="true" />
          dari KYC
        </span>
      </span>
      <p
        id={id}
        aria-labelledby={`${id}-label`}
        className="flex min-h-9 items-center break-words rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-sm tabular-nums text-emerald-950"
      >
        {nilai}
      </p>
      {petunjuk !== undefined && (
        <p className="text-xs leading-5 text-muted-foreground">{petunjuk}</p>
      )}
    </div>
  );
}

export function IdentitasKycTerverifikasi({
  namaLengkap,
  nik = "",
  nomorWhatsApp = "",
  petunjuk,
  dokumenKedaluwarsa = [],
  onBukaKyc,
}: {
  namaLengkap: string;
  /** NIK apa adanya dari KYC; ditampilkan bertopeng oleh komponen ini. */
  nik?: string;
  nomorWhatsApp?: string;
  /**
   * Dokumen KYC yang sudah lewat masa berlaku. Daftarnya kosong pada nasabah
   * dengan dokumen terbaru; bila berisi, pengajuan baru tidak boleh dikirim
   * sebelum dokumennya diperbarui.
   */
  dokumenKedaluwarsa?: ReadonlyArray<{ label: string; berlakuSampai: number }>;
  /**
   * Kalimat pengantar yang disesuaikan produknya (pinjaman tunai / kredit
   * barang / gadai). Bawaannya menyebut parameter pinjaman tunai.
   */
  petunjuk?: string;
  /** Pindah ke tab Verifikasi KYC untuk memeriksa/mengubah data. */
  onBukaKyc?: () => void;
}) {
  // Hanya ruas yang BENAR-BENAR dipakai yang ditampilkan: kalau KYC belum
  // menyimpan NIK (atau formulirnya tidak memakainya), menampilkan "NIK: —"
  // justru membuat nasabah ragu datanya terpakai.
  const baris: Array<[string, string]> = [["Nama sesuai KYC", namaLengkap]];
  if (nik !== "") baris.push(["NIK", sensorNik(nik)]);
  if (nomorWhatsApp !== "") baris.push(["WhatsApp", nomorWhatsApp]);

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
        {petunjuk ??
          "Data diri dan dokumen dipakai dari KYC yang sudah diperiksa petugas. Isi cukup nominal, tenor, tujuan, rekening, dan tanda tangan."}
      </p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        {baris.map(([label, nilai]) => (
          <div key={label} className="min-w-0">
            <dt className="text-emerald-800/80">{label}</dt>
            <dd className="break-words font-medium tabular-nums text-emerald-950">{nilai}</dd>
          </div>
        ))}
      </dl>
      {dokumenKedaluwarsa.length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        >
          <p className="text-xs font-semibold">Dokumen KYC perlu diperbarui</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5">
            {dokumenKedaluwarsa.map((dokumen) => (
              <li key={dokumen.label}>
                {dokumen.label} berlaku sampai {formatTanggalWIB(dokumen.berlakuSampai)}.
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs leading-5">
            Unggah ulang dokumennya di halaman KYC sebelum mengirim pengajuan baru.
          </p>
        </div>
      )}
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
