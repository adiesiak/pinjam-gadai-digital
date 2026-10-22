import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { KONTEN_PENDANA_DEFAULT } from "@/lib/kontenPendana";

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
ada(html, "biaya platform 5%", "biaya platform disebut");

// ===== Kartu contoh: angka dari modul yang sama dengan server =====
ada(html, "Rp 10.000.000", "nominal contoh tampil");
ada(html, "Rp 3.000.000", "Imbal Hasil 30% tampil");
ada(html, "Rp 13.000.000", "uang yang kembali tampil");
ada(html, "Rp 650.000", "biaya platform 5% tampil");
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

// ===== Tarif berubah: seluruh halaman ikut berubah =====
{
  const lain = gambar(3);
  ada(lain, "Rp 390.000", "biaya 3% dihitung ulang");
  ada(lain, "Rp 12.610.000", "diterima bersih 3% dihitung ulang");
  tidakAda(lain, "Rp 650.000", "biaya tarif lama tidak tertinggal");
  tidakAda(lain, "Rp 12.350.000", "diterima tarif lama tidak tertinggal");
  ada(lain, "biaya platform 3%", "label biaya mengikuti pengaturan");
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
            "Biaya platform {biaya} dan Imbal Hasil {imbal} per {siklus} hari.",
          faq: KONTEN_PENDANA_DEFAULT.faq.map((item, i) =>
            i === 0 ? { tanya: "Pertanyaan dari admin?", jawab: "Jawaban dari admin." } : item,
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
  ada(lain, "Biaya platform 5% dan Imbal Hasil 30% per 30 hari.", "token CMS diisi angka kebijakan");
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

// ===== Tidak ada sisa render yang rusak =====
tidakAda(html, "undefined", "tanpa undefined");
tidakAda(html, "[object Object]", "tanpa objek yang bocor");
tidakAda(html, "NaN", "tanpa NaN");
tidakAda(html, "\u2014", "tanpa tanda pisah panjang");

console.log(`JadiPendana.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
