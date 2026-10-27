/**
 * Hak subjek data: salinan data pribadi milik sendiri & penghapusan akun mandiri.
 *
 * Dipisah dari `profilNasabah` dan `admin` karena keduanya melayani kebutuhan
 * lain: berkas ini hanya menjawab dua permintaan pemilik data — "salinan data
 * saya" dan "hapus akun saya" — dan keduanya dibuka dari dashboard nasabah.
 *
 * Yang SENGAJA tidak ikut dalam salinan otomatis:
 *  - gambar tanda tangan (data URL) dan foto identitas: penanda ada/tidaknya
 *    tetap dilaporkan, sedangkan berkas aslinya lewat tautan berumur pendek;
 *  - catatan peninjauan internal (mis. catatan review admin): salinan ini tidak
 *    memuat penilaian internal; pemilik data bisa memintanya lewat kanal bantuan;
 *  - token perangkat dan kredensial sesi: itu rahasia akses, bukan data pribadi
 *    yang perlu disalin.
 *
 * Penghapusan mandiri dibatasi pada akun peminjam tanpa kewajiban berjalan.
 * Alasannya bukan teknis: catatan keuangan yang masih berjalan harus tetap punya
 * pemilik yang bisa dihubungi, dan akun tim serta akun penyedia dana memegang
 * posisi yang harus ditutup lewat tim PINDAI lebih dulu.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { tautanBerkas } from "./berkas";
import { hapusTurunanAkun, totalTurunanAkun } from "./hapusAkunTurunan";
import { ROLES } from "./schema";
import { audit } from "./system";
import {
  KONFIRMASI_HAPUS_AKUN,
  konfirmasiCocok,
  posisiTertutup,
  type JenisCatatan,
} from "../lib/hakData";

/** Baris maksimum per daftar dalam salinan — cukup untuk riwayat pribadi. */
const BATAS_SALINAN = 200;

/** Tautan berumur pendek untuk berkas milik pemohon; null bila belum bisa dibuat. */
async function tautanAman(
  id: Parameters<typeof tautanBerkas>[0],
): Promise<string | null> {
  try {
    return await tautanBerkas(id);
  } catch {
    // Rahasia penanda tangan belum diset di deployment ini: salinan tetap
    // diberikan tanpa tautan berkas, bukan gagal seluruhnya.
    return null;
  }
}

/**
 * Salinan data pribadi pemilik akun dalam bentuk JSON siap simpan.
 *
 * Hanya membaca baris MILIK pemanggil (indeks `by_user`), dan setiap daftar
 * dibatasi `BATAS_SALINAN` baris supaya satu permintaan tidak menembus batas
 * dokumen Convex saat akun sudah berumur panjang.
 */
