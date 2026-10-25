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
 * sebagai teks.
 *
 * DOKUMEN IDENTITAS TIDAK PERNAH DIBAGIKAN KE RUANG INI. KTP, selfie dengan
 * KTP, bukti penghasilan, dan tanda tangan peminjam hanya dapat dibuka oleh
 * tim PINDAI yang berwenang lewat panel admin (`admin.dokumenKycUrls`, sesi
 * TOTP terverifikasi, tampil ber-watermark). Yang tersisa di sini hanya foto
 * BARANG jaminan (gadai) — foto benda, bukan identitas orang — dan pemanggilnya
 * tetap dibatasi `requireBerkasPemohon`.
 *
 * Titik lokasi terakhir peminjam dibuka lewat `lokasi`/`titikPeminjam`.
 * Setiap baris tetap membawa `kodePeminjam` (pseudonim acak dari
 * `peminjamCode.ts`) sebagai kunci stabil antar-ruang.
 *
 * Akses ditentukan peran akun: `dana` (penyedia dana), `pengamat` (sesi kode
 * akses bersama), atau `admin` untuk pratinjau. Admin
 * memberi/mencabut akses lewat `ubahAkses`, atau membuat akun pendana baru
 * siap-akses lewat `buatPendana`, dan setiap perubahan tercatat pada audit trail.
 *
 * CAKUPAN BARIS: akun `dana` hanya menerima alokasi ATAS NAMANYA SENDIRI — ruang
 * ini portofolio pribadinya, bukan papan perbandingan antarpendana. Total
 * pendanaan bersama maupun keuntungan pendana lain tidak pernah ikut terkirim.
 * Admin dan pemantau kode akses bersama tetap menerima seluruh baris. Batas ini
 * ditegakkan di server untuk SETIAP query ruang ini (`daftarPengajuan`,
 * `titikPeminjam`, `laporanTransferPendana`), bukan dengan menyembunyikan kolom
 * di layar.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { SLOT_AKSES_BERSAMA } from "./aksesBersama";
import { requireAdminSession } from "./adminAuthz";
import {
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  hakPendana,
  statusPendanaan as labelStatusPendanaan,
} from "../lib/imbalPendana";
import {
  hitungKepercayaan,
  riwayatDariPinjaman,
  type PinjamanRiwayat,
  type RingkasKepercayaan,
} from "../lib/kepercayaanPeminjam";
import {
  rekapTransferPendana,
  ringkasTransfer,
  type PinjamanTransfer,
  type RekapTransferPendana,
  type RingkasTransfer,
  type TransferBaris,
} from "../lib/transferPendana";
import { akunDompetDana, danaWalletBalance } from "./ledger";
import {
  dipindahKePendanaLain,
  kunciNamaPendana,
  pinjamanMilikPendana,
} from "./pendanaKepemilikan";
import { namaHurufBesar } from "../lib/nama";
import { nominalDisetujui, nominalTerkunci } from "../lib/statusPinjaman";
import { pelunasanPinjaman } from "../lib/loan";
import { quoteKreditBarang } from "../lib/kredit";
import { ROLES } from "./schema";
import { bulatkanTitikWilayah } from "../lib/geo";
import { normalisasiNomorWa } from "../lib/otpWa";
import { audit, getConfig } from "./system";
import { tautanBerkas } from "./berkas";
import { cairkanSetelahPendana } from "./loans";

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
  const jejakRows = await ctx.db
    .query("lokasiJejak")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(50);
  // Lewati titik yang ditulis perangkat admin saat pratinjau (lihat
  // `pratinjau._pulihkanJejakPratinjau`): titik itu bukan lokasi nasabah.
  const jejak = jejakRows.find((r) => r.dikecualikan === undefined) ?? null;
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

/** Snapshot tarif bulanan yang tersimpan pada kontrak (pinjaman/kredit). */
export type TarifBulananSnapshot = {
  persenBungaBulanan1: number;
  persenBungaBulanan3: number;
  persenBungaBulanan6: number;
  persenBungaBulanan9?: number;
  persenBungaBulanan12?: number;
  persenBiayaLayananBulanan: number;
  persenBiayaAdminCicilanBulanan: number;
};

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
  /** Centang cair ekspres dari peminjam; null = data lama (ekspres dipakai). */
  cairEkspres: boolean | null;
  /** Snapshot tarif potongan di muka; null = data lama (tarif bawaan). */
  tarifBiaya: {
    adminPersen: number;
    asuransiPersen: number;
    ekspres: { tier1: number; tier2: number; tier3: number };
  } | null;
  /**
   * Snapshot tarif bulanan kontrak. Detail ruang pendana memakainya supaya
   * jadwal yang terlihat sama dengan kontrak, bukan tarif Pengaturan Sistem
   * yang berlaku hari ini.
   */
  tarifBulanan: TarifBulananSnapshot | null;
  /** State perpanjangan: sisa pokok dan akumulasi bunga. */
  remainingPrincipal: number | null;
  bungaTerbayar: number | null;
  nextInterestAmount: number | null;
  tujuan: string;
  status: string;
  /** Waktu pengajuan tercatat (convex `_creationTime`). */
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Waktu pinjaman dicatat lunas — null selama belum lunas. */
  lunasPada: number | null;
  /**
   * Jatuh tempo pinjaman menurut mesin pelunasan — dipakai laporan pendana
   * sebagai proyeksi tanggal return. Null bila tenor/penjadwalan tidak terbaca.
   */
  jatuhTempoPada: number | null;
  /** Nama penyedia dana tunggal pinjaman ini — null bila belum didanai. */
  pendana: string | null;
  /** Imbal Hasil pendana TETAP = pokok × 30% (bukan bunga nasabah). */
  bunga: number;
  /** Pokok + Imbal Hasil tetap, sebelum biaya platform. */
  totalLunas: number;
  /** Potongan admin atas pinjaman ini (persen admin × pokok). */
  potonganAdmin: number;
  /** Keuntungan bersih penyedia dana = Imbal Hasil − potongan admin. */
  keuntunganPendana: number;
  /** Keuntungan admin atas pinjaman ini (sama dengan potongan admin). */
  keuntunganAdmin: number;
  /** Tenor acuan pendana, selalu 30 hari. */
  tenorPendanaHari: number;
  /** Yield acuan pendana, selalu 30%. */
  persenImbalPendana: number;
  /** Label status pendanaan: Aktif / Berjalan / Selesai / Cair. */
  statusPendanaan: string;
  /**
   * Status catatan transfer keuntungan pendana. Kewajibannya baru jatuh tempo
   * saat pinjaman lunas; catatan dibuat admin dan BUKAN bukti mutasi bank.
   */
  transfer: RingkasTransfer;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
  /**
   * Indeks kepercayaan peminjam — sinyal internal PINDAI, BUKAN skor kredit.
   *
   * Dihitung dari catatan yang sudah ada di aplikasi ini: riwayat pinjaman
   * tunai peminjam (lunas tepat waktu, terlambat, menunggak), kelengkapan data
   * diri tersimpan, dan terbitnya kode pseudonim. Riwayatnya diambil dari
   * maksimal `BATAS_BARIS` pinjaman terbaru yang dibaca halaman ini, jadi ia
   * ringkasan atas catatan yang benar-benar tersedia — bukan klaim total
   * sepanjang masa. Tidak pernah memuat NIK, rekening, atau isi data diri.
   */
  kepercayaan: RingkasKepercayaan;
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
  /**
   * Keuntungan bersih penyedia dana (bunga − potongan admin) dari SELURUH
   * pinjaman berjalan + lunas. Pecahannya dilaporkan terpisah di bawah: yang
   * sudah lunas (dibukukan) tidak boleh tercampur dengan yang masih berjalan
   * (proyeksi), karena uangnya belum masuk.
   */
  keuntunganPendana: number;
  /** Bagian yang sudah dibukukan — pinjaman berstatus lunas. */
  keuntunganPendanaLunas: number;
  /** Bagian proyeksi — pinjaman berjalan (didanai), belum lunas & belum dibukukan. */
  keuntunganPendanaBelumLunas: number;
  /** Potongan admin atas pinjaman penyedia dana ini (berjalan + lunas). */
  keuntunganAdmin: number;
  /** Bagian potongan admin dari pinjaman lunas (sudah dibukukan). */
  keuntunganAdminLunas: number;
  /** Bagian potongan admin dari pinjaman belum lunas (proyeksi). */
  keuntunganAdminBelumLunas: number;
  /** Pinjaman lunas yang keuntungannya sudah dicatat ditransfer admin. */
  transferTercatat: number;
  /** Pinjaman lunas yang catatan transfernya belum dibuat admin. */
  transferBelumDicatat: number;
  /** Nilai keuntungan pada pinjaman lunas yang belum dicatat transfernya. */
  keuntunganBelumDicatat: number;
  /**
   * Blok kredit barang milik pendana ini — terpisah dari kolom pinjaman tunai
   * karena tenor dan pencairannya berbeda (3–6 bulan, bukan siklus 30 hari).
   * Kosong bila pendana belum punya alokasi kredit.
   */
  kredit?: KreditPendana;
};

