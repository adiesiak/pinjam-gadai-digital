import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { KONTEN_PENDANA_DEFAULT } from "@/lib/kontenPendana";
import { formatRupiahAman } from "@/lib/money";
import {
  PROPOSAL_DIPERBARUI_PADA,
  formatPersen,
  keuntunganBulananProposal,
  pembagianKonvensionalProposal,
  pembagianSyariahProposal,
  simulasiBulananProposal,
  simulasiKonvensionalProposal,
  simulasiSyariahProposal,
  tarifBulananProposal,
} from "@/lib/proposalPendana";

import { JadiPendanaView } from "./JadiPendana";

/**
 * Uji markup halaman "Jadi pendana".
 * Run: bun src/pages/JadiPendana.render.test.tsx
 *
 * Yang dijaga:
 *  - angka di layar sama dengan angka proposal (`lib/imbalPendana`), termasuk
 *    saat biaya platform diubah admin;
 *  - tombol unduh tidak pernah dikunci, karena proposal harus bisa diambil
 *    kapan saja selama sesi ruang pendana masih berlaku;
 *  - halaman ini bukan rute publik: hanya dibuka lewat gerbang ruang pendana;
 *  - setiap tautan internal punya rute nyata;
 *  - risiko dan batas layanan tetap tercetak, bukan hanya di dokumen PDF.
 */

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}

function gambar(persen: number): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/jadi-pendana"]}>
      <JadiPendanaView persenPotonganAdmin={persen} />
    </MemoryRouter>,
  );
}

const html = gambar(5);

// ===== Judul dan janji halaman =====
ada(
  html,
  "Imbal Hasil 30% per siklus 30 hari, tertulis sejak awal.",
  "judul halaman",
);
ada(html, "Imbal Hasil 30%", "Imbal Hasil ditulis sebagai kebijakan");
ada(html, "siklus 30 hari", "siklus pendana disebut");
ada(html, "porsi platform 21,67%", "porsi platform disebut");

// ===== Kartu contoh: angka dari modul yang sama dengan server =====
ada(html, "Rp 10.000.000", "nominal contoh tampil");
ada(html, "Rp 3.000.000", "Imbal Hasil 30% tampil");
ada(html, "Rp 13.000.000", "uang yang kembali tampil");
ada(html, "Rp 650.000", "biaya platform 5% dari total kembali tampil");
ada(html, "Rp 12.350.000", "diterima bersih tampil");
ada(html, "Rp 2.350.000", "keuntungan bersih tampil");

// ===== Kalkulator dan unduhan =====
ada(html, 'id="kalkulator"', "bagian kalkulator punya sasaran tautan");
ada(html, 'for="nominal-pendanaan"', "kolom nominal punya label");
ada(html, 'aria-live="polite"', "hasil hitung diumumkan saat berubah");
ada(html, "Unduh proposal (PDF)", "tombol unduh di hero");
ada(html, "Unduh proposal lengkap (PDF)", "tombol unduh di bagian proposal");
ada(html, "Proposal pendanaan", "judul bagian proposal");
ada(html, "TAM, SAM, dan SOM", "isi proposal menyebut analisis pasar");
ada(html, "Satu pembagian untuk semua produk", "cakupan produk dinyatakan");
ada(
  html,
  "Pembagian produk konvensional",
  "bagian konvensional tampil",
);
for (const baris of pembagianKonvensionalProposal()) {
  ada(html, baris.produk, `produk konvensional ${baris.produk} tampil`);
  ada(
    html,
    formatRupiahAman(baris.pendana),
    `hak pendana ${baris.produk} tampil`,
  );
}
ada(html, "Rp 783.334", "hak pendana gadai tampil");
ada(html, "Rp 4.700.000", "hak pendana kredit barang tampil");
ada(
  html,
  "Simulasi konvensional Rp 1 juta sampai Rp 10 juta",
  "simulasi konvensional tampil",
);
for (const baris of simulasiKonvensionalProposal()) {
  ada(
    html,
    formatRupiahAman(baris.pokok),
    `pokok konvensional ${baris.pokok} tampil`,
  );
}
ada(
  html,
  "Keuntungan pinjaman bulanan 1/3/6/9/12",
  "tabel tenor bulanan di halaman",
);
for (const b of keuntunganBulananProposal()) {
  ada(html, `${b.tenor} bulan`, `tenor ${b.tenor} bulan tampil`);
  ada(html, formatRupiahAman(b.pendana), `hak pendana tenor ${b.tenor} tampil`);
}
ada(
  html,
  "Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta",
  "simulasi bulanan 1 juta sampai 10 juta ada",
);
for (const baris of simulasiBulananProposal()) {
  ada(html, formatRupiahAman(baris.pokok), `pokok ${baris.pokok} tampil`);
}
ada(html, "Bunga / bulan", "kolom bunga per bulan tampil");
for (const t of tarifBulananProposal()) {
  ada(
    html,
    `${formatPersen(t.perBulan)}`,
    `bunga ${t.perBulan}% tenor ${t.tenor} tampil`,
  );
}
ada(html, "Pembagian produk syariah", "bagian syariah tampil");
for (const baris of pembagianSyariahProposal()) {
  ada(html, baris.akad, `akad ${baris.akad} tampil`);
  ada(
    html,
    formatRupiahAman(baris.pendana),
    `hak pendana ${baris.akad} tampil`,
  );
}
ada(html, "Rp 1.566.667", "hak pendana murabahah tampil");
ada(html, "Rp 156.667", "hak pendana rahn tampil");
ada(
  html,
  "Simulasi syariah Rp 1 juta sampai Rp 10 juta",
  "simulasi syariah tampil",
);
for (const baris of simulasiSyariahProposal()) {
  ada(
    html,
    formatRupiahAman(baris.pokok),
    `pokok syariah ${baris.pokok} tampil`,
  );
}
ada(html, "Rp 235.000", "hak pendana 1 juta tenor 1 bulan tampil");
ada(html, "Rp 7.520.000", "hak pendana 10 juta tenor 12 bulan tampil");
for (const produk of [
  "Pinjaman harian",
  "Pinjaman bulanan",
  "Pembiayaan syariah",
  "Gadai",
  "Kredit barang",
]) {
  ada(html, produk, `produk ${produk} tercantum`);
}
ada(
  html,
  "Rp 5 juta sampai Rp 50 juta",
  "isi proposal menyebut rentang simulasi",
);
tidakAda(html, "sampai Rp 100 juta", "rentang simulasi lama tidak tertinggal");
ada(
  html,
  "hanya terbuka dari ruang pendana",
  "syarat akses unduhan dinyatakan",
);
tidakAda(html, "tanpa akun", "klaim unduhan tanpa akun sudah dicabut");

