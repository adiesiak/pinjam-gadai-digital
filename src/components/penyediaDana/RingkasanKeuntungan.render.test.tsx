/**
 * Uji render "Ringkasan keuntungan" di puncak ruang pendana.
 * Run: bun src/components/penyediaDana/RingkasanKeuntungan.render.test.tsx
 *
 * Yang dijaga: angka yang sudah dibukukan dan angka yang masih diperkirakan
 * tidak boleh tertukar atau tergabung, dan ringkasannya harus terbaca sebagai
 * tiga angka (bukan kalimat bertumpuk) — pendana yang membacanya tidak
 * boleh menyimpulkan uang yang belum cair sebagai haknya.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { RingkasanKeuntungan, type AngkaRingkasanKeuntungan } from "./RingkasanKeuntungan";

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
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}
/** Isi satu kartu angka: dari judulnya sampai penutup kartunya. */
function kartu(html: string, judul: string): string {
  const mulai = html.indexOf(judul);
  ok(mulai !== -1, `kartu "${judul}" ada`);
  if (mulai === -1) return "";
  const selesai = html.indexOf("</div>", mulai);
  return selesai === -1 ? html.slice(mulai) : html.slice(mulai, selesai);
}

/** Angka contoh yang cocok dengan rekap: 705.000 dibukukan + 2.585.000 perkiraan. */
const ANGKA: AngkaRingkasanKeuntungan = {
  totalKeuntunganPendanaLunas: 705_000,
  totalKeuntunganPendanaBelumLunas: 2_585_000,
  totalKeuntunganPendana: 3_290_000,
  totalKeuntunganAdmin: 910_000,
  totalKeuntunganAdminLunas: 195_000,
  totalKeuntunganAdminBelumLunas: 715_000,
  totalTransferBelumDicatat: 1,
  nilaiTransferBelumDicatat: 235_000,
};

const html = renderToStaticMarkup(<RingkasanKeuntungan ringkasan={ANGKA} />);

// Judul + cakupan (menyeluruh, bukan milik satu akun).
ada(html, "Ringkasan keuntungan", "judul ringkasan");
ada(html, "Seluruh pendana", "cakupan angka dinyatakan supaya tidak salah baca");
ada(html, "Ringkasan keuntungan pendana", "bagian punya nama untuk pembaca layar");

// Tiga angka utama, masing-masing di kartunya sendiri.
const sudah = kartu(html, "Sudah lunas · dibukukan");
const belum = kartu(html, "Belum lunas · perkiraan");
const total = kartu(html, "Total keuntungan pendana");
ok(sudah.includes("Rp 705.000"), "kartu dibukukan memuat angka yang sudah cair");
ok(!sudah.includes("Rp 2.585.000"), "kartu dibukukan tidak memuat angka perkiraan");
ok(belum.includes("Rp 2.585.000"), "kartu perkiraan memuat angka perkiraan");
ok(!belum.includes("Rp 705.000"), "kartu perkiraan tidak memuat angka yang sudah cair");
ok(total.includes("Rp 3.290.000"), "kartu total memuat jumlah keduanya");
ok(
  sudah.includes("keuntungan yang sudah menjadi hak pendana"),
  "kartu dibukukan menjelaskan artinya",
);
ok(
  belum.includes("hitungan atas pinjaman yang masih berjalan — belum dibukukan"),
  "kartu perkiraan menjelaskan artinya",
);

// Peringatan yang tidak boleh tenggelam: angka perkiraan bukan uang.
// (`<strong>` di tengah kalimat termasuk markup — diperiksa apa adanya.)
ada(
  html,
  "Angka <strong>perkiraan</strong> baru menjadi uang pendana saat pinjamannya lunas.",
  "catatan jujur tentang angka perkiraan",
);
ada(html, "Angka <strong>perkiraan</strong>", "kata \"perkiraan\" sendiri ditandai tegas");

// Potongan admin tetap dijelaskan dengan istilah yang sama dengan kartunya.
ada(html, "Potongan admin Rp 910.000", "total potongan admin");
ada(html, "sudah dibukukan Rp 195.000", "potongan admin yang sudah dibukukan");
ada(html, "perkiraan Rp 715.000", "potongan admin yang masih perkiraan");
ada(html, "bukan dari Imbal Hasil saja — pokok tetap kembali utuh", "dasar potongan dijelaskan");

// Transfer yang belum dicatat ditandai sebagai lencana, bukan baris kecil.
ada(html, "1 transfer keuntungan belum dicatat", "peringatan transfer belum dicatat");
ada(html, "Rp 235.000", "nilai transfer yang belum dicatat");

bersih(html, "markup ringkasan");

// ===== Semua nol: tetap tampil sebagai angka nol, bukan tanda pisah =====
const nol = renderToStaticMarkup(
  <RingkasanKeuntungan
    ringkasan={{
      totalKeuntunganPendanaLunas: 0,
      totalKeuntunganPendanaBelumLunas: 0,
      totalKeuntunganPendana: 0,
      totalKeuntunganAdmin: 0,
      totalKeuntunganAdminLunas: 0,
      totalKeuntunganAdminBelumLunas: 0,
      totalTransferBelumDicatat: 0,
      nilaiTransferBelumDicatat: 0,
    }}
  />,
);
// "0" sah di sini karena angkanya memang dari rekap yang sudah termuat —
// berbeda dari panel admin yang memakai tanda pisah untuk data belum siap.
ada(nol, "Rp 0", "nol rupiah ditulis apa adanya");
ok(!nol.includes("belum dicatat"), "tanpa transfer tertunda, tidak ada peringatan transfer");
bersih(nol, "markup ringkasan nol");

console.log(`RingkasanKeuntungan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
