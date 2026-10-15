/**
 * Uji katalog template pesan WA + penjadwalan pengiriman otomatis.
 * Run: bun src/lib/templatePesanWa.test.ts
 *
 * Yang dijaga:
 *  - setiap jenis punya label ramah, keterangan, teks bawaan, dan placeholder
 *    wajib yang benar-benar ada di teks bawaannya (bawaan yang tidak lolos
 *    validasinya sendiri adalah bug yang paling sulit terlihat);
 *  - placeholder asing ditolak, placeholder yang tidak diizinkan ditolak, dan
 *    placeholder yang tidak punya nilai diganti kata jujur — bukan dibiarkan
 *    `{jumlah}` di tangan nasabah;
 *  - penjadwalan: H-3/H-1/hari H saja, keterlambatan maksimal satu pesan per
 *    hari, dan pengingat hanya untuk pinjaman yang masih berjalan;
 *  - jendela kirim 08.00–20.00 WIB dihitung dari waktu epoch, bukan jam lokal
 *    mesin yang menjalankan uji.
 */
import {
  AMBANG_TERLAMBAT_TAHAP_2_HARI,
  CONTOH_NILAI_WA,
  JAM_KIRIM_MULAI,
  JAM_KIRIM_SELESAI,
  JENIS_TEMPLATE_WA,
  KETERANGAN_JENIS_WA,
  LABEL_JENIS_WA,
  PLACEHOLDER_WAJIB,
  PLACEHOLDER_WA,
  TEMPLATE_BAWAAN_WA,
  bolehKirimHariIni,
  dalamJamKirim,
  jamWib,
  jenisKeterlambatan,
  jenisPengingatHari,
  jenisPesanJatuhTempo,
  jenisRamahWa,
  masihBerhakDapatPengingat,
  rencanaPengingat,
  JENIS_PENGINGAT_OTOMATIS,
  placeholderDipakai,
  placeholderTakDikenal,
  placeholderTidakDiizinkan,
  placeholderWajibHilang,
  rangkaiPesanWa,
  teksMetodeBayar,
  templateBerlaku,
  validasiTemplateWa,
} from "./templatePesanWa";

