/**
 * Ruang penyedia dana — HANYA BACA, dengan satu pengecualian pencatatan.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * kepada akun yang diberi akses "lihat saja" oleh admin. Modul ini tidak memuat
 * satu pun mutation alokasi/transaksi: pembukanya hanya dapat membaca, tidak
 * pernah mengubah catatan.
 *
 * PENGECUALIAN: `catatTransferPendana` dan `batalkanTransferPendana`. Keduanya
 * KHUSUS admin (bukan pemegang akses lihat saja), tidak menyentuh saldo, ledger,
 * maupun status pinjaman, dan tidak memindahkan uang. PINDAI tidak memindahkan
 * uang — `paymentGuard` menutup seluruh mutation pembayaran. Yang dicatat admin
 * adalah bahwa ia SUDAH mentransfer keuntungan pendana di luar sistem, agar
 * tidak ada keuntungan yang tertagih dua kali.
 *
 * Privasi (whitelist, bukan spread dokumen mentah): baris yang dikirim ke
 * klien hanya berisi field operasional yang dibutuhkan ruang ini. Nama lengkap
 * pemohon ditampilkan untuk ruang pemantau (keputusan admin), NIK, nomor
 * rekening, nomor WhatsApp, alamat, dan penghasilan tetap TIDAK pernah keluar
 * sebagai teks. Dua hal dibuka atas keputusan admin: (1) berkas pengajuan
 * (KTP, selfie, slip, foto barang) lewat `berkasPengajuan` yang hanya dipanggil
 * saat dialog Detail dibuka, dan (2) titik lokasi terakhir peminjam lewat
 * `lokasi`/`titikPeminjam`. Setiap baris tetap membawa `kodePeminjam`
 * (pseudonim acak dari `peminjamCode.ts`) sebagai kunci stabil antar-ruang.
 *
 * Akses ditentukan peran akun: `dana` (penyedia dana), `pengamat` (sesi kode
 * akses bersama — tanpa berkas identitas), atau `admin` untuk pratinjau. Admin memberi/mencabut akses lewat `ubahAkses` di bawah, dan
 * setiap perubahan tercatat pada audit trail.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { SLOT_AKSES_BERSAMA } from "./aksesBersama";
import { requireAdminSession } from "./adminAuthz";
import { bagiHasilPinjaman } from "../lib/bagiHasil";
import {
  rekapTransferPendana,
  ringkasTransfer,
  type PinjamanTransfer,
  type RekapTransferPendana,
  type RingkasTransfer,
  type TransferBaris,
} from "../lib/transferPendana";
import { akunDompetDana, danaWalletBalance } from "./ledger";
import { kunciNamaPendana, pinjamanMilikPendana } from "./pendanaKepemilikan";
import { nominalDisetujui, nominalTerkunci } from "../lib/statusPinjaman";
import { ROLES } from "./schema";
import { audit, getConfig } from "./system";

/** Batas baris per kategori; daftar selalu diurutkan dari yang terbaru. */
export const BATAS_BARIS = 200;

/** Batas jumlah akun penyedia dana yang dikembalikan ke panel admin. */
const BATAS_AKUN = 200;

/**
 * Titik lokasi terakhir yang diketahui untuk satu peminjam.
 *
 * Sumbernya bertingkat, dari yang paling baru:
 *  - `lokasiStatus`  — titik terkini yang dikirim perangkat (heartbeat ±60 detik,
 *                      lihat `convex/lokasi.ts`); ini yang membuat peta "live".
 *  - jejak terakhir  — `lokasiJejak` paling baru bila status terkini belum ada.
 *  - titik pengajuan — `loans.lokasiAjukan`, titik saat pengajuan dikirim.
 *
 * Titik hanya diperbarui selama aplikasi/dashboard peminjam terbuka: pelacakan
 * saat aplikasi ditutup butuh aplikasi native (lihat catatan di lib/lokasi.ts),
 * jadi ruang ini selalu menampilkan "terakhir dikirim kapan", bukan klaim
 * posisi saat ini.
 */
export type LokasiTitik = {
  lat: number;
  lng: number;
  /** Akurasi GPS yang dilaporkan perangkat (meter). */
  akurasi: number;
  /** Waktu server saat titik diterima. */
  waktu: number;
  /** "web" | "aplikasi" | "jejak" | "pengajuan". */
  sumber: string;
  /** Tanda kecurigaan koordinat otomatis (kosong = normal). */
  tanda: string[];
};

