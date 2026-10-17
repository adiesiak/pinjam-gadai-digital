// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

import { adminPasswordOtp } from "./auth/adminPasswordOtp";
import {
  alurKataSandiDikenal,
  alurPermintaanToken,
  alurVerifikasiKode,
  pesanBlokirOtpAdmin,
  pesanKodeSalah,
  pesanSandiNonAdmin,
} from "./auth/enumerasi";
import { emailOtp } from "./auth/emailOtp";
import { google, jagaMasukGoogle } from "./auth/google";
import { alamatKembaliGoogle, ORIGIN_APLIKASI_BAWAAN, originAplikasi } from "../lib/akunGoogle";
import { pratinjauAdmin } from "./auth/pratinjau";
import { whatsappOtp } from "./auth/whatsappOtp";
import { internal } from "./_generated/api";
import { ROLES } from "./schema";

const passwordProvider = Password({
  verify: adminPasswordOtp,
  reset: adminPasswordOtp,
  profile: (params) => {
    const email = params.email;
    if (typeof email !== "string" || email.length === 0) {
      throw new Error("Email admin wajib diisi.");
    }
    return { email };
  },
});

// Password provider authorization runs in an action; preflight the verified
// admin identity before sign-in, account activation, or password reset starts.
const adminPassword: typeof passwordProvider = {
  ...passwordProvider,
  authorize: async (params, ctx) => {
    const email = params.email;
    if (typeof email !== "string" || email.length === 0) {
      throw new Error("Email admin wajib diisi.");
    }
    // `flow` menentukan apakah ini masuk, aktivasi, atau reset kata sandi.
    const flow = typeof params.flow === "string" ? params.flow : "signIn";
    const status = await ctx.runQuery(internal.users.statusAkunKataSandi, {
      email,
    });

    // Batas percobaan ditegakkan di server, sebelum kata sandi diverifikasi,
    // dan berlaku untuk SEMUA alamat — kalau hanya alamat admin yang dibatasi,
    // balasan "terlalu banyak percobaan" itu sendiri sudah mengonfirmasi
    // alamat mana yang Super Admin. Hanya flow masuk yang dibatasi di sini:
    // itulah permukaan brute force-nya, sedangkan aktivasi/reset punya batas
    // sendiri (permintaan token) tepat di bawah.
    if (flow === "signIn") {
      const batas = await ctx.runMutation(
        internal.security.catatPercobaanKataSandiAdmin,
        { email, admin: status.admin },
      );
      if (batas.blocked) {
        // Pemulihan: Super Admin yang memegang kode TOTP tidak perlu menunggu
        // 15 menit. Kata sandi tetap diverifikasi setelahnya, jadi ini hanya
        // membuka hitungan percobaan — bukan jalan masuk tanpa kata sandi.
        const kodeTotp =
          typeof params.kodeTotp === "string" ? params.kodeTotp : "";
        const pulih =
          status.admin &&
          kodeTotp !== "" &&
          (
            await ctx.runMutation(
              internal.security.bukaBatasKataSandiDenganTotp,
              { email, kode: kodeTotp },
            )
          ).ok;
        if (!pulih) {
          throw new Error(
            `Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.max(
              1,
              Math.ceil(batas.sisaDetik / 60),
            )} menit, atau isi kode TOTP aplikasi autentikator untuk masuk sekarang.`,
          );
        }
      }
    }

    // Permintaan token aktivasi/reset mengirim email ke alamat yang diminta.
    // Tanpa batas, kotak masuk admin bisa dibanjiri token oleh penyerang.
    // Batas ini berlaku untuk SEMUA alamat supaya balasan "terlalu banyak
    // permintaan" tidak menandai alamat admin, dan ditegakkan SEBELUM provider
    // membuat kode baru — permintaan di atas batas karena itu juga tidak
    // menghapus token yang sudah terkirim sebelumnya.
    if (alurPermintaanToken(flow)) {
      const token = await ctx.runMutation(
        internal.security.catatPermintaanTokenAdmin,
        { email, admin: status.admin },
      );
      if (token.blocked) {
        throw new Error(
          `Terlalu banyak permintaan token. Coba lagi dalam ${Math.max(
            1,
            Math.ceil(token.sisaDetik / 60),
          )} menit.`,
        );
      }
    }

    // Verifikasi kode token butuh akun kata sandi; tanpa itu Convex Auth
    // melempar TypeError mentah yang justru membedakan alamat admin dari
    // alamat biasa yang sudah dibalas dengan pesan kode salah.
    if (!status.punyaKataSandi && alurVerifikasiKode(flow)) {
      throw new Error(pesanKodeSalah(flow));
    }

    // Flow yang tidak dikenal Convex Auth (mis. "activate") dijawab seperti
    // permintaan token biasa: kalau diteruskan, hanya alamat admin yang
    // mendapat error "Missing `flow` param" — itu pun membedakan admin.
    if (!alurKataSandiDikenal(flow)) return null;

    // Alamat non-admin: balasannya disamakan persis dengan balasan Convex Auth
    // untuk alamat yang tidak punya akun kata sandi, supaya keberadaan email
    // Super Admin tidak bisa dikonfirmasi dari beda pesan error. Permintaan
    // token (aktivasi/reset) dilanjutkan tanpa mengirim email apa pun sehingga
    // bentuk responsnya sama dengan permintaan token milik admin.
    if (!status.admin) {
      const pesan = pesanSandiNonAdmin(flow);
      if (pesan !== null) throw new Error(pesan);
      return null;
    }

    // Aktivasi untuk akun kata sandi yang sudah ada dijawab sama seperti
    // permintaan token biasa: kalau dibiarkan, Convex Auth melempar
    // "Account ... already exists" dan itu hanya terjadi pada alamat yang
    // memang punya kata sandi — yaitu alamat admin.
    if (flow === "signUp" && status.punyaKataSandi) return null;
    if (flow === "reset" && !status.punyaKataSandi) return null;

    // `flow` yang sudah dinormalisasi selalu dikirim ulang: nilai non-string
    // juga membuat Convex Auth melempar "Missing `flow` param" yang hanya
    // dialami alamat admin.
    return passwordProvider.authorize({ ...params, flow }, ctx);
  },
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // `whatsappOtp` = pintu masuk PEMINJAM LAMA dari web lama: pembuktian nomor
  // lewat OTP WhatsApp, lalu sesi diberikan untuk akun pemilik data impor itu
  // sendiri (bukan akun baru yang kosong). Verifikasi kode + penautannya hidup
  // di `convex/klaimPeminjam.ts`, bukan di provider ini.
  //
  // `pratinjauAdmin` = pintu masuk PRATINJAU SUPER ADMIN: tiket sekali pakai
  // dari `convex/pratinjau.ts` (hanya terbit setelah admin lolos TOTP) ditukar
  // menjadi sesi NYATA akun pendana/peminjam, sehingga admin dapat melihat apa
  // yang akun itu lihat. Tanpa tiket yang sah, provider ini tidak melayani
  // siapa pun — tidak ada kata sandi atau OTP yang bisa ditebak di sini.
  // `google` = pintu masuk GOOGLE (OIDC) untuk peminjam maupun penyedia dana:
  // google membuktikan email terverifikasi, dan Convex Auth menautkannya ke
  // akun ber-email terverifikasi yang sama sehingga pengguna lama tidak
  // mendapat akun kosong. Akun Super Admin ditolak di `jagaMasukGoogle`.
  providers: [
    emailOtp,
    adminPassword,
    whatsappOtp,
    pratinjauAdmin,
    google,
    Anonymous,
  ],
  callbacks: {
    /**
     * Alamat kembali setelah OAuth Google.
     *
     * `SITE_URL` di deployment ini diisi platform dengan domain BACKEND Convex
     * (`…convex.site`), padahal Convex Auth menyelesaikan alamat relatif
     * terhadap nilai itu — akibatnya pengguna mendarat di backend dan melihat
     * "No matching routes found". Di sini relatif selalu ditempel ke origin
     * APLIKASI (`SITE_URL` bila sudah benar, lalu `APP_ORIGIN`, lalu cadangan),
     * dan alamat absolut asing ditolak supaya `code` sekali pakai tidak bisa
     * dibawa ke situs lain.
     */
    async redirect({ redirectTo }) {
      const origin = originAplikasi(
        process.env.SITE_URL,
        process.env.APP_ORIGIN ?? ORIGIN_APLIKASI_BAWAAN,
      );
      return alamatKembaliGoogle(redirectTo, origin);
    },
    async afterUserCreatedOrUpdated(
      ctx,
      { userId, existingUserId, provider, type },
    ) {
      const user = await ctx.db.get(userId);

      // Google: akun sudah ditautkan/dibuat oleh Convex Auth sebelum baris ini,
      // jadi yang tersisa adalah aturan peran (Super Admin tidak lewat sini)
      // dan satu baris audit saat akun Google itu pertama dipakai.
      if (provider.id === google.id) {
        await jagaMasukGoogle(ctx, { userId, existingUserId });
        return;
      }

      // Provider WhatsApp OTP hanya cocok untuk akun PEMINJAM: `authorize`-nya
      // menolak nomor tanpa data lama, dan akun yang dibuatnya adalah akun
      // hasil impor/klaim (tidak pernah akun admin tanpa peran). Sesi yang
      // diberikan tetap sesi biasa — pembatas peran setelahnya berlaku sama.
      //
      // Email OTP publik tetap tersedia untuk peminjam/penyedia dana, tetapi tidak
      // untuk admin. Permintaan kode tidak boleh membocorkan status admin,
      // jadi tahap pertama dibalas seperti email biasa (email kodenya sendiri
      // tidak dikirim — lihat emailOtp.sendVerificationRequest) dan tahap
      // verifikasi memakai pesan kode salah yang sama dengan kode salah biasa.
      if (provider.id === emailOtp.id) {
        const pesanBlokir = pesanBlokirOtpAdmin(
          type,
          user?.role === ROLES.ADMIN,
        );
        if (pesanBlokir !== null) throw new Error(pesanBlokir);
        return;
      }

      // A concurrent role change cannot make a password activation/create
      // account commit for a non-admin. Normal password sign-ins do not upsert
      // users and therefore don't invoke this callback.
      if (
        provider.id !== "password" ||
        (type !== "credentials" && type !== "verification")
      ) {
        return;
      }
      if (!user?.email || user.role !== ROLES.ADMIN || user.emailVerificationTime === undefined || user.isAnonymous === true) {
        throw new Error("Password hanya tersedia untuk akun Super Admin terverifikasi.");
      }
    },
  },
});