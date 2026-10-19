/**
 * Kesehatan sistem — sinyal operasional yang BENAR-BENAR dapat diukur.
 *
 * Kenapa berkas ini ada: sebelumnya "kesehatan sistem" di panel admin hanyalah
 * kartu ringkasan ledger (`admin.ledgerSummary`). Itu menjawab "apakah jurnal
 * seimbang", bukan "apakah sistem sedang bermasalah hari ini". Sinyal yang
 * sebenarnya tersedia tetapi tidak pernah ditampilkan: pengiriman WhatsApp yang
 * gagal, lonjakan percobaan login gagal, antrean KYC yang menumpuk, pengaduan
 * yang belum ditangani, dan kesegaran audit trail.
 *
 * Prinsip yang dipegang (sama dengan modul BI):
 *  - Setiap angka menyebut SUMBERNYA dan JENDELA WAKTUNYA. Tidak ada "sehat"
 *    yang dikarang dari kartu kosong: bila belum ada data, jawabannya
 *    "belum ada data", bukan 0 hijau.
 *  - Tidak ada pengukuran latency/error-rate karena aplikasi ini tidak
 *    memiliki pencatat request terpusat — mengarang angka persentil akan
 *    menyesatkan operator. Yang tidak terukur TIDAK ditampilkan.
 *  - Ringkasan ledger sengaja tidak diulang di sini; kartunya sudah ada
 *    (`admin.ledgerSummary`) dan dua sumber kebenaran untuk saldo adalah
 *    kesalahan, bukan fitur.
 */
