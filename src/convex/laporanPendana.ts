/**
 * Laporan pendana sebagai PDF ke WhatsApp pemiliknya.
 *
 * Dua jalur masuk:
 *  1. `kirimLaporanPelunasan` (internal) dipicu otomatis saat admin menandai
 *     pinjaman lunas lewat `loans.ubahStatusPinjaman`. Pelunasan adalah kabar
 *     yang ditunggu pendana, dan justru saat itulah ia butuh rincian angkanya.
 *  2. `kirimLaporanPortofolio` (action publik) dipanggil pemilik akun sendiri
 *     dari ruang penyedia dana, untuk laporan seluruh pendanaannya.
 *
 * Angka kedua laporan diambil dari `ruangPendana` di `convex/penyediaDana.ts` —
 * perhitungan yang sama dengan layar. Tidak ada perhitungan uang kedua di sini,
 * karena laporan yang angkanya berbeda sedikit dari ruangnya akan membuat
 * pembacanya meragukan kedua tempat sekaligus.
 *
 * Berkas PDF hanya hidup sebentar: dibuat, disimpan di storage Convex supaya
 * gateway bisa mengambilnya lewat URL publik, lalu dihapus lewat penjadwalan
 * setelah gateway punya cukup waktu. URL berkas Convex adalah URL bearer yang
 * berlaku sampai berkasnya dihapus, jadi membiarkannya berarti meninggalkan
 * tautan ke laporan keuangan yang tidak bisa dicabut.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalAction,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { CS_WHATSAPP } from "../lib/kontak";
import { requireAdminSession } from "./adminAuthz";
import type { Id } from "./_generated/dataModel";
import {
  laporanPortofolio,
  laporanRekapPendana,
  namaBerkasPortofolio,
  namaBerkasRekapPendana,
  pesanPelunasan,
  contohDataPelunasan,
  PEMBUKA_CONTOH_LAPORAN,
  pesanPortofolio,
  pesanRekapPendana,
  type BarisPortofolioPendana,
  type DataPortofolioPendana,
  type DataRekapPendana,
} from "../lib/laporanPendana";
import { normalisasiNomorWa } from "../lib/otpWa";
import { susunPdfResmi } from "../lib/pdfSederhana";
import { totalPendana } from "../lib/tabelPendana";
import { ROLES } from "./schema";
import { apiKeyGatewayWa, kirimViaGateway, type WaSettings } from "./whatsapp";
import {
  namaTampilPendana,
  peranPenyedia,
  ruangPendana,
  type BarisPinjaman,
  type RekapPendana,
} from "./penyediaDana";

/**
 * Batas ukuran lampiran. Fonnte menolak berkas 4 MB ke atas, dan laporan ini
 * jauh di bawahnya (hitungan puluh kilobita); pagar ini hanya menahan kasus
 * aneh sebelum gateway menolaknya dengan pesan yang lebih membingungkan.
 */
const BATAS_LAMPIRAN_BYTE = 3_500_000;

/**
 * Lama berkas laporan disimpan sebelum dihapus.
 *
 * Gateway menjawab "masuk antrean" lebih dulu dan mengambil berkasnya beberapa
 * saat kemudian, jadi berkas tidak boleh dihapus segera setelah kiriman
 * dijawab. Satu jam jauh lebih lama daripada jeda antrean gateway, dan tetap
 * membatasi berapa lama tautan laporan bisa beredar.
 */
const RETENSI_BERKAS_MS = 60 * 60 * 1000;

type JenisLaporan = "laporan_pelunasan" | "laporan_portofolio" | "rekap_pendana";

/**
 * Hasil pengiriman satu laporan. Ditulis sebagai tipe bernama dan SELALU
 * dianotasi pada handler aksi di bawah: aksi ini memanggil query milik modulnya
 * sendiri, dan tanpa anotasi TypeScript mencoba menyimpulkan tipe modul dari
 * aksinya sendiri (siklus) lalu menyerah pada `any` — `any` yang menular ke
 * seluruh tipe `api` sehingga setiap pemanggil di aplikasi kehilangan tipenya.
 */
type HasilKirimLaporan = { ok: boolean; status: string; respon: string };

/** Nama tampil akun pendana, memakai aturan nama yang sama dengan ruangnya. */
function namaPendana(user: { name?: string; email?: string }): string {
  return namaTampilPendana(user.name, user.email);
}