/** Satu alokasi kredit barang yang membentuk blok kredit pada satu pendana. */
export type RincianKreditPendana = {
  kreditId: Id<"kreditBarang">;
  nomorReferensi: string;
  namaBarang: string;
  tenorBulan: number;
  status: string;
  cicilanDibayar: number;
  /** Pokok yang ditanggung pendana pada alokasi ini. */
  pokok: number;
  /** Marjin kontrak yang proporsional dengan porsi alokasinya. */
  marginKontrak: number;
  /** Hak pendana yang sudah tercatat saat alokasi dibuat. */
  imbalPendana: number;
  /** Biaya admin platform yang proporsional dengan porsi alokasinya. */
  biayaPlatform: number;
};

/**
 * Ringkasan pendanaan KREDIT BARANG satu pendana.
 *
 * Marjin kredit saat ini dicatat SELURUHNYA sebagai hak pendana; platform
 * memperoleh biaya admin 2% di muka dan 2% dari setiap cicilan. Angka ini
 * sengaja dipisah dari rekap pinjaman tunai (yang marjinnya dibagi 47 : 13)
 * supaya dua model bagi hasil tidak tercampur dalam satu kolom.
 */
export type KreditPendana = {
  jumlahAlokasi: number;
  pokok: number;
  marginKontrak: number;
  imbalPendana: number;
  biayaPlatform: number;
  cicilanDibayar: number;
  cicilanTotal: number;
  baris: RincianKreditPendana[];
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
  /** Snapshot tarif bulanan kontrak; null = tarif bawaan saat dihitung. */
  tarifBulanan: TarifBulananSnapshot | null;
  status: string;
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana yang mencatat alokasi — null bila belum didanai. */
  pendana: string | null;
  /** Jumlah cicilan bulanan yang sudah tercatat (0..tenorBulan). */
  cicilanDibayar: number;
  /** Titik lokasi terakhir yang diketahui — null bila belum pernah terkirim. */
  lokasi: LokasiTitik | null;
};

/**
 * Hak pendana untuk satu pinjaman penuh; masukan tidak valid tidak merobohkan
 * halaman. Porsi pendana 47/60 dari marjin pinjaman (78,333…%).
 */
function bagiPendanaAman(
  pinjaman: {
    pokokPinjaman: number;
    tenorBulan?: number | null;
    persenBunga?: number | null;
    promoBungaPersenNormal?: number | null;
    bungaTerbayar?: number | null;
    nextInterestAmount?: number | null;
  },
  _persenAdmin: number,
) {
  try {
    const hak = hakPendana(pinjaman.pokokPinjaman, pinjaman);
    return {
      imbal: hak.imbal,
      potonganAdmin: hak.potonganAdmin,
      keuntunganPendana: hak.keuntungan,
    };
  } catch {
    return { imbal: 0, potonganAdmin: 0, keuntunganPendana: 0 };
  }
}

const MENUNGGU_PINJAMAN = new Set(["diajukan", "sedang_direview"]);
const MENUNGGU_GADAI = new Set(["diajukan", "sedang_dinilai"]);
const MENUNGGU_KREDIT = new Set(["diajukan", "sedang_ditinjau"]);

/**
 * Gerbang ruang penyedia dana. Tamu (anonim) dan akun tanpa peran `dana`/`admin`
 * selalu ditolak — pemeriksaan dilakukan di server, bukan hanya di UI.
 *
 * Diekspor supaya modul lain yang melayani ruang yang SAMA memakai gerbang yang
 * sama persis, bukan menyalin aturannya (lihat `convex/persetujuanRisiko.ts`).
 */
