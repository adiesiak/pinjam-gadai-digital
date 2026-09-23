/**
 * UJI OTOMATIS ALUR TERMINAL — dari Idle sampai Struk.
 *
 * Menjalankan SELURUH perjalanan pelanggan lewat reducer produksi
 * (`src/lib/stopup/terminal-flow.ts`) yang benar-benar dipakai layar terminal,
 * jadi perubahan UI/alur yang merusak salah satu langkah akan langsung gagal di
 * sini — tanpa browser, tanpa Convex, tanpa timer palsu.
 *
 * Run: bun src/lib/stopup/terminal-flow.test.ts
 */
import {
  FLOW_AWAL,
  bolehBayar,
  pakaiNomorHp,
  perluInquiry,
  susunStruk,
  terminalFlow,
  totalTagihan,
  validasiTarget,
  type Aksi,
  type BrandRingkas,
  type FlowState,
  type ProdukRingkas,
} from "./terminal-flow";
import { formatStrukTeks, buildStrukBytes } from "@/utils/escpos";
import { deteksiOperator } from "./operator";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(kondisi: boolean, label: string) {
  if (kondisi) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

/** Kirim aksi ke alur, mengembalikan state terbaru. */
function f(state: FlowState, ...aksi: Aksi[]): FlowState {
  return aksi.reduce((s, a) => terminalFlow(s, a), state);
}

/** Ketik nomor HP digit demi digit seperti menekan numpad. */
function ketikNomor(state: FlowState, nomor: string): FlowState {
  return f(state, ...nomor.split("").map((digit) => ({ jenis: "KETIK_DIGIT", digit }) as Aksi));
}

/* ============================== DATA UJI ============================== */

const HP_TSEL = "081251234567";

const BRAND_TSEL: BrandRingkas = {
  code: "TSEL",
  name: "Telkomsel",
  kind: "OPERATOR",
  labelTarget: "Nomor HP Penerima",
  minDigit: 10,
  maxDigit: 13,
};
const BRAND_PLNTOKEN: BrandRingkas = {
  code: "PLNTOKEN",
  name: "PLN Token Listrik",
  kind: "PPOB",
  labelTarget: "No. Meter / ID Pelanggan",
  minDigit: 11,
  maxDigit: 12,
};
const BRAND_PLNPASCA: BrandRingkas = {
  code: "PLNPASCA",
  name: "PLN Pascabayar",
  kind: "PPOB",
  labelTarget: "ID Pelanggan PLN",
  minDigit: 11,
  maxDigit: 12,
};
const BRAND_DANA: BrandRingkas = {
  code: "DANA",
  name: "DANA",
  kind: "EWALLET",
  labelTarget: "Nomor HP Akun DANA",
  minDigit: 10,
  maxDigit: 13,
};
const BRAND_NETFLIX: BrandRingkas = {
  code: "NETFLIX",
  name: "Netflix",
  kind: "PREMIUM",
  labelTarget: "Nomor HP Penerima Kode",
  minDigit: 10,
  maxDigit: 13,
};
const BRAND_CANVA: BrandRingkas = {
  code: "CANVA",
  name: "Canva Pro",
  kind: "PREMIUM",
  labelTarget: "Email Aktivasi",
  minDigit: 10,
  maxDigit: 13,
};

const PULSA_25: ProdukRingkas = {
  id: "p1",
  code: "PULSA-TSEL-25000",
  name: "Pulsa Telkomsel 25.000",
  icon: "📲",
  deliveryType: "INJECT_PHONE",
  harga: 26_000,
};
const TOKEN_50: ProdukRingkas = {
  id: "p2",
  code: "PPOB-PLNTOKEN-50000",
  name: "Token Listrik 50.000",
  icon: "⚡",
  deliveryType: "PPOB_INQUIRY",
  harga: 51_500,
};
const TAGIHAN_PLN: ProdukRingkas = {
  id: "p3",
  code: "PPOB-PLNPASCA-ADMIN",
  name: "Biaya Layanan Tagihan PLN Pascabayar",
  icon: "🧾",
  deliveryType: "PPOB_INQUIRY",
  harga: 2_500,
};
const DANA_50: ProdukRingkas = {
  id: "p4",
  code: "EWALLET-DANA-50000",
  name: "Saldo DANA 50.000",
  icon: "💙",
  deliveryType: "INJECT_PHONE",
  harga: 51_000,
};
const NETFLIX_1B: ProdukRingkas = {
  id: "p5",
  code: "PREMIUM-NETFLIX-1",
  name: "Netflix Gift Card 1 Bulan",
  icon: "🎬",
  deliveryType: "VOUCHER_CODE",
  harga: 59_000,
};
const CANVA_1T: ProdukRingkas = {
  id: "p6",
  code: "PREMIUM-CANVA-1",
  name: "Canva Pro 1 Tahun",
  icon: "✨",
  deliveryType: "INJECT_EMAIL",
  harga: 109_000,
};

const PENGATURAN_STRUK = {
  namaMerchant: "STOP-UP! DIGITAL",
  alamat: "Jl. Merdeka No. 1, Bandung",
  footer: "Terima kasih!",
};
const TERMINAL = "SU-01";

/** Invoice final seperti yang dikembalikan backend setelah transaksi selesai. */
function invoiceContoh(over: Partial<Parameters<typeof susunStruk>[0]["invoice"]> = {}) {
  return {
    invoiceId: "SU-260923-ABC123",
    terminalCode: TERMINAL,
    createdAt: Date.UTC(2026, 8, 23, 2, 15, 0),
    produkNama: "Pulsa Telkomsel 25.000",
    targetNo: HP_TSEL,
    sellPrice: 26_000,
    status: "SUCCESS",
    snRef: "SN1234567ABCD",
    voucherCode: null,
    accountNameMasked: null,
    ...over,
  };
}

/* =================== 1. PERJALANAN LENGKAP: PULSA =================== */

{
  const brandOtomatis = deteksiOperator(HP_TSEL)?.brandCode;
  eq(brandOtomatis, "TSEL", "deteksi operator memilih brand katalog yang benar");

  let s = FLOW_AWAL;
  eq(s.langkah, "idle", "awal = idle");

  s = f(s, { jenis: "MULAI" });
  eq(s.langkah, "nomor", "sentuh idle → Page 1");

  // Numpad digit demi digit, termasuk konversi 62 → 08.
  s = ketikNomor(FLOW_AWAL, HP_TSEL);
  eq(s.langkah, "idle", "mengetik saat idle tidak berefek");
  s = ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL);
  eq(s.nomorHp, HP_TSEL, "nomor terkumpul utuh");
  eq(deteksiOperator(s.nomorHp)?.brandCode, "TSEL", "badge operator Telkomsel muncul");

  const gaya62 = ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), "6281251234567");
  eq(gaya62.nomorHp, HP_TSEL, "mengetik 62… otomatis menjadi 08…");

  s = f(s, { jenis: "HAPUS_DIGIT" });
  eq(s.nomorHp, "08125123456", "tombol hapus memotong satu digit");
  s = f(s, { jenis: "KETIK_DIGIT", digit: "7" });
  s = f(s, { jenis: "BERSIHKAN_NOMOR" });
  eq(s.nomorHp, "", "tombol hapus semua mengosongkan nomor");

  // Nomor tidak valid harus ditahan di Page 1.
  const ditahan = f(f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), "0812"), { jenis: "LANJUT_NOMOR" }));
  eq(ditahan.langkah, "nomor", "nomor < 10 digit ditahan di Page 1");
  ok(Boolean(ditahan.galat), "pesan galat nomor ditampilkan");

  s = ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL);
  s = f(s, { jenis: "LANJUT_NOMOR" });
  eq(s.langkah, "katalog", "nomor valid → Page 2 (katalog)");
  eq(s.kategoriCode, "pulsa", "tab default = Pulsa");
  eq(s.notifWa, HP_TSEL, "invoice WA default memakai nomor pelanggan");
  eq(s.galat, null, "galat dibersihkan setelah lanjut");

  // Smart routing: pilah kategori → brand dipilih otomatis oleh layar.
  s = f(s, { jenis: "PILIH_KATEGORI", code: "data" });
  eq(s.brandCode, "", "ganti kategori mengosongkan brand (routing ulang)");
  s = f(s, { jenis: "PILIH_KATEGORI", code: "pulsa" });
  s = f(s, { jenis: "PILIH_BRAND", code: brandOtomatis ?? "" });

  // Produk prabayar tanpa inquiry → langsung konfirmasi.
  s = f(s, { jenis: "PILIH_PRODUK", produk: PULSA_25 });
  eq(s.langkah, "konfirmasi", "produk prabayar langsung ke konfirmasi");
  eq(s.targetNo, HP_TSEL, "nomor tujuan terisi dari Page 1");
  eq(s.memprosesInquiry, false, "tanpa inquiry untuk pulsa");
  eq(totalTagihan(s), 26_000, "total = harga produk");

  // Invoice WA dapat diubah sebelum bayar.
  s = f(s, { jenis: "SET_NOTIF_WA", nilai: "081399998888" });
  eq(s.notifWa, "081399998888", "nomor WhatsApp invoice bisa diubah");

  s = f(s, { jenis: "MULAI_BAYAR" });
  eq(s.memprosesBayar, true, "tombol bayar menandai proses pembuatan tagihan");

  s = f(s, { jenis: "TAGIHAN_DIBUAT", invoiceId: "SU-260923-ABC123" });
  eq(s.langkah, "qris", "tagihan dibuat → layar QRIS");
  eq(s.invoiceId, "SU-260923-ABC123", "invoice id tersimpan");

  // Menunggu pembayaran: penanda waktu mulai hanya dipasang sekali.
  const t0 = 1_700_000_000_000;
  s = f(s, { jenis: "STATUS_INVOICE", status: "PENDING", batasTungguDetik: 25, sekarang: t0 });
  eq(s.langkah, "qris", "PENDING tetap di layar QRIS");
  eq(s.menungguSejak, t0, "waktu tunggu tercatat saat status pending");
  const sDiam = f(s, { jenis: "STATUS_INVOICE", status: "PENDING", batasTungguDetik: 25, sekarang: t0 + 4_000 });
  ok(sDiam === s, "aksi tanpa perubahan mengembalikan state yang sama (anti render ulang)");
  eq(sDiam.menungguSejak, t0, "waktu tunggu tidak di-reset oleh polling");

  s = f(s, { jenis: "STATUS_INVOICE", status: "PROCESSING", batasTungguDetik: 25, sekarang: t0 + 20_000 });
  eq(s.langkah, "qris", "PROCESSING < 25 detik tetap di layar QRIS");
  eq(s.strukPending, false, "belum dianggap pending");

  s = f(s, { jenis: "STATUS_INVOICE", status: "SUCCESS", batasTungguDetik: 25, sekarang: t0 + 21_000 });
  eq(s.langkah, "struk", "SUCCESS → layar struk");
  eq(s.strukPending, false, "struk final, bukan struk sementara");
  eq(s.menungguSejak, null, "penanda tunggu dibersihkan");

  // Struk siap cetak: isinya harus konsisten dengan status flow.
  const data = susunStruk({ invoice: invoiceContoh(), ...PENGATURAN_STRUK, pending: s.strukPending });
  const teks = formatStrukTeks(data);
  ok(teks.includes("SU-260923-ABC123"), "struk memuat nomor invoice");
  ok(teks.includes("081251234567"), "struk memuat nomor tujuan");
  ok(teks.includes("Rp26.000"), "struk memuat total pembayaran");
  ok(teks.includes("QRIS"), "struk memuat metode pembayaran");
  ok(teks.includes("STOP-UP!"), "struk memuat brand");
  ok(teks.includes("SU-01"), "struk memuat kode terminal");
  const bytes = buildStrukBytes(data);
  eq(Array.from(bytes.slice(0, 2)).join(","), "27,64", "byte struk diawali reset printer");
  eq(Array.from(bytes.slice(-4)).join(","), "29,86,66,0", "byte struk diakhiri potong kertas");

  s = f(s, { jenis: "RESET" });
  eq(s.langkah, "idle", "selesai → kembali ke Idle");
  eq(s.nomorHp, "", "state pelanggan dibersihkan total");
  eq(s.produk, null, "produk dibersihkan total");
}

