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
 *  - kemajuan dilaporkan oleh SATU penghitung "Tahap X dari 3" + bilahnya, dan
 *    tidak ada hitungan langkah kedua ("2 dari 8", "0/3 langkah") di layar;
 *  - baris aksi tahap hanya punya SATU tombol utama (Lanjut di tahap 1–2,
 *    Ajukan verifikasi di tahap 3) plus "Kembali", dengan sisa wajib sebagai
 *    satu baris yang bisa diklik dan indikator "Tersimpan otomatis HH.mm";
 *  - daftar langkah kedua (di modul maupun sidebar) sudah tidak dirender;
 *  - riwayat pemeriksaan baru muncul setelah pengajuan keluar dari pengisian;
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
  KycBilahTahapLekat,
  KycDaftarAturanOtomatis,
  KycKeputusanAlert,
  KycMenuSidebar,
  KycPemeriksaanOtomatis,
  KycPetunjukFoto,
  KycRiwayatList,
  KycStatusHeader,
  KycStatusStrip,
  KycStepperTigaTahap,
  labelAktorKyc,
  menuTahapKyc,
  progresStageKyc,
  ringkasStatusStage,
  STAGE_KYC,
  stageKyc,
  stageUntukTahap,
  tahapBerikutStage,
  tahapSebelumStage,
  tahapStage,
  tahapUntukPilihStage,
  tampilkanMenuTahapKyc,
  tampilkanRiwayatKyc,
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
      tahapAktif="ktp"
      statusPerTahap={statusNetral()}
    />,
  );
  ada(html, LABEL_STATUS_KYC[status], `label status ${status} mengikuti lib/kycStatus`);
  ada(html, KETERANGAN_STATUS_KYC[status], `penjelasan status ${status} mengikuti lib/kycStatus`);
  ada(html, "Tahap 2 dari 3", `judul status ${status} memakai penghitung tunggal`);
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
      tahapAktif="persetujuan"
      statusPerTahap={statusNetral()}
    />,
  );
  ada(kurang, "NIK 16 angka", "kekurangan NIK tampil");
  ada(kurang, "Selfie dengan KTP", "kekurangan selfie tampil");
  ada(kurang, "2 hal sebelum bisa diajukan", "jumlah kekurangan dilaporkan");
  ada(kurang, "Tahap 1 dari 3", "penghitung tunggal menyebut posisi tahap");
  ok(
    !/\d+ dari \d+ tahap siap/.test(kurang) && !/\d+\/\d+ langkah/.test(kurang),
    "tidak ada hitungan langkah kedua di kartu status",
  );
  ada(
    kurang,
    'aria-label="Tahap verifikasi KYC: 0 dari 3 tahap selesai"',
    "bilah tahap melaporkan kemajuannya ke pembaca layar",
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
      tahapAktif="pendukung"
      statusPerTahap={statusLengkap()}
    />,
  );
  ada(lengkap, "Lengkap, siap diajukan.", "keadaan lengkap tampil");
  ada(lengkap, "Tahap 3 dari 3", "tahap terakhir disebut apa adanya");
  ada(lengkap, "3 dari 3 tahap selesai", "bilah tahap penuh setelah semua lengkap");
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
      tahapAktif="pendukung"
      statusPerTahap={statusLengkap()}
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
  ada(html, "oleh Anda", 'pelaku nasabah disebut "Anda", bukan alamat emailnya');
  ada(html, "oleh Sistem", "aktor sistem diterjemahkan, bukan kode mentahnya");
  ok(!html.includes("rani@pindai.test"), "email pelaku tidak pernah ditampilkan");
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
/** Semua langkah lengkap: dipakai menguji keadaan selesai & persen penuh. */
function statusLengkap(): Record<IdTahapKyc, StatusTahapKyc> {
  return Object.fromEntries(ID_TAHAP_KYC.map((id) => [id, "lengkap"])) as Record<
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
  ada(html, "Sedang diisi", "stage yang dibuka menyebut keadaannya");
  ada(html, "Belum diisi", "stage lain menyebut keadaannya tanpa angka langkah");
  ok(!/\d+\/\d+ langkah/.test(html), "bilah 3 tahap tidak lagi melaporkan hitungan langkah");
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
  ada(html, "Selesai", "stage lengkap diringkas jadi selesai");
  ok(!/\d+\/\d+ langkah/.test(html), "ringkasan stage tanpa hitungan langkah kedua");
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
  ok(!html.includes("Selesai"), "stage bermasalah tidak diklaim selesai");
  bersih(html, "bilah 3 stage dengan perbaikan");
}