// Tombol unduh tidak boleh menunggu admin atau sesi.
ok(html.split("Unduh proposal").length >= 3, "dua tombol unduh dirender");
tidakAda(html, 'disabled=""', "tidak ada tombol yang terkunci");

// ===== Risiko, batas layanan, dan kontak =====
ada(html, "Sisi yang tidak menguntungkan", "bagian risiko ada");
ada(html, "Modal bisa hilang", "risiko gagal bayar disebut");
ada(html, "Tidak ada penjamin pihak ketiga", "batas penjamin disebut");
ada(html, "bukan jaminan hasil", "kalimat bukan jaminan ada");
ada(html, "0851-1957-4032", "nomor layanan tampil");
ada(html, "wa.me/6285119574032", "tombol WhatsApp menuju nomor resmi");
ada(html, "Masuk ruang pendana", "jalan masuk pendana yang sudah punya akun");

// ===== Pertanyaan yang benar-benar spesifik =====
ada(html, "Apakah uang saya dijamin kembali?", "FAQ jaminan");
ada(html, "Bisakah dana ditarik kapan saja?", "FAQ penarikan dana");
tidakAda(html, "Apakah data saya aman?", "tanpa FAQ template");

// ===== Porsi tetap: pengaturan biaya lama tidak mengubah pembagian =====
{
  const lain = gambar(3);
  ada(lain, "Rp 650.000", "porsi platform tetap dihitung dari marjin");
  ada(lain, "Rp 12.350.000", "diterima bersih tidak berubah");
  ada(lain, "porsi platform 21,67%", "label porsi tidak mengikuti tarif lama");
}

// ===== Semua tautan internal menuju rute yang nyata =====
{
  const ruteSah = new Set([
    "/",
    "/penyedia-dana",
    "/layanan/pinjaman-tunai",
    "/biaya",
    "/cara-kerja",
    "/keamanan",
    "/faq",
    "/aplikasi",
    "/syarat-ketentuan",
    "/auth?returnTo=%2Fpenyedia-dana",
  ]);
  const href = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  ok(href.length > 10, "halaman memuat tautan navigasi");
  for (const tujuan of href) {
    if (tujuan.startsWith("#")) {
      ok(
        html.includes(`id="${tujuan.slice(1)}"`),
        `tautan jangkar ${tujuan} punya sasaran`,
      );
      continue;
    }
    if (tujuan.startsWith("http")) {
      ok(tujuan.startsWith("https://wa.me/"), `tautan luar ${tujuan} resmi`);
      continue;
    }
    ok(ruteSah.has(tujuan), `tautan internal ${tujuan} terdaftar`);
  }
}

