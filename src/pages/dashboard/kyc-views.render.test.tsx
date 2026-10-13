/**
 * Uji render bagian tampilan modul KYC di dashboard nasabah.
 * Run: bun src/pages/dashboard/kyc-views.render.test.tsx
 *
 * Bagian yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi yang
 * diuji di sini adalah bagian MURNI-nya: judul status, kotak keputusan petugas,
 * dan daftar riwayat. Yang dijaga:
 *
 *  - SETIAP dari tujuh status tampil dengan label & kalimat penjelasnya dari
 *    `lib/kycStatus.ts`, bukan label yang ditulis ulang di komponen;
 *  - VERIFIED secara eksplisit menyebut bukan persetujuan pinjaman/pencairan;
 *  - kekurangan isian terlihat sebagai daftar sebelum pengajuan bisa dikirim;
 *  - keputusan yang merugikan selalu menampilkan catatan petugas dan siapa yang
 *    memutuskan;
 *  - riwayat menampilkan waktu, aktor, alasan yang sudah diterjemahkan, dan
 *    tidak pernah memunculkan "undefined"/"NaN"/"[object Object]";
 *  - setiap kekurangan yang punya tahap tampil sebagai tombol menuju tahap itu;
 *  - baris aksi tahap hanya punya SATU aksi utama, menyebut sisa isian selama
 *    pengajuan belum boleh dikirim, dan membaca keadaan simpan di sebelahnya;
 *  - petunjuk foto tertutup sejak awal supaya kolom unggah tampil lebih dulu;
 *  - kartu pemeriksaan otomatis menyembunyikan daftar per aturan di balik lipatan
 *    yang tertutup sejak awal, sementara putusan mesin dan cacah hasil yang perlu
 *    diperhatikan tetap terbaca tanpa membukanya;
 *  - menu tahap KYC di sidebar hanya ada selama verifikasinya belum selesai,
 *    statusnya diambil dari data tersimpan, dan letaknya tepat di bawah menu
 *    peran (dijaga dengan membaca urutan berkasnya).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";import {
  KycBarisAksi,
  KycDaftarAturanOtomatis,
  KycDaftarTahap,
  KycKeputusanAlert,
  KycMenuSidebar,
  KycPemeriksaanOtomatis,
  KycPetunjukFoto,
  KycRiwayatList,
  KycStatusHeader,
  KycStatusStrip,
  KycStepperTigaTahap,
  menuTahapKyc,
  STAGE_KYC,
  stageUntukTahap,
  tahapStage,
  tampilkanMenuTahapKyc,
  type RiwayatKycTampil,
} from "./kyc-views";
import {
  ID_TAHAP_KYC,
  petunjukTahap,
  type IdTahapKyc,
  type IsianKycLengkap,
  type StatusTahapKyc,
} from "@/lib/kycTahapan";
import { VERSI_ATURAN_AUTO_KYC } from "@/lib/kycAutoApproval";
import {
  isKycVerified,
  KETERANGAN_STATUS_KYC,
  KYC_STATUS,
  LABEL_STATUS_KYC,
  ringkasStatusKyc,
} from "@/lib/kycStatus";

/** Isi berkas sumber relatif terhadap folder `src/`. */
function bacaSumber(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relatif}`, import.meta.url)), "utf8");
}

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




// ===== 1. Tujuh status, label & penjelasan dari satu sumber =====
for (const status of KYC_STATUS) {
  const html = renderToStaticMarkup(
    <KycStatusHeader
      status={status}
      kekurangan={["Foto KTP", "Bukti penghasilan"]}
      lengkap={false}
      onBuka={() => {}}
      persen={0}
      selesai={0}
      total={7}
    />,
  );
  ada(html, LABEL_STATUS_KYC[status], `label status ${status} mengikuti lib/kycStatus`);
  ada(html, KETERANGAN_STATUS_KYC[status], `penjelasan status ${status} mengikuti lib/kycStatus`);
  bersih(html, `judul status ${status}`);
}

// ===== 2. Kelengkapan: daftar kekurangan tampil, dan hilang saat lengkap =====
{
  const kurang = renderToStaticMarkup(
    <KycStatusHeader
      status="IN_PROGRESS"
      kekurangan={["NIK 16 angka", "Selfie dengan KTP"]}
      lengkap={false}
      onBuka={() => {}}
      persen={29}
      selesai={2}
      total={7}
    />,
  );
  ada(kurang, "NIK 16 angka", "kekurangan NIK tampil");
  ada(kurang, "Selfie dengan KTP", "kekurangan selfie tampil");
  ada(kurang, "2 hal sebelum bisa diajukan", "jumlah kekurangan dilaporkan");
  ada(kurang, "2 dari 7 tahap siap", "progres tahap dilaporkan dengan angka nyata");
  ada(
    kurang,
    'aria-label="Kesiapan pengajuan KYC: 29 persen"',
    "bilah kesiapan melaporkan angkanya ke pembaca layar",
  );
  ok(
    !kurang.includes("Perubahan terakhir"),
    "kartu kesiapan tidak lagi memuat kotak perubahan terakhir",
  );
  // Dua kekurangan di atas keduanya punya tahap, jadi keduanya harus jadi tombol
  // yang menyebut tahap tujuannya, bukan teks yang harus ditebak sendiri.
  ok(
    (kurang.match(/aria-label="[^"]+: buka /g) ?? []).length === 2,
    "kekurangan yang punya tahap jadi tombol menuju tahapnya",
  );
  ada(kurang, "NIK 16 angka: buka Data identitas", "tombol menunjuk tahap yang benar");

  const lengkap = renderToStaticMarkup(
    <KycStatusHeader
      status="IN_PROGRESS"
      kekurangan={[]}
      lengkap
      onBuka={() => {}}
      persen={100}
      selesai={7}
      total={7}
    />,
  );
  ada(lengkap, "Lengkap, siap diajukan.", "keadaan lengkap tampil");
  ok(!lengkap.includes("sebelum bisa diajukan"), "tidak mengeluh kekurangan saat lengkap");
  bersih(lengkap, "judul status lengkap");
}

// ===== 3. Kelengkapan harus jadi SYARAT, bukan sekadar informasi =====
{
  // VERIFIED tidak pernah menyatakan persetujuan pinjaman.
  const terverifikasi = renderToStaticMarkup(
    <KycStatusHeader
      status="VERIFIED"
      kekurangan={[]}
      lengkap
      onBuka={() => {}}
      persen={100}
      selesai={7}
      total={7}
    />,
  );
  const penjelasan = KETERANGAN_STATUS_KYC.VERIFIED;
  ok(/bukan persetujuan pinjaman/.test(penjelasan), "penjelasan VERIFIED menegaskan bukan persetujuan");
  ada(terverifikasi, penjelasan, "peringatan bukan persetujuan tampil di dashboard");
}

// ===== 4. Kotak keputusan petugas =====
{
  const perluPerbaikan = renderToStaticMarkup(
    <KycKeputusanAlert
      status="NEEDS_CORRECTION"
      catatan="Foto KTP buram, mohon difoto ulang."
      olehLabel="petugas@pindai.test"
      pada={1_700_000_000_000}
    />,
  );
  ada(perluPerbaikan, "Perlu perbaikan sebelum diajukan ulang", "judul perbaikan tampil");
  ada(perluPerbaikan, "Foto KTP buram, mohon difoto ulang.", "catatan petugas tampil");
  ada(perluPerbaikan, "petugas@pindai.test", "pemutus tampil");
  ada(perluPerbaikan, 'role="alert"', "keputusan diumumkan sebagai alert");
  bersih(perluPerbaikan, "kotak perbaikan");

  const ditolak = renderToStaticMarkup(
    <KycKeputusanAlert
      status="REJECTED"
      catatan="Dokumen tidak sesuai nama."
      olehLabel="petugas@pindai.test"
      pada={null}
    />,
  );
  ada(ditolak, "Pengajuan KYC ditolak", "judul penolakan tampil");
  ada(ditolak, "Dokumen tidak sesuai nama.", "alasan penolakan tampil");
  bersih(ditolak, "kotak penolakan");

  // Status yang bukan keputusan merugikan tidak menampilkan kotak ini.
  const bukanKeputusan = renderToStaticMarkup(
    <KycKeputusanAlert status="IN_PROGRESS" catatan={null} olehLabel={null} pada={null} />,
  );
  ok(bukanKeputusan === "", "status biasa tidak memunculkan kotak keputusan");
}

// ===== 5. Riwayat: waktu, aktor, alasan terjemahan, catatan =====
{
  const riwayat: RiwayatKycTampil[] = [
    {
      dari: "VERIFIED",
      ke: "REVERIFICATION_REQUIRED",
      aktor: "sistem",
      aktorLabel: "sistem",
      alasan: "data_identitas_berubah",
      catatan: "Data identitas penting berubah setelah verifikasi; putusan lama tidak berlaku lagi.",
      waktu: 1_700_000_000_000,
    },
    {
      dari: "-",
      ke: "IN_PROGRESS",
      aktor: "nasabah",
      aktorLabel: "rani@pindai.test",
      alasan: "kyc_dimulai",
      catatan: null,
      waktu: 1_699_000_000_000,
    },
  ];
  const html = renderToStaticMarkup(<KycRiwayatList riwayat={riwayat} />);
  ada(html, "Data identitas penting berubah", "alasan diterjemahkan ke kalimat");
  ok(!html.includes("data_identitas_berubah"), "kode alasan mentah tidak ditampilkan");
  ada(html, "rani@pindai.test", "aktor nasabah tampil");
  ada(html, "Nasabah memulai modul KYC", "alasan memulai diterjemahkan");
  ada(html, LABEL_STATUS_KYC.REVERIFICATION_REQUIRED, "status tujuan tampil sebagai label");
  ada(html, "Baru", "status awal ditandai sebagai baris baru");
  bersih(html, "daftar riwayat");

  const kosong = renderToStaticMarkup(<KycRiwayatList riwayat={[]} />);
  ada(kosong, "Belum ada riwayat", "keadaan tanpa riwayat dijelaskan");
  bersih(kosong, "riwayat kosong");
}

// ===== 6. Pil status yang tampil di semua tab =====
for (const status of KYC_STATUS) {
  const html = renderToStaticMarkup(<KycStatusStrip status={status} onBuka={() => {}} />);
  ada(html, LABEL_STATUS_KYC[status], `pil ${status} memakai label bersama`);
  ada(html, ringkasStatusKyc(status), `pil ${status} memakai ringkasan bersama`);
  bersih(html, `pil status ${status}`);
}
{
  const perlu = renderToStaticMarkup(<KycStatusStrip status="NOT_STARTED" onBuka={() => {}} />);
  ada(perlu, "Lanjutkan verifikasi", "status yang butuh tindakan mengajak melanjutkan");
  const terverifikasi = renderToStaticMarkup(<KycStatusStrip status="VERIFIED" onBuka={() => {}} />);
  ada(terverifikasi, "Lihat Verifikasi KYC", "status final hanya mengajak melihat");
  ok(
    /bukan persetujuan pinjaman/.test(ringkasStatusKyc("VERIFIED")),
    "ringkasan VERIFIED tetap menyebut bukan persetujuan pinjaman",
  );
}

// ===== 7. Kartu pemeriksaan otomatis: hasil yang TIDAK diterapkan tidak boleh
// tampak seperti status yang sudah diputuskan mesin =====
const keputusanMesin = {
  waktu: 1_700_000_000_000,
  statusSebelum: "PENDING_REVIEW" as const,
  keputusan: "NEEDS_CORRECTION" as const,
  alasan: "otomatis_perlu_perbaikan",
  ringkasan: "Pemeriksaan otomatis menemukan 1 hal yang perlu diperbaiki.",
  versiAturan: VERSI_ATURAN_AUTO_KYC,
  sumber: "otomatis",
  aktor: "sistem" as const,
  diterapkan: false,
  aturan: [
    {
      id: "nomor_wa_terverifikasi",
      judul: "Nomor WhatsApp sudah terverifikasi",
      status: "gagal",
      sumber: "server",
      pesan: "Nomor WhatsApp belum diverifikasi lewat kode OTP.",
      detail: ["Verifikasi OTP nomor WhatsApp belum selesai"],
    },
  ],
};
/** Tiga status sekaligus, dipakai bersama oleh uji kepala lipatan dan isinya. */
const aturanTigaStatus = [
  ...keputusanMesin.aturan,
  {
    id: "foto_ktp_terbaca",
    judul: "Foto KTP terbaca",
    status: "lulus",
    sumber: "server",
    pesan: "Foto KTP terbaca.",
    detail: [],
  },
  {
    id: "ocr_tersedia_threshold",
    judul: "Hasil OCR tersedia",
    status: "tidak_pasti",
    sumber: "server",
    pesan: "Hasil OCR belum tersimpan.",
    detail: ["Keyakinan OCR di bawah ambang yang dipakai"],
  },
];
{
  const html = renderToStaticMarkup(<KycPemeriksaanOtomatis keputusan={keputusanMesin} />);
  ada(html, "Pemeriksaan otomatis terakhir", "kartu pemeriksaan otomatis tampil");
  ada(html, "belum mengubah status", "hasil yang tidak diterapkan ditandai jelas");
  ada(html, VERSI_ATURAN_AUTO_KYC, "versi aturan mesin tampil agar bisa ditelusuri");
  ada(html, "Dukcapil", "batas yang tidak diklaim tetap disebut");
  // Daftar sampai sembilan aturan bisa setinggi layar ponsel sendiri, jadi ia
  // hidup di dalam lipatan yang tertutup sejak awal. Yang tetap terbaca tanpa
  // membukanya: jumlah pemeriksaan dan cacah hasil yang perlu diperhatikan.
  ada(html, "Rincian 1 pemeriksaan", "jumlah pemeriksaan tampil di kepala lipatan");
  ada(html, "1 gagal", "cacah gagal terbaca sebelum lipatan dibuka");
  ada(html, 'hidden=""', "daftar per aturan tertutup sejak awal");
  // Kepala lipatan harus tetap 44px dan tidak mewarisi tinggi bawaan akordeon
  // (`py-4`), sebab kalau `cn`/tailwind-merge gagal menimpa, kartunya kembali
  // setinggi versi yang justru dipadatkan ini.
  ada(html, "min-h-11", "kepala lipatan setinggi target sentuh 44px");
  ok(!html.includes("py-4"), "tinggi bawaan akordeon sudah ditimpa kepala lipatan");
  ok(
    !html.includes("belum diverifikasi lewat kode OTP"),
    "rincian tidak ikut dirender selama lipatan tertutup",
  );
  bersih(html, "kartu pemeriksaan otomatis tidak diterapkan");
}
{
  // Cacah hanya menyebut yang perlu ditindaklanjuti: aturan yang lulus tidak
  // menambah angka di kepala lipatan.
  const html = renderToStaticMarkup(
    <KycPemeriksaanOtomatis keputusan={{ ...keputusanMesin, aturan: aturanTigaStatus }} />,
  );
  ada(html, "Rincian 3 pemeriksaan", "jumlah pemeriksaan mengikuti data");
  ada(html, "1 gagal", "cacah gagal tepat");
  ada(html, "1 belum pasti", "cacah belum pasti tepat");
  ok(!html.includes("lulus"), "aturan yang lulus tidak menambah angka di kepala lipatan");
  bersih(html, "kepala lipatan dengan tiga status");
}
{
  // Isi lipatan diuji langsung pada daftarnya, sebab lipatan yang tertutup tidak
  // merender isinya sama sekali.
  const html = renderToStaticMarkup(<KycDaftarAturanOtomatis aturan={aturanTigaStatus} />);
  ada(html, "Gagal", "pemeriksaan yang gagal ditandai");
  ada(html, "Belum pasti", "pemeriksaan yang belum pasti ditandai");
  ada(html, "Lulus", "pemeriksaan yang lulus ditandai");
  ada(html, "belum diverifikasi lewat kode OTP", "alasan dari mesin ditampilkan apa adanya");
  ada(
    html,
    "Verifikasi OTP nomor WhatsApp belum selesai.",
    "rincian pengukuran ikut tampil dan ditutup titik",
  );
  ok(
    (html.match(/<li /g) ?? []).length === aturanTigaStatus.length,
    "setiap aturan dapat satu baris, tanpa baris tambahan",
  );
  bersih(html, "daftar aturan mesin");
}
{
  // Hasil yang DITERAPKAN (mesin menaikkan ke VERIFIED) tidak perlu kalimat itu.
  const html = renderToStaticMarkup(
    <KycPemeriksaanOtomatis
      keputusan={{ ...keputusanMesin, keputusan: "VERIFIED", diterapkan: true }}
    />,
  );
  ok(!html.includes("belum mengubah status"), "hasil yang diterapkan tidak disebut belum berlaku");
  ada(html, VERSI_ATURAN_AUTO_KYC, "versi aturan tetap tampil");
  bersih(html, "kartu pemeriksaan otomatis diterapkan");
}

// ===== 8. Peta 3 stage: menutupi SEMUA langkah, tanpa duplikat =====
{
  const semua = STAGE_KYC.flatMap((s) => [...s.tahap]);
  ok(semua.length === ID_TAHAP_KYC.length, "jumlah langkah di stepper = jumlah langkah KYC");
  for (const id of ID_TAHAP_KYC) {
    ok(
      semua.filter((x) => x === id).length === 1,
      `langkah ${id} muncul tepat sekali di peta stage`,
    );
  }
  ok(tahapStage(1).length === 3, "stage 1 memuat 3 langkah");
  ok(tahapStage(2).length === 2, "stage 2 memuat 2 langkah");
  ok(tahapStage(3).length === 3, "stage 3 memuat alamat, kontak darurat, dan pendukung");

  const harapan: Record<IdTahapKyc, 1 | 2 | 3> = {
    persetujuan: 1,
    identitas: 1,
    whatsapp: 1,
    ktp: 2,
    selfie: 2,
    alamat: 3,
    darurat: 3,
    pendukung: 3,
  };
  for (const id of ID_TAHAP_KYC) {
    ok(stageUntukTahap(id) === harapan[id], `stage ${id} = ${harapan[id]} (ketentuan produk)`);
  }
}

// ===== 9. Bilah 3 stage: label, posisi aktif, ringkasan status, kunci =====
function statusNetral(): Record<IdTahapKyc, StatusTahapKyc> {
  return Object.fromEntries(ID_TAHAP_KYC.map((id) => [id, "belum"])) as Record<
    IdTahapKyc,
    StatusTahapKyc
  >;
}
{
  const html = renderToStaticMarkup(
    <KycStepperTigaTahap
      aktif="identitas"
      statusPerTahap={statusNetral()}
      onPilih={() => {}}
      terkunci={false}
    />,
  );
  ada(html, "Tahap 1: Kontak &amp; OTP", "stage 1 berlabel sesuai ketentuan");
  ada(html, "Tahap 2: Live KTP &amp; Selfie", "stage 2 berlabel sesuai ketentuan");
  ada(
    html,
    "Tahap 3: Alamat &amp; Rekening",
    "stage 3 berlabel sesuai isinya (alamat, kontak darurat, rekening)",
  );
  ok(!html.includes("Stage "), "antarmuka tidak memakai istilah 'Stage'");
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 1,
    "hanya satu stage bertanda aktif",
  );
  ada(html, "0/3 langkah siap", "stage 1 melaporkan hitungan langkah nyata");
  ok(!html.includes("Selesai"), "stage kosong tidak diklaim selesai");
  // Reflow (audit-005 #11): tiga kartu berisi baru sejajar sejak `lg`, bukan
  // sejak `sm`, supaya nama stage tidak membungkus di lebar tablet.
  ok(
    html.includes("lg:flex-row") && !html.includes("sm:flex-row"),
    "bilah 3 stage baru menjejer sejak lg, tidak dipadatkan dari sm",
  );
  bersih(html, "bilah 3 stage");
}
{
  // Semua langkah stage 2 lengkap → diringkas menjadi "Selesai"; stage 1 belum.
  const status = statusNetral();
  status.ktp = "lengkap";
  status.selfie = "lengkap";
  const html = renderToStaticMarkup(
    <KycStepperTigaTahap aktif="ktp" statusPerTahap={status} onPilih={() => {}} terkunci={false} />,
  );
  ada(html, "Selesai (2/2 langkah)", "stage lengkap diringkas jadi selesai");
  ada(html, "0/3 langkah siap", "stage lain tetap melaporkan kekurangannya");
  bersih(html, "bilah 3 stage dengan stage lengkap");
}
{
  // Sebelum persetujuan tercatat: hanya stage 1 boleh dibuka.
  const html = renderToStaticMarkup(
    <KycStepperTigaTahap
      aktif="persetujuan"
      statusPerTahap={statusNetral()}
      onPilih={() => {}}
      terkunci
    />,
  );
  ok(
    (html.match(/disabled=""/g) ?? []).length === 2,
    "stage 2 & 3 terkunci sebelum persetujuan tercatat",
  );
  ada(html, "Tahap 1: Kontak &amp; OTP", "stage 1 tetap tampil saat terkunci");
  bersih(html, "bilah 3 stage terkunci");
}
{
  // Satu langkah ditandai petugas → stage-nya menyebut perbaikan.
  const status = statusNetral();
  status.selfie = "perlu-diperbaiki";
  const html = renderToStaticMarkup(
    <KycStepperTigaTahap aktif="selfie" statusPerTahap={status} onPilih={() => {}} terkunci={false} />,
  );
  ada(html, "Perlu perbaikan dari petugas", "stage dengan langkah bermasalah diberi tanda");
  ok(!html.includes("Selesai ("), "stage bermasalah tidak diklaim selesai");
  bersih(html, "bilah 3 stage dengan perbaikan");
}

// ===== 10. Deret tahap DALAM satu stage =====
// Yang dijaga: yang tampil hanya langkah stage yang sedang dibuka (bukan tujuh
// langkah sekaligus), tahap aktif ditandai sekali untuk pembaca layar, dan
// penanda "Opsional" tetap ada pada langkah yang memang boleh dilewati.
{
  const html = renderToStaticMarkup(
    <KycDaftarTahap
      aktif="pendukung"
      statusPerTahap={statusNetral()}
      onPilih={() => {}}
      terkunci={false}
      saring={tahapStage(3)}
    />,
  );
  ada(html, "Informasi pendukung", "langkah stage 3 tampil di deret");
  ada(html, "Alamat", "langkah opsional stage 3 tetap tampil");
  ada(html, "Opsional", "penanda opsional ada pada langkah opsional");
  ok(!html.includes("Nomor WhatsApp"), "deret hanya memuat langkah stage ini");
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 1,
    "hanya satu langkah ditandai aktif di deret",
  );
  // Tata letak (audit-005 #10): seluruh langkah stage harus muat di kolom,
  // bukan deret mendatar yang menyembunyikan sebagian langkah di luar layar.
  ok(
    !html.includes("overflow-x-auto") && !html.includes("min-w-[13rem]"),
    "deret langkah tanpa geseran mendatar dan tanpa lebar tetap",
  );
  ok(
    html.includes("flex flex-col gap-2"),
    "deret langkah menumpuk satu kolom penuh lebar",
  );
  bersih(html, "deret tahap satu stage");
}

// ===== 11. Baris aksi satu tahap: satu aksi utama, umpan balik di dekatnya =====
const aksiDasar = {
  busy: false,
  indeks: 0,
  total: 7,
  bolehSimpan: false,
  bolehLanjut: false,
  bolehAjukan: false,
  tampilkanAjukan: true,
  labelAjukan: "Ajukan peninjauan",
  sisaKurang: 3,
  onSebelumnya: () => {},
  onSimpan: () => {},
  onLanjut: () => {},
  onAjukan: () => {},
  onBukaKurang: () => {},
};
{
  const html = renderToStaticMarkup(
    <KycBarisAksi {...aksiDasar} menyimpan={false} tersimpanPada={null} catatan={null} />,
  );
  ok(
    (html.match(/bg-emerald-800/g) ?? []).length === 1,
    "hanya SATU tombol pejal (aksi utama) di baris aksi",
  );
  ada(html, "Simpan &amp; lanjut", "aksi utama tetap tombol yang berpindah tahap");
  ada(html, "Sebelumnya", "navigasi mundur tetap ada");
  ok(
    (html.match(/disabled=""/g) ?? []).length === 3,
    "mundur, simpan, dan lanjut mati saat tahap pertama & persetujuan belum tercatat",
  );
  ada(html, "Siap diajukan setelah 3 isian lagi", "tombol gerbang menyebut sisa isian");
  ada(html, "h-11", "target sentuh baris aksi setinggi 44px, bukan 36px");
  // `whitespace-nowrap` + `shrink-0` bawaan tombol akan melampaui tepi kartu di
  // layar 320px, jadi tombol berlabel panjang ini harus boleh membungkus.
  ada(html, "whitespace-normal", "tombol gerbang boleh membungkus di layar sempit");
  ok(
    !html.includes("Ajukan peninjauan"),
    "label ajukan tidak muncul selagi transisi itu belum sah",
  );
  ada(html, "Belum ada isian tersimpan", "keadaan simpan dinyatakan apa adanya");
  ada(html, 'role="status"', "umpan balik simpan diumumkan pembaca layar");
  ada(html, "sticky bottom-0", "baris aksi menempel selama formulir panjang");
  bersih(html, "baris aksi terkunci");
}
{
  // Tahap yang boleh diajukan: tombol ajukan menggantikan "lanjut", dan keadaan
  // simpan dibaca di baris yang sama.
  const siap = {
    ...aksiDasar,
    indeks: 6,
    bolehSimpan: true,
    bolehAjukan: true,
    labelAjukan: "Kirim ulang pengajuan",
    sisaKurang: 0,
    catatan: "Sedang menunggu peninjauan petugas. Menyimpan perubahan menarik pengajuan kembali.",
  };
  const sedangSimpan = renderToStaticMarkup(
    <KycBarisAksi {...siap} menyimpan tersimpanPada={null} />,
  );
  ada(sedangSimpan, "Kirim ulang pengajuan", "label ajukan mengikuti langkah status yang sah");
  ok(
    !sedangSimpan.includes("Siap diajukan setelah"),
    "tanpa sisa isian tidak ada tombol gerbang",
  );
  ok(!sedangSimpan.includes("Simpan &amp; lanjut"), "tahap terakhir tidak menawarkan lanjut");
  ada(sedangSimpan, "Menyimpan…", "keadaan menyimpan terbaca di sebelah tombolnya");
  ada(
    sedangSimpan,
    "Sedang menunggu peninjauan petugas.",
    "keadaan status yang perlu dijelaskan ada di baris aksi",
  );
  bersih(sedangSimpan, "baris aksi siap diajukan");

  const sudahSimpan = renderToStaticMarkup(
    <KycBarisAksi {...siap} menyimpan={false} tersimpanPada={1_700_000_000_000} />,
  );
  ada(sudahSimpan, "Tersimpan", "waktu simpan terakhir dibaca di sebelah tombolnya");
  ok(!sudahSimpan.includes("Menyimpan…"), "umpan balik simpan tidak ditinggalkan menyala");
}

// ===== 12. Petunjuk foto: tertutup sejak awal, isinya tetap satu sumber =====
{
  const html = renderToStaticMarkup(<KycPetunjukFoto tahapId="ktp" />);
  ada(
    html,
    `Petunjuk foto (${petunjukTahap("ktp").length} langkah)`,
    "judul petunjuk menyebut jumlah langkahnya",
  );
  ada(html, 'aria-expanded="false"', "petunjuk tertutup sejak awal");
  ada(html, 'data-slot="accordion-trigger"', "judulnya tetap kontrol yang bisa dibuka");
  const butirPertama = petunjukTahap("ktp")[0];
  ok(
    butirPertama !== undefined && !html.includes(butirPertama.judul),
    "isi petunjuk tidak dirender selama tertutup",
  );
  bersih(html, "petunjuk foto tertutup");
}
{
  // Tahap tanpa petunjuk tidak memunculkan akordeon kosong yang hanya menambah
  // satu baris yang bisa dibuka tanpa isi.
  const html = renderToStaticMarkup(<KycPetunjukFoto tahapId="identitas" />);
  ok(html === "", "tahap tanpa petunjuk foto tidak menambah akordeon kosong");
}

// ===== 13. Menu tahap pindah ke sidebar: kapan ada, dan apa isinya =====
const isianKosong: IsianKycLengkap = {
  namaLengkap: "",
  nik: "",
  nomorWhatsApp: "",
  alamat: "",
  pekerjaan: "",
  penghasilan: "",
  sumberPenghasilan: "",
  namaBank: "",
  nomorRekening: "",
  catatanPeminjam: "",
  namaKontakDarurat: "",
  nomorKontakDarurat: "",
  hubunganKontakDarurat: "",
};
const dokumenKosong = { ktpId: null, selfieKtpId: null, buktiPenghasilanId: null };
for (const status of KYC_STATUS) {
  ok(
    tampilkanMenuTahapKyc(status) === (status !== "NOT_STARTED" && !isKycVerified(status)),
    `tampilnya menu tahap untuk status ${status} mengikuti aturan bersama`,
  );
}
ok(
  !tampilkanMenuTahapKyc("VERIFIED"),
  "setelah identitas terverifikasi, sidebar hanya memuat menu layanan",
);
{
  const belum = menuTahapKyc({
    status: "IN_PROGRESS",
    kekurangan: [],
    persetujuanAktif: false,
    isian: isianKosong,
    dokumen: dokumenKosong,
  });
  ok(belum.terkunci, "tahap masih terkunci selama persetujuan belum tercatat");
  ok(belum.tahapAktif === "persetujuan", "KYC baru mulai membuka tahap persetujuan");
  ok(
    ID_TAHAP_KYC.every((id) => belum.statusPerTahap[id] === "belum"),
    "tanpa isian, tidak ada tahap yang diklaim siap",
  );

  const mulai = menuTahapKyc({
    status: "IN_PROGRESS",
    kekurangan: ["Foto KTP"],
    persetujuanAktif: true,
    isian: isianKosong,
    dokumen: { ...dokumenKosong, ktpId: "berkas-ktp" },
  });
  ok(!mulai.terkunci, "tahap terbuka setelah persetujuan tercatat");
  ok(mulai.tahapAktif === "identitas", "tahap berikutnya mengikuti aturan progres");
  ok(mulai.statusPerTahap.persetujuan === "lengkap", "persetujuan tercatat dianggap lengkap");
  ok(
    mulai.statusPerTahap.ktp === "sebagian",
    "berkas KTP ada tapi kekurangan dari server tetap dihitung",
  );
  ok(mulai.statusPerTahap.selfie === "belum", "tahap tanpa isian tidak ikut diklaim siap");

  const perbaikan = menuTahapKyc({
    status: "NEEDS_CORRECTION",
    kekurangan: [],
    persetujuanAktif: true,
    isian: isianKosong,
    dokumen: { ...dokumenKosong, ktpId: "berkas-ktp", selfieKtpId: "berkas-selfie" },
  });
  ok(
    perbaikan.statusPerTahap.ktp === "perlu-diperbaiki",
    "permintaan perbaikan menandai tahap dokumen",
  );
  ok(
    perbaikan.tahapAktif === "ktp",
    "permintaan perbaikan mengantar ke dokumen bermasalah, bukan mengulang dari awal",
  );
}

// ===== 14. Menu tahap di sidebar: isinya sama dengan navigasi di modul =====
{
  const status = statusNetral();
  status.persetujuan = "lengkap";
  status.identitas = "lengkap";
  const html = renderToStaticMarkup(
    <KycMenuSidebar aktif="ktp" statusPerTahap={status} terkunci={false} onPilih={() => {}} />,
  );
  ada(html, "Tahap verifikasi", "menu sidebar punya judulnya sendiri");
  ada(
    html,
    "hidden lg:block",
    "menu ini hanya muncul di kolom sidebar, tidak menumpuk di atas formulir ponsel",
  );
  ada(html, "Tahap 1: Kontak &amp; OTP", "bilah 3 tahap ikut dipindah ke sidebar");
  ada(html, "Selfie dengan KTP", "langkah stage yang dibuka tampil di menu");
  ok(
    !html.includes("Nomor WhatsApp") && !html.includes("Informasi pendukung"),
    "daftar di menu hanya memuat langkah stage yang sedang dibuka",
  );
  ok(!html.includes("lg:flex-row"), "tiga kartu tahap tetap menumpuk di kolom sempit");
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 2,
    "stage aktif dan langkah aktif masing-masing ditandai sekali",
  );
  bersih(html, "menu tahap sidebar");
}

// ===== 15. Pemasangan: tepat di bawah kotak Menu khusus, dan terbagi state =====
{
  const sidebar = bacaSumber("pages/dashboard/dashboard-sidebar.tsx");
  ok(
    sidebar.indexOf("Menu khusus") < sidebar.indexOf("kycMenu !== null"),
    "menu tahap KYC dirender tepat di bawah kotak Menu khusus",
  );
  ok(sidebar.includes("kycMenu"), "sidebar menerima menu tahap dari pemanggilnya");

  const dashboard = bacaSumber("pages/Dashboard.tsx");
  ada(dashboard, "tampilkanMenuTahapKyc(kyc.status)", "tampilnya menu diputuskan status KYC");
  ada(dashboard, "kycMenu={", "menu tahap dioper ke sidebar");
  ada(
    dashboard,
    "<KycSection tahapPilihan={tahapKyc} onPilihTahap={setTahapKyc} />",
    "pilihan tahap dibagi antara sidebar dan modul KYC",
  );
  ada(dashboard, "onPilih={pilihTahapKyc}", "menu sidebar memakai satu penangan pilih tahap");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kyc-views: ${passed} lulus`);
