/**
 * Uji generator kalender `.ics` (`src/lib/kalenderIcs.ts`).
 * Run: bun src/lib/kalenderIcs.test.ts
 *
 * Yang dijaga:
 *  - tanggal memakai kalender WIB, bukan UTC peramban/server;
 *  - acara sepanjang hari memakai DTEND eksklusif (+1 hari);
 *  - teks di-escape dan baris dilipat, sehingga berkas diterima aplikasi
 *    kalender tanpa terpotong;
 *  - satu tagihan tidak menjadi dua acara.
 */
import { buatIcs, namaBerkasIcs } from "@/lib/kalenderIcs";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}
const sama = (nama: string, nyata: unknown, harap: unknown) =>
  cek(`${nama} (${String(nyata)} = ${String(harap)})`, nyata === harap);

const SEKARANG = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026, 10.00 WIB

const berkas = buatIcs(
  [
    {
      uid: "angsuran-1",
      judul: "Angsuran 2/6 · PGD-20261028-ABCD, jatuh tempo",
      deskripsi: "Total Rp500.000; unggah bukti transfer di PINDAI.",
      mulai: Date.UTC(2026, 10, 3, 18, 0), // 4 Nov 2026, 01.00 WIB
    },
    {
      uid: "angsuran-1",
      judul: "Duplikat yang harus dilewati",
      mulai: Date.UTC(2026, 10, 4, 18, 0),
    },
    {
      uid: "angsuran-2",
      judul: "Angsuran 3/6",
      mulai: Date.UTC(2026, 11, 4, 5, 0),
      pengingatHari: 0,
    },
  ],
  { sekarang: SEKARANG, namaKalender: "Tagihan PINDAI" },
);

const baris = berkas.split("\r\n");
const cari = (awalan: string) => baris.find((b) => b.startsWith(awalan)) ?? "";

// ---- Kerangka berkas ----
sama("awal berkas", baris[0], "BEGIN:VCALENDAR");
cek("berkas ditutup", berkas.trimEnd().endsWith("END:VCALENDAR"));
cek("memakai CRLF", berkas.includes("\r\n") && !/[^\r]\n/.test(berkas));
sama("nama kalender", cari("X-WR-CALNAME:"), "X-WR-CALNAME:Tagihan PINDAI");
sama("jumlah acara", baris.filter((b) => b === "BEGIN:VEVENT").length, 2);

// ---- Tanggal WIB & DTEND eksklusif ----
const mulai = baris.filter((b) => b.startsWith("DTSTART;VALUE=DATE:"));
sama("DTSTART pertama", mulai[0], "DTSTART;VALUE=DATE:20261104");
sama("DTEND pertama", cari("DTEND;VALUE=DATE:"), "DTEND;VALUE=DATE:20261105");
sama("DTSTART kedua", mulai[1], "DTSTART;VALUE=DATE:20261204");
cek("DTSTAMP ada", /^DTSTAMP:\d{8}T\d{6}Z$/.test(cari("DTSTAMP:")));

// ---- Escape teks ----
const ringkas = cari("SUMMARY:");
sama("titik tengah tidak merusak", ringkas.includes("·"), true);
sama("koma di-escape", ringkas.includes("\\,"), true);
const deskripsi = cari("DESCRIPTION:");
cek("titik koma di-escape", deskripsi.includes("\\;"));
cek("titik di akhir tidak di-escape", deskripsi.includes("PINDAI."));

// ---- Pengingat ----
sama("pengingat bawaan 1 hari", baris.filter((b) => b === "TRIGGER:-P1D").length, 1);
sama("tanpa pengingat bila 0", baris.filter((b) => b === "BEGIN:VALARM").length, 1);

// ---- Pelipatan baris ----
const kepanjangan = baris.filter((b) => new TextEncoder().encode(b).length > 75);
sama("tidak ada baris > 75 oktet", kepanjangan.length, 0);
cek(
  "baris lanjutan diawali spasi",
  buatIcs(
    [{ uid: "panjang", judul: "X".repeat(200), mulai: SEKARANG }],
    { sekarang: SEKARANG },
  )
    .split("\r\n")
    .some((b) => b.startsWith(" ")),
);

// ---- Judul & uid wajib ----
function melempar(nama: string, fn: () => unknown) {
  try {
    fn();
    gagal += 1;
    console.error(`FAIL ${nama}: seharusnya melempar`);
  } catch {
    lulus += 1;
  }
}
melempar("judul kosong ditolak", () =>
  buatIcs([{ uid: "a", judul: "  ", mulai: SEKARANG }]),
);
melempar("uid kosong ditolak", () =>
  buatIcs([{ uid: " ", judul: "Tagihan", mulai: SEKARANG }]),
);
melempar("tanggal rusak ditolak", () =>
  buatIcs([{ uid: "a", judul: "Tagihan", mulai: Number.NaN }]),
);

// ---- Nama berkas ----
sama(
  "nama berkas",
  namaBerkasIcs("PINDAI Jadwal", SEKARANG),
  "pindai-jadwal-2026-10-28.ics",
);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
