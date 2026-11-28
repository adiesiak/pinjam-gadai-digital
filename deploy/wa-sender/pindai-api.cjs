/**
 * Klien API PINDAI untuk bot WhatsApp.
 *
 * Modul ini SATU-SATUNYA yang perlu bot sentuh untuk berintegrasi dengan
 * website. Bot tidak perlu tahu isi database Convex — cukup panggil fungsi di
 * bawah ini.
 *
 * Pasang:
 *   const pindai = require("./pindai-api.cjs");   // atau import
 *   const klien = pindai.buatKlien({
 *     apiKey: process.env.PINDAI_BOT_API_KEY,
 *   });
 *
 * Lalu:
 *   await klien.status("08123456789");
 *   await klien.daftar("08123456789", "Budi Santoso");
 *   const { storageId } = await klien.unggahFoto(buffer, "image/jpeg");
 *   await klien.ajukan("08123456789", { pokokPinjaman: 2000000, ... });
 *
 * Semua fungsi MELEMPAR Error bila gagal, dengan `err.pesan` berisi teks
 * Indonesia yang sudah layak ditampilkan ke nasabah.
 */

"use strict";

const BASE_BAWAAN = "https://academic-rooster-210.convex.site";

/** Error dengan pesan yang aman ditampilkan ke pengguna WhatsApp. */
class GalatPindai extends Error {
  constructor(pesan, { kode = 0, mentah = null, data = null } = {}) {
    super(pesan);
    this.name = "GalatPindai";
    /** Pesan siap tampil ke nasabah. */
    this.pesan = pesan;
    /** Status HTTP, 0 bila gagal jaringan. */
    this.kode = kode;
    /** Body respons mentah, untuk log. */
    this.mentah = mentah;
    /** Body terurai, mis. rincian 409 { totalDue, kurang, lebih }. */
    this.data = data;
  }
}

/**
 * Buat klien.
 *
 * @param {object} opsi
 * @param {string} opsi.apiKey  BOT_API_KEY dari Convex (wajib).
 * @param {string} [opsi.base]  Ganti base URL (untuk pengujian).
 * @param {number} [opsi.timeoutMs] Batas tiap permintaan, bawaan 30 detik.
 */
