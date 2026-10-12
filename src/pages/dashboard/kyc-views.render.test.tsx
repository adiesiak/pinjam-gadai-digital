/**
 * Uji render bagian tampilan modul KYC di dashboard nasabah.
 * Run: bun src/pages/dashboard/kyc-views.render.test.tsx
 *
 * Bagian yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi yang
 * diuji di sini adalah bagian MURNI-nya: judul status, kotak keputusan petugas,
 * dan daftar riwayat. Yang dijaga:
 *
 *  - SETIAP dari tujuh status tampil dengan label & kalimat penjelasnya dari
 *    `lib/kycStatus.ts` — bukan label yang ditulis ulang di komponen;
 *  - VERIFIED secara eksplisit menyebut bukan persetujuan pinjaman/pencairan;
 *  - kekurangan isian terlihat sebagai daftar sebelum pengajuan bisa dikirim;
 *  - keputusan yang merugikan selalu menampilkan catatan petugas dan siapa yang
 *    memutuskan;
 *  - riwayat menampilkan waktu, aktor, alasan yang sudah diterjemahkan, dan
 *    tidak pernah memunculkan "undefined"/"NaN"/"[object Object]".
 */
import { renderToStaticMarkup } from "react-dom/server";import {
  KycDaftarTahap,
  KycKeputusanAlert,
  KycPemeriksaanOtomatis,
  KycRiwayatList,
  KycStatusHeader,
  KycStatusStrip,
  KycStepperTigaTahap,
  STAGE_KYC,
  stageUntukTahap,
  tahapStage,
  type RiwayatKycTampil,
} from "./kyc-views";
import { ID_TAHAP_KYC, type IdTahapKyc, type StatusTahapKyc } from "@/lib/kycTahapan";
import { VERSI_ATURAN_AUTO_KYC } from "@/lib/kycAutoApproval";
import { KETERANGAN_STATUS_KYC, KYC_STATUS, LABEL_STATUS_KYC, ringkasStatusKyc } from "@/lib/kycStatus";

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
      diperbaruiPada={1_700_000_000_000}
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
      diperbaruiPada={null}
      persen={29}
      selesai={2}
      total={7}
    />,
  );
  ada(kurang, "NIK 16 angka", "kekurangan NIK tampil");
  ada(kurang, "Selfie dengan KTP", "kekurangan selfie tampil");
  ada(kurang, "2 hal sebelum bisa diajukan", "jumlah kekurangan dilaporkan");
  ada(kurang, "2 dari 7 tahap siap", "progres tahap dilaporkan dengan angka nyata");
  ada(kurang, "Belum ada isian", "tanpa isian menjelaskan keadaannya");

  const lengkap = renderToStaticMarkup(
    <KycStatusHeader
      status="IN_PROGRESS"
      kekurangan={[]}
      lengkap
      diperbaruiPada={1_700_000_000_000}
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
      diperbaruiPada={1_700_000_000_000}
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
{
  const html = renderToStaticMarkup(<KycPemeriksaanOtomatis keputusan={keputusanMesin} />);
  ada(html, "Pemeriksaan otomatis terakhir", "kartu pemeriksaan otomatis tampil");
  ada(html, "belum mengubah status", "hasil yang tidak diterapkan ditandai jelas");
  ada(html, "Gagal", "pemeriksaan yang gagal ditandai");
  ada(html, "belum diverifikasi lewat kode OTP", "alasan dari mesin ditampilkan apa adanya");
  ada(html, VERSI_ATURAN_AUTO_KYC, "versi aturan mesin tampil agar bisa ditelusuri");
  ada(html, "Dukcapil", "batas yang tidak diklaim tetap disebut");
  bersih(html, "kartu pemeriksaan otomatis tidak diterapkan");
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
  ok(tahapStage(3).length === 2, "stage 3 memuat 2 langkah");

  const harapan: Record<IdTahapKyc, 1 | 2 | 3> = {
    persetujuan: 1,
    identitas: 1,
    whatsapp: 1,
    ktp: 2,
    selfie: 2,
    alamat: 3,
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
  ada(html, "Stage 1: Kontak &amp; OTP", "stage 1 berlabel sesuai ketentuan");
  ada(html, "Stage 2: Live KTP &amp; Selfie", "stage 2 berlabel sesuai ketentuan");
  ada(html, "Stage 3: Rekening &amp; Finansial", "stage 3 berlabel sesuai ketentuan");
  ok(
    (html.match(/aria-current="step"/g) ?? []).length === 1,
    "hanya satu stage bertanda aktif",
  );
  ada(html, "0/3 langkah siap", "stage 1 melaporkan hitungan langkah nyata");
  ok(!html.includes("Selesai"), "stage kosong tidak diklaim selesai");
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
  ada(html, "Stage 1: Kontak &amp; OTP", "stage 1 tetap tampil saat terkunci");
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
  bersih(html, "deret tahap satu stage");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kyc-views: ${passed} lulus`);
