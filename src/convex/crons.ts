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
 * - UTC 18:00 — retensi kunci idempotensi: buang kunci lebih tua dari 7 hari
 *   (jauh melewati jendela retry jaringan mana pun).
 * - UTC 18:15 — retensi jejak gerbang pengiriman: buang baris pembatas laju
 *   yang lebih tua dari 7 hari (jejak `auditLog` pelanggarannya tetap ada).
 * - TIAP JAM (menit 20): tutup pratinjau Super Admin yang kehabisan waktu,
 *   cabut sesinya, dan pulihkan status lokasi nasabah.
 * - TIAP JAM: pengingat WhatsApp jatuh tempo & keterlambatan. Jenis
 *   yang berhak berangkat hari ini diputuskan `lib/templatePesanWa`, dan hanya
 *   antara 08.00-20.00 WIB; di luar itu penjadwal berhenti tanpa mengirim.
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

crons.daily(
  "retensi-lokasi-jejak",
  { hourUTC: 17, minuteUTC: 30 },
  internal.tracking.bersihkanLokasiLama,
  // Argumen kosong = pakai kebijakan LOKASI_RETENSI (satu sumber di lib).
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
