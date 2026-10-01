import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

/**
 * Pinjam Gadai Digital
 *
 * STRICT TERMINOLOGY (Rule 2):
 * - "Pendana"  — pihak yang menyediakan dana (dilarang: investor)
 * - "Peminjam" — pihak yang mengajukan pinjaman/gadai
 * - "Pendanaan"/"Alokasi Dana" — aktivitas penyaluran dana (dilarang: investasi)
 * - "Bunga"/"Imbal Hasil" — hak finansial Pendana (dilarang: ROI/return)
 *
 * Rule 3: money is integer rupiah (never float). See src/lib/money.ts.
 * Rule 5.1: ledger_entries is append-only — never update or delete.
 */

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  /** Peminjam — borrower. */
  PEMINJAM: "peminjam",
  /** Pendana — fund provider (marketplace pendanaan). */
  PENDANA: "pendana",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.PEMINJAM),
  v.literal(ROLES.PENDANA),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const loanStatusValidator = v.union(
  v.literal("diajukan"),
  v.literal("sedang_direview"),
  v.literal("disetujui"),
  v.literal("ditolak"),
  // Pinjaman yang telah didanai penuh oleh Pendana (dana bersih telah dicairkan).
  v.literal("didanai"),
  // Kewajiban 130% telah dibayar penuh oleh Peminjam.
  v.literal("lunas"),
);
export type LoanStatusValue = Infer<typeof loanStatusValidator>;

export const pawnStatusValidator = v.union(
  v.literal("diajukan"),
  v.literal("sedang_dinilai"),
  v.literal("disetujui"),
  v.literal("ditolak"),
  /** Gadai disetujui + dana cair; menunggu pelunasan sebelum barang dilepas. */
  v.literal("aktif"),
  /** Nasabah mengajukan pelepasan setelah pelunasan. */
  v.literal("menunggu_pelepasan"),
  /** Barang telah dikembalikan ke nasabah. */
  v.literal("lunas_dilepas"),
);
export type PawnStatusValue = Infer<typeof pawnStatusValidator>;

/**
 * Status pengajuan Kredit Barang (Skema C) — elektronik/barang marketplace.
 * Alur: diajukan → sedang_ditinjau → disetujui | ditolak; "didanai"
 * ditetapkan otomatis oleh sistem saat pendanaan Pendana terpenuhi penuh.
 */
