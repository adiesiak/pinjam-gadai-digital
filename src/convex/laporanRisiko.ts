import { query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { userIdAkunUji } from "./akunUjiInternal";
import { hitungAging, konsentrasiProduk, type BarisProduk } from "../lib/aging";

/**
 * Laporan risiko portofolio untuk admin.
 *
 * Angka dihitung dari baris yang masih berjalan saja:
 *  - pinjaman tunai `didanai` → aging DPD + konsentrasi harian/bulanan;
 *  - gadai `aktif` → konsentrasi pokok gadai;
 *  - kredit barang `didanai` → konsentrasi pokok yang dibiayai
 *    (harga barang dikurangi uang muka).
 *
 * "Pokok tercatat" adalah pokok pada baris, bukan saldo outstanding yang
 * dihitung ulang — lihat catatan di `lib/aging.ts`. Satu angka yang jujur lebih
 * berguna daripada presisi yang tidak disimpan sistem.
 */
export const ringkasanRisiko = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();

    // Portofolio risiko hanya berisi pinjaman sungguhan; percobaan akun uji
    // tidak boleh menaikkan DPD, konsentrasi produk, atau jumlah baris.
    const idUji = await userIdAkunUji(ctx);
    const [semuaPinjaman, semuaGadai, semuaKredit] = await Promise.all([
      ctx.db
        .query("loans")
        .withIndex("by_status", (q) => q.eq("status", "didanai"))
        .collect(),
      ctx.db
        .query("pawns")
        .withIndex("by_status", (q) => q.eq("status", "aktif"))
        .collect(),
      ctx.db
        .query("kreditBarang")
        .withIndex("by_status", (q) => q.eq("status", "didanai"))
        .collect(),
    ]);
    const pinjaman = semuaPinjaman.filter(
      (baris) => idUji === null || baris.userId !== idUji,
    );
    const gadai = semuaGadai.filter(
      (baris) => idUji === null || baris.userId !== idUji,
    );
    const kredit = semuaKredit.filter(
      (baris) => idUji === null || baris.userId !== idUji,
    );


    const aging = hitungAging(pinjaman, sekarang);

    const barisProduk: BarisProduk[] = [];
    for (const l of pinjaman) {
      barisProduk.push({
        produk: l.tenorBulan === undefined ? "Pinjaman harian" : "Pinjaman bulanan",
        pokok: l.pokokPinjaman,
      });
    }
    for (const p of gadai) {
      const pokok = p.sisaPokok ?? p.pokokGadai ?? 0;
      if (pokok > 0) barisProduk.push({ produk: "Gadai", pokok });
    }
    for (const k of kredit) {
      const dibiayai = Math.round(k.hargaBarang * (1 - k.dpPersen / 100));
      if (dibiayai > 0) barisProduk.push({ produk: "Kredit barang", pokok: dibiayai });
    }

    return {
      dihitungPada: sekarang,
      aging,
      konsentrasi: konsentrasiProduk(barisProduk),
      jumlahBaris: {
        pinjaman: pinjaman.length,
        gadai: gadai.length,
        kredit: kredit.length,
      },
    };
  },
});
