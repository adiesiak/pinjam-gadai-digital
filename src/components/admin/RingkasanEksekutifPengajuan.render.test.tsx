/**
 * Uji render TIGA KOTAK RINGKAS (executive summary) review pengajuan admin.
 * Run: bun src/components/admin/RingkasanEksekutifPengajuan.render.test.tsx
 *
 * Yang dijaga — inilah janji penyederhanaan UX-nya, jadi harus terbaca di
 * markup, bukan hanya di kode:
 *
 *  1. KOTAK METRIK menyebut nominal, tenor, potongan di muka, bunga, total
 *     pelunasan, serta bank & nomor rekening tujuan. Angkanya diambil dari
 *     `lib/rincianAliranDana` (mesin yang sama dengan ledger), jadi tes ini
 *     membandingkan TAMPILAN dengan angka mesin itu — bukan angka hafalan.
 *  2. KOTAK PROFIL menyebut nama, nomor WhatsApp, status KYC, skor integritas,
 *     dan menyediakan tombol kecil menuju lampiran foto (modal) — bukan gambar
 *     yang memenuhi layar.
 *  3. KOTAK AKSI memuat tepat tiga tindakan: Setujui, Tolak, Kirim Notifikasi
 *     WA; tombol yang tidak sah (mis. pinjaman sudah lunas) dirender NONAKTIF.
 *
 * Komponen dirender lewat react-dom/server (tanpa browser, tanpa Convex).
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KotakAksiAdmin,
  KotakMetrikPengajuan,
  KotakProfilNasabah,
} from "./RingkasanEksekutifPengajuan";
import { formatRupiah } from "@/lib/money";
import { rincianPinjamanNyata } from "@/lib/rincianAliranDana";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

// ===== 1. Kotak metrik: angka dari mesin uang yang sama dengan ledger =======
const rincian = rincianPinjamanNyata({ pokokPinjaman: 1_000_000, tenorBulan: null });
const metrik = renderToStaticMarkup(
  <KotakMetrikPengajuan
    pokok={1_000_000}
    tenorTeks="30 hari"
    potonganDiMuka={rincian.potonganDiMuka}
    bunga={rincian.imbalHasil}
    totalPelunasan={rincian.totalKembali}
    namaBank="BCA"
    nomorRekening="1234567890"
  />,
);

ada(metrik, "Metrik pengajuan", "judul kotak metrik");
for (const label of [
  "Nominal pokok",
  "Tenor",
  "Potongan di muka",
  "Bunga (Imbal Hasil)",
  "Total pelunasan",
  "Bank / e-wallet tujuan",
  "No. rekening tujuan",
]) {
  ada(metrik, label, `label "${label}"`);
}
ada(metrik, formatRupiah(1_000_000), "nominal pokok tampil");
ada(metrik, "30 hari", "tenor tampil");
ada(metrik, formatRupiah(rincian.potonganDiMuka), "potongan di muka = angka mesin uang");
ada(metrik, formatRupiah(rincian.imbalHasil), "bunga = angka mesin uang");
ada(metrik, formatRupiah(rincian.totalKembali), "total pelunasan = angka mesin uang");
ada(metrik, "BCA", "bank tujuan tampil");
ada(metrik, "1234567890", "nomor rekening tampil");
bersih(metrik, "kotak metrik");

// Bank yang belum tercatat (baris lama) tidak boleh muncul sebagai kosong/aneh.
const metrikTanpaBank = renderToStaticMarkup(
  <KotakMetrikPengajuan
    pokok={500_000}
    tenorTeks="3 bulan"
    potonganDiMuka={10_000}
    bunga={150_000}
    totalPelunasan={650_000}
    namaBank={null}
    nomorRekening="9876543210"
  />,
);
ada(metrikTanpaBank, "Tidak dicatat", "bank kosong ditulis apa adanya");
ada(metrikTanpaBank, "3 bulan", "tenor bulanan tampil");
bersih(metrikTanpaBank, "kotak metrik tanpa bank");

// ===== 2. Kotak profil nasabah =============================================
const profil = renderToStaticMarkup(
  <KotakProfilNasabah
    nama="RANI PEMINJAM"
    nomorWhatsApp="6281234567890"
    statusKyc="VERIFIED"
    skor={72}
    grade="B"
    onLihatLampiran={() => {}}
    lampiranSiap
    jumlahLampiran={3}
  />,
);

ada(profil, "Profil nasabah", "judul kotak profil");
ada(profil, "Nama lengkap", "label nama");
ada(profil, "RANI PEMINJAM", "nama nasabah tampil");
ada(profil, "No. WhatsApp", "label nomor WhatsApp");
ada(profil, "6281234567890", "nomor WhatsApp tampil");
ada(profil, "Status KYC", "label status KYC");
ada(profil, "Terverifikasi", "status KYC VERIFIED diterjemahkan");
ada(profil, "Skor integritas", "label skor integritas");
ada(profil, "72/100", "skor integritas tampil");
ada(profil, "Grade B", "grade risiko tampil");
ada(profil, "Lihat Lampiran Foto KTP/Selfie", "tombol lampiran foto tersedia");
ada(profil, "(3)", "jumlah lampiran disebut");
bersih(profil, "kotak profil");

// Selama query profil belum selesai, jangan menuduh nasabah "belum ada KYC".
const profilMemuat = renderToStaticMarkup(
  <KotakProfilNasabah
    nama="RANI PEMINJAM"
    nomorWhatsApp={null}
    statusKyc={undefined}
    skor={null}
    grade={null}
    onLihatLampiran={() => {}}
    lampiranSiap={false}
  />,
);
ada(profilMemuat, "Memuat…", "status KYC yang belum termuat berstatus memuat");
ok(!profilMemuat.includes("Belum ada KYC"), "belum termuat bukan berarti belum ada KYC");
ada(profilMemuat, "Belum dicatat", "nomor WhatsApp kosong ditulis apa adanya");
ok(
  profilMemuat.includes('disabled=""'),
  "tombol lampiran nonaktif selama lampiran belum siap",
);
bersih(profilMemuat, "kotak profil (memuat)");

const profilTanpaKyc = renderToStaticMarkup(
  <KotakProfilNasabah
    nama="BUDI"
    nomorWhatsApp="628111222333"
    statusKyc={null}
    skor={50}
    skorDinilai={false}
    grade={null}
    onLihatLampiran={() => {}}
    lampiranSiap
  />,
);
ada(profilTanpaKyc, "Belum ada KYC", "nasabah tanpa baris KYC ditulis jelas");
ada(profilTanpaKyc, "belum ada riwayat, skor netral", "skor netral dijelaskan");
bersih(profilTanpaKyc, "kotak profil tanpa KYC");

// ===== 3. Kotak aksi admin =================================================
const aksi = renderToStaticMarkup(
  <KotakAksiAdmin
    busy={null}
    bolehSetujui
    bolehTolak
    bolehKirimWa
    sudahLunas={false}
    onSetujui={() => {}}
    onTolak={() => {}}
    onKirimWa={() => {}}
  />,
);

ada(aksi, "Aksi admin", "judul kotak aksi");
ada(aksi, "Setujui Pengajuan", "tombol setujui tersedia");
ada(aksi, "Tolak", "tombol tolak tersedia");
ada(aksi, "Kirim Notifikasi WA", "tombol notifikasi WA tersedia");
ok(
  aksi.includes("Audit Trail"),
  "keterangan jejak audit ikut tampil (keputusan tidak hilang)",
);
ok(!aksi.includes('disabled=""'), "semua tombol aktif saat keputusan masih mungkin");
bersih(aksi, "kotak aksi");

const aksiLunas = renderToStaticMarkup(
  <KotakAksiAdmin
    busy={null}
    bolehSetujui={false}
    bolehTolak={false}
    bolehKirimWa={false}
    sudahLunas
    setujuTerkunci="Pinjaman sudah lunas — posisinya ditutup."
    waTerkunci="Nomor WhatsApp nasabah belum ada di data KYC."
    onSetujui={() => {}}
    onTolak={() => {}}
    onKirimWa={() => {}}
  />,
);
ada(aksiLunas, "sudah lunas", "status lunas dijelaskan");
ok(
  (aksiLunas.match(/disabled=""/g) ?? []).length === 3,
  "ketiga tombol nonaktif saat pinjaman sudah lunas",
);
ok(
  !aksiLunas.includes("Pinjaman sudah lunas — posisinya ditutup."),
  "alasan tidak diulang saat barisnya sudah lunas",
);
ok(
  !aksiLunas.includes("Nomor WhatsApp nasabah belum ada di data KYC."),
  "alasan WA tidak perlu disebut saat keputusan sudah ditutup",
);
bersih(aksiLunas, "kotak aksi (lunas)");

// Terkunci karena sudah disalurkan (belum lunas): alasan kenapa "Setujui"
// tidak ditawarkan lagi harus terbaca.
const aksiTerkunci = renderToStaticMarkup(
  <KotakAksiAdmin
    busy={null}
    bolehSetujui={false}
    bolehTolak
    bolehKirimWa
    sudahLunas={false}
    setujuTerkunci="Pengajuan sudah disetujui dan dananya ditandai tersalurkan."
    onSetujui={() => {}}
    onTolak={() => {}}
    onKirimWa={() => {}}
  />,
);
ada(
  aksiTerkunci,
  "Pengajuan sudah disetujui dan dananya ditandai tersalurkan.",
  "alasan tombol setujui terkunci disebut",
);
ok(
  (aksiTerkunci.match(/disabled=""/g) ?? []).length === 1,
  "hanya tombol setujui yang nonaktif",
);
bersih(aksiTerkunci, "kotak aksi (terkunci)");

// Baris warisan `disetujui`: keputusannya sudah tercatat, jadi langkah yang
// tersisa diberi label pencairan — bukan "Setujui" untuk kedua kalinya.
const aksiPencairan = renderToStaticMarkup(
  <KotakAksiAdmin
    busy={null}
    labelSetujui="Tandai dana tersalurkan"
    bolehSetujui
    bolehTolak
    bolehKirimWa
    sudahLunas={false}
    onSetujui={() => {}}
    onTolak={() => {}}
    onKirimWa={() => {}}
  />,
);
ada(aksiPencairan, "Tandai dana tersalurkan", "label pencairan dipakai bila diminta");
ok(
  !aksiPencairan.includes("Setujui Pengajuan"),
  "label persetujuan tidak muncul dua kali",
);
bersih(aksiPencairan, "kotak aksi (pencairan)");

const aksiMenungguWa = renderToStaticMarkup(
  <KotakAksiAdmin
    busy="wa"
    bolehSetujui
    bolehTolak
    bolehKirimWa={false}
    sudahLunas={false}
    waTerkunci="Nomor WhatsApp nasabah belum ada di data KYC."
    onSetujui={() => {}}
    onTolak={() => {}}
    onKirimWa={() => {}}
  />,
);
ada(
  aksiMenungguWa,
  "Nomor WhatsApp nasabah belum ada di data KYC.",
  "alasan tombol WA nonaktif disebut",
);
ok(
  (aksiMenungguWa.match(/disabled=""/g) ?? []).length === 3,
  "proses berjalan mengunci ketiga tombol",
);
bersih(aksiMenungguWa, "kotak aksi (menunggu WA)");

console.log(`RingkasanEksekutifPengajuan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