/** Satu baris pinjaman ruang pendana menjadi baris daftar laporan. */
function keBarisLaporan(b: BarisPinjaman): BarisPortofolioPendana {
  return {
    nomorReferensi: b.nomorReferensi,
    namaPeminjam: b.namaLengkap,
    pokokPinjaman: b.pokokPinjaman,
    keuntunganPendana: b.keuntunganPendana,
    tanggal: b.status === "lunas" ? b.lunasPada : b.didanaiPada,
    tanggalReturn: b.jatuhTempoPendanaPada,
  };
}

/**
 * Data laporan pelunasan satu pinjaman.
 *
 * Penerimanya ditentukan `loans.pendanaId`: hanya pemilik kanonik pinjaman yang
 * menerima kabar pelunasan. Pinjaman warisan yang kepemilikannya hanya berupa
 * nama tidak punya akun yang bisa dikirimi, dan menebak akun dari nama berarti
 * mengirim rincian keuangan ke orang yang salah.
 */
export const _dataPelunasan = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const pendanaId = loan.pendanaId;
    if (pendanaId === undefined) return null;
    const pendana = await ctx.db.get(pendanaId);
    if (pendana === null || !peranPenyedia(pendana.role as string | undefined)) return null;

    const ruang = await ruangPendana(ctx, pendana);
    const baris = ruang.pinjaman.find((p) => p._id === loanId) ?? null;
    if (baris === null) return null;

    return {
      nomor: pendana.nomorWhatsApp ?? null,
      pendanaId,
      namaPendana: namaPendana(pendana),
      baris,
      /** Cadangan tanggal lunas untuk dokumen lama yang belum punya `lunasPada`. */
      diputuskanPada: loan.diputuskanPada ?? null,
    };
  },
});

/**
 * Data mentah portofolio satu akun pendana — dipakai jalur PDF manual maupun
 * pengiriman WhatsApp, supaya keduanya membaca angka yang sama.
 */
async function ambilDataPortofolio(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null || !peranPenyedia(user.role as string | undefined)) return null;
  const ruang = await ruangPendana(ctx, user);
  return {
    nomor: user.nomorWhatsApp ?? null,
    namaPendana: namaPendana(user),
    ringkasan: ruang.ringkasan,
    rekap: ruang.rekapPendana,
    pinjaman: ruang.pinjaman,
  };
}

/** Data laporan portofolio satu akun pendana (jalur internal/WhatsApp). */
export const _dataPortofolio = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ambilDataPortofolio(ctx, userId),
});

/**
 * Angka laporan portofolio dari data ruang pendana. Satu-satunya tempat
 * penjumlahan laporan, supaya PDF unduhan dan lampiran WhatsApp tidak pernah
 * berbeda dari angka di layar.
 */
function angkaPortofolio(
  data: NonNullable<Awaited<ReturnType<typeof ambilDataPortofolio>>>,
  dicetakPada: number,
): DataPortofolioPendana {
  const berjalan = data.pinjaman.filter((p) => p.status === "didanai");
  const lunas = data.pinjaman.filter((p) => p.status === "lunas");
  return {
    namaPendana: data.namaPendana,
    dicetakPada,
    totalDisalurkan: jumlahkan(data.rekap, (r) => r.totalDisalurkan),
    saldoBerjalan: jumlahkan(data.rekap, (r) => r.saldoBerjalan),
    keuntunganDibukukan: data.ringkasan.totalKeuntunganPendanaLunas,
    keuntunganPerkiraan: data.ringkasan.totalKeuntunganPendanaBelumLunas,
    totalKeuntungan: data.ringkasan.totalKeuntunganPendana,
    potonganAdmin: data.ringkasan.totalKeuntunganAdmin,
    jumlahBerjalan: berjalan.length,
    jumlahLunas: lunas.length,
    pinjamanBerjalan: berjalan.map(keBarisLaporan),
    pinjamanLunas: lunas.map(keBarisLaporan),
    transferBelumDicatat: data.ringkasan.totalTransferBelumDicatat,
  };
}

/**
 * Angka laporan portofolio milik akun yang sedang masuk — untuk unduhan PDF
 * manual dari ruang penyedia dana. Tidak menyimpan berkas dan tidak mengirim
 * apa pun, jadi tidak meninggalkan tautan laporan di penyimpanan.
 */
