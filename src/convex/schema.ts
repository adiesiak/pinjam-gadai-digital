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
  /** Supervisor operasional terminal STOP-UP! — boleh urus katalog & harga. */
  SUPERVISOR: "supervisor",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.PEMINJAM),
  v.literal(ROLES.PENDANA),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.SUPERVISOR),
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
      /** Nomor WhatsApp akun (format 62…) — dipakai login & notifikasi. */
      whatsapp: v.optional(v.string()),
      /** NIK 16 digit (khusus Peminjam) — pencocokan KYC, tidak publik. */
      nik: v.optional(v.string()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

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
      /** Nomor rekening tujuan dana bersih (95%). */
      nomorRekening: v.string(),
      status: loanStatusValidator,
      /** Catatan keputusan reviewer (wajib saat ditolak). */
      catatanReview: v.optional(v.string()),
      /** Nomor referensi manusiawi. */
      nomorReferensi: v.string(),
      /** Tenor pinjaman dalam hari (30/60/90) — dipilih saat pengajuan. */
      tenorHari: v.number(),
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
      /** Waktu tanda tangan elektronik. */
      tandaTanganPada: v.optional(v.number()),
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
    lokasiJejak: defineTable({
      userId: v.id("users"),
      loanId: v.optional(v.id("loans")),
      lat: v.number(),
      lng: v.number(),
      /** Akurasi GPS dalam meter. */
      akurasi: v.number(),
      waktu: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_loan", ["loanId"]),

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
      /** OTP WA terakhir yang benar (hash-ish) untuk login/transaksi baru. */
      waOtpKode: v.optional(v.string()),
      waOtpKedaluwarsa: v.optional(v.number()),
      /** Jumlah kegagalan verifikasi OTP WA berturut-turut. */
      waOtpGagal: v.optional(v.number()),
      /** Setelah true, OTP WA wajib untuk setiap transaksi finansial. */
      waOtpWajib: v.optional(v.boolean()),
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
     * Pengajuan penggadaian barang.
     * Barang dinilai petugas berwenang melalui kunjungan dengan live location
     * wajib; nilai taksiran dan keputusan diisi oleh reviewer (admin), bukan
     * oleh Peminjam.
     */
    pawns: defineTable({
      userId: v.id("users"),
      /** Deskripsi barang yang digadaikan. */
      deskripsiBarang: v.string(),
      /** Kategori barang. */
      kategori: v.string(),
      /** Alamat lokasi barang saat pemeriksaan. */
      alamatPenilaian: v.string(),
      /** Nama lengkap sesuai KTP. */
      namaLengkap: v.string(),
      /** Nomor rekening tujuan pencairan. */
      nomorRekening: v.string(),
      catatanPeminjam: v.optional(v.string()),
      status: pawnStatusValidator,
      /** Rupiah bulat — diisi reviewer saat penilaian selesai. */
      nilaiTaksiran: v.optional(v.number()),
      /** Harga pasar barang untuk kalkulasi LTV (maks 70%). */
      hargaPasar: v.optional(v.number()),
      /** Kondisi fisik barang menurut petugas penilai. */
      kondisiFisik: v.optional(v.string()),
      /** Kode rak penyimpanan di gudang brankas (mis. "A-12"). */
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
      /** Terisi saat admin mencairkan dana bersih 99% ke Peminjam. */
      dicairkanPada: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    /**
     * Pembayaran gadai (cicil pokok / sewa modal per 30 hari) — APPEND-ONLY.
     * Satu baris per pembayaran; sisa pokok dihitung dari akumulasi baris ini.
     * Sisa pokok mencapai Rp0 → barang berstatus SIAP_DIAMBIL dari Vault.
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
      nomorReferensi: v.string(),
    })
      .index("by_pendana", ["pendanaId"])
      .index("by_status", ["status"]),

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
    }).index("by_group", ["groupId"]),

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

    /* ========================================================================
     * STOP-UP! — Layanan Digital Mandiri (Pulsa, Paket Data, E-Wallet, PPOB,
     * Apps Premium). Semua tabel ber-prefix `su` agar tidak bentrok dengan
     * modul PINDAI di atas.
     *
     * Konvensi uang: rupiah BULAT (integer), tanpa float. Lihat src/lib/money.ts
     * untuk format dan src/lib/stopup/pricing.ts untuk perhitungan margin.
     * ===================================================================== */

    /** Terminal fisik (mesin touchscreen) yang terpasang di lokasi mitra. */
    suTerminals: defineTable({
      /** Kode unik terminal, mis. "SU-JKT-01". */
      code: v.string(),
      name: v.string(),
      location: v.string(),
      /** PIN admin terminal (4–6 digit) untuk membuka menu teknis di layar. */
      pinAdmin: v.string(),
      isOnline: v.boolean(),
      lastHeartbeat: v.number(),
      /** Versi aplikasi/agent yang dilaporkan terminal. */
      version: v.optional(v.string()),
      aktif: v.boolean(),
    })
      .index("by_code", ["code"])
      .index("by_online", ["isOnline"]),

    /** Log kondisi perangkat terminal — append-only (detak & status printer). */
    suTerminalLogs: defineTable({
      terminalId: v.id("suTerminals"),
      /** OK | LOW | EMPTY — sensor kertas printer thermal. */
      paperStatus: v.union(
        v.literal("OK"),
        v.literal("LOW"),
        v.literal("EMPTY"),
      ),
      printerConnected: v.boolean(),
      /** Saldo deposit supplier termurah saat log dibuat (rupiah bulat). */
      supplierBalance: v.optional(v.number()),
      loggedAt: v.number(),
      catatan: v.optional(v.string()),
    })
      .index("by_terminal", ["terminalId"])
      .index("by_logged", ["loggedAt"]),

    /** Kategori produk (Pulsa, Paket Data, E-Wallet, PPOB & PLN, Apps Premium). */
    suCategories: defineTable({
      code: v.string(),
      name: v.string(),
      /** Emoji/ikon kategori untuk layar sentuh. */
      icon: v.string(),
      sortOrder: v.number(),
      aktif: v.boolean(),
    }).index("by_code", ["code"]),

    /** Brand/provider (Telkomsel, DANA, PLN, Netflix, …). */
    suBrands: defineTable({
      code: v.string(),
      name: v.string(),
      /** OPERATOR | EWALLET | PPOB | PREMIUM — menentukan routing layar. */
      kind: v.union(
        v.literal("OPERATOR"),
        v.literal("EWALLET"),
        v.literal("PPOB"),
        v.literal("PREMIUM"),
      ),
      /** Emoji/ikon brand. */
      icon: v.string(),
      /** Warna aksen hex untuk kartu brand. */
      color: v.string(),
      sortOrder: v.number(),
      /** Khusus PPOB: jumlah digit ID pelanggan (min/maks). */
      minDigit: v.optional(v.number()),
      maxDigit: v.optional(v.number()),
      /** Contoh ID pelanggan untuk placeholder layar. */
      contohId: v.optional(v.string()),
      /** Label field target, mis. "No. Meter / ID Pelanggan". */
      labelTarget: v.optional(v.string()),
      aktif: v.boolean(),
    })
      .index("by_code", ["code"])
      .index("by_kind", ["kind"]),

    /** Supplier H2H (Digiflazz/Tripay/custom) — bisa banyak, diurut prioritas. */
    suSuppliers: defineTable({
      code: v.string(),
      name: v.string(),
      apiKey: v.optional(v.string()),
      secretKey: v.optional(v.string()),
      /** "sandbox" | "production" — dipakai UI admin, tanpa efek di simulasi. */
      mode: v.union(v.literal("sandbox"), v.literal("production")),
      /** Endpoint H2H, mis. https://api.digiflazz.com/v1. */
      baseUrl: v.optional(v.string()),
      /** Saldo deposit di supplier (rupiah bulat) — dipantau Telegram Alert. */
      balance: v.number(),
      isActive: v.boolean(),
      priority: v.number(),
      lastSyncAt: v.optional(v.number()),
      /** Jumlah SKU terakhir yang tersinkron dari supplier ini. */
      lastSyncCount: v.optional(v.number()),
      diperbaruiPada: v.number(),
    })
      .index("by_code", ["code"])
      .index("by_priority", ["priority"]),

    /** Katalog produk siap jual di layar terminal. */
    suProducts: defineTable({
      productCodeInternal: v.string(),
      productCodeSupplier: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      /** Emoji ikon default. */
      icon: v.optional(v.string()),
      /** URL gambar PNG/SVG latar transparan (menimpa emoji bila diisi). */
      iconUrl: v.optional(v.string()),
      badgeLabel: v.optional(v.string()),
      sortOrder: v.number(),
      categoryId: v.id("suCategories"),
      brandId: v.id("suBrands"),
      /** Harga pokok dari supplier (rupiah bulat). */
      hppPrice: v.number(),
      /** Harga jual normal (rupiah bulat). */
      sellPrice: v.number(),
      /** Harga promo/harga coret (rupiah bulat). */
      discountPrice: v.optional(v.number()),
      isDiscountActive: v.boolean(),
      /** INJECT_PHONE | INJECT_EMAIL | VOUCHER_CODE | PPOB_INQUIRY. */
      deliveryType: v.union(
        v.literal("INJECT_PHONE"),
        v.literal("INJECT_EMAIL"),
        v.literal("VOUCHER_CODE"),
        v.literal("PPOB_INQUIRY"),
      ),
      status: v.union(v.literal("AKTIF"), v.literal("NONAKTIF")),
      supplierId: v.optional(v.id("suSuppliers")),
      /** Nama produk di sisi supplier (hasil sync). */
      supplierProductName: v.optional(v.string()),
      diperbaruiPada: v.number(),
    })
      .index("by_category", ["categoryId"])
      .index("by_brand", ["brandId"])
      .index("by_internal_code", ["productCodeInternal"])
      .index("by_status", ["status"]),

    /** Transaksi penjualan di terminal — satu baris per struk. */
    suTransactions: defineTable({
      invoiceId: v.string(),
      terminalId: v.id("suTerminals"),
      productId: v.id("suProducts"),
      /** Nomor tujuan: nomor HP / ID pelanggan / email sesuai deliveryType. */
      targetNo: v.string(),
      /** Nama pemilik akun HASIL INQUIRY dengan partial masking. */
      accountNameMasked: v.optional(v.string()),
      /** Nomor WhatsApp penerima invoice/notifikasi (bisa diubah di konfirmasi). */
      notifWhatsapp: v.string(),
      /** Nomor HP pelanggan yang diinput di halaman 1 (jika berbeda). */
      buyerPhone: v.optional(v.string()),
      /** Snapshot harga & laba saat transaksi (rupiah bulat). */
      sellPrice: v.number(),
      hppPrice: v.number(),
      profit: v.number(),
      /** Kode voucher/redeem key — hanya untuk VOUCHER_CODE. */
      voucherCode: v.optional(v.string()),
      /** Serial number / ref dari supplier. */
      snRef: v.optional(v.string()),
      status: v.union(
        v.literal("PENDING"),
        v.literal("PROCESSING"),
        v.literal("SUCCESS"),
        v.literal("FAILED"),
        v.literal("EXPIRED"),
      ),
      /** Alasan gagal, untuk audit & tampilan admin. */
      catatanGagal: v.optional(v.string()),
      /** true bila struk gagal cetak (kertas habis) → bukti dikirim via WA. */
      strukViaWhatsapp: v.optional(v.boolean()),
      createdAt: v.number(),
      paidAt: v.optional(v.number()),
      selesaiPada: v.optional(v.number()),
    })
      .index("by_invoice", ["invoiceId"])
      .index("by_status", ["status"])
      .index("by_created", ["createdAt"])
      .index("by_terminal", ["terminalId"]),

    /** Tagihan QRIS untuk sebuah transaksi — satu baris per invoice. */
    suPayments: defineTable({
      invoiceId: v.string(),
      transactionId: v.id("suTransactions"),
      paymentMethod: v.union(v.literal("QRIS")),
      /** Payload QRIS yang dirender jadi QR code di layar. */
      qrString: v.string(),
      /** Rupiah bulat — harus sama dengan sellPrice transaksi. */
      amount: v.number(),
      status: v.union(
        v.literal("UNPAID"),
        v.literal("PAID"),
        v.literal("EXPIRED"),
      ),
      /** Referensi dari payment gateway (RRN/transaction id). */
      gatewayRef: v.optional(v.string()),
      createdAt: v.number(),
      expiresAt: v.number(),
      paidAt: v.optional(v.number()),
      /** Callback mentah — jejak audit idempotensi webhook. */
      callbackPayload: v.optional(v.string()),
    })
      .index("by_invoice", ["invoiceId"])
      .index("by_status", ["status"]),

    /**
     * Callback payment gateway — APPEND-ONLY, dipakai untuk idempotensi.
     * Satu baris per event masuk; event dengan (invoiceId, eventId) yang sama
     * tidak boleh berefek finansial dua kali.
     */
    suWebhookEvents: defineTable({
      invoiceId: v.string(),
      eventId: v.string(),
      /** true bila event ini yang mengubah status menjadi PAID. */
      applied: v.boolean(),
      payload: v.string(),
      waktu: v.number(),
    })
      .index("by_invoice", ["invoiceId"])
      .index("by_event", ["eventId"]),

    /**
     * Pengaturan global STOP-UP! — satu baris (slot "global").
     * Berisi konfigurasi QRIS, Telegram Alert, dan perilaku layar sentuh.
     */
    suSettings: defineTable({
      slot: v.string(),
      // --- Terminal & interaksi ---
      /** Detik idle sebelum popup peringatan muncul (default 45). */
      idleResetDetik: v.optional(v.number()),
      /** Detik hitung mundur popup peringatan (default 15). */
      idleWarningDetik: v.optional(v.number()),
      /** Batas tunggu respons supplier di layar (default 25 detik). */
      supplierTimeoutDetik: v.optional(v.number()),
      /**
       * Mode Simulasi: tahan jawaban supplier supaya alur PENDING /
       * struk sementara bisa diuji tanpa menunggu supplier lambat sungguhan.
       */
      simulasiPending: v.optional(v.boolean()),
      // --- Payment gateway QRIS ---
      qrisProvider: v.optional(v.string()),
      qrisMerchantId: v.optional(v.string()),
      qrisMerchantName: v.optional(v.string()),
      qrisApiKey: v.optional(v.string()),
      qrisWebhookSecret: v.optional(v.string()),
      // --- Notifikasi Telegram ---
      telegramBotToken: v.optional(v.string()),
      telegramChatId: v.optional(v.string()),
      telegramAlertAktif: v.optional(v.boolean()),
      /** Ambang saldo supplier rendah (rupiah bulat, default 500_000). */
      lowBalanceThreshold: v.optional(v.number()),
      // --- Printer ---
      printerAktif: v.optional(v.boolean()),
      namaMerchantStruk: v.optional(v.string()),
      alamatStruk: v.optional(v.string()),
      footerStruk: v.optional(v.string()),
      /** Jam auto-reload browser untuk bersihkan memory leak (WIB, default 3). */
      autoReloadJamWib: v.optional(v.number()),
      diperbaruiPada: v.number(),
    }).index("by_slot", ["slot"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
