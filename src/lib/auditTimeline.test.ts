/** Run: bun src/lib/auditTimeline.test.ts */
import {
  keCsvAudit,
  kutipCsv,
  labelAksi,
  nadaAksi,
  namaBerkasAudit,
  KOLOM_CSV_AUDIT,
} from "./auditTimeline";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ===== nadaAksi: kritis menang atas pending =====
eq(nadaAksi("loan_delete"), "kritis", "hapus pinjaman kritis");
eq(nadaAksi("pawn_delete"), "kritis", "hapus gadai kritis");
eq(nadaAksi("kill_switch"), "kritis", "kill switch kritis");
eq(nadaAksi("pinjaman_tolak"), "kritis", "penolakan kritis");
eq(nadaAksi("nasabah_bekukan"), "kritis", "pembekuan kritis");
eq(nadaAksi("LOGIN_GAGAL"), "pending", "nama aksi huruf besar tetap dikenali");
eq(nadaAksi("kyc_ajukan"), "pending", "pengajuan menunggu");
eq(nadaAksi("kirim_otp"), "pending", "pengiriman OTP menunggu");
eq(nadaAksi("verifikasi_kyc"), "sukses", "verifikasi sukses");
eq(nadaAksi("ubah_plafon"), "sukses", "ubah plafon sukses");
eq(nadaAksi("set_bunga"), "sukses", "set bunga sukses");
eq(nadaAksi(""), "sukses", "aksi kosong dianggap sukses, bukan kritis");

// ===== labelAksi =====
eq(labelAksi("ubah_plafon"), "Ubah plafon", "garis bawah jadi spasi");
eq(labelAksi("loan-delete"), "Loan delete", "tanda hubung jadi spasi");
eq(labelAksi("backup"), "Backup", "huruf besar di awal");
eq(labelAksi(""), "", "aksi kosong tetap kosong");

// ===== kutipCsv =====
eq(kutipCsv("biasa"), "biasa", "teks biasa tidak dikutip");
eq(kutipCsv("ada,koma"), '"ada,koma"', "koma memicu tanda kutip");
eq(kutipCsv('kata "kutip"'), '"kata ""kutip"""', "kutip digandakan");
eq(kutipCsv("baris\nbaru"), '"baris\nbaru"', "baris baru memicu tanda kutip");
eq(kutipCsv(null), "", "null menjadi kolom kosong");
eq(kutipCsv(undefined), "", "undefined menjadi kolom kosong");

// ===== keCsvAudit =====
const waktu = Date.UTC(2026, 9, 11, 4, 30, 0);
const csv = keCsvAudit([
  {
    waktu,
    aktorLabel: "admin@pindai.id",
    aksi: "loan_delete",
    target: "LN-2026,001",
    detail: 'alasan "uji"',
  },
  { waktu, aktorLabel: "operator", aksi: "ubah_plafon", target: null, detail: null },
]);
const baris = csv.split("\r\n");
eq(baris[0], KOLOM_CSV_AUDIT.join(","), "baris kepala memakai kolom tetap");
eq(
  baris[1],
  `2026-10-11T04:30:00.000Z,admin@pindai.id,loan_delete,kritis,"LN-2026,001","alasan ""uji"""`,
  "baris pertama lolos RFC 4180",
);
eq(
  baris[2],
  "2026-10-11T04:30:00.000Z,operator,ubah_plafon,sukses,,",
  "kolom kosong tetap punya pemisah",
);
eq(baris.length, 3, "satu baris kepala + satu baris per catatan");
eq(keCsvAudit([]), KOLOM_CSV_AUDIT.join(","), "tanpa data hanya kepala");

// ===== namaBerkasAudit =====
eq(namaBerkasAudit(waktu), "audit-trail-pindai-2026-10-11.csv", "nama berkas memuat tanggal");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes audit timeline gagal`);
}
console.log(`auditTimeline: ${passed} lulus`);
