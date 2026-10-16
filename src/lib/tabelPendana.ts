/**
 * Aturan tabel perbandingan pendana — fungsi MURNI, tanpa React.
 *
 * Dipisah dari komponennya supaya aturan yang mudah salah bisa diuji sebagai
 * skrip biasa (`bun src/lib/tabelPendana.test.ts`), bukan hanya lewat markup:
 * arah urut, pemecah seri, dan penjumlahan kolom. Pola yang sama sudah dipakai
 * tabel aliran dana dan grafik keuntungan sebelum ini.
 */

/** Rekap satu pendana — hanya field yang benar-benar dibaca tabel ini. */
export type SumberPendana = {
  nama: string;
  jumlahPinjaman: number;
  jumlahAktif: number;
  jumlahLunas: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  keuntunganPendana: number;
  keuntunganPendanaLunas: number;
  keuntunganPendanaBelumLunas: number;
  keuntunganAdmin: number;
  keuntunganAdminLunas: number;
  keuntunganAdminBelumLunas: number;
  transferTercatat: number;
  transferBelumDicatat: number;
  keuntunganBelumDicatat: number;
};

/**
 * Satu pinjaman yang membentuk angka "Perkiraan (belum lunas)" pada satu baris
 * pendana.
 *
 * Sengaja bukan `BarisPinjaman` (tipe server) supaya tabelnya tetap murni
 * presentasional dan bisa diuji tanpa membawa seluruh bentuk data server:
 * pemanggil cukup memetakan nomor referensi, nama, dan keuntungannya.
 */
export type RincianPerkiraan = {
  id: string;
  nomorReferensi: string;
  namaLengkap: string;
  keuntunganPendana: number;
};

/** Kolom angka yang bisa diurutkan. */
export type KunciUrut =
  | "nama"
  | "tersalurkan"
  | "berjalan"
  | "dibukukan"
  | "perkiraan"
  | "total"
  | "admin";

/** Kolom angka tanpa kolom nama: kunci yang nilainya uang. */
export type KunciAngka = Exclude<KunciUrut, "nama">;

export type ArahUrut = "naik" | "turun";

export type UrutanPendana = { kunci: KunciUrut; arah: ArahUrut };

/**
 * Kolom tabel, urutannya sekaligus jadi kontrak tampilan.
 *
 * Satu tabel, bukan tiga permukaan: sebelumnya modal pendana digambar ulang
 * sebagai dua grafik batang dan satu grid kartu per pendana, sehingga angka yang
 * sama muncul tiga kali dengan susunan berbeda dan pembaca harus mencocokkan
 * sendiri mana yang setara. Di sini setiap angka punya tepat satu kolom, dan
 * tiap kolom bisa diurutkan — perbandingan antarpendana jadi tindakan, bukan
 * pembacaan ulang.
 *
 * Labelnya juga disatukan dengan seluruh halaman: "Dibukukan (lunas)" dan
 * "Perkiraan (belum lunas)" dipakai sama persis di kartu ringkasan dan panel
 * aturan perhitungan, jadi uang yang sudah cair tidak pernah tertukar dengan
 * hitungan atas pinjaman berjalan.
 */
export const KOLOM_PENDANA: readonly { kunci: KunciUrut; label: string }[] = [
  { kunci: "nama", label: "Pendana" },
  { kunci: "tersalurkan", label: "Dana tersalurkan" },
  { kunci: "berjalan", label: "Masih berjalan" },
  { kunci: "dibukukan", label: "Dibukukan (lunas)" },
  { kunci: "perkiraan", label: "Perkiraan (belum lunas)" },
  { kunci: "total", label: "Total keuntungan" },
  { kunci: "admin", label: "Biaya platform (layanan)" },
];

/**
 * Kolom yang benar-benar punya tempat di tabel — sekaligus satu-satunya
 * pilihan pengurutnya.
 *
 * "Masih berjalan" tetap ada di daftar ini meski angkanya bukan kolom sendiri:
 * ia keterangan di dalam sel "Dana tersalurkan", dan yang bisa diurutkan adalah
 * angka yang bisa dibaca pembaca. Sebaliknya "Total keuntungan" tidak di sini —
 * ia jumlah dari "Dibukukan (lunas)" dan "Perkiraan (belum lunas)", jadi
 * menawarkannya sebagai dasar urutan berarti menawarkan angka yang tidak punya
 * kolom untuk dicocokkan.
 */
export const KOLOM_URUT: readonly KunciUrut[] = [
  "nama",
  "tersalurkan",
  "berjalan",
  "dibukukan",
  "perkiraan",
  "admin",
];

/**
 * Urutan bawaan: dana tersalurkan terbesar lebih dulu — pendana terbesar paling
 * perlu dibaca lebih dulu, dan angkanya sama dengan urutan yang sudah dipakai
 * server (`rekapPendana`).
 */
export const URUTAN_AWAL: UrutanPendana = { kunci: "tersalurkan", arah: "turun" };

/** Nilai satu kolom untuk pengurutan; nama dibandingkan tanpa huruf besar/kecil. */
function nilai(r: SumberPendana, kunci: KunciUrut): number | string {
  switch (kunci) {
    case "nama":
      return r.nama.toLocaleLowerCase("id-ID");
    case "tersalurkan":
      return r.totalDisalurkan;
    case "berjalan":
      return r.saldoBerjalan;
    case "dibukukan":
      return r.keuntunganPendanaLunas;
    case "perkiraan":
      return r.keuntunganPendanaBelumLunas;
    case "total":
      return r.keuntunganPendana;
    case "admin":
      return r.keuntunganAdmin;
  }
}

