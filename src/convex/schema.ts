import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

/**
 * Pinjam Gadai Digital
 *
 * STRICT TERMINOLOGY (Rule 2):
 * - "Pendana" — pihak yang menyediakan dana. Istilah lama "Penyedia Dana"
 *   tidak lagi dipakai di UI (dilarang: investor)
 * - "Peminjam" — pihak yang mengajukan pinjaman/gadai
 * - "Pendanaan"/"Alokasi Dana" — aktivitas penyaluran dana (dilarang: investasi)
 * - "Bunga"/"Imbal Hasil" — hak finansial pendana (dilarang: ROI/return)
 *
 * Rule 3: money is integer rupiah (never float). See src/lib/money.ts.
 * Rule 5.1: ledger_entries is append-only — never update or delete.
 */

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  /** Peminjam — borrower. */
  PEMINJAM: "peminjam",
  /** Dana — peran pendana yang masih tersimpan pada dokumen lama. */
  DANA: "dana",
  MEMBER: "member",
  /**
   * Pemantau lihat-saja — akun bersama pendana (login dengan kode
   * akses bersama, lihat `convex/aksesBersama.ts`). Sengaja dipisah dari
   * `dana`: peran ini TIDAK membuka satu pun mutation alokasi/transaksi —
   * hanya query baca di `convex/penyediaDana.ts` yang menerimanya.
   */
  PENGAMAT: "pengamat",
} as const;

/** Skema produk untuk tag jurnal ledger (lihat convex/ledger.ts). */
export const skemaLedgerValidator = v.union(
  v.literal("pinjaman"),
  v.literal("gadai"),
  v.literal("kredit"),
  v.literal("syariah"),
);

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.PEMINJAM),
  v.literal(ROLES.DANA),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.PENGAMAT),
);
export type Role = Infer<typeof roleValidator>;

/**
 * Status modul KYC mandiri — ejaan sesuai ketentuan produk.
 *
 * Aturan transisinya TIDAK hidup di skema maupun di UI, melainkan di
 * `src/lib/kycStatus.ts` dan ditegakkan `convex/kyc.ts`: validator di sini hanya
 * menjamin nilai yang tersimpan termasuk daftar yang dikenal.
 */
export const kycStatusValidator = v.union(
  v.literal("NOT_STARTED"),
  v.literal("IN_PROGRESS"),
  v.literal("PENDING_REVIEW"),
  v.literal("NEEDS_CORRECTION"),
  v.literal("VERIFIED"),
  v.literal("REJECTED"),
  v.literal("REVERIFICATION_REQUIRED"),
);
export type KycStatusValue = Infer<typeof kycStatusValidator>;

/** Siapa yang mengubah status KYC — selalu disimpan bersama waktu & alasan. */
export const aktorKycValidator = v.union(
  v.literal("nasabah"),
  v.literal("admin"),
  v.literal("sistem"),
);
export type AktorKycValue = Infer<typeof aktorKycValidator>;

/**
 * Ejaan status pinjaman yang tersimpan di tabel `loans`.
 *
 * Aplikasi sekarang mengenal EMPAT status (`ditinjau`, `didanai`,
 * `ditolak`, `lunas` — lihat `lib/statusPinjaman.ts`), tetapi validator ini
 * tetap menerima ejaan lama (`diajukan`, `sedang_direview`, `disetujui`) supaya
 * baris yang sudah ada tetap sah dibaca dan tidak ada data yang perlu
 * ditulis ulang. Ejaan lama tidak pernah ditulis lagi oleh kode aplikasi.
 */
export const loanStatusValidator = v.union(
  v.literal("diajukan"),
  v.literal("sedang_direview"),
  v.literal("disetujui"),
  v.literal("ditolak"),
  // Pinjaman yang telah didanai penuh oleh pendana (dana bersih telah dicairkan).
  v.literal("didanai"),
  // Peminjam (atau admin) menarik pengajuan SEBELUM dana ditandai tersalurkan.
  v.literal("dibatalkan"),
  // Kewajiban pokok + bunga telah dibayar penuh oleh Peminjam.
  v.literal("lunas"),
);
export type LoanStatusValue = Infer<typeof loanStatusValidator>;

/**
 * EMPAT status pinjaman yang ditawarkan dan ditulis aplikasi.
 * Dipakai sebagai argumen mutation `loans.ubahStatusPinjaman`, sehingga admin
 * tidak bisa lagi memilih tahap lama yang sudah digabung.
 */
export const loanStatusKanonikValidator = v.union(
  v.literal("ditinjau"),
  v.literal("didanai"),
  v.literal("ditolak"),
  // Pembatalan pengajuan pra-pencairan — sah dipilih admin maupun nasabah.
  v.literal("dibatalkan"),
  v.literal("lunas"),
);
export type LoanStatusKanonikValue = Infer<typeof loanStatusKanonikValidator>;

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
 * ditetapkan otomatis oleh sistem saat pendanaan terpenuhi penuh.
 */
