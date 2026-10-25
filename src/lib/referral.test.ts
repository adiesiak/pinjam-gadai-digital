/**
 * Uji aturan referral nasabah.
 * Run: bun src/lib/referral.test.ts
 */
import {
  buatKodeReferral,
  kodeReferralValid,
  normalisasiKodeReferral,
  periksaKlaimReferral,
  REFERRAL,
  ringkasReferral,
} from "./referral";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(hasil: unknown, acuan: unknown, label: string): void {
  ok(hasil === acuan, `${label} (dapat ${String(hasil)}, harus ${String(acuan)})`);
}

// ===== Bentuk kode =====
const kode = buatKodeReferral("Muhammad Al Furqon", "jd7abc123");
eq(kode.startsWith("MUHAMMAD"), true, "awalan memakai nama depan");
eq(kode.length, 11, "8 huruf nama + 3 sidik");
eq(buatKodeReferral("Muhammad Al Furqon", "jd7abc123"), kode, "kode stabil untuk akun yang sama");
ok(buatKodeReferral("Budi", "jd7abc123") !== buatKodeReferral("Budi", "jd7xyz999"), "akun berbeda, kode berbeda");
eq(buatKodeReferral("", "jd7abc123").slice(0, 5), "TEMAN", "nama kosong tetap punya awalan");
eq(buatKodeReferral("Élodie", "jd7abc123").slice(0, 6), "ELODIE", "aksen dinormalisasi");
eq(buatKodeReferral("Al", "jd7abc123").length, 5, "nama pendek tidak dipaksa 8 huruf");
ok(kodeReferralValid(kode), "kode hasil generator valid");
ok(!kodeReferralValid("AB"), "kode terlalu pendek ditolak");
ok(!kodeReferralValid("1ABCD"), "kode diawali angka ditolak");
ok(!kodeReferralValid("ABC-123"), "tanda hubung ditolak");

// ===== Normalisasi masukan pengguna =====
eq(normalisasiKodeReferral(" furqon-7k2 "), "FURQON7K2", "spasi dan tanda hubung dibuang");
eq(normalisasiKodeReferral("x".repeat(30)).length, REFERRAL.panjangMaks, "dipotong di batas");

// ===== Syarat klaim =====
const dasar = {
  kode: "BUDI7K2",
  kodeSendiri: "FURQON7K2",
  sudahPernahKlaim: false,
  sudahPunyaPinjaman: false,
};
eq(periksaKlaimReferral(dasar), null, "klaim sah diterima");
ok(
  periksaKlaimReferral({ ...dasar, kode: "FURQON7K2" })?.includes("sendiri") === true,
  "kode sendiri ditolak",
);
ok(
  periksaKlaimReferral({ ...dasar, kode: "ab" }) !== null,
  "kode tidak valid ditolak",
);
ok(
  periksaKlaimReferral({ ...dasar, sudahPernahKlaim: true }) !== null,
  "klaim kedua ditolak",
);
ok(
  periksaKlaimReferral({ ...dasar, sudahPunyaPinjaman: true }) !== null,
  "peminjam lama ditolak",
);

// ===== Ringkasan =====
const ringkas = ringkasReferral([
  { status: "hadiah_diberikan", diklaimPada: 1 },
  { status: "hadiah_diberikan", diklaimPada: 2 },
  { status: "menunggu_lunas", diklaimPada: 3 },
  { status: "batal", diklaimPada: 4 },
]);
eq(ringkas.menunggu, 1, "satu menunggu");
eq(ringkas.berhasil, 2, "dua berhasil");
eq(ringkas.totalHadiah, REFERRAL.hadiahPerujuk * 2, "hadiah dihitung dari klaim berhasil");
eq(ringkasReferral([]).totalHadiah, 0, "tanpa klaim, hadiah nol");

const jumlah = lulus + gagal;
console.log(`referral.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