export async function requirePengamat(ctx: QueryCtx) {
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
 * Cakupan baris pembaca ruang pendana.
 *
 * Akun pendana menerima HANYA alokasi atas namanya: ruang ini portofolio
 * pribadinya, bukan papan perbandingan antarpendana. Angka pendana lain, total
 * pendanaan bersama, dan keuntungan yang bukan miliknya tidak pernah ikut
 * terkirim — batasnya ditegakkan di server, bukan dengan menyembunyikan kolom di
 * layar.
 *
 * Admin dan pemantau kode akses bersama menerima seluruh baris: membandingkan
 * dan merekonsiliasi semua pendana memang pekerjaan mereka.
 */
type CakupanPendana = { userId: Id<"users">; kunci: Set<string> } | null;

function cakupanPendana(user: Doc<"users">, userId: Id<"users">): CakupanPendana {
  return peranPenyedia(user.role as string | undefined)
    ? { userId, kunci: kunciNamaPendana(user) }
    : null;
}

/**
 * Pinjaman yang boleh dibaca satu pembaca.
 *
 * Admin dan pemantau membaca jendela terbaru seperti sebelumnya. Akun pendana
 * membaca indeks kepemilikan `by_pendana`, karena alokasinya bisa lebih tua
 * daripada 200 pengajuan terakhir orang lain — portofolio pribadi tidak boleh
 * kehilangan barisnya hanya karena ada pengajuan baru. Baris warisan yang belum
 * punya `pendanaId` tetap ikut lewat pencocokan nama yang sama dengan seluruh
 * aplikasi (`pinjamanMilikPendana`), ditambah baris alokasi lama (`fundings`)
 * milik akun ini: model alokasi lama memang belum pernah menulis `pendanaId`,
 * dan tanpa jalur itu portofolio pendana warisan tampil kosong. Baris yang sudah
 * dipindahkan ke pendana lain (`dipindahKePendanaLain`) sengaja dibuang, supaya
 * pinjaman tidak tertinggal di pendana lama.
 *
 * `riwayat` sengaja berisi jendela pinjaman yang lebih luas daripada `rows`:
 * indeks kepercayaan adalah penilaian atas PEMINJAM, jadi hitungannya harus sama
 * di mata semua pembaca, bukan berbeda menurut siapa yang mendanainya.
 */
async function bacaPinjaman(
  ctx: QueryCtx,
  cakupan: CakupanPendana,
): Promise<{ rows: Doc<"loans">[]; riwayat: Doc<"loans">[]; terpotong: boolean }> {
  const jendela = await ctx.db.query("loans").order("desc").take(BATAS_BARIS + 1);
  if (cakupan === null) {
    return { rows: jendela, riwayat: jendela, terpotong: jendela.length > BATAS_BARIS };
  }
  const milik = await ctx.db
    .query("loans")
    .withIndex("by_pendana", (q) => q.eq("pendanaId", cakupan.userId))
    .take(BATAS_BARIS + 1);
  const warisanNama = jendela.filter(
    (loan) =>
      loan.pendanaId === undefined && pinjamanMilikPendana(loan, cakupan.userId, cakupan.kunci),
  );
  // Alokasi model lama: `fundings.danaId` menunjuk pendananya, sementara
  // pinjamannya belum pernah diberi `pendanaId`/`pendanaNama`. Alokasi yang
  // dibatalkan (termasuk baris yang ditandai batal saat dipindahkan) bukan
  // miliknya lagi. `dipindahKePendanaLain` menjaga baris yang sudah punya
  // pemilik kanonik lain tetap keluar dari portofolio ini.
  const alokasiWarisan = await ctx.db
    .query("fundings")
    .withIndex("by_dana", (q) => q.eq("danaId", cakupan.userId))
    .collect();
  const idAlokasi = [
    ...new Set(
      alokasiWarisan
        .filter((f) => f.status !== "dibatalkan" && f.peranSiklus !== "putar")
        .map((f) => f.loanId),
    ),
  ];
  const warisanAlokasi = (
    await Promise.all(idAlokasi.map((id) => ctx.db.get(id)))
  ).filter(
    (loan): loan is Doc<"loans"> =>
      loan !== null && !dipindahKePendanaLain(loan, cakupan.userId),
  );
  const peta = new Map(
    [...warisanNama, ...warisanAlokasi, ...milik].map((loan) => [loan._id, loan]),
  );
  const semua = [...peta.values()].sort((a, b) => b._creationTime - a._creationTime);
  return {
    rows: semua.slice(0, BATAS_BARIS),
    riwayat: jendela,
    terpotong: semua.length > BATAS_BARIS,
  };
}

/**
 * Pinjaman milik satu akun penyedia dana yang sudah dicatat LUNAS.
 *
 * Dipakai pusat notifikasi supaya kabar "pinjaman yang Anda danai lunas" memakai
 * aturan kepemilikan yang SAMA dengan ruang pendana, bukan aturan kedua yang bisa
 * berbeda. Akun yang bukan penyedia dana menerima daftar kosong.
 */
export async function pinjamanLunasMilikPendana(
  ctx: QueryCtx,
  user: Doc<"users">,
  userId: Id<"users">,
): Promise<Doc<"loans">[]> {
  const cakupan = cakupanPendana(user, userId);
  if (cakupan === null) return [];
  const { rows } = await bacaPinjaman(ctx, cakupan);
  return rows.filter((loan) => loan.status === "lunas" && loan.lunasPada !== undefined);
}

/**
 * Kredit barang yang alokasinya atas nama satu pendana, terbaru lebih dulu.
 *
 * Dibaca dari id alokasinya, bukan dari jendela 200 baris terbaru: alokasinya
 * bisa lebih tua daripada itu, dan portofolio pribadi harus lengkap. Alokasi
 * `selesai` tetap miliknya (kredit yang sudah lunas tetap bagian portofolio);
 * hanya alokasi `dibatalkan` yang keluar.
 */
async function kreditMilikPendana(
  ctx: QueryCtx,
  cakupan: NonNullable<CakupanPendana>,
): Promise<Doc<"kreditBarang">[]> {
  const alokasi = await ctx.db
    .query("kreditFundings")
    .withIndex("by_dana", (q) => q.eq("danaId", cakupan.userId))
    .collect();
  // `selesai` ikut: alokasi yang sudah dibayar lunas tetap bagian portofolio
  // pendana, hanya alokasi yang dibatalkan yang tidak lagi miliknya.
  const idMilik = [
    ...new Set(
      alokasi.filter((f) => f.status !== "dibatalkan").map((f) => f.kreditId),
    ),
  ];

  const dokumen = await Promise.all(idMilik.map((id) => ctx.db.get(id)));
  return dokumen
    .filter((k): k is Doc<"kreditBarang"> => k !== null)
    .sort((a, b) => b._creationTime - a._creationTime);
}

/**
 * Isi ruang penyedia dana untuk satu pembaca, TANPA gerbang sesi.
 *
 * Dipisah dari query-nya supaya laporan PDF (`convex/laporanPendana.ts`)
 * memakai perhitungan yang sama persis dengan layar. Laporan yang angkanya
 * berbeda sedikit dari ruang penyedia dana akan membuat pemiliknya meragukan
 * kedua tempat sekaligus, jadi tidak boleh ada versi hitungan kedua.
 *
 * Pemanggil WAJIB sudah memastikan pembacanya berhak: query memakai
 * `requirePengamat`, laporan memakai `peranPenyedia` atas akun penerimanya.
 */
export async function ruangPendana(ctx: QueryCtx, user: Doc<"users">) {
  // Presisi penuh hanya untuk panel admin. Ruang penyedia dana/pengamat
    // menerima koordinat tingkat wilayah (≈1 km) supaya peta tetap berguna
    // tanpa membuka lokasi presisi seorang peminjam kepada pihak luar.
    const presisiPenuh = user.role === ROLES.ADMIN;
    // Kebijakan bunga & potongan admin dibaca dari Pengaturan Sistem.
    const cfg = await getConfig(ctx);
    // Patokan waktu untuk penilaian kepercayaan: jam server saat query dibaca.
    const sekarang = Date.now();

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
    // Sebagian baris alokasi lama menyimpan id penyedia dengan nama field lain
    // (`pendanaId`, peninggalan bentuk sebelum `danaId`). Dibaca toleran supaya
    // satu baris bentuk lama tidak pernah merobohkan seluruh halaman.
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
      const mentah = await lokasiPerangkat(ctx, userId);
      const titik =
        mentah === null || presisiPenuh ? mentah : bulatkanTitikWilayah(mentah);
      lokasiCache.set(userId, titik);
      return titik;
    }    // Catatan transfer dibaca SEKALI, dipetakan per pinjaman untuk seluruh baris.
    const transferPerPinjaman = await petaTransfer(ctx);

    const cakupan = cakupanPendana(user, user._id);
    const pinjamanBaca = await bacaPinjaman(ctx, cakupan);
    const pinjamanMentah = pinjamanBaca.rows;
    /**
     * Gadai tidak pernah didanai pendana (tidak ada tabel alokasi untuk pawns),
     * jadi portofolio pendana tidak punya baris gadai. Menampilkannya berarti
     * memperlihatkan pengajuan orang lain sebagai bagian dari portofolionya.
     */
    const gadaiMentah =
      cakupan === null ? await ctx.db.query("pawns").order("desc").take(BATAS_BARIS + 1) : [];
    const kreditMentah =
      cakupan === null
        ? await ctx.db.query("kreditBarang").order("desc").take(BATAS_BARIS + 1)
        : await kreditMilikPendana(ctx, cakupan);

    // ---- Indeks kepercayaan peminjam ------------------------------------
    // Riwayat dikelompokkan dari jendela pinjaman yang sudah dibaca di atas
    // (`riwayat`, bukan `rows`): indeks kepercayaan menilai PEMINJAM, jadi
    // angkanya tidak boleh berubah menurut siapa yang membuka halaman. Tidak ada
    // pembacaan riwayat per baris; kelengkapan data diri dibaca sekali per
    // peminjam, dan hasilnya di-cache per peminjam juga.
    const pinjamanPerPeminjam = new Map<Id<"users">, PinjamanRiwayat[]>();
    for (const loan of pinjamanBaca.riwayat) {
      const baris: PinjamanRiwayat = {
        status: loan.status,
        didanaiPada: loan.didanaiPada ?? null,
        lunasPada: loan.lunasPada ?? null,
        tenorHari: loan.tenorHari ?? null,
        tenorBulan: loan.tenorBulan ?? null,
      };
      const daftar = pinjamanPerPeminjam.get(loan.userId);
      if (daftar === undefined) pinjamanPerPeminjam.set(loan.userId, [baris]);
      else daftar.push(baris);
    }

    /** Apakah peminjam sudah menyimpan data diri (KTP, alamat, pekerjaan)? */
    const dataDiriCache = new Map<Id<"users">, boolean>();
    async function punyaDataDiri(userId: Id<"users">): Promise<boolean> {
      const cached = dataDiriCache.get(userId);
      if (cached !== undefined) return cached;
      const profil = await ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      const ada = profil !== null;
      dataDiriCache.set(userId, ada);
      return ada;
    }

    const kepercayaanCache = new Map<Id<"users">, RingkasKepercayaan>();
    async function kepercayaanUntuk(userId: Id<"users">): Promise<RingkasKepercayaan> {
      const cached = kepercayaanCache.get(userId);
      if (cached !== undefined) return cached;
      const hasil = hitungKepercayaan(
        riwayatDariPinjaman(pinjamanPerPeminjam.get(userId) ?? [], {
          sekarang,
          dataDiriLengkap: await punyaDataDiri(userId),
          punyaKodePeminjam: (await kodeUntuk(userId)) !== null,
        }),
      );
      kepercayaanCache.set(userId, hasil);
      return hasil;
    }

    const pinjaman: BarisPinjaman[] = [];
    for (const loan of pinjamanMentah.slice(0, BATAS_BARIS)) {
      const bagi = bagiPendanaAman(loan, cfg.persenAdmin);
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
        cairEkspres: loan.cairEkspres ?? null,
        tarifBiaya: loan.tarifBiaya ?? null,
        tarifBulanan: loan.tarifBulanan ?? null,
        remainingPrincipal: loan.remainingPrincipal ?? null,
        bungaTerbayar: loan.bungaTerbayar ?? null,
        nextInterestAmount: loan.nextInterestAmount ?? null,
        tujuan: loan.tujuan,
        status: loan.status,
        diajukanPada: loan.diajukanPada ?? loan._creationTime,
        didanaiPada: loan.didanaiPada ?? null,
        lunasPada: loan.lunasPada ?? null,
        jatuhTempoPada:
          pelunasanPinjaman(loan, sekarang, cfg.persenDendaKeterlambatan)
            ?.jatuhTempoPada ?? null,
        pendana,
        bunga: bagi.imbal,
        totalLunas: loan.pokokPinjaman + bagi.imbal,
        potonganAdmin: bagi.potonganAdmin,
        keuntunganPendana: bagi.keuntunganPendana,
        keuntunganAdmin: bagi.potonganAdmin,
        tenorPendanaHari: TENOR_PENDANA_HARI,
        persenImbalPendana: PERSEN_IMBAL_PENDANA,
        statusPendanaan: labelStatusPendanaan("dialokasikan", loan.status),
        transfer: transferPerPinjaman.get(loan._id) ?? ringkasTransfer([]),
        kepercayaan: await kepercayaanUntuk(loan.userId),
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
    /** Blok kredit per nama pendana — dipasang ke baris rekap setelah dihitung. */
    const kreditPerPendana = new Map<string, KreditPendana>();
    for (const item of kreditMentah.slice(0, BATAS_BARIS)) {
      // Progres cicilan dibaca dari baris pembayaran, bukan disimpan di
      // pengajuan: satu sumber angka untuk tabel, detail, dan portofolio.
      const cicilan = await ctx.db
        .query("kreditPayments")
        .withIndex("by_kredit", (q) => q.eq("kreditId", item._id))
        .collect();

      // Rincian uang kredit dibaca dari mesin quote yang sama dengan kontrak.
      // Data warisan di luar rentang skema tidak merobohkan halaman: barisnya
      // tetap tampil, blok uangnya dilewati.
      let quoteKredit: ReturnType<typeof quoteKreditBarang> | null = null;
      try {
        quoteKredit = quoteKreditBarang({
          hargaBarang: item.hargaBarang,
          dpPersen: item.dpPersen,
          tenorBulan: item.tenorBulan,
          marginPersenPerBulan: item.marginPersenPerBulan,
          tarif: item.tarifBulanan ?? null,
        });
      } catch {
        quoteKredit = null;
      }

      if (quoteKredit !== null) {
        const alokasi = await ctx.db
          .query("kreditFundings")
          .withIndex("by_kredit", (q) => q.eq("kreditId", item._id))
          .collect();
        const biayaPlatformKontrak =
          quoteKredit.biayaAdmin + quoteKredit.biayaAdminCicilanTotal;
        for (const f of alokasi) {
          if (f.status === "dibatalkan") continue;
          const nama = await namaPenyedia(f.danaId);
          if (nama === null) continue;
          const porsi = (angka: number) =>
            quoteKredit!.pokokDibiayai > 0
              ? Math.floor(
                  (angka * f.jumlahAlokasi) / quoteKredit!.pokokDibiayai,
                )
              : 0;
          const blok = kreditPerPendana.get(nama) ?? {
            jumlahAlokasi: 0,
            pokok: 0,
            marginKontrak: 0,
            imbalPendana: 0,
            biayaPlatform: 0,
            cicilanDibayar: 0,
            cicilanTotal: 0,
            baris: [],
          };
          blok.jumlahAlokasi += 1;
          blok.pokok += f.jumlahAlokasi;
          blok.marginKontrak += porsi(quoteKredit.marginTotal);
          blok.imbalPendana += f.imbalHasil;
          blok.biayaPlatform += porsi(biayaPlatformKontrak);
          blok.cicilanDibayar += cicilan.length;
          blok.cicilanTotal += item.tenorBulan;
          blok.baris.push({
            kreditId: item._id,
            nomorReferensi: item.nomorReferensi,
            namaBarang: item.namaBarang,
            tenorBulan: item.tenorBulan,
            status: item.status,
            cicilanDibayar: cicilan.length,
            pokok: f.jumlahAlokasi,
            marginKontrak: porsi(quoteKredit.marginTotal),
            imbalPendana: f.imbalHasil,
            biayaPlatform: porsi(biayaPlatformKontrak),
          });
          kreditPerPendana.set(nama, blok);
        }
      }

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
        tarifBulanan: item.tarifBulanan ?? null,
        status: item.status,
        diajukanPada: item._creationTime,
        didanaiPada: item.didanaiPada ?? null,
        pendana:
          item.didanaiPada === undefined ? null : await pendanaKredit(item._id),
        cicilanDibayar: cicilan.length,
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
          keuntunganPendanaLunas: 0,
          keuntunganPendanaBelumLunas: 0,
          keuntunganAdmin: 0,
          keuntunganAdminLunas: 0,
          keuntunganAdminBelumLunas: 0,
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
      // Keuntungan pinjaman yang BELUM lunas dilaporkan terpisah dari yang sudah
      // lunas: yang lunas sudah dibukukan ledger, yang berjalan masih proyeksi.
      if (b.status === "lunas") {
        r.keuntunganPendanaLunas += b.keuntunganPendana;
        r.keuntunganAdminLunas += b.keuntunganAdmin;
      } else {
        r.keuntunganPendanaBelumLunas += b.keuntunganPendana;
        r.keuntunganAdminBelumLunas += b.keuntunganAdmin;
      }
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
    // Blok kredit ditempelkan ke baris pendana yang sudah ada. Pendana yang
    // HANYA punya alokasi kredit barang tetap mendapat baris — kalau tidak,
    // portofolio pribadinya kosong dan posisinya tidak pernah terlihat di
    // ruang pendana. Kolom pinjaman tunainya nol; blok kreditnya yang menjelaskan
    // mengapa baris itu ada.
    for (const r of rekapPendana) {
      const blok = kreditPerPendana.get(r.nama);
      if (blok !== undefined) r.kredit = blok;
    }
    for (const [nama, blok] of kreditPerPendana) {
      if (rekapPendana.some((r) => r.nama === nama)) continue;
      rekapPendana.push({
        nama,
        jumlahPinjaman: 0,
        jumlahAktif: 0,
        jumlahLunas: 0,
        totalDisalurkan: 0,
        saldoBerjalan: 0,
        totalBunga: 0,
        keuntunganPendana: 0,
        keuntunganPendanaLunas: 0,
        keuntunganPendanaBelumLunas: 0,
        keuntunganAdmin: 0,
        keuntunganAdminLunas: 0,
        keuntunganAdminBelumLunas: 0,
        transferTercatat: 0,
        transferBelumDicatat: 0,
        keuntunganBelumDicatat: 0,
        kredit: blok,
      });
    }
    rekapPendana.sort(
      (a, b) =>
        b.totalDisalurkan - a.totalDisalurkan ||
        (b.kredit?.pokok ?? 0) - (a.kredit?.pokok ?? 0),
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
      /**
       * Pecahan keuntungan di atas. "Sudah lunas" = uang yang benar-benar sudah
       * masuk (dibukukan saat pelunasan); "belum lunas" = proyeksi atas pinjaman
       * yang masih berjalan, belum dibukukan.
       */
      totalKeuntunganPendanaLunas: rekapPendana.reduce(
        (total, r) => total + r.keuntunganPendanaLunas,
        0,
      ),
      totalKeuntunganPendanaBelumLunas: rekapPendana.reduce(
        (total, r) => total + r.keuntunganPendanaBelumLunas,
        0,
      ),
      totalKeuntunganAdminLunas: rekapPendana.reduce(
        (total, r) => total + r.keuntunganAdminLunas,
        0,
      ),
      totalKeuntunganAdminBelumLunas: rekapPendana.reduce(
        (total, r) => total + r.keuntunganAdminBelumLunas,
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
        pinjaman: pinjamanBaca.terpotong,
        gadai: gadaiMentah.length > BATAS_BARIS,
        kredit: kreditMentah.length > BATAS_BARIS,
      },
      ringkasan,
      rekapPendana,
      pinjaman,
      gadai,
      kredit,
    };
}

/**
 * Satu query untuk seluruh halaman: tiga daftar pengajuan + ringkasannya.
 * Baris dibatasi `BATAS_BARIS` per kategori dan diambil dari yang terbaru agar
 * payload tetap ringan; pemanggil menerima penanda `terpotong`.
 *
 * Untuk akun pendana, seluruh angka di query ini (rekap, ringkasan, dan
 * daftar) dihitung dari baris yang sudah dibatasi cakupan di atas.
 */
export const daftarPengajuan = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requirePengamat(ctx);
    return await ruangPendana(ctx, user);
  },
});