export const kreditStatusValidator = v.union(
  v.literal("diajukan"),
  v.literal("sedang_ditinjau"),
  v.literal("disetujui"),
  v.literal("ditolak"),
  v.literal("didanai"),
  // Seluruh cicilan (pokok + Imbal Hasil) lunas — posisi pendana ditutup.
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
      /**
       * Bunga pinjaman khusus pengguna ini (persen, 0–100) — diatur admin.
       * Menang atas `persenBunga` Pengaturan Sistem; kosong = ikut global.
       */
      persenBunga: v.optional(v.number()),
      /** Kode pseudonim acak yang stabil; tidak berasal dari data identitas. */
      kodePeminjam: v.optional(v.string()),
      /**
       * Versi kode akses bersama yang sedang dipakai akun ini (peran
       * `pengamat`). Rotasi/nonaktif kode menaikkan versi sehingga pemakaian
       * lama langsung diputus walau token sesinya masih berlaku.
       */
      aksesBersamaVersi: v.optional(v.number()),
      /** Waktu sesi tamu terakhir diaktifkan dengan kode akses bersama. */
      aksesBersamaPada: v.optional(v.number()),
      /**
       * Nomor WhatsApp pemilik akun (format internasional tanpa tanda +:
       * `62…` untuk Indonesia, atau kode negara lain untuk pendana asing).
       *
       * Dipakai sebagai nomor kontak untuk laporan pendana, pengingat, dan
       * salinan dokumen. Sejak login WhatsApp dibuka untuk peminjam baru, nomor
       * yang sudah diverifikasi lewat OTP juga disimpan di sini supaya orang
       * yang sama masuk ke akun yang sama pada kunjungan berikutnya. Akun
       * buatan admin tanpa kredensial tidak pernah dipakai jalur ini.
       */
      nomorWhatsApp: v.optional(v.string()),
      /**
       * Bahasa laporan PDF pendana: "id" (bawaan) atau "en". Disimpan di akun
       * supaya pilihan mengikuti pendana saat masuk dari perangkat lain, dan
       * laporan WhatsApp memakai bahasa yang sama dengan unduhan.
       */
      bahasaLaporan: v.optional(v.union(v.literal("id"), v.literal("en"))),
      /**
       * Pengingat tagihan lewat WhatsApp untuk nasabah ini.
       * Hanya Super Admin yang menyalakan atau mematikannya dari panel nasabah;
       * nasabah tidak punya sakelar sendiri. Kosong = aktif. Nilai efektif
       * selalu `global && preferensi`, jadi mematikan sakelar global tetap
       * menahan pengingat walau baris ini true.
       */
      whatsappNotificationEnabled: v.optional(v.boolean()),
      /**
       * Nama lama sakelar WhatsApp. Masih ditulis bersama field di atas agar
       * data dan tes lama tetap terbaca; sumber kebenaran barunya
       * `whatsappNotificationEnabled`.
       */
      notifWhatsapp: v.optional(v.boolean()),
      /** Pengingat tagihan lewat email; diubah Super Admin dari panel nasabah. */
      notifEmail: v.optional(v.boolean()),
      /**
       * Waktu admin mencatat pemohon yang BELUM punya akun (nasabah walk-in,
       * data lama dari buku) beserta dokumennya. Akun begini sengaja tidak
       * punya kredensial masuk: pengelolaannya lewat panel admin, dan bila
       * pemohon mendaftar sendiri nanti ia memakai akun barunya.
       * Kosong = akun biasa yang dibuat pemiliknya lewat aplikasi.
       */
      dibuatAdminPada: v.optional(v.number()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_kodePeminjam", ["kodePeminjam"])
      // Login WhatsApp mencari akun lewat nomor yang sudah diverifikasi.
      .index("by_nomorWhatsApp", ["nomorWhatsApp"]),

    /**
     * Aplikasi pinjaman tunai Peminjam.
     * Semua nilai uang dalam rupiah bulat (integer). Tidak ada kolom duplikat
     * untuk biaya — biaya selalu diturunkan dari `pokokPinjaman` via
     * quoteLoan() agar tidak pernah ada dua sumber kebenaran.
     */
    loans: defineTable({
      /** Pemilik aplikasi (Peminjam). */
      userId: v.id("users"),
      /**
       * Pokok Pinjaman yang DISETUJUI admin — rupiah bulat. Inilah satu-satunya
       * angka yang dipakai seluruh perhitungan (bunga, kewajiban, pencairan,
       * jurnal, kontrak), sehingga admin dapat menyetujui lebih kecil daripada
       * yang diajukan tanpa ada dua sumber kebenaran. Diisi = `pokokDiajukan`
       * sampai admin memutuskan lain.
       */
      pokokPinjaman: v.number(),
      /**
       * Pokok yang DIAJUKAN Peminjam — rupiah bulat. Hanya jejak asli pengajuan:
       * tidak pernah dipakai untuk perhitungan uang. Kosong pada data lama
       * (artinya sama dengan `pokokPinjaman`).
       */
      pokokDiajukan: v.optional(v.number()),
      /** Keperluan pembiayaan. */
      tujuan: v.string(),
      /** Narasi singkat Peminjam untuk reviewer. */
      catatanPeminjam: v.optional(v.string()),
      /** Nama lengkap sesuai KTP. */
      namaLengkap: v.string(),
      /** Nama bank/e-wallet tujuan pencairan (opsional untuk data lama). */
      namaBank: v.optional(v.string()),
      /** Nomor rekening/akun tujuan dana bersih (98%). */
      nomorRekening: v.string(),
      status: loanStatusValidator,
      /** Catatan keputusan reviewer (wajib saat ditolak). */
      catatanReview: v.optional(v.string()),
      /** Nomor referensi manusiawi. */
      nomorReferensi: v.string(),
      /** Tenor pinjaman dalam hari (30/60/90) — dipilih saat pengajuan. */
      tenorHari: v.number(),
      /**
       * Peminjam mencentang pencairan ekspres saat mengajukan. `false` = memilih
       * pencairan biasa, sehingga `biayaExpress` pada quote menjadi 0. Kosong =
       * data lama yang dulu selalu dikenai biaya ekspres, jadi tetap dihitung
       * ekspres supaya angka kontrak lama tidak berubah.
       */
      cairEkspres: v.optional(v.boolean()),
      /**
       * Snapshot tarif potongan di muka yang berlaku saat pengajuan: biaya
       * admin, asuransi, dan nominal ekspres per tier. Kosong pada data lama =
       * tarif bawaan (admin 2%, asuransi 0%, ekspres Rp5.000/7.500/10.000),
       * sehingga kontrak lama tidak berubah saat admin mengubah tarif.
       */
      tarifBiaya: v.optional(
        v.object({
          adminPersen: v.number(),
          asuransiPersen: v.number(),
          ekspres: v.object({
            tier1: v.number(),
            tier2: v.number(),
            tier3: v.number(),
          }),
        }),
      ),
      /**
       * Waktu pengajuan tercatat bila berbeda dari `_creationTime` — dipakai
       * untuk data yang dimigrasikan/di-seed agar tanggal historisnya jujur.
       * Kosong = pakai `_creationTime`.
       */
      diajukanPada: v.optional(v.number()),
      /**
       * Tenor bulanan skema bulanan (1/3/6 bln: DP 0%, potongan di muka 2%, bunga
       * 10/8/7,5%/bln — lib/bulanan.ts) untuk pinjaman DI LUAR plafon 1 jt /
       * 28 hari. Kosong = pinjaman memakai skema harian quoteLoan().
       */
      tenorBulan: v.optional(v.number()),
      /**
       * Snapshot bunga efektif yang berlaku untuk pinjaman ini (persen).
       * Diisi saat pengajuan dari override admin nasabah; kosong pada data lama
       * = pakai `persenBunga` Pengaturan Sistem. Angka pinjaman yang sudah cair
       * tidak berubah walau override nasabah diubah kemudian.
       */
      persenBunga: v.optional(v.number()),
      /**
       * Promo bunga yang DIPAKAI saat pengajuan ini disimpan. Kosong = tidak
       * ada promo yang berlaku. `persenBunga` di atas berisi angka promo,
       * sedangkan `promoBungaPersenNormal` menyimpan tarif matriks asalnya agar
       * rincian/kontrak bisa menyebut potongannya tanpa menebak.
       */
      promoBungaId: v.optional(v.id("promoBunga")),
      promoBungaNama: v.optional(v.string()),
      /**
       * Bunga promo yang benar-benar dipakai saat pengajuan (persen). Disimpan
       * terpisah dari `persenBunga` karena voucher potongan bunga bisa
       * menurunkannya lagi; laporan subsidi promo harus memakai angka promo
       * itu, bukan tarif akhir setelah voucher.
       */
      promoBungaPersen: v.optional(v.number()),
      promoBungaPersenNormal: v.optional(v.number()),
      /**
       * Snapshot TARIF skema bulanan yang berlaku saat pinjaman ini dibuat:
       * bunga tenor 1/3/6, biaya layanan di muka, dan biaya admin cicilan.
       * Kosong pada pinjaman harian dan pada data lama (pakai tarif bawaan).
       * Semua hitung ulang jadwal, kontrak, dan bagi hasil bulanan membaca
       * snapshot ini — bukan Pengaturan Sistem yang berlaku hari ini.
       */
      tarifBulanan: v.optional(
        v.object({
          persenBungaBulanan1: v.number(),
          persenBungaBulanan3: v.number(),
          persenBungaBulanan6: v.number(),
          /** Kosong pada snapshot lama: tarif tenor 6 bulan yang berlaku. */
          persenBungaBulanan9: v.optional(v.number()),
          persenBungaBulanan12: v.optional(v.number()),
          persenBiayaLayananBulanan: v.number(),
          persenBiayaAdminCicilanBulanan: v.number(),
        }),
      ),
      /**
       * Sisa pokok setelah cicilan pokok atau perpanjangan. Kosong pada pinjaman
       * yang belum pernah memakai jalur perpanjangan = `pokokPinjaman`.
       */
      remainingPrincipal: v.optional(v.number()),
      /** Tier bunga periode berjalan (persen), ditetapkan saat perpanjangan. */
      currentTierRate: v.optional(v.number()),
      /** Jatuh tempo periode berjalan; mengalahkan didanaiPada + tenor. */
      nextDueDate: v.optional(v.number()),
      /** Bunga yang harus dibayar pada periode berjalan (rupiah bulat). */
      nextInterestAmount: v.optional(v.number()),
      /** Akumulasi bunga yang sudah dibayar lewat perpanjangan. */
      bungaTerbayar: v.optional(v.number()),
      /** Cacah perpanjangan yang sudah dicocokkan admin. */
      perpanjanganCount: v.optional(v.number()),
      /** Waktu perpanjangan terakhir dicocokkan. */
      perpanjanganTerakhirPada: v.optional(v.number()),
      /**
       * Waktu keputusan admin TERAKHIR atas pengajuan ini (perpindahan status
       * oleh petugas lewat `setLoanStatus`). Dipakai sebagai dasar waktu
       * notifikasi "status pinjaman berubah" dan jejak "kapan diputuskan".
       * Kosong pada baris lama (sebelum kolom ada) — notifikasi tidak dikarang
       * dengan menebak waktu dari `_creationTime`.
       */
      diputuskanPada: v.optional(v.number()),
      /** Terisi saat pinjaman didanai penuh dan dana bersih dicairkan. */
      didanaiPada: v.optional(v.number()),
      /** Terisi saat kewajiban pokok + bunga (+ denda bila terlambat) dibayar penuh. */
      lunasPada: v.optional(v.number()),
      /** Denda keterlambatan rupiah bulat yang dibayar saat pelunasan. */
      dendaTerlambat: v.optional(v.number()),
      /**
       * Ada angsuran yang dibayar melewati jatuh tempo. Dipakai penilai plafon:
       * pinjaman yang lunas di akhir tenor TIDAK dihitung tepat waktu bila salah
       * satu angsurannya pernah telat. Kosong pada data lama.
       */
      terlambatAngsuran: v.optional(v.boolean()),
      /**
       * Penyedia dana TUNGGAL pinjaman ini (model 1 pinjaman = 1 pendana —
       * tanpa sistem alokasi bertingkat). Diisi saat pinjaman didanai/di-seed.
       */
      pendanaId: v.optional(v.id("users")),
      /**
       * Nama pendana untuk kolom "Pendana" bila akunnya tidak ada
       * (cadangan data warisan/seed). Diisi bersama `pendanaId` bila mungkin.
       */
      pendanaNama: v.optional(v.string()),
      // ===== KYC wajib saat pengajuan =====
      // Aturan bentuk isian ada di lib/kyc.ts (validateKycInput) dan dipakai
      // form MAUPUN server; batas ukuran/jenis berkas diperiksa server lewat
      // convex/berkasIdentitas.ts (metadata + magic bytes storage). Kolom di
      // bawah ini hanya menyimpan MASUKAN pengajuan — tidak ada status
      // "identitas terverifikasi" di sini; putusan verifikasi hidup di
      // `nasabahProfil.verifikasiIdentitas`.
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
      /**
       * Berkas jaminan tambahan — wajib untuk tenor 3/6 bulan dan pokok
       * Rp3.000.000 ke atas (lihat `lib/kebijakanPinjaman`). Foto Kartu
       * Keluarga dan bukti domisili (tagihan PLN/PDAM).
       */
      dokKartuKeluargaId: v.optional(v.id("_storage")),
      dokBuktiDomisiliId: v.optional(v.id("_storage")),
      /**
       * Penitipan fisik kartu ATM. Hanya centang + nomor tanda terima yang
       * disimpan; PIN tidak pernah diminta, dikirim, atau disimpan.
       */
      atmDititipkan: v.optional(v.boolean()),
      nomorTandaTerimaAtm: v.optional(v.string()),
      /** Tanda tangan elektronik Peminjam (data URL PNG dari canvas). */
      tandaTanganPeminjam: v.optional(v.string()),
      /** Waktu tanda tangan elektronik Peminjam. */
      tandaTanganPada: v.optional(v.number()),
      /** Waktu Peminjam menyetujui syarat dan ketentuan akad. */
      persetujuanSyaratPada: v.optional(v.number()),
      /** Versi syarat dan ketentuan yang disetujui. */
      persetujuanSyaratVersi: v.optional(v.string()),
      /**
       * Waktu Peminjam mencentang persetujuan Syarat & Ketentuan saat MENGIRIM
       * pengajuan — sebelum admin memfasilitasi tanda tangan akad. Berbeda dari
       * `persetujuanSyaratPada` (akad resmi): pengajuan yang belum berjalan tetap
       * dapat dihapus walau kolom ini terisi.
       */
      persetujuanPengajuanPada: v.optional(v.number()),
      /** Versi Syarat & Ketentuan yang disetujui saat mengirim pengajuan. */
      persetujuanPengajuanVersi: v.optional(v.string()),
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
      // ===== Relasi ke MASTER NASABAH & KYC =====
      // Kolom di atas (nik, WA, dok KTP/selfie/slip) adalah SNAPSHOT pengajuan
      // yang dipertahankan untuk audit & data lama. MASTER data nasabah hidup di
      // `nasabahProfil` dan MASTER KYC di `kycProfil` — bukan di baris pinjaman.
      // Tiga kolom berikut mengikat pengajuan ke master itu tanpa menyalin
      // dokumen: satu nasabah → satu KYC → banyak pengajuan.
      /**
       * Referensi eksplisit ke akun NASABAH pemilik pengajuan (Borrower).
       * Selalu sama dengan `userId` pada pengajuan baru; diberi nama sendiri
       * supaya relasi LoanApplication → Borrower/Nasabah terbaca jelas dan tetap
       * stabil walau penamaan field pemilik berubah.
       */
      nasabahUserId: v.optional(v.id("users")),
      /** Baris KYC master yang dipakai saat pengajuan dikirim (bila ada). */
      kycProfilId: v.optional(v.id("kycProfil")),
      /** Snapshot status KYC saat pengajuan dikirim — untuk audit keputusan. */
      kycStatusSaatPengajuan: v.optional(kycStatusValidator),
      /** Penanda baris lama yang sudah dilekati relasi master oleh migrasi. */
      migrasiPada: v.optional(v.number()),
      /** Waktu pengajuan DIBATALKAN (status `dibatalkan`) — pra-pencairan saja. */
      dibatalkanPada: v.optional(v.number()),
      /** Label aktor pembatalan (nasabah/admin) untuk jejak cepat di baris. */
      dibatalkanOleh: v.optional(v.string()),
      /** Alasan pembatalan — opsional, tidak pernah diwajibkan. */
      alasanPembatalan: v.optional(v.string()),
      /**
       * Penanda KLAIM PEMINJAM LAMA (`convex/klaimPeminjam.ts`): akun yang
       * menjadi pemilik baris ini SEBELUM kepemilikannya ditautkan ke akun sesi
       * aktif. Nilai finansial baris tidak pernah berubah karena klaim — hanya
       * `userId` + penanda ini yang ditulis, supaya asal-usulnya tetap terlacak.
       */
      klaimDariUserId: v.optional(v.id("users")),
      /** Waktu kepemilikan baris ini berpindah karena klaim peminjam lama. */
      klaimPada: v.optional(v.number()),
      // ===== Voucher yang dipakai saat pengajuan =====
      // Angka di sini adalah SNAPSHOT: voucher boleh dicabut admin setelahnya,
      // tetapi kontrak pinjaman yang sudah terbit tidak berubah. `voucherDiskon`
      // dibaca ulang `quotePinjaman` sebagai potongan biaya admin di muka.
      voucherId: v.optional(v.id("voucher")),
      voucherKode: v.optional(v.string()),
      /** Potongan biaya admin di muka dari voucher (rupiah bulat). */
      voucherDiskon: v.optional(v.number()),
      /** Tambahan limit sekali pakai yang membuat pokok ini lolos plafon. */
      voucherBoost: v.optional(v.number()),
      /**
       * Potongan bunga dari voucher, dalam poin persen. Bunga efektif pinjaman
       * sudah dikurangi angka ini saat pengajuan disimpan; disimpan terpisah
       * supaya kontrak bisa menyebut asal potongannya.
       */
      voucherDiskonBunga: v.optional(v.number()),
      /**
       * Tambahan hari tenor dari voucher. `tenorHari` sudah memuat tambahan ini,
       * sehingga jatuh tempo memakai angka yang sama; kolom ini hanya jejak
       * asal-usulnya.
       */
      voucherTambahTenor: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_nasabah", ["nasabahUserId"])
      // Model 1 pinjaman = 1 pendana: dipakai ruang pendana, portofolio
      // pendana, dan rekap admin supaya semuanya membaca sumber yang sama.
      .index("by_pendana", ["pendanaId"])
      // Pencarian pemilik data lama lewat NOMOR WhatsApp (klaim/login peminjam
      // lama, `convex/klaimPeminjam.ts`). Nomor disimpan sudah ternormalisasi
      // (62…) oleh jalur pengajuan, jadi kecocokan bisa lewat indeks ini —
      // bukan pemindaian seluruh tabel.
      .index("by_nomorWhatsApp", ["nomorWhatsApp"])
      // Laporan efektivitas promo membaca pinjaman yang memakai satu promo;
      // tanpa indeks ini laporan harus memindai seluruh tabel pinjaman.
      .index("by_promoBunga", ["promoBungaId"])
      // Antrean transfer keuntungan pendana membaca pinjaman yang PALING BARU
      // dilunasi — urutan itu yang menentukan kewajiban mana yang harus
      // diselesaikan lebih dulu. Tanpa indeks, panel harus memindai seluruh
      // tabel pinjaman hanya untuk mengambil beberapa baris teratas, dan
      // panelnya gagal dimuat begitu data produksi bertambah. Baris tanpa
      // `lunasPada` (belum lunas) tidak masuk indeks ini.
      .index("by_lunasPada", ["lunasPada"]),

    /**
     * DRAF pengajuan pinjaman tunai — pekerjaan yang belum dikirim.
     *
     * Sengaja BUKAN baris di `loans`: draf bukan pengajuan resmi. Menyatukannya
     * ke `loans` akan membuat laporan ("total aplikasi"), antrean review admin,
     * ruang pendana, dan alokasi dana ikut menghitung sesuatu yang belum
     * diajukan — persis kelas galat integritas yang dihindari.
     *
     * Hanya memuat isian NON-IDENTITAS (nominal, tenor, tujuan, catatan). NIK,
     * nomor rekening, dokumen, dan tanda tangan baru dikumpulkan saat pengajuan
     * benar-benar dikirim, sehingga tidak ada data pribadi yang tersimpan tanpa
     * dasar persetujuan (lihat `lib/persetujuanKyc.ts`).
     */
    draftPinjaman: defineTable({
      userId: v.id("users"),
      /** Hanya satu nilai: draf selalu draf sampai dikirim atau dihapus. */
      status: v.literal("draft"),
      /** Skema harga terpilih: "harian" (1 jt / 28 hari) atau "bulanan". */
      skema: v.string(),
      pokokPinjaman: v.number(),
      tenorHari: v.number(),
      tenorBulan: v.optional(v.number()),
      tujuan: v.string(),
      catatanPeminjam: v.optional(v.string()),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
    }).index("by_user", ["userId"]),

    /**
     * RIWAYAT konfigurasi sistem — append-only, satu baris per perubahan.
     *
     * Menjawab "siapa mengubah apa, dari nilai berapa ke berapa, sejak kapan".
     * `sebelumJson`/`sesudahJson` menyimpan snapshot penuh supaya arah balik
     * (rollback) tidak perlu menebak, sedangkan `perubahanJson` menyimpan daftar
     * ringkas hasil `bandingkanConfig` (lib murni) untuk ditampilkan langsung.
     *
     * Sengaja TIDAK pernah diubah setelah ditulis: rollback membuat VERSI BARU
     * yang menyalin nilai lama — ia tidak menghapus atau menulis ulang sejarah.
     * Transaksi lama tetap memakai snapshot parameternya sendiri (mis.
     * `loans.persenBunga`), jadi mengubah konfigurasi tidak pernah menggeser
     * angka transaksi yang sudah tercatat.
     */
    configRiwayat: defineTable({
      slot: v.string(),
      /** Versi yang DICIPTAKAN baris ini. */
      versi: v.number(),
      /** Jenis perubahan: penyimpanan biasa atau rollback ke versi lama. */
      jenis: v.union(v.literal("simpan"), v.literal("rollback")),
      /** Versi sumber saat rollback (kosong untuk penyimpanan biasa). */
      dariVersi: v.optional(v.number()),
      /** Waktu konfigurasi versi ini mulai BERLAKU (server). */
      berlakuSejak: v.number(),
      diubahOleh: v.string(),
      diubahOlehUserId: v.optional(v.id("users")),
      catatan: v.optional(v.string()),
      sebelumJson: v.string(),
      sesudahJson: v.string(),
      perubahanJson: v.string(),
      dibuatPada: v.number(),
    })
      .index("by_slot_versi", ["slot", "versi"])
      .index("by_slot_dibuatPada", ["slot", "dibuatPada"]),

    /**
     * Kunci idempotensi mutasi sensitif (lihat `convex/idempotensi.ts`).
     *
     * Satu baris = satu (pengguna, kunci). Menyimpan HASIL operasi supaya
     * pengiriman ulang karena jaringan mengembalikan jawaban yang sama alih-alih
     * membuat transaksi kedua. Baris lama dibersihkan cron harian.
     */
    idempotencyKeys: defineTable({
      userId: v.id("users"),
      /** Kunci acak dari klien; unik per pengguna. */
      kunci: v.string(),
      /** Nama operasi pemilik kunci — kunci tidak boleh dipakai lintas operasi. */
      operasi: v.string(),
      /** Hasil operasi yang berhasil, diserialkan sebagai JSON. */
      hasilJson: v.string(),
      dibuatPada: v.number(),
    })
      .index("by_user_kunci", ["userId", "kunci"])
      .index("by_dibuatPada", ["dibuatPada"]),

    /**
     * Data diri nasabah yang diisi/diperbarui ADMIN — satu baris per pengguna.
     *
     * Dipisah dari tabel `users` (auth) supaya identitas kependudukan tidak
     * menempel pada dokumen autentikasi, dan menyamai pola tabel "satu baris
     * per pengguna" lain (mfaSettings, trackingConsents, lokasiStatus).
     *
     * Isian wajib: nama, NIK 16 digit, nomor WhatsApp (62…). Sisanya opsional —
     * kosong disimpan sebagai field yang TIDAK ada, bukan string kosong. Foto
     * KTP adalah referensi Convex storage; berkas lama dihapus saat diganti atau
     * dikosongkan. Aturan validasinya satu sumber dengan form, lihat
     * lib/dataDiri.ts (bacaDataDiri).
     */
    nasabahProfil: defineTable({
      userId: v.id("users"),
      namaLengkap: v.string(),
      /** NIK 16 digit sesuai KTP. */
      nik: v.string(),
      /** Nomor WhatsApp format 62… tanpa tanda +. */
      nomorWhatsApp: v.string(),
      alamat: v.optional(v.string()),
      pekerjaan: v.optional(v.string()),
      /** Penghasilan per bulan — rupiah bulat. */
      penghasilanBulanan: v.optional(v.number()),
      namaBank: v.optional(v.string()),
      nomorRekening: v.optional(v.string()),
      /** Foto KTP yang diunggah admin (Convex storage). */
      fotoKtpId: v.optional(v.id("_storage")),
      diperbaruiPada: v.number(),
      /** Label admin penyunting terakhir — snapshot agar tetap terbaca. */
      diperbaruiOlehLabel: v.string(),
      /**
       * Sumber penyuntingan terakhir: "admin" (panel admin) atau "nasabah"
       * (sunting mandiri dari dashboard). Dipakai untuk memberi tahu kedua
       * pihak siapa yang terakhir mengubah — suntingan admin tetap menjadi
       * acuan karena panel admin selalu menimpa saat disimpan.
       */
      sumber: v.optional(v.union(v.literal("admin"), v.literal("nasabah"))),
      /**
       * Penanda bahwa baris ini DIBUAT oleh alat migrasi data lama (bukan oleh
       * admin/nasabah). Dipakai supaya migrasi dapat dibatalkan dengan aman:
       * hanya baris berpenanda inilah yang boleh dihapus kembali.
       */
      dibuatMigrasi: v.optional(v.boolean()),
      /**
       * PUTUSAN verifikasi identitas oleh petugas — sengaja TERPISAH dari
       * keputusan pinjaman (status di tabel `loans`).
       *
       * Kosong = belum ada putusan. Mengunggah dokumen TIDAK pernah mengisi
       * kolom ini: yang bisa mengisinya hanya mutation admin
       * (`admin.verifikasiIdentitasNasabah`) yang tercatat di audit trail.
       * Kolom ini juga TIDAK dibaca oleh alur persetujuan pinjaman — jadi
       * "dokumen sudah diunggah" tidak pernah diperlakukan sebagai "identitas
       * sudah terverifikasi", dan sebaliknya pinjaman yang disetujui tidak
       * membuat identitas menjadi terverifikasi.
       *
       * Direset otomatis (dihapus) saat data identitas berubah — nama, NIK,
       * atau foto KTP — karena putusan lama tidak lagi mewakili data baru.
       */
      verifikasiIdentitas: v.optional(
        v.object({
          status: v.union(v.literal("terverifikasi"), v.literal("ditolak")),
          /** Waktu putusan petugas (ms). */
          pada: v.number(),
          /** Label petugas yang memutuskan (snapshot agar tetap terbaca). */
          olehLabel: v.string(),
          /** Alasan/catatan — wajib saat ditolak supaya bisa ditindaklanjuti. */
          catatan: v.optional(v.string()),
        }),
      ),
    })
      .index("by_user", ["userId"])
      // Master nasabah dicari lewat nomor WhatsApp saat klaim akun lama
      // (`convex/klaimPeminjam.ts`) — satu-satunya jalan supaya peminjam lama
      // bisa ditemukan TANPA memindai semua baris.
      .index("by_nomorWhatsApp", ["nomorWhatsApp"])
      // NIK dipakai untuk menolak identitas ganda (satu KTP, satu akun) dan
      // untuk mencari nasabah dari NIK tepat di panel KYC — keduanya pencarian
      // TEPAT, jadi cukup indeks; tidak ada pencarian sebagian.
      .index("by_nik", ["nik"]),

    /**
     * OVERRIDE risiko nasabah — keputusan petugas atas grade hasil model.
     *
     * APPEND-ONLY dan sengaja TIDAK menyimpan "grade yang berlaku" di tabel
     * lain: baris terbaru (per `dibuatPada`) adalah yang berlaku, sehingga
     * riwayat keputusan tidak bisa ditulis ulang. Setiap baris menyimpan grade
     * SISTEM saat itu juga (`gradeSistem`/`skorSistem`), supaya selisih antara
     * hitungan mesin dan keputusan manusia selalu terlihat — bukan tersembunyi.
     *
     * Override TIDAK mengubah `loans`, `plafon`, atau transfer apa pun; ia
     * hanya mengubah GRADE yang ditampilkan/dipertimbangkan peninjau, dan
     * seluruhnya tercatat di `auditLog` (aksi "override_risiko").
     */
    risikoOverride: defineTable({
      userId: v.id("users"),
      /** Grade hasil model sistem saat override dibuat (rekam jejak selisih). */
      gradeSistem: v.string(),
      skorSistem: v.number(),
      /** Grade pilihan petugas — salah satu `GRADE_RISIKO` (A–E). */
      gradeOverride: v.string(),
      /** Alasan wajib, minimal `PANJANG_MIN_ALASAN_OVERRIDE` karakter. */
      alasan: v.string(),
      olehUserId: v.id("users"),
      olehLabel: v.string(),
      dibuatPada: v.number(),
    }).index("by_user_dibuatPada", ["userId", "dibuatPada"]),

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
      /**
       * Template pemberitahuan perubahan status pinjaman — placeholder
       * {nama} {ref} {status} {alasan} {diajukan} {disetujui} {kewajiban}.
       * Dikirim otomatis saat admin mengubah status, dan bisa dikirim ulang
       * manual dari dialog review. Tidak pernah menagih uang.
       */
      templateStatus: v.optional(v.string()),
      /**
       * Template pesan per JENIS (kunci = JenisTemplateWa, mis. "pengingat_h3").
       * Satu peta untuk semua jenis supaya menambah jenis baru tidak menambah
       * kolom; isi, placeholder wajib, dan bawaannya satu sumber di
       * `lib/templatePesanWa`. Kunci yang tidak ada = pakai teks bawaan.
       */
      templatesWa: v.optional(v.record(v.string(), v.string())),
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
    })
      .index("by_loan", ["loanId"])
      // Dipakai job retensi harian: hapus baris lebih tua dari ambang admin.
      .index("by_waktu", ["waktu"]),

    /**
     * Pengiriman dokumen rincian pinjaman (email/WhatsApp) — append-only.
     * Dipakai dua hal sekaligus: jejak audit "siapa mengirim apa ke siapa"
     * dan pembatas laju, karena email berbayar per kirim.
     */
    rincianKirimLog: defineTable({
      loanId: v.id("loans"),
      /** "email" | "whatsapp". */
      kanal: v.string(),
      /** Alamat email atau nomor WhatsApp tujuan (kontak terdaftar peminjam). */
      tujuan: v.string(),
      /** "diproses" | "terkirim" | "gagal". */
      status: v.string(),
      respon: v.optional(v.string()),
      olehUserId: v.id("users"),
      /** Diisi bila kiriman dipicu pencairan, bukan klik admin. */
      otomatis: v.optional(v.boolean()),
      pada: v.number(),
    })
      .index("by_loan", ["loanId", "pada"])
      .index("by_loan_kanal", ["loanId", "kanal"])
      .index("by_oleh", ["olehUserId", "pada"]),

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
      /**
       * Alasan titik tidak dipakai lagi sebagai lokasi nasabah. Diisi oleh
       * pemulihan jejak pratinjau ("pratinjau_admin"): titik itu ditulis dari
       * perangkat admin saat "masuk sebagai", bukan dari perangkat nasabah.
       * Barisnya TIDAK dihapus supaya jejak audit tetap utuh; pembaca peta,
       * riwayat, dan status lokasi melewatinya.
       */
      dikecualikan: v.optional(v.string()),
      /** Baris pratinjau yang menyebabkan titik ini dikecualikan. */
      pratinjauSesiId: v.optional(v.id("pratinjauSesi")),
    })
      .index("by_user", ["userId"])
      .index("by_loan", ["loanId"])
      // Dipakai job retensi (crons.ts) untuk mengambil titik tertua lebih dulu.
      .index("by_waktu", ["waktu"]),

    /**
     * TAUTAN STATUS per pinjaman — token acak yang dikirim admin lewat WhatsApp
     * dan membuka halaman `/cek-status/<token>`.
     *
     * Kenapa token, bukan nomor referensi: nomor referensi berurutan dan mudah
     * dicacah, sehingga halaman status berbasis referensi membocorkan nama,
     * nominal, dan tanggal jatuh tempo nasabah lain (lihat `lib/tautanStatus`).
     * Satu baris = satu token; token lama dibiarkan sebagai riwayat sampai
     * kedaluwarsa, dan tautan baru dibuat bila yang lama sudah lewat masa
     * berlakunya.
     */
    tautanVerifikasi: defineTable({
      loanId: v.id("loans"),
      /** Token heksadesimal (32 karakter) — satu-satunya kunci halaman publik. */
      token: v.string(),
      dibuatPada: v.number(),
      kedaluwarsaPada: v.number(),
      /** Admin yang membuat tautan (jejak audit). */
      dibuatOlehUserId: v.optional(v.id("users")),
      /** Berapa kali halaman dibuka — dipakai panel admin melihat respons nasabah. */
      jumlahBuka: v.optional(v.number()),
      terakhirDibuka: v.optional(v.number()),
      /** Titik lokasi terakhir dari tautan ini (pembatas jeda ping). */
      terakhirPing: v.optional(v.number()),
      /** Jumlah titik pada hari yang sama (`hariPing`) — pembatas kuota harian. */
      jumlahPing: v.optional(v.number()),
      /** Indeks hari (epoch ms / 86.400.000) kapan `jumlahPing` terakhir diisi. */
      hariPing: v.optional(v.number()),
      /** Berapa berkas selfie yang pernah diunggah dari tautan ini. */
      jumlahUnggah: v.optional(v.number()),
      /** Waktu verifikasi selfie terakhir berhasil disimpan. */
      diverifikasiPada: v.optional(v.number()),
    })
      .index("by_token", ["token"])
      .index("by_loan", ["loanId"]),

    /**
     * RIWAYAT LOKASI dari tautan WhatsApp (`updatedAt` = waktu server).
     *
     * Ditulis setiap kali halaman `/cek-status` mengirim titik (tiap ±10 detik
     * selama halaman terbuka) dan saat verifikasi selfie. Titik yang lolos
     * pemeriksaan juga disalin ke `lokasiJejak` supaya peta live admin, deteksi
     * lokasi palsu, dan retensi memakai satu jalur yang sama; baris di sini
     * menyimpan asal-usulnya (`source`) beserta IP/UA pemakai.
     */
    live_locations: defineTable({
      borrowerId: v.id("users"),
      loanId: v.optional(v.id("loans")),
      latitude: v.number(),
      longitude: v.number(),
      /** Akurasi GPS dalam meter seperti dilaporkan perangkat. */
      accuracy: v.number(),
      /** "whatsapp_link_click" (ping berkala) atau "verifikasi_tautan". */
      source: v.string(),
      updatedAt: v.number(),
      /** IP pemakai dari header HTTP action (bukan klaim klien). */
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      /**
       * Catatan bila titik TIDAK ikut tersalin ke jejak resmi (mis. ditolak
       * pemeriksa lokasi palsu). Titiknya tetap disimpan di sini sebagai bukti
       * apa yang benar-benar dilaporkan perangkat.
       */
      catatan: v.optional(v.string()),
    })
      .index("by_loan", ["loanId"])
      .index("by_borrower", ["borrowerId"])
      .index("by_updatedAt", ["updatedAt"]),

    /**
     * AUDIT VERIFIKASI: hasil foto selfie + waktu + koordinat + IP/UA pemakai.
     *
     * Append-only — satu baris per verifikasi yang benar-benar diterima server.
     * Berkas fotonya ada di penyimpanan Convex (`_storage`); baris ini menyimpan
     * ID-nya, ukuran berkas, dan seluruh konteks pengambilan supaya tim audit
     * bisa mempertanggungjawabkan siapa mengirim apa, kapan, dan dari mana.
     */
    verifikasiLokasi: defineTable({
      loanId: v.id("loans"),
      borrowerId: v.id("users"),
      tautanId: v.id("tautanVerifikasi"),
      selfieFileId: v.id("_storage"),
      /** Ukuran berkas yang benar-benar tersimpan (byte). */
      selfieByte: v.number(),
      /** Waktu pengambilan menurut perangkat peminjam. */
      diambilPada: v.number(),
      /** Waktu server menerimanya — pembanding jam perangkat. */
      diterimaPada: v.number(),
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      accuracy: v.optional(v.number()),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      /** Selalu "verifikasi_tautan" untuk jalur ini (lihat `lib/tautanStatus`). */
      sumber: v.string(),
    })
      .index("by_loan", ["loanId"])
      .index("by_diterima", ["diterimaPada"]),

    /**
     * Proteksi otentikasi (2FA TOTP admin & OTP WA pendana) — satu baris per
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
      /**
       * WARISAN — JANGAN DIPAKAI. Dulu kode OTP WA disimpan PLAINTEXT di tiga
       * kolom ini. Sejak OTP pindah ke `waOtpChallenges` (hash ber-salt, terikat
       * pengguna + nomor + tujuan), tidak ada kode yang ditulis ke sini lagi.
       * Kolomnya masih ada hanya supaya baris lama tetap sah dibaca; boleh
       * dihapus setelah dipastikan tidak ada dokumen yang memakainya.
       */
      waOtpKode: v.optional(v.string()),
      /** WARISAN — JANGAN DIPAKAI. Lihat catatan di `waOtpKode`. */
      waOtpKedaluwarsa: v.optional(v.number()),
      /**
       * WARISAN — kegagalan verifikasi OTP kini dihitung per kode di
       * `waOtpChallenges.percobaanGagal`. JANGAN DIPAKAI.
       */
      waOtpGagal: v.optional(v.number()),
      /** Setelah true, transaksi finansial pendana wajib OTP WhatsApp. */
      waOtpWajib: v.optional(v.boolean()),
      /**
       * Izin transaksi sekali pakai hasil `otpWhatsapp.verifikasiOtpWa` (epoch
       * ms). Selama masih berlaku, mutation finansial boleh lanjut tanpa
       * mengirim ulang kode — dan izin itu langsung dihabiskan oleh mutation
       * yang memakainya (lihat `alokasiDana.requireWaOtpIfEnabled`).
       */
      waOtpTerverifikasiSampai: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /**
     * Tantangan OTP WhatsApp — SATU baris per kode yang dikirim.
     *
     * Kenapa tabel terpisah dari `mfaSettings`: kode OTP harus terikat pada
     * PENGGUNA + NOMOR + TUJUAN verifikasi, punya masa berlaku, batas percobaan,
     * dan status sekali-pakai masing-masing. Menyimpannya sebagai satu kolom di
     * baris MFA membuat kode untuk satu keperluan mudah tertukar dengan kode
     * keperluan lain.
     *
     * Yang disimpan adalah HASH `SHA-256(salt + ":" + kode)` — kode aslinya
     * tidak pernah masuk database, log, maupun balasan API. Kode hanya berubah
     * menjadi "terverifikasi" lewat mutation `verifikasiOtpWa`; respons sukses
     * dari Fonnte hanya menandai `statusPengiriman`.
     */
    waOtpChallenges: defineTable({
      userId: v.id("users"),
      /** Nomor tujuan ternormalisasi (62…) — kode hanya sah untuk nomor ini. */
      nomor: v.string(),
      /** Tujuan verifikasi (`verifikasi_nomor` | `transaksi`). */
      tujuan: v.string(),
      /** SHA-256(salt + ":" + kode) dalam heksadesimal. */
      kodeHash: v.string(),
      /** Salt acak per kode (16 byte hex). */
      salt: v.string(),
      dibuatPada: v.number(),
      kedaluwarsaPada: v.number(),
      /** Batas percobaan verifikasi untuk kode ini. */
      maksPercobaan: v.number(),
      /** Percobaan verifikasi gagal berturut-turut untuk kode ini. */
      percobaanGagal: v.number(),
      /** Terisi saat kode dipakai — sekali pakai, tidak bisa diulang. */
      dipakaiPada: v.optional(v.number()),
      /** "terkirim" | "gagal" — hasil panggilan Fonnte (bukan status verifikasi). */
      statusPengiriman: v.string(),
      /** Respon Fonnte yang sudah dipotong untuk diagnosis (tanpa token). */
      responPengiriman: v.optional(v.string()),
      /** IP klien (dikirim klien; Convex tidak mengekspos IP) untuk pembatas laju. */
      ip: v.optional(v.string()),
      userAgent: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_user_tujuan", ["userId", "tujuan"])
      .index("by_nomor", ["nomor"])
      .index("by_ip", ["ip"]),

    /**
     * Perangkat dipercaya ("ingat perangkat ini") — Super Admin yang sudah
     * lolos TOTP boleh melewati gate TOTP di perangkat yang sama tanpa
     * memasukkan kode lagi, hingga kedaluwarsa.
     *
     * Token disimpan HANYA sebagai hash SHA-256 (nilai aslinya cuma ada di
     * localStorage perangkat), terikat pada satu `userId`, punya masa berlaku,
     * dan dapat dicabut. Mencabut/menonaktifkan 2FA mematikan seluruh baris ini.
     */
    trustedDevices: defineTable({
      userId: v.id("users"),
      /** SHA-256 hex dari token perangkat — bukan token aslinya. */
      tokenHash: v.string(),
      /** Label perangkat untuk ditampilkan di panel keamanan. */
      perangkat: v.string(),
      /** IP saat token dibuat/dipakai terakhir (opsional, untuk audit). */
      ip: v.optional(v.string()),
      dibuatPada: v.number(),
      /** Lewat waktu ini token tidak lagi berlaku. */
      kedaluwarsaPada: v.number(),
      /** Waktu token terakhir dipakai untuk melewati gate. */
      terakhirDipakai: v.optional(v.number()),
      /** Terisi saat token dicabut — baris tetap ada untuk jejak audit. */
      dicabutPada: v.optional(v.number()),
    })
      .index("by_user", ["userId"])
      .index("by_tokenHash", ["tokenHash"]),

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
     * Pembatas permintaan token aktivasi/reset kata sandi Super Admin —
     * pencatat yang dihitung server, diisi di dalam `adminPassword.authorize`
     * SEBELUM provider kata sandi membuat kode verifikasi dan mengirim email.
     * Tanpa batas ini alamat admin bisa dibanjiri email token oleh penyerang.
     * 3 permintaan / 15 menit per alamat; berlaku untuk semua alamat supaya
     * balasan blokir tidak menandai alamat admin.
     */
    adminTokenRequests: defineTable({
      /** Email tujuan (lowercase). */
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
     * Persetujuan risiko pendanaan — catatan SISI SERVER, append-only.
     *
     * Pendana mencentang pernyataan risiko di ruang pendana, dan yang tersimpan
     * adalah catatan server atas nama AKUN-nya: versi teks yang benar-benar
     * dibaca (`versiTeks` mengacu `RISK_TEXT_VERSION` di
     * `src/lib/teksRisikoPendanaan.ts`), waktu, dan peran saat menyetujui.
     * Sengaja BUKAN `localStorage`: persetujuan harus tetap terbaca walau
     * pembaca berganti perangkat, dan tidak bisa hilang karena peramban
     * dibersihkan.
     *
     * Baris lama tidak pernah ditimpa atau dihapus. Bila kalimat risikonya
     * berubah, `RISK_TEXT_VERSION` naik, pendana diminta menyetujui versi baru,
     * dan riwayat versi sebelumnya tetap tersimpan sebagai jejak versi mana yang
     * pernah disetujui siapa dan kapan.
     */
    persetujuanRisikoPendana: defineTable({
      userId: v.id("users"),
      /** Versi teks risiko yang disetujui (`RISK_TEXT_VERSION` saat itu). */
      versiTeks: v.number(),
      /** Peran akun saat menyetujui — hanya `dana` atau `pengamat`. */
      peran: v.union(v.literal(ROLES.DANA), v.literal(ROLES.PENGAMAT)),
      /** Kalimat persetujuan yang dibaca, disalin apa adanya saat menyetujui. */
      pernyataan: v.string(),
      disetujuiPada: v.number(),
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
     * Kode akses bersama pendana — satu baris global (slot "global").
     *
     * Kode disimpan HANYA sebagai hash SHA-256: nilai aslinya ditampilkan
     * sekali saat admin menerbitkannya, dan tidak pernah dapat dibaca lagi
     * dari basis data. `versi` naik setiap penerbitan/nonaktif, sehingga
     * seluruh pemakai lama terputus seketika tanpa perlu menghapus apa pun.
     */
    aksesBersama: defineTable({
      /** Selalu "global" — hanya ada satu baris. */
      slot: v.string(),
      /** SHA-256 dari kode (hex) — bukan kode aslinya. */
      kodeHash: v.optional(v.string()),
      /** Flag aktif; matikan tanpa menghapus baris. */
      aktif: v.optional(v.boolean()),
      /** Naik pada setiap penerbitan/nonaktif — pemutus seluruh pemakai lama. */
      versi: v.number(),
      diterbitkanPada: v.optional(v.number()),
      diperbaruiPada: v.number(),
      /** Waktu percobaan gagal dalam jendela berjalan (maks 2× batas). */
      gagalTerakhir: v.optional(v.array(v.number())),
      /** Sampai kapan percobaan dibekukan (epoch ms). */
      blokirSampai: v.optional(v.number()),
    }).index("by_slot", ["slot"]),

    /**
     * Konfigurasi sistem — satu baris global (slot "global").
     * Diubah dari /admin → Pengaturan System; kill switch menghentikan
     * seluruh pengajuan baru (pinjaman & gadai) seketika.
     */
    systemConfig: defineTable({
      slot: v.string(),
      /** Nomor versi konfigurasi yang berlaku; 1 = default sebelum perubahan. */
      versi: v.optional(v.number()),
      /** Kill switch: blokir semua pengajuan & pencairan baru. */
      killSwitch: v.optional(v.boolean()),
      /** Mode perawatan: frontend menampilkan halaman pengumuman. */
      maintenanceMode: v.optional(v.boolean()),
      /** Sakelar produk pengajuan; kosong = aktif (baris lama). */
      produkPinjamanAktif: v.optional(v.boolean()),
      produkKreditAktif: v.optional(v.boolean()),
      produkGadaiAktif: v.optional(v.boolean()),
      /** Persentase biaya — diubah dari default 3/2/30 untuk penyesuaian. */
      persenAdmin: v.optional(v.number()),
      persenPlatform: v.optional(v.number()),
      persenBunga: v.optional(v.number()),
      /** Biaya admin pinjaman yang dipotong di muka (% dari pokok). */
      persenBiayaAdmin: v.optional(v.number()),
      /** Margin Murabahah semua produk (% harga pokok, sekali per akad). */
      persenMarginSyariah: v.optional(v.number()),
      /** Porsi pendana atas margin/ujrah syariah (%); sisanya ujrah pengelola. */
      persenNisbahPendanaSyariah: v.optional(v.number()),
      /** Bunga flat skema bulanan tenor 1/3/6 bulan (% per bulan). */
      persenBungaBulanan1: v.optional(v.number()),
      persenBungaBulanan3: v.optional(v.number()),
      persenBungaBulanan6: v.optional(v.number()),
      /** Bunga flat tenor 9 dan 12 bulan (% per bulan); kosong = ikut tenor 6. */
      persenBungaBulanan9: v.optional(v.number()),
      persenBungaBulanan12: v.optional(v.number()),
      /** Biaya layanan skema bulanan yang dipotong di muka (% dari pokok). */
      persenBiayaLayananBulanan: v.optional(v.number()),
      /** Biaya admin cicilan bulanan (% dari nominal cicilan tiap pembayaran). */
      persenBiayaAdminCicilanBulanan: v.optional(v.number()),
      /** Biaya asuransi yang dipotong di muka (% dari pokok); 0 = mati. */
      persenAsuransi: v.optional(v.number()),
      /** Nominal biaya pencairan ekspres per tier pokok. */
      biayaEkspresTier1: v.optional(v.number()),
      biayaEkspresTier2: v.optional(v.number()),
      biayaEkspresTier3: v.optional(v.number()),
      /** Denda keterlambatan per hari (% dari pokok); total dibatasi 100%. */
      persenDendaKeterlambatan: v.optional(v.number()),
      /** Persentase biaya admin & platform saat integrasi pinjaman lama ke ledger. */
      persenBiayaIntegrasi: v.optional(v.number()),
      /**
       * Gaya tampilan situs (lembaga/tenang/komunitas) — sumbu kedua template,
       * terpisah dari palet warna di `tema`. Lihat `lib/template-gaya`.
       */
      gaya: v.optional(v.string()),
      /**
       * Sakelar efek musiman (salju/konfeti). Terpisah dari palet supaya admin
       * bisa memakai warna musiman tanpa animasi layar penuh, dan sebaliknya.
       */
      efekMusiman: v.optional(v.boolean()),
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
      /** Sakelar GLOBAL admin untuk pengingat tagihan lewat WhatsApp. */
      notifWhatsappAktif: v.optional(v.boolean()),
      /** Sakelar GLOBAL admin untuk pengingat tagihan lewat email. */
      notifEmailAktif: v.optional(v.boolean()),
      /** Kirim laporan pelunasan ke pendana otomatis saat lunas. */
      laporanPelunasanOtomatis: v.optional(v.boolean()),
      /**
       * Retensi jejak lokasi (hari) untuk job cron `retensi-lokasi-jejak`.
       * Titik milik pinjaman belum selesai tetap ditahan minimal 400 hari.
       */
      retensiLokasiHari: v.optional(v.number()),
      /**
       * Retensi isi pesan WhatsApp (hari) untuk job cron `retensi-log-wa`.
       * Kosong berarti bawaan 180 hari.
       */
      retensiLogWaHari: v.optional(v.number()),
      /**
       * Retensi jejak audit (hari) untuk job cron `retensi-audit`.
       * Kosong berarti bawaan 730 hari.
       */
      retensiAuditHari: v.optional(v.number()),
      /** Plafon awal pinjaman tunai untuk semua Peminjam (rupiah bulat). */
      plafonPinjaman: v.optional(v.number()),
      /** Informasi pembayaran manual yang ditampilkan ke pengguna masuk. */
      rekeningUsahaNama: v.optional(v.string()),
      rekeningUsahaBank: v.optional(v.string()),
      rekeningUsahaNomor: v.optional(v.string()),
      /** Identitas badan yang tercetak di surat resmi (somasi). */
      namaBadan: v.optional(v.string()),
      alamatUsaha: v.optional(v.string()),
      emailResmi: v.optional(v.string()),
      teleponResmi: v.optional(v.string()),
      qrisMerchantNama: v.optional(v.string()),
      qrisImageId: v.optional(v.union(v.id("_storage"), v.null())),
      /** Gate off until downstream allocations, disbursements, and withdrawals are ready. */
      manualDepositEnabled: v.optional(v.boolean()),
      /** Preset tema aman dari whitelist; tidak menerima CSS arbitrer. */
      tema: v.optional(
        v.union(
          v.literal("tinta"),
          v.literal("pesisir"),
          v.literal("terakota"),
          v.literal("salju"),
          v.literal("karnival"),
          v.literal("obsidian"),
        ),
      ),
      /**
       * SISA FITUR YANG SUDAH DICABUT: template 3D landing page publik.
       *
       * Enam adegan WebGL-nya sudah dihapus dari frontend (hero landing kini
       * satu panggung terang yang statis), begitu pula query dan mutation yang
       * mengubahnya — jadi tidak ada kode yang membaca atau menulis kolom ini
       * lagi.
       *
       * Kolom beserta union-nya SENGAJA dibiarkan apa adanya: mencabutnya dari
       * skema membuat baris `systemConfig` lama yang masih menyimpan nilai ini
       * gagal validasi saat dibaca. Membersihkannya butuh mutasi pembersih
       * tersendiri — tidak sepadan untuk satu kolom opsional yang tidak
       * mengganggu apa pun.
       */
      landingTemplate: v.optional(
        v.union(
          v.literal("premium-card"),
          v.literal("cyber-vault"),
          v.literal("ai-mascot"),
          v.literal("ledger-matrix"),
          v.literal("loan-simulator"),
          v.literal("quantum-portal"),
        ),
      ),
      /** Waktu terakhir konfigurasi diperbarui. */
      diperbaruiPada: v.number(),
    }).index("by_slot", ["slot"]),

    /**
     * Pengaturan aplikasi Android — satu baris global (slot "global").
     *
     * Admin mengganti splash screen, logo di dalam aplikasi, nama aplikasi, dan
     * warna splash TANPA build ulang: aplikasi membuka berkas ini setiap kali
     * dibuka. Berkas disimpan di Convex storage; yang tersimpan di sini hanya
     * referensinya + nama berkas aslinya (untuk ditampilkan di panel).
     * Ikon launcher di layar utama tetap milik APK — lihat lib/asetAndroidApp.ts.
     */
    androidAppConfig: defineTable({
      slot: v.string(),
      namaAplikasi: v.optional(v.string()),
      warnaSplash: v.optional(v.string()),
      warnaTeksSplash: v.optional(v.string()),
      ikonId: v.optional(v.union(v.id("_storage"), v.null())),
      ikonNama: v.optional(v.string()),
      ikonPada: v.optional(v.number()),
      ikonSplashId: v.optional(v.union(v.id("_storage"), v.null())),
      ikonSplashNama: v.optional(v.string()),
      ikonSplashPada: v.optional(v.number()),
      splashId: v.optional(v.union(v.id("_storage"), v.null())),
      splashNama: v.optional(v.string()),
      splashPada: v.optional(v.number()),
      diperbaruiPada: v.number(),
      diperbaruiOleh: v.optional(v.string()),
    }).index("by_slot", ["slot"]),

    /**
     * Pengumuman versi aplikasi Android — satu baris per versi yang BENAR-BENAR
     * diumumkan admin, bukan daftar versi yang mungkin ada.
     *
     * Baris di sini adalah sumber dua hal sekaligus: notifikasi "versi baru"
     * yang muncul di pusat notifikasi setiap akun, dan teks pesan WhatsApp
     * pengingat. Karena itu `versiKode` unik (dijaga mutation, indeks dipakai
     * untuk mencarinya): satu versi tidak bisa diumumkan dua kali dan setiap
     * pengguna hanya punya satu kunci baca per versi.
     */
    pembaruanAplikasi: defineTable({
      /** `versionCode` APK — pembanding yang dipakai aplikasi Android. */
      versiKode: v.number(),
      versiNama: v.string(),
      /** Alamat unduhan yang dikirim ke penerima (http(s) atau jalur `/…`). */
      tautan: v.string(),
      catatan: v.optional(v.string()),
      /**
       * Versi ini wajib dipasang: APK dengan `versionCode` lebih kecil menampilkan
       * layar wajib perbarui dan tidak bisa melanjutkan. Versi tertinggi yang
       * bertanda true menjadi batas bawah yang berlaku.
       */
      wajibDiperbarui: v.optional(v.boolean()),
      diumumkanPada: v.number(),
      /** Label admin yang mengumumkan — snapshot agar tetap terbaca. */
      diumumkanOleh: v.optional(v.string()),
    }).index("by_versiKode", ["versiKode"]),

    /**
     * Catatan kirim WhatsApp per penerima untuk satu versi.
     *
     * Satu baris per (versi, akun). Baris `terkirim` dilewati pada klik
     * berikutnya, sedangkan baris `gagal` dicoba ulang — jadi menekan tombol
     * kirim dua kali tidak pernah mengirim pesan yang sama dua kali ke nomor
     * yang sama, tetapi kegagalan tetap bisa diperbaiki tanpa menghapus data.
     * Nomor disimpan yang sudah dinormalkan (`62…`), tanpa nama atau data lain.
     */
    pembaruanAplikasiWa: defineTable({
      versiKode: v.number(),
      userId: v.id("users"),
      nomor: v.string(),
      status: v.union(v.literal("terkirim"), v.literal("gagal")),
      /** Alasan dari gateway, dipotong — untuk admin, bukan untuk penerima. */
      respon: v.string(),
      pada: v.number(),
    })
      .index("by_versiKode", ["versiKode"])
      .index("by_versiKode_userId", ["versiKode", "userId"]),

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
      /**
       * Rincian TERSTRUKTUR satu penghapusan data: jumlah baris turunan yang
       * benar-benar ikut terhapus dan jumlah entri jurnal yang sengaja
       * dipertahankan. `detail` tetap ada sebagai kalimat untuk dibaca manusia;
       * kolom inilah yang dijumlahkan panel Audit Trail tanpa menebak dari teks.
       * Kosong pada entri audit lama (sebelum kolom ini ada).
       */
      rincianHapus: v.optional(
        v.object({
          /** true bila admin memakai jalur "hapus menyeluruh" (bersihkanDana). */
          menyeluruh: v.boolean(),
          alokasiDana: v.number(),
          catatanTransfer: v.number(),
          buktiBayar: v.number(),
          pengingat: v.number(),
          logWhatsapp: v.number(),
          jejakLokasi: v.number(),
          jurnalDipertahankan: v.number(),
        }),
      ),
      waktu: v.number(),
    })
      .index("by_waktu", ["waktu"])
      // Filter penghapusan di panel Audit Trail membaca aksi langsung dari
      // indeks ini — bukan menyaring N entri terbaru, yang bisa kehilangan
      // penghapusan lama karena aksi hapus jarang terjadi.
      .index("by_aksi", ["aksi", "waktu"])
      /**
       * Jejak audit PER SUBJEK — dipakai detail KYC petugas untuk menampilkan
       * "apa saja yang pernah terjadi pada nasabah ini" tanpa memindai seluruh
       * tabel audit. `target` diisi id pengguna untuk aksi ber-subjek nasabah
       * (mis. seluruh aksi KYC & data diri), dan nomor referensi untuk aksi
       * ber-subjek dokumen (pinjaman/kredit/gadai).
       */
      .index("by_target", ["target", "waktu"]),

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
      /** Penanda klaim peminjam lama — lihat catatan pada tabel `loans`. */
      klaimDariUserId: v.optional(v.id("users")),
      /** Waktu kepemilikan baris ini berpindah karena klaim peminjam lama. */
      klaimPada: v.optional(v.number()),
      // ===== Pendanaan gadai oleh penyedia dana (model 1 gadai = 1 pendana) =====
      /**
       * Akun penyedia dana yang menanggung pokok gadai ini. Kosong = modal
       * platform (baris lama dan gadai yang memang tidak didanai pendana).
       * Penetapan ini hanya mencatat kepemilikan; perpindahan uang tetap
       * dilakukan di luar aplikasi seperti seluruh alur dana lain.
       */
      pendanaId: v.optional(v.id("users")),
      /** Salinan nama saat ditetapkan; nama akun tetap menjadi sumber utama. */
      pendanaNama: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_pendana", ["pendanaId"]),

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
      /**
       * Pembagian sewa modal saat pembayaran dicatat: porsi pendana 47/60 dan
       * platform 13/60. Disimpan sebagai snapshot supaya laporan lama tidak
       * berubah bila kebijakan atau pemilik gadai berubah kemudian.
       */
      porsiPendana: v.optional(v.number()),
      porsiPlatform: v.optional(v.number()),
      /** Referensi mutasi/terima uang di luar aplikasi. */
      referensi: v.optional(v.string()),
      /** Admin yang mencatat pembayaran. */
      dicatatOleh: v.optional(v.id("users")),
    })
      .index("by_pawn", ["pawnId"])
      .index("by_user", ["userId"])
      // Jendela pembayaran terbaru untuk rekap transfer hak pendana: panel
      // admin tidak perlu memindai seluruh riwayat untuk melihat kewajiban
      // yang masih berjalan.
      .index("by_waktu", ["waktu"]),

    /**
     * Catatan transfer hak pendana atas SATU pembayaran gadai.
     *
     * Baris bersifat append-only: pembatalan menandai baris lama `dibatalkan`
     * dan pencatatan ulang membuat baris baru. `jumlah` adalah snapshot porsi
     * pendana pada pembayaran itu, bukan angka yang diketik admin. Satu
     * pembayaran hanya boleh punya satu transfer aktif.
     */
    gadaiTransfers: defineTable({
      pawnId: v.id("pawns"),
      paymentId: v.id("pawnPayments"),
      pendanaId: v.optional(v.id("users")),
      pendanaNama: v.string(),
      nomorReferensiGadai: v.string(),
      jumlah: v.number(),
      metode: v.union(
        v.literal("transfer_bank"),
        v.literal("e_wallet"),
        v.literal("tunai"),
      ),
      referensi: v.optional(v.string()),
      catatan: v.optional(v.string()),
      status: v.union(v.literal("dicatat"), v.literal("dibatalkan")),
      dicatatOleh: v.id("users"),
      dicatatOlehLabel: v.string(),
      dicatatPada: v.number(),
      dibatalkanPada: v.optional(v.number()),
      dibatalkanOlehLabel: v.optional(v.string()),
      alasanBatal: v.optional(v.string()),
    })
      .index("by_pawn", ["pawnId"])
      .index("by_payment", ["paymentId"])
      .index("by_pendana", ["pendanaId"])
      .index("by_waktu", ["dicatatPada"]),

    /**
     * Pengajuan Kredit Barang (Skema C) — Peminjam membeli elektronik/barang
     * dari merchant mitra (marketplace/toko) dengan uang muka; sisa harga
     * dibiayai pendana dan dicicil bulanan.
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
      /** Imbal Hasil pendana per bulan (% dari pokok dibiayai, 1,5–4). */
      marginPersenPerBulan: v.number(),
      /**
       * Snapshot tarif bulanan saat pengajuan dibuat — jadwal & rincian kontrak
       * ini dihitung ulang dari angka ini, bukan dari Pengaturan Sistem.
       * Kosong pada kontrak 12/24 bulan (tidak memakai tarif bulanan).
       */
      tarifBulanan: v.optional(
        v.object({
          persenBungaBulanan1: v.number(),
          persenBungaBulanan3: v.number(),
          persenBungaBulanan6: v.number(),
          /** Kosong pada snapshot lama: tarif tenor 6 bulan yang berlaku. */
          persenBungaBulanan9: v.optional(v.number()),
          persenBungaBulanan12: v.optional(v.number()),
          persenBiayaLayananBulanan: v.number(),
          persenBiayaAdminCicilanBulanan: v.number(),
        }),
      ),
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
      /** Penanda klaim peminjam lama — lihat catatan pada tabel `loans`. */
      klaimDariUserId: v.optional(v.id("users")),
      /** Waktu kepemilikan baris ini berpindah karena klaim peminjam lama. */
      klaimPada: v.optional(v.number()),
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
      /** Referensi mutasi bank yang dicocokkan admin (opsional: data lama). */
      referensiMutasi: v.optional(v.string()),
      /** Bukti transfer peminjam yang dicocokkan untuk cicilan ini. */
      receiptId: v.optional(v.id("manualPaymentReceipts")),
      /** Admin yang mencatat penerimaan uang. */
      dicatatOleh: v.optional(v.id("users")),
    })
      .index("by_kredit", ["kreditId"])
      .index("by_user", ["userId"]),

    /**
     * Alokasi Dana ke satu pengajuan Kredit Barang (Skema C) —
     * analog `fundings` untuk pinjaman tunai. Satu pengajuan dapat didanai
     * beberapa pendana; anti-overfunding divalidasi atomik di server.
     * Hak Imbal Hasil proporsional porsi pokok yang didanai.
     */
    kreditFundings: defineTable({
      kreditId: v.id("kreditBarang"),
      danaId: v.id("users"),
      /** Rupiah bulat — porsi pokok dibiayai yang ditanggung pendana ini. */
      jumlahAlokasi: v.number(),
      /** Hak Imbal Hasil pendana untuk alokasi ini (rupiah bulat). */
      imbalHasil: v.number(),
      status: v.union(
        v.literal("dialokasikan"),
        v.literal("selesai"),
        v.literal("dibatalkan"),
      ),
      nomorReferensi: v.string(),
    })
      .index("by_kredit", ["kreditId"])
      .index("by_dana", ["danaId"]),

    /**
     * Setoran dana. Dana baru dianggap tersedia setelah admin
     * memverifikasi penerimaan (konfirmasi mencatat jurnal ledger).
     */
    deposits: defineTable({
      danaId: v.id("users"),
      jumlah: v.number(), // rupiah bulat
      /** Referensi transfer menurut bank/e-wallet pendana. */
      referensiTransfer: v.string(),
      status: v.union(
        v.literal("menunggu_verifikasi"),
        v.literal("terverifikasi"),
        v.literal("ditolak"),
      ),
      /** Wajib diisi admin saat menolak. */
      catatanAdmin: v.optional(v.string()),
      /** Bukti transaksi manual; submit tidak mengubah saldo ledger. */
      metodePembayaran: v.optional(
        v.union(v.literal("qris"), v.literal("transfer")),
      ),
      tanggalTransfer: v.optional(v.number()),
      buktiPembayaranId: v.optional(v.id("_storage")),
      statusPencocokan: v.optional(
        v.union(v.literal("dicocokkan"), v.literal("ditolak")),
      ),
      referensiMutasi: v.optional(v.string()),
      jumlahMutasi: v.optional(v.number()),
      dicocokkanPada: v.optional(v.number()),
      dicocokkanOleh: v.optional(v.id("users")),
      nomorReferensi: v.string(),
    })
      .index("by_dana", ["danaId"])
      .index("by_status", ["status"]),

    /**
     * Angsuran satu pinjaman — dibuat sekali saat pencairan dari jadwal yang
     * SAMA dengan form pengajuan, kontrak, dan kuitansi (`lib/angsuran`).
     *
     * Status disimpan, bukan hanya diturunkan dari tanggal: "menunggu_verifikasi"
     * berarti bukti transfer sudah dikirim peminjam dan belum dicocokkan admin.
     * Denda TIDAK disimpan sebagai tagihan tetap; ia dihitung dari tanggal saat
     * dibaca (`lib/angsuran`), lalu nominal yang benar-benar dibayar dicatat di
     * `dendaDibayar` saat admin mencocokkan mutasi bank.
     */
    angsuran: defineTable({
      userId: v.id("users"),
      loanId: v.id("loans"),
      /** Urutan angsuran, mulai 1. */
      nomor: v.number(),
      jatuhTempoPada: v.number(),
      pokok: v.number(),
      bunga: v.number(),
      /** Biaya admin cicilan yang dibayar bersama angsuran ini (0 pada harian). */
      biayaAdmin: v.number(),
      total: v.number(),
      status: v.union(
        v.literal("belum_dibayar"),
        v.literal("menunggu_verifikasi"),
        v.literal("lunas"),
      ),
      dibayarPada: v.optional(v.number()),
      dendaDibayar: v.optional(v.number()),
      buktiPembayaranId: v.optional(v.id("_storage")),
      receiptId: v.optional(v.id("manualPaymentReceipts")),
    })
      .index("by_loan", ["loanId"])
      .index("by_user", ["userId"])
      .index("by_jatuh_tempo", ["jatuhTempoPada"]),

    /**
     * Bukti pembayaran manual peminjam.
     *
     * Pencocokan oleh admin TIDAK mengubah saldo/status secara otomatis: bukti
     * hanya menjadi antrean. Perubahan angsuran/ledger hanya terjadi lewat
     * `angsuran.verifikasiBuktiAngsuran` atau
     * `perpanjanganPinjaman.verifikasiPembayaranPinjaman`; keduanya mewajibkan
     * referensi mutasi bank dan nominal yang cocok — bukan sekadar persetujuan
     * admin.
     */
    manualPaymentReceipts: defineTable({
      userId: v.id("users"),
      jenis: v.union(
        v.literal("pinjaman"),
        v.literal("kredit_barang"),
        v.literal("gadai"),
      ),
      loanId: v.optional(v.id("loans")),
      kreditId: v.optional(v.id("kreditBarang")),
      pawnId: v.optional(v.id("pawns")),
      /** Angsuran yang diklaim dibayar; kosong untuk bukti lama. */
      angsuranId: v.optional(v.id("angsuran")),
      /**
       * Jalur pembayaran tingkat pinjaman. Kosong = bukti angsuran lama.
       * `pelunasan_total` menutup pinjaman; dua lainnya memperpanjang tenor.
       */
      paymentType: v.optional(
        v.union(
          v.literal("pelunasan_total"),
          v.literal("bunga_saja"),
          v.literal("cicil_pokok"),
        ),
      ),
      /** Tenor perpanjangan yang dipilih (7/14/28) untuk dua jalur terakhir. */
      extensionDays: v.optional(v.number()),
      /** Nominal cicilan pokok pada jalur `cicil_pokok`. */
      principalAmount: v.optional(v.number()),
      /**
       * Snapshot rencana yang dihitung server saat bukti dikirim. Admin
       * mencocokkan angka ini — bukan menghitung ulang dari isian klien.
       */
      rencana: v.optional(
        v.object({
          principalSebelum: v.number(),
          interestDue: v.number(),
          lateFee: v.number(),
          /** Biaya roll-over flat; kosong pada bukti lama sebelum biaya ada. */
          rolloverFee: v.optional(v.number()),
          principalPaid: v.number(),
          totalDue: v.number(),
          principalSesudah: v.number(),
          tierRate: v.number(),
          nextInterestAmount: v.number(),
          jatuhTempoSebelum: v.number(),
          nextDueDate: v.union(v.number(), v.null()),
          extensionDays: v.number(),
          hariTerlambat: v.number(),
        }),
      ),
      jumlah: v.number(),
      metodePembayaran: v.union(v.literal("qris"), v.literal("transfer")),
      tanggalTransfer: v.number(),
      referensiTransfer: v.string(),
      buktiPembayaranId: v.id("_storage"),
      status: v.union(
        v.literal("menunggu_pencocokan"),
        v.literal("dicocokkan"),
        v.literal("ditolak"),
      ),
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
      .index("by_pawn", ["pawnId"])
      .index("by_angsuran", ["angsuranId"]),

    /**
     * Alokasi dana ke satu pinjaman. Satu pinjaman bisa didanai
     * beberapa pendana; total alokasi tidak boleh melebihi pokok
     * (anti-overfunding divalidasi atomik di server).
     */
    /**
     * Satu penempatan pendana untuk siklus 30 hari.
     *
     * Ini LIABILITAS, bukan dompet: pokok + imbal hasil wajib dibayar pada
     * `jatuhTempoPada`, terlepas dari kapan peminjam melunasi. Pembayaran ke
     * pendana dikunci selama siklus berjalan, sehingga pelunasan awal tidak
     * mempercepat pencairan.
     *
     * Angka `pokok`, `imbal`, `potongan`, dan `totalCair` adalah snapshot saat
     * penempatan. `totalMasuk` adalah jumlah yang sudah masuk dompet pendana
     * dari settlement pinjaman; selisihnya ditutup platform saat jatuh tempo.
     */
    siklusPendana: defineTable({
      pendanaId: v.id("users"),
      /** Rupiah bulat — pokok yang ditempatkan. */
      pokok: v.number(),
      /** Rupiah bulat — imbal hasil bruto 30% dari pokok. */
      imbal: v.number(),
      /** Rupiah bulat — porsi platform 13/60 dari marjin siklus. */
      potongan: v.number(),
      /** Rupiah bulat — pokok + imbal - potongan. */
      totalCair: v.number(),
      mulaiPada: v.number(),
      jatuhTempoPada: v.number(),
      status: v.union(
        v.literal("berjalan"),
        v.literal("dicairkan"),
        v.literal("diputar_ulang"),
        v.literal("dibatalkan"),
      ),
      /** Rupiah bulat — akumulasi settlement yang sudah masuk dompet. */
      totalMasuk: v.number(),
      /**
       * Rupiah bulat — pokok yang sudah kembali dari pinjaman dan siap
       * ditempatkan lagi ke pinjaman lain di dalam siklus yang sama. Dompet
       * pendana tidak disentuh; modal kerja didanai akun jaminan platform dan
       * seluruh hasil putaran menjadi milik platform.
       */
      modalSiapPutar: v.optional(v.number()),
      /** Rupiah bulat — pokok siklus yang sedang bekerja pada pinjaman. */
      modalDikerjakan: v.optional(v.number()),
      /** Berapa kali modal siklus diputar ke pinjaman lain. */
      jumlahPutaran: v.optional(v.number()),
      /**
       * Rupiah bulat — akumulasi bagian platform dari putaran modal (biaya
       * alokasi + kelebihan di atas hak pendana yang sudah dibayar).
       */
      totalKeuntunganPutaran: v.optional(v.number()),
      dicairkanPada: v.optional(v.number()),
      dicairkanOleh: v.optional(v.id("users")),
      /** Referensi transfer bank/e-wallet saat admin mencairkan. */
      referensiTransfer: v.optional(v.string()),
      catatan: v.optional(v.string()),
      /**
       * Pilihan pendana saat jatuh tempo. Tidak diisi berarti "cairkan" —
       * perilaku lama tetap berlaku bila pendana tidak memilih.
       */
      pilihanPendana: v.optional(
        v.union(v.literal("cairkan"), v.literal("putar_ulang")),
      ),
      pilihanDipilihPada: v.optional(v.number()),
      /** Siklus berikutnya yang menerima pokok + Imbal Hasil siklus ini. */
      siklusLanjutanId: v.optional(v.id("siklusPendana")),
      /** Siklus asal bila baris ini lahir dari "putar lagi". */
      siklusAsalId: v.optional(v.id("siklusPendana")),
    })
      .index("by_pendana", ["pendanaId"])
      .index("by_jatuhTempo", ["jatuhTempoPada"])
      .index("by_status", ["status"]),

    /**
     * Permintaan penarikan dana ke rekening pribadinya. Dicatat
     * berpasangan di ledger saat admin memproses (append-only).
     */
    withdrawals: defineTable({
      danaId: v.id("users"),
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
      .index("by_dana", ["danaId"])
      .index("by_status", ["status"]),

    fundings: defineTable({
      loanId: v.id("loans"),
      danaId: v.id("users"),
      /** Rupiah bulat — bagian pendana atas pokok pinjaman. */
      jumlahAlokasi: v.number(),
      /** Rupiah bulat — hak Imbal Hasil pendana (30% dari bagian pokok). */
      imbalHasil: v.number(),
      /**
       * Siklus 30 hari yang membayar alokasi ini. Baris lama tidak punya
       * siklus dan tetap memakai aturan settlement lama.
       */
      siklusId: v.optional(v.id("siklusPendana")),
      /** ``utama`` membawa imbal 30%; ``putar`` hanya mengembalikan pokok. */
      peranSiklus: v.optional(v.union(v.literal("utama"), v.literal("putar"))),
      /**
       * Siklus fixed hak pendana — disimpan sebagai snapshot bersama alokasi.
       * Tidak pernah diturunkan dari tenor/bunga pinjaman nasabah, sehingga
       * perpanjangan atau pelunasan awal tidak mengubah angka ini. Kolom
       * opsional demi baris lama; alokasi baru selalu mengisinya.
       */
      periodDuration: v.optional(v.number()),
      expectedReturnRate: v.optional(v.number()),
      lenderProfit: v.optional(v.number()),
      status: v.union(
        v.literal("dialokasikan"),
        v.literal("selesai"),
        v.literal("dibatalkan"),
      ),
      nomorReferensi: v.string(),
      // ===== Jejak pembagian uang saat pelunasan (diisi saat settlement) =====
      /**
       * Rupiah bulat — potongan admin atas UANG YANG KEMBALI bagian alokasi ini
       * (alokasi + Imbal Hasil bagiannya), bukan hanya atas Imbal Hasilnya.
       * Lihat tabel kebijakan di kepala lib/bagiHasil.ts.
       */
      potonganAdmin: v.optional(v.number()),
      /**
       * Rupiah bulat — uang yang benar-benar masuk dompet pendana
       * (alokasi + Imbal Hasil bagiannya − potongan admin).
       */
      imbalHasilNet: v.optional(v.number()),
      /** Waktu pelunasan yang membayar alokasi ini (server). */
      diselesaikanPada: v.optional(v.number()),
    })
      .index("by_loan", ["loanId"])
      .index("by_dana", ["danaId"]),

    /**
     * Akad syariah (Murabahah, Rahn, Qardh) yang sudah DICATAT admin.
     *
     * Ini catatan kontrak, bukan formulir pengajuan. Pengajuan peminjam hidup
     * di `pengajuanSyariah`; setelah diputuskan, akad tetap dicatat admin di
     * sini karena pencairan ditutup gerbang pembayaran. Angka di sini adalah
     * SNAPSHOT hasil akad —
     * `totalKewajiban`, `pendanaTerima`, dan nisbah tidak dihitung ulang dari
     * harga barang atau taksiran yang mungkin berubah kemudian.
     *
     * `status` hanya menyatakan keadaan catatan. Uang tidak berpindah lewat
     * tabel ini; jurnal penempatan ditulis ke `ledger_entries` oleh mutation
     * yang juga ditutup `paymentGuard`, sama seperti seluruh alur dana lain.
     */
    akadSyariah: defineTable({
      jenis: v.union(
        v.literal("murabahah"),
        v.literal("rahn"),
        v.literal("qardh"),
      ),
      /** Nomor referensi manusiawi, mis. `SYR-20261022-AB12`. */
      nomorReferensi: v.string(),
      /** Penyedia dana yang dananya ditempatkan pada akad ini. */
      pendanaId: v.id("users"),
      /** Nama penerima manfaat (peminjam) — teks, tidak wajib punya akun. */
      peminjamNama: v.string(),
      /** Akun peminjam bila ada; kosong untuk pencatatan manual. */
      peminjamId: v.optional(v.id("users")),
      /**
       * Pengajuan yang menjadi dasar akad. Kosong untuk pencatatan manual di
       * luar sistem; bila ada, angka akad mengikuti pengajuan yang disetujui.
       */
      pengajuanId: v.optional(v.id("pengajuanSyariah")),
      /** Pokok yang ditempatkan — rupiah bulat. */
      pokok: v.number(),
      /** Tenor akad dalam hari. */
      tenorHari: v.number(),
      /** Total yang dibayar peminjam (harga jual / pokok + ujrah / pokok). */
      totalKewajiban: v.number(),
      /** Pokok + bagian pendana dari margin/ujrah. */
      pendanaTerima: v.number(),
      /** Bagian pendana dari margin/ujrah saja. */
      nisbahPendana: v.number(),
      /** Bagian platform dari margin/ujrah. */
      nisbahPlatform: v.number(),
      /** Porsi nisbah yang dipakai akad ini (persen) — jejak audit. */
      persenNisbahPendana: v.optional(v.number()),
      persenNisbahPlatform: v.optional(v.number()),
      // ===== Rincian khas akad (kosong bila tidak berlaku) =====
      hargaJual: v.optional(v.number()),
      marginTotal: v.optional(v.number()),
      nilaiTaksiran: v.optional(v.number()),
      ujrahPerSiklus: v.optional(v.number()),
      jumlahSiklus: v.optional(v.number()),
      tiketDoorprize: v.optional(v.number()),
      // ===== Keadaan catatan =====
      status: v.union(
        v.literal("aktif"),
        v.literal("selesai"),
        v.literal("dibatalkan"),
      ),
      /** Jatuh tempo akad — dasar proyeksi return di portofolio. */
      jatuhTempoPada: v.number(),
      catatan: v.optional(v.string()),
      dibuatPada: v.number(),
      dibuatOleh: v.id("users"),
      selesaiPada: v.optional(v.number()),
      dibatalkanPada: v.optional(v.number()),
    })
      .index("by_pendana", ["pendanaId"])
      .index("by_peminjam", ["peminjamId"])
      .index("by_status", ["status"])
      .index("by_referensi", ["nomorReferensi"]),

    /**
     * Katalog Murabahah yang dikelola admin.
     *
     * `kode` adalah referensi stabil yang disimpan pengajuan; harga di sini
     * adalah harga pokok TERBARU dari mitra. Pengajuan yang sudah dikirim
     * menyimpan harganya sendiri, jadi mengubah harga katalog tidak mengubah
     * pengajuan lama — hanya pengajuan berikutnya.
     *
     * `aktif: false` menyembunyikan barang dari formulir tanpa menghapus
     * riwayat. Ini juga tombol kepatuhan: produk pulsa/PPOB yang tidak lolos
     * tinjauan dewan pengawas syariah bisa dimatikan tanpa rilis kode.
     *
     * Isi awal berasal dari `lib/syariah/katalog` lewat `muatKatalogAwal`.
     * Selama satu kode belum dimuat, server memakai harga seed untuk kode itu,
     * sehingga katalog tetap jalan walau admin belum membuka panel.
     */
    katalogBarang: defineTable({
      kode: v.string(),
      nama: v.string(),
      kategori: v.union(
        v.literal("Elektronik"),
        v.literal("Peralatan usaha"),
        v.literal("Perabot rumah"),
        v.literal("Kendaraan"),
        v.literal("Pulsa & data"),
        v.literal("Token & tagihan"),
      ),
      jenisBarang: v.union(v.literal("fisik"), v.literal("digital")),
      /** Harga pokok mitra — rupiah bulat. */
      harga: v.number(),
      aktif: v.boolean(),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
    })
      .index("by_kode", ["kode"])
      .index("by_aktif", ["aktif"]),

    /**
     * Riwayat perubahan harga katalog — APPEND-ONLY, satu baris per perubahan.
     * Hanya dicatat bila harga berubah; mengganti nama atau status tidak
     * mengotori riwayat harga.
     */
    katalogRiwayatHarga: defineTable({
      kode: v.string(),
      barangId: v.id("katalogBarang"),
      nama: v.string(),
      hargaLama: v.number(),
      hargaBaru: v.number(),
      catatan: v.optional(v.string()),
      diubahPada: v.number(),
      diubahOleh: v.id("users"),
      diubahOlehLabel: v.string(),
    }).index("by_kode", ["kode"]),

    /**
     * Pengajuan akad syariah dari peminjam.
     *
     * Baris ini adalah PERMINTAAN, bukan akad dan bukan perpindahan dana.
     * Angka di sini dihitung ulang server dengan `lib/syariah/akad`; kolom
     * `marginPersen` dan `nilaiTaksiran` masih bisa ditetapkan ulang admin saat
     * keputusan. Akad baru dicatat lewat `akadSyariah` setelah gerbang
     * pembayaran dibuka, sehingga pengajuan yang disetujui TIDAK mengubah
     * saldo dompet pendana.
     *
     * `namaPeminjam` adalah snapshot dari KYC agar akad tetap terbaca walau
     * nama akun berubah. Satu akun hanya boleh punya satu pengajuan yang masih
     * menunggu keputusan; aturan itu ditegakkan di mutation, bukan di UI.
     */
    pengajuanSyariah: defineTable({
      userId: v.id("users"),
      nomorReferensi: v.string(),
      jenis: v.union(
        v.literal("murabahah"),
        v.literal("rahn"),
        v.literal("qardh"),
      ),
      status: v.union(
        v.literal("diajukan"),
        v.literal("disetujui"),
        v.literal("ditolak"),
        v.literal("dibatalkan"),
      ),
      /** Nama penerima manfaat saat pengajuan dikirim (snapshot KYC). */
      namaPeminjam: v.string(),
      pokok: v.number(),
      tenorHari: v.number(),
      tujuan: v.string(),
      catatan: v.optional(v.string()),
      /** Barang yang dibiayai (Murabahah) atau jaminan (Rahn). */
      namaBarang: v.optional(v.string()),
      /**
       * Id barang katalog Murabahah (`lib/syariah/katalog`). Kosong bila
       * peminjam menulis barangnya sendiri. Harga dan nama barang diambil dari
       * katalog oleh server, bukan dari kiriman klien.
       */
      katalogId: v.optional(v.string()),
      /** Snapshot jenis barang katalog: fisik atau pulsa/PPOB. */
      jenisBarang: v.optional(
        v.union(v.literal("fisik"), v.literal("digital")),
      ),
      /** Nomor HP / ID meter tujuan untuk barang digital. */
      nomorTujuan: v.optional(v.string()),
      /**
       * Penyerahan barang setelah pengajuan DISETUJUI. Dicatat admin setelah
       * mitra benar-benar mengirim, beserta referensi yang bisa dilacak
       * peminjam (nomor resi, ID transaksi, atau nomor token).
       */
      statusPenyerahan: v.optional(
        v.union(v.literal("belum"), v.literal("terkirim")),
      ),
      diserahkanPada: v.optional(v.number()),
      referensiPenyerahan: v.optional(v.string()),
      diserahkanOlehLabel: v.optional(v.string()),
      /** Perkiraan peminjam; nilai final ditetapkan admin saat keputusan. */
      nilaiTaksiran: v.optional(v.number()),
      // ===== Angka rencana akad (estimasi saat diajukan, final saat diputuskan).
      marginPersen: v.optional(v.number()),
      marginTotal: v.number(),
      hargaJual: v.optional(v.number()),
      ujrahPerSiklus: v.optional(v.number()),
      jumlahSiklus: v.optional(v.number()),
      totalKewajiban: v.number(),
      nisbahPendana: v.number(),
      nisbahPlatform: v.number(),
      // ===== Keputusan admin.
      dibuatPada: v.number(),
      diputuskanPada: v.optional(v.number()),
      diputuskanOleh: v.optional(v.id("users")),
      alasanTolak: v.optional(v.string()),
      /** Nomor akad yang tercatat dari pengajuan ini; kosong sebelum akad. */
      akadNomor: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_referensi", ["nomorReferensi"]),

    /**
     * Catatan transfer keuntungan pendana — SATU baris per (pinjaman,
     * pendana). Model 1 pinjaman = 1 pendana, jadi praktisnya satu baris
     * per pinjaman.
     *
     * PENTING: baris di sini adalah CATATAN PEMBUKUAN, bukan bukti perpindahan
     * dana dan bukan perintah transfer. PINDAI tidak memindahkan uang — seluruh
     * mutation pembayaran tetap ditutup `paymentGuard`. Admin mencatat bahwa ia
     * SUDAH mentransfer keuntungan pendana di luar sistem, beserta referensi
     * mutasinya, supaya tidak ada keuntungan yang tertagih dua kali.
     *
     * Riwayat transfer tidak dihapus: pembatalan hanya menandai baris terbaru
     * `dibatalkan` sehingga jejaknya tetap terbaca di audit.
     */
    transferPendana: defineTable({
      loanId: v.id("loans"),
      /** Penyedia dana penerima (null bila pinjaman hanya punya nama warisan). */
      pendanaId: v.optional(v.id("users")),
      /** Nama pendana saat dicatat — snapshot agar tetap terbaca. */
      pendanaNama: v.string(),
      /** Nomor referensi pinjaman — snapshot untuk pencarian di audit. Ini
       *  pendekatan yang sama dengan snapshot nama di atas. */
      nomorReferensiPinjaman: v.string(),
      /** Nominal keuntungan bersih yang ditransfer — rupiah bulat. */
      jumlah: v.number(),
      /** Metode pengiriman dana oleh admin. */
      metode: v.union(
        v.literal("transfer_bank"),
        v.literal("e_wallet"),
        v.literal("tunai"),
      ),
      /** Referensi mutasi bank/e-wallet atau catatan serah terima tunai. */
      referensi: v.optional(v.string()),
      /** Catatan tambahan admin (opsional). */
      catatan: v.optional(v.string()),
      /** "dicatat" (transfer sudah dilakukan) | "dibatalkan" (salah catat). */
      status: v.union(v.literal("dicatat"), v.literal("dibatalkan")),
      /** Admin yang mencatat — jejak pertanggungjawaban. */
      dicatatOleh: v.id("users"),
      /** Label admin — snapshot agar tetap terbaca. */
      dicatatOlehLabel: v.string(),
      dicatatPada: v.number(),
      /** Terisi saat catatan dibatalkan. */
      dibatalkanPada: v.optional(v.number()),
      dibatalkanOlehLabel: v.optional(v.string()),
      alasanBatal: v.optional(v.string()),
    })
      .index("by_loan", ["loanId"])
      .index("by_pendana", ["pendanaId"])
      .index("by_waktu", ["dicatatPada"]),

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
      /** Nama akun ledger, mis. "dana:WALLET:<id>", "pinjaman:<id>". */
      akun: v.string(),
      /** Jenis transaksi: deposit|disbursement|platform_fee|repayment|payout. */
      jenis: v.string(),
      /**
       * Peristiwa bisnis eksplisit untuk jalur perpanjangan. `jenis` tetap
       * kategori finansial (repayment/payout), sedangkan field ini menjawab
       * "pembayaran apa" tanpa menebak dari teks keterangan.
       */
      eventType: v.optional(
        v.union(
          v.literal("INTEREST_ONLY_PAYMENT"),
          v.literal("PARTIAL_PRINCIPAL_PAYMENT"),
          v.literal("LOAN_REPAYMENT"),
        ),
      ),
      keterangan: v.string(),
      /**
       * Skema produk asal jurnal (pinjaman|gadai|kredit). Kosong pada entri lama
       * yang ditulis sebelum penandaan eksplisit — ringkasan ledger masih bisa
       * mengklasifikasikannya lewat pola teks `keterangan`.
       */
      skema: v.optional(skemaLedgerValidator),
      /** Subjek transaksi (userId atau "platform"). */
      aktor: v.string(),
      waktu: v.number(),
    })
      .index("by_group", ["groupId"])
      .index("by_akun", ["akun"])
      // Arsip ledger (tab Ledger & ekspor CSV) dibaca halaman demi halaman dari
      // jurnal terlama ke terbaru. Tanpa indeks waktu, halaman berikutnya tidak
      // punya urutan tetap dan satu permintaan harus membaca seluruh tabel.
      .index("by_waktu", ["waktu"]),

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
     * Pengingat SATU ANGSURAN — append-only, idempoten per (angsuran, tanggal,
     * jenis). Ditulis cron harian untuk H-3, hari-H, dan H+1; `waStatus`
     * mencatat hasil percobaan WhatsApp apa adanya (termasuk "dinonaktifkan").
     * In-app membaca baris yang sama, jadi pesan dan notifikasi tidak bisa
     * berbeda jenis.
     */
    pengingatAngsuran: defineTable({
      angsuranId: v.id("angsuran"),
      loanId: v.id("loans"),
      userId: v.id("users"),
      /** Tanggal kalender WIB (epoch ms tengah malam UTC) saat dibuat. */
      tanggal: v.number(),
      /** "h_minus_3" | "hari_h" | "terlambat_h1". */
      jenis: v.string(),
      sisaHari: v.number(),
      jumlahKewajiban: v.number(),
      waStatus: v.optional(v.string()),
      waKeterangan: v.optional(v.string()),
      /** Jumlah percobaan kirim; dibatasi supaya gateway yang mati tidak dispam. */
      percobaan: v.number(),
      waktu: v.number(),
    })
      .index("by_angsuran", ["angsuranId"])
      .index("by_user", ["userId"])
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
      // --- Kolom pensiun (tidak dibaca & tidak ditulis lagi) ---
      // Field di bawah ini dulu diisi panel "Banner & Pengumuman" tetapi hanya
      // dikonsumsi `pages/Landing.tsx`, halaman yang sudah tidak dirutekan.
      // Panelnya kini tidak menawarkan field ini dan `getPublic` tidak lagi
      // mengirimnya. Deklarasinya dipertahankan supaya baris produksi yang
      // masih menyimpannya tetap lolos validasi schema saat deploy: Convex
      // memeriksa seluruh dokumen lama setiap kali schema berubah, dan push
      // akan gagal bila ada kolom tersimpan yang tidak lagi dideklarasikan.
      // Hapus blok ini pada deploy berikutnya setelah barisnya dibersihkan.
      logoTeks: v.optional(v.string()),
      nav1Label: v.optional(v.string()),
      nav2Label: v.optional(v.string()),
      nav3Label: v.optional(v.string()),
      nav4Label: v.optional(v.string()),
      heroBadge: v.optional(v.string()),
      heroJudul: v.optional(v.string()),
      /** Bagian aksen berwarna pada judul hero (pensiun). */
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
      /**
       * Teks beranda `/` yang benar-benar dirender (`pages/LandingHome.tsx`).
       * Disimpan sebagai satu objek utuh — bukan puluhan kolom datar — karena
       * kartu layanan dan baris panduan berbentuk daftar. Field di dalamnya
       * tetap opsional saat dibaca agar data lama dan kolom yang dikosongkan
       * jatuh ke `lengkapiKontenLanding`, bukan menghasilkan judul kosong.
       */
      landing: v.optional(
        v.object({
          heroEyebrow: v.optional(v.string()),
          heroJudul1: v.optional(v.string()),
          heroJudul2: v.optional(v.string()),
          heroDeskripsi: v.optional(v.string()),
          heroCtaSekunder: v.optional(v.string()),
          heroMikro: v.optional(v.string()),
          layananEyebrow: v.optional(v.string()),
          layananJudul: v.optional(v.string()),
          layananCta: v.optional(v.string()),
          layanan: v.optional(
            v.array(
              v.object({
                judul: v.optional(v.string()),
                ringkasan: v.optional(v.string()),
                detail: v.optional(v.string()),
              }),
            ),
          ),
          panduanEyebrow: v.optional(v.string()),
          panduanJudul: v.optional(v.string()),
          panduanDeskripsi: v.optional(v.string()),
          panduanCtaKalkulator: v.optional(v.string()),
          panduanCtaSyarat: v.optional(v.string()),
          panduan: v.optional(
            v.array(
              v.object({
                judul: v.optional(v.string()),
                isi: v.optional(v.string()),
              }),
            ),
          ),
          /** Kepala bagian kalkulator, alur & dokumen, dan pertanyaan umum. */
          kalkulatorJudul: v.optional(v.string()),
          kalkulatorDeskripsi: v.optional(v.string()),
          dokumenJudul: v.optional(v.string()),
          dokumenDeskripsi: v.optional(v.string()),
          faqJudul: v.optional(v.string()),
          faqDeskripsi: v.optional(v.string()),
          footerDeskripsi: v.optional(v.string()),
        }),
      ),
      /**
       * Konten halaman `/jadi-pendana`: judul, paragraf, prinsip, risiko, FAQ,
       * dan teks bagian proposal. Angka tetap dihitung `lib/imbalPendana`; teks
       * hanya boleh memuat token `{imbal}`, `{biaya}`, `{siklus}`, `{nominal}`,
       * dan `{kontak}` yang diisi saat dirender, sehingga tarif yang diubah
       * admin tidak meninggalkan angka lama di halaman.
       *
       * `berkas*` menyimpan proposal PDF yang diunggah admin. Bila kosong,
       * halaman menyusun proposal dari kebijakan yang berlaku seperti semula.
       */
      pendana: v.optional(
        v.object({
          heroJudul: v.optional(v.string()),
          heroDeskripsi: v.optional(v.string()),
          heroCatatan: v.optional(v.string()),
          prinsipJudul: v.optional(v.string()),
          prinsipDeskripsi: v.optional(v.string()),
          prinsip: v.optional(
            v.array(
              v.object({
                judul: v.optional(v.string()),
                isi: v.optional(v.string()),
              }),
            ),
          ),
          kalkulatorJudul: v.optional(v.string()),
          kalkulatorDeskripsi: v.optional(v.string()),
          kalkulatorCatatan: v.optional(v.string()),
          perhitunganJudul: v.optional(v.string()),
          perhitunganDeskripsi: v.optional(v.string()),
          proposalJudul: v.optional(v.string()),
          proposalDeskripsi: v.optional(v.string()),
          proposalIsi: v.optional(v.array(v.string())),
          proposalCatatan: v.optional(v.string()),
          proposalCatatanBerkas: v.optional(v.string()),
          risikoJudul: v.optional(v.string()),
          risikoDeskripsi: v.optional(v.string()),
          risiko: v.optional(
            v.array(
              v.object({
                judul: v.optional(v.string()),
                isi: v.optional(v.string()),
              }),
            ),
          ),
          faqJudul: v.optional(v.string()),
          faqDeskripsi: v.optional(v.string()),
          faq: v.optional(
            v.array(
              v.object({
                tanya: v.optional(v.string()),
                jawab: v.optional(v.string()),
              }),
            ),
          ),
          ajakanJudul: v.optional(v.string()),
          ajakanDeskripsi: v.optional(v.string()),
          berkasId: v.optional(v.id("_storage")),
          berkasNama: v.optional(v.string()),
          berkasPada: v.optional(v.number()),
        }),
      ),
      /**
       * PENSIUN — banner promo satu-slot dari versi pertama.
       *
       * Sudah digantikan tabel `bannerPromo` (banyak kampanye, dua rasio
       * gambar, tiga penempatan). Kolom ini dipertahankan hanya agar baris
       * produksi yang sempat menyimpannya tetap lolos validasi schema; tidak
       * ada kode baru yang membacanya. Hapus blok ini setelah baris lama
       * dibersihkan.
       */
      bannerPromo: v.optional(
        v.object({
          berkasId: v.optional(v.id("_storage")),
          berkasNama: v.optional(v.string()),
          berkasPada: v.optional(v.number()),
          /** Teks alternatif gambar; juga dipakai bila gambar gagal dimuat. */
          judul: v.optional(v.string()),
          /** Path internal tujuan klik banner; kosong = banner statis. */
          tautan: v.optional(v.string()),
          aktif: v.optional(v.boolean()),
          promoBungaId: v.optional(v.id("promoBunga")),
        }),
      ),
      /** Audit ringan: kapan terakhir diubah admin. */
      diperbaruiPada: v.number(),
    }).index("by_slot", ["slot"]),

    /*
     * ==================================================================
     * Modul KYC MANDIRI (terpisah dari formulir pengajuan pinjaman)
     * ==================================================================
     * Nasabah dapat memulai, menyimpan progres, melanjutkan, dan mengirim
     * pengajuan KYC tanpa membuat pengajuan pinjaman. Modul ini TIDAK
     * memindahkan uang, tidak menyentuh ledger, dan TIDAK mengubah status
     * pinjaman: status VERIFIED berarti identitas sudah diperiksa petugas —
     * bukan persetujuan pinjaman dan bukan bukti dana cair.
     *
     * Kenapa tabelnya sendiri: `nasabahProfil` (data diri admin) membutuhkan
     * NIK/nomor WhatsApp yang sudah sah sejak baris pertama, sedangkan KYC harus
     * bisa disimpan SETENGAH JALAN. Satu baris per pengguna, dan hanya satu
     * tempat yang menyimpan status KYC — supaya tidak ada dua layar yang berbeda
     * pendapat soal "sudah diverifikasi atau belum".
     *
     * PENYIMPANAN DOKUMEN: KTP/selfie/bukti penghasilan hidup di Convex
     * `_storage` sebagai id, BUKAN di kolom ini dan BUKAN di bucket publik.
     * URL mentah `ctx.storage.getUrl()` PERMANEN dan bisa dibuka siapa pun yang
     * memegangnya, jadi URL itu tidak pernah dikirim ke klien. Query yang lolos
     * gerbang otorisasi — pemiliknya sendiri (`kycSaya`) atau petugas ber-TOTP
     * (`detailKycAdmin`) — mengirim tautan `/berkas` bertanda tangan yang mati
     * setelah satu jam (`convex/berkas.ts`). Berkas tidak pernah ditulis ke tabel
     * yang bisa dibaca publik, dan tidak ada URL dokumen yang masuk laporan,
     * log, atau pengumuman.
     */
    kycProfil: defineTable({
      userId: v.id("users"),
      status: kycStatusValidator,
      /**
       * ASAL putusan terakhir. Kosong = alur normal (pengajuan mandiri +
       * tinjauan petugas atau mesin). `manual_admin` = petugas mencatat data
       * dan memverifikasi identitas langsung, tanpa pengajuan mandiri; jejak
       * siapa, kapan, dan dasarnya tetap ada di `kycRiwayat` + `auditLog`.
       */
      sumberVerifikasi: v.optional(v.literal("manual_admin")),
      // ===== Isian identitas (semuanya opsional selama masih progres) =====
      namaLengkap: v.optional(v.string()),
      nik: v.optional(v.string()),
      nomorWhatsApp: v.optional(v.string()),
      /**
       * HASIL PEMERIKSAAN: nomor WhatsApp yang benar-benar terbukti aktif milik
       * pemilik akun, lewat kode OTP yang dikirim ke nomor itu (lihat
       * `convex/otpWhatsapp.ts`).
       *
       * Diisi HANYA oleh server setelah `verifikasiOtpWa` mencocokkan kode —
       * "Fonnte berhasil mengirim" atau "kode diminta" TIDAK pernah mengisi
       * kolom ini. Terikat pada nomor: kalau `nomorWhatsApp` di atas berubah,
       * penanda ini otomatis dibuang (`simpanProgresKyc`), karena bukti lama
       * tidak lagi mewakili nomor baru.
       */
      nomorWhatsAppTerverifikasi: v.optional(
        v.object({
          /** Nomor (format 62…) yang diverifikasi. */
          nomor: v.string(),
          /** Waktu server saat kode benar-benar diverifikasi. */
          pada: v.number(),
          /** Cara verifikasi — saat ini selalu "wa_otp". */
          metode: v.string(),
        }),
      ),
      /**
       * HASIL OCR KTP — snapshot SAJA, berasal dari perangkat nasabah.
       *
       * OCR berjalan LOKAL di peramban (`lib/kycOcrMesin.ts`) dan TIDAK pernah
       * mengirim gambar ke server mana pun. Yang disimpan di sini hanyalah teks
       * yang sudah dibaca mesin itu, dipakai MESIN KEPUTUSAN OTOMATIS
       * (`lib/kycAutoApproval.ts`) untuk menilai keterbacaan & kecocokan dengan
       * isian.
       *
       * PENTING: ini bukti berlabel `sumber: "klien"` — bukan fakta server.
       * OCR tidak membuktikan keaslian KTP dan tidak memverifikasi Dukcapil;
       * karena itu mesin memperlakukannya sebagai saran, bukan bukti sekuat
       * hasil pemeriksaan berkas server (`berkasTerverifikasi`).
       *
       * Dibuang saat berkas KTP diganti (lihat `simpanProgresKyc`) karena hasil
       * lama mewakili foto lama.
       */
      ocrKtp: v.optional(
        v.object({
          /** Keyakinan mesin OCR 0–100. */
          konfidensi: v.number(),
          nik: v.union(v.string(), v.null()),
          nama: v.union(v.string(), v.null()),
          alamat: v.union(v.string(), v.null()),
          /** Waktu server saat snapshot dicatat. */
          pada: v.number(),
          /** Asal snapshot — saat ini selalu "klien". */
          sumber: v.string(),
        }),
      ),
      alamat: v.optional(v.string()),
      pekerjaan: v.optional(v.string()),
      /**
       * KONTAK DARURAT — opsional, dan sengaja TIDAK ikut `kekuranganKyc()`:
       * kolom ini bukan bukti identitas, hanya jalan menghubungi nasabah bila
       * nomor utamanya tidak aktif. Jadi ia tidak pernah menahan pengajuan,
       * termasuk bagi nasabah yang datanya sudah tersimpan sebelum kolom ini ada.
       */
      namaKontakDarurat: v.optional(v.string()),
      nomorKontakDarurat: v.optional(v.string()),
      hubunganKontakDarurat: v.optional(v.string()),
      /** Rupiah bulat. */
      penghasilanBulanan: v.optional(v.number()),
      sumberPenghasilan: v.optional(v.string()),
      namaBank: v.optional(v.string()),
      nomorRekening: v.optional(v.string()),
      catatanPeminjam: v.optional(v.string()),
      // ===== Dokumen (Convex storage) — wajib punya penanda terverifikasi =====
      ktpId: v.optional(v.id("_storage")),
      selfieKtpId: v.optional(v.id("_storage")),
      buktiPenghasilanId: v.optional(v.id("_storage")),
      /**
       * Persetujuan pemrosesan data pribadi (UU PDP) — WAJIB ada sebelum isian
       * pribadi atau berkas apa pun boleh disimpan. Menyimpan VERSI teks yang
       * disetujui: bila penjelasannya berubah, versinya naik dan pengguna diminta
       * menyetujui ulang (lihat `lib/persetujuanKyc.ts`).
       */
      persetujuan: v.optional(
        v.object({
          versi: v.string(),
          /** Waktu server saat persetujuan dicatat. */
          pada: v.number(),
          olehLabel: v.string(),
        }),
      ),
      /**
       * TANDA TANGAN PEMINJAM — satu gambar (data URL PNG) yang dibubuhkan
       * SEKALI di modul KYC, lalu dipakai ulang oleh setiap pengajuan pinjaman.
       * Disimpan di sini, bukan di formulir pengajuan, supaya nasabah tidak
       * menandatangani ulang di setiap pengajuan. Setiap pinjaman tetap
       * menyimpan salinan gambarnya sendiri (`loans.tandaTanganPeminjam`) agar
       * perjanjian yang sudah terbit tidak berubah saat tanda tangan diperbarui.
       */
      tandaTangan: v.optional(v.string()),
      /** Waktu server saat gambar tanda tangan KYC terakhir disimpan. */
      tandaTanganPada: v.optional(v.number()),
      // ===== Waktu & keputusan =====
      /** Waktu baris KYC pertama kali dibuat (server). */
      dibuatPada: v.number(),
      /** Waktu perubahan terakhir (server). */
      diperbaruiPada: v.number(),
      /** Waktu terakhir diajukan untuk peninjauan (server). */
      diajukanPada: v.optional(v.number()),
      /** Waktu keputusan petugas terakhir (server). */
      diputuskanPada: v.optional(v.number()),
      /** Label petugas pemutus terakhir — snapshot agar tetap terbaca. */
      diputuskanOlehLabel: v.optional(v.string()),
      /** Alasan/catatan keputusan terakhir (wajib saat menolak/perbaikan). */
      keputusanCatatan: v.optional(v.string()),
      /**
       * Stempel identitas yang BENAR-BENAR diverifikasi. Dipakai untuk memutuskan
       * verifikasi ulang saat data identitas penting berubah (lihat
       * `lib/kycStatus.ts`). Diisi hanya saat status menjadi VERIFIED.
       */
      stempelTerverifikasi: v.optional(
        v.object({
          namaLengkap: v.string(),
          nik: v.string(),
          ktpId: v.union(v.id("_storage"), v.null()),
          selfieKtpId: v.union(v.id("_storage"), v.null()),
          buktiPenghasilanId: v.union(v.id("_storage"), v.null()),
          pada: v.number(),
        }),
      ),
      /**
       * VERSI ATURAN VERIFIKASI yang berlaku saat putusan VERIFIED terakhir
       * diambil (lihat `lib/kycAturan.ts`).
       *
       * Kenapa terpisah dari `stempelTerverifikasi`: aturan bisa berubah TANPA
       * satu pun isian nasabah berubah (batas ukuran, jenis gambar yang
       * diterima, syarat persetujuan). Stempel data menjawab "apakah datanya
       * masih sama"; kolom ini menjawab "atas dasar aturan apa putusan itu
       * diambil" — dan membuat aturan yang sudah kedaluwarsa bisa ditandai di
       * panel petugas. Diisi hanya saat status menjadi VERIFIED; dibuang saat
       * keluar dari VERIFIED, karena putusan itu tidak berlaku lagi.
       *
       * Kosong pada baris lama (sebelum kolom ini ada) — dan sengaja TIDAK
       * ditandai "usang" (lihat `aturanUsang()`), supaya migrasi tidak memaksa
       * semua nasabah lama mengulang KYC.
       */
      aturanTerverifikasi: v.optional(
        v.object({
          versi: v.string(),
          pada: v.number(),
        }),
      ),
    })
      .index("by_user", ["userId"])
      // Profil KYC juga sumber nomor WhatsApp terverifikasi; dipakai klaim
      // akun lama untuk menemukan pemilik data impor lewat nomornya.
      .index("by_nomorWhatsApp", ["nomorWhatsApp"])
      // NIK dari baris KYC: dasar penolakan identitas ganda antar-akun.
      .index("by_nik", ["nik"]),

    /**
     * KEPUTUSAN OTOMATIS KYC — APPEND-ONLY, satu baris per pemeriksaan mesin.
     *
     * Kenapa perlu tabel sendiri (bukan hanya menambah kolom di `kycProfil`):
     * keputusan otomatis harus bisa ditelusuri — APA yang diperiksa, hasil tiap
     * pemeriksaan, atas dasar VERSI ATURAN apa, dan kapan. Menyimpannya sebagai
     * riwayat append-only berarti pemeriksaan ulang tidak menimpa bukti lama.
     *
     * `sidikJari` adalah cap dari masukan (id + status pemeriksaan, TANPA data
     * pribadi) + versi aturan + status tujuan. Baris terakhir dengan sidik jari
     * yang sama dilewati, sehingga prosesnya IDEMPOTEN: klik ganda atau
     * pemeriksaan ulang atas data yang tak berubah tidak menulis keputusan dan
     * tidak mengubah status dua kali.
     *
     * `diterapkan: false` menandai pemeriksaan yang tidak mengubah status
     * (mis. hasil `PENDING_REVIEW` ketika status memang sudah menunggu tinjauan)
     * — tetap dicatat sebagai jejak, bukan dihilangkan.
     */
    kycKeputusanOtomatis: defineTable({
      userId: v.id("users"),
      waktu: v.number(),
      /** Status sebelum mesin berjalan — untuk jejak transisi. */
      statusSebelum: kycStatusValidator,
      /** Status yang DITUJU mesin (VERIFIED | NEEDS_CORRECTION | PENDING_REVIEW). */
      keputusan: kycStatusValidator,
      /** Kode alasan terstruktur (mis. "otomatis_semua_pemeriksaan_lulus"). */
      alasan: v.string(),
      /** Kalimat alasan untuk dibaca manusia. */
      ringkasan: v.string(),
      /** Versi aturan keputusan otomatis (`lib/kycAutoApproval.ts`). */
      versiAturan: v.string(),
      /** Asal keputusan — saat ini selalu "otomatis". */
      sumber: v.string(),
      /** Aktor pencatat — saat ini selalu "sistem". */
      aktor: aktorKycValidator,
      /** Cap masukan untuk idempotensi (tanpa data pribadi). */
      sidikJari: v.string(),
      /** true bila keputusan ini benar-benar mengubah status nasabah. */
      diterapkan: v.boolean(),
      /** Hasil setiap pemeriksaan — apa adanya, termasuk yang gagal/tidak pasti. */
      aturan: v.array(
        v.object({
          id: v.string(),
          judul: v.string(),
          status: v.string(),
          sumber: v.string(),
          pesan: v.string(),
          detail: v.array(v.string()),
        }),
      ),
    }).index("by_user", ["userId", "waktu"]),

    /**
     * Riwayat perubahan status KYC — APPEND-ONLY.
     *
     * Setiap baris menyimpan WAKTU (server), AKTOR (id + label + peran), ALASAN
     * terstruktur, dan CATATAN. Baris tidak pernah diubah/dihapus, sehingga
     * pertanyaan "siapa mengubah status ini, kapan, dan atas dasar apa" selalu
     * bisa dijawab — termasuk untuk keputusan yang diambil petugas.
     */
    kycRiwayat: defineTable({
      userId: v.id("users"),
      dari: v.union(kycStatusValidator, v.literal("-")),
      ke: kycStatusValidator,
      aktor: aktorKycValidator,
      /** Label aktor (email/nama) untuk dibaca manusia. */
      aktorLabel: v.string(),
      /** Id pengguna aktor; kosong untuk perubahan oleh sistem. */
      aktorUserId: v.optional(v.id("users")),
      /** Kode alasan terstruktur (mis. "data_identitas_berubah"). */
      alasan: v.string(),
      /** Kalimat untuk dibaca manusia. */
      catatan: v.optional(v.string()),
      /**
       * Versi aturan verifikasi yang berlaku saat baris ini dicatat. Riwayat
       * jadi bisa menceritakan dasar aturannya, bukan hanya pelakunya. Kosong
       * pada baris lama (sebelum kolom ini ada).
       */
      versiAturan: v.optional(v.string()),
      waktu: v.number(),
    })
      .index("by_user", ["userId", "waktu"])
      .index("by_waktu", ["waktu"]),

    /**
     * Penanda bahwa ISI sebuah berkas sudah diperiksa server dari magic bytes.
     *
     * Kenapa perlu tabel: pemeriksaan isi berkas di Convex hanya bisa dilakukan
     * dari ACTION (`ctx.storage.get`), sedangkan mutation hanya membaca metadata
     * yang tipe MIME-nya ditentukan klien. Kalau pemeriksaan hanya dipanggil
     * klien, klien yang mengirim mutation langsung bisa menautkan berkas apa pun
     * yang mengaku gambar. Karena itu: action membaca isinya, lalu menulis baris
     * di sini; setiap mutation yang MENGIKAT berkas KYC ke sebuah baris wajib
     * menemukan penandanya — tanpa penanda, berkas ditolak.
     */
    berkasTerverifikasi: defineTable({
      storageId: v.id("_storage"),
      /** Label saat diperiksa (mis. "Foto KTP") — ikut bukti audit. */
      label: v.string(),
      /** Jenis gambar yang terdeteksi dari ISI berkas (png/jpeg/…). */
      jenis: v.string(),
      /**
       * Metadata berkas menurut tabel sistem `_storage` — fakta yang dicatat
       * Convex saat berkas benar-benar tersimpan, BUKAN yang dikirim klien.
       * `sidikJari` adalah SHA-256 isi berkas: berguna membuktikan berkas yang
       * sama dipakai ulang, dan tidak bisa dipalsukan tanpa mengubah isinya.
       */
      ukuranByte: v.optional(v.number()),
      contentType: v.optional(v.string()),
      sidikJari: v.optional(v.string()),
      /**
       * Dimensi gambar (piksel) yang dibaca server dari HEADER berkas — fakta
       * keterbacaan, bukan klaim klien. Dipakai panel petugas untuk menandai
       * berkas yang terlalu kecil/terpotong.
       */
      lebar: v.optional(v.number()),
      tinggi: v.optional(v.number()),
      /**
       * Versi aturan verifikasi yang memeriksa berkas ini (`lib/kycAturan.ts`).
       * Berkas yang diperiksa dengan aturan lama bisa ditandai di panel petugas.
       */
      versiAturan: v.optional(v.string()),
      /** Pengguna yang memicu pemeriksaan. */
      olehUserId: v.optional(v.id("users")),
      waktu: v.number(),
    })
      .index("by_storageId", ["storageId"])
      // Mencari berkas yang sama dipakai di slot/akun lain (berkas yang sudah
      // dihapus tidak perlu dihitung) — satu berkas identitas, satu pemilik.
      .index("by_sidikJari", ["sidikJari"]),

    /**
     * Pembatas laju unggahan berkas KYC — pencatat yang dihitung SERVER.
     *
     * Kenapa perlu: tiap unggahan bisa mencapai 5 MB dan memicu pemeriksaan isi
     * (magic bytes + header dimensi) di server. Tanpa batas, satu akun bisa
     * membanjiri penyimpanan/pemeriksa. Batasnya dihitung dari waktu server,
     * bukan dari klaim klien. Baris lama dibuang saat menghitung (lihat
     * `batasLajuUnggah`), jadi tabelnya tetap kecil. Hanya menyimpan id
     * pengguna + waktu — bukan berkas atau isinya.
     */
    kycUnggahLog: defineTable({
      userId: v.id("users"),
      waktu: v.number(),
    }).index("by_user", ["userId", "waktu"]),

    /**
     * Tanda "sudah dibaca" untuk pusat notifikasi in-app.
     *
     * Pusat notifikasi TIDAK menyimpan salinan notifikasi dan tidak mengirim
     * apa pun: daftarnya selalu dihitung ulang dari sumber asli yang sudah ada
     * (`pengingat`, `lokasiPeringatan`, `manualPaymentReceipts`, `pengumuman`),
     * sehingga tidak ada notifikasi palsu yang bisa hidup di tabel ini. Yang
     * disimpan hanyalah keadaan milik pengguna: notifikasi mana yang sudah ia
     * baca, dan kapan.
     *
     * `kunci` adalah identitas stabil sumbernya, mis. `pengingat:<id>` — bukan
     * judul atau waktu, supaya perubahan kecil pada isi (mis. nominal yang
     * diperbarui) tidak membuat notifikasi lama muncul kembali sebagai belum
     * dibaca.
     *
     * Peringatan lokasi TIDAK memakai tabel ini: tabel `lokasiPeringatan` sudah
     * punya `dibacaPada` yang juga mengendalikan banner di dashboard. Satu
     * keadaan, satu tempat — supaya banner dan pusat notifikasi tidak pernah
     * berbeda pendapat soal apa yang sudah diakui pengguna.
     */
    notifikasiBaca: defineTable({
      userId: v.id("users"),
      /** Identitas stabil sumber notifikasi (mis. "pengingat:<id>"). */
      kunci: v.string(),
      /** Jenis sumber, disimpan untuk pemeriksaan/audit ringan. */
      sumber: v.string(),
      /** Waktu baca menurut server (epoch ms). */
      dibacaPada: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_kunci", ["userId", "kunci"]),

    /**
     * Jejak percobaan pengiriman EMAIL notifikasi.
     *
     * Kenapa perlu tabel sendiri: pengingat WhatsApp idempoten lewat `waLogs`
     * (jenis pesan per hari), sedangkan email bisa menyala walau WhatsApp
     * dimatikan pemilik akun — tanpa kunci idempoten sendiri, cron tiap jam
     * akan mengirim email yang sama berkali-kali. `kunci` adalah identitas
     * logis pengingat (mis. `angsuran:<id>:<tanggal>:<jenis>`), bukan isi
     * pesan, sehingga perubahan kecil pada teks tidak menggandakan kiriman.
     */
    emailNotifikasiLog: defineTable({
      userId: v.id("users"),
      /** Identitas logis satu pengingat; satu baris per kunci per pengguna. */
      kunci: v.string(),
      /** Jenis ramah untuk diagnosis (mis. "pengingat_angsuran"). */
      jenis: v.string(),
      /** Alamat tujuan yang BENAR-BENAR dipakai saat percobaan itu. */
      ke: v.string(),
      subjek: v.string(),
      /** "terkirim" | "gagal" | "tanpa_konfigurasi" | "tanpa_email". */
      status: v.string(),
      /** Keterangan kegagalan untuk diagnosis; tidak pernah berisi kredensial. */
      respon: v.optional(v.string()),
      /** Jumlah percobaan; dibatasi supaya gateway bermasalah tidak dispam. */
      percobaan: v.number(),
      waktu: v.number(),
    }).index("by_user_kunci", ["userId", "kunci"]),

    /**
     * Sidik jari dokumen kontrak yang sudah ditandatangani.
     *
     * Hanya kode, hash, dan ringkasan non-pribadi yang disimpan — payload
     * kanonik (yang memuat nama & NIK) TIDAK pernah ditulis ke tabel ini,
     * sehingga halaman verifikasi publik tidak bisa membocorkan data nasabah.
     * `refId` disimpan sebagai string agar satu tabel menampung pinjaman dan
     * gadai; `jenis` menjaga arti id-nya.
     */
    /**
     * Denyut penjadwal: satu baris per cron, ditulis setiap kali job selesai.
     * Dipakai panel kesehatan untuk membedakan "tidak ada pekerjaan" dari
     * "penjadwal berhenti" — dua keadaan yang dulu tampak sama.
     */
    cronDenyut: defineTable({
      nama: v.string(),
      terakhirPada: v.number(),
      /** Berapa kali job ini tercatat berjalan (bukan jumlah pekerjaan). */
      jumlah: v.number(),
    }).index("by_nama", ["nama"]),

    kontrakDigital: defineTable({
      kode: v.string(),
      jenis: v.union(v.literal("pinjaman"), v.literal("gadai")),
      refId: v.string(),
      nomorReferensi: v.string(),
      hash: v.string(),
      versi: v.string(),
      diterbitkanPada: v.number(),
      /** Pokok pinjaman / pokok gadai saat dokumen diterbitkan. */
      pokok: v.number(),
    })
      .index("by_kode", ["kode"])
      .index("by_ref", ["refId"]),

    /*
     * ==================================================================
     * Pengelolaan keterlambatan & penagihan
     * ==================================================================
     * Aturan main, klasifikasi tunggakan, penugasan petugas, riwayat
     * komunikasi, janji pembayaran, pengaduan, dan catatan penyelesaian.
     *
     * Batas modul ini (dijaga `lib/penagihan.ts`): TIDAK memindahkan uang,
     * tidak mengubah ledger, dan tidak memuat ancaman, intimidasi, penyebaran
     * data pribadi, kontak ke pihak tidak berwenang, atau pesan menyesatkan.
     * Status pinjaman & saldo tetap milik tabel pinjaman/ledger.
     *
     * Semua tindakan menyimpan WAKTU (dari server), PETUGAS (id + label
     * snapshot), dan HASIL, sehingga setiap langkah dapat ditinjau ulang.
     */

    /**
     * Aturan penagihan — satu baris global (slot "global"): ambang tunggakan,
     * jam kontak, dan saklar modul.
     *
     * Sengaja TERPISAH dari `systemConfig`: aturan penagihan ditinjau dan
     * diaudit sendiri, tanpa harus menyentuh konfigurasi biaya/lokasi. Nilai
     * kosong berarti memakai default di `lib/penagihan.ts`.
     */
    penagihanAturan: defineTable({
      slot: v.string(),
      /** Saklar modul; false = tindakan penagihan ditolak server. */
      aktif: v.optional(v.boolean()),
      /** Batas hari tahap ringan/sedang/berat (menaik). Lihat lib/penagihan. */
      ambangRingan: v.optional(v.number()),
      ambangSedang: v.optional(v.number()),
      ambangBerat: v.optional(v.number()),
      /** Jendela jam kontak setempat (WIB) yang boleh dipakai petugas. */
      jamMulai: v.optional(v.number()),
      jamSelesai: v.optional(v.number()),
      diperbaruiPada: v.number(),
      /** Label admin terakhir — snapshot agar tetap terbaca. */
      diperbaruiOlehLabel: v.optional(v.string()),
    }).index("by_slot", ["slot"]),

    /**
     * Satu kasus penagihan PER PINJAMAN yang terlambat — memuat penugasan
     * petugas, tingkat eskalasi, dan ringkasan keadaan terakhir.
     *
     * Dibuat saat petugas ditugaskan atau tindakan pertama dicatat (bukan
     * untuk setiap pinjaman), sehingga tabel ini hanya memuat kasus yang
     * benar-benar ditangani. Penugasan menentukan kewenangan: petugas hanya
     * dapat menindak kasus yang ditugaskan kepadanya (`convex/penagihan.ts`).
     */
    penagihanKasus: defineTable({
      loanId: v.id("loans"),
      userId: v.id("users"),
      nomorReferensi: v.string(),
      /** Salah satu `STATUS_KASUS` di lib/penagihan. */
      status: v.string(),
      /** 0 = belum dieskalasi; 1–4 mengikuti `URUTAN_ESKALASI`. */
      tingkatEskalasi: v.number(),
      petugasUserId: v.optional(v.id("users")),
      petugasLabel: v.optional(v.string()),
      /** Salah satu `STATUS_PEMBAYARAN` — keadaan yang DICATAT petugas. */
      statusPembayaran: v.string(),
      nominalDibayar: v.optional(v.number()),
      /** Janji pembayaran yang sedang aktif (bila ada). */
      janjiAktifId: v.optional(v.id("penagihanJanji")),
      jumlahTindakan: v.number(),
      tindakanTerakhirPada: v.optional(v.number()),
      catatanTerakhir: v.optional(v.string()),
      /** Alasan penutupan kasus (mis. "lunas dicatat", "di luar jangkauan"). */
      sebabSelesai: v.optional(v.string()),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
      selesaiPada: v.optional(v.number()),
    })
      .index("by_loan", ["loanId"])
      .index("by_petugas", ["petugasUserId"])
      .index("by_status", ["status"]),

    /**
     * Riwayat komunikasi & tindakan penagihan — APPEND-ONLY.
     *
     * Setiap baris memuat jenis, saluran, HASIL, pihak yang dihubungi, waktu
     * server, dan petugas. `nomorTujuan` disimpan utuh untuk kontinuitas
     * penanganan tetapi hanya ditampilkan tersamar di daftar kerja
     * (`maskNomorTelepon`); nomor utuh dibuka lewat jalur yang mencatat audit.
     */
    penagihanTindakan: defineTable({
      kasusId: v.id("penagihanKasus"),
      loanId: v.id("loans"),
      /** Salah satu `JENIS_TINDAKAN`. */
      jenis: v.string(),
      /** Salah satu `SALURAN_TINDAKAN`. */
      saluran: v.string(),
      /** Salah satu `HASIL_TINDAKAN`. */
      hasil: v.string(),
      /** Pihak yang dihubungi — selalu "peminjam". */
      pihak: v.string(),
      nomorTujuan: v.optional(v.string()),
      /** Isi pesan yang sudah lolos penjaga pesan (lib/penagihan). */
      isiPesan: v.optional(v.string()),
      catatan: v.optional(v.string()),
      petugasUserId: v.id("users"),
      petugasLabel: v.string(),
      /** Waktu server — tidak pernah diisi klien. */
      waktu: v.number(),
    })
      .index("by_kasus", ["kasusId"])
      .index("by_loan", ["loanId"])
      .index("by_petugas", ["petugasUserId"])
      .index("by_waktu", ["waktu"]),

    /**
     * Surat somasi yang sudah diterbitkan. Satu baris per pinjaman.
     *
     * Dokumen disimpan sebagai JSON final (`dokumenJson`) supaya unduhan
     * berikutnya persis sama dengan yang pertama: nomor, angka, dan tanggal
     * tidak berubah hanya karena waktu berjalan atau pembayaran baru dicatat.
     */
    somasiTerbit: defineTable({
      loanId: v.id("loans"),
      nomorSurat: v.string(),
      dokumenJson: v.string(),
      namaBerkas: v.string(),
      /** Angka saat diterbitkan, untuk mendeteksi surat yang sudah kedaluwarsa. */
      totalKewajiban: v.number(),
      hariTerlambat: v.number(),
      olehUserId: v.id("users"),
      olehLabel: v.string(),
      pada: v.number(),
      /** "manual" | "whatsapp" | "email" — pengiriman juga berarti diserahkan. */
      diserahkanMelalui: v.optional(v.string()),
      diserahkanPada: v.optional(v.number()),
      diserahkanOlehLabel: v.optional(v.string()),
      /** Hasil pasca-somasi; catatan, bukan eksekusi pembayaran/tenor. */
      tindakLanjut: v.optional(v.string()),
      tindakLanjutPada: v.optional(v.number()),
      tindakLanjutOlehLabel: v.optional(v.string()),
      tindakLanjutCatatan: v.optional(v.string()),
    })
      .index("by_loan", ["loanId"])
      .index("by_nomor", ["nomorSurat"]),

    /** Jejak pengiriman surat somasi lewat email/WhatsApp. */
    somasiKirimLog: defineTable({
      somasiId: v.id("somasiTerbit"),
      loanId: v.id("loans"),
      kanal: v.string(),
      tujuan: v.string(),
      status: v.string(),
      respon: v.optional(v.string()),
      olehUserId: v.id("users"),
      pada: v.number(),
    })
      .index("by_loan", ["loanId", "pada"])
      .index("by_oleh", ["olehUserId", "pada"]),

    /** Janji pembayaran (promise to pay) beserta hasilnya. */
    penagihanJanji: defineTable({
      kasusId: v.id("penagihanKasus"),
      loanId: v.id("loans"),
      userId: v.id("users"),
      /** Nominal yang dijanjikan (rupiah bulat). */
      nominal: v.number(),
      /** Tanggal janji (epoch ms) — divalidasi lib/penagihan. */
      tanggalJanji: v.number(),
      /** Salah satu `SALURAN_TINDAKAN`. */
      kanal: v.string(),
      /** Salah satu `STATUS_JANJI`. */
      status: v.string(),
      catatan: v.optional(v.string()),
      dibuatOlehUserId: v.id("users"),
      dibuatOlehLabel: v.string(),
      dibuatPada: v.number(),
      ditutupPada: v.optional(v.number()),
      ditutupOlehLabel: v.optional(v.string()),
      /** Hasil saat janji ditutup (dipenuhi/dilanggar/dibatalkan). */
      hasilCatatan: v.optional(v.string()),
    })
      .index("by_kasus", ["kasusId"])
      .index("by_loan", ["loanId"])
      .index("by_status", ["status"])
      .index("by_tanggal", ["tanggalJanji"]),

    /**
     * Riwayat pembaruan STATUS PEMBAYARAN pada kasus penagihan.
     *
     * PENTING: ini catatan petugas, bukan bukti transfer. Saldo, jurnal, dan
     * status pinjaman tetap diubah lewat jalur pinjaman/pembayaran yang ada;
     * modul penagihan hanya mencatat apa yang dilaporkan.
     */
    penagihanPembayaran: defineTable({
      kasusId: v.id("penagihanKasus"),
      loanId: v.id("loans"),
      /** Salah satu `STATUS_PEMBAYARAN`. */
      status: v.string(),
      nominal: v.number(),
      /** Total kewajiban ledger saat pembaruan dicatat — untuk peninjauan. */
      totalKewajiban: v.number(),
      catatan: v.optional(v.string()),
      petugasUserId: v.id("users"),
      petugasLabel: v.string(),
      waktu: v.number(),
    })
      .index("by_kasus", ["kasusId"])
      .index("by_loan", ["loanId"]),

    /**
     * Catatan penyelesaian kasus (pelunasan, restrukturisasi, keringanan
     * denda, penyelesaian sengketa). Keputusan DICATAT, tidak dieksekusi:
     * tidak ada uang berpindah dan tidak ada jurnal yang ditulis.
     */
    penagihanPenyelesaian: defineTable({
      kasusId: v.id("penagihanKasus"),
      loanId: v.id("loans"),
      /** Salah satu `JENIS_PENYELESAIAN`. */
      jenis: v.string(),
      nominal: v.number(),
      totalKewajiban: v.number(),
      alasan: v.string(),
      petugasUserId: v.id("users"),
      petugasLabel: v.string(),
      waktu: v.number(),
    })
      .index("by_kasus", ["kasusId"])
      .index("by_loan", ["loanId"]),

    /**
     * RESTRUKTURISASI PINJAMAN — permohonan & keputusan perpanjangan/cicilan.
     *
     * Satu baris per permohonan, baik dari admin maupun dashboard nasabah.
     * Persetujuan perpanjangan mengubah `loans.tenorHari` sehingga jatuh tempo
     * bergeser; pokok, bunga, dan total kewajiban tidak dihitung ulang di sini.
     * Hanya pinjaman skema harian yang boleh diperpanjang. Persetujuan cicilan
     * hanya mencatat kesepakatan — jadwal tidak diubah otomatis.
     */
    restrukturisasiPinjaman: defineTable({
      loanId: v.id("loans"),
      userId: v.id("users"),
      /** Salah satu `JENIS_RESTRUKTURISASI`. */
      jenis: v.string(),
      tenorLamaHari: v.number(),
      tenorBaruHari: v.number(),
      tambahanHari: v.number(),
      alasan: v.string(),
      /** Salah satu `STATUS_RESTRUKTURISASI`. */
      status: v.string(),
      diajukanOlehUserId: v.id("users"),
      diajukanOlehLabel: v.string(),
      /**
       * Benar bila permohonan datang dari dashboard nasabah, bukan dicatat
       * admin. Kosong pada baris lama yang semuanya diajukan admin.
       */
      diajukanOlehNasabah: v.optional(v.boolean()),
      /** Nominal per pembayaran yang diusulkan nasabah (jenis `cicilan`). */
      usulanCicilan: v.optional(v.number()),
      dibuatPada: v.number(),
      diputuskanOlehUserId: v.optional(v.id("users")),
      diputuskanOlehLabel: v.optional(v.string()),
      diputuskanPada: v.optional(v.number()),
      catatanKeputusan: v.optional(v.string()),
    })
      .index("by_loan", ["loanId"])
      .index("by_status", ["status"]),

    /**
     * Pengaduan nasabah atas proses penagihan (atau catatan aplikasi).
     *
     * Dipisah dari `waLogs` dan audit trail: pengaduan adalah suara nasabah
     * yang harus punya status, penanggung jawab, dan penyelesaian — bukan
     * sekadar pesan masuk.
     */
    pengaduanNasabah: defineTable({
      loanId: v.optional(v.id("loans")),
      userId: v.optional(v.id("users")),
      nomorReferensi: v.optional(v.string()),
      /** Kanal masuk: "whatsapp" | "telepon" | "tatap_muka" | "petugas" | "sistem". */
      kanal: v.string(),
      /** Salah satu `KATEGORI_PENGADUAN`. */
      kategori: v.string(),
      isi: v.string(),
      /** Salah satu `STATUS_PENGADUAN`. */
      status: v.string(),
      /**
       * Salah satu `PRIORITAS_PENGADUAN`. Opsional karena baris lama belum
       * punya prioritas; pembaca memperlakukannya sebagai "normal".
       */
      prioritas: v.optional(v.string()),
      prioritasDiubahPada: v.optional(v.number()),
      petugasUserId: v.optional(v.id("users")),
      petugasLabel: v.optional(v.string()),
      penyelesaian: v.optional(v.string()),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
      ditutupPada: v.optional(v.number()),
    })
      .index("by_status", ["status"])
      .index("by_user", ["userId"])
      .index("by_loan", ["loanId"]),

    /**
     * PESAN dalam utas pengaduan nasabah (helpdesk) — append-only.
     *
     * Pengaduan sebelumnya hanya menyimpan SATU uraian, sehingga percakapan
     * lanjutan (petugas minta klarifikasi → nasabah menjawab → petugas
     * menyelesaikan) tidak punya tempat. Tabel ini menyimpan tiap pesan apa
     * adanya beserta arahnya, supaya urutan percakapan tidak bisa ditulis ulang
     * dan tiap pihak tahu siapa yang berbicara.
     *
     * Isi berkas lampiran TIDAK disimpan di sini: hanya NAMA berkasnya sebagai
     * penanda, karena berkas sensitif tetap dikelola modul KYC/berkas.
     */
    pengaduanPesan: defineTable({
      pengaduanId: v.id("pengaduanNasabah"),
      /** Arah pesan: dari nasabah atau dari petugas PINDAI. */
      arah: v.union(v.literal("nasabah"), v.literal("petugas")),
      isi: v.string(),
      penulisUserId: v.optional(v.id("users")),
      penulisLabel: v.string(),
      lampiranNama: v.optional(v.string()),
      dibuatPada: v.number(),
    })
      .index("by_pengaduan", ["pengaduanId"])
      .index("by_pengaduan_dibuatPada", ["pengaduanId", "dibuatPada"]),

    /**
     * TANTANGAN OTP LOGIN WHATSAPP — kode yang dikirim ke NOMOR WhatsApp, baik
     * untuk peminjam lama maupun nomor baru.
     *
     * Kenapa tabel ini terpisah dari `waOtpChallenges`: tantangan di sana
     * SELALU milik pengguna yang sedang masuk (`userId` wajib), sedangkan login
     * nomor terjadi SEBELUM ada sesi — pemiliknya adalah nomor itu sendiri. Menumpangkan baris tanpa pemilik ke tabel ber-`userId` akan
     * membuat setiap pembaca lama ikut membaca baris yang bukan miliknya.
     *
     * Aturan yang tetap sama dengan OTP lain: hanya HASH + salt yang disimpan
     * (kode aslinya tidak pernah ditulis), sekali pakai, berumur 5 menit, punya
     * batas percobaan, dan dibatasi laju per nomor & per IP.
     */
    klaimOtp: defineTable({
      /** Nomor tujuan ternormalisasi (62… tanpa +) — kode hanya sah untuk ini. */
      nomor: v.string(),
      /** SHA-256(salt + ":" + kode) dalam heksadesimal. */
      kodeHash: v.string(),
      /** Salt acak per kode (hex). */
      salt: v.string(),
      dibuatPada: v.number(),
      kedaluwarsaPada: v.number(),
      maksPercobaan: v.number(),
      percobaanGagal: v.number(),
      /** Terisi saat kode dipakai — sekali pakai, tidak bisa diulang. */
      dipakaiPada: v.optional(v.number()),
      /** Akun sesi yang memakai kode ini (jejak siapa yang mengklaim). */
      dipakaiOlehUserId: v.optional(v.id("users")),
      /** "menunggu" | "terkirim" | "gagal" — hasil kirim, bukan status klaim. */
      statusPengiriman: v.string(),
      /** Respon Fonnte yang sudah dipotong (tanpa token). */
      responPengiriman: v.optional(v.string()),
      /** IP klien (dikirim klien) untuk pembatas laju & jejak audit. */
      ip: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      /**
       * Snapshot jumlah berkas lama yang ditemukan saat kode diminta. Dipakai
       * untuk memberi tahu pemakai bahwa nomornya memang punya data lama —
       * tanpa membocorkan isinya sebelum kode diverifikasi.
       */
      berkasLama: v.number(),
    })
      .index("by_nomor", ["nomor"])
      .index("by_ip", ["ip"]),

    /**
     * JEJAK PENAUTAN KLAIM PEMINJAM LAMA — APPEND-ONLY, satu baris per klaim.
     *
     * Kenapa dicatat terstruktur (bukan hanya kalimat di `auditLog`): perpindahan
     * kepemilikan berkas adalah perubahan paling sensitif di aplikasi ini, jadi
     * harus bisa dijawab "berkas apa saja yang berpindah, dari akun siapa, ke
     * akun siapa, dan kapan" tanpa membaca prosa. Baris di sini TIDAK PERNAH
     * diubah/dihapus; pembatalan pun dicatat sebagai baris baru.
     */
    klaimPeminjam: defineTable({
      /** Akun tujuan — sesi aktif yang menerima berkas lama. */
      userId: v.id("users"),
      /** Nomor WhatsApp yang dibuktikan lewat OTP (ternormalisasi). */
      nomor: v.string(),
      /** Pemilik lama berkas, bila berbeda dari akun tujuan. */
      akunLamaUserId: v.optional(v.id("users")),
      /** Label akun tujuan & pemilik lama (snapshot agar tetap terbaca). */
      userIdLabel: v.string(),
      akunLamaLabel: v.optional(v.string()),
      pada: v.number(),
      /** Cara masuk: "otp_whatsapp" | "sesi_aktif". */
      metode: v.string(),
      pinjaman: v.number(),
      gadai: v.number(),
      kredit: v.number(),
      masterNasabah: v.number(),
      /** Total pokok pinjaman yang berpindah — rupiah bulat. */
      pokokPinjaman: v.number(),
      keterangan: v.string(),
    })
      .index("by_user", ["userId"])
      .index("by_nomor", ["nomor"])
      .index("by_pada", ["pada"]),

    /**
     * JEJAK GERBANG PENGIRIMAN — pembatas laju & kunci sementara pengajuan.
     *
     * Satu baris per kejadian, dibedakan lewat `jenis`:
     * - `"kirim"` = pengajuan yang DITERIMA (dasar pembatas 5 per menit);
     * - `"pelanggaran"` = kiriman yang ditolak karena mencurigakan (dasar kunci
     *   15 menit setelah 3 kali, lihat `convex/gerbangKirim.ts`).
     *
     * Sengaja dipisah dari `loginAttempts`: percobaan masuk yang gagal tidak
     * boleh ikut memakan jatah pengajuan, dan sebaliknya. `sebab` hanya diisi
     * pada baris pelanggaran. Barisnya dibuang cron harian setelah 7 hari;
     * yang tetap tinggal adalah `auditLog` pelanggarannya.
     */
    gerbangKirim: defineTable({
      kunci: v.string(),
      jenis: v.string(),
      sebab: v.optional(v.string()),
      waktu: v.number(),
    })
      .index("by_kunci_jenis_waktu", ["kunci", "jenis", "waktu"])
      .index("by_waktu", ["waktu"]),

    /**
     * PRATINJAU SUPER ADMIN — "masuk sebagai" akun pendana/peminjam.
     *
     * Satu baris melewati dua tahap:
     *  1. TIKET — dibuat `mintaTiket` setelah admin lolos `requireAdminSession`
     *     (TOTP terverifikasi). Tiket berumur pendek dan sekali pakai: tanpa itu
     *     provider login akan menerima permintaan "masuk sebagai siapa saja"
     *     tanpa bukti siapa yang memintanya.
     *  2. SESI — tiket dipakai provider `pratinjau-admin`; dari titik itu sesi
     *     NYATA akun target diberikan ke peramban admin (bukan tampilan tiruan),
     *     dan `berlakuHingga` membatasi masa berlakunya.
     *
     * Yang dicatat adalah jejak akuntabilitas: siapa adminnya, akun siapa yang
     * dibuka, kapan, batas waktunya, dan kapan ditutup. Barisnya tidak dihapus
     * supaya pratinjau lama tetap bisa diaudit.
     */
    pratinjauSesi: defineTable({
      adminId: v.id("users"),
      /** Label admin saat tiket dibuat (snapshot agar tetap terbaca). */
      adminLabel: v.string(),
      targetId: v.id("users"),
      /** Label akun target (nama/email) saat tiket dibuat. */
      targetLabel: v.string(),
      /** Peran akun target saat itu — untuk memilih ruang tujuan. */
      targetPeran: v.optional(v.string()),
      alasan: v.optional(v.string()),
      /**
       * Nonce acak dari peramban admin. Kunci baris ini untuk bilah pratinjau
       * dan penutupan dari sisi klien; tanpa nonce, dua pratinjau bersamaan
       * tidak bisa dibedakan.
       */
      nonce: v.string(),
      /** Waktu tiket dibuat; tiket batal sendiri setelah `kedaluwarsa`. */
      dibuatPada: v.number(),
      kedaluwarsa: v.number(),
      /** Terisi saat sesi nyata akun target benar-benar diberikan. */
      dipakaiPada: v.optional(v.number()),
      /**
       * Sesi Auth hasil pratinjau. Dibuat server saat tiket ditukar, bukan oleh
       * Convex Auth: jalur `signIn` bawaannya menghapus sesi pemanggil — yaitu
       * sesi admin — sehingga admin harus masuk ulang setelah pratinjau.
       * Kolom ini juga yang membuat "akhiri pratinjau" dari panel mencabut SESI
       * YANG TEPAT, bukan setiap sesi yang dibuat setelah pratinjau mulai.
       */
      sesiPratinjauId: v.optional(v.id("authSessions")),
      /** Batas waktu sesi pratinjau. */
      berlakuHingga: v.optional(v.number()),
      /**
       * Titik lokasi nasabah TEPAT SEBELUM pratinjau dimulai. `null` berarti
       * nasabah belum pernah punya titik sama sekali.
       *
       * Dipakai sebagai jaring pengaman: bila ada jalur tulis lokasi yang lolos
       * (mis. aplikasi versi lama atau token perangkat yang tersisa dari
       * pratinjau sebelumnya), lokasi asli nasabah tetap bisa dikembalikan saat
       * pratinjau ditutup. Tanpa ini, koordinat admin menjadi "lokasi nasabah"
       * secara permanen dan peta pemantauan menunjuk orang yang salah.
       */
      lokasiSebelum: v.optional(
        v.union(
          v.null(),
          v.object({
            lat: v.number(),
            lng: v.number(),
            akurasi: v.number(),
            waktu: v.number(),
            sumber: v.string(),
            platform: v.optional(v.string()),
            versiApp: v.optional(v.string()),
            tanda: v.optional(v.array(v.string())),
            identikBerturut: v.optional(v.number()),
          }),
        ),
      ),
      /** Waktu lokasi nasabah dipulihkan dari `lokasiSebelum`. */
      lokasiDipulihkanPada: v.optional(v.number()),
      /** Waktu pratinjau ditutup. */
      selesai: v.optional(v.number()),
      /**
       * "klien" (ditutup dari bilah pratinjau) | "admin" (dipaksa dari panel)
       * | "sistem" (cron menutup pratinjau yang kehabisan waktu).
       */
      ditutupOleh: v.optional(v.string()),
    })
      .index("by_admin", ["adminId"])
      .index("by_target", ["targetId"])
      // Dipakai `sesiPratinjauAktif` di setiap heartbeat lokasi dan pagar
      // transaksi: satu pembacaan per sesi, bukan memindai riwayat nasabah.
      .index("by_sesi_pratinjau", ["sesiPratinjauId"])
      .index("by_nonce", ["nonce"]),

    /**
     * Hadiah satu kuartal Doorprize (3 bulan sekali).
     *
     * Satu baris per kuartal yang sudah diatur admin; kuartal tanpa baris
     * memakai preset bawaan di `lib/doorprize.ts`. `kode` berbentuk `2026-Q4`
     * dan menjadi kunci periode yang sama dengan `doorprizeTiket.periode`.
     */
    doorprizePeriode: defineTable({
      kode: v.string(),
      quarter: v.number(),
      year: v.number(),
      /** Awal kuartal (00.00 WIB hari pertama). */
      startDate: v.number(),
      /** Momen terakhir kuartal; pengundian resmi pada tanggal ini. */
      endDate: v.number(),
      prizeCategory: v.union(
        v.literal("GOLD"),
        v.literal("ELECTRONICS"),
        v.literal("VOUCHER"),
        v.literal("OTHER"),
      ),
      prizeName: v.string(),
      /** Nilai perkiraan rupiah; divalidasi server < Rp1.000.000. */
      prizeEstimatedValue: v.number(),
      updatedAt: v.number(),
      updatedBy: v.string(),
    }).index("by_kode", ["kode"]),

    /**
     * Tiket Doorprize triwulanan — diterbitkan otomatis, tidak bisa diklaim manual.
     *
     * `referensi` adalah kunci idempotensi: satu pelunasan hanya menghasilkan
     * satu tiket peminjam, satu penempatan dana hanya menghasilkan tiketnya
     * sekali. `periode` berbentuk `YYYY-Qn` (WIB); tiket periode lama `YYYY-MM`
     * tetap dibaca untuk kuartal yang sama lewat `kunciPeriodeKuartal`.
     */
    doorprizeTiket: defineTable({
      pemilikId: v.id("users"),
      peran: v.union(v.literal("peminjam"), v.literal("pendana")),
      periode: v.string(),
      /** `pelunasan_tepat_waktu` | `pendanaan_1jt` | `undian_admin`. */
      sumber: v.string(),
      /** Kunci unik sumber tiket (mis. nomor referensi pinjaman/alokasi). */
      referensi: v.string(),
      status: v.union(
        v.literal("aktif"),
        v.literal("menang"),
        v.literal("batal"),
      ),
      dibuatPada: v.number(),
      /** Terisi saat tiket ini memenangkan undian. */
      menangPada: v.optional(v.number()),
    })
      .index("by_pemilik", ["pemilikId"])
      .index("by_periode", ["periode"])
      .index("by_referensi", ["referensi"])
      .index("by_pemilik_periode", ["pemilikId", "periode"]),

    /** Satu pemenang per kuartal; catatan permanen, tidak dihapus. */
    doorprizeUndian: defineTable({
      periode: v.string(),
      pemilikId: v.id("users"),
      tiketId: v.id("doorprizeTiket"),
      peran: v.union(v.literal("peminjam"), v.literal("pendana")),
      hadiah: v.string(),
      jumlahPeserta: v.number(),
      jumlahTiket: v.number(),
      diundiPada: v.number(),
      diundiOleh: v.string(),
      diundiOlehId: v.id("users"),
      /**
       * Waktu hadiah benar-benar diserahkan ke pemenang. Kosong = belum.
       *
       * Sebelum kolom ini ada, undian berhenti di "pemenang tercatat" tanpa
       * bukti apa pun bahwa hadiahnya sampai. Untuk undian berhadiah, jarak
       * antara "menang" dan "diterima" itulah yang dipertanyakan peserta.
       */
      hadiahDiserahkanPada: v.optional(v.number()),
      /** Catatan penyerahan (kurir, nomor resi, lokasi serah terima). */
      catatanPenyerahan: v.optional(v.string()),
    })
      .index("by_periode", ["periode"])
      // Papan pemenang publik membaca undian terbaru lintas kuartal.
      .index("by_diundiPada", ["diundiPada"]),

    /**
     * Kampanye promo pinjaman yang tampil di empat permukaan: beranda publik,
     * dashboard nasabah, halaman /promo, dan form pengajuan.
     *
     * Teksnya murni kampanye. Bunga, biaya, dan plafon tetap dibaca dari
     * konfigurasi dan plafon nasabah, jadi promo tidak pernah mengubah angka
     * pinjaman. Beberapa baris boleh aktif bersamaan; tiap penempatan memilih
     * satu yang paling baru diperbarui dan sedang dalam masa berlaku.
     */
    promoPinjaman: defineTable({
      /** Label kecil di atas judul; string kosong berarti tidak ditampilkan. */
      badge: v.string(),
      judul: v.string(),
      deskripsi: v.string(),
      /** Awal hari pertama (00.00 WIB) dan akhir hari terakhir (WIB). */
      mulai: v.number(),
      selesai: v.number(),
      penempatan: v.array(
        v.union(
          v.literal("beranda"),
          v.literal("dashboard"),
          v.literal("promo"),
          v.literal("pengajuan"),
        ),
      ),
      aktif: v.boolean(),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
      diperbaruiOleh: v.string(),
    }).index("by_diperbarui", ["diperbaruiPada"]),

    /**
     * Banner promo bergambar — satu baris satu kampanye.
     *
     * Berbeda dari `promoPinjaman` (teks) dan `promoBunga` (angka): tabel ini
     * mengatur materi gambar untuk beranda, dashboard, dan `/promo`. Beberapa
     * baris boleh berjalan bersamaan; `prioritas` kecil tampil lebih dulu,
     * sehingga admin bisa menyiapkan kampanye berikutnya dan membiarkan
     * jadwalnya berganti tanpa menyentuh gambar lagi.
     *
     * Dua berkas untuk dua rasio: `desktop` (8:3) dan `mobile` (4:5). Bila salah
     * satu kosong, gambar yang ada dipakai untuk keduanya. `promoBungaId`
     * opsional mengikat tampilnya banner ke promo bunga: banner ikut berhenti
     * saat promo berakhir. URL storage memang publik karena materi kampanye,
     * berbeda dengan dokumen KYC yang selalu lewat `/berkas`.
     */
    bannerPromo: defineTable({
      /** Nama internal kampanye, mis. "Payday tenor 7 hari". */
      nama: v.string(),
      /** Teks alternatif gambar; juga tampil bila gambar gagal dimuat. */
      judul: v.string(),
      /** Path internal tujuan klik; string kosong = banner statis. */
      tautan: v.string(),
      gambarDesktopId: v.optional(v.id("_storage")),
      gambarMobileId: v.optional(v.id("_storage")),
      /** Tempat tampil; minimal satu diisi server. */
      penempatan: v.array(
        v.union(
          v.literal("beranda"),
          v.literal("dashboard"),
          v.literal("promo"),
        ),
      ),
      /** Awal hari pertama dan akhir hari terakhir (WIB), milidetik. */
      mulai: v.number(),
      selesai: v.number(),
      aktif: v.boolean(),
      promoBungaId: v.optional(v.id("promoBunga")),
      /** Angka kecil tampil lebih dulu saat beberapa banner berjalan. */
      prioritas: v.number(),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
      diperbaruiOleh: v.string(),
    })
      .index("by_prioritas", ["prioritas"])
      .index("by_diperbarui", ["diperbaruiPada"]),

    /**
     * Promo BUNGA pinjaman harian — admin menetapkan bunga pengganti untuk
     * tenor tertentu selama rentang tanggal. Berbeda dari `promoPinjaman` yang
     * hanya teks kampanye: angka di sini dipakai mesin harga saat pengajuan
     * disimpan, lalu dibekukan pada pinjaman (`promoBunga*`).
     */
    promoBunga: defineTable({
      /** Nama internal yang dibaca admin, mis. "Bunga 15% tenor 7 hari". */
      nama: v.string(),
      /** Bunga promo persen dari pokok (1–25), menggantikan tarif matriks. */
      persenBunga: v.number(),
      /** Tenor harian yang mendapat promo ini (subset 7/14/21/28). */
      tenor: v.array(v.number()),
      /** Awal hari pertama dan akhir hari terakhir (WIB), dalam milidetik. */
      mulai: v.number(),
      selesai: v.number(),
      aktif: v.boolean(),
      /**
       * Boleh digabung voucher potongan bunga. Kosong = boleh (perilaku kampanye
       * lama). `false` dipakai saat promo sudah dalam, sehingga subsidi kedua
       * tidak menumpuk di atasnya.
       */
      bolehVoucher: v.optional(v.boolean()),
      /**
       * Pagu subsidi kampanye dalam rupiah; kosong/0 = tanpa pagu. Diperiksa
       * sebelum promo dipakai, dan kampanye dimatikan otomatis saat pagunya
       * habis — bukan dibiarkan terus menyerap selisih tanpa terlihat.
       */
      paguSubsidi: v.optional(v.number()),
      /** Penanda peringatan pagu yang sudah pernah ditulis ke audit ("80"/"100"). */
      paguPeringatan: v.optional(v.string()),
      dibuatPada: v.number(),
      diperbaruiPada: v.number(),
      diperbaruiOleh: v.string(),
    })
      .index("by_aktif", ["aktif", "mulai"])
      .index("by_diperbarui", ["diperbaruiPada"]),

    /**
     * Voucher nasabah — potongan biaya/bunga, tambahan limit, atau tambahan
     * tenor sekali pakai.
     *
     * `pemilikId` selalu diisi: voucher hanya berlaku untuk akun yang dituju,
     * sehingga tidak ada kode voucher publik yang bisa dipakai siapa saja.
     * `terpakai` dihitung di server saat pengajuan disimpan, bukan di klien.
     * `referensi` dipakai voucher apresiasi agar satu pelunasan tidak pernah
     * menerbitkan dua voucher (idempoten).
     */
    voucher: defineTable({
      kode: v.string(),
      jenis: v.union(
        v.literal("diskon_admin"),
        v.literal("diskon_ujrah"),
        v.literal("diskon_margin"),
        v.literal("boost_plafon"),
        v.literal("diskon_bunga"),
        v.literal("tambah_tenor"),
      ),
      judul: v.string(),
      /**
       * Angka sesuai jenis: rupiah untuk potongan biaya/limit, poin persen
       * untuk `diskon_bunga`, dan hari untuk `tambah_tenor`.
       */
      nilai: v.number(),
      /** Pokok pengajuan minimum agar voucher boleh dipakai. */
      minPokok: v.number(),
      batasPemakaian: v.number(),
      terpakai: v.number(),
      pemilikId: v.id("users"),
      sumber: v.union(
        v.literal("admin"),
        v.literal("apresiasi"),
        v.literal("referral"),
      ),
      status: v.union(
        v.literal("aktif"),
        v.literal("terpakai"),
        v.literal("dicabut"),
      ),
      berlakuSampai: v.number(),
      dibuatPada: v.number(),
      dibuatOleh: v.optional(v.id("users")),
      dipakaiPada: v.optional(v.number()),
      dipakaiLoanId: v.optional(v.id("loans")),
      /** Nomor referensi pinjaman asal voucher apresiasi. */
      referensi: v.optional(v.string()),
    })
      .index("by_pemilik", ["pemilikId"])
      .index("by_referensi", ["referensi"])
      // Panel admin membaca voucher terbaru dan menyaring per status; tanpa
      // indeks ini setiap muat panel memindai seluruh tabel.
      .index("by_dibuatPada", ["dibuatPada"])
      .index("by_status", ["status"]),

    /**
     * Jejak pengingat WhatsApp voucher H-3.
     *
     * Kenapa perlu tabel sendiri: cron berjalan tiap hari, sedangkan pengingat
     * hanya boleh berangkat SEKALI per voucher. `kunci` adalah identitas logisnya
     * (`voucher:<id>:h3`), bukan isi pesan — perubahan teks atau perpanjangan
     * masa berlaku tidak menggandakan kiriman kecuali kuncinya ikut berubah.
     *
     * Yang dicatat hanya hasil percobaan yang benar-benar sampai ke gateway.
     * Kegagalan infrastruktur (gateway mati/token kosong) sengaja TIDAK dicatat
     * supaya voucher yang belum diingatkan tetap dicoba pada jadwal berikutnya;
     * tabel ini bukan daftar "sudah pernah dicoba", melainkan "sudah dikabari".
     */
    pengingatVoucher: defineTable({
      voucherId: v.id("voucher"),
      userId: v.id("users"),
      /** Identitas logis pengingat: `voucher:<id>:h3`. */
      kunci: v.string(),
      /** Nomor tujuan yang BENAR-BENAR dipakai saat percobaan itu. */
      nomor: v.string(),
      /** "terkirim" | "gagal". */
      status: v.string(),
      /** Keterangan gateway; tidak pernah berisi kredensial. */
      respon: v.optional(v.string()),
      waktu: v.number(),
    })
      .index("by_kunci", ["kunci"])
      .index("by_voucher", ["voucherId"]),

    /**
     * Pengaturan peringatan kas admin.
     *
     * Satu baris `slot = "global"`. Saldo kas disimpan bersama waktu
     * pembaruannya: peringatan otomatis hanya berguna bila saldo yang dipakai
     * memang saldo yang dicatat admin, bukan tebakan dari mutasi terakhir.
     */
    kasPengaturan: defineTable({
      slot: v.string(),
      aktif: v.boolean(),
      saldoKas: v.number(),
      saldoDiperbaruiPada: v.optional(v.number()),
      saldoMinimum: v.number(),
      hariPeringatan: v.number(),
      nomorWhatsApp: v.optional(v.string()),
      diperbaruiPada: v.number(),
      diperbaruiOleh: v.id("users"),
    }).index("by_slot", ["slot"]),

    /**
     * Biaya operasional berulang bulanan.
     *
     * Hanya nominal dan tanggal; tidak ada pembayaran yang dicatat di sini.
     * Fungsinya memasukkan komitmen yang sudah diketahui ke proyeksi kas agar
     * hari minus tidak mengejutkan admin.
     */
    biayaOperasional: defineTable({
      judul: v.string(),
      nominal: v.number(),
      hariDalamBulan: v.number(),
      aktif: v.boolean(),
      dibuatPada: v.number(),
      dibuatOleh: v.id("users"),
    }).index("by_aktif", ["aktif"]),

    /**
     * Jejak peringatan kas yang pernah dihitung cron.
     *
     * Satu baris per tanggal WIB: cron harian tidak mengirim pesan yang sama
     * berkali-kali pada hari yang sama, tetapi tetap mencatat hasil hitungnya.
     */
    kasPeringatan: defineTable({
      tanggal: v.string(),
      tanggalKritis: v.number(),
      saldoProyeksi: v.number(),
      saldoMinimum: v.number(),
      hariKe: v.number(),
      dibuatPada: v.number(),
      terkirim: v.boolean(),
      respon: v.optional(v.string()),
    }).index("by_tanggal", ["tanggal"]),

    /**
     * Kode referral milik satu akun.
     *
     * Satu akun satu kode; kode dibuat saat nasabah membukanya, bukan saat
     * mendaftar, supaya akun yang tidak pernah dipakai tidak menumpuk kode.
     */
    referralKode: defineTable({
      userId: v.id("users"),
      kode: v.string(),
      dibuatPada: v.number(),
      /** Jumlah klaim yang tercatat memakai kode ini (termasuk yang belum lunas). */
      totalKlaim: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_kode", ["kode"]),

    /**
     * Satu pemakaian kode referral.
     *
     * `pengundangId` adalah akun pemakai kode; `perujukId` pemilik kode.
     * Hadiah baru terbit saat pinjaman pengundang lunas, jadi status awal
     * selalu `menunggu_lunas`. `_id` baris ini menjadi bagian nomor referensi
     * voucher hadiah, sehingga pelunasan yang dicatat ulang tidak menggandakan
     * hadiah.
     */
    referralKlaim: defineTable({
      kodeId: v.id("referralKode"),
      kode: v.string(),
      perujukId: v.id("users"),
      pengundangId: v.id("users"),
      diklaimPada: v.number(),
      status: v.union(
        v.literal("menunggu_lunas"),
        v.literal("hadiah_diberikan"),
        v.literal("batal"),
      ),
      loanId: v.optional(v.id("loans")),
      hadiahDiberikanPada: v.optional(v.number()),
      voucherPerujukId: v.optional(v.id("voucher")),
      voucherPengundangId: v.optional(v.id("voucher")),
    })
      .index("by_perujuk", ["perujukId"])
      .index("by_pengundang", ["pengundangId"])
      .index("by_kode", ["kodeId"])
      .index("by_status", ["status"]),

    /**
     * Bukti lolos Cloudflare Turnstile untuk satu akun.
     *
     * Verifikasi Turnstile butuh permintaan keluar (`fetch`), dan `fetch` tidak
     * boleh berjalan di dalam mutation Convex. Karena itu verifikasi dilakukan
     * action terpisah, lalu hasilnya dicatat di sini sebagai pas berumur pendek
     * yang DIPAKAI SEKALI oleh `gerbangKirim.mintaIzinKirim`. Tanpa baris ini,
     * siapa pun bisa memanggil mutation gerbang secara langsung dan melewati
     * pemeriksaan bot.
     *
     * Tabel hanya terisi bila `TURNSTILE_SECRET_KEY` diisi di environment; selama
     * kuncinya kosong, gerbang berjalan seperti sebelumnya.
     */
    turnstilePasses: defineTable({
      userId: v.id("users"),
      /** Waktu kedaluwarsa pas; pas lama tidak berguna karena sekali pakai. */
      kedaluwarsa: v.number(),
      dipakaiPada: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    /**
     * Antrean auto-matching: pokok pinjaman 7/14 hari yang sudah lunas kembali
     * ke pool dan siap disalurkan ke peminjam berikutnya. Satu baris per
     * pelunasan; `status` berubah saat admin menandai sudah tersalurkan.
     */
    matchingQueue: defineTable({
      loanId: v.id("loans"),
      nomorReferensi: v.string(),
      pokok: v.number(),
      tenorHari: v.number(),
      /** Waktu dana kembali ke pool (pelunasan dicocokkan). */
      tersediaPada: v.number(),
      status: v.union(v.literal("tersedia"), v.literal("tersalurkan")),
      /** Pinjaman berikutnya yang memakai dana ini; kosong selama menunggu. */
      loanTujuanId: v.optional(v.id("loans")),
      dicocokkanPada: v.optional(v.number()),
      dicocokkanOleh: v.optional(v.string()),
    })
      .index("by_status", ["status"])
      .index("by_loan", ["loanId"]),

    /**
     * Etalase PPOB publik — salinan harga dari server pulsa/H2H.
     *
     * Sumber kebenaran harga modal tetap provider; baris di sini adalah snapshot
     * saat sinkron terakhir. `hargaJual` disimpan, bukan dihitung saat dibaca,
     * karena harga yang sudah ditampilkan ke pembeli tidak boleh berubah di
     * tengah checkout hanya karena admin menyentuh markup.
     *
     * Produk di sini TERPISAH dari `katalogSyariah`: etalase ini penjualan tunai,
     * bukan akad murabahah.
     */
    ppobProduk: defineTable({
      /** SKU provider; kunci upsert saat sinkron. */
      kode: v.string(),
      nama: v.string(),
      kategori: v.union(
        v.literal("pulsa"),
        v.literal("data"),
        v.literal("token-listrik"),
        v.literal("game"),
        v.literal("ewallet"),
      ),
      /** Nama operator/brand dari provider, mis. Telkomsel, PLN, Mobile Legends. */
      operator: v.optional(v.string()),
      /** Harga modal dari provider — rupiah bulat. */
      hargaModal: v.number(),
      /** Harga yang dibayar pembeli — rupiah bulat. */
      hargaJual: v.number(),
      /** Admin pernah menyetel harga; sinkron tidak menimpanya kecuali di bawah modal. */
      hargaManual: v.optional(v.boolean()),
      /** Sakelar tampil di etalase publik. */
      aktif: v.boolean(),
      /** Provider menyatakan produk bisa dibeli pada sinkron terakhir. */
      tersedia: v.boolean(),
      /** Stok dari provider bila dilaporkan; kosong = tidak dibatasi. */
      stok: v.optional(v.number()),
      diperbaruiPada: v.number(),
      dibuatPada: v.number(),
    })
      .index("by_kode", ["kode"])
      .index("by_kategori", ["kategori", "aktif", "tersedia"])
      .index("by_aktif", ["aktif"])
      .index("by_nama", ["nama"])
      .index("by_diperbarui", ["diperbaruiPada"]),

    /**
     * Pesanan PPOB publik.
     *
     * `refId` adalah kunci idempotensi provider: dikirim ulang dengan nilai yang
     * sama berarti "periksa transaksi ini", bukan transaksi baru. `hargaModal`
     * dan `hargaJual` dibekukan saat pesanan dibuat supaya laba tidak berubah
     * ketika admin menaikkan markup kemudian.
     */
    ppobPesanan: defineTable({
      kodePesanan: v.string(),
      refId: v.string(),
      produkKode: v.string(),
      namaProduk: v.string(),
      kategori: v.union(
        v.literal("pulsa"),
        v.literal("data"),
        v.literal("token-listrik"),
        v.literal("game"),
        v.literal("ewallet"),
      ),
      nomorTujuan: v.string(),
      namaPembeli: v.optional(v.string()),
      /** Nomor WhatsApp pembeli untuk konfirmasi pembayaran & kendala. */
      whatsapp: v.string(),
      hargaModal: v.number(),
      hargaJual: v.number(),
      /** hargaJual - hargaModal; tidak pernah negatif. */
      laba: v.number(),
      status: v.union(
        v.literal("menunggu_bayar"),
        v.literal("dibayar"),
        v.literal("diproses"),
        v.literal("sukses"),
        v.literal("gagal"),
        v.literal("refund"),
      ),
      /** Pesan terakhir dari provider, ditampilkan apa adanya kepada admin. */
      pesanProvider: v.optional(v.string()),
      /** Nomor seri/token/voucher dari provider. */
      sn: v.optional(v.string()),
      dibuatPada: v.number(),
      dibayarPada: v.optional(v.number()),
      diprosesPada: v.optional(v.number()),
      selesaiPada: v.optional(v.number()),
      /** Admin yang memverifikasi pembayaran. */
      diverifikasiOleh: v.optional(v.id("users")),
      catatanAdmin: v.optional(v.string()),
      /** Jumlah percobaan topup; mencegah dua proses berjalan bersamaan. */
      percobaan: v.optional(v.number()),
    })
      .index("by_kode_pesanan", ["kodePesanan"])
      .index("by_ref", ["refId"])
      .index("by_status", ["status", "dibuatPada"])
      .index("by_whatsapp", ["whatsapp", "dibuatPada"])
      .index("by_dibuat", ["dibuatPada"]),

    /**
     * Mutasi saldo deposit di server pulsa.
     *
     * Hanya catatan; saldo sebenarnya tetap milik provider. Dipakai admin untuk
     * melihat kapan deposit terakhir masuk dan berapa sisa yang dilaporkan.
     */
    ppobMutasiSaldo: defineTable({
      arah: v.union(v.literal("masuk"), v.literal("keluar")),
      nominal: v.number(),
      /** Saldo yang dilaporkan provider setelah mutasi, bila ada. */
      saldoSetelah: v.optional(v.number()),
      keterangan: v.string(),
      /** "manual" | "cek-provider" | "topup" */
      sumber: v.string(),
      pesananKode: v.optional(v.string()),
      dibuatPada: v.number(),
      dibuatOleh: v.optional(v.id("users")),
    }).index("by_waktu", ["dibuatPada"]),

    /**
     * Pengaturan etalase PPOB — satu baris `slot = "global"`.
     *
     * Username disimpan di sini karena bukan rahasia; API key tetap di
     * environment (`PPOB_H2H_API_KEY`) supaya tidak pernah ikut ke snapshot
     * konfigurasi atau riwayat perubahan.
     */
    ppobPengaturan: defineTable({
      slot: v.string(),
      /** Etalase menerima pesanan baru. */
      aktif: v.boolean(),
      /** "digiflazz" atau "kustom". */
      provider: v.string(),
      /** URL dasar server pulsa kustom; kosong = alamat bawaan provider. */
      baseUrl: v.optional(v.string()),
      username: v.optional(v.string()),
      /** Markup harga jual dari modal (persen). */
      markupPersen: v.number(),
      /** Markup minimum per produk (rupiah), menutup biaya transfer. */
      markupMin: v.number(),
      /** Kalimat tambahan di halaman pembayaran, mis. jam operasional. */
      instruksi: v.optional(v.string()),
      /** Saldo deposit terakhir yang dilaporkan provider. */
      saldoTerakhir: v.optional(v.number()),
      saldoDiperbaruiPada: v.optional(v.number()),
      terakhirSinkron: v.optional(v.number()),
      terakhirSinkronOleh: v.optional(v.id("users")),
      diperbaruiPada: v.number(),
      diperbaruiOleh: v.optional(v.id("users")),
    }).index("by_slot", ["slot"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
