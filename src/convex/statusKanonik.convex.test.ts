/**
 * Tes EMPAT status pinjaman di sisi server (convex-test + vitest).
 *
 * Keluhan pemilik produk: status pinjaman seharusnya empat — Ditinjau,
 * Disalurkan, Ditolak, Lunas — bukan enam. Yang dijaga berkas ini:
 *
 *  - `loans.ubahStatusPinjaman` hanya menerima empat status kanonik; ejaan
 *    tahap lama yang sudah digabung (`disetujui`) DITOLAK validator, sehingga
 *    pilihan lama tidak bisa kembali lewat API walau UI-nya lupa;
 *  - "ditinjau" dipetakan ke ejaan tersimpannya (`sedang_direview`) — tidak ada
 *    migrasi basis data yang dibutuhkan agar baris lama tetap sah;
 *  - berpindah ke "Disalurkan" (`didanai`) ikut mengisi tanggal acuan
 *    `didanaiPada`, supaya jatuh tempo tidak pernah kosong walau admin memakai
 *    pemilih status, bukan tombol "Tandai dana tersalurkan";
 *  - pinjaman yang sudah lunas tetap terkunci.
 *
 * Menjalankan: bunx vitest run src/convex/statusKanonik.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

async function buatPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  status: "diajukan" | "sedang_direview" | "disetujui" | "didanai" | "lunas",
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      pokokDiajukan: 1_000_000,
      tujuan: "modal_usaha",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status,
      nomorReferensi: `PGD-STATUS-${status}`,
      tenorHari: 30,
    }),
  );
}

describe("empat status pinjaman di server", () => {
  it("memindahkan status lewat empat pilihan kanonik, termasuk tanggal acuan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    // Baris lama: masih memakai ejaan sub-tahap `disetujui`.
    const loanId = await buatPinjaman(t, peminjamId, "disetujui");

    // 1. Ditinjau — ejaan kanonik dipetakan ke `sedang_direview` yang tersimpan.
    await admin.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "ditinjau",
      reason: "menunggu kelengkapan berkas",
    });
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe(
      "sedang_direview",
    );

    // 2. Disalurkan — status kanonik `didanai` sekaligus mengisi tanggal acuan.
    await admin.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "didanai",
      reason: "dana ditandai tersalurkan",
    });
    const disalurkan = await t.run((ctx) => ctx.db.get(loanId));
    expect(disalurkan?.status).toBe("didanai");
    expect(typeof disalurkan?.didanaiPada).toBe("number");
    const tanggalAcuan = disalurkan?.didanaiPada;

    // Kembali ke tinjauan lalu ditandai tersalurkan lagi: tanggal acuan yang
    // sudah tercatat tidak boleh digeser oleh koreksi.
    await admin.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "ditinjau",
      reason: "menunggu konfirmasi pencairan",
    });
    await admin.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "didanai",
      reason: "pencairan dikonfirmasi",
    });
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.didanaiPada).toBe(
      tanggalAcuan,
    );

    // 3. Lunas.
    await admin.mutation(api.loans.ubahStatusPinjaman, {
      loanId,
      status: "lunas",
      reason: "kewajiban dibayar penuh",
    });
    const lunas = await t.run((ctx) => ctx.db.get(loanId));
    expect(lunas?.status).toBe("lunas");
    expect(lunas?.didanaiPada).toBe(tanggalAcuan);

    // 4. Posisi yang sudah ditutup tetap terkunci.
    await expect(
      admin.mutation(api.loans.ubahStatusPinjaman, {
        loanId,
        status: "ditolak",
        reason: "koreksi posisi lunas",
      }),
    ).rejects.toThrow(/lunas/i);

    // 5. Status yang sama persis ditolak — tidak ada pesan WhatsApp palsu.
    const samaId = await buatPinjaman(t, peminjamId, "didanai");
    await expect(
      admin.mutation(api.loans.ubahStatusPinjaman, {
        loanId: samaId,
        status: "didanai",
        reason: "ulangi tanpa perubahan",
      }),
    ).rejects.toThrow(/sudah berstatus/i);
  });

  it("mencatat perubahan status tanpa catatan: jejak tetap ada, pesan WhatsApp tidak kosong", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-tanpa-catatan@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani-tanpa-catatan@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, peminjamId, "sedang_direview");

    // Kebijakan pemilik produk: admin tidak wajib mengisi alasan perubahan
    // status. Dialog mengirim argumen `reason` kosong ("") atau tidak sama sekali.
    await expect(
      admin.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "didanai" }),
    ).resolves.toMatchObject({ ok: true });
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe("didanai");

    // Jejak audit tetap ditulis dan menandai bahwa catatannya kosong — bukan
    // entri audit kosong tanpa penjelasan.
    const audit = await t.run(async (ctx) => {
      const rows = await ctx.db.query("auditLog").collect();
      return rows.filter((r) => r.aksi === "loan_didanai").slice(-1)[0] ?? null;
    });
    expect(audit?.target).toBe("PGD-STATUS-sedang_direview");
    expect(audit?.detail).toContain("tanpa catatan");
    expect(audit?.aktorLabel).toBe("admin-tanpa-catatan@pindai.test");

    // Pesan kabar ke peminjam tidak boleh menyisakan kalimat kosong
    // ("Catatan dari tim: .") saat admin tidak mengisi catatan.
    const pratinjau = await admin.query(api.whatsapp.previewStatusPinjaman, {
      loanId,
      alasan: "",
    });
    expect(pratinjau?.isi).toContain("Catatan dari tim: —");
    expect(pratinjau?.isi).not.toContain("Catatan dari tim: .");
    expect(pratinjau?.isi).not.toContain("{alasan}");

    // Dengan catatan, teksnya tetap terkirim apa adanya.
    const denganCatatan = await admin.query(api.whatsapp.previewStatusPinjaman, {
      loanId,
      alasan: "dana ditandai tersalurkan",
    });
    expect(denganCatatan?.isi).toContain("dana ditandai tersalurkan");
  });

  it("ejaan tahap lama yang sudah digabung ditolak validator", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, peminjamId, "sedang_direview");

    // Ketiga ejaan lama bukan lagi pilihan yang sah — "Ditinjau" menggantikannya.
    for (const lama of ["diajukan", "sedang_direview", "disetujui"]) {
      await expect(
        admin.mutation(api.loans.ubahStatusPinjaman, {
          loanId,
          status: lama as never,
          reason: "coba tahap lama",
        }),
      ).rejects.toThrow();
    }
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe(
      "sedang_direview",
    );

    // Empat ejaan kanonik diterima (ditolak di sini sekadar contoh perpindahan).
    await expect(
      admin.mutation(api.loans.ubahStatusPinjaman, {
        loanId,
        status: "ditolak",
        reason: "penghasilan belum memadai",
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});