/** Titik terkini dari status/jejak perangkat — null bila belum pernah ada. */
async function lokasiPerangkat(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<LokasiTitik | null> {
  const status = await ctx.db
    .query("lokasiStatus")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (status !== null) {
    return {
      lat: status.lat,
      lng: status.lng,
      akurasi: status.akurasi,
      waktu: status.waktu,
      sumber: status.sumber,
      tanda: status.tanda ?? [],
    };
  }
  const jejak = await ctx.db
    .query("lokasiJejak")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (jejak === null) return null;
  return {
    lat: jejak.lat,
    lng: jejak.lng,
    akurasi: jejak.akurasi,
    waktu: jejak.waktu,
    sumber: "jejak",
    tanda: jejak.tanda ?? [],
  };
}

export type BarisPinjaman = {
  _id: Id<"loans">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/WA tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  pokokPinjaman: number;
  /** Nominal awal pengajuan; dokumen lama memakai pokok tercatat. */
  pokokDiajukan: number;
  tenorHari: number;
  tenorBulan: number | null;
  /** Bunga khusus nasabah (persen); null = default Pengaturan Sistem. */
  persenBunga: number | null;
  tujuan: string;
  status: string;
  /** Waktu pengajuan tercatat (convex `_creationTime`). */
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana tunggal pinjaman ini — null bila belum didanai. */
  pendana: string | null;
  /** Bunga pinjaman = pokok × persen bunga (dari Pengaturan Sistem). */
  bunga: number;
  /** Total kewajiban Peminjam = pokok + bunga (mis. Rp1jt → Rp1,3jt). */
  totalLunas: number;
  /** Potongan admin atas pinjaman ini (persen admin × total kewajiban). */
  potonganAdmin: number;
  /** Keuntungan bersih penyedia dana = bunga − potongan admin. */
  keuntunganPendana: number;
  /** Keuntungan admin atas pinjaman ini (sama dengan potongan admin). */
  keuntunganAdmin: number;
  /**
   * Status catatan transfer keuntungan pendana. Kewajibannya baru jatuh tempo
   * saat pinjaman lunas; catatan dibuat admin dan BUKAN bukti mutasi bank.
   */
  transfer: RingkasTransfer;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

/**
 * Rekap keuntungan per penyedia dana (model 1 pinjaman = 1 pendana), dihitung
 * dari baris pinjaman yang benar-benar dikirim ke klien — bukan angka tersimpan.
 */
export type RekapPendana = {
  nama: string;
  jumlahPinjaman: number;
  jumlahAktif: number;
  jumlahLunas: number;
  /** Pokok seluruh pinjaman berjalan + lunas yang didanai akun ini. */
  totalDisalurkan: number;
  /** Pokok pinjaman yang masih berjalan (status didanai). */
  saldoBerjalan: number;
  /** Total bunga (kewajiban − pokok) pinjaman berjalan + lunas. */
  totalBunga: number;
  /** Keuntungan bersih penyedia dana (bunga − potongan admin). */
  keuntunganPendana: number;
  /** Keuntungan admin dari pinjaman penyedia dana ini. */
  keuntunganAdmin: number;
  /** Pinjaman lunas yang keuntungannya sudah dicatat ditransfer admin. */
  transferTercatat: number;
  /** Pinjaman lunas yang catatan transfernya belum dibuat admin. */
  transferBelumDicatat: number;
  /** Nilai keuntungan pada pinjaman lunas yang belum dicatat transfernya. */
  keuntunganBelumDicatat: number;
};

export type BarisGadai = {
  _id: Id<"pawns">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/dokumen tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  kategori: string;
  deskripsiBarang: string;
  nilaiTaksiran: number | null;
  status: string;
  diajukanPada: number;
  /** Pokok gadai yang disetujui admin (Skema B) — null bila belum ada. */
  pokokGadai: number | null;
  /** Sewa modal per 30 hari dalam persen (Skema B). */
  persenSewaModal: number | null;
  /** Sisa pokok berjalan gadai (Skema B). */
  sisaPokok: number | null;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

export type BarisKredit = {
  _id: Id<"kreditBarang">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/WA tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  namaBarang: string;
  kategori: string;
  merchant: string;
  hargaBarang: number;
  dpPersen: number;
  tenorBulan: number;
  marginPersenPerBulan: number;
  status: string;
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana yang mencatat alokasi — null bila belum didanai. */
  pendana: string | null;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

/**
 * Perhitungan bagi hasil tahan-data-warisan: satu baris non-standar tidak
 * boleh merobohkan seluruh halaman. Bila pokok bukan rupiah bulat, tampilkan
 * tanpa perhitungan (bunga/potongan nol) alih-alih menggagalkan query.
 */
function bagiPinjamanAman(pokok: number, persenBunga: number, persenAdmin: number) {
  try {
    return bagiHasilPinjaman(pokok, persenBunga, persenAdmin);
  } catch {
    return {
      bunga: 0,
      totalLunas: pokok,
      potonganAdmin: 0,
      pendanaTerima: pokok,
      keuntunganPendana: 0,
      keuntunganAdmin: 0,
    };
  }
}

const MENUNGGU_PINJAMAN = new Set(["diajukan", "sedang_direview"]);
const MENUNGGU_GADAI = new Set(["diajukan", "sedang_dinilai"]);
const MENUNGGU_KREDIT = new Set(["diajukan", "sedang_ditinjau"]);

/**
 * Gerbang ruang penyedia dana. Tamu (anonim) dan akun tanpa peran `dana`/`admin`
 * selalu ditolak — pemeriksaan dilakukan di server, bukan hanya di UI.
 */
async function requirePengamat(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");

  /**
   * Pemantau akun bersama: sesi tamu yang diaktifkan kode akses bersama.
   * Aksesnya harus masih memakai versi kode yang berlaku — rotasi atau
   * nonaktif kode langsung memutusnya, walau sesinya masih hidup.
   */
  if (user.role === ROLES.PENGAMAT) {
    // Fail-closed: kalau akunnya berubah menjadi akun email, akses bersama
    // ditutup supaya tidak ikut mewarisi hak tulis sebuah akun biasa.
    if (user.isAnonymous !== true) {
      throw new Error(
        "Akses bersama berakhir karena akun ini kini memakai identitas email. Minta akses dari admin.",
      );
    }
    const baris = await ctx.db
      .query("aksesBersama")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
      .first();
    if (baris?.aktif !== true || user.aksesBersamaVersi !== baris.versi) {
      throw new Error(
        "Akses bersama sudah diputus admin. Minta kode terbaru lalu masuk lagi lewat /akses-bersama.",
      );
    }
    return { userId, user };
  }

  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu tidak memiliki akses ruang penyedia dana. Masuk dengan akun terverifikasi.",
    );
  }
  if (user.role !== ROLES.DANA && user.role !== ROLES.ADMIN) {
    throw new Error(
      "Ruang penyedia dana hanya dapat dibuka oleh akun dengan akses lihat saja dari admin.",
    );
  }

  return { userId, user };
}

/**
 * Gerbang KHUSUS berkas pemohon (KTP, selfie, slip, foto barang, tanda tangan).
 *
 * Lebih ketat daripada `requirePengamat`: berkas identitas hanya dibuka untuk
 * akun penyedia dana beremail yang ditunjuk admin (peran `dana`) dan untuk
 * admin sendiri. Sesi tamu kode akses bersama TIDAK dapat membukanya, karena
 * kode itu dibagikan ke banyak orang dan tidak dapat ditelusuri ke satu akun —
 * sedangkan KTP/selfie adalah data pribadi peminjam.
 */
async function requireBerkasPemohon(ctx: QueryCtx) {
  const hasil = await requirePengamat(ctx);
  if (hasil.user.role === ROLES.PENGAMAT) {
    throw new Error(
      "Berkas pemohon hanya dibuka untuk akun penyedia dana beremail. Sesi kode akses bersama tidak dapat membukanya.",
    );
  }
  return hasil;
}

/**
 * Satu query untuk seluruh halaman: tiga daftar pengajuan + ringkasannya.
 * Baris dibatasi `BATAS_BARIS` per kategori dan diambil dari yang terbaru agar
 * payload tetap ringan; pemanggil menerima penanda `terpotong`.
 */
export const daftarPengajuan = query({
  args: {},
  handler: async (ctx) => {
    await requirePengamat(ctx);
    // Kebijakan bunga & potongan admin dibaca dari Pengaturan Sistem.
    const cfg = await getConfig(ctx);

    // Cache kode pseudonim — satu pembacaan per peminjam, bukan per baris.
    const kodeCache = new Map<Id<"users">, string | null>();
    async function kodeUntuk(userId: Id<"users">): Promise<string | null> {
      const cached = kodeCache.get(userId);
      if (cached !== undefined) return cached;
      const peminjam = await ctx.db.get(userId);
      const kode = peminjam?.kodePeminjam ?? null;
      kodeCache.set(userId, kode);
      return kode;
    }

    // Nama penyedia dana untuk kolom "Pendana". Dibaca hanya pada baris yang
    // sudah didanai supaya tidak ada pembacaan tabel alokasi per baris kosong;
    // nama akun di-cache agar satu pembacaan per penyedia, bukan per baris.
    const namaCache = new Map<Id<"users">, string | null>();
    async function namaPenyedia(userId: Id<"users">): Promise<string | null> {
      const cached = namaCache.get(userId);
      if (cached !== undefined) return cached;
      const penyedia = await ctx.db.get(userId);
      // Akun penyedia dana umumnya tidak mengisi `name` (login OTP/anonymous),
      // jadi email dipakai sebagai identitas cadangan untuk kolom "Pendana".
      const namaAkun = penyedia?.name?.trim();
      const nama = namaAkun ? namaAkun : (penyedia?.email ?? null);
      namaCache.set(userId, nama);
      return nama;
    }
    // Baris alokasi lama menyimpan id penyedia dengan nama field `pendanaId`
    // (lihat convex/migrasiPendanaId.ts). Dibaca toleran supaya satu baris
    // bentuk lama tidak pernah merobohkan seluruh halaman.
    function idPendana(baris: { danaId?: unknown; pendanaId?: unknown }): Id<"users"> | null {
      const id = baris.danaId ?? baris.pendanaId;
      return typeof id === "string" ? (id as Id<"users">) : null;
    }
    async function rangkaiPendana(ids: (Id<"users"> | null)[]): Promise<string | null> {
      const sah = ids.filter((id): id is Id<"users"> => id !== null);
      if (sah.length === 0) return null;
      const nama: string[] = [];
      for (const id of sah) {
        nama.push((await namaPenyedia(id)) ?? "Penyedia dana");
      }
      return [...new Set(nama)].join(", ");
    }
    async function pendanaPinjaman(loanId: Id<"loans">): Promise<string | null> {
      const alokasi = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      return rangkaiPendana(alokasi.map((a) => idPendana(a)));
    }
    async function pendanaKredit(kreditId: Id<"kreditBarang">): Promise<string | null> {
      const alokasi = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", kreditId))
        .collect();
      return rangkaiPendana(alokasi.map((a) => idPendana(a)));
    }

    // Titik lokasi terakhir per peminjam — satu pembacaan per orang, bukan
    // per baris pengajuan. Kegagalan pembacaan tidak pernah menghentikan
    // daftar: titik ditampilkan sebagai "belum ada" saja.
    const lokasiCache = new Map<Id<"users">, LokasiTitik | null>();
    async function lokasiUntuk(userId: Id<"users">): Promise<LokasiTitik | null> {
      if (lokasiCache.has(userId)) return lokasiCache.get(userId) ?? null;
      const titik = await lokasiPerangkat(ctx, userId);
      lokasiCache.set(userId, titik);
      return titik;
    }    // Catatan transfer dibaca SEKALI, dipetakan per pinjaman untuk seluruh baris.
    const transferPerPinjaman = await petaTransfer(ctx);

    const pinjamanMentah = await ctx.db
      .query("loans")
      .order("desc")
      .take(BATAS_BARIS + 1);
    const gadaiMentah = await ctx.db
      .query("pawns")
      .order("desc")
      .take(BATAS_BARIS + 1);
    const kreditMentah = await ctx.db
      .query("kreditBarang")
      .order("desc")
      .take(BATAS_BARIS + 1);

    const pinjaman: BarisPinjaman[] = [];
    for (const loan of pinjamanMentah.slice(0, BATAS_BARIS)) {
      const bagi = bagiPinjamanAman(loan.pokokPinjaman, loan.persenBunga ?? cfg.persenBunga, cfg.persenAdmin);
      // Model 1 pinjaman = 1 pendana: penyedia dibaca langsung dari pinjaman.
      // Baris alokasi lama (`fundings`) tetap dibaca sebagai cadangan warisan.
      const pendana =
        loan.pendanaId !== undefined
          ? await namaPenyedia(loan.pendanaId)
          : (loan.pendanaNama ??
            (loan.didanaiPada === undefined ? null : await pendanaPinjaman(loan._id)));
      pinjaman.push({
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        namaLengkap: loan.namaLengkap,
        kodePeminjam: await kodeUntuk(loan.userId),
        pokokPinjaman: loan.pokokPinjaman,
        pokokDiajukan: loan.pokokDiajukan ?? loan.pokokPinjaman,
        tenorHari: loan.tenorHari,
        tenorBulan: loan.tenorBulan ?? null,
        persenBunga: loan.persenBunga ?? null,
        tujuan: loan.tujuan,
        status: loan.status,
        diajukanPada: loan.diajukanPada ?? loan._creationTime,
        didanaiPada: loan.didanaiPada ?? null,
        pendana,
        bunga: bagi.bunga,
        totalLunas: bagi.totalLunas,
        potonganAdmin: bagi.potonganAdmin,
        keuntunganPendana: bagi.keuntunganPendana,
        keuntunganAdmin: bagi.keuntunganAdmin,
        transfer: transferPerPinjaman.get(loan._id) ?? ringkasTransfer([]),
        // Pinjaman menyimpan titik GPS saat pengajuan dikirim — dipakai sebagai
        // cadangan bila perangkat belum pernah mengirim heartbeat.
        lokasi:
          (await lokasiUntuk(loan.userId)) ??
          (loan.lokasiAjukan === undefined
            ? null
            : {
                lat: loan.lokasiAjukan.lat,
                lng: loan.lokasiAjukan.lng,
                akurasi: loan.lokasiAjukan.akurasi,
                waktu: loan.lokasiAjukan.waktu,
                sumber: "pengajuan",
                tanda: [],
              }),
      });
    }

    const gadai: BarisGadai[] = [];
    for (const pawn of gadaiMentah.slice(0, BATAS_BARIS)) {
      gadai.push({
        _id: pawn._id,
        nomorReferensi: pawn.nomorReferensi,
        namaLengkap: pawn.namaLengkap,
        kodePeminjam: await kodeUntuk(pawn.userId),
        kategori: pawn.kategori,
        deskripsiBarang: pawn.deskripsiBarang,
        nilaiTaksiran: pawn.nilaiTaksiran ?? null,
        status: pawn.status,
        diajukanPada: pawn._creationTime,
        pokokGadai: pawn.pokokGadai ?? null,
        persenSewaModal: pawn.persenSewaModal ?? null,
        sisaPokok: pawn.sisaPokok ?? null,
        lokasi: await lokasiUntuk(pawn.userId),
      });
    }

    const kredit: BarisKredit[] = [];
    for (const item of kreditMentah.slice(0, BATAS_BARIS)) {
      kredit.push({
        _id: item._id,
        nomorReferensi: item.nomorReferensi,
        namaLengkap: item.namaLengkap,
        kodePeminjam: await kodeUntuk(item.userId),
        namaBarang: item.namaBarang,
        kategori: item.kategori,
        merchant: item.merchant,
        hargaBarang: item.hargaBarang,
        dpPersen: item.dpPersen,
        tenorBulan: item.tenorBulan,
        marginPersenPerBulan: item.marginPersenPerBulan,
        status: item.status,
        diajukanPada: item._creationTime,
        didanaiPada: item.didanaiPada ?? null,
        pendana:
          item.didanaiPada === undefined ? null : await pendanaKredit(item._id),
        lokasi: await lokasiUntuk(item.userId),
      });
    }

    // Rekap keuntungan per penyedia dana (model 1 pinjaman = 1 pendana).
    // Hanya pinjaman berjalan (didanai) dan lunas yang dihitung uangnya.
    const rekapMap = new Map<string, RekapPendana>();
    for (const b of pinjaman) {
      if (b.pendana === null) continue;
      if (b.status !== "didanai" && b.status !== "lunas") continue;
      const r =
        rekapMap.get(b.pendana) ?? {
          nama: b.pendana,
          jumlahPinjaman: 0,
          jumlahAktif: 0,
          jumlahLunas: 0,
          totalDisalurkan: 0,
          saldoBerjalan: 0,
          totalBunga: 0,
          keuntunganPendana: 0,
          keuntunganAdmin: 0,
          transferTercatat: 0,
          transferBelumDicatat: 0,
          keuntunganBelumDicatat: 0,
        };
      r.jumlahPinjaman += 1;
      if (b.status === "lunas") r.jumlahLunas += 1;
      else r.jumlahAktif += 1;
      r.totalDisalurkan += b.pokokPinjaman;
      if (b.status === "didanai") r.saldoBerjalan += b.pokokPinjaman;
      r.totalBunga += b.bunga;
      r.keuntunganPendana += b.keuntunganPendana;
      r.keuntunganAdmin += b.keuntunganAdmin;
      // Kewajiban transfer hanya muncul pada pinjaman lunas (bunga sudah
      // terbayar penuh). Pinjaman berjalan belum jatuh tempo.
      if (b.status === "lunas") {
        if (b.transfer.status === "dicatat") {
          r.transferTercatat += 1;
        } else {
          r.transferBelumDicatat += 1;
          r.keuntunganBelumDicatat += b.keuntunganPendana;
        }
      }
      rekapMap.set(b.pendana, r);
    }
    const rekapPendana = [...rekapMap.values()].sort(
      (a, b) => b.totalDisalurkan - a.totalDisalurkan,
    );

    // Ringkasan dihitung dari baris yang benar-benar dikirim (Zero Fake Data).
    const ringkasan = {
      jumlahPinjaman: pinjaman.length,
      jumlahGadai: gadai.length,
      jumlahKredit: kredit.length,
      menungguReview:
        pinjaman.filter((b) => MENUNGGU_PINJAMAN.has(b.status)).length +
        gadai.filter((b) => MENUNGGU_GADAI.has(b.status)).length +
        kredit.filter((b) => MENUNGGU_KREDIT.has(b.status)).length,
      nilaiPinjaman: pinjaman.reduce((total, b) => total + b.pokokPinjaman, 0),
      nilaiGadai: gadai.reduce((total, b) => total + (b.nilaiTaksiran ?? 0), 0),
      nilaiKredit: kredit.reduce((total, b) => total + b.hargaBarang, 0),
      /** Total bunga pinjaman yang tercatat pada baris yang dikirim. */
      totalBungaPinjaman: pinjaman.reduce((total, b) => total + b.bunga, 0),
      /** Keuntungan admin dari pinjaman yang sudah berjalan/lunas. */
      totalKeuntunganAdmin: rekapPendana.reduce((total, r) => total + r.keuntunganAdmin, 0),
      /** Keuntungan bersih penyedia dana dari pinjaman berjalan/lunas. */
      totalKeuntunganPendana: rekapPendana.reduce(
        (total, r) => total + r.keuntunganPendana,
        0,
      ),
      /** Pinjaman lunas yang catatan transfer keuntungannya belum dibuat admin. */
      totalTransferBelumDicatat: rekapPendana.reduce(
        (total, r) => total + r.transferBelumDicatat,
        0,
      ),
      /** Nilai keuntungan pada pinjaman lunas yang belum dicatat transfernya. */
      nilaiTransferBelumDicatat: rekapPendana.reduce(
        (total, r) => total + r.keuntunganBelumDicatat,
        0,
      ),
      /** Kebijakan yang dipakai menghitung kolom bagi hasil di halaman ini. */
      persenBunga: cfg.persenBunga,
      persenPotonganAdmin: cfg.persenAdmin,
    };

    return {
      batas: BATAS_BARIS,
      terpotong: {
        pinjaman: pinjamanMentah.length > BATAS_BARIS,
        gadai: gadaiMentah.length > BATAS_BARIS,
        kredit: kreditMentah.length > BATAS_BARIS,
      },
      ringkasan,
      rekapPendana,
      pinjaman,
      gadai,
      kredit,
    };
  },
});

/**
 * Satu baris peta: peminjam + titik terakhir yang diketahui.
 * Hanya berisi identitas tampil (nama, kode pseudonim, nomor referensi) dan
 * koordinat — tanpa NIK, rekening, WhatsApp, atau alamat.
 */
export type TitikPeminjam = {
  userId: Id<"users">;
  namaLengkap: string;
  kodePeminjam: string | null;
  nomorReferensi: string;
  kategori: "pinjaman" | "gadai" | "kredit";
  status: string;
  posisi: LokasiTitik;
};

/** Batas baris per kategori untuk peta live (satu peminjam dihitung sekali). */
const BATAS_PETA = 150;

/**
 * Titik lokasi peminjam untuk peta live ruang penyedia dana.
 *
 * Satu baris per peminjam (pengajuan terbaru dipakai sebagai keterangan),
 * berisi hanya peminjam yang sudah pernah mengirim titik GPS. Query ini reaktif:
 * setiap heartbeat perangkat peminjam (±60 detik) langsung memperbarui peta.
 */
export const titikPeminjam = query({
  args: {},
  handler: async (ctx) => {
    await requirePengamat(ctx);
    const cfg = await getConfig(ctx);

    const [loans, pawns, kredit] = await Promise.all([
      ctx.db.query("loans").order("desc").take(BATAS_PETA + 1),
      ctx.db.query("pawns").order("desc").take(BATAS_PETA + 1),
      ctx.db.query("kreditBarang").order("desc").take(BATAS_PETA + 1),
    ]);

    const rows: TitikPeminjam[] = [];
    const sudah = new Set<string>();
    let tanpaTitik = 0;

    async function tambah(
      userId: Id<"users">,
      namaLengkap: string,
      nomorReferensi: string,
      kategori: TitikPeminjam["kategori"],
      status: string,
    ): Promise<void> {
      if (sudah.has(userId) || rows.length >= BATAS_PETA) return;
      sudah.add(userId);
      const posisi = await lokasiPerangkat(ctx, userId);
      if (posisi === null) {
        tanpaTitik += 1;
        return;
      }
      const peminjam = await ctx.db.get(userId);
      rows.push({
        userId,
        namaLengkap,
        kodePeminjam: peminjam?.kodePeminjam ?? null,
        nomorReferensi,
        kategori,
        status,
        posisi,
      });
    }

    for (const l of loans.slice(0, BATAS_PETA)) {
      await tambah(l.userId, l.namaLengkap, l.nomorReferensi, "pinjaman", l.status);
    }
    for (const p of pawns.slice(0, BATAS_PETA)) {
      await tambah(p.userId, p.namaLengkap, p.nomorReferensi, "gadai", p.status);
    }
    for (const k of kredit.slice(0, BATAS_PETA)) {
      await tambah(k.userId, k.namaLengkap, k.nomorReferensi, "kredit", k.status);
    }

    // Titik acuan konfigurasi (kantor) — penanda orientasi peta, sama seperti
    // peta admin: bukan posisi gudang terverifikasi.
    return {
      vault: { lat: cfg.vaultLat, lng: cfg.vaultLng },
      batas: BATAS_PETA,
      terpotong:
        loans.length > BATAS_PETA || pawns.length > BATAS_PETA || kredit.length > BATAS_PETA,
      jumlahTitik: rows.length,
      tanpaTitik,
      rows,
    };
  },
});

/**
 * Berkas pengajuan (KTP, selfie KTP, slip penghasilan, foto barang, tanda
 * tangan) untuk dialog Detail.
 *
 * Sengaja dipisah dari `daftarPengajuan` supaya payload daftar tetap ringan dan
 * berkas hanya diambil saat benar-benar dibuka. `ctx.storage.getUrl` memakai
 * URL penyimpanan Convex yang tidak dapat ditebak; hanya akun penyedia dana
 * beremail (atau admin) yang bisa memintanya — sesi kode akses bersama ditolak,
 * lihat `requireBerkasPemohon`.
 */
export type BerkasPengajuan = {
  jenis: "pinjaman" | "gadai" | "kredit";
  berkas: { label: string; url: string }[];
  /** Tanda tangan elektronik peminjam (data URL PNG) bila ada. */
  tandaTangan: string | null;
  tandaTanganPada: number | null;
  catatan: string | null;
};

export const berkasPengajuan = query({
  args: {
    jenis: v.union(v.literal("pinjaman"), v.literal("gadai"), v.literal("kredit")),
    id: v.string(),
  },
  handler: async (ctx, { jenis, id }): Promise<BerkasPengajuan | null> => {
    await requireBerkasPemohon(ctx);

    if (jenis === "kredit") {
      // Pengajuan kredit barang tidak menyimpan berkas gambar di sistem.
      const kreditId = ctx.db.normalizeId("kreditBarang", id);
      if (kreditId === null || (await ctx.db.get(kreditId)) === null) return null;
      return {
        jenis,
        berkas: [],
        tandaTangan: null,
        tandaTanganPada: null,
        catatan:
          "Pengajuan kredit barang tidak menyimpan berkas gambar di PINDAI — hanya data pemohon dan rincian barang.",
      };
    }

    if (jenis === "gadai") {
      const pawnId = ctx.db.normalizeId("pawns", id);
      if (pawnId === null) return null;
      const pawn = await ctx.db.get(pawnId);
      if (pawn === null) return null;
      const foto = pawn.fotoBarangId ? await ctx.storage.getUrl(pawn.fotoBarangId) : null;
      const berkas = foto === null ? [] : [{ label: "Foto barang", url: foto }];
      return {
        jenis,
        berkas,
        tandaTangan: pawn.tandaTanganPeminjam ?? null,
        tandaTanganPada: pawn.tandaTanganPada ?? null,
        catatan:
          berkas.length === 0
            ? "Belum ada foto barang yang tersimpan untuk pengajuan gadai ini."
            : null,
      };
    }

    const loanId = ctx.db.normalizeId("loans", id);
    if (loanId === null) return null;
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const [ktp, selfie, slip] = await Promise.all([
      loan.dokKtpId ? ctx.storage.getUrl(loan.dokKtpId) : null,
      loan.dokSelfieKtpId ? ctx.storage.getUrl(loan.dokSelfieKtpId) : null,
      loan.dokSlipGajiId ? ctx.storage.getUrl(loan.dokSlipGajiId) : null,
    ]);
    const berkas = [
      { label: "KTP", url: ktp },
      { label: "Selfie dengan KTP", url: selfie },
      { label: "Slip penghasilan", url: slip },
    ].filter((b): b is { label: string; url: string } => b.url !== null);
    return {
      jenis,
      berkas,
      tandaTangan: loan.tandaTanganPeminjam ?? null,
      tandaTanganPada: loan.tandaTanganPada ?? null,
      catatan:
        berkas.length === 0
          ? "Belum ada berkas yang tersimpan untuk pengajuan pinjaman ini."
          : null,
    };
  },
});

/**
 * Satu baris kelola investor: identitas akun, status akses, dan posisi
 * dananya. Semua angka diturunkan dari catatan asli (fundings, kreditFundings,
 * deposits, withdrawals, ledger) — tidak ada nilai cache.
 */
/**
 * Peran penyedia dana WARISAN.
 *
 * Sejumlah dokumen lama menyimpan `role: "pendana"`, sedangkan peran yang
 * berlaku sekarang adalah `dana` (lihat ROLES). Baris seperti itu tidak dikenali
 * gerbang ruang mana pun, jadi akunnya tidak punya akses — tetapi alokasi,
 * setoran, dan saldo ledger mereka tetap nyata. Karena itu akun warisan ikut
 * DITAMPILKAN di panel kelola (dan ditandai "peran lama") supaya admin dapat
 * melihat posisinya lalu memberi akses secara sadar lewat tombol Beri akses.
 * Akses tidak pernah diberikan otomatis.
 */
const PERAN_PENDANA_LEGACY = "pendana";

function peranPenyedia(role: string | undefined): boolean {
  return role === ROLES.DANA || role === PERAN_PENDANA_LEGACY;
}

export type BarisInvestor = {
  userId: Id<"users">;
  nama: string;
  email: string | null;
  emailTerverifikasi: boolean;
  /** Peran tersimpan apa adanya: `dana`, `pendana` (warisan), atau `pengamat`. */
  peran: string | null;
  /** Peran warisan `pendana` — menyimpan dana tetapi belum berakses ruang. */
  peranLegacy: boolean;
  /** Akun bersama dari kode akses — dikelola lewat terbit/nonaktif kode. */
  akunBersama: boolean;
  /**
   * Punya akses nyata ke ruang penyedia dana saat ini: peran `dana`, atau sesi
   * bersama yang masih memakai versi kode berlaku. Akun berperan warisan
   * bernilai false sampai admin memberinya akses.
   */
  aksesAktif: boolean;
  terdaftarPada: number;
  /**
   * Jumlah pinjaman yang didanai akun ini (model 1 pinjaman = 1 pendana),
   * hanya status berjalan (`didanai`) dan lunas (`lunas`).
   */
  jumlahPinjaman: number;
  /** Pokok seluruh pinjaman berjalan + lunas yang didanai akun ini. */
  totalDisalurkan: number;
  /** Pokok pinjaman yang belum kembali (status didanai = "Saldo Berjalan"). */
  saldoBerjalan: number;
  /** Jumlah peminjam berbeda yang pernah didanai akun ini. */
  jumlahPeminjam: number;
  jumlahAktif: number;
  jumlahLunas: number;
  /** Total bunga pinjaman berjalan + lunas (bruto, sebelum potongan admin). */
  totalBunga: number;
  /** Potongan admin atas bunga pinjaman akun ini. */
  keuntunganAdmin: number;
  /** Keuntungan bersih penyedia dana (bunga − potongan admin). */
  keuntunganPendana: number;
  /** Setoran yang sudah diverifikasi admin — rupiah bulat. */
  totalSetoran: number;
  setoranMenunggu: number;
  /** Penarikan yang sudah diproses admin — rupiah bulat. */
  totalPenarikan: number;
  penarikanMenunggu: number;
  /** Saldo dompet dari ledger internal (debit − kredit akun dompet dana). */
  saldoDompet: number;
  /** Waktu catatan terakhir milik akun ini — null bila belum ada aktivitas. */
  aktivitasTerakhir: number | null;
  /**
   * Rekap catatan transfer keuntungan penyedia dana. Kewajiban transfer hanya
   * dihitung dari pinjaman lunas (pinjaman berjalan belum jatuh tempo) —
   * terpisah dari transfer.
   */
  transfer: RekapTransferPendana;
};

/** Batas baris riwayat pada dialog rincian investor. */
const BATAS_RIWAYAT = 50;

/**
 * Kelola investor — panel admin.
 *
 * Menggabungkan daftar akun berakses ruang penyedia dana (email dengan peran
 * `dana`, plus pemantau kode akses bersama) dengan posisi dana masing-masing:
 * pokok yang bekerja, hak Imbal Hasil, setoran, penarikan, saldo dompet, dan
 * waktu aktivitas terakhir. Hanya admin (sesi TOTP) yang dapat membukanya, dan
 * modul ini tidak memuat satu pun mutation alokasi/transaksi.
 */
export const daftarInvestor = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    // Kebijakan potongan admin dibaca dari Pengaturan Sistem, bukan ditulis di kode.
    const cfg = await getConfig(ctx);

    const pengguna = await ctx.db.query("users").take(BATAS_AKUN + 1);
    const barisKode = await ctx.db
      .query("aksesBersama")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
      .first();
    const versiAktif = barisKode?.versi ?? 0;
    const akun = pengguna
      .filter(
        (u) =>
          peranPenyedia(u.role as string | undefined) || u.role === ROLES.PENGAMAT,
      )
      .slice(0, BATAS_AKUN);

    // Saldo dompet seluruh investor dihitung dari SATU pembacaan ledger, bukan
    // satu pemindaian per orang.
    const akunDompet = new Set(akun.map((u) => akunDompetDana(u._id)));
    const saldoPerAkun = new Map<string, number>();
    if (akunDompet.size > 0) {
      const entries = await ctx.db.query("ledger_entries").collect();
      for (const e of entries) {
        if (!akunDompet.has(e.akun)) continue;
        saldoPerAkun.set(
          e.akun,
          (saldoPerAkun.get(e.akun) ?? 0) + (e.arah === "debit" ? e.jumlah : -e.jumlah),
        );
      }
    }

    // Posisi dana dibaca dari model baru: satu pinjaman = satu pendana.
    // Baris alokasi lama (`fundings`/`kreditFundings`) tidak lagi menjadi
    // sumber angka panel — posisi pemilik dihitung dari `loans` berstatus
    // didanai/lunas, persis seperti rekap di ruang penyedia dana.
    const pinjamanBerposisi = (await ctx.db.query("loans").collect()).filter(
      (l) => l.status === "didanai" || l.status === "lunas",
    );

    // Seluruh catatan transfer dibaca SEKALI lalu dipetakan per pinjaman, supaya
    // rekap tiap akun tidak memicu pemindaian tabel sendiri-sendiri.
    const transferPerPinjaman = await petaTransfer(ctx);

    const rows: BarisInvestor[] = [];
    for (const u of akun) {      const setoran = await ctx.db
        .query("deposits")
        .withIndex("by_dana", (q) => q.eq("danaId", u._id))
        .collect();
      const penarikan = await ctx.db
        .query("withdrawals")
        .withIndex("by_dana", (q) => q.eq("danaId", u._id))
        .collect();

      // Kepemilikan pinjaman memakai aturan tunggal di `pendanaKepemilikan.ts`
      // supaya rekap admin, ruang penyedia dana, dan portofolio pendana sepakat.
      const namaKunci = kunciNamaPendana(u);
      const pinjaman = pinjamanBerposisi.filter((l) =>
        pinjamanMilikPendana(l, u._id, namaKunci),
      );

      // Bagi hasil tiap pinjaman dihitung dengan kebijakan yang berlaku
      // sekarang, dari pokok pinjaman (model 1 pinjaman = 1 pendana).
      let totalDisalurkan = 0;
      let saldoBerjalan = 0;
      let totalBunga = 0;
      let keuntunganAdmin = 0;
      let keuntunganPendana = 0;
      let jumlahAktif = 0;
      let jumlahLunas = 0;
      const peminjam = new Set<Id<"users">>();
      const waktuPinjaman: number[] = [];
      for (const l of pinjaman) {
        const bagi = bagiPinjamanAman(l.pokokPinjaman, l.persenBunga ?? cfg.persenBunga, cfg.persenAdmin);
        totalDisalurkan += l.pokokPinjaman;
        totalBunga += bagi.bunga;
        keuntunganAdmin += bagi.keuntunganAdmin;
        keuntunganPendana += bagi.keuntunganPendana;
        if (l.status === "lunas") {
          jumlahLunas += 1;
        } else {
          jumlahAktif += 1;
          saldoBerjalan += l.pokokPinjaman;
        }
        peminjam.add(l.userId);
        waktuPinjaman.push(l.didanaiPada ?? l.diajukanPada ?? l._creationTime);
      }

      const waktu = [
        ...waktuPinjaman,
        ...setoran.map((s) => s._creationTime),
        ...penarikan.map((w) => w._creationTime),
      ];

      const peran = (u.role as string | undefined) ?? null;
      const akunBersama = u.role === ROLES.PENGAMAT;
      rows.push({
        userId: u._id,
        nama: u.name ?? (akunBersama ? "Pemantau bersama" : "Penyedia dana"),
        email: u.email ?? null,
        emailTerverifikasi: u.emailVerificationTime !== undefined,
        peran,
        peranLegacy: peran === PERAN_PENDANA_LEGACY,
        akunBersama,
        aksesAktif:
          u.role === ROLES.DANA
            ? true
            : akunBersama && barisKode?.aktif === true && u.aksesBersamaVersi === versiAktif,
        terdaftarPada: u._creationTime,
        jumlahPinjaman: pinjaman.length,
        totalDisalurkan,
        saldoBerjalan,
        jumlahPeminjam: peminjam.size,
        jumlahAktif,
        jumlahLunas,
        totalBunga,
        keuntunganAdmin,
        keuntunganPendana,
        totalSetoran: setoran
          .filter((s) => s.status === "terverifikasi")
          .reduce((total, s) => total + s.jumlah, 0),
        setoranMenunggu: setoran.filter((s) => s.status === "menunggu_verifikasi").length,
        totalPenarikan: penarikan
          .filter((w) => w.status === "diproses")
          .reduce((total, w) => total + w.jumlah, 0),
        penarikanMenunggu: penarikan.filter((w) => w.status === "menunggu_proses").length,
        saldoDompet: saldoPerAkun.get(akunDompetDana(u._id)) ?? 0,
        aktivitasTerakhir: waktu.length === 0 ? null : Math.max(...waktu),
        // Catatan transfer per akun: hanya pinjaman lunas yang menjadi kewajiban
        // transfer — pinjaman berjalan belum jatuh tempo.
        transfer: rekapTransferPendana(
          pinjaman.map<PinjamanTransfer>((l) => ({
            status: l.status,
            keuntunganPendana: bagiPinjamanAman(
              l.pokokPinjaman,
              l.persenBunga ?? cfg.persenBunga,
              cfg.persenAdmin,
            ).keuntunganPendana,
            adaPendana: true,
            transfer: transferPerPinjaman.get(l._id) ?? ringkasTransfer([]),
          })),
        ),
      });
    }

    // Akun berperan warisan tanpa jejak dana apa pun (dan tanpa email sehingga
    // tidak bisa diberi akses) hanya akan memenuhi tabel tanpa guna. Akun seperti
    // itu disembunyikan dan jumlahnya dilaporkan terpisah.
    const terlihat = rows.filter(
      (r) =>
        !r.peranLegacy ||
        r.email !== null ||
        r.jumlahPinjaman > 0 ||
        r.totalSetoran > 0 ||
        r.totalPenarikan > 0 ||
        r.setoranMenunggu > 0 ||
        r.penarikanMenunggu > 0 ||
        r.saldoDompet !== 0,
    );
    const warisanTanpaJejak = rows.length - terlihat.length;
    rows.length = 0;
    rows.push(...terlihat);

    // Akun berakses lebih dulu, lalu yang dananya paling banyak bekerja;
    // akun berperan warisan diletakkan paling bawah.
    rows.sort(
      (a, b) =>
        Number(a.peranLegacy) - Number(b.peranLegacy) ||
        Number(a.akunBersama) - Number(b.akunBersama) ||
        b.saldoBerjalan - a.saldoBerjalan ||
        b.totalDisalurkan - a.totalDisalurkan,
    );

    return {
      batas: BATAS_AKUN,
      terpotong: pengguna.length > BATAS_AKUN,
      ringkasan: {
        jumlahAkun: rows.length,
        /** Akun yang benar-benar bisa membuka ruang penyedia dana saat ini. */
        jumlahAkses: rows.filter((r) => r.aksesAktif).length,
        jumlahPeranLegacy: rows.filter((r) => r.peranLegacy).length,
        /** Akun peran lama tanpa jejak dana & tanpa email — tidak ditampilkan. */
        jumlahWarisanTanpaJejak: warisanTanpaJejak,
        jumlahPemantau: rows.filter((r) => r.akunBersama).length,
        pemantauAktif: rows.filter((r) => r.akunBersama && r.aksesAktif).length,
        /** Kebijakan potongan admin yang berlaku (dari Pengaturan Sistem). */
        persenPotonganAdmin: cfg.persenAdmin,
        totalDisalurkan: rows.reduce((total, r) => total + r.totalDisalurkan, 0),
        saldoBerjalan: rows.reduce((total, r) => total + r.saldoBerjalan, 0),
        totalBunga: rows.reduce((total, r) => total + r.totalBunga, 0),
        keuntunganAdmin: rows.reduce((total, r) => total + r.keuntunganAdmin, 0),
        keuntunganPendana: rows.reduce((total, r) => total + r.keuntunganPendana, 0),
        persenBunga: cfg.persenBunga,
        saldoDompet: rows.reduce((total, r) => total + r.saldoDompet, 0),
        totalSetoran: rows.reduce((total, r) => total + r.totalSetoran, 0),
        setoranMenunggu: rows.reduce((total, r) => total + r.setoranMenunggu, 0),
        penarikanMenunggu: rows.reduce((total, r) => total + r.penarikanMenunggu, 0),
        /** Kewajiban transfer keuntungan pendana atas pinjaman yang sudah lunas. */
        keuntunganLunas: rows.reduce((total, r) => total + r.transfer.keuntunganLunas, 0),
        /** Bagian yang catatan transfernya sudah dibuat admin. */
        keuntunganTercatat: rows.reduce(
          (total, r) => total + r.transfer.keuntunganTercatat,
          0,
        ),
        /** Bagian yang belum ada catatan transfernya. */
        keuntunganBelumDicatat: rows.reduce(
          (total, r) => total + r.transfer.keuntunganBelumDicatat,
          0,
        ),
        /** Pinjaman lunas berpendana yang belum dicatat transfernya. */
        pinjamanBelumDicatat: rows.reduce(
          (total, r) => total + r.transfer.jumlahBelumDicatat,
          0,
        ),
      },
      rows,
    };
  },
});

