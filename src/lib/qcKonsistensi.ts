/**
 * QC konsistensi — suite pemeriksaan invariant uang PINDAI (fungsi MURNI).
 *
 * Halaman `/qc` menjalankan suite ini di atas data asli (hasil query Convex)
 * dan menampilkan lulus/gagalnya tiap invariant. Seluruh logika di sini murni
 * dan tidak menyentuh Convex supaya bisa diuji langsung dengan `bun
 * src/lib/qcKonsistensi.test.ts` tanpa DOM maupun server.
 *
 * Empat sumber data yang dibandingkan:
 *  - `ledger` + `entri` — ringkasan & baris jurnal internal (`admin.ledgerSummary`,
 *    `admin.ledgerRows`) — keseimbangan debit/kredit dan pendapatan platform.
 *  - `ruang` — ruang penyedia dana (`penyediaDana.daftarPengajuan`) — angka
 *    bagi hasil per baris pinjaman dan rekap per pendana.
 *  - `panel` — panel admin "Kelola Penyedia Dana" (`penyediaDana.daftarInvestor`).
 *  - `stats` — kartu keuntungan admin (`admin.adminStats`).
 *
 * Status sebuah pemeriksaan:
 *  - `lulus` — invariant terpenuhi.
 *  - `gagal` — invariant dilanggar: angka yang ditampilkan dua permukaan tidak
 *    bisa sama, atau jurnal tidak seimbang. Ini yang membuat suite gagal.
 *  - `awas`  — temuan yang perlu ditinjau manusia tetapi bukan pelanggaran
 *    hitung (mis. pemetaan pendana tanpa pasangan).
 *  - `lewat` — pemeriksaan tidak dapat dijalankan pada data saat ini (data
 *    kosong, baris terpotong, atau sudah ditutup oleh pemeriksaan lain).
 */
import { bagiHasilPinjamanDari } from "./bagiHasil";
import { formatRupiah } from "./money";
import { bandingkanPendana, type MetrikPendana, type SumberPendana } from "./rekonsiliasi";

export type StatusCekQc = "lulus" | "gagal" | "awas" | "lewat";

export type CekQc = {
  id: string;
  grup: string;
  judul: string;
  status: StatusCekQc;
  /** Apa yang diperiksa dan apa yang ditemukan — kalimat utuh berbahasa Indonesia. */
  detail: string;
  /** Angka pengamatan yang ditampilkan di bawah detail (sudah diformat). */
  nilai: string[];
};

export type HasilQc = {
  cek: CekQc[];
  ringkasan: {
    lulus: number;
    gagal: number;
    awas: number;
    lewat: number;
    total: number;
  };
  /** True bila tidak ada satu pun pemeriksaan berstatus `gagal`. */
  lulusSemua: boolean;
};

// ===== Bentuk masukan (dicocokkan struktural dengan hasil query) =====

export type LedgerQc = {
  totalDebit: number;
  totalKredit: number;
  entryCount: number;
  seimbang: boolean;
  pendapatanPlatform: number;
  rincianSkema: { pinjaman: number; gadai: number; kredit: number; lainnya: number };
};

/** Entri jurnal yang dibutuhkan pemeriksaan — hanya bidang yang dibaca. */
export type EntriLedgerQc = {
  groupId: string;
  arah: "debit" | "kredit";
  jumlah: number;
};

export type BarisPinjamanQc = {
  nomorReferensi: string;
  status: string;
  pokokPinjaman: number;
  tenorBulan: number | null;
  persenBunga: number | null;
  bunga: number;
  totalLunas: number;
  potonganAdmin: number;
  keuntunganPendana: number;
  keuntunganAdmin: number;
};

export type RekapPendanaQc = {
  nama: string;
  jumlahPinjaman: number;
  totalDisalurkan: number;
  saldoBerjalan: number;
  totalBunga: number;
  keuntunganPendana: number;
  keuntunganAdmin: number;
  transferBelumDicatat: number;
  keuntunganBelumDicatat: number;
};

