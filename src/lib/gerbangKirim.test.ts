/**
 * Uji gerbang anti-pengiriman palsu (murni, tanpa server).
 * Run: bun src/lib/gerbangKirim.test.ts
 *
 * Yang dijaga di sini adalah dua hal yang paling mudah salah dan paling mahal
 * akibatnya: jangan sampai pengguna sungguhan ditolak (jebakan kosong dan tanpa
 * jejak waktu HARUS lolos), dan jangan sampai payload buatan lolos begitu saja.
 */
import {
  bentukKanonik,
  hashPermintaan,
  JEDA_MINIMAL_KIRIM_MS,
  kunciIdempotensiBaru,
  KOLOM_JEBAKAN,
  periksaGerbangKirim,
  periksaJebakan,
  periksaJedaKirim,
  uraiJejakKirim,
} from "./gerbangKirim";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== jebakan: kosong = pengguna sungguhan, terisi = robot =====
eq(periksaJebakan(undefined), null, "tanpa kolom jebakan bukan pelanggaran");
eq(periksaJebakan(""), null, "jebakan kosong adalah keadaan normal");
eq(periksaJebakan("   "), null, "jebakan berisi spasi saja tetap dianggap kosong");
ok(periksaJebakan("robot@contoh.com") !== null, "jebakan terisi ditolak");
ok(periksaJebakan("x".repeat(201)) !== null, "jebakan kelewat panjang ditolak");
eq(KOLOM_JEBAKAN.length > 0, true, "nama kolom jebakan terisi");

// ===== jeda waktu =====
const DIBUKA = 1_000_000;
eq(periksaJedaKirim(undefined, DIBUKA + 60_000), null, "tanpa jejak waktu tidak menuduh");
eq(periksaJedaKirim(DIBUKA, DIBUKA + 300), periksaJedaKirim(DIBUKA, DIBUKA + 300), "pesan tolakan stabil");
ok(periksaJedaKirim(DIBUKA, DIBUKA + 300) !== null, "kirim di bawah dua detik ditolak");
eq(
  periksaJedaKirim(DIBUKA, DIBUKA + JEDA_MINIMAL_KIRIM_MS),
  null,
  "tepat di ambang batas diterima",
);
eq(periksaJedaKirim(DIBUKA, DIBUKA + 600_000), null, "formulir lama yang akhirnya dikirim diterima");
ok(periksaJedaKirim(DIBUKA + 5000, DIBUKA) !== null, "cap waktu masa depan ditolak");
ok(periksaJedaKirim(0, DIBUKA) !== null, "jejak waktu nol ditolak");
ok(periksaJedaKirim(Number.NaN, DIBUKA) !== null, "jejak waktu bukan angka ditolak");
ok(periksaJedaKirim(-1, DIBUKA) !== null, "jejak waktu negatif ditolak");
eq(periksaJedaKirim(DIBUKA, DIBUKA + 100, 100), null, "ambang batas kustom dihormati");

// ===== gabungan: urutan pemeriksaan tetap =====
const GABUNG_OK = periksaGerbangKirim({ formDibukaPada: DIBUKA, dikirimPada: DIBUKA + 9_000 });
eq(GABUNG_OK.lolos, true, "pengguna sungguhan lolos");
eq(GABUNG_OK.alasan, null, "yang lolos tidak membawa alasan");
eq(
  periksaGerbangKirim({ jebakan: "", formDibukaPada: DIBUKA, dikirimPada: DIBUKA + 9_000 }).lolos,
  true,
  "jebakan kosong tidak menghalangi pengguna sungguhan",
);
eq(
  periksaGerbangKirim({ jebakan: "isi", formDibukaPada: DIBUKA, dikirimPada: DIBUKA + 300 }).lolos,
  false,
  "jebakan terisi ditolak walau jedanya juga salah",
);
eq(
  periksaGerbangKirim({ jebakan: "isi", formDibukaPada: DIBUKA, dikirimPada: DIBUKA + 300 }).alasan,
  periksaGerbangKirim({ jebakan: "isi", formDibukaPada: DIBUKA, dikirimPada: DIBUKA + 9_000 }).alasan,
  "jebakan diperiksa lebih dulu daripada jeda waktu",
);
eq(
  periksaGerbangKirim({ jebakan: undefined, formDibukaPada: undefined, dikirimPada: DIBUKA }).lolos,
  true,
  "payload tanpa sinyal apa pun tetap lolos (pembatas laju server yang menahan)",
);
eq(
  periksaGerbangKirim({ formDibukaPada: DIBUKA, dikirimPada: DIBUKA + 1_000 }).lolos,
  false,
  "kirim secepat kilat ditolak",
);