/**
 * Rincian satu penyedia dana untuk dialog panel admin: identitas, portofolio
 * pinjaman yang didanai (model 1 pinjaman = 1 pendana), pembagian keuntungan
 * per pinjaman (bunga, total kewajiban, potongan admin, keuntungan penyedia),
 * setoran, penarikan, dan saldo dompet dari ledger. Hanya admin; tanpa mutation
 * apa pun.
 *
 * Seluruh angka bagi hasil dihitung dari pokok pinjaman dengan kebijakan yang
 * berlaku SEKARANG (persen bunga & potongan admin dari Pengaturan Sistem),
 * sama seperti rekap di ruang penyedia dana.
 */
export const rincianInvestor = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminSession(ctx);
    const cfg = await getConfig(ctx);
    const user = await ctx.db.get(userId);
    if (user === null) return null;

    const setoran = await ctx.db
      .query("deposits")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const penarikan = await ctx.db
      .query("withdrawals")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();

    // Portofolio dibaca dari model baru: satu pinjaman = satu pendana. Baris
    // alokasi lama tidak lagi menjadi sumber angka. Pengaitan memakai id
    // pendana langsung, dengan nama tampil (nama akun → email) sebagai
    // cadangan untuk baris lama tanpa id.
    const namaKunci = kunciNamaPendana(user);
    const transferPerPinjaman = await petaTransfer(ctx);
    const pinjaman = (await ctx.db.query("loans").collect())
      .filter((l) => l.status === "didanai" || l.status === "lunas")
      .filter((l) => pinjamanMilikPendana(l, userId, namaKunci))
      .map((l) => {
        const bagi = bagiPinjamanAman(l.pokokPinjaman, l.persenBunga ?? cfg.persenBunga, cfg.persenAdmin);
        return {
          loanId: l._id,
          referensi: l.nomorReferensi,
          status: l.status as string,
          pokokPinjaman: l.pokokPinjaman,
          bunga: bagi.bunga,
          totalLunas: bagi.totalLunas,
          potonganAdmin: bagi.potonganAdmin,
          keuntunganPendana: bagi.keuntunganPendana,
          keuntunganAdmin: bagi.keuntunganAdmin,
          waktu: l.didanaiPada ?? l.diajukanPada ?? l._creationTime,
          /** Catatan transfer keuntungan untuk pinjaman ini (status + nominal). */
          transfer: transferPerPinjaman.get(l._id) ?? ringkasTransfer([]),
        };
      });

    const urutTerbaru = <T extends { waktu: number }>(baris: T[]) =>
      baris.sort((a, b) => b.waktu - a.waktu).slice(0, BATAS_RIWAYAT);

    const rekapTransfer = rekapTransferPendana(
      pinjaman.map<PinjamanTransfer>((a) => ({
        status: a.status,
        keuntunganPendana: a.keuntunganPendana,
        adaPendana: true,
        transfer: a.transfer,
      })),
    );

    const ringkasKeuntungan = {
      persenPotonganAdmin: cfg.persenAdmin,
      persenBunga: cfg.persenBunga,
      pokok: pinjaman.reduce((total, a) => total + a.pokokPinjaman, 0),
      saldoBerjalan: pinjaman
        .filter((a) => a.status === "didanai")
        .reduce((total, a) => total + a.pokokPinjaman, 0),
      totalBunga: pinjaman.reduce((total, a) => total + a.bunga, 0),
      keuntunganAdmin: pinjaman.reduce((total, a) => total + a.keuntunganAdmin, 0),
      keuntunganPendana: pinjaman.reduce((total, a) => total + a.keuntunganPendana, 0),
    };

    return {
      userId,
      ringkasKeuntungan,
      nama: user.name ?? (user.role === ROLES.PENGAMAT ? "Pemantau bersama" : "Penyedia dana"),
      email: user.email ?? null,
      peran: (user.role as string | undefined) ?? null,
      peranLegacy: (user.role as string | undefined) === PERAN_PENDANA_LEGACY,
      akunBersama: user.role === ROLES.PENGAMAT,
      emailTerverifikasi: user.emailVerificationTime !== undefined,
      terdaftarPada: user._creationTime,
      saldoDompet: await danaWalletBalance(ctx, userId),
      /** Rekap catatan transfer keuntungan untuk akun ini. */
      transfer: rekapTransfer,
      pinjaman: urutTerbaru(pinjaman),
      setoran: urutTerbaru(
        setoran.map((s) => ({
          referensi: s.nomorReferensi,
          jumlah: s.jumlah,
          status: s.status as string,
          waktu: s._creationTime,
        })),
      ),
      penarikan: urutTerbaru(
        penarikan.map((w) => ({
          referensi: w.nomorReferensi,
          jumlah: w.jumlah,
          status: w.status as string,
          waktu: w._creationTime,
        })),
      ),
      batasRiwayat: BATAS_RIWAYAT,
    };
  },
});