/**
 * Nomor WhatsApp tempat laporan PDF pendana dikirim.
 *
 * Dibaca sebagai query terpisah dari `daftarPengajuan`: kartu kontak hanya
 * butuh satu nilai, sedangkan tabel pengajuan adalah payload besar. Menyatukan
 * keduanya berarti setiap kali pendana menyimpan nomornya, seluruh tabel ikut
 * dimuat ulang.
 *
 * `null` untuk pembaca yang bukan pemilik akun pendana (admin dan sesi kode
 * akses bersama tidak punya laporan untuk diri mereka sendiri).
 */
export const kontakLaporanSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || !peranPenyedia(user.role as string | undefined)) return null;
    return { nomorWhatsApp: user.nomorWhatsApp ?? null };
  },
});

/**
 * Simpan nomor WhatsApp laporan milik AKUN YANG SEDANG MASUK.
 *
 * Hanya akun pendana sendiri yang boleh mengubahnya: nomor ini menentukan ke
 * mana laporan kinerjanya dikirim, jadi tidak ada pihak lain yang boleh
 * mengalihkannya. Mengosongkan isian menghapus nomornya, dan sesudah itu tidak
 * ada laporan yang dikirim sampai pemiliknya mengisinya lagi — lebih baik
 * daripada mengirim laporan keuangan ke nomor lama yang mungkin bukan miliknya.
 *
 * Nomor dinormalkan ke bentuk internasional lewat aturan yang sama dengan
 * seluruh aplikasi (`lib/otpWa`): nomor Indonesia menjadi `62…`, nomor negara
 * lain disimpan dengan kode negaranya sendiri. Dengan begitu satu nomor tidak
 * tersimpan dalam dua bentuk, termasuk nomor pendana di luar Indonesia.
 */
