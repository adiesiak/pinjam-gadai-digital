/**
 * Rekonsiliasi pendana — membandingkan total posisi tiap penyedia dana antara
 * dua permukaan PINDAI:
 *
 *  - `panel` — panel admin "Kelola Penyedia Dana" (`daftarInvestor`), dikunci
 *    per akun pengguna lewat `pendanaId` (cadangan: nama/email).
 *  - `rekap` — rekap ruang penyedia dana `/penyedia-dana`
 *    (`daftarPengajuan.rekapPendana`), dikunci per nama tampil pendana.
 *
 * Keduanya diturunkan dari baris pinjaman yang sama (model 1 pinjaman = 1
 * pendana) dengan rumus yang sama, jadi setiap selisih menandakan masalah
 * pemetaan — nama pendana ganda, atau pinjaman yang pendananya tidak punya
 * akun — bukan perbedaan rumus. Fungsi di sini MURNI agar bisa diuji tanpa
 * Convex; komponen UI hanya menampilkan keluarannya.
 */

/** Metrik posisi satu penyedia dana — sama di kedua permukaan. */
export type MetrikPendana = {
  jumlahPinjaman: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  totalBunga: number;
  keuntunganPendana: number;
  keuntunganAdmin: number;
};

/** Urutan metrik yang dibandingkan (dipakai juga untuk menandai selisih). */
export const METRIK_PENDANA: readonly (keyof MetrikPendana)[] = [
  "jumlahPinjaman",
  "totalDisalurkan",
  "saldoBerjalan",
  "totalBunga",
  "keuntunganPendana",
  "keuntunganAdmin",
];

/** Satu sumber data penyedia dana (dari salah satu permukaan). */
export type SumberPendana = {
  nama: string;
  email?: string | null;
  metrik: MetrikPendana;
};

/**
 * `cocok`      — muncul di kedua permukaan dengan seluruh metrik sama.
 * `selisih`    — muncul di keduanya, tetapi ada metrik yang berbeda.
 * `tanpa_rekap`— ada di panel (punya posisi) tetapi tidak di rekap ruang.
 * `tanpa_akun` — ada di rekap (pinjaman berpendana) tetapi tanpa akun panel.
 */
export type StatusRekonsiliasi = "cocok" | "selisih" | "tanpa_rekap" | "tanpa_akun";

export type BarisRekonsiliasi = {
  nama: string;
  email: string | null;
  panel: MetrikPendana | null;
  rekap: MetrikPendana | null;
  status: StatusRekonsiliasi;
  /** Metrik yang nilainya berbeda (hanya terisi saat status `selisih`). */
  selisih: (keyof MetrikPendana)[];
};

export type HasilRekonsiliasi = {
  rows: BarisRekonsiliasi[];
  ringkasan: {
    jumlahPendana: number;
    cocok: number;
    selisih: number;
    tanpaRekap: number;
    tanpaAkun: number;
  };
};

/** Posisi kosong (belum ada pinjaman yang didanai). */
function kosong(m: MetrikPendana): boolean {
  return METRIK_PENDANA.every((k) => m[k] === 0);
}

function bandingkanMetrik(
  panel: MetrikPendana,
  rekap: MetrikPendana,
): { status: StatusRekonsiliasi; selisih: (keyof MetrikPendana)[] } {
  const selisih = METRIK_PENDANA.filter((k) => panel[k] !== rekap[k]);
  return { status: selisih.length === 0 ? "cocok" : "selisih", selisih };
}

/**
 * Bandingkan posisi penyedia dana antar dua permukaan. Baris yang butuh
 * perhatian (selisih / tanpa akun / tanpa rekap) diurutkan lebih dulu.
 */
export function bandingkanPendana(
  panel: readonly SumberPendana[],
  rekap: readonly SumberPendana[],
): HasilRekonsiliasi {
  const rekapPerNama = new Map<string, SumberPendana>();
  for (const r of rekap) rekapPerNama.set(r.nama, r);

  const rows: BarisRekonsiliasi[] = [];
  const dipakai = new Set<string>();

  for (const p of panel) {
    const kunci =
      rekapPerNama.has(p.nama) && p.nama !== ""
        ? p.nama
        : p.email && rekapPerNama.has(p.email)
          ? p.email
          : null;
    const r = kunci === null ? null : rekapPerNama.get(kunci) ?? null;

    if (r === null) {
      // Akun tanpa posisi dan tanpa pasangan rekap tidak relevan untuk
      // rekonsiliasi — hanya menambah baris kosong.
      if (kosong(p.metrik)) continue;
      rows.push({
        nama: p.nama,
        email: p.email ?? null,
        panel: p.metrik,
        rekap: null,
        status: "tanpa_rekap",
        selisih: [],
      });
      continue;
    }

    dipakai.add(kunci as string);
    const { status, selisih } = bandingkanMetrik(p.metrik, r.metrik);
    rows.push({
      nama: p.nama,
      email: p.email ?? null,
      panel: p.metrik,
      rekap: r.metrik,
      status,
      selisih,
    });
  }

  for (const r of rekap) {
    if (dipakai.has(r.nama)) continue;
    rows.push({
      nama: r.nama,
      email: null,
      panel: null,
      rekap: r.metrik,
      status: "tanpa_akun",
      selisih: [],
    });
  }

  rows.sort(
    (a, b) =>
      Number(a.status === "cocok") - Number(b.status === "cocok") ||
      a.nama.localeCompare(b.nama, "id"),
  );

  return {
    rows,
    ringkasan: {
      jumlahPendana: rows.length,
      cocok: rows.filter((r) => r.status === "cocok").length,
      selisih: rows.filter((r) => r.status === "selisih").length,
      tanpaRekap: rows.filter((r) => r.status === "tanpa_rekap").length,
      tanpaAkun: rows.filter((r) => r.status === "tanpa_akun").length,
    },
  };
}