import { query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { susunPeringatan } from "./monitoring";
import { getConfig } from "./system";

/** Jendela "terakhir 24 jam" untuk sinyal laju. */
const SEHARI_MS = 24 * 60 * 60 * 1000;
/** Batas baris yang dibaca per tabel. */
const BATAS_BARIS = 5_000;
/** Panjang maksimum respons gateway yang ditampilkan sebagai diagnosis. */
const MAKS_RESPON = 160;

/** Status pengaduan yang masih menunggu tindakan petugas. */
const PENGADUAN_TERBUKA = ["baru", "ditinjau"];

export const kesehatanSistem = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const batas24Jam = sekarang - SEHARI_MS;

    const [waLogs, loginAttempts, adminAttempts, kyc, pengaduan, pengingat, audit, sesi, perangkat] =
      await Promise.all([
        ctx.db.query("waLogs").take(BATAS_BARIS),
        ctx.db.query("loginAttempts").take(BATAS_BARIS),
        ctx.db.query("adminLoginAttempts").take(BATAS_BARIS),
        ctx.db.query("kycProfil").take(BATAS_BARIS),
        ctx.db.query("pengaduanNasabah").take(BATAS_BARIS),
        ctx.db.query("pengingat").take(BATAS_BARIS),
        ctx.db.query("auditLog").take(BATAS_BARIS),
        ctx.db.query("sessions").take(BATAS_BARIS),
        ctx.db.query("perangkat").take(BATAS_BARIS),
      ]);

    const cfg = await getConfig(ctx);
    const { peringatan, denyut } = await susunPeringatan(ctx);

    // ===== WhatsApp =====
    const waTerbaru = waLogs.filter((w) => w.waktu >= batas24Jam);
    const waGagal = waTerbaru.filter((w) => w.status === "gagal");
    const waTerakhir = waLogs.reduce<(typeof waLogs)[number] | null>(
      (terbaru, w) => (terbaru === null || w.waktu > terbaru.waktu ? w : terbaru),
      null,
    );

    // ===== Login =====
    const loginGagal = loginAttempts.filter((l) => !l.berhasil && l.waktu >= batas24Jam);
    const adminGagal = adminAttempts.filter((a) => a.waktu >= batas24Jam);

    // ===== Antrean kerja =====
    const kycMenungguReview = kyc.filter((k) => k.status === "PENDING_REVIEW").length;
    const kycPerluPerbaikan = kyc.filter((k) => k.status === "NEEDS_CORRECTION").length;
    const pengaduanTerbuka = pengaduan.filter((p) => PENGADUAN_TERBUKA.includes(p.status));
    const pengaduanTanpaPetugas = pengaduanTerbuka.filter((p) => p.petugasLabel === undefined).length;
    const pengingat24Jam = pengingat.filter((p) => p.waktu >= batas24Jam).length;

    // ===== Audit trail =====
    const audit24Jam = audit.filter((a) => a.waktu >= batas24Jam).length;
    const auditTerakhir = audit.reduce<number | null>(
      (terbaru, a) => (terbaru === null || a.waktu > terbaru ? a.waktu : terbaru),
      null,
    );

    // ===== Sesi & perangkat =====
    const sesiAktif = sesi.filter((s) => s.waktuBerakhir === undefined).length;
    const perangkatAktif = perangkat.filter((p) => p.terakhirDilihat >= batas24Jam).length;

    return {
      dihitungPada: sekarang,
      jendela: { mulai: batas24Jam, selesai: sekarang, label: "24 jam terakhir" },
      /** Masalah yang layak ditindaklanjuti, terurut kritis lebih dulu. */
      peringatan,
      /** Denyut cron terakhir — kosong berarti job belum pernah selesai. */
      denyut,
      konfigurasi: {
        versi: cfg.versi,
        killSwitch: cfg.killSwitch,
        maintenanceMode: cfg.maintenanceMode,
      },
      sinyal: [
        {
          kunci: "wa",
          judul: "Pengiriman WhatsApp gagal",
          nilai: waGagal.length,
          ambang: "perlu diperiksa bila > 0",
          sumber: "waLogs (status gagal, 24 jam)",
          keterangan: `${
            waGagal.length === 0 && waTerbaru.length === 0
              ? "Belum ada pengiriman WhatsApp dalam 24 jam."
              : `${waGagal.length} gagal dari ${waTerbaru.length} percobaan.`
          }${
            waTerakhir === null
              ? ""
              : ` Pengiriman terakhir: ${new Date(waTerakhir.waktu).toISOString()} (${waTerakhir.status}).`
          }`,
          contoh: waGagal[0]?.respon?.slice(0, MAKS_RESPON) ?? null,
        },
        {
          kunci: "login",
          judul: "Percobaan login gagal (nasabah)",
          nilai: loginGagal.length,
          ambang: "perlu diperiksa bila mencurigakan",
          sumber: "loginAttempts (berhasil=false, 24 jam)",
          keterangan: `${loginGagal.length} percobaan gagal dalam 24 jam.`,
          contoh: null,
        },
        {
          kunci: "login-admin",
          judul: "Percobaan kata sandi admin",
          nilai: adminGagal.length,
          ambang: "pembatas: 5 / 15 menit per email",
          sumber: "adminLoginAttempts (24 jam)",
          keterangan: `${adminGagal.length} percobaan kata sandi admin dalam 24 jam.`,
          contoh: null,
        },
        {
          kunci: "kyc",
          judul: "Antrean KYC menunggu peninjauan",
          nilai: kycMenungguReview,
          ambang: "antrean kerja petugas",
          sumber: "kycProfil (status PENDING_REVIEW)",
          keterangan: `${kycMenungguReview} menunggu peninjauan · ${kycPerluPerbaikan} menunggu perbaikan nasabah.`,
          contoh: null,
        },
        {
          kunci: "pengaduan",
          judul: "Pengaduan nasabah terbuka",
          nilai: pengaduanTerbuka.length,
          ambang: "perlu ditangani petugas",
          sumber: "pengaduanNasabah (status baru/ditinjau)",
          keterangan: `${pengaduanTerbuka.length} terbuka · ${pengaduanTanpaPetugas} belum punya penanggung jawab.`,
          contoh: null,
        },
        {
          kunci: "pengingat",
          judul: "Pengingat jatuh tempo dibuat (24 jam)",
          nilai: pengingat24Jam,
          ambang: "0 bisa berarti cron tidak jalan",
          sumber: "pengingat (waktu, 24 jam)",
          keterangan:
            pengingat24Jam === 0
              ? "Tidak ada pengingat baru dalam 24 jam — periksa apakah memang tidak ada tagihan jatuh tempo."
              : `${pengingat24Jam} pengingat tercatat dalam 24 jam terakhir.`,
          contoh: null,
        },
        {
          kunci: "audit",
          judul: "Entri audit trail (24 jam)",
          nilai: audit24Jam,
          ambang: "0 pada hari kerja patut dicurigai",
          sumber: "auditLog (waktu, 24 jam)",
          keterangan:
            auditTerakhir === null
              ? "Belum ada entri audit sama sekali."
              : `${audit24Jam} entri dalam 24 jam · entri terakhir ${new Date(auditTerakhir).toISOString()}.`,
          contoh: null,
        },
        {
          kunci: "sesi",
          judul: "Sesi aktif (semua pengguna)",
          nilai: sesiAktif,
          ambang: "informatif",
          sumber: "sessions (waktuBerakhir kosong)",
          keterangan: `${sesiAktif} sesi belum ditutup.`,
          contoh: null,
        },
        {
          kunci: "perangkat",
          judul: "Perangkat native aktif (24 jam)",
          nilai: perangkatAktif,
          ambang: "informatif",
          sumber: "perangkat (terakhirDilihat, 24 jam)",
          keterangan: `${perangkatAktif} dari ${perangkat.length} perangkat terdaftar masih mengirim denyut dalam 24 jam.`,
          contoh: null,
        },
      ],
      /**
       * Sinyal yang sengaja TIDAK diukur dan alasannya. Ditampilkan supaya
       * operator tidak menyimpulkan "metrik ini sehat" dari ketidakhadirannya.
       */
      tidakTerukur: [
        {
          judul: "Latency & error rate HTTP",
          alasan:
            "Aplikasi tidak memiliki pencatat request terpusat; angka persentil akan dikarang, bukan diukur.",
        },
        {
          judul: "Kesehatan basis data (p95 query, storage)",
          alasan: "Metrik internal Convex tidak tersedia lewat API fungsi.",
        },
        {
          judul: "Status gateway WhatsApp",
          alasan:
            "Hanya hasil kirim yang tersimpan (waLogs). Status layanan pihak ketiga tidak dipantau dari sini.",
        },
      ],
    };
  },
});
