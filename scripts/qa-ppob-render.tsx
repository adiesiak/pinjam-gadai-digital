/**
 * Uji render etalase PPOB.
 * Run: bun scripts/qa-ppob-render.tsx
 *
 * Tanpa Convex dan tanpa DOM. Yang dijaga: kategori, produk, harga, dan
 * pemeriksaan kode pesanan tetap tercetak walau data datang dari server, serta
 * tidak ada "undefined"/"NaN" yang lolos ke layar.
 */
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

// Hook Convex diganti nilai tetap. Urutan pemanggilan di `Ppob` adalah:
// ringkasEtalase → kategoriEtalase → pesananSaya → daftarProduk.
let panggilan = 0;
mock.module("convex/react", () => ({
  useQuery: () => {
    panggilan += 1;
    if (panggilan === 1) {
      return {
        aktif: true,
        adaProduk: true,
        terakhirSinkron: Date.UTC(2026, 9, 28),
        instruksi: "Pesanan diproses 08.00–21.00 WIB.",
      };
    }
    if (panggilan === 2) {
      return {
        aktif: true,
        kategori: [
          { id: "pulsa", jumlah: 1 },
          { id: "data", jumlah: 3 },
        ],
        diperbaruiPada: Date.UTC(2026, 9, 28),
        instruksi: "",
      };
    }
    if (panggilan === 3) return [];
    return [
      {
        kode: "TSEL10",
        nama: "Telkomsel 10.000",
        operator: "Telkomsel",
        kategori: "pulsa",
        hargaJual: 10_400,
      },
    ];
  },
  useMutation: () => async () => undefined,
}));

const { Ppob } = await import("../src/pages/Ppob");

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}

const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/ppob"]}>
    <Ppob />
  </MemoryRouter>,
);

cek("judul halaman", html.includes("Beli kebutuhan digital"));
cek("produk dari server", html.includes("Telkomsel 10.000"));
cek("harga dari server", html.includes("Rp 10.400"));
cek("kategori pulsa", html.includes("Pulsa"));
cek("form pelacakan pesanan", html.includes("Sudah pesan? Lacak di sini."));
cek("tanpa undefined", !html.includes("undefined"));
cek("tanpa NaN", !html.includes("NaN"));
cek("tanpa objek bocor", !html.includes("[object Object]"));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
