/**
 * Uji render dua bagian baru beranda: ringkasan doorprize dan ruang pendana.
 * Run: bun src/components/landing/RingkasanBeranda.render.test.tsx
 *
 * Yang dijaga (tanpa browser, render statis):
 *  1. Doorprize menyebut kuartal dan tanggal undian yang dihitung dari waktu,
 *     bukan tanggal yang ditulis di komponen.
 *  2. Sumber tiket memakai tenor dan kelipatan yang sama dengan `lib/doorprize`.
 *  3. Batas anggaran hadiah tidak dibocorkan ke pengunjung: itu urusan admin.
 *  4. Tautan mengikuti keadaan sesi: dashboard bila sudah masuk, halaman masuk
 *     bila belum.
 *  5. Ruang pendana menampilkan skema tetap dari `lib/imbalPendana` dan tidak
 *     menautkan ke ruangan yang masih dibatasi akses.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { DoorprizeRingkas } from "@/components/landing/DoorprizeRingkas";
import { RuangPendanaRingkas } from "@/components/landing/RuangPendanaRingkas";
import { KELIPATAN_TIKET_PENDANA } from "@/lib/doorprize";
import { PERSEN_IMBAL_PENDANA, TENOR_PENDANA_HARI } from "@/lib/imbalPendana";
import { formatRupiah } from "@/lib/money";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

/** 21 Oktober 2026 WIB: kuartal 4, undian 31 Desember 2026. */
const WAKTU_Q4 = Date.UTC(2026, 9, 21, 3, 0, 0);

function renderDoorprize(sudahMasuk: boolean): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <DoorprizeRingkas
        accountHref={sudahMasuk ? "/dashboard" : "/auth"}
        sudahMasuk={sudahMasuk}
        waktu={WAKTU_Q4}
      />
    </MemoryRouter>,
  );
}

const doorprize = renderDoorprize(true);

// ── 1. Periode dan tanggal undian dihitung dari waktu ──
ok(doorprize.includes("Doorprize Utama Periode Q4"), "judul memuat kuartal berjalan");
ok(doorprize.includes("Oktober"), "rentang kuartal dibaca dari lib");
ok(doorprize.includes("31 Desember 2026"), "tanggal undian dihitung, bukan ditulis");
ok(doorprize.includes('id="doorprize-ringkas-judul"'), "section menunjuk judulnya");

// ── 2. Sumber tiket sama dengan aturan mesin ──
ok(
  doorprize.includes("7, 14, atau 28 hari"),
  "tenor tiket dibaca dari TENOR_OPTIONS",
);
ok(
  doorprize.includes(formatRupiah(KELIPATAN_TIKET_PENDANA)),
  "kelipatan tiket pendana tampil sebagai rupiah",
);

// ── 3. Batas anggaran hadiah tidak tampil ke peminjam dan pendana ──
// Nominal Rp1.000.000 tetap muncul sebagai kelipatan tiket pendana, jadi yang
// diperiksa kalimatnya, bukan angkanya.
ok(
  !doorprize.toLowerCase().includes("hadiah tiap kuartal"),
  "kalimat batas hadiah tidak tersisa",
);
ok(
  !doorprize.toLowerCase().includes("dijaga di bawah"),
  "ambang anggaran hadiah tidak disebut",
);

// ── 4. Tautan mengikuti keadaan sesi ──
ok(doorprize.includes('href="/dashboard"'), "sudah masuk menuju dashboard");
ok(
  doorprize.includes("Buka tiket di dashboard"),
  "label tombol untuk sesi aktif",
);
const doorprizeTamu = renderDoorprize(false);
ok(doorprizeTamu.includes('href="/auth"'), "belum masuk menuju halaman masuk");
ok(
  doorprizeTamu.includes("Masuk untuk melihat tiket"),
  "label tombol untuk pengunjung",
);

// ── 5. Ruang pendana: angka dari skema tetap, tanpa tautan ruangan ──
const pendana = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/"]}>
    <RuangPendanaRingkas />
  </MemoryRouter>,
);
ok(
  pendana.includes(`Imbal hasil tetap ${PERSEN_IMBAL_PENDANA}%`),
  "imbal hasil dibaca dari PERSEN_IMBAL_PENDANA",
);
ok(
  pendana.includes(`${TENOR_PENDANA_HARI} hari`),
  "siklus dibaca dari TENOR_PENDANA_HARI",
);
ok(
  pendana.includes("Akses ruang pendana dibuka oleh tim PINDAI"),
  "syarat akses ditulis jujur",
);
ok(
  !pendana.includes("penyedia-dana"),
  "tidak menautkan ke ruangan yang masih dibatasi",
);
ok(pendana.includes('id="pendana-ringkas-judul"'), "section menunjuk judulnya");

console.log(
  `RingkasanBeranda.render.test: ${passed} lulus, ${failed} gagal`,
);
if (failed > 0) process.exit(1);