/* ============ 2. PENDING SUPPLIER: STRUK SEMENTARA → FINAL ============ */

{
  const t0 = 1_700_000_000_000;
  let s = flowSampaiQris(PULSA_25, "pulsa", BRAND_TSEL);

  s = f(s, { jenis: "STATUS_INVOICE", status: "PROCESSING", batasTungguDetik: 25, sekarang: t0 });
  s = f(s, { jenis: "STATUS_INVOICE", status: "PROCESSING", batasTungguDetik: 25, sekarang: t0 + 26_000 });
  eq(s.langkah, "struk", "lewat 25 detik → struk sementara");
  eq(s.strukPending, true, "struk ditandai pending");

  const strukPending = susunStruk({
    invoice: invoiceContoh({ status: "PROCESSING" }),
    ...PENGATURAN_STRUK,
    pending: s.strukPending,
  });
  ok(strukPending.pending, "data struk bertanda pending");
  ok(formatStrukTeks(strukPending).includes("STRUK SEMENTARA"), "struk sementara diberi tanda");
  ok(formatStrukTeks(strukPending).includes("PENDING"), "status PENDING tercetak");

  // Supplier akhirnya menjawab: struk naik menjadi final di tempat.
  s = f(s, { jenis: "STATUS_INVOICE", status: "SUCCESS", batasTungguDetik: 25, sekarang: t0 + 40_000 });
  eq(s.langkah, "struk", "tetap di layar struk");
  eq(s.strukPending, false, "struk naik menjadi final tanpa pindah layar");

  // Struk tidak boleh pernah diturunkan kembali ke layar lain.
  const sSetelahStruk = f(s, { jenis: "STATUS_INVOICE", status: "EXPIRED", batasTungguDetik: 25, sekarang: t0 + 90_000 });
  ok(sSetelahStruk === s, "status kedaluwarsa diabaikan setelah struk tampil");
}

