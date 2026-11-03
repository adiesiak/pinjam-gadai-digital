/**
 * Uji render halaman pesanan PPOB.
 * Run: bun scripts/qa-ppob-pesanan-render.tsx
 *
 * Dua keadaan yang paling menentukan uang: menunggu pembayaran (rekening dan
 * nominal harus terbaca) dan selesai (nomor seri/token harus bisa disalin).
 * Tidak ada DOM maupun Convex.
 */
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";

type Jawaban = {
  kodePesanan: string;
  namaProduk: string;
  kategori: "pulsa" | "token-listrik";
  nomorTujuan: string;
  hargaJual: number;
  status: "menunggu_bayar" | "sukses";
  snTersedia: boolean;
  pesanProvider: string | null;
  dibuatPada: number;
  dibayarPada: number | null;
  selesaiPada: number | null;
  pembayaran: {
    namaRekening: string;
    namaBank: string;
    nomorRekening: string;
    qrisUrl: string | null;
    tersedia: boolean;
  };
  instruksi: string;
};

let jawaban: Jawaban = {
  kodePesanan: "PPOB-261028-7K3M9QXW2N4P",
  namaProduk: "Telkomsel 10.000",
  kategori: "pulsa",
  nomorTujuan: "0812••••7890",
  hargaJual: 10_400,
  status: "menunggu_bayar",
  snTersedia: false,
  pesanProvider: null,
  dibuatPada: Date.UTC(2026, 9, 28, 7, 0, 0),
  dibayarPada: null,
  selesaiPada: null,
  pembayaran: {
    namaRekening: "PINDAI DIGITAL",
    namaBank: "SEABANK",
    nomorRekening: "901234567890",
    qrisUrl: null,
    tersedia: true,
  },
  instruksi: "Pesanan diproses 08.00–21.00 WIB.",
};

mock.module("convex/react", () => ({
  useQuery: () => jawaban,
  useMutation: () => async () => undefined,
  useAction: () => async () => undefined,
}));

const { PpobPesanan } = await import("../src/pages/Ppob");

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

function render() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/ppob/pesanan/PPOB-261028-7K3M9QXW2N4P"]}>
      <Routes>
        <Route path="/ppob/pesanan/:kode" element={<PpobPesanan />} />
      </Routes>
    </MemoryRouter>,
  );
}

const menunggu = render();
cek("kode pesanan tercetak", menunggu.includes("PPOB-261028-7K3M9QXW2N4P"));
cek("nominal transfer", menunggu.includes("Rp 10.400"));
cek("rekening tujuan", menunggu.includes("901234567890"));
cek("nama pemilik rekening", menunggu.includes("PINDAI DIGITAL"));
cek("instruksi admin", menunggu.includes("Pesanan diproses 08.00"));
cek("tombol bukti WhatsApp", menunggu.includes("Kirim bukti ke WhatsApp"));
cek("nomor tujuan tersamar", menunggu.includes("0812••••7890"));
cek("tanpa undefined", !menunggu.includes("undefined"));

jawaban = {
  ...jawaban,
  status: "sukses",
  snTersedia: true,
  pesanProvider: "Transaksi Sukses",
  selesaiPada: Date.UTC(2026, 9, 28, 7, 15, 0),
};
const sukses = render();
cek("status selesai", sukses.includes("Produk sudah dikirim."));
cek("token tidak tampil terbuka", !sukses.includes("TOKEN-1234-5678-9012"));
cek("form buka nomor seri", sukses.includes("Buka nomor seri"));
cek("petunjuk 4 digit", sukses.includes("4 digit terakhir"));
cek("tanpa NaN", !sukses.includes("NaN"));
cek("tanpa objek bocor", !sukses.includes("[object Object]"));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