/**
 * Beri/cabut akses ruang penyedia dana untuk satu akun (berdasarkan email).
 * Akses bersifat lihat saja: hanya mengubah peran akun, tanpa menyentuh
 * catatan pengajuan. Perubahan dicatat pada audit trail.
 */
/**
 * Akun berdasarkan alamat email: indeks `email` lebih dulu, lalu pencarian
 * terbatas untuk alamat yang tersimpan dengan huruf besar/kecil berbeda.
 */
async function cariAkunEmail(ctx: QueryCtx, email: string) {
  const dicari = email.trim().toLowerCase();
  if (dicari === "" || !dicari.includes("@")) return null;
  const lewatIndeks = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", dicari))
    .first();
  if (lewatIndeks !== null) return lewatIndeks;
  const semua = await ctx.db.query("users").take(500);
  return semua.find((u) => (u.email ?? "").toLowerCase() === dicari) ?? null;
}

export const ubahAkses = mutation({
  args: {
    email: v.string(),
    aktif: v.boolean(),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { email, aktif, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const dicari = email.trim().toLowerCase();
    if (dicari === "" || !dicari.includes("@")) {
      throw new Error("Masukkan alamat email akun yang valid.");
    }

    const target = await cariAkunEmail(ctx, dicari);
    if (target === null) {
      throw new Error(`Tidak ada akun dengan email ${dicari}.`);
    }
    if (target.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) sudah memiliki akses panel penuh.");
    }
    if (target.isAnonymous === true) {
      throw new Error(
        "Akun tamu tidak dapat diberi akses. Minta pengguna masuk dengan email terverifikasi.",
      );
    }

    if (aktif) {
      if (target.role === ROLES.DANA) return { ok: true, sudahSesuai: true };
      await ctx.db.patch(target._id, { role: ROLES.DANA });
    } else {
      if (target.role !== ROLES.DANA) return { ok: true, sudahSesuai: true };
      await ctx.db.patch(target._id, { role: undefined });
    }

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_akses_penyedia_dana",
      target.email ?? target.name ?? target._id,
      `${aktif ? "Memberi" : "Mencabut"} akses lihat saja ruang penyedia dana${
        alasan?.trim() ? ` — ${alasan.trim()}` : ""
      }`,
    );

    return { ok: true, sudahSesuai: false };
  },
});