/* ================== 3. TAGIHAN KEDALUWARSA (QRIS) ================== */

{
  let s = flowSampaiQris(PULSA_25, "pulsa", BRAND_TSEL);
  s = f(s, { jenis: "STATUS_INVOICE", status: "EXPIRED", batasTungguDetik: 25, sekarang: 1 });
  eq(s.langkah, "katalog", "tagihan kedaluwarsa → balik ke katalog");
  eq(s.invoiceId, null, "invoice dibuang");
  ok(Boolean(s.galat), "pelanggan diberi tahu waktunya habis");
}

/* ================== 4. PPOB TOKEN: INQUIRY WAJIB ================== */

{
  let s = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  s = f(s, { jenis: "PILIH_KATEGORI", code: "ppob" }, { jenis: "PILIH_BRAND", code: "PLNTOKEN" });
  eq(s.brandCode, "PLNTOKEN", "brand PPOB dipilih manual");

  s = f(s, { jenis: "PILIH_PRODUK", produk: TOKEN_50 });
  eq(s.langkah, "target", "PPOB butuh input ID pelanggan tambahan");
  eq(s.memprosesInquiry, false, "inquiry belum jalan sebelum target diisi");

  // ID pelanggan kurang dari 11 digit harus ditahan.
  s = f(s, { jenis: "KETIK_TARGET", digit: "1" }, { jenis: "KETIK_TARGET", digit: "2" });
  const ditahan = f(s, { jenis: "LANJUT_TARGET", brand: BRAND_PLNTOKEN });
  eq(ditahan.langkah, "target", "ID pelanggan terlalu pendek ditahan");
  eq(ditahan.memprosesInquiry, false, "tidak memanggil supplier untuk input tidak valid");
  ok(Boolean(ditahan.galat), "pesan galat panjang digit muncul");

  s = f(s, { jenis: "BERSIHKAN_TARGET" });
  s = f(s, ..."14012345678".split("").map((d) => ({ jenis: "KETIK_TARGET", digit: d }) as Aksi));
  eq(s.targetNo, "14012345678", "ID pelanggan 11 digit terkumpul");

  s = f(s, { jenis: "LANJUT_TARGET", brand: BRAND_PLNTOKEN });
  eq(s.memprosesInquiry, true, "inquiry dijalankan setelah ID valid");
  eq(s.langkah, "target", "tetap di layar target selama memeriksa");

  s = f(s, {
    jenis: "INQUIRY_SELESAI",
    hasil: { namaMasked: "A**I S*****A", sumber: "SIMULASI", label: BRAND_PLNTOKEN.labelTarget, tagihan: null },
  });
  eq(s.langkah, "konfirmasi", "hasil inquiry → konfirmasi");
  eq(s.inquiry?.namaMasked, "A**I S*****A", "nama pelanggan ter-masking tersimpan");
  eq(s.inquiry?.sumber, "SIMULASI", "sumber data ditandai jelas");
  ok(!String(s.inquiry?.namaMasked).includes("SAPUTRA"), "nama belakang tidak bocor ke layar");
  eq(totalTagihan(s), 51_500, "total token = harga produk");

  // Inquiry gagal → tetap di layar, pelanggan diberi tahu.
  const sGagal = f(
    f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" }),
    { jenis: "PILIH_KATEGORI", code: "ppob" },
    { jenis: "PILIH_BRAND", code: "PLNTOKEN" },
    { jenis: "PILIH_PRODUK", produk: TOKEN_50 },
    ..."14012345678".split("").map((d) => ({ jenis: "KETIK_TARGET", digit: d }) as Aksi),
    { jenis: "LANJUT_TARGET", brand: BRAND_PLNTOKEN },
    { jenis: "INQUIRY_GAGAL", pesan: "Supplier tidak merespons." },
  );
  eq(sGagal.langkah, "target", "inquiry gagal tetap di layar target");
  eq(sGagal.memprosesInquiry, false, "status memeriksa dihentikan");
  eq(sGagal.galat, "Supplier tidak merespons.", "penyebab kegagalan ditampilkan");
}