export const dataLaporanPortofolio = query({
  args: {},
  handler: async (ctx): Promise<DataPortofolioPendana | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const data = await ambilDataPortofolio(ctx, userId);
    return data === null ? null : angkaPortofolio(data, Date.now());
  },
});

/**
 * Rekap seluruh pendana — hanya untuk Super Admin.
 *
 * Satu fungsi untuk query publik (unduhan PDF di peramban) dan query internal
 * (lampiran WhatsApp), supaya kedua jalur membaca angka yang sama. Pemantau
 * akun bersama sengaja tidak dilayani: rekap ini memuat posisi keuangan semua
 * pendana, dan sesi itu hanya punya akses lihat-saja ke satu portofolio.
 */
async function rekapSeluruhPendana(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<DataRekapPendana | null> {
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) return null;
  const ruang = await ruangPendana(ctx, user);
  return {
    dicetakPada: Date.now(),
    baris: ruang.rekapPendana,
    total: totalPendana(ruang.rekapPendana),
  };
}

/** Angka rekap seluruh pendana untuk unduhan PDF di perangkat admin. */
export const dataRekapPendana = query({
  args: {},
  handler: async (ctx): Promise<DataRekapPendana | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    return await rekapSeluruhPendana(ctx, userId);
  },
});

/** Jalur internal rekap, dipakai aksi pengiriman WhatsApp. */
export const _dataRekapPendana = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => rekapSeluruhPendana(ctx, userId),
});

/** Hapus berkas laporan setelah gateway selesai mengambilnya. */
export const _hapusBerkas = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Sudah terhapus (mis. job lain berjalan dua kali): tidak ada yang perlu
      // dilakukan. Penghapusan bersifat pembersihan, bukan langkah wajib.
    }
  },
});

/**
 * Kirim satu laporan PDF dan catat hasilnya di `waLogs`.
 *
 * Sengaja TIDAK melempar: pemanggil otomatis (pelunasan) berjalan di penjadwal
 * tanpa layar yang bisa menampilkan galat, jadi kegagalan harus tercatat rapi di
 * log pengiriman. Pemanggil manual memeriksa `ok` lalu menampilkan alasannya.
 */
async function kirimLaporanPdf(
  ctx: ActionCtx,
  opsi: {
    jenis: JenisLaporan;
    nomor: string | null;
    namaBerkas: string;
    byte: Uint8Array;
    pesan: string;
    loanId?: Id<"loans">;
    olehUserId?: Id<"users">;
  },
): Promise<HasilKirimLaporan> {
  async function catat(status: string, respon: string, isiPesan: string) {
    await ctx.runMutation(internal.whatsapp._appendLog, {
      ...(opsi.loanId === undefined ? {} : { loanId: opsi.loanId }),
      nomorTujuan: opsi.nomor ?? "-",
      jenis: opsi.jenis,
      isiPesan,
      status,
      respon,
      ...(opsi.olehUserId === undefined ? {} : { olehUserId: opsi.olehUserId }),
    });
  }

  if (opsi.nomor === null) {
    const alasan = "Nomor WhatsApp laporan belum diisi pemilik akun. Isi di ruang penyedia dana.";
    await catat("tanpa_nomor", alasan, "(tidak dikirim)");
    return { ok: false, status: "tanpa_nomor", respon: alasan };
  }

  const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
  if (settings.aktif !== true || !settings.apiUrl) {
    const alasan = "Integrasi WhatsApp belum aktif, jadi laporan tidak dikirim.";
    await catat("dinonaktifkan", alasan, opsi.pesan);
    return { ok: false, status: "dinonaktifkan", respon: alasan };
  }

  const apiKey = apiKeyGatewayWa();
  if (apiKey === "") {
    const alasan = "WHATSAPP_API_KEY belum diisi di environment.";
    await catat("gagal", alasan, opsi.pesan);
    return { ok: false, status: "gagal", respon: alasan };
  }

  if (opsi.byte.length > BATAS_LAMPIRAN_BYTE) {
    const alasan = `Laporan terlalu besar untuk lampiran WhatsApp (${opsi.byte.length} byte).`;
    await catat("gagal", alasan, opsi.pesan);
    return { ok: false, status: "gagal", respon: alasan };
  }

  // Salinan tipis dari byte: `BlobPart` menuntut buffer yang pasti (bukan
  // `ArrayBufferLike`), dan konstruktor salinan inilah yang menjaminnya.
  const storageId = await ctx.storage.store(
    new Blob([new Uint8Array(opsi.byte)], { type: "application/pdf" }),
  );
  const url = await ctx.storage.getUrl(storageId);
  if (url === null) {
    const alasan = "Berkas laporan gagal disiapkan di penyimpanan.";
    await catat("gagal", alasan, opsi.pesan);
    return { ok: false, status: "gagal", respon: alasan };
  }

  const hasil = await kirimViaGateway(apiKey, settings, opsi.nomor, opsi.pesan, {
    url,
    nama: opsi.namaBerkas,
  });

  // Berkas dihapus belakangan, bukan sekarang: gateway mengambil lampirannya
  // beberapa saat setelah menjawab. Penghapusan terjadwal tetap membuat tautan
  // laporan berumur pendek, dan tidak ada berkas yang tertinggal bila kiriman
  // gagal.
  await ctx.scheduler.runAfter(RETENSI_BERKAS_MS, internal.laporanPendana._hapusBerkas, {
    storageId,
  });

  await catat(hasil.ok ? "terkirim" : "gagal", hasil.respon, opsi.pesan);
  return { ok: hasil.ok, status: hasil.ok ? "terkirim" : "gagal", respon: hasil.respon };
}

