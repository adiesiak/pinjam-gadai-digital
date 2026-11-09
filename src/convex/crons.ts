import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron harian PINDAI:
 * - UTC 00:00 — tulis pengingat jatuh tempo (append-only, idempoten per hari)
 *   untuk semua pinjaman berstatus Didanai: H-3, hari jatuh tempo, dan
 *   keterlambatan.
 * - UTC 17:30 (00:30 WIB) — retensi jejak lokasi: hapus titik lebih tua dari
 *   LOKASI_RETENSI.jejakHari (90 hari), kecuali titik milik pinjaman yang
 *   masih berjalan (ditahan sampai 400 hari sebagai bukti audit).
 * - UTC 17:40 & 17:50 (00:40 & 00:50 WIB) — retensi isi pesan WhatsApp dan
 *   jejak audit, memakai ambang yang diatur admin di Pengaturan Sistem.
 * - UTC 18:00 — retensi kunci idempotensi: buang kunci lebih tua dari 7 hari
 *   (jauh melewati jendela retry jaringan mana pun).
 * - UTC 18:15 — retensi jejak gerbang pengiriman: buang baris pembatas laju
 *   yang lebih tua dari 7 hari (jejak `auditLog` pelanggarannya tetap ada).
 * - UTC 18:30 (01:30 WIB) — backup KYC & pinjaman ke Google Drive: manifest
 *   terenkripsi harian dan dokumen baru yang belum ada di folder Drive.
 * - UTC 17:05 (00:05 WIB) — rekonsiliasi saldo PPOB: bandingkan saldo provider
 *   dengan saldo buku sejak pemeriksaan terakhir; selisih di atas ambang
 *   dikabarkan ke admin lewat WhatsApp.
 * - TIAP JAM (menit 20): tutup pratinjau Super Admin yang kehabisan waktu,
 *   cabut sesinya, dan pulihkan status lokasi nasabah.
 * - TIAP JAM: pengingat WhatsApp jatuh tempo & keterlambatan. Jenis
 *   yang berhak berangkat hari ini diputuskan `lib/templatePesanWa`, dan hanya
 *   antara 08.00-20.00 WIB; di luar itu penjadwal berhenti tanpa mengirim.
 * - UTC 01:00 (08.00 WIB) — pengingat siklus pendana ke nomor akun pendana
 *   sendiri pada H-7/H-3/H-1/H0 dan masa tenggang maksimal 7 hari. Satu pesan
 *   per pendana per hari; tidak ada nomor yang ditanam di kode.
 */
const crons = cronJobs();

crons.daily(
  "daily-due-reminders",
  { hourUTC: 0, minuteUTC: 0 },
  internal.loans.generateDueReminders,
);

// Peringatan kas: 07.30 WIB, sebelum jam kerja. Hanya membaca proyeksi yang
// sama dengan panel Kalender Kas; pesan WhatsApp dikirim bila admin mengisi
// nomor dan saldo kas masih segar.
crons.daily(
  "peringatan-kas-harian",
  { hourUTC: 0, minuteUTC: 30 },
  internal.kalenderKas.jalankanPeringatanKas,
  {},
);

// Pengingat WhatsApp tiap jam. Jendela kirim 08.00-20.00 WIB TIDAK diatur di
// sini melainkan di `lib/templatePesanWa.dalamJamKirim`: penjadwal yang berjalan
// tiap jam membuat satu aturan yang sama berlaku untuk jam berapa pun, dan
// pemanggilan di luar jendela berhenti tanpa menulis apa pun ke log.
crons.hourly(
  "pengingat-jatuh-tempo-wa",
  { minuteUTC: 0 },
  internal.whatsapp.jalankanPengingatJatuhTempo,
);

// Pengingat ANGSURAN — H-3, hari-H, dan H+1 per tagihan, bukan hanya jatuh
// tempo akhir tenor. Jendela 08.00-20.00 WIB diperiksa di action; baris
// pengingat idempoten per angsuran/hari, jadi jalan tiap jam tidak menggandakan.
crons.hourly(
  "pengingat-angsuran-wa",
  { minuteUTC: 5 },
  internal.angsuranPengingat.jalankanPengingatAngsuran,
);