/* ============ 5. PPOB PASCABAYAR: TAGIHAN IKUT DIHITUNG ============ */

{
  let s = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  s = f(s, { jenis: "PILIH_KATEGORI", code: "ppob" }, { jenis: "PILIH_BRAND", code: "PLNPASCA" });
  s = f(s, { jenis: "PILIH_PRODUK", produk: TAGIHAN_PLN });
  s = f(s, ..."51234567890".split("").map((d) => ({ jenis: "KETIK_TARGET", digit: d }) as Aksi));
  s = f(s, { jenis: "LANJUT_TARGET", brand: BRAND_PLNPASCA });
  eq(s.memprosesInquiry, true, "pascabayar selalu inquiry");

  s = f(s, {
    jenis: "INQUIRY_SELESAI",
    hasil: { namaMasked: "B**I W*****A", sumber: "SUPPLIER", label: "ID Pelanggan PLN", tagihan: 187_500 },
  });
  eq(s.inquiry?.sumber, "SUPPLIER", "sumber supplier sungguhan ditandai");
  eq(totalTagihan(s), 190_000, "total = biaya layanan 2.500 + tagihan 187.500");

  const data = susunStruk({ invoice: invoiceContoh({ sellPrice: 190_000 }), ...PENGATURAN_STRUK, pending: false });
  ok(formatStrukTeks(data).includes("Rp190.000"), "struk memuat total gabungan tagihan");
}

