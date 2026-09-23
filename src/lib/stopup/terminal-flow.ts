/**
 * STOP-UP! — Mesin alur terminal (murni, tanpa React & tanpa I/O)
 *
 * Seluruh perpindahan langkah layar sentuh — dari Idle sampai Struk —
 * ditentukan di sini sebagai reducer murni:
 *
 *   idle → nomor → katalog → target → konfirmasi → qris → struk
 *
 * Kenapa dipisah: alur inilah yang paling sering rusak saat UI disentuh.
 * Karena reducer ini murni & sinkron, `terminal-flow.test.ts` bisa menjalankan
 * SELURUH perjalanan pelanggan (termasuk validasi, inquiry, timeout supplier,
 * tagihan kedaluwarsa, dan penyusunan struk) tanpa browser, tanpa Convex, dan
 * tanpa timer palsu.
 *
 * Kontrak penting:
 * - Fungsi murni: tidak membaca Date.now() maupun jam global. Waktu selalu
 *   dikirim eksplisit lewat aksi (`sekarang`).
 * - Bila sebuah aksi tidak mengubah apa pun, state LAMA dikembalikan apa
 *   adanya (identitas referensi sama) supaya React tidak render ulang sia-sia
 *   saat polling tiap detik.
 */
import type { DeliveryType } from "./master-catalog";
import { normalisasiNomorHp, normalisasiKetikNomorHp } from "@/utils/masking";
import { validasiNomorHp } from "./operator";
import { labelWaktuWib } from "./waktu";
import type { DataStruk } from "@/utils/escpos";

/* ============================== TIPE ============================== */

export type Langkah =
  | "idle"
  | "nomor"
  | "katalog"
  | "target"
  | "konfirmasi"
  | "qris"
  | "struk";

export type StatusTransaksi =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED";

export type ProdukRingkas = {
  id: string;
  code: string;
  name: string;
  icon: string;
  iconUrl?: string | null;
  badgeLabel?: string | null;
  deliveryType: DeliveryType;
  harga: number;
  hargaCoret?: number | null;
};

export type BrandRingkas = {
  code: string;
  name: string;
  kind: string;
  labelTarget: string;
  minDigit: number;
  maxDigit: number;
};

export type HasilInquiry = {
  namaMasked: string;
  sumber: "SUPPLIER" | "SIMULASI";
  label: string;
  /** Tagihan pascabayar dari inquiry (rupiah bulat) — null untuk prabayar. */
  tagihan: number | null;
};

export type FlowState = {
  langkah: Langkah;
  /** Nomor HP pelanggan dari Page 1 (selalu bentuk 08…). */
  nomorHp: string;
  kategoriCode: string;
  brandCode: string;
  produk: ProdukRingkas | null;
  /** Nomor tujuan / ID pelanggan untuk produk PPOB. */
  targetNo: string;
  /** Email tujuan untuk produk INJECT_EMAIL. */
  email: string;
  /** Nomor WhatsApp penerima invoice — bisa diubah di layar konfirmasi. */
  notifWa: string;
  invoiceId: string | null;
  inquiry: HasilInquiry | null;
  /** true = layar sedang menunggu jawaban inquiry supplier. */
  memprosesInquiry: boolean;
  /** true = layar sedang membuat tagihan QRIS. */
  memprosesBayar: boolean;
  strukPending: boolean;
  galat: string | null;
  /** Penanda awal penantian jawaban supplier di layar QRIS (epoch ms). */
  menungguSejak: number | null;
};

export const FLOW_AWAL: FlowState = {
  langkah: "idle",
  nomorHp: "",
  kategoriCode: "",
  brandCode: "",
  produk: null,
  targetNo: "",
  email: "",
  notifWa: "",
  invoiceId: null,
  inquiry: null,
  memprosesInquiry: false,
  memprosesBayar: false,
  strukPending: false,
  galat: null,
  menungguSejak: null,
};