// Pengingat voucher H-3 — sekali sehari pagi WIB. Voucher yang hampir hangus
// tidak punya jalur penagihan lain, jadi tanpanya hadiah apresiasi/referral
// hangus tanpa pernah diketahui pemiliknya. Idempoten per voucher.
crons.daily(
  "pengingat-voucher-h3",
  { hourUTC: 1, minuteUTC: 0 },
  internal.pengingatVoucher.jalankanPengingatVoucher,
);

// Pengingat siklus pendana — 08.00 WIB, setelah gateway dan jam kirim siap.
// Tanggal siklus berasal dari `didanaiPada`, bukan tenor pinjaman peminjam.
crons.daily(
  "pengingat-siklus-pendana",
  { hourUTC: 1, minuteUTC: 0 },
  internal.pengingatPendana.jalankanPengingatPendana,
  {},
);

crons.daily(
  "bersihkan-kunci-idempotensi",
  { hourUTC: 18, minuteUTC: 0 },
  internal.idempotensi.bersihkanKunciLama,
  {},
);

crons.daily(
  "bersihkan-jejak-gerbang",
  { hourUTC: 18, minuteUTC: 15 },
  internal.gerbangKirim.bersihkanJejakGerbang,
  {},
);

// Salinan KYC & pinjaman ke Google Drive. Action tidak menulis apa pun bila
// kredensial belum diisi, sehingga deployment pengembangan tidak berisik.
crons.daily(
  "backup-google-drive",
  { hourUTC: 18, minuteUTC: 30 },
  internal.backupDrive.jalankan,
  { pemicu: "cron" },
);

crons.daily(
  "retensi-lokasi-jejak",
  { hourUTC: 17, minuteUTC: 30 },
  internal.tracking.bersihkanLokasiLama,
  // Argumen kosong = pakai kebijakan LOKASI_RETENSI (satu sumber di lib).
  {},
);

// Retensi data pribadi: isi pesan WhatsApp dan jejak audit. Ambangnya diatur
// admin di Pengaturan Sistem (`retensiLogWaHari`, `retensiAuditHari`).
crons.daily(
  "retensi-log-wa",
  { hourUTC: 17, minuteUTC: 40 },
  internal.retensi.bersihkanLogWhatsapp,
  {},
);

crons.daily(
  "retensi-audit",
  { hourUTC: 17, minuteUTC: 50 },
  internal.retensi.bersihkanAudit,
  {},
);

// Pratinjau Super Admin yang ditinggal berhenti berlaku setelah dua jam, tetapi
// tanpa penutup otomatis sesinya tetap tersimpan dan status lokasi nasabah tidak
// sempat dipulihkan. Tiap jam: tutup yang kedaluwarsa, cabut sesinya, pulihkan
// lokasi, lalu buang snapshot `lokasiSebelum` yang sudah tidak dibutuhkan.
crons.hourly(
  "tutup-pratinjau-kedaluwarsa",
  { minuteUTC: 20 },
  internal.pratinjau.tutupPratinjauKedaluwarsa,
  {},
);

// Rekonsiliasi saldo PPOB sebelum jam kerja: saldo provider kemarin malam
// dibandingkan dengan catatan deposit dan modal yang sudah terkirim.
crons.daily(
  "ppob-rekonsiliasi-saldo",
  { hourUTC: 17, minuteUTC: 5 },
  internal.ppobH2h.rekonsiliasiHarian,
  {},
);

// PPOB publik: pesanan yang tertahan "diproses" diperiksa ulang ke server pulsa
// dengan ref_id yang sama. Sepuluh menit cukup longgar untuk provider yang
// lambat, tetapi tetap jauh di bawah waktu tunggu pembeli.
crons.interval(
  "ppob-cek-pesanan-tertahan",
  { minutes: 10 },
  internal.ppobH2h.cekPesananTertahan,
  {},
);

// Pemeriksa kesehatan sistem: ledger tidak seimbang, gateway WhatsApp gagal,
// dan cron yang berhenti berdenyut. Menulis audit hanya saat ada masalah kritis.
crons.interval(
  "pemeriksaan-sistem",
  // Enam jam: pemeriksaan membaca seluruh ledger, jadi tidak dijalankan tiap
  // menit. Denyut cron yang berhenti tetap terdeteksi pada putaran berikutnya.
  { hours: 6 },
  internal.monitoring.periksaSistem,
  {},
);

export default crons;