/* ================== 6. E-WALLET: INQUIRY VIA NOMOR HP ================== */

{
  let s = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  s = f(s, { jenis: "PILIH_KATEGORI", code: "ewallet" }, { jenis: "PILIH_BRAND", code: "DANA" });
  ok(pakaiNomorHp("ewallet"), "e-wallet memakai nomor HP Page 1");
  ok(perluInquiry("ewallet", DANA_50), "e-wallet wajib inquiry nama akun");

  s = f(s, { jenis: "PILIH_PRODUK", produk: DANA_50 });
  eq(s.langkah, "katalog", "tetap di katalog selama memeriksa nama akun");
  eq(s.memprosesInquiry, true, "inquiry e-wallet dijalankan");

  s = f(s, {
    jenis: "INQUIRY_SELESAI",
    hasil: { namaMasked: "A**I S*****A", sumber: "SIMULASI", label: "Nomor HP Akun DANA", tagihan: null },
  });
  eq(s.langkah, "konfirmasi", "hasil inquiry e-wallet → konfirmasi");
  eq(s.targetNo, HP_TSEL, "nomor tujuan e-wallet = nomor pelanggan");
}

/* ============ 7. APPS PREMIUM: VOUCHER_CODE & INJECT_EMAIL ============ */

{
  // --- VOUCHER_CODE: kode dikirim lewat WhatsApp & dicetak di struk ---
  let s = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  s = f(s, { jenis: "PILIH_KATEGORI", code: "premium" }, { jenis: "PILIH_BRAND", code: "NETFLIX" });
  s = f(s, { jenis: "PILIH_PRODUK", produk: NETFLIX_1B });
  eq(s.langkah, "target", "voucher butuh nomor HP penerima kode");
  s = f(s, ...HP_TSEL.split("").map((d) => ({ jenis: "KETIK_TARGET", digit: d }) as Aksi));
  s = f(s, { jenis: "LANJUT_TARGET", brand: BRAND_NETFLIX });
  eq(s.langkah, "konfirmasi", "voucher tidak perlu inquiry");
  eq(s.memprosesInquiry, false, "tanpa inquiry untuk voucher");

  const strukVoucher = susunStruk({
    invoice: invoiceContoh({
      produkNama: NETFLIX_1B.name,
      sellPrice: 59_000,
      voucherCode: "AB12-CD34-EF56",
      snRef: "SIM-SU-260923-ABC123",
    }),
    ...PENGATURAN_STRUK,
    pending: false,
  });
  const teksVoucher = formatStrukTeks(strukVoucher);
  ok(teksVoucher.includes("AB12-CD34-EF56"), "kode voucher tercetak di struk");
  ok(teksVoucher.includes("KODE VOUCHER"), "blok kode voucher diberi judul");
  ok(
    Array.from(buildStrukBytes(strukVoucher)).map((b) => String.fromCharCode(b)).join("").includes("AB12-CD34-EF56"),
    "kode voucher juga terkirim ke printer (byte ESC/POS)",
  );

  // --- INJECT_EMAIL: validasi email + keyboard QWERTY ---
  let e = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  e = f(e, { jenis: "PILIH_KATEGORI", code: "premium" }, { jenis: "PILIH_BRAND", code: "CANVA" });
  e = f(e, { jenis: "PILIH_PRODUK", produk: CANVA_1T });
  eq(e.langkah, "target", "email produk → layar target email");

  const emailKosong = f(e, { jenis: "LANJUT_TARGET", brand: BRAND_CANVA });
  eq(emailKosong.langkah, "target", "email kosong ditahan");
  ok(Boolean(emailKosong.galat), "pesan galat email kosong");

  e = f(e, { jenis: "SET_EMAIL", nilai: "budi@@mail" });
  const emailSalah = f(e, { jenis: "LANJUT_TARGET", brand: BRAND_CANVA });
  eq(emailSalah.langkah, "target", "format email salah ditahan");

  e = f(e, { jenis: "SET_EMAIL", nilai: "Budi.Santoso@Gmail.com" });
  eq(e.email, "budi.santoso@gmail.com", "huruf besar dinormalkan (keyboard QWERTY)");
  e = f(e, { jenis: "LANJUT_TARGET", brand: BRAND_CANVA });
  eq(e.langkah, "konfirmasi", "email valid → konfirmasi");
  eq(e.targetNo, "budi.santoso@gmail.com", "email menjadi target pengiriman");
  eq(e.targetNo.includes("@"), true, "target email memakai tanda @");

  const validasi = validasiTarget(CANVA_1T, BRAND_CANVA, "salah");
  eq(validasi.valid, false, "validasiTarget menolak email tanpa domain");
}

