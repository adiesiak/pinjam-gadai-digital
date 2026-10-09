/**
 * Uji render daftar notifikasi (presentasional, tanpa server).
 * Run: bun src/components/notifications/notifikasi-list.render.test.tsx
 *
 * Yang dijaga adalah keadaan yang bisa dibaca pengguna di markup: keempat
 * keadaan (memuat, galat, kosong, siap), pembedaan jenis yang tidak bergantung
 * warna saja, penanda belum dibaca, tombol tandai-dibaca hanya untuk yang belum
 * dibaca, dan tidak adanya klaim atau angka yang dikarang.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { NotifikasiItem } from "@/lib/notifikasi";

import { NotifikasiList } from "./notifikasi-list";

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
const jumlah = (html: string, pola: RegExp) => (html.match(pola) ?? []).length;

const SEKARANG = Date.UTC(2026, 9, 9, 12, 0, 0);
const menit = 60_000;

const ITEM: NotifikasiItem[] = [
  {
    kunci: "pengingat:1",
    jenis: "peringatan",
    judul: "Jatuh tempo hari ini",
    ringkasan: "Pengingat internal untuk PGD-1 · kewajiban tercatat Rp 1.300.000 · 2 jam lalu.",
    waktu: SEKARANG - 2 * 60 * menit,
    tautan: "/dashboard?tab=jadwal",
    dibaca: false,
  },
  {
    kunci: "bukti:2",
    jenis: "sukses",
    judul: "Bukti pembayaran dicocokkan",
    ringkasan: "Bukti Rp 500.000 untuk PGD-2 · status dicocokkan.",
    waktu: SEKARANG - 30 * menit,
    tautan: "/dashboard?tab=riwayat",
    dibaca: false,
  },
  {
    kunci: "lokasi:3",
    jenis: "peringatan",
    judul: "Koordinat perangkat tercatat berulang",
    ringkasan: "Penanda otomatis pada koordinat_identik · belum ada catatan pengiriman WhatsApp.",
    waktu: SEKARANG - 3 * 24 * 60 * menit,
    tautan: "/dashboard",
    dibaca: true,
  },
];

function list(props: Partial<Parameters<typeof NotifikasiList>[0]> = {}) {
  return renderToStaticMarkup(
    <NotifikasiList
      item={ITEM}
      onTandaiDibaca={() => {}}
      onTandaiSemuaDibaca={() => {}}
      sekarang={SEKARANG}
      {...props}
    />,
  );
}

// ===== 1. Keadaan memuat =====
{
  const html = renderToStaticMarkup(
    <NotifikasiList item={[]} memuat onTandaiDibaca={() => {}} onTandaiSemuaDibaca={() => {}} />,
  );
  ada(html, "Memuat daftar…", "keadaan memuat memakai rangka baris daftar");
  ada(html, 'role="status"', "keadaan memuat diumumkan sebagai wilayah status");
  tidakAda(html, "Jatuh tempo hari ini", "belum ada isi saat memuat");
}

// ===== 2. Keadaan galat =====
{
  const html = renderToStaticMarkup(
    <NotifikasiList
      item={[]}
      galat="Gagal menandai notifikasi sebagai dibaca."
      onCoba={() => {}}
      onTandaiDibaca={() => {}}
      onTandaiSemuaDibaca={() => {}}
    />,
  );
  ada(html, 'role="alert"', "galat diumumkan sebagai alert");
  ada(html, "Gagal menandai notifikasi sebagai dibaca.", "pesan galat tampil apa adanya");
  ada(html, "Coba lagi", "ada jalan keluar untuk mencoba lagi");
}

// ===== 3. Keadaan kosong =====
{
  const html = renderToStaticMarkup(
    <NotifikasiList item={[]} onTandaiDibaca={() => {}} onTandaiSemuaDibaca={() => {}} />,
  );
  ada(html, "Belum ada notifikasi", "keadaan kosong menjelaskan dirinya");
  ada(html, "pengingat jatuh tempo", "keadaan kosong menyebut sumber notifikasi yang nyata");
  tidakAda(html, 'role="alert"', "keadaan kosong bukan galat");
}

// ===== 4. Keadaan siap =====
{
  const html = list();
  ada(html, 'aria-label="Daftar notifikasi"', "daftar punya nama untuk pembaca layar");
  ada(html, "Jatuh tempo hari ini", "judul notifikasi tampil");
  ada(html, "Bukti pembayaran dicocokkan", "notifikasi bukti pembayaran tampil");
  ada(html, "2 belum dibaca", "jumlah belum dibaca tampil");

  // Pembedaan jenis: label teks selalu ada, bukan hanya warna.
  ada(html, "Peringatan", "jenis peringatan diberi label");
  ada(html, "Keberhasilan", "jenis keberhasilan diberi label");

  // Keadaan baca.
  ada(html, "Belum dibaca", "notifikasi belum dibaca ditandai");
  ada(html, "Sudah dibaca", "notifikasi yang sudah dibaca ditandai");
  ada(html, 'aria-label="Tandai dibaca: Jatuh tempo hari ini"', "tombol tandai dibaca menyebut judulnya");
  ok(
    jumlah(html, /Tandai dibaca: /g) === 2,
    `hanya notifikasi belum dibaca yang punya tombol tandai dibaca (ditemukan ${jumlah(html, /Tandai dibaca: /g)})`,
  );
  ada(html, "Tandai semua dibaca", "ada tindakan tandai semua");

  // Waktu relatif dari jam yang diberikan (tidak bergantung jam mesin uji).
  ada(html, "2 jam lalu", "waktu relatif dihitung dari jam yang diberikan");
  ada(html, "3 hari lalu", "waktu relatif hari terhitung");

  // Tidak ada angka atau klaim yang dikarang.
  tidakAda(html, "%", "tidak ada persentase di daftar notifikasi");
  tidakAda(html, "terkirim", "panel tidak mengklaim ada pesan yang terkirim");
  ada(html, "tidak mengirim pesan apa pun", "panel menjelaskan batasnya sendiri");
}

// ===== 5. Animasi hanya untuk yang benar-benar baru =====
{
  const html = list({ kunciBaruSet: new Set(["bukti:2"]) });
  ok(
    jumlah(html, /motion-slide-down/g) === 1,
    `hanya satu item baru yang dianimasikan (ditemukan ${jumlah(html, /motion-slide-down/g)})`,
  );
  const tanpaBaru = list();
  ok(
    jumlah(tanpaBaru, /motion-slide-down/g) === 0,
    "penyegaran biasa tidak menganimasikan ulang apa pun",
  );
}

// ===== 6. Semua sudah dibaca =====
{
  const html = list({ item: ITEM.map((it) => ({ ...it, dibaca: true })) });
  ada(html, "semua terbaca", "keadaan semua terbaca disebutkan");
  ok(
    jumlah(html, /disabled=""/g) >= 1,
    "tindakan tandai-semua tidak bisa ditekan saat tidak ada yang belum dibaca",
  );
  tidakAda(html, "Tandai dibaca: ", "tidak ada tombol tandai dibaca untuk item yang sudah dibaca");
}

console.log(`notifikasi-list.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