/**
 * Kirim laporan pelunasan satu pinjaman ke WhatsApp pendananya.
 *
 * Dipanggil penjadwal sesaat setelah admin menandai lunas (lihat
 * `loans.ubahStatusPinjaman`). Hasilnya dikembalikan apa adanya supaya uji dan
 * pemanggil manual dapat membedakan "terkirim" dari "tidak dikirim karena nomor
 * belum diisi".
 */
/**
 * Kirim satu laporan sebagai PESAN TEKS dan catat hasilnya di `waLogs`.
 *
 * Dipakai laporan pelunasan: gateway yang dipakai tidak selalu mengantarkan
 * lampiran, dan pesan yang menjanjikan "ada di lampiran" tanpa berkas lebih
 * buruk daripada pesan yang memuat rinciannya sendiri.
 */
async function kirimLaporanTeks(
  ctx: ActionCtx,
  opsi: {
    jenis: JenisLaporan;
    nomor: string | null;
    pesan: string;
    loanId?: Id<"loans">;
    olehUserId?: Id<"users">;
  },
): Promise<HasilKirimLaporan> {
  async function catat(status: string, respon: string) {
    await ctx.runMutation(internal.whatsapp._appendLog, {
      ...(opsi.loanId === undefined ? {} : { loanId: opsi.loanId }),
      nomorTujuan: opsi.nomor ?? "-",
      jenis: opsi.jenis,
      isiPesan: opsi.pesan,
      status,
      respon,
      ...(opsi.olehUserId === undefined ? {} : { olehUserId: opsi.olehUserId }),
    });
  }

  if (opsi.nomor === null) {
    const alasan = "Nomor WhatsApp laporan belum diisi pemilik akun. Isi di ruang penyedia dana.";
    await catat("tanpa_nomor", alasan);
    return { ok: false, status: "tanpa_nomor", respon: alasan };
  }

  const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
  if (settings.aktif !== true || !settings.apiUrl) {
    const alasan = "Integrasi WhatsApp belum aktif, jadi laporan tidak dikirim.";
    await catat("dinonaktifkan", alasan);
    return { ok: false, status: "dinonaktifkan", respon: alasan };
  }

  const apiKey = apiKeyGatewayWa();
  if (apiKey === "") {
    const alasan = "WHATSAPP_API_KEY belum diisi di environment.";
    await catat("gagal", alasan);
    return { ok: false, status: "gagal", respon: alasan };
  }

  const hasil = await kirimViaGateway(apiKey, settings, opsi.nomor, opsi.pesan);
  await catat(hasil.ok ? "terkirim" : "gagal", hasil.respon);
  return { ok: hasil.ok, status: hasil.ok ? "terkirim" : "gagal", respon: hasil.respon };
}

