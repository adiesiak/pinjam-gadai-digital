/**
 * Run: bun src/components/admin/pengajuan-manual/UnggahDokumen.render.test.tsx
 *
 * Uji render slot unggah dokumen pengajuan manual lewat react-dom/server
 * (tanpa DOM, tanpa browser), mengikuti pola render test lain di repo.
 *
 * Yang dijaga adalah keadaan yang bisa dibaca pengguna di markup: bidang
 * kosong menawarkan "Pilih berkas" tanpa tombol Hapus, bidang terisi
 * menampilkan nama berkas + tombol Hapus, slot nonaktif tidak bisa ditekan,
 * dan input berkas selalu punya label aksesibilitas serta batas jenis berkas.
 *
 * Jalur unggah (`unggahDokumen`) diuji terpisah sebagai skrip biasa di
 * `src/lib/unggahDokumen.test.ts` — di sini hanya hasil render-nya.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { UnggahDokumen } from "./UnggahDokumen";
import type { Id } from "@/convex/_generated/dataModel";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tanpa "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const mintaUrl = async () => "https://storage.example/v1/upload?id=abc";

function slot(props: Partial<Parameters<typeof UnggahDokumen>[0]> = {}) {
  return (
    <UnggahDokumen
      label="Selfie dengan KTP"
      keterangan="Wajah dan KTP harus terlihat dalam satu foto."
      nilai={null}
      onUbah={() => {}}
      mintaUrl={mintaUrl}
      {...props}
    />
  );
}

// ===== 1. Bidang masih kosong =====
{
  const html = renderToStaticMarkup(slot());
  ada(html, "Selfie dengan KTP", "label bidang tampil");
  ada(html, "Wajah dan KTP harus terlihat dalam satu foto.", "keterangan tampil");
  ada(html, "Pilih berkas", "ajakan memilih berkas saat kosong");
  tidakAda(html, "Ganti berkas", "belum menawarkan ganti berkas");
  tidakAda(html, "Hapus", "belum ada tombol hapus");
  ada(html, 'aria-label="Berkas Selfie dengan KTP"', "input punya label aksesibilitas");
  ada(html, 'type="file"', "input berkas terpasang");
  ada(html, 'accept="image/*,application/pdf"', "jenis berkas dibatasi");
  // Dasar pembanding untuk uji nonaktif di bawah: slot yang aktif tidak boleh
  // membawa atribut `disabled`. Dicari bentuk atributnya (`disabled=""`), bukan
  // kata "disabled" mentah, karena kelas Tailwind ikut memuat `disabled:`.
  ok(!html.includes('disabled=""'), "slot aktif tanpa atribut disabled");
  bersih(html, "slot kosong");
}

// ===== 2. Bidang sudah terisi =====
{
  const html = renderToStaticMarkup(
    slot({
      nilai: { id: "storage-123" as Id<"_storage">, nama: "selfie-ktp.png" },
    }),
  );
  ada(html, "Ganti berkas", "menawarkan ganti berkas saat terisi");
  ada(html, "selfie-ktp.png", "nama berkas terunggah tampil");
  ada(html, "Hapus", "tombol hapus tersedia saat terisi");
  tidakAda(html, "Pilih berkas", "tidak lagi menawarkan pilih berkas");
  bersih(html, "slot terisi");
}

// ===== 3. Slot dinonaktifkan =====
// Kedua tombol harus membawa atribut `disabled` supaya pengguna tidak bisa
// memilih/menghapus berkas saat formulir sedang tidak boleh diubah.
{
  const html = renderToStaticMarkup(
    slot({
      disabled: true,
      nilai: { id: "storage-9" as Id<"_storage">, nama: "bukti.pdf" },
    }),
  );
  const jumlahDisabled = (html.match(/disabled=""/g) ?? []).length;
  ok(jumlahDisabled >= 2, `kedua tombol dinonaktifkan (ditemukan ${jumlahDisabled})`);
  ada(html, "bukti.pdf", "nama berkas tetap terlihat saat nonaktif");
  bersih(html, "slot nonaktif");
}

// ===== 4. Label bidang berbeda tidak saling tertukar =====
{
  const html = renderToStaticMarkup(
    slot({ label: "Bukti penghasilan", keterangan: "Contoh: slip gaji." }),
  );
  ada(html, 'aria-label="Berkas Bukti penghasilan"', "label aksesibilitas ikut berubah");
  ada(html, "Contoh: slip gaji.", "keterangan bidang ini yang tampil");
  tidakAda(html, "Selfie dengan KTP", "tidak memakai label bidang lain");
  bersih(html, "slot berlabel lain");
}

// ===== 5. Pesan galat hanya muncul saat ada galat =====
// `galat` diisi dari kegagalan unggah sehingga tidak bisa dipicu pada markup
// statis; yang dipastikan di sini adalah bidang bersih TIDAK menampilkan
// wadah galat (role="alert") saat tidak ada masalah.
{
  const html = renderToStaticMarkup(slot());
  tidakAda(html, 'role="alert"', "tanpa galat tidak ada peringatan");
}

console.log(`UnggahDokumen.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