export type Aksi =
  | { jenis: "MULAI" }
  | { jenis: "KETIK_DIGIT"; digit: string }
  | { jenis: "HAPUS_DIGIT" }
  | { jenis: "BERSIHKAN_NOMOR" }
  | { jenis: "LANJUT_NOMOR" }
  | { jenis: "PILIH_KATEGORI"; code: string }
  | { jenis: "PILIH_BRAND"; code: string }
  | { jenis: "PILIH_PRODUK"; produk: ProdukRingkas }
  | { jenis: "KETIK_TARGET"; digit: string }
  | { jenis: "HAPUS_TARGET" }
  | { jenis: "BERSIHKAN_TARGET" }
  | { jenis: "SET_EMAIL"; nilai: string }
  | { jenis: "LANJUT_TARGET"; brand: BrandRingkas | null }
  | { jenis: "INQUIRY_SELESAI"; hasil: HasilInquiry | null }
  | { jenis: "INQUIRY_GAGAL"; pesan: string }
  | { jenis: "SET_NOTIF_WA"; nilai: string }
  | { jenis: "MULAI_BAYAR" }
  | { jenis: "TAGIHAN_DIBUAT"; invoiceId: string }
  | { jenis: "BAYAR_GAGAL"; pesan: string }
  | {
      jenis: "STATUS_INVOICE";
      status: StatusTransaksi;
      batasTungguDetik: number;
      sekarang: number;
    }
  | { jenis: "KEMBALI" }
  | { jenis: "RESET" };

/* ============================ PREDIKAT ============================ */

/** Kategori yang memakai nomor HP Page 1 sebagai nomor tujuan. */
export const KATEGORI_PAKAI_NOMOR_HP = ["pulsa", "data", "ewallet"] as const;

export function pakaiNomorHp(kategoriCode: string): boolean {
  return (KATEGORI_PAKAI_NOMOR_HP as readonly string[]).includes(kategoriCode);
}

/**
 * Produk yang wajib menampilkan kartu nama pemilik akun (partial masking)
 * sebelum boleh dibayar: seluruh PPOB, dan semua produk e-wallet.
 */
export function perluInquiry(kategoriCode: string, produk: ProdukRingkas | null): boolean {
  if (!produk) return false;
  return produk.deliveryType === "PPOB_INQUIRY" || kategoriCode === "ewallet";
}

/** Label field target pada layar input. */
export function labelTarget(
  kategoriCode: string,
  produk: ProdukRingkas | null,
  brand: BrandRingkas | null,
): string {
  if (produk?.deliveryType === "INJECT_EMAIL") return "Email Pembeli";
  if (pakaiNomorHp(kategoriCode)) return kategoriCode === "ewallet" ? "Nomor HP Akun" : "Nomor HP Penerima";
  return brand?.labelTarget ?? "Nomor Tujuan";
}

/** Rentang digit untuk pesan bantuan ("11–12 digit"). */
export function rentangDigit(brand: BrandRingkas | null): string {
  if (!brand) return "10–13";
  return brand.minDigit === brand.maxDigit
    ? String(brand.minDigit)
    : `${brand.minDigit}–${brand.maxDigit}`;
}

export function validasiEmail(nilai: string): { valid: boolean; nilai: string; pesan?: string } {
  const bersih = nilai.trim().toLowerCase();
  if (bersih === "") return { valid: false, nilai: bersih, pesan: "Masukkan email pembeli." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(bersih)) {
    return { valid: false, nilai: bersih, pesan: "Format email belum benar (contoh: nama@gmail.com)." };
  }
  return { valid: true, nilai: bersih };
}

/**
 * Validasi target sesuai tipe pengiriman produk.
 * Email → regex email; lainnya → jumlah digit sesuai aturan brand.
 */
export function validasiTarget(
  produk: ProdukRingkas | null,
  brand: BrandRingkas | null,
  nilai: string,
): { valid: boolean; nilai: string; pesan?: string } {
  if (!produk) return { valid: false, nilai, pesan: "Pilih produk terlebih dahulu." };

  if (produk.deliveryType === "INJECT_EMAIL") {
    const email = validasiEmail(nilai);
    return email.valid ? { valid: true, nilai: email.nilai } : email;
  }

  const digit = nilai.replace(/\D/g, "");
  if (digit === "") {
    return { valid: false, nilai: digit, pesan: `Masukkan ${labelTarget("", produk, brand)}.` };
  }
  // Tanpa aturan brand, default = aturan nomor HP Indonesia (10–13 digit).
  const min = brand?.minDigit ?? 10;
  const max = brand?.maxDigit ?? 13;
  if (digit.length < min || digit.length > max) {
    return {
      valid: false,
      nilai: digit,
      pesan: `${brand?.labelTarget ?? "Nomor tujuan"} harus ${rentangDigit(brand)} digit.`,
    };
  }
  return { valid: true, nilai: digit };
}