export const kirimLaporanPelunasan = internalAction({
  args: {
    loanId: v.id("loans"),
    olehUserId: v.optional(v.id("users")),
    /** true = dikirim atas permintaan admin, mengabaikan sakelar otomatis. */
    paksa: v.optional(v.boolean()),
  },
  handler: async (ctx, { loanId, olehUserId, paksa }): Promise<HasilKirimLaporan> => {
    // Sakelar admin: laporan pelunasan memuat catatan keuntungan pendana, jadi
    // ia tidak berangkat sendiri kecuali admin menyalakannya.
    if (paksa !== true) {
      const otomatis = await ctx.runQuery(internal.system._laporanPelunasanOtomatis, {});
      if (!otomatis) {
        return {
          ok: false,
          status: "dilewati",
          respon: "Laporan pelunasan otomatis dimatikan; kirim manual dari ruang penyedia dana.",
        };
      }
    }
    const data = await ctx.runQuery(internal.laporanPendana._dataPelunasan, { loanId });
    if (data === null) {
      return { ok: false, status: "dilewati", respon: "Pinjaman tidak punya akun pendana kanonik." };
    }

    const b = data.baris;
    const dicetakPada = Date.now();
    // Dokumen lama bisa sudah lunas tanpa tanggal acuan. Urutan cadangannya:
    // pelunasan -> waktu keputusan status terakhir -> waktu laporan dibuat.
    const lunasPada = b.lunasPada ?? data.diputuskanPada ?? dicetakPada;
    const bahasa = await ctx.runQuery(internal.bahasaPendana._untukPengguna, {
      userId: data.pendanaId,
    });

    const hasil = await kirimLaporanTeks(ctx, {
      jenis: "laporan_pelunasan",
      nomor: data.nomor,
      pesan: pesanPelunasan(
        {
          namaPendana: data.namaPendana,
          nomorReferensi: b.nomorReferensi,
          namaPeminjam: b.namaLengkap,
          pokokPinjaman: b.pokokPinjaman,
          totalLunas: b.totalLunas,
          potonganAdmin: b.potonganAdmin,
          keuntunganPendana: b.keuntunganPendana,
          didanaiPada: b.didanaiPada,
          lunasPada,
          transferDicatat: b.transfer.status === "dicatat",
          dicetakPada,
        },
        bahasa,
      ),
      loanId,
      ...(olehUserId === undefined ? {} : { olehUserId }),
    });

    // Jejak audit: dokumen keuangan yang keluar atas permintaan manusia harus
    // bisa ditelusuri — siapa yang meminta, dan apa hasil kirimannya.
    await ctx.runMutation(internal.system._auditLaporanPendana, {
      aksi: "laporan_pelunasan",
      target: b.nomorReferensi,
      detail:
        `Laporan pelunasan ${b.nomorReferensi} ke ${data.namaPendana}: ${hasil.status}` +
        `${paksa === true ? " (diminta admin)" : " (otomatis)"}. ${hasil.respon}`,
      ...(olehUserId === undefined ? {} : { olehUserId }),
    });
    return hasil;
  },
});

/** Jumlahkan satu kolom rekap dari seluruh baris rekap milik akun ini. */
function jumlahkan(rekap: RekapPendana[], kolom: (r: RekapPendana) => number): number {
  return rekap.reduce((total, r) => total + kolom(r), 0);
}

/**
 * Kirim laporan pelunasan SATU pinjaman sekarang, atas permintaan admin.
 *
 * Dipakai saat sakelar `laporanPelunasanOtomatis` dimatikan: laporan tetap bisa
 * berangkat kapan admin siap. Gerbangnya admin murni, dan penerimanya tetap
 * pemilik kanonik pinjaman (`pendanaId`) — nomor tujuan tidak pernah bisa
 * dipilih pemanggil.
 */
export const kirimLaporanPelunasanManual = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { userId: adminId } = await requireAdminSession(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new ConvexError("Pinjaman tidak ditemukan.");
    if (loan.status !== "lunas") {
      throw new ConvexError("Laporan pelunasan hanya untuk pinjaman yang sudah lunas.");
    }
    if (loan.pendanaId === undefined) {
      throw new ConvexError("Pinjaman ini tidak punya akun penyedia dana yang bisa dikirimi.");
    }
    await ctx.scheduler.runAfter(0, internal.laporanPendana.kirimLaporanPelunasan, {
      loanId,
      olehUserId: adminId,
      paksa: true,
    });
    return { ok: true };
  },
});

/**
 * Kirim CONTOH format laporan pelunasan ke nomor CS PINDAI.
 *
 * Dipakai admin untuk memeriksa tampilan pesan yang akan diterima pendana,
 * tanpa menyentuh data siapa pun: isinya data contoh. Penerimanya nomor CS dari
 * `lib/kontak`, bukan nomor pilihan pemanggil.
 */