/**
 * Super Admin mengoreksi data satu pinjaman langsung dari ruang penyedia dana
 * — termasuk menetapkan siapa pendananya (mis. pinjaman A didanai Robert atau
 * Asep), tujuan, tenor, dan nominal yang disetujui.
 *
 * Ini MURNI KOREKSI CATATAN: tidak ada saldo, `ledger_entries`, atau dompet
 * yang disentuh, dan `paymentGuard` tetap menutup seluruh perpindahan uang.
 * Pencairan/transfer tetap di luar aplikasi.
 *
 * Batas yang dijaga server (fail-closed):
 *  - hanya Super Admin dengan sesi TOTP terverifikasi (`requireAdminSession`);
 *  - pinjaman `lunas` tidak dapat diubah — posisinya sudah ditutup;
 *  - pendana harus akun beremail yang sudah berperan `dana`;
 *  - pelepasan pendana hanya untuk pinjaman yang belum pernah ditandai
 *    tersalurkan, supaya rekap tidak kehilangan pemilik dana secara diam-diam;
 *  - nominal disetujui tidak boleh melebihi pengajuan dan tidak dapat diubah
 *    setelah dana tersalurkan (`nominalTerkunci`);
 *  - setiap perubahan wajib beralasan dan dicatat di audit trail.
 */