export const salinanSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sesi tidak ditemukan. Masuk dulu untuk mengunduh salinan data.");
    }
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");

    const [profil, kyc, pinjaman, gadai, kredit, angsuran, consent, statusLokasi, perangkat, pengaduan, voucher] =
      await Promise.all([
        ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
        ctx.db.query("pawns").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
        ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
        ctx.db.query("angsuran").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
        ctx.db.query("trackingConsents").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("lokasiStatus").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
        ctx.db.query("perangkat").withIndex("by_user", (q) => q.eq("userId", userId)).take(20),
        ctx.db.query("pengaduanNasabah").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
        ctx.db.query("voucher").withIndex("by_pemilik", (q) => q.eq("pemilikId", userId)).take(BATAS_SALINAN),
      ]);

    return {
      dibuatPada: Date.now(),
      batas: BATAS_SALINAN,
      keterangan: [
        "Salinan ini dibuat aplikasi PINDAI untuk pemilik akun, bukan laporan resmi.",
        "Gambar tanda tangan dan foto identitas tidak disalin; penandanya tetap ada, dan berkas aslinya tersedia lewat tautan berumur pendek di bawah.",
        "Catatan peninjauan internal tidak ikut; mintakan lewat kanal bantuan bila diperlukan.",
        "Token perangkat dan kredensial sesi tidak pernah disalin.",
      ],
      akun: {
        nama: user.name ?? null,
        email: user.email ?? null,
        peran: user.role ?? "peminjam",
        kodePeminjam: user.kodePeminjam ?? null,
        nomorWhatsApp: user.nomorWhatsApp ?? null,
        emailTerverifikasi: user.emailVerificationTime !== undefined,
        preferensiNotifikasi: {
          whatsapp: user.notifWhatsapp ?? null,
          email: user.notifEmail ?? null,
          bahasaLaporan: user.bahasaLaporan ?? null,
        },
        dibuatPada: user._creationTime,
      },
      dataDiri:
        profil === null
          ? null
          : {
              namaLengkap: profil.namaLengkap,
              nik: profil.nik,
              nomorWhatsApp: profil.nomorWhatsApp,
              alamat: profil.alamat,
              pekerjaan: profil.pekerjaan,
              penghasilanBulanan: profil.penghasilanBulanan,
              namaBank: profil.namaBank,
              nomorRekening: profil.nomorRekening,
              sumber: profil.sumber,
              diperbaruiPada: profil.diperbaruiPada,
              adaFotoKtp: profil.fotoKtpId !== undefined,
              fotoKtpUrl: await tautanAman(profil.fotoKtpId),
            },
      kyc:
        kyc === null
          ? null
          : {
              sumberVerifikasi: kyc.sumberVerifikasi,
              namaLengkap: kyc.namaLengkap,
              nik: kyc.nik,
              nomorWhatsApp: kyc.nomorWhatsApp,
              nomorWhatsAppTerverifikasi: kyc.nomorWhatsAppTerverifikasi ?? null,
              alamat: kyc.alamat,
              pekerjaan: kyc.pekerjaan,
              penghasilanBulanan: kyc.penghasilanBulanan,
              sumberPenghasilan: kyc.sumberPenghasilan ?? null,
              namaBank: kyc.namaBank,
              nomorRekening: kyc.nomorRekening,
              namaKontakDarurat: kyc.namaKontakDarurat ?? null,
              nomorKontakDarurat: kyc.nomorKontakDarurat ?? null,
              hubunganKontakDarurat: kyc.hubunganKontakDarurat ?? null,
              statusTerverifikasi: kyc.stempelTerverifikasi ?? null,
              diputuskanPada: kyc.diputuskanPada ?? null,
              catatanKeputusan: kyc.keputusanCatatan ?? null,
              dibuatPada: kyc.dibuatPada,
              diperbaruiPada: kyc.diperbaruiPada ?? null,
              diajukanPada: kyc.diajukanPada ?? null,
              adaTandaTangan: kyc.tandaTangan !== undefined && kyc.tandaTangan !== "",
              adaOcrKtp: kyc.ocrKtp !== undefined,
              berkas: {
                ktpUrl: await tautanAman(kyc.ktpId),
                selfieUrl: await tautanAman(kyc.selfieKtpId),
                buktiPenghasilanUrl: await tautanAman(kyc.buktiPenghasilanId),
              },
            },
      pengajuan: {
        pinjaman: pinjaman.map((l) => ({
          nomorReferensi: l.nomorReferensi,
          status: l.status,
          pokokDiajukan: l.pokokDiajukan ?? l.pokokPinjaman,
          pokokDisetujui: l.pokokPinjaman,
          tenorHari: l.tenorHari,
          tenorBulan: l.tenorBulan ?? null,
          persenBunga: l.persenBunga ?? null,
          namaBank: l.namaBank,
          nomorRekening: l.nomorRekening,
          tujuan: l.tujuan,
          catatanPeminjam: l.catatanPeminjam ?? null,
          diajukanPada: l.diajukanPada,
          diputuskanPada: l.diputuskanPada ?? null,
          didanaiPada: l.didanaiPada ?? null,
          lunasPada: l.lunasPada ?? null,
          adaTandaTangan: l.tandaTanganPeminjam !== undefined && l.tandaTanganPeminjam !== "",
          persetujuanSyaratPada: l.persetujuanSyaratPada ?? null,
        })),
        gadai: gadai.map((p) => ({
          nomorReferensi: p.nomorReferensi,
          status: p.status,
          deskripsiBarang: p.deskripsiBarang,
          kategori: p.kategori,
          nilaiTaksiran: p.nilaiTaksiran,
          pokokGadai: p.pokokGadai,
          persenSewaModal: p.persenSewaModal,
          sisaPokok: p.sisaPokok,
          dicairkanPada: p.dicairkanPada ?? null,
          adaTandaTangan: p.tandaTanganPeminjam !== undefined && p.tandaTanganPeminjam !== "",
        })),
        kreditBarang: kredit.map((k) => ({
          nomorReferensi: k.nomorReferensi,
          status: k.status,
          namaBarang: k.namaBarang,
          merchant: k.merchant ?? null,
          hargaBarang: k.hargaBarang,
          dpPersen: k.dpPersen,
          tenorBulan: k.tenorBulan,
          marginPersenPerBulan: k.marginPersenPerBulan,
          didanaiPada: k.didanaiPada ?? null,
          lunasPada: k.lunasPada ?? null,
        })),
        angsuran: angsuran.map((a) => ({
          nomor: a.nomor,
          jatuhTempoPada: a.jatuhTempoPada,
          pokok: a.pokok,
          bunga: a.bunga,
          biayaAdmin: a.biayaAdmin,
          total: a.total,
          status: a.status,
          dibayarPada: a.dibayarPada ?? null,
          dendaDibayar: a.dendaDibayar ?? null,
        })),
        pengaduan: pengaduan.map((p) => ({
          nomorReferensi: p.nomorReferensi,
          kanal: p.kanal,
          kategori: p.kategori,
          isi: p.isi,
          status: p.status,
          dibuatPada: p._creationTime,
        })),
        voucher: voucher.map((vc) => ({
          kode: vc.kode,
          jenis: vc.jenis,
          judul: vc.judul,
          nilai: vc.nilai,
          terpakai: vc.terpakai ?? null,
          status: vc.status,
        })),
      },
      lokasi: {
        persetujuan:
          consent === null
            ? null
            : {
                aktif: consent.aktif,
                disetujuiPada: consent.disetujuiPada ?? null,
                dinonaktifkanPada: consent.dinonaktifkanPada ?? null,
              },
        titikTerakhir:
          statusLokasi === null
            ? null
            : {
                lat: statusLokasi.lat,
                lng: statusLokasi.lng,
                akurasi: statusLokasi.akurasi,
                waktu: statusLokasi.waktu,
                sumber: statusLokasi.sumber,
              },
        perangkat: perangkat.map((d) => ({
          platform: d.platform,
          versiApp: d.versiApp ?? null,
          terdaftarPada: d.terdaftarPada,
          terakhirDilihat: d.terakhirDilihat ?? null,
          // Token perangkat TIDAK disalin: itu rahasia akses, bukan data pribadi.
        })),
      },
    };
  },
});