export const _kirimContohLaporanCs = internalAction({
  args: {},
  handler: async (ctx): Promise<HasilKirimLaporan> => {
    const pesan = `${PEMBUKA_CONTOH_LAPORAN}\n\n${pesanPelunasan(contohDataPelunasan())}`;
    const hasil = await kirimLaporanTeks(ctx, {
      jenis: "laporan_pelunasan",
      nomor: CS_WHATSAPP,
      pesan,
    });
    await ctx.runMutation(internal.system._auditLaporanPendana, {
      aksi: "contoh_laporan",
      target: "nomor CS",
      detail: `Contoh format laporan pelunasan dikirim ke CS: ${hasil.status}. ${hasil.respon}`,
    });
    return hasil;
  },
});

/** Picu pengiriman contoh ke CS (admin saja). */
export const kirimContohLaporanCs = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    await ctx.scheduler.runAfter(0, internal.laporanPendana._kirimContohLaporanCs, {});
    return { ok: true };
  },
});

/**
 * Kirim laporan portofolio akun yang sedang masuk ke WhatsApp-nya sendiri.
 *
 * Nomor tujuan tidak bisa dipilih pemanggil: selalu nomor yang tersimpan pada
 * akunnya. Itu menjaga laporan keuangan tidak pernah dialihkan ke nomor lain
 * oleh siapa pun yang menemukan tombolnya.
 */
export const kirimLaporanPortofolio = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ ok: boolean; jumlahBerjalan: number; jumlahLunas: number }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const data = await ctx.runQuery(internal.laporanPendana._dataPortofolio, { userId });
    if (data === null) throw new Error("Laporan kinerja hanya untuk akun penyedia dana.");

    const dicetakPada = Date.now();
    const angka = angkaPortofolio(data, dicetakPada);
    const bahasa = await ctx.runQuery(internal.bahasaPendana._untukPengguna, {
      userId,
    });

    const hasil = await kirimLaporanPdf(ctx, {
      jenis: "laporan_portofolio",
      nomor: data.nomor,
      namaBerkas: namaBerkasPortofolio(dicetakPada, bahasa),
      byte: susunPdfResmi(laporanPortofolio(angka, bahasa)),
      pesan: pesanPortofolio(angka, bahasa),
      olehUserId: userId,
    });

    if (!hasil.ok) throw new Error(hasil.respon);
    return { ok: true, jumlahBerjalan: angka.jumlahBerjalan, jumlahLunas: angka.jumlahLunas };
  },
});

/**
 * Kirim rekap seluruh pendana ke nomor WhatsApp yang ditulis admin.
 *
 * Berbeda dari dua laporan lain, tujuannya tidak bisa diambil dari akun:
 * laporan ini milik admin, bukan milik pendana, dan admin perlu bisa mengirim
 * salinannya ke nomor kerja atau ke admin lain. Karena itu nomor tujuan datang
 * dari pemanggil — tetapi hanya setelah peran admin diperiksa lewat query
 * internal, dan pengirimnya tetap dicatat di `waLogs`.
 */
export const kirimRekapPendana = action({
  args: { nomor: v.string() },
  handler: async (
    ctx,
    { nomor },
  ): Promise<{ ok: true; tujuan: string; jumlahPendana: number }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const tujuan = normalisasiNomorWa(nomor);
    if (tujuan === null) {
      throw new Error(
        "Nomor WhatsApp tidak dikenali. Tulis nomor Indonesia (mis. 0812 3456 7890) atau nomor luar Indonesia dengan kode negaranya (mis. +49 151 2345678).",
      );
    }

    const data = await ctx.runQuery(internal.laporanPendana._dataRekapPendana, { userId });
    if (data === null) throw new Error("Rekap seluruh pendana hanya untuk Super Admin.");
    if (data.total.jumlahPendana === 0) {
      throw new Error("Belum ada pendana yang bisa direkap.");
    }

    const hasil = await kirimLaporanPdf(ctx, {
      jenis: "rekap_pendana",
      nomor: tujuan,
      namaBerkas: namaBerkasRekapPendana(data.dicetakPada),
      byte: susunPdfResmi(laporanRekapPendana(data)),
      pesan: pesanRekapPendana(data),
      olehUserId: userId,
    });

    if (!hasil.ok) throw new Error(hasil.respon);
    return { ok: true, tujuan, jumlahPendana: data.total.jumlahPendana };
  },
});