/** Apakah tombol BAYAR boleh ditekan (dan lolos validasi nomor invoice). */
export function bolehBayar(state: FlowState): { boleh: boolean; pesan?: string } {
  if (state.langkah !== "konfirmasi") return { boleh: false, pesan: "Belum di layar konfirmasi." };
  if (!state.produk) return { boleh: false, pesan: "Produk belum dipilih." };
  if (state.targetNo.trim() === "") return { boleh: false, pesan: "Nomor tujuan belum diisi." };
  const wa = normalisasiNomorHp(state.notifWa || state.nomorHp);
  const cek = validasiNomorHp(wa);
  if (!cek.valid) {
    return {
      boleh: false,
      pesan: `Nomor WhatsApp invoice tidak valid: ${cek.pesan ?? "periksa kembali"}.`,
    };
  }
  return { boleh: true };
}

/** Total yang dibayar: harga produk + tagihan pascabayar (bila ada). */
export function totalTagihan(state: FlowState): number {
  const harga = state.produk?.harga ?? 0;
  const tagihan = state.inquiry?.tagihan ?? 0;
  return harga + tagihan;
}

/* ============================ REDUCER ============================ */

/** Salin state dengan patch; dipakai agar tiap cabang tetap ringkas. */
function ubah(state: FlowState, patch: Partial<FlowState>): FlowState {
  return { ...state, ...patch };
}

/**
 * Satu-satunya penentu alur. Selalu murni & sinkron.
 *
 * Catatan implementasi: setiap cabang yang tidak mengubah apa pun
 * mengembalikan `state` (referensi sama) — penting untuk polling per detik.
 */
