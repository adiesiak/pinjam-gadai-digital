/**
 * Uji logika analitik admin & peringatan risiko (murni, tanpa server).
 * Run: bun src/lib/analitikAdmin.test.ts
 *
 * Yang dijaga: rangkaian tren selalu tepat 30 titik dengan hari kosong bernilai
 * 0 (tidak ada hari yang dilompati), peristiwa di luar rentang tidak dijepit ke
 * ujung grafik, donut melaporkan total & persen yang jujur (termasuk "—" saat
 * belum ada data), dan daftar risiko hanya memuat keadaan yang benar-benar
 * terjadi dengan urutan tingkat tinggi lebih dulu.
 */
import {
  atributPoints,
  busurDonut,
  daftarPeringatanRisiko,
  HARI_TREN,
  hitungTingkat,
  komposisiStatusPinjaman,
  koordinatGaris,
  maksimumSeri,
  METRIK_RISIKO_KOSONG,
  MS_HARI,
  persenBagian,
  seriTren30Hari,
  totalKomposisi,
  totalTren,
  type PeristiwaTren,
} from "./analitikAdmin";

let passed = 0;
let failed = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL  ${nama}`);
  }
}
function sama<T>(nama: string, nyata: T, harapan: T) {
  cek(`${nama} (${JSON.stringify(nyata)})`, JSON.stringify(nyata) === JSON.stringify(harapan));
}

/* Waktu acuan: 15 Okt 2026, 10:00 waktu lokal. */
const SEKARANG = new Date(2026, 9, 15, 10, 0, 0).getTime();

/* ===== Tren 30 hari ===== */
{
  const seri = seriTren30Hari([], SEKARANG);
  sama("selalu tepat 30 titik", seri.length, HARI_TREN);
  cek("hari kosong bernilai 0", seri.every((t) => t.pencairan === 0 && t.pelunasan === 0));
  cek(
    "titik terakhir adalah HARI INI, bukan kemarin",
    seri[seri.length - 1].tanggal === new Date(2026, 9, 15).getTime(),
  );
  cek(
    "titik pertama 29 hari sebelum hari ini",
    seri[0].tanggal === new Date(2026, 9, 15).getTime() - 29 * MS_HARI,
  );
  cek("label terisi", seri.every((t) => t.label.trim() !== ""));

  const peristiwa: PeristiwaTren[] = [
    { tipe: "pencairan", waktu: new Date(2026, 9, 15, 9, 30).getTime(), jumlah: 1_000_000 },
    { tipe: "pencairan", waktu: new Date(2026, 9, 15, 14, 0).getTime(), jumlah: 500_000 },
    { tipe: "pelunasan", waktu: new Date(2026, 9, 14, 8, 0).getTime(), jumlah: 1_300_000 },
  ];
  const terisi = seriTren30Hari(peristiwa, SEKARANG);
  sama("pencairan hari yang sama dijumlahkan", terisi[HARI_TREN - 1].pencairan, 1_500_000);
  sama("pelunasan masuk ke harinya sendiri", terisi[HARI_TREN - 2].pelunasan, 1_300_000);
  sama("total pencairan", totalTren(terisi).pencairan, 1_500_000);
  sama("total pelunasan", totalTren(terisi).pelunasan, 1_300_000);
}

{
  /* Peristiwa di luar rentang: yang lebih tua dibuang, yang dari masa depan juga
     dibuang (tidak dijepit ke titik terakhir, yang akan menggelembungkan hari ini). */
  const seri = seriTren30Hari(
    [
      { tipe: "pencairan", waktu: SEKARANG - 45 * MS_HARI, jumlah: 9_999_999 },
      { tipe: "pencairan", waktu: SEKARANG + 2 * MS_HARI, jumlah: 8_888_888 },
    ],
    SEKARANG,
  );
  sama("peristiwa di luar rentang tidak masuk grafik", totalTren(seri).pencairan, 0);
  sama("panjang seri tidak berubah", seri.length, HARI_TREN);
}

{
  const seri = seriTren30Hari(
    [
      { tipe: "pencairan", waktu: Number.NaN, jumlah: 5 },
      { tipe: "pelunasan", waktu: SEKARANG, jumlah: Number.NaN },
      { tipe: "pelunasan", waktu: SEKARANG, jumlah: 250_000 },
    ],
    SEKARANG,
  );
  sama("waktu/nominal tidak valid diabaikan", totalTren(seri).pelunasan, 250_000);
}

{
  const seri = seriTren30Hari([], SEKARANG, 7);
  sama("jumlah hari bisa diatur (dipakai uji & kalender lain)", seri.length, 7);
}

/* ===== Komposisi donut ===== */
{
  const bagian = komposisiStatusPinjaman({ lancar: 12, ditinjau: 5, jatuhTempo: 3 });
  sama("urutan segmen tetap: lancar, ditinjau, jatuh tempo", bagian.map((b) => b.kunci), [
    "lancar",
    "ditinjau",
    "jatuhTempo",
  ]);
  sama("label dari satu sumber", bagian.map((b) => b.label), ["Lancar", "Ditinjau", "Jatuh Tempo"]);
  sama("total komposisi", totalKomposisi(bagian), 20);
  sama("persen lancar", persenBagian(bagian[0], 20), 60);
  sama("persen jatuh tempo", persenBagian(bagian[2], 20), 15);
  cek(
    "setiap segmen punya warna token",
    bagian.every((b) => /^(#[0-9a-f]{6}|var\(--chart-[1-5]\))$/i.test(b.warna)),
  );

  const kosong = komposisiStatusPinjaman({ lancar: 0, ditinjau: 0, jatuhTempo: 0 });
  sama("tanpa data totalnya 0", totalKomposisi(kosong), 0);
  sama("persen saat total 0 = null (UI menampilkan “—”, bukan 0%)", persenBagian(kosong[0], 0), null);

  const aneh = komposisiStatusPinjaman({ lancar: -5, ditinjau: Number.NaN, jatuhTempo: 2.6 });
  sama("angka negatif/Tidak valid jadi 0, desimal dibulatkan", aneh.map((b) => b.nilai), [0, 0, 3]);
}

/* ===== Peringatan risiko ===== */
{
  sama("metrik kosong → tidak ada peringatan", daftarPeringatanRisiko(METRIK_RISIKO_KOSONG), []);

  const daftar = daftarPeringatanRisiko({
    ...METRIK_RISIKO_KOSONG,
    gpsMismatch: 3,
    pinjamanTanpaLokasi: 5,
    pinjamanTerlambat: 2,
    pengajuanMenunggu: 7,
  });
  sama("hanya metrik > 0 yang muncul", daftar.length, 4);
  sama("peringatan tingkat tinggi lebih dulu", daftar.map((p) => p.tingkat), [
    "tinggi",
    "tinggi",
    "sedang",
    "sedang",
  ]);
  sama("antar tingkat diurut nilai terbesar", daftar.map((p) => p.nilai), [3, 2, 7, 5]);
  sama("judul peringatan", daftar.map((p) => p.judul), [
    "Lokasi di luar radius",
    "Melewati jatuh tempo",
    "Menunggu keputusan",
    "Tanpa titik lokasi terbaru",
  ]);
  cek("setiap peringatan menunjuk modul admin", daftar.every((p) => p.modul.trim() !== ""));
  sama("hitungTingkat merangkum per tingkat", hitungTingkat(daftar), { tinggi: 2, sedang: 2 });

  const ambang = daftarPeringatanRisiko({
    ...METRIK_RISIKO_KOSONG,
    pendapatanDiBawahAmbang: 4,
  });
  sama("pendapatan di bawah ambang menghasilkan peringatan", ambang.length, 1);
  sama("pendapatan di bawah ambang = risiko tinggi", ambang[0].tingkat, "tinggi");
  sama("id-nya stabil untuk pengujian", ambang[0].id, "pendapatan_bawah_ambang");

  /* Urutan harus deterministik walau nilai seri-nya sama: pemecah serinya `id`. */
  const seri = daftarPeringatanRisiko({ ...METRIK_RISIKO_KOSONG, gpsMismatch: 1, pinjamanTerlambat: 1 });
  const ulang = daftarPeringatanRisiko({ ...METRIK_RISIKO_KOSONG, pinjamanTerlambat: 1, gpsMismatch: 1 });
  sama("urutan seri sama stabil", seri.map((p) => p.id), ulang.map((p) => p.id));
}

/* ===== Geometri grafik (SVG) ===== */
{
  sama("maksimum antar dua seri", maksimumSeri([1, 5, 3], [2, 9]), 9);
  sama("lantai maksimum 1 — menghindari bagi nol", maksimumSeri([0], [0]), 1);

  const kotak = { lebar: 100, tinggi: 50, maks: 10 };
  const dua = koordinatGaris([0, 10], kotak);
  sama("nilai 0 di dasar kotak", dua[0], { x: 0, y: 50, nilai: 0 });
  sama("nilai maksimum di puncak kotak", dua[1], { x: 100, y: 0, nilai: 10 });
  sama("nilai tengah proporsional", koordinatGaris([5], kotak)[0].y, 25);
  sama("deret satu titik diletakkan di tengah lebar", koordinatGaris([5], kotak)[0].x, 50);
  sama("deret kosong menghasilkan tanpa titik", koordinatGaris([], kotak), []);
  sama(
    "nilai negatif / Tidak valid jatuh ke dasar (bukan NaN)",
    koordinatGaris([-5, Number.NaN], kotak).map((t) => t.y),
    [50, 50],
  );
  sama("atribut points SVG", atributPoints(dua), "0,50 100,0");
  sama("atribut points deret 30 hari berisi 30 pasangan", atributPoints(koordinatGaris(Array.from({ length: HARI_TREN }, () => 1), kotak)).split(" ").length, HARI_TREN);
}

{
  const RADIUS = 54;
  const KELILING = 2 * Math.PI * RADIUS;
  const busur = busurDonut(komposisiStatusPinjaman({ lancar: 1, ditinjau: 1, jatuhTempo: 0 }), RADIUS);
  sama("segmen bernilai 0 tidak digambar", busur.length, 2);
  const totalPanjang = busur.reduce((n, b) => n + b.panjang, 0);
  cek(
    "busur + celah tidak melebihi keliling (donut tidak menumpuk)",
    totalPanjang + 2 * 2 <= KELILING + 0.01,
  );
  sama("busur pertama mulai di offset 0", busur[0].dashOffset, 0);
  cek(
    "busur kedua tergeser tepat setengah lingkaran",
    Math.abs(busur[1].dashOffset + KELILING / 2) < 0.5,
  );
  cek("setiap busur punya dashArray", busur.every((b) => /^[\d.]+ [\d.]+$/.test(b.dashArray)));
  sama(
    "donut tanpa data tidak menghasilkan busur",
    busurDonut(komposisiStatusPinjaman({ lancar: 0, ditinjau: 0, jatuhTempo: 0 }), RADIUS),
    [],
  );
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`analitikAdmin: ${passed} lulus`);