export const ubahDataPinjaman = mutation({
  args: {
    loanId: v.id("loans"),
    /** Alasan koreksi — wajib, masuk audit trail. */
    alasan: v.string(),
    /** Email penyedia dana; `null`/kosong = lepas pendana dari pinjaman ini. */
    pendanaEmail: v.optional(v.union(v.string(), v.null())),
    tujuan: v.optional(v.string()),
    tenorHari: v.optional(v.number()),
    /** `null` = kembalikan ke skema harian. */
    tenorBulan: v.optional(v.union(v.number(), v.null())),
    pokokDisetujui: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const alasan = args.alasan.trim();
    if (alasan.length < 5 || alasan.length > 500) {
      throw new Error("Alasan perubahan wajib 5–500 karakter.");
    }
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Data pinjaman tidak ditemukan.");
    if (loan.status === "lunas") {
      throw new Error(
        "Pinjaman yang sudah lunas tidak dapat diubah — posisinya sudah ditutup.",
      );
    }

    const patch: {
      pendanaId?: Id<"users"> | undefined;
      pendanaNama?: string | undefined;
      tujuan?: string;
      tenorHari?: number;
      tenorBulan?: number | undefined;
      pokokPinjaman?: number;
    } = {};
    const perubahan: string[] = [];

    if (args.pendanaEmail !== undefined) {
        if (args.pendanaEmail === null || args.pendanaEmail.trim() === "") {
          if (loan.pendanaId !== undefined || loan.pendanaNama !== undefined) {
            if (nominalTerkunci(loan.status) || loan.didanaiPada !== undefined) {
              throw new Error(
                "Pendana pinjaman yang sudah ditandai tersalurkan tidak dapat dilepas — pilih penyedia dana lain sebagai pengganti.",
              );
            }
            patch.pendanaId = undefined;
            patch.pendanaNama = undefined;
            perubahan.push(`pendana dilepas (sebelumnya ${loan.pendanaNama ?? "tanpa nama"})`);
          }
        } else {
          const target = await cariAkunEmail(ctx, args.pendanaEmail);
          if (target === null) {
            throw new Error(`Tidak ada akun dengan email ${args.pendanaEmail.trim()}.`);
          }
          if (target.isAnonymous === true) {
            throw new Error("Akun tamu tidak dapat menjadi penyedia dana.");
          }
          if (target.role !== ROLES.DANA) {
            throw new Error(
              "Akun itu belum berperan penyedia dana. Beri akses lihat saja lebih dulu di panel admin.",
            );
          }
          const nama = target.name?.trim() || target.email || "Penyedia dana";
          if (loan.pendanaId !== target._id) {
            patch.pendanaId = target._id;
            patch.pendanaNama = nama;
            perubahan.push(`pendana → ${nama}`);
          }
        }
      }

      if (args.tujuan !== undefined) {
        const tujuan = args.tujuan.trim();
        if (tujuan.length < 3 || tujuan.length > 500) {
          throw new Error("Tujuan pinjaman wajib 3–500 karakter.");
        }
        if (tujuan !== loan.tujuan) {
          patch.tujuan = tujuan;
          perubahan.push("tujuan diperbarui");
        }
      }

      if (args.tenorHari !== undefined) {
        if (!Number.isSafeInteger(args.tenorHari) || args.tenorHari < 1 || args.tenorHari > 365) {
          throw new Error("Tenor harian harus 1–365 hari.");
        }
        if (args.tenorHari !== loan.tenorHari) {
          patch.tenorHari = args.tenorHari;
          perubahan.push(`tenor ${args.tenorHari} hari`);
        }
      }

      if (args.tenorBulan !== undefined) {
        if (args.tenorBulan === null) {
          if (loan.tenorBulan !== undefined) {
            patch.tenorBulan = undefined;
            perubahan.push("tenor kembali ke skema harian");
          }
        } else {
          if (
            !Number.isSafeInteger(args.tenorBulan) ||
            args.tenorBulan < 1 ||
            args.tenorBulan > 24
          ) {
            throw new Error("Tenor bulanan harus 1–24 bulan.");
          }
          if (args.tenorBulan !== loan.tenorBulan) {
            patch.tenorBulan = args.tenorBulan;
            perubahan.push(`tenor ${args.tenorBulan} bulan`);
          }
        }
      }

      if (args.pokokDisetujui !== undefined) {
        if (nominalTerkunci(loan.status)) {
          throw new Error(
            "Nominal tidak dapat diubah: dana pinjaman ini sudah tersalurkan.",
          );
        }
        const hasil = nominalDisetujui(
          loan.pokokDiajukan ?? loan.pokokPinjaman,
          args.pokokDisetujui,
        );
        if (!hasil.ok) throw new Error(hasil.alasan);
        if (hasil.nilai !== loan.pokokPinjaman) {
          patch.pokokPinjaman = hasil.nilai;
          perubahan.push(`pokok ${hasil.nilai}`);
        }
      }

      // Setelah perubahan disetujui, pindahkan baris-warisan yang masih
      // `dialokasikan` dari dana lama ke dana baru. Baris lama
      // `dibatalkan` di dataran lama (peran `dialokasikan_deduped` tidak
      // ada di skema), sehingga ruang alokasi tidak menghitung pinjaman dua
      // kali. Tidak dipanggil saat pendana tidak diganti.
      let danaIdLama: Id<"users"> | undefined;
      let danaIdBaru: Id<"users"> | undefined;
      if (args.pendanaEmail !== undefined && args.pendanaEmail !== null && args.pendanaEmail.trim() !== "") {
        const target = await cariAkunEmail(ctx, args.pendanaEmail);
        if (target !== null && target.role === ROLES.DANA && loan.pendanaId !== undefined) {
          danaIdLama = loan.pendanaId;
          danaIdBaru = target._id;
        }
      }

      if (perubahan.length === 0) return { ok: true, perubahan: [] as string[] };

      await ctx.db.patch(loan._id, patch);
      await audit(
        ctx,
        adminId,
        admin.email ?? admin.name ?? "admin",
        "ubah_data_pinjaman",
        loan.nomorReferensi,
        `${loan.namaLengkap} — ${perubahan.join(", ")}. Alasan: ${alasan}`,
      );
      if (danaIdLama !== undefined && danaIdBaru !== undefined && danaIdLama !== danaIdBaru) {
        await pindahAlokasiWarisan(ctx, loan._id, danaIdLama, danaIdBaru);
      }
      return { ok: true, perubahan };
  },
});