// ===== bentuk kanonik: urutan kunci tidak mengubah arti =====
eq(bentukKanonik({ b: 1, a: 2 }), bentukKanonik({ a: 2, b: 1 }), "urutan kunci tidak berpengaruh");
eq(bentukKanonik({ a: undefined, b: 1 }), bentukKanonik({ b: 1 }), "kolom undefined dibuang");
eq(bentukKanonik([1, "dua", null]), '[1,"dua",null]', "array dijaga urutannya");
eq(bentukKanonik(Number.NaN), "null", "angka bukan-angka menjadi null");
eq(bentukKanonik(undefined), "null", "undefined menjadi null");
ok(
  bentukKanonik({ a: 1 }) !== bentukKanonik({ a: "1" }),
  "angka dan teks yang sama tetap dibedakan",
);

// ===== sidik permintaan =====
eq(hashPermintaan({ a: 1, b: 2 }), hashPermintaan({ b: 2, a: 1 }), "isi sama menghasilkan sidik sama");
ok(hashPermintaan({ a: 1 }) !== hashPermintaan({ a: 2 }), "isi berbeda menghasilkan sidik berbeda");
eq(hashPermintaan({ a: 1 }).length, 16, "sidik sepanjang 16 heksadesimal");
ok(/^[0-9a-f]+$/.test(hashPermintaan({ a: 1 })), "sidik hanya berisi heksadesimal");
eq(hashPermintaan({ a: 1 }, 8).length, 8, "panjang sidik bisa diminta lebih pendek");
eq(hashPermintaan({ a: 1 }, 999).length, 16, "permintaan panjang melebihi batas dipotong ke batas");

// ===== kunci idempotensi =====
const kunciA = kunciIdempotensiBaru();
const kunciB = kunciIdempotensiBaru();
ok(kunciA.length >= 16, "kunci cukup panjang");
ok(kunciA !== kunciB, "dua kunci berturut-turut berbeda");
ok(/^[0-9a-f-]+$/.test(kunciA), "kunci hanya berisi karakter aman untuk URL");

// ===== skema ketat: kolom tak dikenal ditolak =====
const sah = uraiJejakKirim({ jebakan: "", formDibukaPada: 123 });
eq(sah.sah, true, "jejak kirim yang wajar diterima");
if (sah.sah) eq(sah.jejak.formDibukaPada, 123, "nilai jejak diteruskan apa adanya");
eq(uraiJejakKirim({}).sah, true, "jejak kosong masih sah (semua kolom opsional)");
eq(uraiJejakKirim({ jebakan: "x", kolomLain: 1 }).sah, false, "kolom tak dikenal ditolak");
eq(uraiJejakKirim({ formDibukaPada: "123" }).sah, false, "tipe salah ditolak");
eq(uraiJejakKirim({ formDibukaPada: -5 }).sah, false, "jejak waktu negatif ditolak skema");
eq(uraiJejakKirim({ formDibukaPada: 1.5 }).sah, false, "jejak waktu pecahan ditolak skema");
eq(uraiJejakKirim(null).sah, false, "null bukan jejak yang sah");
eq(uraiJejakKirim("bukan objek").sah, false, "teks bukan jejak yang sah");
const tolakan = uraiJejakKirim({ kolomLain: 1 });
ok(tolakan.sah === false && tolakan.alasan.length > 0, "penolakan membawa kalimat siap tampil");

console.log(`gerbangKirim.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