export function terminalFlow(state: FlowState, aksi: Aksi): FlowState {
  switch (aksi.jenis) {
    /* ------------------------------ IDLE ------------------------------ */
    case "MULAI": {
      if (state.langkah !== "idle") return state;
      return ubah(FLOW_AWAL, {
        langkah: "nomor",
        nomorHp: state.nomorHp,
        notifWa: state.notifWa || state.nomorHp,
      });
    }

    case "RESET":
      return state.langkah === "idle" ? state : FLOW_AWAL;

    /* ------------------------------ PAGE 1 ------------------------------ */
    case "KETIK_DIGIT": {
      if (state.langkah !== "nomor") return state;
      const nomorHp = normalisasiKetikNomorHp(state.nomorHp, aksi.digit);
      if (nomorHp === state.nomorHp) return state;
      return ubah(state, { nomorHp, galat: null });
    }

    case "HAPUS_DIGIT": {
      if (state.langkah !== "nomor") return state;
      return ubah(state, { nomorHp: state.nomorHp.slice(0, -1), galat: null });
    }

    case "BERSIHKAN_NOMOR": {
      if (state.langkah !== "nomor" || state.nomorHp === "") return state;
      return ubah(state, { nomorHp: "", galat: null });
    }

    case "LANJUT_NOMOR": {
      if (state.langkah !== "nomor") return state;
      const cek = validasiNomorHp(state.nomorHp);
      if (!cek.valid) return ubah(state, { galat: cek.pesan ?? "Nomor tidak valid." });
      return ubah(state, {
        langkah: "katalog",
        galat: null,
        notifWa: state.notifWa || state.nomorHp,
        kategoriCode: state.kategoriCode || "pulsa",
      });
    }

    /* ------------------------------ PAGE 2 ------------------------------ */
    case "PILIH_KATEGORI": {
      if (state.langkah !== "katalog" || state.kategoriCode === aksi.code) return state;
      return ubah(state, {
        kategoriCode: aksi.code,
        // Brand dikosongkan supaya smart routing memilih operator otomatis
        // (pulsa/data) atau pelanggan memilih brand sendiri (PPOB/premium).
        brandCode: "",
        produk: null,
        galat: null,
      });
    }

    case "PILIH_BRAND": {
      if (state.langkah !== "katalog" || state.brandCode === aksi.code) return state;
      return ubah(state, { brandCode: aksi.code, produk: null, galat: null });
    }

    case "PILIH_PRODUK": {
      if (state.langkah !== "katalog") return state;
      const produk = aksi.produk;
      // Kategori berbasis nomor HP: tujuan sudah diketahui dari Page 1,
      // jadi tidak perlu layar input tambahan.
      if (pakaiNomorHp(state.kategoriCode)) {
        const lanjut = ubah(state, {
          produk,
          targetNo: state.nomorHp,
          email: "",
          galat: null,
        });
        if (perluInquiry(state.kategoriCode, produk)) {
          return ubah(lanjut, { memprosesInquiry: true });
        }
        return ubah(lanjut, { langkah: "konfirmasi", inquiry: null });
      }
      return ubah(state, {
        produk,
        targetNo: "",
        email: "",
        inquiry: null,
        galat: null,
        langkah: "target",
      });
    }

    /* ------------------------------ TARGET ------------------------------ */
    case "KETIK_TARGET": {
      if (state.langkah !== "target") return state;
      const berikut = `${state.targetNo}${aksi.digit}`;
      if (berikut === state.targetNo) return state;
      return ubah(state, { targetNo: berikut, galat: null });
    }

    case "HAPUS_TARGET": {
      if (state.langkah !== "target") return state;
      return ubah(state, { targetNo: state.targetNo.slice(0, -1), galat: null });
    }

    case "BERSIHKAN_TARGET": {
      if (state.langkah !== "target" || state.targetNo === "") return state;
      return ubah(state, { targetNo: "", galat: null });
    }

    case "SET_EMAIL": {
      if (state.langkah !== "target") return state;
      const email = aksi.nilai.toLowerCase();
      if (email === state.email) return state;
      return ubah(state, { email, galat: null });
    }

    case "LANJUT_TARGET": {
      if (state.langkah !== "target") return state;
      const cek = validasiTarget(state.produk, aksi.brand, 
        state.produk?.deliveryType === "INJECT_EMAIL" ? state.email : state.targetNo);
      if (!cek.valid) return ubah(state, { galat: cek.pesan ?? "Data pelanggan belum lengkap." });

      const lanjut = ubah(state, {
        targetNo: cek.nilai,
        galat: null,
        inquiry: null,
      });
      if (perluInquiry(state.kategoriCode, state.produk)) {
        return ubah(lanjut, { memprosesInquiry: true });
      }
      return ubah(lanjut, { langkah: "konfirmasi" });
    }

    /* ---------------------------- INQUIRY ---------------------------- */
    case "INQUIRY_SELESAI": {
      if (!state.memprosesInquiry) return state;
      return ubah(state, {
        inquiry: aksi.hasil,
        memprosesInquiry: false,
        galat: null,
        langkah: "konfirmasi",
      });
    }

    case "INQUIRY_GAGAL": {
      if (!state.memprosesInquiry) return state;
      return ubah(state, { memprosesInquiry: false, galat: aksi.pesan });
    }

    /* --------------------------- KONFIRMASI --------------------------- */
    case "SET_NOTIF_WA": {
      if (state.langkah !== "konfirmasi") return state;
      const nilai = normalisasiNomorHp(aksi.nilai);
      if (nilai === state.notifWa) return state;
      return ubah(state, { notifWa: nilai, galat: null });
    }

    case "MULAI_BAYAR": {
      // Tombol bayar hanya hidup di layar konfirmasi; di langkah lain aksi ini
      // diabaikan sepenuhnya (tidak ada jalan pintas ke pembuatan tagihan).
      if (state.langkah !== "konfirmasi" || state.memprosesBayar) return state;
      const cek = bolehBayar(state);
      if (!cek.boleh) return ubah(state, { galat: cek.pesan ?? "Data belum lengkap." });
      return ubah(state, { memprosesBayar: true, galat: null });
    }

    case "TAGIHAN_DIBUAT": {
      if (!state.memprosesBayar) return state;
      return ubah(state, {
        memprosesBayar: false,
        invoiceId: aksi.invoiceId,
        menungguSejak: null,
        strukPending: false,
        langkah: "qris",
      });
    }

    case "BAYAR_GAGAL": {
      if (!state.memprosesBayar) return state;
      return ubah(state, { memprosesBayar: false, galat: aksi.pesan });
    }

    /* ------------------------------- QRIS ------------------------------- */
    case "STATUS_INVOICE": {
      // Di layar struk, perubahan hanya boleh "menaikkan" struk sementara
      // menjadi final (supplier akhirnya menjawab) — struk tidak pernah
      // diturunkan kembali ke layar lain setelah uang diterima.
      if (state.langkah === "struk") {
        if (aksi.status === "SUCCESS" || aksi.status === "FAILED") {
          if (!state.strukPending) return state;
          return ubah(state, { strukPending: false });
        }
        return state;
      }

      if (state.langkah !== "qris") return state;

      if (aksi.status === "SUCCESS" || aksi.status === "FAILED") {
        return ubah(state, {
          langkah: "struk",
          strukPending: false,
          menungguSejak: null,
          galat: null,
        });
      }

      if (aksi.status === "EXPIRED") {
        return ubah(state, {
          langkah: "katalog",
          invoiceId: null,
          menungguSejak: null,
          strukPending: false,
          galat: "Waktu pembayaran habis. Silakan ulangi transaksi.",
        });
      }

      // PENDING / PROCESSING → selama supplier belum menjawab, hitung waktu.
      const mulai = state.menungguSejak ?? aksi.sekarang;
      if (aksi.sekarang - mulai > aksi.batasTungguDetik * 1000) {
        // Lewat batas tunggu: struk sementara dicetak, update menyusul via WA.
        return ubah(state, {
          langkah: "struk",
          strukPending: true,
          menungguSejak: mulai,
        });
      }
      return state.menungguSejak === mulai ? state : ubah(state, { menungguSejak: mulai });
    }

    /* ----------------------------- NAVIGASI ----------------------------- */
    case "KEMBALI": {
      switch (state.langkah) {
        case "katalog":
          return ubah(state, { langkah: "nomor", galat: null });
        case "target":
          return ubah(state, { langkah: "katalog", galat: null, produk: null });
        case "konfirmasi":
          return ubah(state, {
            langkah: "katalog",
            galat: null,
            inquiry: null,
            memprosesBayar: false,
          });
        case "nomor":
          return ubah(state, { langkah: "idle", galat: null });
        default:
          return FLOW_AWAL;
      }
    }

    default:
      return state;
  }
}

