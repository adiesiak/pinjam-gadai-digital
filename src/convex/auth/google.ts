/**
 * Pintu masuk "Masuk dengan Google" (OpenID Connect).
 *
 * Aturan yang dipegang di sini:
 *  1. Hanya identitas dengan email TERVERIFIKASI Google yang diterima
 *     (`lib/akunGoogle.ts`). Tanpa itu, fitur ini tidak punya bukti siapa pun.
 *  2. Penautan ke akun yang sudah ada adalah aturan bawaan Convex Auth untuk
 *     penyedia OIDC: email terverifikasi dicocokkan dengan TEPAT SATU akun
 *     ber-email terverifikasi. Cocok → sesi akun itu yang dipakai, bukan akun
 *     baru yang kosong; tidak cocok/banyak → akun baru dibuat. Karena itu
 *     pengguna lama (peminjam maupun penyedia dana) cukup menekan tombolnya.
 *  3. Akun Super Admin DITOLAK lewat pintu ini. Admin masuk dengan kata sandi +
 *     TOTP; sama seperti OTP email, Google tidak boleh jadi jalan pintas ke
 *     panel admin — walau yang memegang akun Google itu memang pemilik
 *     alamatnya.
 *
 * `name` Google sengaja TIDAK dipetakan ke `users.name`: nama akun dipakai
 * sebagai kunci warisan kepemilikan pinjaman penyedia dana
 * (`convex/pendanaKepemilikan.ts`, pencocokan persis `pendanaNama`), sehingga
 * menimpanya dari profil luar bisa memindahkan pinjaman lama ke orang lain —
 * mis. akun Google yang nama tampilannya kebetulan sama dengan nama pendana
 * lain. Nama akun tetap diisi sendiri oleh pemiliknya di aplikasi.
 */
import Google from "@auth/core/providers/google";

import { identitasGoogle } from "../../lib/akunGoogle";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ROLES } from "../schema";
import { audit } from "../system";

export const google = Google({
  id: "google",
  profile(profil) {
    const identitas = identitasGoogle(profil as Record<string, unknown>);
    if (identitas === null) {
      throw new Error(
        "Profil Google tidak memuat email terverifikasi, jadi tidak ada identitas yang bisa dipakai masuk.",
      );
    }
    return {
      // `id` wajib: Convex Auth memakainya sebagai `providerAccountId` akun.
      id: identitas.sub,
      email: identitas.email,
      emailVerified: true,
    };
  },
});

/**
 * Penjaga setelah akun Google selesai ditautkan/dibuat, dipanggil dari
 * `callbacks.afterUserCreatedOrUpdated` (`convex/auth.ts`).
 *
 * Dilempar di dalam transaksi masuk yang sama, sehingga penolakan admin
 * membatalkan SELURUH proses: tidak ada baris akun Google, tidak ada perubahan
 * pada dokumen pengguna, dan tidak ada sesi yang diberikan.
 *
 * Riwayat audit hanya ditulis saat akun Google ini dipakai PERTAMA kali
 * (`existingUserId === null`), bukan setiap kali masuk — jejak masuk harian
 * sudah dicatat `security.recordLogin` dari halaman masuk.
 */
export async function jagaMasukGoogle(
  ctx: MutationCtx,
  arg: { userId: Id<"users">; existingUserId: Id<"users"> | null },
): Promise<void> {
  const pengguna = await ctx.db.get(arg.userId);

  if (pengguna !== null && pengguna.role === ROLES.ADMIN) {
    throw new Error(
      "Akun Super Admin tidak masuk lewat Google; pakai kata sandi dan TOTP.",
    );
  }

  if (arg.existingUserId !== null) return;

  await audit(
    ctx,
    arg.userId,
    pengguna?.email ?? pengguna?.name ?? "akun google",
    "masuk_google",
    pengguna?.email,
    "Akun Google dipakai pertama kali; hanya penautan akun, peran dan nama pengguna tidak diubah.",
  );
}