/* ================== 8. PENJAGA ALUR (TIDAK BISA LOMPAT) ================== */

{
  // Aksi di luar langkahnya harus diabaikan: tidak ada jalan pintas ke bayar.
  const lompat = f(FLOW_AWAL, { jenis: "MULAI_BAYAR" });
  ok(lompat === FLOW_AWAL, "tidak bisa bayar dari Idle");

  const lompat2 = f(FLOW_AWAL, { jenis: "PILIH_PRODUK", produk: PULSA_25 });
  ok(lompat2 === FLOW_AWAL, "tidak bisa memilih produk dari Idle");

  const lompat3 = f(FLOW_AWAL, { jenis: "TAGIHAN_DIBUAT", invoiceId: "X" });
  ok(lompat3 === FLOW_AWAL, "tidak bisa membuat tagihan dari Idle");

  const diKatalog = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  const setelahBayar = f(diKatalog, { jenis: "MULAI_BAYAR" });
  ok(setelahBayar === diKatalog, "aksi bayar diabaikan total di luar layar konfirmasi");

  // Nomor invoice WA tidak valid → ditolak di klien, bukan menunggu error server.
  let c = flowSampaiKonfirmasi(PULSA_25, "pulsa", BRAND_TSEL);
  c = f(c, { jenis: "SET_NOTIF_WA", nilai: "0812" });
  const cek = bolehBayar(c);
  eq(cek.boleh, false, "nomor invoice terlalu pendek ditolak");
  c = f(c, { jenis: "MULAI_BAYAR" });
  eq(c.memprosesBayar, false, "tagihan tidak dibuat bila nomor invoice tidak valid");
  ok(Boolean(c.galat), "alasan penolakan ditampilkan");

  c = f(c, { jenis: "SET_NOTIF_WA", nilai: "081399998888" });
  eq(bolehBayar(c).boleh, true, "setelah nomor diperbaiki, bayar diizinkan");
}

