/**
 * PROVIDER PRATINJAU SUPER ADMIN — "masuk sebagai" akun pendana/peminjam.
 *
 * Bedanya dengan pintu masuk biasa: tidak ada kata sandi, kode OTP, atau nomor
 * yang diverifikasi di sini. Yang membuktikan hak adalah TIKET sekali pakai
 * yang hanya bisa diterbitkan `pratinjau.mintaTiket` setelah pemanggilnya lolos
 * `requireAdminSession` (peran admin + TOTP terverifikasi). Provider ini hanya
 * menukar tiket itu menjadi sesi NYATA akun target, sehingga aplikasi berjalan
 * sebagai akun tersebut — bukan sebagai tampilan tiruan.
 *
 * Dua lapis yang dijaga server, bukan klien:
 *  1. Tiket berumur pendek (5 menit) dan sekali pakai (`_pakaiTiket`).
 *  2. Akun target divalidasi ulang saat penukaran (ada, bukan admin, bukan tamu).
 *
 * Awal dan akhir pratinjau tercatat di Audit Trail dengan nama admin sebagai
 * aktornya (lihat `convex/pratinjau.ts`).
 */
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { AuthProviderConfig } from "@convex-dev/auth/server";

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

/** Ambil nilai string dari kredensial (nilai bisa berupa angka/boolean/undefined). */
function teks(nilai: unknown): string {
  return typeof nilai === "string" ? nilai : "";
}

/**
 * Tipe ditulis EKSPLISIT dengan alasan yang sama seperti `auth/whatsappOtp.ts`:
 * provider ini memakai `internal` (berkas api hasil generate), sedangkan
 * `auth.ts` mengimpor provider ini — tanpa anotasi, lingkaran itu membuat
 * seluruh tipe fungsi Convex di proyek ini jatuh menjadi `any`.
 */
export const pratinjauAdmin: AuthProviderConfig = ConvexCredentials({
  id: "pratinjau-admin",
  authorize: async (credentials, ctx: ActionCtx) => {
    const tiketId = teks(credentials.tiketId).trim();
    if (tiketId === "") {
      throw new Error("Tiket pratinjau tidak dikirim. Mulai lagi dari panel admin.");
    }

    const hasil = await ctx.runMutation(internal.pratinjau._pakaiTiket, {
      tiketId: tiketId as Id<"pratinjauSesi">,
    });

    // `sessionId` sengaja diserahkan dari server, bukan dibiarkan Convex Auth
    // membuat sesi baru: jalur `signIn` bawaan akan MENGHAPUS sesi yang sedang
    // dipakai pemanggil — yaitu sesi admin — sehingga admin harus masuk ulang
    // dengan kata sandi + TOTP setelah pratinjau. Sesi itu juga sudah dibatasi
    // umurnya sama dengan batas pratinjau.
    return { userId: hasil.userId, sessionId: hasil.sessionId };
  },
});