/* ========================= PENYUSUN STRUK ========================= */

/** Data invoice yang dibutuhkan untuk menyusun struk. */
export type InvoiceUntukStruk = {
  invoiceId: string;
  terminalCode: string;
  createdAt: number;
  produkNama: string;
  targetNo: string;
  sellPrice: number;
  status: string;
  snRef: string | null;
  voucherCode: string | null;
  accountNameMasked: string | null;
};

/**
 * Ubah data invoice + pengaturan merchant menjadi DataStruk siap dicetak
 * (ESC/POS) maupun dikirim sebagai teks WhatsApp. Murni → bisa diuji.
 *
 * `pending` selalu dikembalikan sebagai boolean pasti (bukan opsional): layar
 * terminal memakainya untuk memutuskan tanda "STRUK SEMENTARA" dan pengalihan
 * bukti bayar ke WhatsApp saat kertas habis.
 */
export function susunStruk(args: {
  invoice: InvoiceUntukStruk;
  namaMerchant: string;
  alamat: string;
  footer?: string;
  pending: boolean;
}): DataStruk & { pending: boolean } {
  const { invoice, pending } = args;
  return {
    namaMerchant: args.namaMerchant,
    alamat: args.alamat,
    terminal: invoice.terminalCode,
    invoiceId: invoice.invoiceId,
    waktu: labelWaktuWib(invoice.createdAt),
    item: {
      nama: invoice.produkNama,
      tujuan: invoice.targetNo,
      harga: invoice.sellPrice,
    },
    total: invoice.sellPrice,
    metode: "QRIS",
    status: invoice.status,
    snRef: invoice.snRef,
    voucherCode: invoice.voucherCode,
    namaPelangganMasked: invoice.accountNameMasked,
    footer: args.footer,
    pending: pending || invoice.status === "PROCESSING",
  };
}