// 9b. Memilih stage: stage yang sedang dibuka tidak memindahkan langkah.
{
  ok(
    tahapUntukPilihStage(1, "identitas") === null,
    "stage 1 yang sedang dibuka tidak melempar ke persetujuan",
  );
  ok(
    tahapUntukPilihStage(3, "pendukung") === null,
    "stage 3 yang sedang dibuka tidak melempar mundur ke alamat",
  );
  ok(tahapUntukPilihStage(3, "ktp") === "alamat", "stage lain dibuka dari langkah pertamanya");
  ok(tahapUntukPilihStage(2, "pendukung") === "ktp", "stage 2 dibuka dari foto KTP");
  ok(
    tahapUntukPilihStage(1, "pendukung") === "persetujuan",
    "stage 1 dibuka dari pintu persetujuan",
  );
}

// ===== 10. Satu penghitung, tanpa daftar langkah kedua =====
// Yang dijaga: tidak ada lagi deret langkah kedua di modul maupun sidebar, dan
// tidak ada hitungan per langkah — angka yang dibaca nasabah hanya "Tahap X
// dari 3". Pengaruh kemajuan dihitung fungsi murni di bawah, jadi penghitung dan
// bilahnya tidak bisa berbeda arti.
{
  const modul = bacaSumber("pages/dashboard/kyc-views.tsx");
  ok(!modul.includes("KycDaftarTahap"), "daftar langkah kedua sudah dihapus dari modul KYC");
  ok(!modul.includes("TAHAPAN_KYC.length"), 'tidak ada lagi hitungan "X dari 8" di modul KYC');
  ada(modul, "Sisa wajib: {sisaWajib} isian", "sisa isian wajib berdiri sebagai satu baris");
  ada(modul, "Tersimpan otomatis", "umpan balik simpan memakai indikator simpan otomatis");
  ada(modul, "AUTOSAVE_DIAM_MS", "isian disimpan sendiri setelah berhenti diketik");
  ada(modul, "Baca selengkapnya", "penjelasan persetujuan punya akordeon lengkapnya");
  ok(
    !modul.includes("Ringkasan singkat"),
    "ringkasan 3 poin menggantikan kotak ringkasan lama yang mengulang penjelasan",
  );
}
{
  // Fungsi ringkas kemajuan: satu sumber angka untuk penghitung & bilahnya.
  const status = statusNetral();
  const awal = progresStageKyc(status, "persetujuan");
  ok(awal.nomor === 1 && awal.lengkap === 0 && awal.persen === 0, "tahap 1 belum ada yang selesai");
  status.persetujuan = "lengkap";
  status.identitas = "lengkap";
  status.whatsapp = "lengkap";
  const satu = progresStageKyc(status, "ktp");
  ok(
    satu.nomor === 2 && satu.lengkap === 1 && satu.persen === 33,
    "stage 1 lengkap → tahap 2 dari 3, bilah 33 persen",
  );
  const semua = progresStageKyc(statusLengkap(), "pendukung");
  ok(semua.lengkap === 3 && semua.persen === 100, "tiga stage lengkap → bilah penuh");
}
{
  // Riwayat baru ditampilkan setelah pengajuan keluar dari pengisian.
  ok(!tampilkanRiwayatKyc("IN_PROGRESS") && !tampilkanRiwayatKyc("NOT_STARTED"), "riwayat disembunyikan selama masih diisi");
  for (const status of ["PENDING_REVIEW", "NEEDS_CORRECTION", "REJECTED", "VERIFIED", "REVERIFICATION_REQUIRED"] as const) {
    ok(tampilkanRiwayatKyc(status), `riwayat tampil pada status ${status}`);
  }
  ok(labelAktorKyc("nasabah") === "Anda", "pelaku nasabah dibaca sebagai Anda");
  ok(labelAktorKyc("admin") === "Petugas", "pelaku petugas dibaca sebagai Petugas");
  ok(labelAktorKyc("sistem") === "Sistem", "pelaku sistem dibaca sebagai Sistem");
}