export const simpanKontakLaporan = mutation({
  args: { nomor: v.string() },
  handler: async (ctx, { nomor }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Pengguna tidak ditemukan.");
    if (!peranPenyedia(user.role as string | undefined)) {
      throw new Error("Hanya akun penyedia dana yang menyimpan nomor laporan.");
    }

    const bersih = nomor.trim();
    if (bersih === "") {
      if (user.nomorWhatsApp !== undefined) await ctx.db.patch(userId, { nomorWhatsApp: undefined });
      return { nomorWhatsApp: null };
    }

    const normal = normalisasiNomorWa(bersih);
    if (normal === null) {
      throw new Error(
        "Nomor WhatsApp tidak dikenali. Tulis nomor Indonesia (mis. 0812 3456 7890) atau nomor luar Indonesia dengan kode negaranya (mis. +49 151 2345678).",
      );
    }
    // Nomor ini juga menjadi pintu masuk OTP. Bila dipakai akun lain, login
    // WhatsApp tidak bisa menentukan akun yang benar, jadi tolak di sini.
    const pemakai = await cariAkunNomor(ctx, normal);
    if (pemakai !== null && pemakai._id !== userId) {
      throw new Error(
        `Nomor ${samarkanNomor(normal)} sudah dipakai akun lain. Satu nomor hanya dapat menjadi pintu masuk satu akun.`,
      );
    }
    const berubah = normal !== (user.nomorWhatsApp ?? "");
    if (berubah) await ctx.db.patch(userId, { nomorWhatsApp: normal });
    return { nomorWhatsApp: normal };
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
    const { userId, user } = await requirePengamat(ctx);
    // Lihat daftarPengajuan: peta ruang penyedia dana memakai tingkat wilayah.
    const presisiPenuh = user.role === ROLES.ADMIN;
    const cfg = await getConfig(ctx);
    // Peta mengikuti cakupan pembaca yang sama dengan daftarnya: akun pendana
    // hanya melihat peminjam yang pinjamannya atas namanya, bukan seluruh
    // peminjam PINDAI.
    const cakupan = cakupanPendana(user, userId);

    const [pinjamanBaca, pawns, kredit] = await Promise.all([
      bacaPinjaman(ctx, cakupan),
      cakupan === null
        ? ctx.db.query("pawns").order("desc").take(BATAS_PETA + 1)
        : Promise.resolve([] as Doc<"pawns">[]),
      cakupan === null
        ? ctx.db.query("kreditBarang").order("desc").take(BATAS_PETA + 1)
        : kreditMilikPendana(ctx, cakupan),
    ]);
    const loans = pinjamanBaca.rows;

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
      const mentah = await lokasiPerangkat(ctx, userId);
      if (mentah === null) {
        tanpaTitik += 1;
        return;
      }
      const posisi = presisiPenuh ? mentah : bulatkanTitikWilayah(mentah);
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
 * Berkas NON-IDENTITAS pengajuan untuk dialog Detail: hanya foto barang
 * jaminan (gadai).
 *
 * Dokumen identitas peminjam — KTP, selfie dengan KTP, bukti penghasilan,
 * dan tanda tangan — SENGAJA tidak pernah ada di sini. Pemegang akses "lihat
 * saja" (termasuk penyedia dana beremail) tidak berhak atas dokumen identitas
 * mentah; permintaan berkas identitas hanya lewat panel admin yang ber-watermark
 * dan tercatat (`admin.dokumenKycUrls`). Bila tidak ada berkas yang boleh
 * ditampilkan, `catatan` menjelaskan alasannya alih-alih mengosongkannya diam-diam.
 *
 * Sengaja dipisah dari `daftarPengajuan` supaya payload daftar tetap ringan dan
 * berkas hanya diambil saat benar-benar dibuka.
 */
export type BerkasPengajuan = {
  jenis: "pinjaman" | "gadai" | "kredit";
  /** Berkas non-identitas saja (foto barang jaminan). */
  berkas: { label: string; url: string }[];
  catatan: string | null;
};

/** Kalimat tetap untuk menjelaskan kenapa dokumen identitas tidak tampil di sini. */
const CATATAN_IDENTITAS_KHUSUS_ADMIN =
  "Dokumen identitas pemohon (KTP, selfie dengan KTP, bukti penghasilan, tanda tangan) " +
  "hanya dapat dibuka oleh tim PINDAI yang berwenang melalui panel admin — " +
  "tidak pernah dibagikan ke ruang penyedia dana.";

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
        catatan:
          "Pengajuan kredit barang tidak menyimpan berkas gambar di PINDAI — hanya data pemohon dan rincian barang.",
      };
    }

    if (jenis === "gadai") {
      const pawnId = ctx.db.normalizeId("pawns", id);
      if (pawnId === null) return null;
      const pawn = await ctx.db.get(pawnId);
      if (pawn === null) return null;
      const foto = await tautanBerkas(pawn.fotoBarangId);
      const berkas = foto === null ? [] : [{ label: "Foto barang", url: foto }];
      return {
        jenis,
        berkas,
        catatan:
          berkas.length === 0
            ? `Belum ada foto barang yang tersimpan untuk pengajuan gadai ini. ${CATATAN_IDENTITAS_KHUSUS_ADMIN}`
            : CATATAN_IDENTITAS_KHUSUS_ADMIN,
      };
    }

    const loanId = ctx.db.normalizeId("loans", id);
    if (loanId === null || (await ctx.db.get(loanId)) === null) return null;
    // Pinjaman tunai tidak punya berkas non-identitas: seluruh dokumennya
    // (KTP, selfie, slip, tanda tangan) adalah data pribadi peminjam.
    return { jenis, berkas: [], catatan: CATATAN_IDENTITAS_KHUSUS_ADMIN };
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

/**
 * Apakah peran akun ini pemilik portofolio pendana?
 *
 * Diekspor supaya modul laporan memakai definisi "akun pendana" yang sama dengan
 * ruangnya, termasuk akun warisan berperan `pendana` yang alokasinya masih nyata.
 */
export function peranPenyedia(role: string | undefined): boolean {
  return role === ROLES.DANA || role === PERAN_PENDANA_LEGACY;
}

/**
 * Nama tampil pendana: nama akun → email → label generik.
 *
 * Diekspor supaya laporan PDF menyebut pendananya dengan nama yang sama seperti
 * di ruang penyedia dana, bukan aturan penamaan kedua.
 */
export function namaTampilPendana(
  nama: string | null | undefined,
  email: string | null | undefined,
): string {
  const bersih = nama?.trim();
  return bersih !== undefined && bersih !== "" ? bersih : (email ?? "Penyedia dana");
}

/**
 * Semua akun yang PERNAH menjadi pendana: punya posisi (`loans.pendanaId`),
 * namanya cocok dengan `pendanaNama` warisan, atau berperan penyedia dana
 * (`dana`/`pendana`). Dipakai panel koreksi admin supaya seluruh pendana lama
 * tetap bisa dipilih sebagai pengganti — bukan hanya akun berperan `dana`
 * beremail. Akun tamu & tim (admin) tidak pernah masuk daftar ini.
 */
async function akunPernahJadiPendana(
  ctx: QueryCtx,
): Promise<
  Map<
    Id<"users">,
    { nama: string; email: string | null; peran: string | null; aksesAktif: boolean }
  >
> {
  const loans = await ctx.db.query("loans").collect();
  const idPosisi = new Set<string>();
  const namaPosisi = new Set<string>();
  for (const l of loans) {
    if (l.pendanaId !== undefined) idPosisi.add(l.pendanaId);
    const nm = l.pendanaNama?.trim();
    if (nm !== undefined && nm !== "") namaPosisi.add(nm);
  }

  const pengguna = await ctx.db.query("users").take(BATAS_AKUN + 1);
  const peta = new Map<
    Id<"users">,
    { nama: string; email: string | null; peran: string | null; aksesAktif: boolean }
  >();
  for (const u of pengguna) {
    if (u.isAnonymous === true || u.role === ROLES.ADMIN) continue;
    const nama = u.name?.trim();
    const punyaPosisi =
      idPosisi.has(u._id) ||
      (nama !== undefined && nama !== "" && namaPosisi.has(nama)) ||
      (u.email !== undefined && namaPosisi.has(u.email));
    if (!peranPenyedia(u.role as string | undefined) && !punyaPosisi) continue;
    peta.set(u._id, {
      nama: namaTampilPendana(u.name, u.email),
      email: u.email ?? null,
      peran: (u.role as string | undefined) ?? null,
      aksesAktif: u.role === ROLES.DANA,
    });
  }
  return peta;
}

export type BarisInvestor = {
  userId: Id<"users">;
  nama: string;
  email: string | null;
  emailTerverifikasi: boolean;
  /** Nomor WhatsApp terdaftar; dipakai juga sebagai pintu masuk OTP. */
  nomorWhatsApp: string | null;
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
  /**
   * Total Imbal Hasil pinjaman berjalan + lunas (bruto). Potongan admin tidak
   * diambil dari angka ini saja — dasarnya adalah pokok + Imbal Hasil
   * (lihat kebijakan di lib/bagiHasil.ts).
   */
  totalBunga: number;
  /** Potongan admin dari pokok pinjaman akun ini. */
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
 * Kandidat pendana untuk dialog koreksi admin — SEMUA akun yang pernah menjadi
 * pendana (peran penyedia dana, punya posisi pinjaman, atau nama warisan yang
 * cocok). Inilah daftar yang muncul di dropdown "Pendana" agar admin bisa
 * menggantikan pemilik pinjaman ke pendana lama mana pun, bukan hanya akun
 * berperan `dana` beremail. Hanya admin (sesi TOTP) yang dapat membukanya.
 */
export const kandidatPendana = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const peta = await akunPernahJadiPendana(ctx);
    const rows = [...peta.entries()]
      .map(([userId, r]) => ({ userId, ...r }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    return { rows };
  },
});

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
        const bagi = bagiPendanaAman(l, cfg.persenAdmin);
        totalDisalurkan += l.pokokPinjaman;
        totalBunga += bagi.imbal;
        keuntunganAdmin += bagi.potonganAdmin;
        keuntunganPendana += bagi.keuntunganPendana;
        if (l.status === "lunas") {
          jumlahLunas += 1;
        } else {
          jumlahAktif += 1;
          saldoBerjalan += l.remainingPrincipal ?? l.pokokPinjaman;
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
        nomorWhatsApp: u.nomorWhatsApp ?? null,
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
            keuntunganPendana: bagiPendanaAman(l, cfg.persenAdmin)
              .keuntunganPendana,
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
        const bagi = bagiPendanaAman(l, cfg.persenAdmin);
        return {
          loanId: l._id,
          referensi: l.nomorReferensi,
          status: l.status as string,
          pokokPinjaman: l.pokokPinjaman,
          bunga: bagi.imbal,
          totalLunas: l.pokokPinjaman + bagi.imbal,
          potonganAdmin: bagi.potonganAdmin,
          keuntunganPendana: bagi.keuntunganPendana,
          keuntunganAdmin: bagi.potonganAdmin,
          tenorPendanaHari: TENOR_PENDANA_HARI,
          persenImbalPendana: PERSEN_IMBAL_PENDANA,
          statusPendanaan: labelStatusPendanaan("dialokasikan", l.status),
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
 * Daftar pencatatan transfer keuntungan penyedia dana untuk panel admin.
 *
 * Satu baris = satu pinjaman LUNAS berpendana. Kewajiban transfer baru jatuh
 * tempo setelah kewajiban Peminjam lunas — pinjaman berjalan belum punya
 * keuntungan untuk ditransfer. Nominal dihitung di SERVER dengan kebijakan yang
 * berlaku, sama persis dengan yang ditulis `catatTransferPendana`, sehingga admin
 * tidak pernah mengirim angka.
 *
 * Baris yang belum dicatat diurutkan lebih dulu: yang paling lama menunggu
 * selalu terlihat di atas. Baca-saja — tidak ada perubahan data.
 */
export const daftarTransferPendana = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const cfg = await getConfig(ctx);
    const transferPerPinjaman = await petaTransfer(ctx);

    const pinjamanLunas = (await ctx.db.query("loans").collect()).filter(
      (l) =>
        l.status === "lunas" &&
        (l.pendanaId !== undefined || l.pendanaNama !== undefined),
    );

    const rows = pinjamanLunas.map((l) => {
      const bagi = bagiPendanaAman(l, cfg.persenAdmin);
      const transfer = transferPerPinjaman.get(l._id) ?? ringkasTransfer([]);
      return {
        loanId: l._id,
        referensi: l.nomorReferensi,
        pendanaNama: l.pendanaNama ?? "Penyedia dana",
        keuntunganPendana: bagi.keuntunganPendana,
        // Waktu pelunasan = kapan kewajiban transfer mulai berjalan.
        lunasPada: l.lunasPada ?? l.didanaiPada ?? l._creationTime,
        transfer: {
          status: transfer.status,
          jumlah: transfer.jumlah,
          referensi: transfer.referensi,
          metode: transfer.metode,
          catatan: transfer.catatan,
          dicatatOlehLabel: transfer.dicatatOlehLabel,
          dicatatPada: transfer.dicatatPada,
          alasanBatal: transfer.alasanBatal,
          adaPembatalan: transfer.adaPembatalan,
        },
      };
    });

    rows.sort(
      (a, b) =>
        Number(a.transfer.status === "dicatat") -
          Number(b.transfer.status === "dicatat") ||
        b.lunasPada - a.lunasPada,
    );

    const belum = rows.filter((r) => r.transfer.status !== "dicatat");
    const tercatat = rows.filter((r) => r.transfer.status === "dicatat");

    return {
      rows,
      ringkasan: {
        /** Pinjaman lunas yang catatan transfernya belum dibuat admin. */
        jumlahBelumDicatat: belum.length,
        /** Nilai keuntungan pada pinjaman yang belum dicatat transfernya. */
        nilaiBelumDicatat: belum.reduce((total, r) => total + r.keuntunganPendana, 0),
        /** Pinjaman lunas yang keuntungannya sudah dicatat ditransfer. */
        jumlahTercatat: tercatat.length,
        /** Nilai keuntungan yang sudah dicatat ditransfer. */
        nilaiTercatat: tercatat.reduce((total, r) => total + r.keuntunganPendana, 0),
      },
    };
  },
});

