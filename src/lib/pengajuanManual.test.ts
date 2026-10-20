/**
 * Uji aturan pencatatan pengajuan manual (panel admin).
 * Run: bun src/lib/pengajuanManual.test.ts
 *
 * Yang dijaga berkas ini: formulir admin dan mutation server membaca aturan
 * yang SAMA. Sebelum ini tidak ada jalur pencatatan manual sama sekali, jadi
 * setiap aturan di bawah adalah kontrak baru — pengajuan yang ditolak di
 * formulir harus juga ditolak server (dan sebaliknya), dan normalisasi nama
 * UPPERCASE serta pengambilan identitas dari data diri tidak boleh berbeda.
 */
import {
  cariNasabahKembar,
  JENIS_MANUAL,
  kumpulkanNamaCatatan,
  normalisasiNik,
  normalisasiNamaPanjang,
  normalisasiNomorWhatsApp,
  normalisasiRekening,
  normalisasiTautan,
  nomorReferensiManual,
  POKOK_MANUAL_MAKS,
  rupiahDariTeks,
  tenorBulananManualSah,
  validasiGadaiManual,
  validasiKreditManual,
  validasiPinjamanManual,
} from "./pengajuanManual";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
/** Galat yang dilempar sebuah fungsi; `null` bila justru berhasil. */
function galat(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// ===== Nomor referensi =====
{
  const now = Date.UTC(2026, 2, 5, 3, 0, 0);
  const pinjaman = nomorReferensiManual("pinjaman", now);
  const gadai = nomorReferensiManual("gadai", now);
  const kredit = nomorReferensiManual("kredit", now);
  ok(/^PGD-20260305-[A-Z2-9]{4}$/.test(pinjaman), `nomor pinjaman manual berformat PGD-YYYYMMDD-XXXX (dapat ${pinjaman})`);
  ok(/^PGD-20260305-[A-Z2-9]{4}$/.test(gadai), `nomor gadai manual memakai awalan PGD yang sama (dapat ${gadai})`);
  ok(/^KRD-20260305-[A-Z2-9]{4}$/.test(kredit), `nomor kredit manual berformat KRD-YYYYMMDD-XXXX (dapat ${kredit})`);
  // Awalan harus sama dengan jalur nasabah supaya antrean tidak perlu tahu
  // siapa yang mencatat; JENIS_MANUAL adalah satu-satunya sumbernya.
  eq(JENIS_MANUAL.pinjaman.awalan, "PGD", "awalan jenis pinjaman");
  eq(JENIS_MANUAL.gadai.awalan, "PGD", "awalan jenis gadai");
  eq(JENIS_MANUAL.kredit.awalan, "KRD", "awalan jenis kredit");
  const banyak = new Set(Array.from({ length: 50 }, () => nomorReferensiManual("pinjaman", now)));
  ok(banyak.size > 40, "nomor referensi manual tidak mudah bertabrakan");
}

// ===== Normalisasi =====
{
  eq(normalisasiNamaPanjang("  rani peminjam "), "RANI PEMINJAM", "nama pemohon disimpan UPPERCASE & dipangkas");
  eq(galat(() => normalisasiNamaPanjang("ab")), "Nama lengkap wajib diisi (minimal 3 karakter).", "nama terlalu pendek ditolak");
  eq(normalisasiRekening(" 1234 567 890 "), "1234567890", "rekening dibersihkan dari spasi");
  ok(galat(() => normalisasiRekening("12345")) !== null, "rekening 5 digit ditolak");
  ok(galat(() => normalisasiRekening("1234567890abc")) !== null, "rekening berhuruf ditolak");
  eq(normalisasiNik("3201 2345 6789 0003"), "3201234567890003", "NIK dipangkas spasinya");
  ok(galat(() => normalisasiNik("32012345678901")) !== null, "NIK 14 digit ditolak");
  eq(normalisasiNomorWhatsApp("+62 812-3456-791"), "628123456791", "nomor WhatsApp dinormalkan ke 62…");
  ok(galat(() => normalisasiNomorWhatsApp("081234567891")) !== null, "nomor lokal 08… ditolak");
  eq(normalisasiTautan("  "), undefined, "tautan kosong menjadi undefined");
  eq(normalisasiTautan("https://tokopedia.com/x"), "https://tokopedia.com/x", "tautan https diterima");
  ok(galat(() => normalisasiTautan("tokopedia.com/x")) !== null, "tautan tanpa skema ditolak");
  eq(rupiahDariTeks("1.000.000"), 1_000_000, "rupiah 1.000.000 terbaca");
  eq(rupiahDariTeks("abc"), null, "teks bukan angka menjadi null (tanpa galat)");
  eq(rupiahDariTeks("50"), null, "nominal di bawah batas uang menjadi null");
  ok(tenorBulananManualSah(3) && !tenorBulananManualSah(2), "tenor bulanan hanya 1/3/6");
}

// ===== Pinjaman manual =====
{
  const bersih = validasiPinjamanManual({
    pokokPinjaman: 1_000_000,
    tenorHari: 28,
    tujuan: "modal_usaha",
    namaLengkap: "rani peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    catatanPeminjam: "  diterima di kantor  ",
  });
  eq(bersih.pokokPinjaman, 1_000_000, "pokok skema harian disimpan apa adanya");
  eq(bersih.tenorHari, 28, "tenor harian tersimpan");
  eq(bersih.tenorBulan, undefined, "skema harian tidak mengisi tenor bulanan");
  eq(bersih.namaLengkap, "RANI PEMINJAM", "nama pinjaman manual disimpan UPPERCASE");
  eq(bersih.catatanPeminjam, "diterima di kantor", "catatan dipangkas");
  eq(bersih.nomorRekening, "1234567890", "rekening pinjaman manual tervalidasi");

  const bulanan = validasiPinjamanManual({
    pokokPinjaman: 5_000_000,
    tenorHari: 30,
    tenorBulan: 3,
    tujuan: "pendidikan",
    namaLengkap: "budi",
    namaBank: "Mandiri",
    nomorRekening: "1234567891",
  });
  eq(bulanan.tenorBulan, 3, "skema bulanan menyimpan tenor bulan");
  eq(bulanan.tenorHari, 30, "skema bulanan tetap punya tenor harian 30 (warisan kolom)");

  // Jalur manual TIDAK memakai batas produk harian Rp 1 juta: admin mencatat
  // pinjaman yang sudah diputuskan di luar aplikasi. Langit-langitnya adalah
  // `POKOK_MANUAL_MAKS` (Rp 10 juta) — sama dengan plafon sistem maksimum.
  const harianBesar = validasiPinjamanManual({
    pokokPinjaman: 2_000_000,
    tenorHari: 28,
    tujuan: "modal_usaha",
    namaLengkap: "rani",
    namaBank: "BCA",
    nomorRekening: "1234567890",
  });
  eq(harianBesar.pokokPinjaman, 2_000_000, "pokok 2 juta diterima pada skema harian manual");
  // Di dalam batas produk Rp1 juta, tenor manual mengikuti matriks yang sama
  // dengan pengajuan nasabah. Di atasnya, pencatatan lama tetap bebas tenor.
  eq(
    validasiPinjamanManual({
      pokokPinjaman: 500_000,
      tenorHari: 14,
      tujuan: "modal_usaha",
      namaLengkap: "rani",
      namaBank: "BCA",
      nomorRekening: "1234567890",
    }).tenorHari,
    14,
    "Rp500.000/14 hari diterima pada jalur manual",
  );
  eq(
    validasiPinjamanManual({
      pokokPinjaman: 500_000,
      tenorHari: 7,
      tujuan: "modal_usaha",
      namaLengkap: "rani",
      namaBank: "BCA",
      nomorRekening: "1234567890",
    }).tenorHari,
    7,
    "Rp500.000/7 hari diterima pada jalur manual",
  );
  eq(
    validasiPinjamanManual({
      pokokPinjaman: 1_000_000,
      tenorHari: 14,
      tujuan: "modal_usaha",
      namaLengkap: "rani",
      namaBank: "BCA",
      nomorRekening: "1234567890",
    }).tenorHari,
    14,
    "Rp1 juta/14 hari diterima pada jalur manual",
  );
  ok(
    galat(() =>
      validasiPinjamanManual({
        pokokPinjaman: 500_000,
        tenorHari: 30,
        tujuan: "modal_usaha",
        namaLengkap: "rani",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ) !== null,
    "tenor 30 hari ditolak pada jalur manual",
  );
  eq(POKOK_MANUAL_MAKS, 10_000_000, "langit-langit jalur manual Rp 10 juta");
  eq(
    validasiPinjamanManual({
      pokokPinjaman: POKOK_MANUAL_MAKS,
      tenorHari: 28,
      tujuan: "modal_usaha",
      namaLengkap: "rani",
      namaBank: "BCA",
      nomorRekening: "1234567890",
    }).pokokPinjaman,
    10_000_000,
    "pokok harian tepat Rp 10 juta diterima",
  );
  ok(
    galat(() =>
      validasiPinjamanManual({
        pokokPinjaman: 10_100_000,
        tenorHari: 28,
        tujuan: "modal_usaha",
        namaLengkap: "rani",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ) !== null,
    "pokok harian di atas Rp 10 juta ditolak",
  );
  ok(
    galat(() =>
      validasiPinjamanManual({
        pokokPinjaman: 50_000,
        tenorHari: 28,
        tujuan: "modal_usaha",
        namaLengkap: "rani",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ) !== null,
    "pokok harian di bawah Rp 100.000 ditolak",
  );
  ok(
    galat(() =>
      validasiPinjamanManual({
        pokokPinjaman: 1_000_000,
        tenorHari: 45,
        tujuan: "modal_usaha",
        namaLengkap: "rani",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ) !== null,
    "tenor harian 45 ditolak",
  );
  ok(
    galat(() =>
      validasiPinjamanManual({
        pokokPinjaman: 1_000_000,
        tenorBulan: 2,
        tujuan: "modal_usaha",
        namaLengkap: "rani",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ) !== null,
    "tenor bulanan 2 ditolak",
  );
  eq(
    galat(() =>
      validasiPinjamanManual({
        pokokPinjaman: 1_000_000,
        tenorHari: 28,
        tujuan: "liburan",
        namaLengkap: "rani",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ),
    "Pilih keperluan pinjaman yang valid.",
    "keperluan di luar daftar resmi ditolak",
  );
}

// ===== Kumpulkan nama catatan (sumber nama di ruang penyedia dana) =====
{
  const peta = kumpulkanNamaCatatan([
    { userId: "u1", namaLengkap: "HASBI LAMA", waktu: 10 },
    { userId: "u1", namaLengkap: "HASBI SUKMANDA", waktu: 20 },
    { userId: "u2", namaLengkap: "   ", waktu: 30 },
    { userId: "u2", namaLengkap: "RANDI", waktu: 5 },
  ]);
  eq(peta.get("u1"), "HASBI SUKMANDA", "nama catatan TERBARU yang dipakai");
  eq(peta.get("u2"), "RANDI", "catatan bernama kosong dilewati");
  eq(peta.get("u3"), undefined, "nasabah tanpa catatan tidak masuk peta");
  eq(kumpulkanNamaCatatan([]).size, 0, "tanpa catatan peta tetap kosong");
}

// ===== Gadai manual =====
{
  const bersih = validasiGadaiManual({
    deskripsiBarang: "  iPhone 14 Pro 256 GB, kotak lengkap  ",
    kategori: "Elektronik",
    alamatPenilaian: "Jl. Merdeka No. 10, Bandung",
    namaLengkap: "sari pemohon",
    namaBank: "DANA",
    nomorRekening: "081234567890",
  });
  eq(bersih.kategori, "Elektronik", "kategori gadai valid diteruskan");
  eq(bersih.namaLengkap, "SARI PEMOHON", "nama pemohon gadai UPPERCASE");
  eq(bersih.deskripsiBarang, "iPhone 14 Pro 256 GB, kotak lengkap", "deskripsi barang dipangkas");
  ok(
    galat(() =>
      validasiGadaiManual({
        deskripsiBarang: "hp",
        kategori: "Elektronik",
        alamatPenilaian: "Jl. Merdeka No. 10, Bandung",
        namaLengkap: "sari",
        namaBank: "DANA",
        nomorRekening: "081234567890",
      }),
    ) !== null,
    "deskripsi barang di bawah 10 karakter ditolak",
  );
  eq(
    galat(() =>
      validasiGadaiManual({
        deskripsiBarang: "iPhone 14 Pro 256 GB lengkap",
        kategori: "Perabot",
        alamatPenilaian: "Jl. Merdeka No. 10, Bandung",
        namaLengkap: "sari",
        namaBank: "DANA",
        nomorRekening: "081234567890",
      }),
    ),
    "Pilih kategori barang yang valid.",
    "kategori gadai di luar daftar resmi ditolak",
  );
}

// ===== Kredit manual =====
{
  const bersih = validasiKreditManual({
    namaBarang: "  Samsung Galaxy A55 8/256 ",
    kategori: "Elektronik",
    merchant: " Tokopedia ",
    tautanBarang: "",
    hargaBarang: 5_000_000,
    tenorBulan: 6,
    nomorRekening: "1234567892",
    catatanPeminjam: "",
  });
  eq(bersih.namaBarang, "Samsung Galaxy A55 8/256", "nama barang dipangkas");
  eq(bersih.merchant, "Tokopedia", "sumber barang dipangkas");
  eq(bersih.tautanBarang, undefined, "tautan kosong tidak disimpan sebagai string kosong");
  eq(bersih.catatanPeminjam, undefined, "catatan kosong tidak disimpan sebagai string kosong");
  eq(bersih.nomorRekening, "1234567892", "rekening kredit manual tervalidasi");
  ok(
    galat(() =>
      validasiKreditManual({
        namaBarang: "Kulkas",
        kategori: "Elektronik",
        merchant: "Shopee",
        hargaBarang: 5_000_000,
        tenorBulan: 2,
        nomorRekening: "1234567892",
      }),
    ) !== null,
    "tenor kredit 2 bulan ditolak",
  );
  eq(
    galat(() =>
      validasiKreditManual({
        namaBarang: "Kulkas",
        kategori: "Elektronik",
        merchant: "Shopee",
        hargaBarang: 500_000,
        tenorBulan: 6,
        nomorRekening: "1234567892",
      }),
    ),
    "Harga barang harus antara 1000000 dan 100000000 rupiah.",
    "harga barang di bawah batas ditolak dengan pesan batas",
  );
  ok(
    galat(() =>
      validasiKreditManual({
        namaBarang: "Kulkas",
        kategori: "Elektronik",
        merchant: "Shopee",
        hargaBarang: 5_000_000.5,
        tenorBulan: 6,
        nomorRekening: "1234567892",
      }),
    ) !== null,
    "harga barang berdesimal ditolak (rupiah bulat)",
  );
}

// ===== cariNasabahKembar: pencegahan duplikat nasabah =====
// Duplikat nyata di lapangan: data dari luar membawa NIK salah ketik untuk
// orang yang sudah tercatat, sehingga muncul "ALIFAN" di samping "ALFIAN RIFKI
// JUNIAWAN". Nomor WhatsApp yang sama harus sudah cukup untuk menolaknya.
{
  const tercatat = [
    {
      nik: "3201234567890003",
      nomorWhatsApp: "628123456791",
      namaLengkap: "ALFIAN RIFKI JUNIAWAN",
    },
  ];

  const nikSama = cariNasabahKembar(tercatat, {
    nik: "3201234567890003",
    nomorWhatsApp: "628999999999",
  });
  eq(nikSama?.sebab, "nik", "NIK sama terdeteksi sebagai NIK");
  eq(nikSama?.baris.namaLengkap, "ALFIAN RIFKI JUNIAWAN", "baris yang cocok dikembalikan");

  // Kasus inti: NIK BEDA satu digit (salah ketik), WhatsApp sama.
  const waSama = cariNasabahKembar(tercatat, {
    nik: "3201234567890004",
    nomorWhatsApp: "628123456791",
  });
  eq(waSama?.sebab, "whatsapp", "NIK beda tapi WhatsApp sama tetap terdeteksi");
  eq(
    cariNasabahKembar(tercatat, {
      nik: "3201234567890004",
      nomorWhatsApp: "62 812-3456-791",
    })?.sebab,
    "whatsapp",
    "tanda baca WhatsApp warisan tetap cocok",
  );

  // Orang yang memang berbeda tidak boleh dianggap kembar.
  eq(
    cariNasabahKembar(tercatat, {
      nik: "3201234567890009",
      nomorWhatsApp: "628123456799",
    }),
    undefined,
    "orang berbeda tidak dianggap kembar",
  );

  // Identitas kosong tidak boleh membuat semua orang dianggap kembar.
  eq(
    cariNasabahKembar(tercatat, { nik: "", nomorWhatsApp: "" }),
    undefined,
    "identitas kosong tidak cocok dengan siapa pun",
  );
  eq(cariNasabahKembar([], { nik: "3201234567890003" }), undefined, "daftar kosong");
}

console.log(`pengajuanManual.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