/* ================== 9. NAVIGASI & RESET IDLE ================== */

{
  let s = flowSampaiKonfirmasi(PULSA_25, "pulsa", BRAND_TSEL);
  s = f(s, { jenis: "KEMBALI" });
  eq(s.langkah, "katalog", "kembali dari konfirmasi → katalog");
  eq(s.inquiry, null, "data inquiry lama dibersihkan");

  s = f(s, { jenis: "KEMBALI" });
  eq(s.langkah, "nomor", "kembali dari katalog → Page 1");

  let t = f(ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL), { jenis: "LANJUT_NOMOR" });
  t = f(t, { jenis: "PILIH_KATEGORI", code: "ppob" }, { jenis: "PILIH_PRODUK", produk: TOKEN_50 });
  t = f(t, { jenis: "KEMBALI" });
  eq(t.langkah, "katalog", "kembali dari layar target → katalog");
  eq(t.produk, null, "produk dilepas saat mundur");

  // Auto-reset saat idle: dari QRIS harus benar-benar bersih.
  let q = flowSampaiQris(PULSA_25, "pulsa", BRAND_TSEL);
  q = f(q, { jenis: "RESET" });
  eq(q.langkah, "idle", "reset dari mana pun kembali ke Idle");
  eq(q.invoiceId, null, "invoice aktif dilepas saat reset");
  eq(q.notifWa, "", "nomor invoice dilepas saat reset");

  ok(f(FLOW_AWAL, { jenis: "RESET" }) === FLOW_AWAL, "reset saat idle tidak mengubah apa pun");
  ok(f(FLOW_AWAL, { jenis: "KEMBALI" }).langkah === "idle", "kembali dari idle tetap idle");
}