/**
 * Laporan transfer keuntungan untuk ruang pendana: riwayat catatan yang sudah
 * dibuat admin, ditambah antrean rekonsiliasi — pinjaman lunas berpendana yang
 * keuntungannya belum punya catatan berlaku.
 *
 * Isinya catatan PEMBUKUAN, bukan bukti mutasi: PINDAI tidak memindahkan uang.
 * Karena itu "belum dicatat" berarti admin belum mencatat transfernya, BUKAN
 * berarti uang belum berpindah — pemberi kerja istilah ini tetap
 * `src/lib/transferPendana.ts`.
 *
 * Baca-saja: tidak ada satu pun perubahan data di sini. Baris dibatasi
 * `BATAS_BARIS` dari yang terbaru, dan pemanggil menerima penanda `terpotong`.
 */
export const laporanTransferPendana = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requirePengamat(ctx);
    const cfg = await getConfig(ctx);
    // Akun pendana hanya menerima catatan transfer atas namanya: portofolio
    // pribadinya, bukan buku besar seluruh pendana.
    const cakupan = cakupanPendana(user, userId);

    const semuaCatatan = (await ctx.db.query("transferPendana").collect()).filter(
      (b) =>
        cakupan === null ||
        b.pendanaId === cakupan.userId ||
        (b.pendanaId === undefined && cakupan.kunci.has(b.pendanaNama)),
    );
    const rows = [...semuaCatatan]
      .sort((a, b) => b.dicatatPada - a.dicatatPada)
      .slice(0, BATAS_BARIS)
      .map((b) => ({
        id: b._id,
        nomorReferensi: b.nomorReferensiPinjaman,
        pendanaId: b.pendanaId ?? null,
        pendanaNama: b.pendanaNama,
        jumlah: b.jumlah,
        metode: b.metode as string,
        referensi: b.referensi ?? null,
        catatan: b.catatan ?? null,
        status: b.status as string,
        dicatatPada: b.dicatatPada,
        dicatatOlehLabel: b.dicatatOlehLabel,
        dibatalkanPada: b.dibatalkanPada ?? null,
        dibatalkanOlehLabel: b.dibatalkanOlehLabel ?? null,
        alasanBatal: b.alasanBatal ?? null,
      }));

    const dicatat = rows.filter((r) => r.status === "dicatat");
    const dibatalkan = rows.filter((r) => r.status === "dibatalkan");

    // Antrean rekonsiliasi dibaca dari SELURUH catatan (lewat `petaTransfer`),
    // bukan dari `rows` yang dibatasi: yang menentukan "belum dicatat" adalah
    // catatan TERBARU per pinjaman, dan catatan lama bisa jatuh di luar batas.
    // Untuk akun pendana, antreannya dibaca dari pinjaman miliknya saja.
    const transferPerPinjaman = await petaTransfer(ctx);
    const belum = (
      cakupan === null ? await ctx.db.query("loans").collect() : (await bacaPinjaman(ctx, cakupan)).rows
    )
      .filter(
        (l) =>
          l.status === "lunas" &&
          (l.pendanaId !== undefined || l.pendanaNama !== undefined),
      )
      .filter(
        (l) =>
          (transferPerPinjaman.get(l._id) ?? ringkasTransfer([])).status !== "dicatat",
      )
      .map((l) => ({
        loanId: l._id,
        referensi: l.nomorReferensi,
        pendanaId: l.pendanaId ?? null,
        pendanaNama: l.pendanaNama ?? "Penyedia dana",
        // Dihitung ulang di server dari kebijakan yang berlaku — angka klien
        // tidak pernah dipakai untuk nominal.
        jumlah: bagiPendanaAman(l, cfg.persenAdmin).keuntunganPendana,
        lunasPada: l.lunasPada ?? l.didanaiPada ?? l._creationTime,
      }))
      // Yang paling lama menunggu di atas: itu yang paling perlu ditindaklanjuti.
      .sort((a, b) => a.lunasPada - b.lunasPada);

    return {
      rows,
      terpotong: semuaCatatan.length > rows.length,
      belum,
      /** Id akun pembaca — UI menandai baris yang memang miliknya. */
      idSaya: userId,
      peran: user.role as string,
      ringkasan: {
        jumlahTercatat: dicatat.length,
        nilaiTercatat: dicatat.reduce((total, r) => total + r.jumlah, 0),
        jumlahDibatalkan: dibatalkan.length,
        nilaiDibatalkan: dibatalkan.reduce((total, r) => total + r.jumlah, 0),
        jumlahBelumDicatat: belum.length,
        nilaiBelumDicatat: belum.reduce((total, r) => total + r.jumlah, 0),
      },
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
/** Akun yang sudah memakai nomor WhatsApp ini (satu nomor, satu akun). */
async function cariAkunNomor(ctx: QueryCtx, nomor: string) {
  return ctx.db
    .query("users")
    .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
    .first();
}

/** Nomor bertopeng untuk log audit; angka utuh tidak ditulis ke sana. */
function samarkanNomor(nomor: string): string {
  return nomor.length <= 4 ? "••••" : `${nomor.slice(0, 4)}••••${nomor.slice(-3)}`;
}

async function cariAkunEmail(ctx: QueryCtx, email: string) {
  const dicari = email.trim().toLowerCase();
  if (dicari === "" || !dicari.includes("@")) return null;
  const lewatIndeks = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", dicari))
    .first();
  if (lewatIndeks !== null) return lewatIndeks;
  // Email lama bisa tersimpan dengan huruf besar/kecil berbeda sehingga tidak
  // cocok dengan indeks. Telusuri SEMUA akun lewat paginasi — batas 500 baris
  // akan diam-diam menyembunyikan akun ke-501 dan seterusnya.
  let kursor: string | null = null;
  for (;;) {
    const halaman = await ctx.db.query("users").paginate({ numItems: 200, cursor: kursor });
    const ketemu = halaman.page.find((u) => (u.email ?? "").toLowerCase() === dicari);
    if (ketemu !== undefined) return ketemu;
    if (halaman.isDone) return null;
    kursor = halaman.continueCursor;
  }
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
 * Buat akun penyedia dana baru langsung dari panel admin — pendana "siap akses"
 * yang dapat masuk ke ruang /penyedia-dana.
 *
 * `ubahAkses` di atas hanya menandai akun yang SUDAH terdaftar. Mutation ini
 * melengkapinya: admin membuat sendiri akun pendana (nama + email) yang
 * langsung berperan `dana`. Karena akun kata sandi hanya untuk Super Admin,
 * pendana tetap masuk lewat OTP email seperti pengguna lain; saat email itu
 * diverifikasi, Convex Auth menemukan tepat satu akun dengan email terverifikasi
 * yang sama (akun stub ini) lalu menautkannya — akun tidak terduplikasi dan
 * peran `dana` yang diberikan admin tetap menempel.
 *
 * Batas yang dijaga server:
 *  - hanya Super Admin dengan sesi TOTP terverifikasi (`requireAdminSession`);
 *  - nama wajib 2–120 karakter dan email wajib valid;
 *  - email yang sudah dipakai akun lain ditolak — arahkan memakai "Beri akses";
 *  - akun dibuat bukan-anonim dan langsung berperan `dana`;
 *  - setiap pembuatan dicatat di audit trail.
 *
 * Setelah dibuat, pendana harus masuk sekali lewat /auth dengan email itu
 * (kode OTP) agar akunnya benar-benar tertaut dan dapat membuka ruang.
 */
export const buatPendana = mutation({
  args: {
    nama: v.string(),
    email: v.string(),
    /**
     * Nomor WhatsApp login. Opsional di server agar pemanggil lama tetap sah,
     * tetapi formulir admin memintanya supaya pendana bisa masuk lewat OTP
     * WhatsApp tanpa menunggu login email lebih dulu.
     */
    nomorWhatsApp: v.optional(v.string()),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { nama, email, nomorWhatsApp, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const namaBersih = nama.trim();
    if (namaBersih.length < 2 || namaBersih.length > 120) {
      throw new Error("Nama pendana wajib 2–120 karakter.");
    }
    const dicari = email.trim().toLowerCase();
    if (dicari === "" || !dicari.includes("@")) {
      throw new Error("Masukkan alamat email pendana yang valid.");
    }

    const ada = await cariAkunEmail(ctx, dicari);
    if (ada !== null) {
      throw new Error(
        ada.role === ROLES.DANA
          ? `Akun ${dicari} sudah menjadi penyedia dana berakses ruang.`
          : `Akun ${dicari} sudah terdaftar — pakai "Beri akses" untuk memberinya akses ruang.`,
      );
    }

    const nomorMentah = (nomorWhatsApp ?? "").trim();
    const nomor = nomorMentah === "" ? null : normalisasiNomorWa(nomorMentah);
    if (nomorMentah !== "" && nomor === null) {
      throw new Error(
        "Nomor WhatsApp tidak dikenali. Tulis nomor Indonesia (mis. 0812 3456 7890) atau nomor luar Indonesia dengan kode negaranya (mis. +49 151 2345678).",
      );
    }
    if (nomor !== null) {
      const pemakai = await cariAkunNomor(ctx, nomor);
      if (pemakai !== null) {
        throw new Error(
          `Nomor ${samarkanNomor(nomor)} sudah dipakai akun lain. Satu nomor hanya dapat menjadi pintu masuk satu akun.`,
        );
      }
    }

    const userId = await ctx.db.insert("users", {
      name: namaBersih,
      email: dicari,
      // Stub ini sengaja ditandai email terverifikasi supaya Convex Auth
      // menautkan akun ini (bukan membuat duplikat) saat OTP email itu
      // diverifikasi. Tanpa authAccount, akun ini tetap tidak bisa masuk.
      emailVerificationTime: Date.now(),
      role: ROLES.DANA,
      isAnonymous: false,
      ...(nomor === null ? {} : { nomorWhatsApp: nomor }),
    });

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "buat_pendana",
      dicari,
      `Akun pendana "${namaBersih}" (${dicari}) dibuat dengan akses lihat saja ruang penyedia dana${
        nomor === null ? "" : ` dan login WhatsApp ${samarkanNomor(nomor)}`
      }${alasan?.trim() ? ` — ${alasan.trim()}` : ""}`,
    );

    return { ok: true, userId, nama: namaBersih, email: dicari, nomorWhatsApp: nomor };
  },
});

/**
 * ISI ATAU PERBAIKI DATA LOGIN SATU AKUN — nama dan alamat email.
 *
 * Dipakai saat pendana belum punya email (akun warisan "tanpa email"), salah
 * tulis alamat, atau berganti alamat. Email adalah identitas masuk, jadi
 * perubahannya harus benar-benar sampai ke jalur login — bukan hanya tampil di
 * daftar akun.
 *
 * Yang dijaga server:
 *  - hanya Super Admin dengan sesi TOTP terverifikasi (`requireAdminSession`);
 *  - nama 2–120 karakter dan email wajib valid (huruf kecil, tanpa spasi);
 *  - email yang sudah dipakai akun lain ditolak, termasuk bila itu akun tim;
 *  - akun tim (admin) dan akun tamu tidak dapat diubah dari sini;
 *  - **baris `authAccounts` pemilik akun ikut dipindahkan** ke alamat baru.
 *    Ini bagian yang menentukan: tanpa itu, permintaan OTP ke alamat baru tidak
 *    menemukan akun lamanya dan Convex Auth membuat akun BARU yang kosong,
 *    sementara data pendana tetap tertinggal di akun lama;
 *  - `emailVerificationTime` sengaja TIDAK dihapus. Untuk akun yang dibuat admin
 *    (`buatPendana`), cap itulah yang membuat Convex Auth menautkan akun stub
 *    ini — bukan membuat duplikat — saat alamatnya pertama kali diverifikasi
 *    lewat OTP. Yang menjamin alamat baru milik pendana yang benar adalah admin
 *    yang mengubahnya, bukan surat elektroniknya;
 *  - setiap perubahan tercatat di audit trail beserta alamat lama dan barunya.
 */
export const ubahAkunPendana = mutation({
  args: {
    userId: v.id("users"),
    nama: v.string(),
    email: v.string(),
    /**
     * Nomor WhatsApp login. Tidak dikirim = nomor lama dipertahankan;
     * string kosong = nomor dihapus.
     */
    nomorWhatsApp: v.optional(v.string()),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { userId, nama, email, nomorWhatsApp, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const target = await ctx.db.get(userId);
    if (target === null) throw new Error("Akun yang akan diubah tidak ditemukan.");
    if (target.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) tidak diubah dari daftar pendana.");
    }
    if (target.isAnonymous === true) {
      throw new Error(
        "Akun tamu tidak punya data login yang bisa diubah. Minta pemiliknya masuk dengan email terverifikasi.",
      );
    }

    const namaBersih = nama.trim();
    if (namaBersih.length < 2 || namaBersih.length > 120) {
      throw new Error("Nama akun wajib 2–120 karakter.");
    }
    const emailBersih = email.trim().toLowerCase();
    if (emailBersih.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBersih)) {
      throw new Error("Masukkan alamat email yang valid, mis. nama@contoh.com.");
    }

    const emailLama = target.email?.trim().toLowerCase() ?? "";
    const namaLama = target.name?.trim() ?? "";
    const berubahEmail = emailBersih !== emailLama;
    const berubahNama = namaBersih !== namaLama;
    const nomorLama = target.nomorWhatsApp ?? "";
    let nomorBaru = nomorLama;
    if (nomorWhatsApp !== undefined) {
      const mentah = nomorWhatsApp.trim();
      if (mentah === "") {
        nomorBaru = "";
      } else {
        const normal = normalisasiNomorWa(mentah);
        if (normal === null) {
          throw new Error(
            "Nomor WhatsApp tidak dikenali. Tulis nomor Indonesia (mis. 0812 3456 7890) atau nomor luar Indonesia dengan kode negaranya (mis. +49 151 2345678).",
          );
        }
        const pemakai = await cariAkunNomor(ctx, normal);
        if (pemakai !== null && pemakai._id !== target._id) {
          throw new Error(
            `Nomor ${samarkanNomor(normal)} sudah dipakai akun lain. Satu nomor hanya dapat menjadi pintu masuk satu akun.`,
          );
        }
        nomorBaru = normal;
      }
    }
    const berubahNomor = nomorBaru !== nomorLama;

    if (berubahEmail) {
      const pemakai = await cariAkunEmail(ctx, emailBersih);
      if (pemakai !== null && pemakai._id !== target._id) {
        throw new Error(
          pemakai.role === ROLES.ADMIN
            ? `Email ${emailBersih} dipakai akun tim (admin).`
            : `Email ${emailBersih} sudah dipakai akun lain. Pakai alamat lain, atau beri akses ruang ke akun itu.`,
        );
      }
    }

    /**
     * Pindahkan akun login milik pemilik ini ke alamat baru. Hanya baris yang
     * memang memakai alamat lama yang disentuh: akun login dengan penanda lain
     * (mis. nomor WhatsApp) dibiarkan.
     */
    let akunLogin = 0;
    if (berubahEmail) {
      const akun = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", target._id))
        .collect();
      for (const barisAkun of akun) {
        if (barisAkun.providerAccountId.trim().toLowerCase() !== emailLama) continue;
        await ctx.db.patch(barisAkun._id, { providerAccountId: emailBersih });
        akunLogin += 1;
      }
    }

    if (!berubahNama && !berubahEmail && !berubahNomor) {
      return {
        ok: true,
        sudahSesuai: true,
        akunLoginDiperbarui: 0,
        email: emailBersih,
        nomorWhatsApp: nomorBaru === "" ? null : nomorBaru,
      };
    }

    await ctx.db.patch(target._id, {
      name: namaBersih,
      email: emailBersih,
      ...(berubahNomor
        ? { nomorWhatsApp: nomorBaru === "" ? undefined : nomorBaru }
        : {}),
    });

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_akun_pendana",
      emailLama !== "" ? emailLama : (target.name ?? target._id),
      `Data login akun diperbarui${
        berubahNama ? `; nama "${namaLama || "(kosong)"}" → "${namaBersih}"` : ""
      }${
        berubahEmail ? `; email "${emailLama || "(belum ada)"}" → "${emailBersih}"` : ""
      }${
        berubahNomor
          ? `; WhatsApp "${nomorLama === "" ? "(belum ada)" : samarkanNomor(nomorLama)}" → "${
              nomorBaru === "" ? "(dihapus)" : samarkanNomor(nomorBaru)
            }"`
          : ""
      }${akunLogin > 0 ? `; ${akunLogin} akun login ikut dipindahkan` : ""}${
        alasan?.trim() ? ` — ${alasan.trim()}` : ""
      }`,
    );

    return {
      ok: true,
      sudahSesuai: false,
      akunLoginDiperbarui: akunLogin,
      email: emailBersih,
      nomorWhatsApp: nomorBaru === "" ? null : nomorBaru,
    };
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
 *  - pendana pengganti harus akun yang PERNAH menjadi pendana (peran penyedia
 *    dana, punya posisi pinjaman, atau nama warisan yang cocok) — lihat
 *    `kandidatPendana`; ditetapkan lewat `pendanaUserId` atau `pendanaEmail`;
 *  - pelepasan pendana hanya untuk pinjaman yang belum pernah ditandai
 *    tersalurkan, supaya rekap tidak kehilangan pemilik dana secara diam-diam;
 *  - nominal disetujui tidak boleh melebihi pengajuan dan tidak dapat diubah
 *    setelah dana tersalurkan (`nominalTerkunci`);
 *  - **nama peminjam dapat diperbaiki** bila salah tulis (typo), dan disimpan
 *    HURUF BESAR (`lib/nama.ts`) supaya sama dengan ruang peminjam lain;
 *  - setiap perubahan dicatat di audit trail (catatan alasan opsional).
 */
export const ubahDataPinjaman = mutation({
  args: {
    loanId: v.id("loans"),
    /**
     * Catatan koreksi — OPSIONAL (boleh dikosongkan). Bila diisi, ikut masuk
     * Audit Trail bersama daftar perubahan yang terjadi.
     */
    alasan: v.optional(v.string()),
    /** Email penyedia dana; `null`/kosong = lepas pendana dari pinjaman ini. */
    pendanaEmail: v.optional(v.union(v.string(), v.null())),
    /**
     * Id akun pendana pengganti (alternatif email) — dipakai dropdown kandidat
     * pendana agar pendana lama tanpa email tetap dapat ditetapkan.
     * `null` = lepas pendana.
     */
    pendanaUserId: v.optional(v.union(v.id("users"), v.null())),
    tujuan: v.optional(v.string()),
    /**
     * Nama peminjam pada catatan pinjaman — dipakai untuk MEMPERBAIKI salah
     * tulis tanpa membuat pinjaman baru. Selalu disimpan HURUF BESAR.
     */
    namaPeminjam: v.optional(v.string()),
    tenorHari: v.optional(v.number()),
    /** `null` = kembalikan ke skema harian. */
    tenorBulan: v.optional(v.union(v.number(), v.null())),
    pokokDisetujui: v.optional(v.number()),
    /**
     * Setelah perubahan disimpan, tandai dana tersalurkan bila pinjaman sudah
     * di tahap `disetujui`. Dialog review mengirim `true` saat admin memilih
     * pendana. Pencairan tetap ditolak server bila tahapnya belum tepat.
     */
    cairkanSekarang: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const alasan = (args.alasan ?? "").trim();
    if (alasan.length > 500) {
      throw new Error("Catatan perubahan maksimal 500 karakter.");
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
      namaLengkap?: string;
      tujuan?: string;
      tenorHari?: number;
      tenorBulan?: number | undefined;
      pokokPinjaman?: number;
    } = {};
    const perubahan: string[] = [];

    if (args.pendanaEmail !== undefined || args.pendanaUserId !== undefined) {
        const lepas =
          args.pendanaEmail === null ||
          args.pendanaUserId === null ||
          (typeof args.pendanaEmail === "string" && args.pendanaEmail.trim() === "");
        if (lepas) {
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
          const idDiminta = args.pendanaUserId;
          const target =
            idDiminta !== undefined && idDiminta !== null
              ? await ctx.db.get(idDiminta)
              : await cariAkunEmail(ctx, (args.pendanaEmail as string).trim());
          if (target === null) {
            throw new Error(
              idDiminta !== undefined && idDiminta !== null
                ? "Akun pendana tidak ditemukan."
                : `Tidak ada akun dengan email ${(args.pendanaEmail as string).trim()}.`,
            );
          }
          if (target.isAnonymous === true) {
            throw new Error("Akun tamu tidak dapat menjadi penyedia dana.");
          }
          // Hanya akun yang PERNAH menjadi pendana boleh ditetapkan, supaya
          // kepemilikan pinjaman tidak jatuh ke akun sembarangan.
          const kandidat = (await akunPernahJadiPendana(ctx)).get(target._id);
          if (kandidat === undefined) {
            throw new Error(
              "Akun itu belum pernah menjadi pendana. Pilih dari daftar pendana yang ada, atau beri akses penyedia dana lebih dulu.",
            );
          }
          if (loan.pendanaId !== target._id) {
            patch.pendanaId = target._id;
            patch.pendanaNama = kandidat.nama;
            perubahan.push(`pendana → ${kandidat.nama}`);
          }
        }
      }

      // Perbaikan nama peminjam (typo) — hanya menyentuh catatan pinjaman ini;
      // nama disimpan HURUF BESAR agar seragam di semua layar.
      if (args.namaPeminjam !== undefined) {
        const nama = namaHurufBesar(args.namaPeminjam);
        if (nama.length < 3 || nama.length > 120) {
          throw new Error("Nama peminjam wajib 3–120 karakter.");
        }
        if (nama !== loan.namaLengkap) {
          patch.namaLengkap = nama;
          perubahan.push(`nama peminjam ${loan.namaLengkap} → ${nama}`);
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
      const idPendanaBaru = args.pendanaUserId;
      if (idPendanaBaru !== undefined && idPendanaBaru !== null) {
        const target = await ctx.db.get(idPendanaBaru);
        if (target !== null && loan.pendanaId !== undefined) {
          danaIdLama = loan.pendanaId;
          danaIdBaru = target._id;
        }
      } else if (args.pendanaEmail !== undefined && args.pendanaEmail !== null && args.pendanaEmail.trim() !== "") {
        const target = await cariAkunEmail(ctx, args.pendanaEmail);
        if (target !== null && loan.pendanaId !== undefined) {
          danaIdLama = loan.pendanaId;
          danaIdBaru = target._id;
        }
      }

      if (perubahan.length === 0) {
        const dicairkan =
          args.cairkanSekarang === true
            ? (await cairkanSetelahPendana(ctx, loan._id)).dicairkan
            : false;
        return { ok: true, perubahan: [] as string[], dicairkan };
      }

      await ctx.db.patch(loan._id, patch);
      await audit(
        ctx,
        adminId,
        admin.email ?? admin.name ?? "admin",
        "ubah_data_pinjaman",
        loan.nomorReferensi,
        `${loan.namaLengkap} — ${perubahan.join(", ")}` +
          (alasan === "" ? " (tanpa catatan)" : `. Catatan: ${alasan}`),
      );
      if (danaIdLama !== undefined && danaIdBaru !== undefined && danaIdLama !== danaIdBaru) {
        await pindahAlokasiWarisan(ctx, loan._id, danaIdLama, danaIdBaru);
      }

      // Pendana sudah ditetapkan: pada pinjaman yang nominalnya disetujui,
      // pencairan langsung dicatat supaya admin tidak perlu menekan tombol
      // kedua. Perjanjian mengikuti persetujuan pengajuan yang sudah ada.
      const dicairkan =
        args.cairkanSekarang === true
          ? (await cairkanSetelahPendana(ctx, loan._id)).dicairkan
          : false;

      return { ok: true, perubahan, dicairkan };
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
): Promise<RingkasTransfer> {
  const baris = await ctx.db.query("transferPendana").collect();
  return ringkasTransfer(
    baris
      // Hanya catatan milik pinjaman ini — tanpa filter, satu catatan pada
      // pinjaman lain membuat penjaga "sudah dicatat" ikut menolak pinjaman ini.
      .filter((b) => b.loanId === loanId)
      .map((b) => ({
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
    const bagi = bagiPendanaAman(loan, cfg.persenAdmin);
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

    // Hanya baris milik PINJAMAN ini. Tanpa batas itu, satu pembatalan akan
    // ikut menandai batal catatan milik pinjaman — dan pendana — lain, dan
    // laporan pendana mereka akan terbaca seolah transfernya diurungkan.
    const berlaku = (
      await ctx.db
        .query("transferPendana")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect()
    ).filter((r) => r.status === "dicatat");
    if (berlaku.length === 0) {
      throw new Error("Tidak ada catatan transfer yang berlaku untuk pinjaman ini.");
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
