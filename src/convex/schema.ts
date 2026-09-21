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

    /** Persetujuan pelacakan lokasi berkelanjutan — satu baris per pengguna. */
    trackingConsents: defineTable({
      userId: v.id("users"),
      aktif: v.boolean(),
      disetujuiPada: v.optional(v.number()),
      dinonaktifkanPada: v.optional(v.number()),
    }).index("by_user", ["userId"]),

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
      /** Catatan penilaian/keputusan reviewer. */
      catatanReview: v.optional(v.string()),
      nomorReferensi: v.string(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

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
  },
  {
    schemaValidation: false,
  },
);

export default schema;