export type RuangQc = {
  terpotong: { pinjaman: boolean };
  ringkasan: {
    totalBungaPinjaman: number;
    totalKeuntunganAdmin: number;
    totalKeuntunganPendana: number;
    totalTransferBelumDicatat: number;
    nilaiTransferBelumDicatat: number;
    persenBunga: number;
    persenPotonganAdmin: number;
  };
  rekapPendana: RekapPendanaQc[];
  pinjaman: BarisPinjamanQc[];
};

export type PanelQc = {
  ringkasan: {
    persenBunga: number;
    persenPotonganAdmin: number;
    totalDisalurkan: number;
    saldoBerjalan: number;
    totalBunga: number;
    keuntunganAdmin: number;
    keuntunganPendana: number;
    keuntunganBelumDicatat: number;
  };
  rows: SumberPendana[];
};

export type StatsQc = {
  keuntunganAdminTercatat: number;
  keuntunganAdminBelumTercatat: number;
  /** Kartu pinjaman pada dashboard admin (`admin.adminStats`). */
  totalPinjaman: number;
  pinjamanBaru: number;
  totalPinjamanBerjalan: number;
};

export type InputQc = {
  ledger: LedgerQc;
  tren: { kunci: string; label: string; jumlah: number }[];
  entri: EntriLedgerQc[];
  ruang: RuangQc;
  panel: PanelQc;
  stats: StatsQc;
};

// ===== Kelompok pemeriksaan (urutan tampil di halaman) =====

export const GRUP_QC = [
  "Ledger internal",
  "Ruang penyedia dana",
  "Rekonsiliasi panel ↔ ruang",
  "Panel admin",
] as const;

const LABEL_METRIK: Record<keyof MetrikPendana, string> = {
  jumlahPinjaman: "jumlah pinjaman",
  totalDisalurkan: "total disalurkan",
  saldoBerjalan: "saldo berjalan",
  totalBunga: "bunga",
  keuntunganPendana: "keuntungan pendana",
  keuntunganAdmin: "potongan admin",
};

/** Format rupiah defensif — satu angka warisan non-bulat tidak melumpuhkan QC. */
function rp(n: number): string {
  try {
    return formatRupiah(n);
  } catch {
    return `Rp ${Number(n).toLocaleString("id-ID")}`;
  }
}