/**
 * Penyegaran: pindahkan baris-warisan `fundings` (pinjaman tunai) dari
 * dana lama ke dana baru untuk satu pinjaman, saat admin mengubah
 * `pendanaId`. Baris lama yang masih `dialokasikan` di dataran lama
 * dipindahkan ke dana baru dan ditandai `dibatalkan` di dataran lama
 * (nilai `dialokasikan_deduped` tidak ada di skema), sehingga ruang alokasi
 * tidak menghitung pinjaman dua kali. Saldo dompet, `ledger_entries`,
 * transfer, serta status pinjaman tidak disentuh: mutation ini tetap murni
 * koreksi catatan.
 */
async function pindahAlokasiWarisan(
  tx: MutationCtx,
  loanId: Id<"loans">,
  danaIdLama: Id<"users">,
  danaIdBaru: Id<"users">,
) {
  if (danaIdLama === danaIdBaru) return;

  // fundings (pinjaman tunai) — hanya baris yang baru `dialokasikan`
  // di dataran lama yang dimigrasikan; setelah dipindahkan mereka
  // `dibatalkan` di dana lama sehingga ruang alokasi tidak menghitung
  // pinjaman dua kali.
  const fundings = await tx.db.query("fundings")
    .withIndex("by_dana", (q) => q.eq("danaId", danaIdLama))
    .collect();
  for (const f of fundings) {
    if (f.danaId !== danaIdLama) continue;
    if (f.status !== "dialokasikan") continue;
    await tx.db.patch(f._id, {
      danaId: danaIdBaru,
      status: "dibatalkan",
    });
  }
}