/**
 * Hapus akun milik sendiri.
 *
 * Syarat yang diperiksa server, semuanya wajib:
 *  1. ada sesi (tidak menerima userId dari klien mana pun);
 *  2. bukan akun tim dan bukan akun penyedia dana;
 *  3. frasa konfirmasi diketik tepat;
 *  4. tidak ada pengajuan berjalan (pinjaman, gadai, kredit barang);
 *  5. tidak ada posisi dana yang belum selesai (setoran/penarikan/pendanaan).
 *
 * Yang dihapus: akun, kredensial & sesi auth, MFA, consent & status lokasi,
 * perangkat terdaftar, jejak lokasi, data diri, dan seluruh data KYC mandiri
 * beserta berkasnya (satu helper dengan jalur admin: `hapusTurunanAkun`).
 * Riwayat keuangan sengaja DIBIARKAN UTUH supaya catatan uang tidak hilang;
 * jejaknya tercatat di Audit Trail dengan nama pemilik akun saat itu.
 */
export const hapusAkunSendiri = mutation({
  args: {
    konfirmasi: v.string(),
    /** Alasan opsional — tidak menahan penghapusan, hanya memperjelas catatan. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sesi tidak ditemukan. Masuk dulu untuk menghapus akun.");
    }
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");
    if (user.role !== undefined && user.role !== ROLES.PEMINJAM) {
      throw new Error(
        "Akun tim dan akun penyedia dana tidak bisa dihapus sendiri. Hubungi tim PINDAI agar posisinya ditutup lebih dulu.",
      );
    }
    if (!konfirmasiCocok(args.konfirmasi)) {
      throw new Error(`Tulis "${KONFIRMASI_HAPUS_AKUN}" untuk mengonfirmasi penghapusan.`);
    }

    const [pinjaman, gadai, kredit, setoran, penarikan, pendanaan, siklus] = await Promise.all([
      ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
      ctx.db.query("pawns").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
      ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", userId)).take(BATAS_SALINAN),
      ctx.db.query("deposits").withIndex("by_dana", (q) => q.eq("danaId", userId)).take(1),
      ctx.db.query("withdrawals").withIndex("by_dana", (q) => q.eq("danaId", userId)).take(1),
      ctx.db.query("fundings").withIndex("by_dana", (q) => q.eq("danaId", userId)).take(1),
      ctx.db.query("siklusPendana").withIndex("by_pendana", (q) => q.eq("pendanaId", userId)).take(1),
    ]);

    const menahan: JenisCatatan[] = [];
    if (pinjaman.some((l) => !posisiTertutup("pinjaman", l.status))) menahan.push("pinjaman");
    if (gadai.some((p) => !posisiTertutup("gadai", p.status))) menahan.push("gadai");
    if (kredit.some((k) => !posisiTertutup("kredit barang", k.status))) menahan.push("kredit barang");
    const adaPosisiDana =
      setoran.length > 0 || penarikan.length > 0 || pendanaan.length > 0 || siklus.length > 0;
    if (menahan.length > 0 || adaPosisiDana) {
      const sebab = menahan.map((j) => `${j} yang masih berjalan`).join(", ");
      throw new Error(
        adaPosisiDana
          ? "Akun belum bisa dihapus: masih ada catatan dana/pendanaan atas nama Anda. Hubungi tim PINDAI setelah posisinya selesai."
          : `Akun belum bisa dihapus: masih ada ${sebab}. Selesaikan atau batalkan dulu, lalu coba lagi.`,
      );
    }

    const nama = user.name ?? user.email ?? userId;
    const alasan = (args.alasan ?? "").trim().slice(0, 500);
    const turunan = await hapusTurunanAkun(ctx, userId);

    await audit(
      ctx,
      userId,
      user.email ?? nama,
      "akun_hapus_mandiri",
      nama,
      `Nasabah menghapus akunnya sendiri; ${turunan.akunAuth} akun auth, ${turunan.sesiAuth} sesi auth, ` +
        `${totalTurunanAkun(turunan)} baris turunan dibersihkan, ${turunan.berkasKycStorage} berkas identitas dihapus` +
        (alasan === "" ? "" : `; alasan: ${alasan}`),
    );

    await ctx.db.delete(userId);
    return { ok: true as const, nama, turunan };
  },
});
