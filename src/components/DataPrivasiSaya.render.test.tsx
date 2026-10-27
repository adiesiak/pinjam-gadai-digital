/**
 * Uji render blok MURNI kartu Data & privasi.
 * Run: bun src/components/DataPrivasiSaya.render.test.tsx
 *
 * Yang dijaga:
 *  - tombol hapus TERKUNCI sampai frasa konfirmasi diketik tepat;
 *  - akibat penghapusan dinyatakan lebih dulu, termasuk riwayat keuangan yang
 *    tetap tersimpan dan syarat "tidak ada kewajiban berjalan";
 *  - galat dari server ditampilkan apa adanya (role="alert"), bukan disembunyikan;
 *  - keadaan sibuk terlihat sebagai aria-busy, bukan hanya warna.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { KONFIRMASI_HAPUS_AKUN } from "@/lib/hakData";

import { BlokHapusAkun, BlokSalinanData } from "./DataPrivasiSaya";

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
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}

const dasarHapus = {
  onFrasa: () => {},
  onAlasan: () => {},
  sibuk: false,
  galat: null,
  onHapus: () => {},
};

// ===== 1. Frasa belum diketik: tombol terkunci =====
{
  const html = renderToStaticMarkup(
    <BlokHapusAkun {...dasarHapus} frasa="" alasan="" />,
  );
  ada(html, KONFIRMASI_HAPUS_AKUN, "frasa konfirmasi disebutkan");
  ada(html, "Tombol aktif setelah frasa diketik tepat", "keadaan terkunci dijelaskan");
  // React menulis atribut boolean sebagai `disabled=""`; kelas varian tombol
  // juga memuat kata "disabled:", jadi yang dicari atributnya, bukan katanya.
  ok(html.includes('disabled=""'), "tombol hapus terkunci");
  ada(html, "tidak bisa dibatalkan", "akibat permanen dinyatakan");
  ada(html, "Riwayat keuangan tetap tersimpan", "nasib riwayat keuangan dinyatakan");
  ada(html, "masih berjalan", "syarat kewajiban berjalan dinyatakan");
}

// ===== 2. Frasa tepat: tombol aktif =====
{
  const html = renderToStaticMarkup(
    <BlokHapusAkun {...dasarHapus} frasa={KONFIRMASI_HAPUS_AKUN} alasan="" />,
  );
  tidakAda(html, "Tombol aktif setelah frasa diketik tepat", "petunjuk kunci hilang");
  tidakAda(html, 'disabled=""', "tidak ada tombol terkunci di blok hapus");
}

// ===== 3. Frasa mirip tapi tidak tepat tetap terkunci =====
{
  const html = renderToStaticMarkup(
    <BlokHapusAkun {...dasarHapus} frasa="HAPUS AKUN" alasan="" />,
  );
  ok(html.includes('disabled=""'), "frasa tidak tepat tetap mengunci tombol");
}

// ===== 4. Sedang menghapus: aria-busy dan label proses =====
{
  const html = renderToStaticMarkup(
    <BlokHapusAkun
      {...dasarHapus}
      frasa={KONFIRMASI_HAPUS_AKUN}
      alasan=""
      sibuk
      galat="Masih ada gadai yang masih berjalan."
    />,
  );
  ada(html, "Menghapus akun", "label proses tampil");
  ada(html, 'aria-busy="true"', "keadaan sibuk diumumkan ke pembaca layar");
  ada(html, 'role="alert"', "galat server ditandai sebagai peringatan");
  ada(html, "Masih ada gadai yang masih berjalan.", "pesan galat ditampilkan apa adanya");
}

// ===== 5. Blok salinan data =====
// Tautan kebijakan memakai `Link`, jadi render-nya butuh konteks router.
{
  const siap = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <BlokSalinanData sibuk={false} galat={null} onUnduh={() => {}} />
    </MemoryRouter>,
  );
  ada(siap, "Unduh salinan data (JSON)", "tombol unduh siap pakai");
  ada(siap, "/privasi", "tautan ke kebijakan privasi ada");
  ada(siap, "sepuluh menit", "umur tautan berkas dijelaskan");

  const sibuk = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <BlokSalinanData sibuk galat={null} onUnduh={() => {}} />
    </MemoryRouter>,
  );
  ada(sibuk, "Menyusun salinan", "keadaan menyusun salinan tampil");
  ok(sibuk.includes('disabled=""'), "tombol unduh terkunci selama menyusun");

  const gagal = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <BlokSalinanData sibuk={false} galat="Sesi tidak ditemukan." onUnduh={() => {}} />
    </MemoryRouter>,
  );
  ada(gagal, "Sesi tidak ditemukan.", "galat salinan ditampilkan");
}

console.log(`DataPrivasiSaya render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
