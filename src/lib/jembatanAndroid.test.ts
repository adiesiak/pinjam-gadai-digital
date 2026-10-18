/**
 * Uji jembatan web ↔ aplikasi Android (`lib/jembatanAndroid`).
 * Run: bun src/lib/jembatanAndroid.test.ts
 *
 * Yang dijaga:
 *  1. Tanpa jembatan (peramban biasa) semua fungsi mengembalikan `false`,
 *     sehingga jalur web tetap dipakai — tidak ada unduhan/cetak yang hilang.
 *  2. Dengan jembatan, HTML/nama/mime diteruskan apa adanya.
 *  3. Jembatan yang melempar galat tidak merobohkan halaman; pemanggil jatuh
 *     kembali ke jalur web.
 *  4. Blob → base64 menghasilkan isi yang identik, termasuk berkas kosong.
 */
import {
  blobKeBase64,
  bukaLuarJendela,
  cetakLewatAplikasi,
  jembatanPindai,
  unduhLewatAplikasi,
  type JembatanPindai,
} from "./jembatanAndroid";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean): void {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}

// 1. Tanpa jembatan: jalur web.
cek("cetak tanpa jembatan ditolak", cetakLewatAplikasi("<p>x</p>", null) === false);
cek("unduh tanpa jembatan ditolak", (await unduhLewatAplikasi("a.csv", "text/csv", new Blob(["x"]), null)) === false);
cek("buka luar tanpa jembatan ditolak", bukaLuarJendela("https://wa.me/628", null) === false);

// 2. Dengan jembatan: argumen diteruskan.
let htmlDicetak = "";
const jembatanCetak: JembatanPindai = {
  cetak: (html) => {
    htmlDicetak = html;
  },
};
cek("cetak diteruskan ke aplikasi", cetakLewatAplikasi("<h1>Kontrak</h1>", jembatanCetak) === true);
cek("html cetak tidak diubah", htmlDicetak === "<h1>Kontrak</h1>");

let urlDibuka = "";
cek(
  "tautan luar diteruskan ke aplikasi",
  bukaLuarJendela("https://wa.me/628123", {
    bukaLuar: (url) => {
      urlDibuka = url;
    },
  }) === true,
);
cek("url luar tidak diubah", urlDibuka === "https://wa.me/628123");

const rekam: { nama?: string; mime?: string; base64?: string } = {};
const terkirim = await unduhLewatAplikasi(
  "transfer-2026.csv",
  "text/csv",
  new Blob(["a,b\n1,2"], { type: "text/csv" }),
  {
    unduh: (nama, mime, base64) => {
      rekam.nama = nama;
      rekam.mime = mime;
      rekam.base64 = base64;
    },
  },
);
cek("unduh diteruskan ke aplikasi", terkirim === true);
cek("nama berkas diteruskan", rekam.nama === "transfer-2026.csv");
cek("mime berkas diteruskan", rekam.mime === "text/csv");
const isi = rekam.base64 === undefined ? null : atob(rekam.base64);
cek("isi berkas utuh setelah base64", isi === "a,b\n1,2");

// 3. Jembatan rusak: jangan sampai melempar ke pemanggil.
cek(
  "cetak yang melempar ditolak dengan aman",
  cetakLewatAplikasi("x", {
    cetak: () => {
      throw new Error("jembatan rusak");
    },
  }) === false,
);
cek(
  "buka luar yang melempar ditolak dengan aman",
  bukaLuarJendela("https://contoh.id", {
    bukaLuar: () => {
      throw new Error("jembatan rusak");
    },
  }) === false,
);
cek(
  "unduh yang melempar ditolak dengan aman",
  (await unduhLewatAplikasi("x.csv", "text/csv", new Blob(["x"]), {
    unduh: () => {
      throw new Error("jembatan rusak");
    },
  })) === false,
);

// 4. Base64 untuk berkas kosong dan biner.
cek("blob kosong menjadi base64 kosong", (await blobKeBase64(new Blob([]))) === "");
cek(
  "blob biner dipertahankan",
  (await blobKeBase64(new Blob([new Uint8Array([0, 1, 255])]))) === "AAH/",
);

// 5. Deteksi jembatan tidak melempar di lingkungan tanpa WebView.
const terdeteksi = jembatanPindai();
cek(
  "deteksi jembatan aman di luar aplikasi",
  terdeteksi === null || typeof terdeteksi === "object",
);

console.log(`jembatanAndroid: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