/* ================== 10. KONSISTENSI ATURAN TARGET ================== */

{
  eq(validasiTarget(PULSA_25, BRAND_TSEL, "081251234567").valid, true, "13 digit nomor HP valid");
  eq(validasiTarget(PULSA_25, BRAND_TSEL, "0812512345").valid, true, "10 digit nomor HP valid");
  eq(validasiTarget(PULSA_25, BRAND_TSEL, "081251234").valid, false, "9 digit ditolak");
  eq(validasiTarget(TOKEN_50, BRAND_PLNTOKEN, "14012345678").valid, true, "ID PLN 11 digit valid");
  eq(validasiTarget(TOKEN_50, BRAND_PLNTOKEN, "1401234567890").valid, false, "ID PLN 13 digit ditolak");
  eq(validasiTarget(TOKEN_50, BRAND_PLNTOKEN, "1401-2345-678").nilai, "14012345678", "pemisah pada ID dibuang");
  eq(validasiTarget(NETFLIX_1B, null, "081251234567").valid, true, "tanpa brand → aturan nomor HP 10–13");
  eq(validasiTarget(NETFLIX_1B, null, "081251234").valid, false, "tanpa brand → di bawah 10 digit ditolak");
  ok(perluInquiry("ppob", TOKEN_50), "PPOB_INQUIRY wajib inquiry");
  ok(!perluInquiry("pulsa", PULSA_25), "pulsa tanpa inquiry");
}

/* ============================== HELPER ============================== */

/** Bawa alur dari Idle sampai layar konfirmasi untuk satu produk. */
function flowSampaiKonfirmasi(
  produk: ProdukRingkas,
  kategori: string,
  brand: BrandRingkas,
): FlowState {
  let s = ketikNomor(f(FLOW_AWAL, { jenis: "MULAI" }), HP_TSEL);
  s = f(s, { jenis: "LANJUT_NOMOR" });
  s = f(s, { jenis: "PILIH_KATEGORI", code: kategori }, { jenis: "PILIH_BRAND", code: brand.code });
  s = f(s, { jenis: "PILIH_PRODUK", produk });
  if (s.memprosesInquiry) {
    s = f(s, {
      jenis: "INQUIRY_SELESAI",
      hasil: { namaMasked: "A**I S*****A", sumber: "SIMULASI", label: brand.labelTarget, tagihan: null },
    });
  }
  return s;
}

/** Bawa alur sampai layar QRIS (tagihan sudah dibuat). */
function flowSampaiQris(
  produk: ProdukRingkas,
  kategori: string,
  brand: BrandRingkas,
): FlowState {
  const s = flowSampaiKonfirmasi(produk, kategori, brand);
  return f(
    s,
    { jenis: "MULAI_BAYAR" },
    { jenis: "TAGIHAN_DIBUAT", invoiceId: "SU-260923-ABC123" },
  );
}

/* ============================== RINGKASAN ============================== */

console.log(`stopup terminal-flow tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