/**
 * ==========================================================================
 * Pelacakan transfer keuntungan penyedia dana
 * ==========================================================================
 *
 * PINDAI TIDAK MEMINDAHKAN UANG. Seluruh mutation pembayaran tetap ditutup
 * `paymentGuard.rejectUnverifiedMoneyMovement()`. Yang dilakukan dua mutation di
 * bawah hanya MENCATAT bahwa admin sudah mentransfer keuntungan penyedia dana
 * di luar sistem, beserta referensi mutasinya. Gunanya: mencegah keuntungan yang
 * sama ditransfer (atau ditagih) dua kali, dan menyediakan jejak audit kapan dan
 * oleh siapa pencatatan itu dibuat.
 *
 * Karena itu tidak ada satu pun perubahan pada saldo, `ledger_entries`, status
 * pinjaman, maupun dompet penyedia dana. Membatalkan catatan juga tidak
 * mengembalikan uang apa pun — ia hanya menandai catatan itu salah.
 */

/** Baca seluruh catatan transfer satu pinjaman, lalu ringkas jadi satu status. */
async function ringkasTransferPinjaman(
  ctx: QueryCtx,
  loanId: Id<"loans">,
): Promise<RingkasTransfer> {    const baris = await ctx.db.query("transferPendana").collect();
  return ringkasTransfer(
    baris.map((b) => ({
      jumlah: b.jumlah,
      status: b.status as string,
      dicatatPada: b.dicatatPada,
      referensi: b.referensi ?? null,
      metode: b.metode as string,
      catatan: b.catatan ?? null,
      dicatatOlehLabel: b.dicatatOlehLabel,
      alasanBatal: b.alasanBatal ?? null,
    })),
  );
}

/**
 * Ringkas catatan transfer SELURUH pinjaman dalam satu pembacaan tabel — bukan
 * satu pemindaian per akun.
 */
async function petaTransfer(ctx: QueryCtx): Promise<Map<string, RingkasTransfer>> {
  const semua = await ctx.db.query("transferPendana").collect();
  const perPinjaman = new Map<string, TransferBaris[]>();
  for (const b of semua) {
    const daftar = perPinjaman.get(b.loanId) ?? [];
    daftar.push({
      jumlah: b.jumlah,
      status: b.status as string,
      dicatatPada: b.dicatatPada,
      referensi: b.referensi ?? null,
      metode: b.metode as string,
      catatan: b.catatan ?? null,
      dicatatOlehLabel: b.dicatatOlehLabel,
      alasanBatal: b.alasanBatal ?? null,
    });
    perPinjaman.set(b.loanId, daftar);
  }
  const peta = new Map<string, RingkasTransfer>();
  for (const [loanId, daftar] of perPinjaman) {
    peta.set(loanId, ringkasTransfer(daftar));
  }
  return peta;
}

export const catatTransferPendana = mutation({
  args: {
    loanId: v.id("loans"),
    metode: v.union(
      v.literal("transfer_bank"),
      v.literal("e_wallet"),
      v.literal("tunai"),
    ),
    /** Referensi mutasi bank/e-wallet atau catatan serah terima tunai. */
    referensi: v.optional(v.string()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, metode, referensi, catatan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");

    // Keuntungan penyedia dana baru jatuh tempo setelah kewajiban Peminjam
    // lunas. Pinjaman berjalan belum punya keuntungan untuk dicatat.
    if (loan.status !== "lunas") {
      throw new Error(
        "Keuntungan penyedia dana baru dapat dicatat setelah pinjaman berstatus lunas.",
      );
    }
    if (loan.pendanaId === undefined && loan.pendanaNama === undefined) {
      throw new Error("Pinjaman ini tidak memiliki penyedia dana.");
    }

    // Satu pinjaman = satu pendana, jadi hanya boleh ada satu catatan berlaku.
    // Catatan lama tidak dihapus — batalkan dulu bila salah.
    const sebelumnya = await ringkasTransferPinjaman(ctx, loanId);
    if (sebelumnya.status === "dicatat") {
      throw new Error(
        "Transfer pinjaman ini sudah dicatat. Batalkan catatan lama sebelum mencatat ulang.",
      );
    }

    // Nominal TIDAK diambil dari klien: dihitung ulang di server dari pokok
    // pinjaman dengan kebijakan yang berlaku, supaya satu angka klien yang
    // salah tidak pernah masuk catatan.
    const cfg = await getConfig(ctx);
    const bagi = bagiPinjamanAman(loan.pokokPinjaman, loan.persenBunga ?? cfg.persenBunga, cfg.persenAdmin);
    if (bagi.keuntunganPendana <= 0) {
      throw new Error("Keuntungan penyedia dana untuk pinjaman ini nol.");
    }

    const adminLabel = admin.email ?? admin.name ?? "admin";
    const sekarang = Date.now();
    await ctx.db.insert("transferPendana", {
      loanId,
      pendanaId: loan.pendanaId,
      pendanaNama: loan.pendanaNama ?? "Penyedia dana",
      nomorReferensiPinjaman: loan.nomorReferensi,
      jumlah: bagi.keuntunganPendana,
      metode,
      referensi: referensi?.trim() ? referensi.trim() : undefined,
      catatan: catatan?.trim() ? catatan.trim() : undefined,
      status: "dicatat",
      dicatatOleh: adminId,
      dicatatOlehLabel: adminLabel,
      dicatatPada: sekarang,
    });

    await audit(
      ctx,
      adminId,
      adminLabel,
      "catat_transfer_pendana",
      loan.nomorReferensi,
      `Mencatat transfer keuntungan penyedia dana ${bagi.keuntunganPendana} (${metode})${
        referensi?.trim() ? ` — referensi ${referensi.trim()}` : ""
      }. Catatan pembukuan, bukan bukti mutasi.`,
    );

    return { ok: true, jumlah: bagi.keuntunganPendana, waktu: sekarang };
  },
});

export const batalkanTransferPendana = mutation({
  args: {
    loanId: v.id("loans"),
    /** Wajib: alasan pembatalan masuk audit trail. */
    alasan: v.string(),
  },
  handler: async (ctx, { loanId, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const bersih = alasan.trim();
    if (bersih.length < 3) {
      throw new Error("Isi alasan pembatalan (minimal 3 karakter).");
    }

    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");

    const berlaku = await ctx.db
      .query("transferPendana")
      .collect()
      .then((rows) => rows.filter((r) => r.status === "dicatat"));
    if (berlaku.length === 0) {
      throw new Error("Tidak ada catatan transfer yang berlaku untuk dibatalkan.");
    }

    const adminLabel = admin.email ?? admin.name ?? "admin";
    const sekarang = Date.now();
    for (const baris of berlaku) {
      await ctx.db.patch(baris._id, {
        status: "dibatalkan",
        dibatalkanPada: sekarang,
        dibatalkanOlehLabel: adminLabel,
        alasanBatal: bersih,
      });
    }

    await audit(
      ctx,
      adminId,
      adminLabel,
      "batalkan_transfer_pendana",
      loan.nomorReferensi,
      `Membatalkan catatan transfer keuntungan penyedia dana — ${bersih}. Catatan dibatalkan tanpa mengubah saldo, ledger, atau status pinjaman.`,
    );

    return { ok: true, jumlahDibatalkan: berlaku.length };
  },
});
