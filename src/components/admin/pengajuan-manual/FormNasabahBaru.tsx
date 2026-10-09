import { useAction, useConvex, useMutation } from "convex/react";
import { useCallback, useState } from "react";

import { FormDataDiri, type PerubahanFotoKtp } from "@/components/DataDiriForm";
import { api } from "@/convex/_generated/api";
import { DATA_DIRI_KOSONG, penghasilanDariTeks } from "@/lib/dataDiri";
import { namaHurufBesar } from "@/lib/nama";
import type { NasabahManual } from "@/lib/pengajuanManual";
import { unggahDokumen, type ProgresUnggah } from "@/lib/unggahDokumen";

/**
 * Catat PEMOHON BARU yang belum punya akun — langkah identitas di panel admin.
 *
 * Dipakai saat pengajuan masuk dari orang yang belum mendaftar di aplikasi
 * (datang ke kantor, data lama dari buku). Admin mengisi identitas dan
 * mengunggah foto KTP; server membuat catatan pemohon beserta data dirinya,
 * lalu formulir produk (pinjaman/gadai/kredit) bisa dipakai seperti biasa.
 *
 * Formulirnya memakai `FormDataDiri` yang sama dengan jalur data diri admin,
 * jadi aturan validasi (NIK 16 angka, WhatsApp 62…, penghasilan rupiah bulat)
 * dan penanganan foto tidak berbeda antara kedua jalur.
 */
export function FormNasabahBaru({
  onSukses,
}: {
  onSukses: (nasabah: NasabahManual) => void;
}) {
  const catat = useMutation(api.adminPengajuan.buatNasabahBaru);
  // URL unggah digerbang admin di server; dipakai untuk foto KTP pemohon baru.
  const mintaUrlUnggah = useMutation(api.admin.generateDataDiriUploadUrl);
  // Periksa ISI berkas (magic bytes) sesudah unggah, bukan hanya tipe MIME.
  const periksaIsi = useAction(api.berkasIdentitas.periksaIsiBerkasKyc);
  const klien = useConvex();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Pemeriksaan asinkron atas NIK yang baru diketik (dijalankan FormDataDiri
   * setelah jeda ketikan, bukan tiap huruf). Query yang dipakai sudah ada dan
   * tetap digerbang admin di server — tidak ada jalur data baru, dan tidak ada
   * NIK nasabah lain yang dikirim ke peramban: yang dikembalikan hanya nama
   * pemilik catatan yang cocok, sebagai peringatan agar admin memeriksa dulu.
   * Ini pemberitahuan lebih awal, bukan pengganti pemeriksaan server saat simpan.
   */
  const periksaKembar = useCallback(
    async (nilai: string) => {
      const { hasil } = await klien.query(api.adminPengajuan.cariNasabah, { kueri: nilai });
      if (hasil.length === 0) return null;
      const contoh = hasil[0];
      const nama = contoh === undefined ? "nasabah lain" : namaHurufBesar(contoh.nama);
      return `NIK ini cocok dengan ${hasil.length} catatan nasabah (mis. ${nama}). Periksa dulu agar tidak membuat akun kembar.`;
    },
    [klien],
  );

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Pemohon ini belum punya akun aplikasi. Isi identitas sesuai KTP dan unggah
        fotonya — catatan pemohon dibuat tanpa meminta orang itu mendaftar lebih
        dulu. Datanya tetap dapat disunting lewat menu Data Diri.
      </p>

      <FormDataDiri
        nama="Pemohon baru"
        awal={DATA_DIRI_KOSONG}
        fotoKtpUrl={null}
        sebelumnya="Belum pernah tercatat sebagai pemohon."
        labelSimpan="Simpan pemohon baru"
        periksaKembar={periksaKembar}
        unggah={async (file, onProgres?: (p: ProgresUnggah) => void) => {
          const id = await unggahDokumen(file, mintaUrlUnggah, "Foto KTP", undefined, onProgres);
          // Periksa isi (magic bytes) tetap dijalankan server setelah unggah.
          await periksaIsi({ id, label: "Foto KTP" });
          return id;
        }}
        busy={busy}
        error={error}
        onSimpan={(form, foto: PerubahanFotoKtp) => {
          setBusy(true);
          setError(null);
          void catat({
            namaLengkap: form.namaLengkap,
            nik: form.nik,
            nomorWhatsApp: form.nomorWhatsApp,
            alamat: form.alamat,
            pekerjaan: form.pekerjaan,
            penghasilanBulanan: penghasilanDariTeks(form.penghasilan),
            namaBank: form.namaBank,
            nomorRekening: form.nomorRekening,
            ...(typeof foto === "string" ? { fotoKtpId: foto } : {}),
          })
            .then((nasabah) => onSukses(nasabah))
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "Pemohon baru gagal dicatat.",
              );
            })
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