/**
 * Nilai satu kolom angka pada satu baris rekap.
 *
 * Dipakai bersama oleh tabel perbandingan (dibaca admin dan pemantau) dan panel
 * portofolio pribadi pendana, supaya kedua permukaan tidak pernah menghitung
 * kolom yang sama dengan cara berbeda.
 */
export function nilaiAngka(r: SumberPendana, kunci: KunciAngka): number {
  const angka = nilai(r, kunci);
  return typeof angka === "number" ? angka : 0;
}

/** Jumlah satu kolom angka di seluruh baris yang sedang dihitung. */
export function nilaiTotal(t: TotalPendana, kunci: KunciAngka): number {
  switch (kunci) {
    case "tersalurkan":
      return t.totalDisalurkan;
    case "berjalan":
      return t.saldoBerjalan;
    case "dibukukan":
      return t.keuntunganPendanaLunas;
    case "perkiraan":
      return t.keuntunganPendanaBelumLunas;
    case "total":
      return t.keuntunganPendana;
    case "admin":
      return t.keuntunganAdmin;
  }
}

/**
 * Urutkan rekap pendana menurut satu kolom.
 *
 * Pemecah serinya selalu nama (naik): dua pendana dengan angka sama harus muncul
 * dalam urutan yang sama di setiap render, supaya barisnya tidak bertukar tempat
 * saat angka lain berubah. Masukannya tidak diubah — hasilnya salinan baru.
 */
export function urutkanPendana<T extends SumberPendana>(
  rekap: readonly T[],
  urutan: UrutanPendana,
): T[] {
  const faktor = urutan.arah === "naik" ? 1 : -1;
  return [...rekap].sort((a, b) => {
    const x = nilai(a, urutan.kunci);
    const y = nilai(b, urutan.kunci);
    if (x !== y) {
      if (typeof x === "string" || typeof y === "string") {
        return String(x).localeCompare(String(y), "id-ID") * faktor;
      }
      return (x - y) * faktor;
    }
    return a.nama.localeCompare(b.nama, "id-ID");
  });
}

/**
 * Pangsa dana yang masih berjalan dari seluruh dana tersalurkan (0..1).
 *
 * Dipakai bilah kecil di bawah "Dana tersalurkan": ia menjawab berapa bagian
 * dari uang yang sudah keluar itu belum kembali. Batas 0..1 dijaga di sini,
 * bukan di komponennya, supaya baris dengan angka tak terduga (mis. saldo
 * berjalan lebih besar dari dana tersalurkan karena koreksi manual) tidak
 * membuat bilahnya melebar keluar sel.
 *
 * Masukannya cukup dua angka itu, bukan seluruh baris rekap: baris total
 * (`TotalPendana`) juga punya keduanya, jadi satu aturan yang sama bisa dipakai
 * untuk satu baris maupun untuk jumlah seluruh baris.
 */
export function pangsaBerjalan(
  r: Pick<SumberPendana, "totalDisalurkan" | "saldoBerjalan">,
): number {
  if (r.totalDisalurkan <= 0) return 0;
  const pangsa = r.saldoBerjalan / r.totalDisalurkan;
  return Math.min(1, Math.max(0, pangsa));
}

/** Jumlah satu kolom di seluruh rekap — dasar baris total. */
export type TotalPendana = {
  jumlahPendana: number;
  jumlahPinjaman: number;
  jumlahAktif: number;
  jumlahLunas: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  keuntunganPendanaLunas: number;
  keuntunganPendanaBelumLunas: number;
  keuntunganPendana: number;
  keuntunganAdmin: number;
  transferBelumDicatat: number;
  keuntunganBelumDicatat: number;
};

/**
 * Baris total tabel — dihitung dari baris yang benar-benar ditampilkan, bukan
 * dari angka tersimpan yang lain, supaya jumlah kolom tidak pernah berbeda dari
 * penjumlahan yang bisa dibaca pembaca sendiri.
 */
export function totalPendana(rekap: readonly SumberPendana[]): TotalPendana {
  return {
    jumlahPendana: rekap.length,
    jumlahPinjaman: rekap.reduce((t, r) => t + r.jumlahPinjaman, 0),
    jumlahAktif: rekap.reduce((t, r) => t + r.jumlahAktif, 0),
    jumlahLunas: rekap.reduce((t, r) => t + r.jumlahLunas, 0),
    totalDisalurkan: rekap.reduce((t, r) => t + r.totalDisalurkan, 0),
    saldoBerjalan: rekap.reduce((t, r) => t + r.saldoBerjalan, 0),
    keuntunganPendanaLunas: rekap.reduce((t, r) => t + r.keuntunganPendanaLunas, 0),
    keuntunganPendanaBelumLunas: rekap.reduce((t, r) => t + r.keuntunganPendanaBelumLunas, 0),
    keuntunganPendana: rekap.reduce((t, r) => t + r.keuntunganPendana, 0),
    keuntunganAdmin: rekap.reduce((t, r) => t + r.keuntunganAdmin, 0),
    transferBelumDicatat: rekap.reduce((t, r) => t + r.transferBelumDicatat, 0),
    keuntunganBelumDicatat: rekap.reduce((t, r) => t + r.keuntunganBelumDicatat, 0),
  };
}
