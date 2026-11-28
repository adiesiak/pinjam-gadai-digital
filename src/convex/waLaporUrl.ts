/**
 * Pelaporan URL gateway WhatsApp oleh gateway itu sendiri.
 *
 * MASALAH YANG DISELESAIKAN: `cloudflared tunnel --url` (quick tunnel) membuat
 * nama acak sekali pakai. Setiap kali dijalankan ulang, URL berubah dan
 * `waSettings.apiUrl` di PINDAI menunjuk alamat mati - OTP WhatsApp berhenti
 * terkirim tanpa ada yang menyadarinya. Sebelum ini, satu-satunya jalan adalah
 * admin membuka panel dan menempelkan URL baru secara manual.
 *
 * Dengan mutation ini, gateway melaporkan URL publiknya sendiri setiap kali
 * tersambung, sehingga PINDAI selalu menunjuk alamat yang benar meski quick
 * tunnel restart.
 *
 * KENAPA INI AMAN MESKI TANPA SESI ADMIN:
 * Endpoint ini bisa mengubah tujuan pengiriman OTP. Kalau disalahgunakan,
 * penyerang dapat mengarahkan OTP ke servernya sendiri - itu pencurian akun.
 * Karena itu tiga lapis penjagaan:
 *
 *  1. TOKEN. Wajib sama dengan token gateway (`WHATSAPP_API_KEY`) yang sudah
 *     dipakai PINDAI untuk mengirim. Tidak ada rahasia baru yang perlu dikelola.
 *     Dibandingkan dengan waktu konstan supaya tidak bisa ditebak lewat timing.
 *  2. HOST TERBATAS. Hanya URL https yang host-nya berakhiran
 *     `.trycloudflare.com`, atau domain yang memang dipakai sekarang, atau
 *     subdomain `pindai.biz.id`. Gateway tidak bisa mengarahkan OTP ke
 *     sembarang host.
 *  3. JEJAK AUDIT. Setiap perubahan `apiUrl` - termasuk URL lama - tercatat di
 *     audit trail, jadi pengalihan diam-diam akan terlihat.
 *
 * Tanpa token yang benar, mutation ini menolak dan TIDAK mengubah apa pun.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { audit } from "./system";
import { apiKeyGatewayWa } from "./whatsapp";

/** Perbandingan string dengan waktu konstan (tidak membocorkan posisi beda). */
function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i += 1) {
    beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return beda === 0;
}

/**
 * Host yang boleh dipakai gateway untuk melaporkan dirinya.
 *
 * Sengaja sempit. Quick tunnel Cloudflare selalu berakhiran `.trycloudflare.com`;
 * domain permanen PINDAI berakhiran `.pindai.biz.id`. `hostSekarang` ikut
 * diizinkan supaya perpindahan ke domain lain (mis. Caddy di VPS dengan domain
 * sendiri) tidak langsung terkunci sebelum admin memperbarui daftar ini.
 */
function hostDiizinkan(host: string, hostSekarang: string | null): boolean {
  const h = host.toLowerCase();
  if (h === hostSekarang) return true;
  if (h.endsWith(".trycloudflare.com")) return true;
  if (h === "pindai.biz.id" || h.endsWith(".pindai.biz.id")) return true;
  return false;
}

/**
 * Gateway melaporkan URL publiknya. Dipanggil oleh skrip di VPS setiap kali
 * `cloudflared` menghasilkan URL baru.
 *
 * Idempoten: bila URL sama dengan yang tersimpan, tidak ada penulisan maupun
 * audit baru - supaya pelaporan berkala tidak membanjiri audit trail.
 */
export const laporkanUrl = mutation({
  args: {
    token: v.string(),
    apiUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const diharapkan = apiKeyGatewayWa();
    if (diharapkan === "") {
      // Tanpa token yang dikonfigurasi, tidak ada cara membedakan gateway asli
      // dari penyerang. Lebih baik menolak daripada menerima tanpa verifikasi.
      return { ok: false as const, alasan: "Gateway belum dikonfigurasi di server." };
    }
    if (!samaAman(args.token, diharapkan)) {
      return { ok: false as const, alasan: "Token tidak sah." };
    }

    let url: URL;
    try {
      url = new URL(args.apiUrl);
    } catch {
      return { ok: false as const, alasan: "URL tidak valid." };
    }
    if (url.protocol !== "https:") {
      return { ok: false as const, alasan: "URL wajib https." };
    }

    const baris =
      (await ctx.db.query("waSettings").first()) ?? null;
    const lama = baris?.apiUrl ?? null;

    if (!hostDiizinkan(url.host, lama === null ? null : (() => {
      try {
        return new URL(lama).host.toLowerCase();
      } catch {
        return null;
      }
    })())) {
      return {
        ok: false as const,
        alasan: `Host ${url.host} tidak diizinkan. Perbarui apiUrl lewat panel admin.`,
      };
    }

    const bersih = url.toString();
    if (lama === bersih) {
      return { ok: true as const, berubah: false as const, apiUrl: bersih };
    }

    if (baris === null) {
      await ctx.db.insert("waSettings", { slot: "global", apiUrl: bersih, aktif: true });
    } else {
      await ctx.db.patch(baris._id, { apiUrl: bersih });
    }

    // Audit menyebut URL lama DAN baru: pengalihan yang tidak sah akan terlihat
    // sebagai perubahan yang tidak pernah diminta admin.
    await audit(
      ctx,
      undefined,
      "gateway-wa",
      "gateway_url_diperbarui",
      url.host,
      `URL gateway diperbarui otomatis oleh gateway. Lama: ${lama ?? "(belum ada)"} - Baru: ${bersih}`,
    );

    return { ok: true as const, berubah: true as const, apiUrl: bersih };
  },
});