function buatKlien({ apiKey, base = BASE_BAWAAN, timeoutMs = 30_000 } = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new GalatPindai(
      "PINDAI_BOT_API_KEY belum diset. Ambil dari admin PINDAI lalu simpan di environment VPS.",
    );
  }
  const kunci = apiKey.trim();
  const akar = base.replace(/\/+$/, "");

  async function minta(jalur, { metode = "GET", isi, biner } = {}) {
    const url = `${akar}${jalur}`;
    const kepala = { Authorization: `Bearer ${kunci}` };
    let body;

    if (biner !== undefined) {
      kepala["Content-Type"] = biner.contentType ?? "application/octet-stream";
      body = biner.data;
    } else if (isi !== undefined) {
      kepala["Content-Type"] = "application/json";
      body = JSON.stringify(isi);
    }

    let res;
    try {
      res = await fetch(url, {
        method: metode,
        headers: kepala,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const sebab = e instanceof Error ? e.message : String(e);
      throw new GalatPindai(
        `Tidak dapat menghubungi PINDAI (${sebab}). Coba lagi beberapa saat.`,
      );
    }

    const teks = await res.text();
    let diurai = null;
    try {
      diurai = teks === "" ? null : JSON.parse(teks);
    } catch {
      /* bukan JSON; biarkan null */
    }

    if (!res.ok) {
      const pesan =
        (diurai && (diurai.error || diurai.alasan)) ||
        `PINDAI menolak permintaan (HTTP ${res.status}).`;
      throw new GalatPindai(pesan, { kode: res.status, mentah: diurai, data: diurai });
    }
    return diurai;
  }

  return {
    /**
     * Cek pengajuan milik satu nomor.
     * @returns {Promise<{terdaftar: boolean, pengajuan: Array}>}
     */
    async status(nomor) {
      const h = await minta(`/bot/status?nomor=${encodeURIComponent(nomor)}`, {
        metode: "GET",
      });
      if (!h || h.ok !== true) {
        // Nomor belum terdaftar bukan kegagalan sistem: kembalikan apa adanya
        // supaya bot bisa memutuskan menawarkan pendaftaran.
        return { terdaftar: false, pengajuan: [], alasan: h?.alasan ?? null };
      }
      return { terdaftar: true, pengajuan: h.pengajuan ?? [] };
    },

    /**
     * Daftarkan nomor WhatsApp. Idempoten: nomor yang sudah ada mengembalikan
     * user yang sama dengan `baru: false`.
     */
    async daftar(nomor, nama) {
      const h = await minta("/bot/daftar", {
        metode: "POST",
        isi: { nomor, nama },
      });
      return { userId: h.userId, baru: h.baru === true };
    },

    /**
     * Dapat URL unggah sekali pakai.
     * @returns {Promise<string>} URL untuk PUT berkas
     */
    async urlUnggah() {
      const h = await minta("/bot/unggah-url", { metode: "POST" });
      if (!h || typeof h.urlUnggah !== "string") {
        throw new GalatPindai("PINDAI tidak mengembalikan URL unggah.");
      }
      return h.urlUnggah;
    },

    /**
     * Unggah satu berkas (foto KTP/selfie/slip) dan kembalikan storageId.
     *
     * Bot TIDAK boleh menyimpan foto di VPS. Kalau disimpan sendiri, dokumen
     * KYC terpecah dua tempat dan pemulihan backup tidak lagi utuh.
     *
     * @param {Buffer|Uint8Array} data
     * @param {string} contentType mis. "image/jpeg"
     * @returns {Promise<{storageId: string}>}
     */
    async unggahFoto(data, contentType = "image/jpeg") {
      const url = await this.urlUnggah();
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: data,
      });
      if (!res.ok) {
        throw new GalatPindai(
          `Unggah berkas gagal (HTTP ${res.status}). Coba kirim ulang fotonya.`,
          { kode: res.status },
        );
      }
      const h = await res.json();
      if (!h || typeof h.storageId !== "string") {
        throw new GalatPindai("PINDAI tidak mengembalikan storageId.");
      }
      return { storageId: h.storageId };
    },

    /**
     * Ajukan pinjaman atas nama pemilik nomor.
     *
     * @param {string} nomor
     * @param {object} data  Lihat docs/api-bot-whatsapp.md bagian "Field wajib".
     * @returns {Promise<{nomorReferensi: string, appId: string}>}
     */
    async ajukan(nomor, data) {
      const h = await minta("/bot/pengajuan", {
        metode: "POST",
        isi: { nomor, data },
      });
      return { nomorReferensi: h.nomorReferensi, appId: h.appId };
    },

    /**
     * Tagihan berjalan milik satu nomor.
     * @returns {Promise<{terdaftar: boolean, tarifDendaPerHari: number, pinjaman: Array}>}
     */
    async tagihan(nomor) {
      const h = await minta(`/bot/tagihan?nomor=${encodeURIComponent(nomor)}`, {
        metode: "GET",
      });
      if (!h || h.ok !== true) {
        return { terdaftar: false, tarifDendaPerHari: 0, pinjaman: [], alasan: h?.alasan ?? null };
      }
      return {
        terdaftar: true,
        tarifDendaPerHari: h.tarifDendaPerHari ?? 0,
        pinjaman: h.pinjaman ?? [],
      };
    },

    /**
     * Kumpulkan KYC lewat bot. Status akhir PENDING_REVIEW, bukan disetujui.
     * `persetujuan` harus benar-benar ditanyakan ke nasabah.
     */
    async kyc(data) {
      const h = await minta("/bot/kyc", { metode: "POST", isi: data });
      return { status: h.status };
    },

    /**
     * Tandai pinjaman tersalurkan. `sudah: true` berarti sudah pernah dicairkan.
     */
    async pencairan(nomorReferensi, catatan) {
      const h = await minta("/bot/pencairan", {
        metode: "POST",
        isi: { nomorReferensi, ...(catatan ? { catatan } : {}) },
      });
      return { sudah: h.sudah === true };
    },

    /**
     * Catat pembayaran. `referensi` adalah kunci idempotensi: kiriman ulang
     * dengan kunci yang sama tidak mencatat pembayaran kedua.
     *
     * Nominal harus sama persis. Bila tidak, melempar GalatPindai dengan
     * `kode === 409` dan `data` berisi { totalDue, dibayar, kurang, lebih }.
     */
    async pembayaran(nomorReferensi, { referensi, jumlah, tanggal, catatan } = {}) {
      const h = await minta("/bot/pembayaran", {
        metode: "POST",
        isi: {
          nomorReferensi,
          referensi,
          jumlah,
          ...(tanggal !== undefined ? { tanggal } : {}),
          ...(catatan !== undefined ? { catatan } : {}),
        },
      });
      return { jalur: h.jalur, ulangan: h.ulangan === true };
    },

    /**
     * Ajukan dengan kunci idempotensi otomatis.
     *
     * Kalau bot mengirim ulang karena jaringan putus, kunci yang sama
     * mengembalikan pengajuan yang SAMA — bukan pengajuan kedua.
     */
    async ajukanSekali(nomor, data, kunciIdempotensi) {
      return this.ajukan(nomor, { ...data, kunciIdempotensi });
    },
  };
}

module.exports = { buatKlien, GalatPindai, BASE_BAWAAN };