// ===== Rute, gerbang, dan tautan masuk benar-benar terpasang =====
{
  const shell = readFileSync(
    fileURLToPath(new URL("../main.tsx", import.meta.url)),
    "utf8",
  );
  ada(shell, 'path="/jadi-pendana"', "rute /jadi-pendana terdaftar");
  ada(
    shell,
    'import("./pages/JadiPendana.tsx")',
    "halaman dimuat lazy seperti halaman lain",
  );
  ada(shell, "<RequirePendana>", "rute dijaga gerbang ruang pendana");

  const gerbang = readFileSync(
    fileURLToPath(new URL("../components/RequireAuth.tsx", import.meta.url)),
    "utf8",
  );
  ada(
    gerbang,
    'to="/akses-bersama"',
    "pengunjung tanpa sesi diarahkan ke kode akses bersama",
  );
  ada(
    gerbang,
    'role !== "pengamat"',
    "gerbang mengenali peran pemantau kode bersama",
  );

  const landing = readFileSync(
    fileURLToPath(new URL("./LandingHome.tsx", import.meta.url)),
    "utf8",
  );
  tidakAda(
    landing,
    "/jadi-pendana",
    "beranda tidak lagi menautkan halaman ini",
  );

  const ruang = readFileSync(
    fileURLToPath(new URL("./PenyediaDana.tsx", import.meta.url)),
    "utf8",
  );
  ada(
    ruang,
    'to="/jadi-pendana"',
    "ruang pendana menjadi pintu ke halaman proposal",
  );
}

// ===== Konten yang diubah admin menggantikan teks bawaan =====
{
  const lain = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/jadi-pendana"]}>
      <JadiPendanaView
        persenPotonganAdmin={5}
        konten={{
          ...KONTEN_PENDANA_DEFAULT,
          heroJudul: "Judul halaman dari admin",
          heroDeskripsi:
            "Porsi platform {biaya} dan Imbal Hasil {imbal} per {siklus} hari.",
          faq: KONTEN_PENDANA_DEFAULT.faq.map((item, i) =>
            i === 0
              ? {
                  tanya: "Pertanyaan dari admin?",
                  jawab: "Jawaban dari admin.",
                }
              : item,
          ),
        }}
      />
    </MemoryRouter>,
  );
  ada(lain, "Judul halaman dari admin", "judul CMS dipakai");
  tidakAda(
    lain,
    "Imbal Hasil 30% per siklus 30 hari, tertulis sejak awal.",
    "judul bawaan tidak tertinggal saat CMS diisi",
  );
  // Token diisi dari kebijakan yang berlaku, bukan dari teks admin.
  ada(
    lain,
    "Porsi platform 21,67% dan Imbal Hasil 30% per 30 hari.",
    "token CMS diisi angka kebijakan",
  );
  ada(lain, "Pertanyaan dari admin?", "FAQ dari CMS dipakai");
  ada(lain, "Rp 650.000", "angka di luar teks CMS tetap dihitung");
}

// ===== Proposal yang dipasang admin memakai catatan berkas =====
{
  const lain = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/jadi-pendana"]}>
      <JadiPendanaView
        persenPotonganAdmin={5}
        proposalTersimpan={{
          url: "https://example.convex.cloud/proposal.pdf",
          namaBerkas: "proposal-kemitraan-2027.pdf",
        }}
      />
    </MemoryRouter>,
  );
  ada(
    lain,
    "Berkas ini diterbitkan tim PINDAI dan tidak dihitung ulang saat diunduh.",
    "catatan berkas dipakai saat proposal dipasang admin",
  );
  tidakAda(
    lain,
    "Dokumen dibuat ulang setiap kali diunduh",
    "catatan proposal otomatis tidak dipakai bersama berkas admin",
  );
  ada(lain, "Unduh proposal lengkap (PDF)", "tombol unduh tetap tersedia");
  tidakAda(lain, 'disabled=""', "tombol unduh berkas tidak terkunci");
}

// ===== Berkas admin yang lebih lama dari pembaruan tidak menutupi PDF baru =====
{
  const lain = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/jadi-pendana"]}>
      <JadiPendanaView
        persenPotonganAdmin={5}
        proposalTersimpan={{
          url: "https://example.convex.cloud/proposal.pdf",
          namaBerkas: "proposal-lama.pdf",
          pada: PROPOSAL_DIPERBARUI_PADA - 1,
        }}
      />
    </MemoryRouter>,
  );
  ada(
    lain,
    "Berkas yang dipasang admin lebih lama dari pembaruan proposal",
    "berkas lama diberi peringatan",
  );
  ada(
    lain,
    "Dokumen dibuat ulang setiap kali diunduh",
    "halaman kembali menyusun dokumen terbaru",
  );
  tidakAda(
    lain,
    "Berkas ini diterbitkan tim PINDAI dan tidak dihitung ulang saat diunduh.",
    "catatan berkas lama tidak dipakai",
  );
}

// ===== Tidak ada sisa render yang rusak =====
tidakAda(html, "undefined", "tanpa undefined");
tidakAda(html, "[object Object]", "tanpa objek yang bocor");
tidakAda(html, "NaN", "tanpa NaN");
tidakAda(html, "\u2014", "tanpa tanda pisah panjang");

console.log(`JadiPendana.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