function bulatPositif(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/** Jumlahkan bidang pada sekumpulan baris. */
function jumlah<T>(baris: readonly T[], ambil: (b: T) => number): number {
  return baris.reduce((total, b) => total + ambil(b), 0);
}

/** Potong daftar pesan menjadi maksimal `batas` butir + penanda sisa. */
function batasi(pesan: string[], batas = 3): string {
  const sisa = pesan.length - batas;
  return sisa > 0 ? `${pesan.slice(0, batas).join("; ")}; +${sisa} lainnya` : pesan.join("; ");
}

/**
 * Jalankan seluruh suite di atas satu snapshot data.
 * Tidak pernah melempar: data apa pun yang masuk menghasilkan daftar status.
 */
export function jalankanQc(input: InputQc): HasilQc {
  const cek: CekQc[] = [];
  const tambah = (
    id: string,
    grup: (typeof GRUP_QC)[number],
    judul: string,
    status: StatusCekQc,
    detail: string,
    nilai: string[] = [],
  ): void => {
    cek.push({ id, grup, judul, status, detail, nilai });
  };

  // ============ Ledger internal ============

  const { ledger, entri, tren } = input;
  const seimbang =
    ledger.seimbang && ledger.totalDebit === ledger.totalKredit;
  tambah(
    "ledger-seimbang",
    GRUP_QC[0],
    "Total debit sama dengan total kredit",
    seimbang ? "lulus" : "gagal",
    seimbang
      ? `Seluruh ${ledger.entryCount} entri jurnal seimbang pada ${rp(ledger.totalDebit)}.`
      : `Debit ${rp(ledger.totalDebit)} berbeda dengan kredit ${rp(ledger.totalKredit)} — uang diciptakan atau hilang di ledger.`,
    [rp(ledger.totalDebit), rp(ledger.totalKredit), `${ledger.entryCount} entri`],
  );

  // Keseimbangan per grup: kuat dari keseimbangan total — satu grup yang
  // pincang bisa tertutupi grup lain yang kebalikannya.
  const selisihPerGrup = new Map<string, number>();
  for (const e of entri) {
    selisihPerGrup.set(e.groupId, (selisihPerGrup.get(e.groupId) ?? 0) + (e.arah === "debit" ? e.jumlah : -e.jumlah));
  }
  const grupPincang = [...selisihPerGrup.entries()].filter(([, s]) => s !== 0);
  tambah(
    "ledger-grup-seimbang",
    GRUP_QC[0],
    "Setiap grup jurnal seimbang",
    entri.length === 0
      ? "lewat"
      : grupPincang.length === 0
        ? "lulus"
        : "gagal",
    entri.length === 0
      ? "Belum ada entri jurnal untuk diperiksa."
      : grupPincang.length === 0
        ? `${selisihPerGrup.size} grup jurnal semuanya berpasangan debit/kredit.`
        : `${grupPincang.length} grup tidak seimbang: ${batasi(grupPincang.map(([g, s]) => `${g} (${s > 0 ? "+" : ""}${rp(s)})`))}`,
    [
      `${selisihPerGrup.size} grup jurnal`,
      ...grupPincang.slice(0, 3).map(([g, s]) => `${g} ${s > 0 ? "+" : ""}${rp(s)}`),
    ],
  );

  const jumlahTakSah = entri.filter((e) => !bulatPositif(e.jumlah));
  tambah(
    "ledger-jumlah-sah",
    GRUP_QC[0],
    "Jumlah jurnal rupiah bulat non-negatif",
    entri.length === 0
      ? "lewat"
      : jumlahTakSah.length === 0
        ? "lulus"
        : "gagal",
    entri.length === 0
      ? "Belum ada entri jurnal untuk diperiksa."
      : jumlahTakSah.length === 0
        ? `Seluruh ${entri.length} entri memakai rupiah bulat.`
        : `${jumlahTakSah.length} entri bernilai negatif/bukan rupiah bulat.`,
    [
      `${entri.length} entri`,
      ...jumlahTakSah.slice(0, 3).map((e) => `${e.groupId}: ${e.jumlah}`),
    ],
  );

  const rincian = ledger.rincianSkema;
  const jumlahRincian =
    rincian.pinjaman + rincian.gadai + rincian.kredit + rincian.lainnya;
  const rincianCocok = jumlahRincian === ledger.pendapatanPlatform;
  tambah(
    "ledger-rincian-skema",
    GRUP_QC[0],
    "Rincian per skema menjumlah ke pendapatan platform",
    rincianCocok ? "lulus" : "gagal",
    rincianCocok
      ? `Pinjaman ${rp(rincian.pinjaman)} + gadai ${rp(rincian.gadai)} + kredit ${rp(rincian.kredit)} + lainnya ${rp(rincian.lainnya)} = ${rp(jumlahRincian)}.`
      : `Rincian per skema ${rp(jumlahRincian)} tidak sama dengan pendapatan platform ${rp(ledger.pendapatanPlatform)}.`,
    [`pinjaman ${rp(rincian.pinjaman)}`, `gadai ${rp(rincian.gadai)}`, `kredit ${rp(rincian.kredit)}`, `lainnya ${rp(rincian.lainnya)}`],
  );

  const jumlahTren = jumlah(tren, (b) => b.jumlah);
  const trenStatus: StatusCekQc =
    jumlahTren > ledger.pendapatanPlatform
      ? "gagal"
      : jumlahTren === ledger.pendapatanPlatform
        ? "lulus"
        : "lewat";
  tambah(
    "ledger-tren-12-bulan",
    GRUP_QC[0],
    "Grafik tren 12 bulan tidak melebihi total pendapatan",
    trenStatus,
    trenStatus === "gagal"
      ? `Tren menjumlah ${rp(jumlahTren)} sedangkan total pendapatan platform hanya ${rp(ledger.pendapatanPlatform)} — entri terhitung ganda.`
      : trenStatus === "lulus"
        ? `Seluruh pendapatan ${rp(jumlahTren)} berada di jendela 12 bulan terakhir.`
        : `${rp(ledger.pendapatanPlatform - jumlahTren)} pendapatan berada di luar jendela 12 bulan terakhir — grafik hanya memuat 12 bulan, jadi angkanya memang lebih kecil.`,
    [rp(jumlahTren), rp(ledger.pendapatanPlatform), `${tren.length} bulan`],
  );

  // ============ Ruang penyedia dana ============

  const { ruang } = input;
  const baris = ruang.pinjaman;
  const cfg = {
    persenBunga: ruang.ringkasan.persenBunga,
    persenAdmin: ruang.ringkasan.persenPotonganAdmin,
  };

  // 1) Identitas per baris: potongan admin + bagian penyedia = Imbal Hasil,
  //    dan dua bidang keuntungan memang saling menyalin.
  const masalahIdentitas: string[] = [];
  for (const b of baris) {
    const angka = [b.bunga, b.potonganAdmin, b.keuntunganPendana, b.keuntunganAdmin, b.totalLunas];
    if (!angka.every(bulatPositif)) {
      masalahIdentitas.push(`${b.nomorReferensi}: angka bukan rupiah bulat non-negatif`);
      continue;
    }
    if (b.potonganAdmin + b.keuntunganPendana !== b.bunga) {
      masalahIdentitas.push(
        `${b.nomorReferensi}: potongan ${rp(b.potonganAdmin)} + penyedia ${rp(b.keuntunganPendana)} ≠ Imbal Hasil ${rp(b.bunga)}`,
      );
    }
    if (b.keuntunganAdmin !== b.potonganAdmin) {
      masalahIdentitas.push(`${b.nomorReferensi}: kartu admin ≠ potongan pada baris`);
    }
  }
  tambah(
    "baris-identitas",
    GRUP_QC[1],
    "Pembagian Imbal Hasil tiap baris kembali utuh",
    baris.length === 0 ? "lewat" : masalahIdentitas.length === 0 ? "lulus" : "gagal",
    baris.length === 0
      ? "Belum ada baris pinjaman di ruang penyedia dana."
      : masalahIdentitas.length === 0
        ? `${baris.length} baris pinjaman: potongan admin + keuntungan penyedia = Imbal Hasil, tanpa rupiah yang hilang atau diciptakan.`
        : `${masalahIdentitas.length} pelanggaran: ${batasi(masalahIdentitas)}`,
    baris.length === 0
      ? []
      : [
          `Imbal Hasil ${rp(jumlah(baris, (b) => b.bunga))}`,
          `potongan admin ${rp(jumlah(baris, (b) => b.potonganAdmin))}`,
          `penyedia dana ${rp(jumlah(baris, (b) => b.keuntunganPendana))}`,
        ],
  );

  // 2) Hitung ulang dengan mesin uang tunggal (lib/bagiHasil) — angka yang
  //    ditampilkan harus identik dengan yang dihitung dari kebijakan sekarang.
  const salahHitung: string[] = [];
  const gagalHitung: string[] = [];
  for (const b of baris) {
    let ulang: ReturnType<typeof bagiHasilPinjamanDari>;
    try {
      ulang = bagiHasilPinjamanDari(
        {
          pokokPinjaman: b.pokokPinjaman,
          tenorBulan: b.tenorBulan,
          persenBunga: b.persenBunga ?? cfg.persenBunga,
        },
        cfg.persenAdmin,
      );
    } catch (err) {
      gagalHitung.push(
        `${b.nomorReferensi}: ${err instanceof Error ? err.message : "hitung ulang gagal"}`,
      );
      continue;
    }
    if (
      ulang.bunga !== b.bunga ||
      ulang.totalLunas !== b.totalLunas ||
      ulang.potonganAdmin !== b.potonganAdmin ||
      ulang.keuntunganPendana !== b.keuntunganPendana ||
      ulang.keuntunganAdmin !== b.keuntunganAdmin
    ) {
      salahHitung.push(
        `${b.nomorReferensi}: tampil ${rp(b.bunga)}/${rp(b.potonganAdmin)} tetapi dihitung ulang ${rp(ulang.bunga)}/${rp(ulang.potonganAdmin)}`,
      );
    }
  }
  const statusHitung =
    baris.length === 0 ? "lewat" : salahHitung.length > 0 ? "gagal" : gagalHitung.length > 0 ? "awas" : "lulus";
  tambah(
    "baris-hitung-ulang",
    GRUP_QC[1],
    "Angka baris identik dengan hitung ulang kebijakan berjalan",
    statusHitung,
    statusHitung === "lewat"
      ? "Belum ada baris pinjaman untuk dihitung ulang."
      : statusHitung === "lulus"
        ? `${baris.length} baris dihitung ulang lewat bagiHasilPinjamanDari (bunga ${cfg.persenBunga}%, potongan admin ${cfg.persenAdmin}%) — semuanya identik.`
        : statusHitung === "awas"
          ? `${gagalHitung.length} baris jatuh ke nilai nol karena masukan di luar rentang: ${batasi(gagalHitung)}`
          : `${salahHitung.length} baris tidak cocok dengan hitung ulang: ${batasi(salahHitung)}`,
    [`bunga ${cfg.persenBunga}%`, `potongan admin ${cfg.persenAdmin}%`, `${baris.length} baris`],
  );

  // 3) Ringkasan ruang harus dijumlah dari baris/rekap yang sama.
  const jumlahBungaBaris = jumlah(baris, (b) => b.bunga);
  const rekap = ruang.rekapPendana;
  const jumlahRekap = {
    keuntunganAdmin: jumlah(rekap, (r) => r.keuntunganAdmin),
    keuntunganPendana: jumlah(rekap, (r) => r.keuntunganPendana),
    transferBelumDicatat: jumlah(rekap, (r) => r.transferBelumDicatat),
    keuntunganBelumDicatat: jumlah(rekap, (r) => r.keuntunganBelumDicatat),
    totalDisalurkan: jumlah(rekap, (r) => r.totalDisalurkan),
    saldoBerjalan: jumlah(rekap, (r) => r.saldoBerjalan),
    totalBunga: jumlah(rekap, (r) => r.totalBunga),
  };
  const bedaRingkas: string[] = [];
  const cocokkan = (label: string, tampil: number, hitung: number): void => {
    if (tampil !== hitung) bedaRingkas.push(`${label}: tampil ${rp(tampil)} vs jumlah ${rp(hitung)}`);
  };
  cocokkan("total bunga pinjaman", ruang.ringkasan.totalBungaPinjaman, jumlahBungaBaris);
  cocokkan("keuntungan admin", ruang.ringkasan.totalKeuntunganAdmin, jumlahRekap.keuntunganAdmin);
  cocokkan("keuntungan penyedia", ruang.ringkasan.totalKeuntunganPendana, jumlahRekap.keuntunganPendana);
  cocokkan(
    "pinjaman belum dicatat transfer",
    ruang.ringkasan.totalTransferBelumDicatat,
    jumlahRekap.transferBelumDicatat,
  );
  cocokkan(
    "nilai belum dicatat transfer",
    ruang.ringkasan.nilaiTransferBelumDicatat,
    jumlahRekap.keuntunganBelumDicatat,
  );
  tambah(
    "ringkasan-ruang",
    GRUP_QC[1],
    "Ringkasan ruang dijumlah dari baris & rekap yang sama",
    baris.length === 0 ? "lewat" : bedaRingkas.length === 0 ? "lulus" : "gagal",
    baris.length === 0
      ? "Belum ada baris pinjaman di ruang penyedia dana."
      : bedaRingkas.length === 0
        ? "Lima total pada kartu ringkasan sama persis dengan jumlah baris/rekap di bawahnya."
        : `${bedaRingkas.length} total tidak cocok: ${batasi(bedaRingkas)}`,
    [
      `bunga ${rp(ruang.ringkasan.totalBungaPinjaman)}`,
      `admin ${rp(ruang.ringkasan.totalKeuntunganAdmin)}`,
      `penyedia ${rp(ruang.ringkasan.totalKeuntunganPendana)}`,
    ],
  );

  // 4) Identitas agregat: potongan admin + bagian penyedia = total Imbal Hasil.
  const agregat = jumlahRekap.keuntunganAdmin + jumlahRekap.keuntunganPendana;
  const agregatOk = agregat === jumlahRekap.totalBunga;
  tambah(
    "identitas-agregat",
    GRUP_QC[1],
    "Keuntungan admin + penyedia = total Imbal Hasil",
    rekap.length === 0 ? "lewat" : agregatOk ? "lulus" : "gagal",
    rekap.length === 0
      ? "Belum ada pendana dengan posisi pinjaman."
      : agregatOk
        ? `${rp(jumlahRekap.keuntunganAdmin)} + ${rp(jumlahRekap.keuntunganPendana)} = ${rp(agregat)} dari seluruh Imbal Hasil.`
        : `${rp(jumlahRekap.keuntunganAdmin)} + ${rp(jumlahRekap.keuntunganPendana)} = ${rp(agregat)} tetapi total Imbal Hasil ${rp(jumlahRekap.totalBunga)}.`,
    [
      rp(jumlahRekap.keuntunganAdmin),
      rp(jumlahRekap.keuntunganPendana),
      rp(jumlahRekap.totalBunga),
    ],
  );

  // 5) Kedua permukaan membaca kebijakan yang sama dari Pengaturan Sistem.
  const kebijakan =
    input.panel.ringkasan.persenBunga === cfg.persenBunga &&
    input.panel.ringkasan.persenPotonganAdmin === cfg.persenAdmin;
  tambah(
    "kebijakan-bersama",
    GRUP_QC[1],
    "Panel admin dan ruang memakai kebijakan yang sama",
    kebijakan ? "lulus" : "gagal",
    kebijakan
      ? `Bunga ${cfg.persenBunga}% dan potongan admin ${cfg.persenAdmin}% dibaca dari sumber Pengaturan Sistem yang sama.`
      : `Panel memakai bunga ${input.panel.ringkasan.persenBunga}% / potongan ${input.panel.ringkasan.persenPotonganAdmin}%, ruang memakai ${cfg.persenBunga}% / ${cfg.persenAdmin}%.`,
    [
      `ruang: ${cfg.persenBunga}% / ${cfg.persenAdmin}%`,
      `panel: ${input.panel.ringkasan.persenBunga}% / ${input.panel.ringkasan.persenPotonganAdmin}%`,
    ],
  );

  // ============ Rekonsiliasi panel ↔ ruang ============

  const sumberPanel: SumberPendana[] = input.panel.rows;
  const sumberRekap: SumberPendana[] = rekap.map((r) => ({
    nama: r.nama,
    metrik: {
      jumlahPinjaman: r.jumlahPinjaman,
      totalDisalurkan: r.totalDisalurkan,
      saldoBerjalan: r.saldoBerjalan,
      totalBunga: r.totalBunga,
      keuntunganPendana: r.keuntunganPendana,
      keuntunganAdmin: r.keuntunganAdmin,
    },
  }));
  const rekonsiliasi = bandingkanPendana(sumberPanel, sumberRekap);
  const { ringkasan: ringkasRek } = rekonsiliasi;

  const barisSelisih = rekonsiliasi.rows.filter((r) => r.status === "selisih");
  tambah(
    "rekonsiliasi-selisih",
    GRUP_QC[2],
    "Angka per pendana identik di kedua permukaan",
    ringkasRek.jumlahPendana === 0
      ? "lewat"
      : barisSelisih.length === 0
        ? "lulus"
        : "gagal",
    ringkasRek.jumlahPendana === 0
      ? "Belum ada pendana untuk direkonsiliasi."
      : barisSelisih.length === 0
        ? `${ringkasRek.cocok} dari ${ringkasRek.jumlahPendana} pendana cocok di panel admin dan ruang penyedia dana.`
        : `${barisSelisih.length} pendana berbeda angkanya: ${batasi(
            barisSelisih.map((r) => `${r.nama} (${r.selisih.map((m) => LABEL_METRIK[m]).join(", ")})`),
          )}`,
    [
      `${ringkasRek.cocok} cocok`,
      `${ringkasRek.selisih} selisih`,
      `${ringkasRek.jumlahPendana} pendana`,
    ],
  );

  const tanpaPasangan = ringkasRek.tanpaRekap + ringkasRek.tanpaAkun;
  tambah(
    "rekonsiliasi-pemetaan",
    GRUP_QC[2],
    "Setiap pendana punya pasangan di kedua permukaan",
    ringkasRek.jumlahPendana === 0
      ? "lewat"
      : tanpaPasangan === 0
        ? "lulus"
        : "awas",
    ringkasRek.jumlahPendana === 0
      ? "Belum ada pendana untuk dipasangkan."
      : tanpaPasangan === 0
        ? "Tidak ada pendana tanpa akun panel atau tanpa rekap ruang."
        : `${ringkasRek.tanpaRekap} akun panel tanpa rekap ruang, ${ringkasRek.tanpaAkun} pinjaman berpendana tanpa akun panel — perlu ditinjau (pemetaan nama, bukan beda rumus).`,
    [`${ringkasRek.tanpaRekap} tanpa rekap`, `${ringkasRek.tanpaAkun} tanpa akun`],
  );

  // 6) Bila pemetaan bersih, jumlah besar kedua permukaan wajib sama.
  const pemetaanBersih = barisSelisih.length === 0 && tanpaPasangan === 0;
  const bedaTotal: string[] = [];
  const cocokTotal = (label: string, kiri: number, kanan: number): void => {
    if (kiri !== kanan) bedaTotal.push(`${label}: panel ${rp(kiri)} vs ruang ${rp(kanan)}`);
  };
  cocokTotal(
    "total disalurkan",
    input.panel.ringkasan.totalDisalurkan,
    jumlahRekap.totalDisalurkan,
  );
  cocokTotal("saldo berjalan", input.panel.ringkasan.saldoBerjalan, jumlahRekap.saldoBerjalan);
  cocokTotal("total bunga", input.panel.ringkasan.totalBunga, jumlahRekap.totalBunga);
  cocokTotal("keuntungan admin", input.panel.ringkasan.keuntunganAdmin, ruang.ringkasan.totalKeuntunganAdmin);
  cocokTotal("keuntungan penyedia", input.panel.ringkasan.keuntunganPendana, ruang.ringkasan.totalKeuntunganPendana);
  cocokTotal(
    "keuntungan belum dicatat",
    input.panel.ringkasan.keuntunganBelumDicatat,
    ruang.ringkasan.nilaiTransferBelumDicatat,
  );
  tambah(
    "total-panel-ruang",
    GRUP_QC[2],
    "Jumlah besar panel admin = jumlah besar ruang penyedia dana",
    !pemetaanBersih ? "lewat" : bedaTotal.length === 0 ? "lulus" : "gagal",
    !pemetaanBersih
      ? "Ditutup oleh pemeriksaan pemetaan di atas — perbaiki selisih/pasangan pendana lebih dulu."
      : bedaTotal.length === 0
        ? "Enam total besar (disalurkan, saldo, bunga, keuntungan admin/penyedia, transfer) sama di kedua permukaan."
        : `${bedaTotal.length} total berbeda: ${batasi(bedaTotal)}`,
    pemetaanBersih
      ? [
          `disalurkan ${rp(input.panel.ringkasan.totalDisalurkan)}`,
          `bunga ${rp(input.panel.ringkasan.totalBunga)}`,
          `admin ${rp(input.panel.ringkasan.keuntunganAdmin)}`,
        ]
      : [],
  );

  // ============ Panel admin ============

  const { stats } = input;
  const keuntunganAdminPanel =
    stats.keuntunganAdminTercatat + stats.keuntunganAdminBelumTercatat;
  const keuntunganAdminRuang = jumlah(
    baris.filter((b) => b.status === "didanai" || b.status === "lunas"),
    (b) => b.keuntunganAdmin,
  );
  const statusAdmin =
    ruang.terpotong.pinjaman
      ? ("lewat" as const)
      : keuntunganAdminPanel === keuntunganAdminRuang
        ? ("lulus" as const)
        : ("gagal" as const);
  tambah(
    "admin-vs-ruang",
    GRUP_QC[3],
    "Kartu keuntungan admin = jumlah potongan pada baris ruang",
    statusAdmin,
    statusAdmin === "lewat"
      ? `Baris ruang terpotong pada batas ${baris.length} — jumlah pinjaman melebihi jangkauan satu query, jadi perbandingan dilewati.`
      : statusAdmin === "lulus"
        ? `Sudah tercatat ${rp(stats.keuntunganAdminTercatat)} + belum tercatat ${rp(stats.keuntunganAdminBelumTercatat)} = ${rp(keuntunganAdminPanel)}, sama dengan jumlah potongan pada ${baris.filter((b) => b.status === "didanai" || b.status === "lunas").length} baris berjalan/lunas.`
        : `Kartu admin ${rp(keuntunganAdminPanel)} ≠ jumlah potongan baris ${rp(keuntunganAdminRuang)}.`,
    [
      `tercatat ${rp(stats.keuntunganAdminTercatat)}`,
      `belum tercatat ${rp(stats.keuntunganAdminBelumTercatat)}`,
      `baris ruang ${rp(keuntunganAdminRuang)}`,
    ],
  );

  // Kartu pinjaman dashboard admin dihitung dari SELURUH tabel loans; baris
  // ruang berisi semua loans juga — jadi keduanya wajib sama selama baris
  // tidak terpotong. Salah satu ketiganya berbeda = ada angka dashboard yang
  // tidak berasal dari data yang sama dengan yang dilihat penyedia dana.
  const berjalanBaris = baris.filter((b) => b.status === "didanai");
  const diajukanBaris = baris.filter((b) => b.status === "diajukan");
  const bedaKartu: string[] = [];
  const cocokKartu = (label: string, kartu: number, dariBaris: number): void => {
    if (kartu !== dariBaris) bedaKartu.push(`${label}: kartu ${kartu} vs baris ${dariBaris}`);
  };
  if (!ruang.terpotong.pinjaman) {
    cocokKartu("jumlah pinjaman", stats.totalPinjaman, baris.length);
    cocokKartu("pengajuan menunggu", stats.pinjamanBaru, diajukanBaris.length);
    cocokKartu(
      "nilai pinjaman berjalan",
      stats.totalPinjamanBerjalan,
      jumlah(berjalanBaris, (b) => b.pokokPinjaman),
    );
  }
  const statusKartu =
    ruang.terpotong.pinjaman
      ? ("lewat" as const)
      : bedaKartu.length === 0
        ? ("lulus" as const)
        : ("gagal" as const);
  tambah(
    "admin-kartu-pinjaman",
    GRUP_QC[3],
    "Kartu pinjaman dashboard admin = baris ruang penyedia dana",
    statusKartu,
    statusKartu === "lewat"
      ? `Baris ruang terpotong pada batas ${baris.length} — perbandingan kartu pinjaman dilewati.`
      : statusKartu === "lulus"
        ? `${stats.totalPinjaman} pinjaman (${stats.pinjamanBaru} menunggu review), yang berjalan ${rp(stats.totalPinjamanBerjalan)} — identik dengan baris ruang.`
        : `${bedaKartu.length} kartu tidak cocok dengan baris ruang: ${batasi(bedaKartu)}`,
    [
      `${stats.totalPinjaman} total pinjaman`,
      `${stats.pinjamanBaru} menunggu review`,
      rp(stats.totalPinjamanBerjalan),
    ],
  );

  const ringkasan = {
    lulus: cek.filter((c) => c.status === "lulus").length,
    gagal: cek.filter((c) => c.status === "gagal").length,
    awas: cek.filter((c) => c.status === "awas").length,
    lewat: cek.filter((c) => c.status === "lewat").length,
    total: cek.length,
  };
  return { cek, ringkasan, lulusSemua: ringkasan.gagal === 0 };
}