// ===== 11. Baris aksi satu tahap: satu aksi utama, umpan balik di dekatnya =====
const aksiDasar = {
  busy: false,
  bolehKembali: true,
  tahapTerakhir: false,
  bolehLanjut: true,
  bolehAjukan: false,
  tampilkanAjukan: true,
  labelAjukan: "Ajukan peninjauan",
  sisaWajib: 3,
  judulTujuan: "Nomor WhatsApp",
  onSebelumnya: () => {},
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
  ada(html, "Lanjut", "aksi utama tahap 1–2 bernama Lanjut");
  ada(html, "Kembali", "navigasi mundur bernama Kembali");
  ada(html, "Sisa wajib: 3 isian", "sisa isian wajib selalu terlihat di atas tombol");
  ada(html, "buka Nomor WhatsApp", "baris sisa wajib menyebut tahap tujuannya");
  ok(!html.includes("Simpan progres"), "tidak ada tombol simpan manual");
  ok(!html.includes("Siap diajukan setelah"), "tidak ada tombol gerbang kedua");
  ok(
    !html.includes("Ajukan peninjauan"),
    "label ajukan tidak muncul selagi transisi itu belum sah",
  );
  ada(html, "h-11", "target sentuh baris aksi setinggi 44px, bukan 36px");
  ada(html, "Belum ada isian tersimpan", "keadaan simpan dinyatakan apa adanya");
  ada(html, 'role="status"', "umpan balik simpan diumumkan pembaca layar");
  ok(
    !html.includes("sticky") && !html.includes("fixed"),
    "baris aksi ikut alur halaman di akhir formulir, tidak melayang menutupi isian",
  );
  bersih(html, "baris aksi tahap lanjut");
}
{
  // Tahap terakhir + transisi sah: tombol utamanya mengajukan, bukan melanjutkan.
  const siap = {
    ...aksiDasar,
    tahapTerakhir: true,
    bolehAjukan: true,
    labelAjukan: "Kirim ulang pengajuan",
    sisaWajib: 0,
  };
  const html = renderToStaticMarkup(
    <KycBarisAksi {...siap} menyimpan={false} tersimpanPada={null} catatan={null} />,
  );
  ada(html, "Kirim ulang pengajuan", "tahap terakhir memakai label ajukan yang sah menurut status");
  ok(!html.includes("Lanjut"), "tahap terakhir tidak menawarkan lanjut");
  ok(!html.includes("Sisa wajib"), "tanpa sisa wajib barisnya tidak dirender");
  ok(
    (html.match(/bg-emerald-800/g) ?? []).length === 1,
    "tetap satu tombol pejal di tahap terakhir",
  );
  bersih(html, "baris aksi siap diajukan");
}
{
  // Aksi yang sedang berjalan dan keadaan simpan terbaca di baris yang sama.
  const html = renderToStaticMarkup(
    <KycBarisAksi
      {...aksiDasar}
      menyimpan
      tersimpanPada={1_700_000_000_000}
      catatan="Sedang menunggu peninjauan petugas."
    />,
  );
  ada(html, "Menyimpan…", "keadaan menyimpan terbaca di sebelah tombolnya");
  ada(html, "Sedang menunggu peninjauan petugas.", "keadaan status yang perlu dijelaskan ikut terbaca");
  bersih(html, "baris aksi saat menyimpan");
}
{
  // Waktu simpan otomatis dibaca sebagai jam:menit (HH.mm), bukan tanggal panjang.
  const html = renderToStaticMarkup(
    <KycBarisAksi {...aksiDasar} menyimpan={false} tersimpanPada={1_700_000_000_000} catatan={null} />,
  );
  ok(
    /Tersimpan otomatis \d{2}\.\d{2}/.test(html),
    "waktu simpan otomatis dibaca sebagai jam:menit",
  );
  ok(!html.includes("Menyimpan…"), "umpan balik simpan tidak ditinggalkan menyala");
  bersih(html, "baris aksi setelah autosave");
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
  ok(
    !html.includes("Selfie dengan KTP") && !html.includes("Informasi pendukung"),
    "tidak ada daftar langkah kedua di menu sidebar",
  );
  ok(!html.includes("lg:flex-row"), "tiga kartu tahap tetap menumpuk di kolom sempit");
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 1,
    "hanya stage aktif yang ditandai di menu sidebar",
  );
  bersih(html, "menu tahap sidebar");
}

