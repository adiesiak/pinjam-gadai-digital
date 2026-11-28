/**
 * Endpoint bot: pencatatan pembayaran pinjaman.
 *
 * MASALAH YANG DISELESAIKAN: setelah `/bot/pencairan` ada, nasabah menerima
 * uang tetapi tidak punya cara melunasi lewat WhatsApp. Tanpa endpoint ini,
 * pinjaman yang dicairkan lewat bot akan menunggak selamanya di situs.
 *
 * DUA JALUR, SATU PINTU:
 * PINDAI punya dua skema pinjaman yang pembayarannya berbeda secara mendasar.
 *  - Harian (`tenorHari`): pelunasan menutup pinjaman sekaligus.
 *  - Bulanan (`tenorBulan`): setiap cicilan punya baris `angsuran` sendiri.
 *
 * Modul ini memilih jalur yang benar berdasarkan data pinjaman, lalu memanggil
 * fungsi inti yang SAMA dengan panel admin (`catatPelunasanHarianInti`,
 * `catatPelunasanBulananInti`). Menyalin logika penjurnalan ke jalur bot akan
 * membuat saldo pendana berbeda antara dua kanal - kesalahan yang paling mahal.
 *
 * IDEMPOTENSI: kunci dari bot (`referensi`) disimpan lewat `idempotencyKeys`.
 * Kiriman ulang karena jaringan putus mengembalikan hasil yang SAMA, bukan
 * mencatat pembayaran kedua.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { ambilHasilIdempoten, simpanHasilIdempoten } from "./idempotensi";
import { catatPelunasanHarianInti } from "./perpanjanganPinjaman";
import { catatPelunasanBulananInti } from "./angsuran";

/** Hasil yang disimpan untuk idempotensi. */
type HasilBayar = {
  ok: true;
  nomorReferensi: string;
  jalur: "harian" | "bulanan";
};

/**
 * Pisahkan pesan "nominal tidak cocok" dari galat lain, supaya bot bisa
 * menampilkan kekurangan/kelebihan kepada nasabah - bukan sekadar "gagal".
 *
 * Server menulis pesannya sebagai:
 *   "Nominal mutasi Rp X tidak sama dengan total pelunasan Rp Y (pokok ..., bunga ..., denda ...)."
 */
function bacaKetidakcocokan(pesan: string): {
  totalDue: number;
  dibayar: number;
} | null {
  const pola =
    /Nominal mutasi Rp\s*([\d.]+)\s*tidak sama dengan total pelunasan Rp\s*([\d.]+)/i;
  const m = pola.exec(pesan);
  if (m === null) return null;
  const angka = (s: string) => Number(s.replace(/\./g, ""));
  return { dibayar: angka(m[1]!), totalDue: angka(m[2]!) };
}

export const _catatPembayaranDariBot = internalMutation({
  args: {
    nomorReferensi: v.string(),
    /** Kunci idempotensi dari bot; satu kunci = satu pembayaran. */
    referensi: v.string(),
    jumlahMutasi: v.number(),
    tanggal: v.optional(v.number()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nomorReferensi = args.nomorReferensi.trim();
    if (nomorReferensi === "") throw new Error("Nomor referensi wajib diisi.");

    const referensi = args.referensi.trim();
    if (referensi.length < 4 || referensi.length > 128) {
      throw new Error("Kunci idempotensi wajib 4-128 karakter.");
    }

    const loan = await ctx.db
      .query("loans")
      .filter((q) => q.eq(q.field("nomorReferensi"), nomorReferensi))
      .first();
    if (loan === null) {
      throw new Error(`Pinjaman ${nomorReferensi} tidak ditemukan.`);
    }

    // Idempotensi per (peminjam, kunci). Kunci yang sama mengembalikan hasil
    // yang sama tanpa mencatat pembayaran kedua.
    const hasilLama = await ambilHasilIdempoten<HasilBayar>(
      ctx,
      loan.userId,
      referensi,
      "bot.pembayaran",
    );
    if (hasilLama !== null) {
      return { ...hasilLama, ulangan: true as const };
    }

    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    if (admin === null) {
      throw new Error("Tidak ada akun admin untuk mencatat pembayaran ini.");
    }
    const adminLabel = admin.email ?? admin.name ?? "admin";
    const tanggal = args.tanggal ?? Date.now();

    const bul = loan.tenorBulan !== undefined;
    const jalur: "harian" | "bulanan" = bul ? "bulanan" : "harian";

    const argsDasar = {
      loanId: loan._id as Id<"loans">,
      referensiMutasi: referensi,
      jumlahMutasi: args.jumlahMutasi,
      tanggal,
      ...(args.catatan !== undefined ? { catatan: args.catatan } : {}),
    };

    try {
      if (bul) {
        await catatPelunasanBulananInti(ctx, argsDasar, admin._id, adminLabel);
      } else {
        await catatPelunasanHarianInti(ctx, argsDasar, admin._id, adminLabel);
      }
    } catch (err) {
      const pesan = err instanceof Error ? err.message : String(err);
      const beda = bacaKetidakcocokan(pesan);
      if (beda !== null) {
        // 409 "sebagian": nominal tidak sama persis. Bot perlu memberi tahu
        // nasabah berapa yang benar-benar harus dibayar, bukan hanya "gagal".
        return {
          ok: false as const,
          alasan: "sebagian" as const,
          jalur,
          totalDue: beda.totalDue,
          dibayar: beda.dibayar,
          kurang: Math.max(0, beda.totalDue - beda.dibayar),
          lebih: Math.max(0, beda.dibayar - beda.totalDue),
          pesan,
        };
      }
      throw err;
    }

    const hasil: HasilBayar = { ok: true, nomorReferensi, jalur };
    await simpanHasilIdempoten(
      ctx,
      loan.userId,
      referensi,
      "bot.pembayaran",
      hasil,
    );
    return { ...hasil, ulangan: false as const };
  },
});