let lulus = 0;
let gagal = 0;
function cek(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
function sama(actual: unknown, expected: unknown, label: string): void {
  cek(
    actual === expected,
    `${label} (dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)})`,
  );
}

// ===== 1. Katalog lengkap: label, keterangan, bawaan, wajib =====
for (const jenis of JENIS_TEMPLATE_WA) {
  cek(LABEL_JENIS_WA[jenis].length > 0, `jenis ${jenis} punya label ramah`);
  cek(KETERANGAN_JENIS_WA[jenis].length > 0, `jenis ${jenis} punya keterangan`);
  const bawaan = TEMPLATE_BAWAAN_WA[jenis];
  cek(bawaan.length > 0, `jenis ${jenis} punya teks bawaan`);
  cek(
    validasiTemplateWa(jenis, bawaan).ok,
    `teks bawaan ${jenis} lolos validasinya sendiri`,
  );
  for (const wajib of PLACEHOLDER_WAJIB[jenis]) {
    cek(
      placeholderDipakai(bawaan).includes(wajib),
      `bawaan ${jenis} benar-benar memuat wajib {${wajib}}`,
    );
  }
}

// ===== 2. Jenis yang diminta produk ada semua =====
for (const jenis of [
  "pengingat_h3",
  "pengingat_h1",
  "pengingat_hari_h",
  "terlambat_1",
  "terlambat_2",
  "konfirmasi_pembayaran",
  "pelunasan",
  "pencairan",
  "otp",
] as const) {
  cek(JENIS_TEMPLATE_WA.includes(jenis), `jenis ${jenis} tersedia di katalog`);
}
for (const placeholder of [
  "hari",
  "jatuh_tempo",
  "metode_bayar",
  "kontak",
  "kode_otp",
  "menit",
] as const) {
  cek(PLACEHOLDER_WA.includes(placeholder), `placeholder {${placeholder}} dikenal`);
}

// ===== 3. Validasi: asing, tidak diizinkan, wajib hilang =====
sama(placeholderDipakai("a {nama} b {jumlah} c {nama}").join(","), "nama,jumlah", "placeholder unik urut kemunculan");
sama(placeholderTakDikenal("Halo {nama}, {foo}").join(","), "foo", "placeholder asing terdeteksi");
cek(
  !validasiTemplateWa("pengingat_h3", "Halo {nama}, {foo}").ok,
  "template dengan placeholder asing ditolak",
);
cek(
  !validasiTemplateWa("pengingat_h3", "Halo {nama}, jatuh tempo {jatuh_tempo}").ok,
  "pengingat tanpa {jumlah} ditolak",
);
cek(
  validasiTemplateWa("pengingat_h3", "Halo {nama}, {jatuh_tempo}, total {jumlah}").ok,
  "pengingat dengan nama + jatuh tempo + jumlah diterima",
);
cek(
  !validasiTemplateWa("otp", "Kode Anda: {kode_otp}").ok,
  "template OTP tanpa {menit} ditolak",
);
cek(
  validasiTemplateWa("otp", "Kode Anda: {kode_otp}, berlaku {menit} menit.").ok,
  "template OTP dengan kode + menit diterima",
);
sama(
  placeholderWajibHilang("otp", "Kode: {kode_otp}").join(","),
  "menit",
  "placeholder wajib yang hilang disebutkan",
);
sama(
  placeholderTidakDiizinkan("otp", "Halo {nama}, kode {kode_otp} {menit}").join(","),
  "nama",
  "placeholder di luar izin jenis terdeteksi",
);
cek(!validasiTemplateWa("pelunasan", "   ").ok, "template kosong ditolak");
cek(!validasiTemplateWa("pelunasan", "x".repeat(901)).ok, "template kepanjangan ditolak");

// ===== 4. Penggantian nilai: jujur, tidak menyisakan placeholder =====
{
  const hasil = rangkaiPesanWa("Halo {nama}, total {jumlah}, {foo}.", {
    nama: "RANI",
    jumlah: null,
  });
  cek(hasil.isi.includes("Halo RANI"), "nilai yang ada dipakai apa adanya");
  cek(hasil.isi.includes("belum tercatat"), "nilai kosong diganti kata jujur");
  cek(!hasil.isi.includes("{jumlah}"), "placeholder wajib tidak tersisa");
  cek(hasil.tersisa.includes("foo"), "placeholder asing yang tersisa dilaporkan");
  cek(
    rangkaiPesanWa("Total {jumlah}.", CONTOH_NILAI_WA).isi === "Total Rp 1.500.000.",
    "nilai contoh dipakai di pratinjau",
  );
}

// ===== 5. Template berlaku: tersimpan sah, atau jatuh ke bawaan =====
{
  const kosong = templateBerlaku("pelunasan", "");
  cek(kosong.dipakaiBawaan, "template kosong memakai bawaan");
  sama(kosong.teks, TEMPLATE_BAWAAN_WA.pelunasan, "teks bawaan yang dipakai adalah bawaan resmi");

  const sah = templateBerlaku("pelunasan", "Halo {nama}, lunas. Terima kasih.");
  cek(!sah.dipakaiBawaan, "template tersimpan yang sah dipakai apa adanya");
  cek(sah.alasanBawaan === null, "tanpa alasan bawaan saat template sah");

  const rusak = templateBerlaku("pelunasan", "Halo, lunas.");
  cek(rusak.dipakaiBawaan, "template tersimpan yang tidak sah jatuh ke bawaan");
  cek((rusak.alasanBawaan ?? "").includes("Pelunasan"), "alasan bawaan menyebut jenisnya");
}

// ===== 6. Penjadwalan: H-3, H-1, hari H, dan keterlambatan =====
sama(jenisPengingatHari(3), "pengingat_h3", "tiga hari lagi memakai template H-3");
sama(jenisPengingatHari(1), "pengingat_h1", "sehari lagi memakai template H-1");
sama(jenisPengingatHari(0), "pengingat_hari_h", "hari jatuh tempo memakai template hari H");
sama(jenisPengingatHari(2), null, "sisa dua hari tidak punya pengingat sendiri");
sama(jenisPengingatHari(-1), null, "angka negatif bukan urusan pengingat jatuh tempo");

sama(jenisKeterlambatan(0), null, "belum terlambat tidak memakai template keterlambatan");
sama(jenisKeterlambatan(1), "terlambat_1", "hari pertama terlambat memakai tahap 1");
sama(
  jenisKeterlambatan(AMBANG_TERLAMBAT_TAHAP_2_HARI - 1),
  "terlambat_1",
  "sehari sebelum ambang masih tahap 1",
);
sama(
  jenisKeterlambatan(AMBANG_TERLAMBAT_TAHAP_2_HARI),
  "terlambat_2",
  "mencapai ambang berpindah ke tahap 2",
);

sama(jenisPesanJatuhTempo(3, 0), "pengingat_h3", "pengingat H-3 dipilih dari sisa hari");
sama(jenisPesanJatuhTempo(0, 0), "pengingat_hari_h", "hari H dipilih saat sisa nol");
sama(jenisPesanJatuhTempo(0, 2), "terlambat_1", "keterlambatan mengalahkan pengingat hari H");
sama(jenisPesanJatuhTempo(0, 30), "terlambat_2", "keterlambatan panjang memakai tahap 2");

// Maksimal satu pesan per hari untuk keterlambatan.
cek(bolehKirimHariIni("terlambat_1", false), "keterlambatan boleh kirim bila belum ada hari ini");
cek(!bolehKirimHariIni("terlambat_1", true), "keterlambatan ditahan bila sudah kirim hari ini");
cek(!bolehKirimHariIni("terlambat_2", true), "tahap 2 juga ditahan setelah satu pesan hari ini");
cek(bolehKirimHariIni("pengingat_h3", true), "pengingat jatuh tempo punya kesempatan sendiri");

// Berhenti otomatis setelah pembayaran tercatat.
cek(masihBerhakDapatPengingat("didanai"), "pinjaman berjalan tetap dapat pengingat");
for (const status of ["lunas", "ditolak", "ditinjau", "dibatalkan", "menunggu_verifikasi"]) {
  cek(!masihBerhakDapatPengingat(status), `status ${status} tidak lagi dapat pengingat`);
}

// ===== 7. Jendela kirim 08.00–20.00 WIB =====
{
  // 2026-10-15T01:00:00Z = 08.00 WIB.
  const jam8 = Date.UTC(2026, 9, 15, 1, 0, 0);
  sama(jamWib(jam8), 8, "01.00 UTC terbaca 08.00 WIB");
  sama(jamWib(Date.UTC(2026, 9, 15, 0, 30, 0)), 7, "00.30 UTC terbaca 07.30 WIB");
  sama(jamWib(Date.UTC(2026, 9, 15, 12, 59, 0)), 19, "12.59 UTC terbaca 19.59 WIB");
  sama(jamWib(Date.UTC(2026, 9, 15, 13, 0, 0)), 20, "13.00 UTC terbaca 20.00 WIB");

  cek(dalamJamKirim(JAM_KIRIM_MULAI), "08.00 termasuk jendela kirim");
  cek(!dalamJamKirim(JAM_KIRIM_SELESAI), "20.00 sudah di luar jendela kirim");
  cek(!dalamJamKirim(7), "07.00 di luar jendela kirim");
  cek(dalamJamKirim(19), "19.00 masih di dalam jendela kirim");
  cek(!dalamJamKirim(23), "23.00 di luar jendela kirim");
}

// ===== 8. Label ramah untuk log pengiriman =====
sama(jenisRamahWa("pengingat_h3"), "Pengingat H-3", "log memakai label ramah H-3");
sama(jenisRamahWa("terlambat_2"), "Keterlambatan tahap 2", "log memakai label ramah tahap 2");
sama(jenisRamahWa("pengingat"), "Pengingat tagihan (manual)", "jenis lama tetap terbaca manusia");
sama(jenisRamahWa("otp_transaksi"), "Kode OTP persetujuan transaksi", "jenis OTP lama diterjemahkan");
sama(jenisRamahWa("entah"), "entah", "jenis tak dikenal ditampilkan apa adanya, bukan disembunyikan");

// ===== 9. Metode pembayaran dari pengaturan sistem =====
cek(
  teksMetodeBayar({ rekeningUsahaBank: "BCA", rekeningUsahaNomor: "1234567890", rekeningUsahaNama: "PINDAI" })
    .includes("transfer ke BCA 1234567890 a.n. PINDAI"),
  "rekening usaha dipakai apa adanya",
);
cek(
  teksMetodeBayar({ rekeningUsahaBank: "BCA", rekeningUsahaNomor: "123", qrisMerchantNama: "PINDAI QR" })
    .includes("QRIS PINDAI QR"),
  "QRIS disebut bila diisi",
);
cek(
  teksMetodeBayar({}).includes("tercatat di aplikasi"),
  "tanpa rekening, pesan tidak mengarang nomor",
);

// ===== 10. Rencana kirim penjadwal otomatis =====
{
  // 01.00 UTC = 08.00 WIB, 00.30 UTC = 07.30 WIB.
  const JAM_KERJA = Date.UTC(2026, 9, 15, 1, 0, 0);
  const JAM_SEBELUM = Date.UTC(2026, 9, 15, 0, 30, 0);
  const JAM_MALAM = Date.UTC(2026, 9, 15, 14, 0, 0); // 21.00 WIB
  const dasar = { status: "didanai", jenisHariIni: [] as string[] };

  sama(
    rencanaPengingat(JAM_KERJA, [{ ...dasar, loanId: "a", sisaHari: 3, hariTerlambat: 0 }])[0]?.jenis,
    "pengingat_h3",
    "H-3 masuk rencana kirim",
  );
  sama(
    rencanaPengingat(JAM_KERJA, [{ ...dasar, loanId: "a", sisaHari: 1, hariTerlambat: 0 }])[0]?.jenis,
    "pengingat_h1",
    "H-1 masuk rencana kirim",
  );
  sama(
    rencanaPengingat(JAM_KERJA, [{ ...dasar, loanId: "a", sisaHari: 0, hariTerlambat: 0 }])[0]?.jenis,
    "pengingat_hari_h",
    "hari H masuk rencana kirim",
  );
  sama(
    rencanaPengingat(JAM_KERJA, [{ ...dasar, loanId: "a", sisaHari: 2, hariTerlambat: 0 }]).length,
    0,
    "H-2 tidak mengirim apa pun",
  );
  sama(
    rencanaPengingat(JAM_KERJA, [{ ...dasar, loanId: "a", sisaHari: -1, hariTerlambat: 1 }])[0]?.jenis,
    "terlambat_1",
    "hari pertama terlambat memakai tahap 1",
  );
  sama(
    rencanaPengingat(JAM_KERJA, [{ ...dasar, loanId: "a", sisaHari: -9, hariTerlambat: 9 }])[0]?.jenis,
    "terlambat_2",
    "keterlambatan panjang memakai tahap 2",
  );

  // Jendela kirim: di luar 08.00–20.00 WIB tidak ada pesan sama sekali.
  sama(
    rencanaPengingat(JAM_SEBELUM, [{ ...dasar, loanId: "a", sisaHari: 3, hariTerlambat: 0 }]).length,
    0,
    "07.30 WIB belum boleh kirim",
  );
  sama(
    rencanaPengingat(JAM_MALAM, [{ ...dasar, loanId: "a", sisaHari: 3, hariTerlambat: 0 }]).length,
    0,
    "21.00 WIB sudah lewat jendela kirim",
  );

  // Idempoten: jenis yang sudah berangkat hari ini tidak diulang.
  sama(
    rencanaPengingat(JAM_KERJA, [
      { ...dasar, loanId: "a", sisaHari: 3, hariTerlambat: 0, jenisHariIni: ["pengingat_h3"] },
    ]).length,
    0,
    "pengingat yang sudah terkirim hari ini tidak diulang",
  );
  sama(
    rencanaPengingat(JAM_KERJA, [
      { ...dasar, loanId: "a", sisaHari: -8, hariTerlambat: 8, jenisHariIni: ["terlambat_1"] },
    ]).length,
    0,
    "keterlambatan maksimal satu pesan per hari",
  );

  // Berhenti otomatis setelah pembayaran tercatat.
  sama(
    rencanaPengingat(JAM_KERJA, [
      { ...dasar, status: "lunas", loanId: "a", sisaHari: 0, hariTerlambat: 0 },
    ]).length,
    0,
    "pinjaman lunas tidak lagi menerima pengingat",
  );

  // Daftar jenis otomatis adalah bagian dari katalog, bukan daftar terpisah.
  for (const jenis of JENIS_PENGINGAT_OTOMATIS) {
    cek(JENIS_TEMPLATE_WA.includes(jenis), `jenis otomatis ${jenis} ada di katalog`);
  }
}

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus`);
  process.exit(1);
}
console.log(`templatePesanWa: ${lulus} lulus`);