// ===== 14b. Menu sidebar pada tahap 3: hanya bilah 3 tahap, tanpa daftar ulang =====
//
// Sidebar selebar 16rem hanya muat satu bentuk navigasi. Daftar langkah kedua di
// sana membuat nasabah menebak mana yang harus ditekan, jadi yang tersisa hanya
// bilah 3 tahap — dan itu pun harus menyebut tahap 3 sebagai tahap yang dibuka.
{
  const html = renderToStaticMarkup(
    <KycMenuSidebar
      aktif="darurat"
      statusPerTahap={statusNetral()}
      terkunci={false}
      onPilih={() => {}}
    />,
  ).replace(/&amp;/g, "&");
  ada(html, "Tahap 3: Alamat & Rekening", "tahap 3 ikut terbaca di sidebar");
  ok(
    !html.includes("Kontak darurat") && !html.includes("Informasi pendukung"),
    "langkah-langkah tahap 3 tidak diulang sebagai daftar kedua",
  );
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 1,
    "hanya stage aktif yang ditandai di menu sidebar",
  );
  bersih(html, "menu tahap sidebar pada tahap 3");
}

// ===== 15. Pemasangan: tepat di bawah menu peran/admin, dan terbagi state =====
{
  const sidebar = bacaSumber("pages/dashboard/dashboard-sidebar.tsx");
  ok(
    sidebar.indexOf("<MenuAdminNav />") < sidebar.indexOf("kycMenu !== null"),
    "menu tahap KYC dirender tepat di bawah menu peran/admin",
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

// 16. Tahap pembuka dikunci sekali, bukan dihitung ulang tiap render: kalau
// dihitung ulang, wizard melompat sendiri begitu tahap yang diisi jadi lengkap.
{
  const modul = bacaSumber("pages/dashboard/kyc-views.tsx");
  ada(modul, "tahapAwal.current === null", "tahap pembuka dihitung sekali lalu dikunci");
  ada(
    modul,
    "const tahapAktif = tahapPilihan ?? tahapAwal.current;",
    "tahap aktif memakai pilihan yang sudah terkunci",
  );
  ok(
    !modul.includes("const tahapAktif = tahapPilihan ?? tahapDisarankan("),
    "tahap aktif tidak lagi dihitung ulang dari isian live tiap render",
  );
}

// 17. Jalur perpindahan tahap: hanya lewat tindakan yang menyebut tujuannya.
{
  const modul = bacaSumber("pages/dashboard/kyc-views.tsx");
  ok(
    (modul.match(/setTahapLokal\(/g) ?? []).length === 1,
    "perpindahan tahap lewat satu pintu (`menuju`), bukan tersebar di banyak efek",
  );
  ada(modul, "const tujuan = tahapUntukPilihStage(", "bilah stage memakai aturan pilih stage");
  ada(
    modul,
    "stageUntukTahap(progres.tahapBerikutnya) === nomorStage",
    "pintasan rumpun isian kurang disembunyikan saat isian itu ada di tahap ini",
  );
  ada(modul, "bolehLanjut={!terkunci}", "tombol maju mati selama persetujuan belum tercatat");
}

// 18. SATU LAYAR PER TAHAP: seluruh langkah sebuah tahap dirender bersama, dan
// perpindahan lewat tombol utama melangkah satu TAHAP, bukan satu langkah.
{
  const modul = bacaSumber("pages/dashboard/kyc-views.tsx");
  // Tahap 1 memuat tiga langkah, jadi ketiganya harus dirender dari nomor
  // tahapnya — bukan dari langkah yang kebetulan menjadi pintu masuk.
  ada(modul, "{nomorStage === 1 && (", "langkah persetujuan dirender dari nomor tahap");
  ada(modul, "{nomorStage === 1 && !terkunci && (", "identitas & WhatsApp ikut satu layar");
  ok(
    (modul.match(/nomorStage === 1 && !terkunci && \(/g) ?? []).length === 2,
    "identitas dan nomor WhatsApp keduanya dirender di tahap 1",
  );
  ada(
    modul,
    '(["ktp", "selfie"] as const).map((slotDokumen) => (',
    "KTP dan selfie dirender bersama sebagai dua kotak unggah",
  );
  ada(modul, "{nomorStage === 2 &&", "tahap dokumen memakai nomor tahap, bukan langkah tunggal");
  ada(
    modul,
    "berkasKamera={kameraSlot === slotDokumen ? berkasKamera : null}",
    "hasil kamera hanya masuk ke slot dokumen yang kameranya sedang terbuka",
  );
  ok(
    (modul.match(/nomorStage === 3 && !terkunci && \(/g) ?? []).length === 3,
    "alamat, kontak darurat, dan pendukung tampil di tahap 3",
  );
  ok(
    !modul.includes('tahap.id === "identitas"') &&
      !modul.includes('tahap.id === "pendukung"') &&
      !modul.includes("TAHAPAN_KYC[indeks"),
    "tidak ada lagi cabang per langkah yang menghalangi isian satu tahap untuk tampil bersama",
  );
  ada(modul, "const nomorStage = tahapBesar.nomor;", "nomor tahap diturunkan dari satu hitungan");
  ada(modul, "onLanjut={() => void simpanDanLanjut()}", "tombol utama tetap satu pintu simpan");
  ok(
    !modul.includes("indeks"),
    "sisa penanda indeks langkah sudah tidak dipakai lagi",
  );
}

// 18b. Perpindahan antar-TAHAP: fungsi murni yang dipakai tombol Kembali/Lanjut.
{
  ok(tahapSebelumStage("persetujuan") === null, "tahap pertama tidak punya tempat mundur");
  ok(
    tahapSebelumStage("pendukung") === "ktp",
    "Kembali dari tahap 3 menuju langkah pertama tahap 2, bukan mengulang dari awal",
  );
  ok(
    tahapSebelumStage("alamat") === "ktp",
    "Kembali dari langkah mana pun di tahap 3 tetap menuju tahap 2",
  );
  ok(tahapBerikutStage("pendukung") === null, "tahap terakhir tidak menawarkan lanjut");
  ok(
    tahapBerikutStage("identitas") === "ktp",
    "Lanjut dari tahap 1 langsung ke langkah pertama tahap 2",
  );
  ok(
    tahapBerikutStage("selfie") === "alamat",
    "Lanjut dari tahap 2 melewati semua langkahnya, bukan satu langkah",
  );
  ok(tahapSebelumStage("ktp") === "persetujuan", "Kembali dari tahap 2 menuju pintu tahap 1");
  ok(stageKyc(2).judul === "Live KTP & Selfie", "judul tahap diambil dari satu sumber");
  ok(stageKyc(2).tahap.length === 2, "tahap 2 tetap berisi dua langkah");
}

// 18c. Ringkasan status satu tahap: satu arti untuk bilah sidebar, bilah lekat,
// dan lencana di kepala kartu.
{
  const status = statusNetral();
  ok(
    ringkasStatusStage(status, 2) === "belum",
    "tahap tanpa isian diringkas sebagai belum diisi",
  );
  status.ktp = "lengkap";
  ok(
    ringkasStatusStage(status, 2) === "belum",
    "satu langkah lengkap belum membuat seluruh tahap disebut selesai",
  );
  status.selfie = "lengkap";
  ok(ringkasStatusStage(status, 2) === "lengkap", "seluruh langkah lengkap berarti tahap selesai");
  status.selfie = "perlu-diperbaiki";
  ok(
    ringkasStatusStage(status, 2) === "perlu-diperbaiki",
    "permintaan perbaikan pada satu langkah menandai seluruh tahapnya",
  );
  status.selfie = "sebagian";
  ok(
    ringkasStatusStage(status, 2) === "belum",
    "tahap yang masih diisi belum diklaim selesai",
  );
}

// 18d. Bilah tahap lekat di ponsel: penghitung "Tahap X dari 3" tidak hilang saat
// isian panjang digulung, dan penghitung di kartu status tidak digandakan.
{
  const html = renderToStaticMarkup(
    <KycBilahTahapLekat
      aktif="alamat"
      statusPerTahap={statusNetral()}
      terkunci={false}
      onPilih={() => {}}
    />,
  );
  ada(html, "sticky top-14", "bilah tahap menempel tepat di bawah bar atas (h-14)");
  ada(html, "lg:hidden", "bilah ini hanya untuk ponsel; di lg tahapnya ada di sidebar");
  ada(html, "Tahap 3 dari 3", "penghitung tahap terbaca di bilah lekat");
  ada(html, "Alamat &amp; Rekening", "nama tahap yang sedang dibuka ikut terbaca");
  ada(
    html,
    'aria-label="Tahap verifikasi KYC: 0 dari 3 tahap selesai"',
    "bilah kemajuan melaporkan diri ke pembaca layar",
  );
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 1,
    "hanya satu tahap bertanda aktif di bilah lekat",
  );
  ok(!html.includes("Selesai"), "tahap kosong tidak diklaim selesai di bilah lekat");
  ada(html, "min-h-9", "tombol tahap cukup tinggi untuk ditekan ibu jari");
  bersih(html, "bilah tahap lekat");

  const penuh = renderToStaticMarkup(
    <KycBilahTahapLekat
      aktif="pendukung"
      statusPerTahap={statusLengkap()}
      terkunci={false}
      onPilih={() => {}}
    />,
  );
  ada(penuh, "3 dari 3 tahap selesai", "tiga tahap lengkap terbaca di bilah lekat");
  bersih(penuh, "bilah tahap lekat saat semua lengkap");

  const terkunci = renderToStaticMarkup(
    <KycBilahTahapLekat
      aktif="persetujuan"
      statusPerTahap={statusNetral()}
      terkunci
      onPilih={() => {}}
    />,
  );
  ok(
    (terkunci.match(/disabled=""/g) ?? []).length === 2,
    "tahap 2 & 3 tidak bisa dibuka sebelum persetujuan tercatat",
  );

  // Penghitung di kartu status disembunyikan di ponsel: kalau tidak, nasabah
  // membaca "Tahap X dari 3" dua kali dalam satu layar.
  const modul = bacaSumber("pages/dashboard/kyc-views.tsx");
  ada(
    modul,
    'className="mt-3 hidden flex-wrap items-center gap-x-3 gap-y-2 lg:flex"',
    "penghitung di kartu status disembunyikan di ponsel supaya tidak muncul dua kali",
  );
}

// 19. Aturan hook: semua hook dipasang SEBELUM cabang "sedang memuat". Efek
// yang ditulis setelah cabang itu membuat jumlah hook berbeda antara render
// belum-termuat dan render termuat, dan React melempar "Rendered more hooks
// than during the previous render" begitu data server tiba.
{
  const modul = bacaSumber("pages/dashboard/kyc-views.tsx");
  const mulai = modul.indexOf("export function KycSection(");
  const akhir = modul.indexOf("\n}\n", mulai);
  const badan = modul.slice(mulai, akhir === -1 ? undefined : akhir);
  const cabangMemuat = badan.indexOf("if (data === undefined)");
  ok(cabangMemuat > 0, "KycSection punya cabang \"sedang memuat\"");
  ok(
    !/\buse(?:State|Effect|Ref|Memo|Callback|Reducer)\s*\(/.test(
      badan.slice(Math.max(0, cabangMemuat)),
    ),
    "tidak ada hook yang dipasang setelah cabang \"sedang memuat\"",
  );
  ada(modul, "function AutosaveKyc(", "autosave menjadi komponen anak, bukan efek sesudah cabang memuat");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kyc-views: ${passed} lulus`);