export const kreditStatusValidator = v.union(
  v.literal("diajukan"),
  v.literal("sedang_ditinjau"),
  v.literal("disetujui"),
  v.literal("ditolak"),
  v.literal("didanai"),
  // Seluruh cicilan (pokok + Imbal Hasil) lunas — posisi Pendana ditutup.
  v.literal("lunas"),
);
export type KreditStatusValue = Infer<typeof kreditStatusValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      /** Plafon pinjaman tunai khusus pengguna ini (rupiah bulat) — diatur admin. */
      plafonPinjaman: v.optional(v.number()),
      /** Penanda warisan: waktu kenaikan plafon pertama; bukan sumber kelayakan saat ini. */
      plafonPinjamanNaikPada: v.optional(v.number()),
      /** Kode pseudonim acak yang stabil; tidak berasal dari data identitas. */
      kodePeminjam: v.optional(v.string()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_kodePeminjam", ["kodePeminjam"]),

    /**
     * Aplikasi pinjaman tunai Peminjam.
     * Semua nilai uang dalam rupiah bulat (integer). Tidak ada kolom duplikat
     * untuk biaya — biaya selalu diturunkan dari `pokokPinjaman` via
     * quoteLoan() agar tidak pernah ada dua sumber kebenaran.
     */
    loans: defineTable({
      /** Pemilik aplikasi (Peminjam). */
      userId: v.id("users"),
      /** Pokok Pinjaman — rupiah bulat. */
      pokokPinjaman: v.number(),
      /** Keperluan pembiayaan. */
      tujuan: v.string(),
      /** Narasi singkat Peminjam untuk reviewer. */
      catatanPeminjam: v.optional(v.string()),
      /** Nama lengkap sesuai KTP. */
      namaLengkap: v.string(),
      /** Nama bank/e-wallet tujuan pencairan (opsional untuk data lama). */
      namaBank: v.optional(v.string()),
      /** Nomor rekening/akun tujuan dana bersih (95%). */
      nomorRekening: v.string(),
      status: loanStatusValidator,
      /** Catatan keputusan reviewer (wajib saat ditolak). */
      catatanReview: v.optional(v.string()),
      /** Nomor referensi manusiawi. */
      nomorReferensi: v.string(),
      /** Tenor pinjaman dalam hari (30/60/90) — dipilih saat pengajuan. */
      tenorHari: v.number(),
      /**
       * Tenor bulanan skema bulanan (1/3/6 bln: DP 0%, layanan 3%, bunga
       * 10/8/7,5%/bln — lib/bulanan.ts) untuk pinjaman DI LUAR plafon 1 jt /
       * 30 hari. Kosong = pinjaman memakai skema harian quoteLoan().
       */
      tenorBulan: v.optional(v.number()),
      /** Terisi saat pinjaman didanai penuh dan dana bersih dicairkan. */
      didanaiPada: v.optional(v.number()),
      /** Terisi saat kewajiban 130% (+ denda bila terlambat) dibayar penuh. */
      lunasPada: v.optional(v.number()),
      /** Denda keterlambatan rupiah bulat yang dibayar saat pelunasan. */
      dendaTerlambat: v.optional(v.number()),
      // ===== KYC wajib saat pengajuan (lihat verifyKyc di lib/kyc.ts) =====
      /** NIK 16 digit sesuai KTP. */
      nik: v.optional(v.string()),
      /** Nomor WhatsApp aktif untuk pengingat penagihan. */
      nomorWhatsApp: v.optional(v.string()),
      /** Penghasilan per bulan — rupiah bulat. */
      penghasilanBulanan: v.optional(v.number()),
      /** Sumber penghasilan (gaji, usaha, dll). */
      sumberPenghasilan: v.optional(v.string()),
      /** Referensi file di Convex storage. */
      dokKtpId: v.optional(v.id("_storage")),
      dokSelfieKtpId: v.optional(v.id("_storage")),
      dokSlipGajiId: v.optional(v.id("_storage")),
      /** Tanda tangan elektronik Peminjam (data URL PNG dari canvas). */
      tandaTanganPeminjam: v.optional(v.string()),
      /** Waktu tanda tangan elektronik Peminjam. */
      tandaTanganPada: v.optional(v.number()),
      /** Waktu Peminjam menyetujui syarat dan ketentuan akad. */
      persetujuanSyaratPada: v.optional(v.number()),
      /** Versi syarat dan ketentuan yang disetujui. */
      persetujuanSyaratVersi: v.optional(v.string()),
      /** Lokasi real (GPS) saat pengajuan dikirim — wajib ada. */
      lokasiAjukan: v.optional(
        v.object({
          lat: v.number(),
          lng: v.number(),
          /** Akurasi GPS dalam meter. */
          akurasi: v.number(),
          waktu: v.number(),
        }),
      ),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    /**
     * Konfigurasi API WhatsApp — hanya bisa dibaca/diubah admin.
     * Gateway generik berbasis token: admin menempel endpoint & template
     * penyedia apa pun (Fonnte, Wablas, Meta Cloud API, dll).
     */
    waSettings: defineTable({
      /** Selalu "global" — hanya ada satu baris. */
      slot: v.string(),
      /** Endpoint kirim pesan, mis. https://api.fonnte.com/send */
      apiUrl: v.optional(v.string()),
      /** Nama header auth, mis. Authorization atau x-api-key. */
      authHeader: v.optional(v.string()),
      /** Prefix nilai header, mis. "Bearer " atau kosong. */
      authPrefix: v.optional(v.string()),
      /** Nama field nomor tujuan di body JSON. */
      fieldNomor: v.optional(v.string()),
      /** Nama field isi pesan di body JSON. */
      fieldPesan: v.optional(v.string()),
      /** Flag aktif — matikan tanpa hapus konfigurasi. */
      aktif: v.optional(v.boolean()),
      /** Template pesan pengingat — pakai placeholder {nama} {ref} {jumlah} {tanggal} {sisa} {denda}. */
      templatePengingat: v.optional(v.string()),
      /**
       * Template pesan peringatan lokasi dicurigai — placeholder {nama} dan
       * {ref}. Dikirim otomatis (maks 1×/24 jam per nasabah) saat titik
       * lokasinya ditandai, dan tidak pernah menagih uang.
       */
      templateLokasi: v.optional(v.string()),
      diperbaruiPada: v.optional(v.number()),
    }).index("by_slot", ["slot"]),

    /**
     * Log pengiriman WhatsApp — append-only, untuk audit penagihan.
     * Isi pesan disimpan persis seperti terkirim (placeholder sudah diganti).
     */
    waLogs: defineTable({
      loanId: v.optional(v.id("loans")),
      /** Nomor tujuan (dipotong untuk privasi di UI admin). */
      nomorTujuan: v.string(),
      /** "pengingat" | "tes" — bisa diperluas. */
      jenis: v.string(),
      isiPesan: v.string(),
      /** "terkirim" | "gagal" | "dinonaktifkan". */
      status: v.string(),
      /** Respon/error dari gateway untuk diagnosis. */
      respon: v.optional(v.string()),
      /** Admin yang memicu pengiriman. */
      olehUserId: v.optional(v.id("users")),
      waktu: v.number(),
    }).index("by_loan", ["loanId"]),

    /**
     * Jejak lokasi berkelanjutan Peminjam (opt-in, dengan persetujuan).
     * Satu baris per titik GPS yang dikirim device secara batch.
     */
    /**
     * Jejak titik GPS berkala. Disimpan append-only, lalu dibersihkan job
     * retensi harian (LOKASI_RETENSI: 90 hari biasa, 400 hari untuk titik
     * yang terikat pinjaman belum selesai).
     */
    lokasiJejak: defineTable({
      userId: v.id("users"),
      loanId: v.optional(v.id("loans")),
      lat: v.number(),
      lng: v.number(),
      /** Akurasi GPS dalam meter. */
      akurasi: v.number(),
      waktu: v.number(),
      /**
       * Tanda kecurigaan lokasi palsu yang TETAP diterima (mis. koordinat
       * identik berulang) — titik yang ditolak tidak pernah disimpan.
       */
      tanda: v.optional(v.array(v.string())),
      /** Perangkat melaporkan titik dari mock location. */
      mock: v.optional(v.boolean()),
    })
      .index("by_user", ["userId"])
      .index("by_loan", ["loanId"])
      // Dipakai job retensi (crons.ts) untuk mengambil titik tertua lebih dulu.
      .index("by_waktu", ["waktu"]),

    /**
     * Proteksi otentikasi (2FA TOTP admin & OTP WA Pendana) — satu baris per
     * pengguna. Secret TOTP disimpan terpisah dari profil agar rotasi mudah.
     */
    mfaSettings: defineTable({
      userId: v.id("users"),
      /** Secret TOTP (Base32) — non-null berarti 2FA sudah diaktifkan. */
      totpSecret: v.optional(v.string()),
      /** Terisi bila setup belum dikonfirmasi dengan kode pertama. */
      totpPendingSecret: v.optional(v.string()),
      /** Counter TOTP terakhir yang berhasil — cegah replay dalam 1 step. */
      totpLastCounter: v.optional(v.number()),
      /** Convex Auth session IDs that completed the TOTP gate (never client IDs). */
      totpVerifiedAuthSessionIds: v.optional(v.array(v.string())),
      /** OTP WA terakhir yang benar (hash-ish) untuk login/transaksi baru. */
      waOtpKode: v.optional(v.string()),
      waOtpKedaluwarsa: v.optional(v.number()),
      /** Jumlah kegagalan verifikasi OTP WA berturut-turut. */
      waOtpGagal: v.optional(v.number()),
      /** Setelah true, OTP WA wajib untuk setiap transaksi finansial. */
      waOtpWajib: v.optional(v.boolean()),
      /**
       * Jendela verifikasi OTP WA hasil dialog transaksi (epoch ms). Selama
       * masih berlaku, mutation finansial boleh lanjut tanpa mengirim ulang
       * kode — sekali pakai, langsung dihapus oleh mutation yang memakainya.
       */
      waOtpTerverifikasiSampai: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /**
     * Rate limit login — hitung kegagalan per email+IP, append-only.
     * 5x gagal dalam 15 menit → IP diblokir sementara (dicek di verifyLogin). */
    loginAttempts: defineTable({
      /** Email yang dicoba (lowercase) — "guest" untuk jalur tamu. */
      identifier: v.string(),
      ip: v.string(),
      berhasil: v.boolean(),
      waktu: v.number(),
    })
      .index("by_identifier", ["identifier"])
      .index("by_ip", ["ip"]),

    /**
     * Pembatas percobaan kata sandi Super Admin — pencatat yang dihitung
     * server. Berbeda dari `loginAttempts` (IP/identifier dikirim klien),
     * tabel ini diisi di dalam `adminPassword.authorize` SEBELUM kata sandi
     * diverifikasi, sehingga klien tidak bisa melewatinya. 5 percobaan /
     * 15 menit per email admin.
     */
    adminLoginAttempts: defineTable({
      /** Email admin (lowercase). */
      email: v.string(),
      waktu: v.number(),
    }).index("by_email", ["email"]),

    /**
     * Log login append-only (Rule Audit Trail) — status, IP, UA, timestamp.
     * Ditulis lewat action (butuh fetch WA) lalu mutation internal.
     */
    loginLogs: defineTable({
      userId: v.optional(v.id("users")),
      /** "berhasil" | "gagal" | "diblokir" | "dipertanyakan" (anomali). */
      status: v.string(),
      metode: v.string(), // email_otp | tamu | totp | wa_otp
      ip: v.string(),
      userAgent: v.string(),
      keterangan: v.optional(v.string()),
      waktu: v.number(),
    }).index("by_waktu", ["waktu"]),

    /**
     * Sesi aktif tunggal — satu baris per sesi (per browser perangkat).
     * Login baru di perangkat lain membatalkan (mendrop) sesi lama.
     */
    sessions: defineTable({
      userId: v.id("users"),
      /** ID acak sesi — dibandingkan dengan nilai di localStorage klien. */
      sessionId: v.string(),
      perangkat: v.string(),
      ip: v.string(),
      waktuMulai: v.number(),
      /** Terisi saat sesi digantikan sesi baru di perangkat lain. */
      waktuBerakhir: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /** Persetujuan pelacakan lokasi berkelanjutan — satu baris per pengguna. */
    trackingConsents: defineTable({
      userId: v.id("users"),
      aktif: v.boolean(),
      disetujuiPada: v.optional(v.number()),
      dinonaktifkanPada: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /**
     * Status lokasi TERKINI per pengguna — dasar gerbang "lokasi wajib aktif".
     * Setiap aksi finansial (pengajuan, cicilan, pelunasan) hanya dilayani
     * bila titik terakhir masih segar, sehingga perangkat yang mematikan GPS
     * otomatis tidak bisa bertransaksi.
     */
    lokasiStatus: defineTable({
      userId: v.id("users"),
      lat: v.number(),
      lng: v.number(),
      /** Akurasi GPS dalam meter (dari perangkat). */
      akurasi: v.number(),
      waktu: v.number(),
      /** "web" (browser) atau "aplikasi" (aplikasi native terpasang). */
      sumber: v.string(),
      platform: v.optional(v.string()),
      versiApp: v.optional(v.string()),
      /** Tanda kecurigaan lokasi palsu pada titik terakhir (mis. terbekukan). */
      tanda: v.optional(v.array(v.string())),
      /** Koordinat persis sama berturut-turut — untuk mendeteksi posisi beku. */
      identikBerturut: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /**
     * Perangkat aplikasi native terdaftar — dasar kebijakan "wajib aplikasi":
     * transaksi hanya dilayani bila perangkat ini pernah mengirim heartbeat
     * (dipakai setelah aplikasi Android/iOS dirilis).
     */
    perangkat: defineTable({
      userId: v.id("users"),
      deviceId: v.string(),
      platform: v.string(),
      versiApp: v.string(),
      /**
       * Token perangkat — kredensial untuk endpoint heartbeat HTTP
       * (`POST /lokasi/heartbeat`). Layanan lokasi yang berjalan di luar
       * WebView (foreground service Android) tidak punya sesi Convex Auth,
       * jadi ia mengirim titik dengan token ini. Diterbitkan sekali oleh
       * `lokasi.daftarkanPerangkat` dan dipakai ulang saat app dibuka kembali.
       */
      token: v.optional(v.string()),
      terdaftarPada: v.number(),
      terakhirDilihat: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_device", ["deviceId"])
      .index("by_token", ["token"]),

    /**
     * Konfigurasi sistem — satu baris global (slot "global").
     * Diubah dari /admin → Pengaturan System; kill switch menghentikan
     * seluruh pengajuan baru (pinjaman & gadai) seketika.
     */
    systemConfig: defineTable({
      slot: v.string(),
      /** Kill switch: blokir semua pengajuan & pencairan baru. */
      killSwitch: v.optional(v.boolean()),
      /** Mode perawatan: frontend menampilkan halaman pengumuman. */
      maintenanceMode: v.optional(v.boolean()),
      /** Persentase biaya — diubah dari default 3/2/30 untuk penyesuaian. */
      persenAdmin: v.optional(v.number()),
      persenPlatform: v.optional(v.number()),
      persenBunga: v.optional(v.number()),
      /** Maks LTV gadai (default 70%). */
      maxLtvPersen: v.optional(v.number()),
      /** Logout otomatis admin pasif (menit, 0 = nonaktif). */
      sessionTimeoutMenit: v.optional(v.number()),
      /** Titik lokasi gudang brankas untuk peta & cek radius. */
      vaultLat: v.optional(v.number()),
      vaultLng: v.optional(v.number()),
      /** Radius mismatch GPS peminjam vs KTP (km, default 50). */
      gpsMismatchKm: v.optional(v.number()),
      /** Jarak maks pencairan dari vault (km, default 75). */
      pencairanMaxKm: v.optional(v.number()),
      /** Gerbang lokasi wajib: transaksi Peminjam butuh titik GPS segar. */
      lokasiWajib: v.optional(v.boolean()),
      /** Umur maksimum titik lokasi yang masih dianggap segar (menit). */
      lokasiMaxUmurMenit: v.optional(v.number()),
      /** Wajib transaksi dari aplikasi native (pelacakan latar belakang). */
      wajibAplikasiNative: v.optional(v.boolean()),
      /**
       * Retensi jejak lokasi (hari) untuk job cron `retensi-lokasi-jejak`.
       * Titik milik pinjaman belum selesai tetap ditahan minimal 400 hari.
       */
      retensiLokasiHari: v.optional(v.number()),
      /** Plafon awal pinjaman tunai untuk semua Peminjam (rupiah bulat). */
      plafonPinjaman: v.optional(v.number()),
      /** Informasi pembayaran manual yang ditampilkan ke pengguna masuk. */
      rekeningUsahaNama: v.optional(v.string()),
      rekeningUsahaBank: v.optional(v.string()),
      rekeningUsahaNomor: v.optional(v.string()),
      qrisMerchantNama: v.optional(v.string()),
      qrisImageId: v.optional(v.union(v.id("_storage"), v.null())),
      /** Gate off until downstream allocations, disbursements, and withdrawals are ready. */
      manualDepositEnabled: v.optional(v.boolean()),
      /** Preset tema aman dari whitelist; tidak menerima CSS arbitrer. */
      tema: v.optional(v.union(v.literal("tinta"), v.literal("pesisir"), v.literal("terakota"))),
      /** Waktu terakhir konfigurasi diperbarui. */
      diperbaruiPada: v.number(),
    }).index("by_slot", ["slot"]),

    /**
     * Audit trail — append-only. Mencatat setiap aksi berdampak:
     * keputusan review, kill switch, perubahan konfigurasi, backup.
     */
    auditLog: defineTable({
      aktorUserId: v.optional(v.id("users")),
      /** Label aktor (email/nama) — snapshot agar tetap terbaca. */
      aktorLabel: v.string(),
      aksi: v.string(),
      target: v.optional(v.string()),
      detail: v.optional(v.string()),
      waktu: v.number(),
    }).index("by_waktu", ["waktu"]),

    /**
     * Catatan pengajuan penggadaian barang. Taksiran dan keputusan disimpan
     * sebagai input/review internal dan bukan verifikasi lokasi, kondisi,
     * kepemilikan, penerimaan, atau penitipan fisik.
     */
    pawns: defineTable({
      userId: v.id("users"),
      /** Deskripsi barang yang dicantumkan pemohon (tidak otomatis diverifikasi). */
      deskripsiBarang: v.string(),
      /** Kategori barang. */
      kategori: v.string(),
      /** Alamat yang dilaporkan pemohon; bukan lokasi yang terverifikasi. */
      alamatPenilaian: v.string(),
      /** Nama lengkap sesuai KTP. */
      namaLengkap: v.string(),
      /** Nama bank/e-wallet tujuan pencairan (opsional untuk data lama). */
      namaBank: v.optional(v.string()),
      /** Nomor rekening/akun tujuan pencairan. */
      nomorRekening: v.string(),
      catatanPeminjam: v.optional(v.string()),
      status: pawnStatusValidator,
      /** Rupiah bulat — diisi reviewer saat penilaian selesai. */
      nilaiTaksiran: v.optional(v.number()),
      /** Harga pasar barang untuk kalkulasi LTV (maks 70%). */
      hargaPasar: v.optional(v.number()),
      /** Catatan kondisi fisik yang dimasukkan reviewer; bukan bukti pemeriksaan aplikasi. */
      kondisiFisik: v.optional(v.string()),
      /** Kode referensi lokasi internal; bukan bukti gudang atau penitipan fisik. */
      kodeRakVault: v.optional(v.string()),
      /** Foto barang dari petugas (Convex storage). */
      fotoBarangId: v.optional(v.id("_storage")),
      /** Catatan penilaian/keputusan reviewer. */
      catatanReview: v.optional(v.string()),
      nomorReferensi: v.string(),
      // ===== Skema B: Gadai Digital (berjaminan, LTV 70%) =====
      /** Pokok gadai yang disetujui admin (≤ 70% harga pasar) — rupiah bulat. */
      pokokGadai: v.optional(v.number()),
      /** Sewa modal per 30 hari dalam persen (5–10) — dipilih admin saat approval. */
      persenSewaModal: v.optional(v.number()),
      /** Sisa pokok berjalan (decreasing principal) — rupiah bulat. */
      sisaPokok: v.optional(v.number()),
      /** Timestamp legacy; pencatatan pencairan dan settlement ditangani terpisah. */
      dicairkanPada: v.optional(v.number()),
      /** Tanda tangan elektronik Peminjam pada akad gadai (data URL PNG). */
      tandaTanganPeminjam: v.optional(v.string()),
      /** Waktu tanda tangan elektronik Peminjam. */
      tandaTanganPada: v.optional(v.number()),
      /** Waktu Peminjam menyetujui syarat dan ketentuan akad gadai. */
      persetujuanSyaratPada: v.optional(v.number()),
      /** Versi syarat dan ketentuan yang disetujui. */
      persetujuanSyaratVersi: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    /**
     * Catatan historis cicilan gadai — APPEND-ONLY. Baris lama dipertahankan
     * sebagai jejak ledger internal; tidak membuktikan settlement atau status
     * penitipan/pengembalian barang secara fisik.
     */
    pawnPayments: defineTable({
      pawnId: v.id("pawns"),
      /** Pokok yang dicicil pembayaran ini (rupiah bulat). */
      pokokDicicil: v.number(),
      /** Sewa modal yang dibayar (rupiah bulat). */
      sewaDibayar: v.number(),
      /** Sisa pokok SETELAH pembayaran ini (snapshot decreasing principal). */
      sisaPokokSetelah: v.number(),
      /** Sewa modal periode berikutnya dari sisa pokok terbaru. */
      sewaModalBerikut: v.number(),
      /** Peminjam yang membayar (denormalisasi untuk query cepat). */
      userId: v.id("users"),
      waktu: v.number(),
    })
      .index("by_pawn", ["pawnId"])
      .index("by_user", ["userId"]),

    /**
     * Pengajuan Kredit Barang (Skema C) — Peminjam membeli elektronik/barang
     * dari merchant mitra (marketplace/toko) dengan uang muka; sisa harga
     * dibiayai Pendana dan dicicil bulanan.
     *
     * Semua nilai uang rupiah bulat. Rincian (DP, pokok dibiayai, biaya
     * layanan, cicilan, Imbal Hasil) TIDAK disimpan — selalu diturunkan dari
     * (hargaBarang, dpPersen, tenorBulan, marginPersenPerBulan) melalui
     * quoteKreditBarang() di lib/kredit.ts, satu sumber kebenaran.
     */
    kreditBarang: defineTable({
      /** Pemilik pengajuan (Peminjam). */
      userId: v.id("users"),
      nomorReferensi: v.string(),
      /** Nama/deskripsi barang (mis. "Samsung Galaxy A55 8/256"). */
      namaBarang: v.string(),
      /** Kategori barang (Elektronik, Peralatan rumah, ...). */
      kategori: v.string(),
      /** Merchant/sumber barang: Shopee, Tokopedia, toko elektronik mitra, dll. */
      merchant: v.string(),
      /** Tautan produk di marketplace (opsional, untuk verifikasi harga). */
      tautanBarang: v.optional(v.string()),
      /** Harga barang di merchant — rupiah bulat. */
      hargaBarang: v.number(),
      /** Uang muka Konsumen, % dari harga barang (10–50). */
      dpPersen: v.number(),
      /** Tenor cicilan baru 1/3/6 bulan; kontrak lama 12/24 tetap didukung. */
      tenorBulan: v.number(),
      /** Imbal Hasil Pendana per bulan (% dari pokok dibiayai, 1,5–4). */
      marginPersenPerBulan: v.number(),
      status: kreditStatusValidator,
      /** Catatan keputusan reviewer (wajib saat ditolak). */
      catatanReview: v.optional(v.string()),
      // ===== Data pemohon =====
      /** Nama lengkap sesuai KTP. */
      namaLengkap: v.string(),
      /** NIK 16 digit sesuai KTP. */
      nik: v.string(),
      /** Nomor rekening tujuan/pencairan. */
      nomorRekening: v.string(),
      /** Nomor WhatsApp aktif untuk pengingat cicilan. */
      nomorWhatsApp: v.string(),
      catatanPeminjam: v.optional(v.string()),
      /** Terisi saat pendanaan penuh — dana pokok diteruskan ke merchant. */
      didanaiPada: v.optional(v.number()),
      /** Terisi saat cicilan terakhir dibayar penuh oleh Konsumen. */
      lunasPada: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    /**
     * Pembayaran cicilan bulanan Kredit Barang (Skema C) — APPEND-ONLY.
     * Satu baris per bulan yang dibayar Konsumen; bulan ke-n dihitung dari
     * jumlah baris ini (cicilan selalu berurutan). Sisa pokok & kewajiban
     * berikutnya diturunkan dari jadwal engine, bukan disimpan ganda.
     */
    kreditPayments: defineTable({
      kreditId: v.id("kreditBarang"),
      /** Peminjam yang mencatat pembayaran (denormalisasi untuk query cepat). */
      userId: v.id("users"),
      /** Bulan cicilan yang dibayar (1..tenorBulan). */
      bulanKe: v.number(),
      /** Cicilan pokok bulan ini (rupiah bulat). */
      pokokDibayar: v.number(),
      /** Imbal Hasil bulan ini yang dibayarkan Konsumen (rupiah bulat). */
      marginDibayar: v.number(),
      /** Total pembayaran bulan ini = pokok + margin. */
      totalDibayar: v.number(),
      /** Sisa pokok dibiayai setelah pembayaran ini (snapshot). */
      sisaPokokSetelah: v.number(),
      waktu: v.number(),
    })
      .index("by_kredit", ["kreditId"])
      .index("by_user", ["userId"]),

    /**
     * Alokasi Dana Pendana ke satu pengajuan Kredit Barang (Skema C) —
     * analog `fundings` untuk pinjaman tunai. Satu pengajuan dapat didanai
     * beberapa Pendana; anti-overfunding divalidasi atomik di server.
     * Hak Imbal Hasil proporsional porsi pokok yang didanai.
     */
    kreditFundings: defineTable({
      kreditId: v.id("kreditBarang"),
      pendanaId: v.id("users"),
      /** Rupiah bulat — porsi pokok dibiayai yang ditanggung Pendana ini. */
      jumlahAlokasi: v.number(),
      /** Hak Imbal Hasil Pendana untuk alokasi ini (rupiah bulat). */
      imbalHasil: v.number(),
      status: v.union(
        v.literal("dialokasikan"),
        v.literal("selesai"),
        v.literal("dibatalkan"),
      ),
      nomorReferensi: v.string(),
    })
      .index("by_kredit", ["kreditId"])
      .index("by_pendana", ["pendanaId"]),

    /**
     * Setoran dana Pendana. Dana baru dianggap tersedia setelah admin
     * memverifikasi penerimaan (konfirmasi mencatat jurnal ledger).
     */
    deposits: defineTable({
      pendanaId: v.id("users"),
      jumlah: v.number(), // rupiah bulat
      /** Referensi transfer menurut bank/e-wallet Pendana. */
      referensiTransfer: v.string(),
      status: v.union(
        v.literal("menunggu_verifikasi"),
        v.literal("terverifikasi"),
        v.literal("ditolak"),
      ),
      /** Wajib diisi admin saat menolak. */
      catatanAdmin: v.optional(v.string()),
      /** Bukti transaksi manual; submit tidak mengubah saldo ledger. */
      metodePembayaran: v.optional(v.union(v.literal("qris"), v.literal("transfer"))),
      tanggalTransfer: v.optional(v.number()),
      buktiPembayaranId: v.optional(v.id("_storage")),
      statusPencocokan: v.optional(v.union(v.literal("dicocokkan"), v.literal("ditolak"))),
      referensiMutasi: v.optional(v.string()),
      jumlahMutasi: v.optional(v.number()),
      dicocokkanPada: v.optional(v.number()),
      dicocokkanOleh: v.optional(v.id("users")),
      nomorReferensi: v.string(),
    })
      .index("by_pendana", ["pendanaId"])
      .index("by_status", ["status"]),

    /**
     * Bukti pembayaran manual peminjam; pencocokan tidak menulis jurnal,
     * mencatat cicilan, atau mengubah status pinjaman menjadi lunas.
     */
    manualPaymentReceipts: defineTable({
      userId: v.id("users"),
      jenis: v.union(v.literal("pinjaman"), v.literal("kredit_barang"), v.literal("gadai")),
      loanId: v.optional(v.id("loans")),
      kreditId: v.optional(v.id("kreditBarang")),
      pawnId: v.optional(v.id("pawns")),
      jumlah: v.number(),
      metodePembayaran: v.union(v.literal("qris"), v.literal("transfer")),
      tanggalTransfer: v.number(),
      referensiTransfer: v.string(),
      buktiPembayaranId: v.id("_storage"),
      status: v.union(v.literal("menunggu_pencocokan"), v.literal("dicocokkan"), v.literal("ditolak")),
      referensiMutasi: v.optional(v.string()),
      jumlahMutasi: v.optional(v.number()),
      dicocokkanPada: v.optional(v.number()),
      dicocokkanOleh: v.optional(v.id("users")),
      catatanAdmin: v.optional(v.string()),
      nomorReferensi: v.string(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_loan", ["loanId"])
      .index("by_kredit", ["kreditId"])
      .index("by_pawn", ["pawnId"]),

    /**
     * Alokasi dana Pendana ke satu pinjaman. Satu pinjaman bisa didanai
     * beberapa Pendana; total alokasi tidak boleh melebihi pokok
     * (anti-overfunding divalidasi atomik di server).
     */
    /**
     * Permintaan penarikan dana Pendana ke rekening pribadinya. Dicatat
     * berpasangan di ledger saat admin memproses (append-only).
     */
    withdrawals: defineTable({
      pendanaId: v.id("users"),
      /** Rupiah bulat — jumlah penarikan. */
      jumlah: v.number(),
      /** Nama bank tujuan (mis. BCA). */
      namaBank: v.string(),
      /** Nomor rekening tujuan (digit). */
      nomorRekening: v.string(),
      status: v.union(
        v.literal("menunggu_proses"),
        v.literal("diproses"),
        v.literal("ditolak"),
      ),
      /** Wajib diisi admin saat menolak. */
      catatanAdmin: v.optional(v.string()),
      nomorReferensi: v.string(),
    })
      .index("by_pendana", ["pendanaId"])
      .index("by_status", ["status"]),

    fundings: defineTable({
      loanId: v.id("loans"),
      pendanaId: v.id("users"),
      /** Rupiah bulat — bagian Pendana atas pokok pinjaman. */
      jumlahAlokasi: v.number(),
      /** Rupiah bulat — hak imbal hasil Pendana (30% dari bagian pokok). */
      imbalHasil: v.number(),
      status: v.union(
        v.literal("dialokasikan"),
        v.literal("selesai"),
        v.literal("dibatalkan"),
      ),
      nomorReferensi: v.string(),
    })
      .index("by_loan", ["loanId"])
      .index("by_pendana", ["pendanaId"]),

    /**
     * Jurnal double-entry — APPEND-ONLY (Rule 5.1).
     * Dilarang UPDATE/DELETE. Setiap transaksi menulis pasangan entri dengan
     * jumlah debit = jumlah kredit; validasi di convex/ledger.ts.
     */
    ledger_entries: defineTable({
      /** ID grup transaksi — entri dalam satu transaksi berbagi groupId. */
      groupId: v.string(),
      /** debit: saldo akun bertambah; kredit: saldo akun berkurang. */
      arah: v.union(v.literal("debit"), v.literal("kredit")),
      /** Rupiah bulat. */
      jumlah: v.number(),
      /** Nama akun ledger, mis. "pendana:WALLET:<id>", "pinjaman:<id>". */
      akun: v.string(),
      /** Jenis transaksi: deposit|disbursement|platform_fee|repayment|payout. */
      jenis: v.string(),
      keterangan: v.string(),
      /** Subjek transaksi (userId atau "platform"). */
      aktor: v.string(),
      waktu: v.number(),
    })
      .index("by_group", ["groupId"])
      .index("by_akun", ["akun"]),

    /**
     * Pengingat jatuh tempo pelunasan — APPEND-ONLY, idempoten per
     * (loan, tanggal). Ditulis oleh cron harian (internal), satu baris per
     * pinjaman aktif per hari; pembacaan publik via reminderForToday.
     */
    pengingat: defineTable({
      loanId: v.id("loans"),
      /** Tanggal kalender (UTC epoch ms tengah malam) saat pengingat dibuat. */
      tanggal: v.number(),
      /** "h_minus_3" | "jatuh_tempo" | "terlambat". */
      jenis: v.string(),
      /** Sisa hari ke jatuh tempo (negatif = terlambat). */
      sisaHari: v.number(),
      /** Kewajiban rupiah bulat yang tercatat saat pengingat dibuat. */
      jumlahKewajiban: v.number(),
      waktu: v.number(),
    })
      .index("by_loan", ["loanId"])
      .index("by_tanggal", ["tanggal"]),

    /**
     * Peringatan "lokasi dicurigai" untuk nasabah + tim review.
     *
     * Ditulis otomatis saat `simpanTitik` menandai sebuah titik (mis. koordinat
     * beku berulang). Maksimum satu peringatan per nasabah per 24 jam
     * (`LOKASI_PERINGATAN_JEDA_JAM`), karena titik yang ditandai bisa datang
     * setiap menit. `dibacaPada` diisi saat nasabah mengakuinya di dashboard.
     */
    lokasiPeringatan: defineTable({
      userId: v.id("users"),
      /** Tanda yang memicu (mis. "koordinat_identik"). */
      tanda: v.array(v.string()),
      /** Pinjaman yang sedang berjalan saat itu (bila ada) — sumber nomor WA. */
      loanId: v.optional(v.id("loans")),
      lat: v.number(),
      lng: v.number(),
      /** "peringatan" | "peringatan_ulang" — boleh diluaskan. */
      jenis: v.string(),
      /** Status pengiriman WhatsApp terakhir: "terkirim" | "gagal" | "dinonaktifkan" | "tanpa_nomor". */
      waStatus: v.optional(v.string()),
      /** Keterangan kegagalan WA untuk diagnosis admin. */
      waKeterangan: v.optional(v.string()),
      /** Terisi saat nasabah menekan "sudah saya matikan" di dashboard. */
      dibacaPada: v.optional(v.number()),
      waktu: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_loan", ["loanId"])
      .index("by_waktu", ["waktu"]),

    /**
     * CMS konten situs — satu baris global (slot "global") yang diedit tim
     * lewat panel admin: bar berjalan, popup pengumuman, widget mengambang,
     * dan teks halaman utama (header/hero/layanan). Field opsional;
     * nilai kosong berarti memakai default di kode.
     */
    pengumuman: defineTable({
      /** Selalu "global" — CMS hanya punya satu baris. */
      slot: v.string(),
      // --- Bar berjalan ---
      teks: v.optional(v.string()),
      tautan: v.optional(v.string()),
      aktif: v.optional(v.boolean()),
      // --- Popup pengumuman ---
      popupJudul: v.optional(v.string()),
      popupIsi: v.optional(v.string()),
      popupCta: v.optional(v.string()),
      popupAktif: v.optional(v.boolean()),
      // --- Widget mengambang ---
      floatJudul: v.optional(v.string()),
      floatIsi: v.optional(v.string()),
      floatCta: v.optional(v.string()),
      floatAktif: v.optional(v.boolean()),
      /** Delay kemunculan widget mengambang (detik). */
      floatDelayDetik: v.optional(v.number()),
      // --- Teks halaman utama ---
      logoTeks: v.optional(v.string()),
      nav1Label: v.optional(v.string()),
      nav2Label: v.optional(v.string()),
      nav3Label: v.optional(v.string()),
      nav4Label: v.optional(v.string()),
      heroBadge: v.optional(v.string()),
      heroJudul: v.optional(v.string()),
      /** Bagian aksen berwarna pada judul hero. */
      heroJudul2: v.optional(v.string()),
      heroSub: v.optional(v.string()),
      heroCta1: v.optional(v.string()),
      heroCta2: v.optional(v.string()),
      chip1Label: v.optional(v.string()),
      chip1Nilai: v.optional(v.string()),
      chip2Label: v.optional(v.string()),
      chip2Nilai: v.optional(v.string()),
      layananJudul: v.optional(v.string()),
      layananSub: v.optional(v.string()),
      pinjamanJudul: v.optional(v.string()),
      pinjamanIsi: v.optional(v.string()),
      pinjamanCta: v.optional(v.string()),
      gadaiJudul: v.optional(v.string()),
      gadaiIsi: v.optional(v.string()),
      gadaiCta: v.optional(v.string()),
      langkahJudul: v.optional(v.string()),
      /** Audit ringan: kapan terakhir diubah admin. */
      diperbaruiPada: v.number(),
    }).index("by_slot", ["slot"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
