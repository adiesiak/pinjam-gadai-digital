/**
 * Uji logika draft KYC lokal (murni, tanpa browser).
 * Run: bun src/lib/draftKyc.test.ts
 *
 * Yang dijaga: draft terikat pada SATU pengguna, payload ber-versi & rusak
 * diabaikan, kolom asing dibuang, dan pemulihan TIDAK PERNAH menimpa data yang
 * sudah tersimpan di server.
 */
import {
  adaIsiDraft,
  bacaDraftTersimpan,
  bersihkanIsian,
  kunciPenyimpananDraft,
  pulihkanKeIsian,
  ringkasPemulihan,
  serialisasiDraft,
  VERSI_DRAFT_KYC,
  type IsianDraftKyc,
} from "./draftKyc";

let passed = 0;
let failed = 0;

function cek(nama: string, syarat: boolean) {
  if (syarat) {
    passed += 1;
    console.log(`  ok  ${nama}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${nama}`);
  }
}

function sama<T>(nama: string, nyata: T, harapan: T) {
  cek(`${nama} (${JSON.stringify(nyata)})`, JSON.stringify(nyata) === JSON.stringify(harapan));
}

/* --- kunci penyimpanan ------------------------------------------------- */
sama("kunci per pengguna", kunciPenyimpananDraft("u1"), "pindai_kyc_draft_u1");
cek("kunci berbeda per pengguna", kunciPenyimpananDraft("u1") !== kunciPenyimpananDraft("u2"));

/* --- bersihkanIsian ---------------------------------------------------- */
sama("kolom asing dibuang", bersihkanIsian({ nama: "x", namaLengkap: "Rani", jahat: {} }), {
  namaLengkap: "Rani",
});
sama("nilai bukan teks dibuang", bersihkanIsian({ namaLengkap: 12 as unknown as string }), {});
sama("bukan objek → kosong", bersihkanIsian(null), {});

/* --- adaIsiDraft ------------------------------------------------------- */
cek("spasi saja bukan isi", adaIsiDraft({ namaLengkap: "   " }) === false);
cek("ada isi", adaIsiDraft({ nik: "123" }) === true);

/* --- serialisasi + baca (putaran penuh) -------------------------------- */
const isian: IsianDraftKyc = { namaLengkap: "Rani Puspita", nik: "3201010101010001" };
const teks = serialisasiDraft("u1", isian, 1700000000000);
const dibaca = bacaDraftTersimpan(teks, "u1");
cek("payload berhasil dibaca", dibaca !== null);
sama("versi payload", dibaca?.versi, VERSI_DRAFT_KYC);
sama("isian pulih apa adanya", dibaca?.isian, isian);
sama("waktu tersimpan", dibaca?.diperbaruiPada, 1700000000000);

/* --- penjaga: pengguna, versi, kerusakan ------------------------------- */
cek("draft milik pengguna lain ditolak", bacaDraftTersimpan(teks, "u2") === null);
cek("userId kosong ditolak", bacaDraftTersimpan(teks, "  ") === null);
cek("teks kosong ditolak", bacaDraftTersimpan("", "u1") === null);
cek("JSON rusak ditolak", bacaDraftTersimpan("{bukan json", "u1") === null);
cek(
  "versi tak dikenal ditolak",
  bacaDraftTersimpan(JSON.stringify({ versi: 99, userId: "u1", isian }), "u1") === null,
);
cek(
  "draft tanpa isi tidak dikembalikan",
  bacaDraftTersimpan(JSON.stringify({ versi: VERSI_DRAFT_KYC, userId: "u1", isian: {} }), "u1") ===
    null,
);
cek(
  "waktu rusak jatuh ke 0, draft tetap terbaca",
  bacaDraftTersimpan(
    JSON.stringify({ versi: VERSI_DRAFT_KYC, userId: "u1", diperbaruiPada: "x", isian }),
    "u1",
  )?.diperbaruiPada === 0,
);

/* --- pemulihan: SERVER SELALU MENANG ---------------------------------- */
const server: IsianDraftKyc = { namaLengkap: "Nama Tersimpan", nik: "" };
const draft: IsianDraftKyc = { namaLengkap: "Nama Draft", nik: "3201010101010001", alamat: "Jl. A" };
const hasil = pulihkanKeIsian(server, draft);
sama("server tidak ditimpa draft", hasil.isian.namaLengkap, "Nama Tersimpan");
sama("kolom kosong server diisi draft", hasil.isian.nik, "3201010101010001");
sama("kolom baru ikut dipulihkan", hasil.isian.alamat, "Jl. A");
sama("daftar dipulihkan hanya yang kosong", hasil.dipulihkan, ["nik", "alamat"]);

const kosong = pulihkanKeIsian({}, {});
sama("tanpa draft → tanpa kolom dipulihkan", kosong.dipulihkan, []);
sama("kalimat pemulihan kosong bila tidak ada yang dipulihkan", ringkasPemulihan([]), null);

const kalimat = ringkasPemulihan(["nik", "alamat"]);
cek("kalimat pemulihan menyebut jumlah & label", kalimat === "Kami memulihkan 2 isian yang belum tersimpan: NIK, Alamat.");

console.log(`\n${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
