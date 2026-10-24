/**
 * RINCIAN PINJAMAN — satu sumber untuk dokumen PDF, badan email, dan pesan
 * WhatsApp.
 *
 * Semua nominal berasal dari mesin perhitungan yang sama dengan dashboard
 * (`quotePinjaman` / `simulasiBulananPinjaman` dan `pelunasanPinjaman`), bukan
 * dihitung ulang di sini. Dua tempat yang menghitung sendiri cepat atau lambat
 * akan berbeda angka dengan yang dilihat peminjam di layarnya.
 */
import type { TarifBulanan } from "./bulanan";
import {
  loanPurposeLabel,
  pelunasanPinjaman,
  quotePinjaman,
  simulasiBulananPinjaman,
  type TarifBiaya,
} from "./loan";
import { formatRupiahAman } from "./money";
import { labelStatusPinjaman } from "./statusPinjaman";
import { formatTanggalWIB } from "./waktu";

/** Baris label/nilai pada dokumen. */
export type NadaRincian = "potongan" | "bersih" | "total";

export type BarisRincian = {
  label: string;
  nilai: string;
  /** Baris penentu: total atau dana bersih, dicetak tebal. */
  tegas?: boolean;
  /** Nada tampilan di PDF: potongan merah, dana bersih hijau, total tebal. */
  nada?: NadaRincian;
};

export type KelompokRincian = {
  judul: string;
  baris: BarisRincian[];
};

export type JadwalRincian = {
  judul: string;
  kolom: string[];
  baris: string[][];
};

export type DokumenRincianPinjaman = {
  nomorReferensi: string;
  namaPeminjam: string;
  statusLabel: string;
  skemaTeks: string;
  tenorTeks: string;
  pokokPinjaman: number;
  diajukanTeks: string;
  dicairkanTeks: string | null;
  jatuhTempoTeks: string | null;
  /** Total kewajiban saat ini, termasuk denda bila ada. */
  totalKewajiban: number | null;
  dendaTerlambat: number;
  hariTerlambat: number;
  sisaHari: number | null;
  kelompok: KelompokRincian[];
  jadwal: JadwalRincian | null;
  catatan: string[];
  dibuatPada: number;
};

/** Bagian baris pinjaman yang dibutuhkan dokumen ini. */
export type PinjamanUntukRincian = {
  nomorReferensi: string;
  namaLengkap: string;
  status: string;
  pokokPinjaman: number;
  tenorHari: number;
  tenorBulan?: number | null;
  persenBunga?: number | null;
  /** Snapshot tarif skema bulanan; null/kosong = tarif bawaan. */
  tarifBulanan?: TarifBulanan | null;
  /** Centang cair ekspres peminjam; null/kosong = data lama (ekspres dipakai). */
  cairEkspres?: boolean | null;
  /** Snapshot tarif potongan di muka; null/kosong = tarif bawaan. */
  tarifBiaya?: Partial<TarifBiaya> | null;
  didanaiPada?: number | null;
  diajukanPada: number;
  tujuan?: string;
  namaBank?: string | null;
  nomorRekening?: string | null;
};

export type OpsiRincian = {
  /** Waktu dokumen dibuat, dipakai untuk hitungan sisa hari dan denda. */
  sekarang: number;
  /** Tarif denda per hari (persen pokok) dari Pengaturan Sistem. */
  dendaPerHari: number;
};

/** Rupiah tanpa melempar pada baris warisan yang tidak bulat. */
function rp(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Persentase satu komponen terhadap pokok, satu desimal gaya Indonesia. */
function persenDari(nilai: number, pokok: number): string {
  if (!Number.isFinite(nilai) || !Number.isFinite(pokok) || pokok <= 0) return "0";
  return (Math.round((nilai / pokok) * 1000) / 10).toLocaleString("id-ID");
}

/** Nomor rekening disamarkan sampai empat angka terakhir. */
export function samarkanRekening(nomor: string): string {
  const bersih = nomor.replace(/\s+/g, "");
  if (bersih.length <= 4) return bersih;
  return `•••• ${bersih.slice(-4)}`;
}

function tanggal(ms: number): string {
  return formatTanggalWIB(ms);
}

/** Label komponen potongan di muka mengikuti tenor & tarif yang dipakainya. */
function labelPotonganDiMuka(tenorBulan: number, persen: number): string {
  const adminPlatform = tenorBulan === 3 || tenorBulan === 6;
  return adminPlatform
    ? `Biaya admin (${persen}%, dipotong di muka)`
    : `Biaya layanan (${persen}%, dipotong di muka)`;
}

/**
 * Susun dokumen rincian dari satu baris `loans`.
 *
 * Cabang bulanan dipakai saat `tenorBulan` terisi; sebelum itu pinjaman
 * memakai skema harian dengan bunga dari `persenBunga` nasabah atau tarif
 * global.
 */
export function susunRincianPinjaman(
  loan: PinjamanUntukRincian,
  opsi: OpsiRincian,
): DokumenRincianPinjaman {
  const tenorBulan = loan.tenorBulan ?? null;
  const bulanan = tenorBulan !== null;
  const pelunasan = pelunasanPinjaman(
    {
      pokokPinjaman: loan.pokokPinjaman,
      status: loan.status,
      tenorHari: loan.tenorHari,
      ...(tenorBulan === null ? {} : { tenorBulan }),
      ...(loan.didanaiPada === null || loan.didanaiPada === undefined
        ? {}
        : { didanaiPada: loan.didanaiPada }),
      ...(loan.persenBunga === null || loan.persenBunga === undefined
        ? {}
        : { persenBunga: loan.persenBunga }),
      tarifBulanan: loan.tarifBulanan ?? null,
    },
    opsi.sekarang,
    opsi.dendaPerHari,
  );

  const pengajuan: BarisRincian[] = [];
  if (loan.tujuan !== undefined && loan.tujuan !== "") {
    pengajuan.push({ label: "Keperluan", nilai: loanPurposeLabel(loan.tujuan) });
  }
  pengajuan.push({
    label: "Tenor",
    nilai: bulanan ? `${tenorBulan} bulan` : `${loan.tenorHari} hari`,
  });
  pengajuan.push({ label: "Tanggal pengajuan", nilai: tanggal(loan.diajukanPada) });
  pengajuan.push({
    label: "Tanggal dana dicairkan",
    nilai:
      loan.didanaiPada === null || loan.didanaiPada === undefined
        ? "Belum dicairkan"
        : tanggal(loan.didanaiPada),
  });

  const kelompok: KelompokRincian[] = [{ judul: "Pengajuan", baris: pengajuan }];
  let jadwal: JadwalRincian | null = null;

  if (bulanan) {
    const sim = simulasiBulananPinjaman({
      pokokPinjaman: loan.pokokPinjaman,
      tenorBulan,
      ...(loan.persenBunga === null || loan.persenBunga === undefined
        ? {}
        : { persenBunga: loan.persenBunga }),
      tarifBulanan: loan.tarifBulanan ?? null,
    });
    const dana: BarisRincian[] = [
      { label: "Pokok dibiayai", nilai: rp(sim.pokokDibiayai) },
      {
        label: labelPotonganDiMuka(
          tenorBulan,
          sim.tarif.persenBiayaLayananBulanan,
        ),
        nilai: rp(sim.potonganDiMuka),
        nada: "potongan",
      },
      {
        label: "Dana bersih ke rekening",
        nilai: rp(sim.danaDiterima),
        tegas: true,
        nada: "bersih",
      },
    ];
    const rekening = rekeningTujuan(loan);
    if (rekening !== null) dana.push({ label: "Rekening tujuan", nilai: rekening });

    const bayar: BarisRincian[] = [
      {
        label: `Cicilan per bulan (bulan 1 sampai ${Math.max(sim.tenorBulan - 1, 1)})`,
        nilai: rp(sim.cicilanPerBulan),
      },
    ];
    if (sim.cicilanTerakhir !== sim.cicilanPerBulan) {
      bayar.push({ label: `Cicilan bulan ${sim.tenorBulan}`, nilai: rp(sim.cicilanTerakhir) });
    }
    bayar.push({
      label: `Bunga (${sim.persenBungaPerBulan}% per bulan, flat)`,
      nilai: rp(sim.bungaTotal),
    });
    bayar.push({
      label: `Biaya admin tiap cicilan (${sim.tarif.persenBiayaAdminCicilanBulanan}% dari nominal cicilan)`,
      nilai: rp(sim.biayaAdminCicilanTotal),
    });
    bayar.push({
      label: `Total yang dibayar selama ${sim.tenorBulan} bulan`,
      nilai: rp(sim.totalPengembalian),
      tegas: true,
      nada: "total",
    });

    kelompok.push(
      { judul: "Dana yang Anda terima", baris: dana },
      { judul: "Yang Anda bayar", baris: bayar },
    );

    jadwal = {
      judul: "Jadwal cicilan",
      kolom: ["Bulan", "Pokok", "Bunga", "Biaya admin", "Total"],
      baris: sim.jadwal.map((baris) => [
        `Bulan ${baris.bulan}`,
        rp(baris.pokok),
        rp(baris.bunga),
        rp(baris.biayaAdminCicilan),
        rp(baris.total),
      ]),
    };
  } else {
    const quote = quotePinjaman({
      pokokPinjaman: loan.pokokPinjaman,
      ...(loan.persenBunga === null || loan.persenBunga === undefined
        ? {}
        : { persenBunga: loan.persenBunga }),
      ...(loan.cairEkspres === null || loan.cairEkspres === undefined
        ? {}
        : { cairEkspres: loan.cairEkspres }),
      ...(loan.tarifBiaya === null || loan.tarifBiaya === undefined
        ? {}
        : { tarifBiaya: loan.tarifBiaya }),
    });
    const dana: BarisRincian[] = [
      { label: "Pokok pinjaman", nilai: rp(quote.pokok) },
      ...(quote.biayaAsuransi > 0
        ? [
            {
              label: `Biaya asuransi (${persenDari(quote.biayaAsuransi, quote.pokok)}%, dipotong di muka)`,
              nilai: rp(quote.biayaAsuransi),
              nada: "potongan" as const,
            },
          ]
        : []),
      {
        label: `Biaya admin (${persenDari(quote.biayaAdmin, quote.pokok)}%, dipotong di muka)`,
        nilai: rp(quote.biayaAdmin),
        nada: "potongan",
      },
      {
        label: "Biaya platform (0%, dipotong di muka)",
        nilai: rp(quote.biayaPlatform),
        ...(quote.biayaPlatform > 0 ? { nada: "potongan" as const } : {}),
      },
      ...(quote.biayaExpress > 0
        ? [
            {
              label: "Biaya pencairan ekspres",
              nilai: rp(quote.biayaExpress),
              nada: "potongan" as const,
            },
          ]
        : [{ label: "Pencairan ekspres", nilai: "Tidak dipakai" }]),
      {
        label: "Dana bersih ke rekening",
        nilai: rp(quote.danaBersihDitransfer),
        tegas: true,
        nada: "bersih",
      },
    ];
    const rekening = rekeningTujuan(loan);
    if (rekening !== null) dana.push({ label: "Rekening tujuan", nilai: rekening });

    const bayar: BarisRincian[] = [
      { label: "Pokok pinjaman", nilai: rp(quote.pokok) },
      { label: `Bunga (${loan.persenBunga ?? 30}% dari pokok)`, nilai: rp(quote.bunga) },
      {
        label: "Total kewajiban saat jatuh tempo",
        nilai: rp(quote.totalKewajibanPelunasan),
        tegas: true,
        nada: "total",
      },
      { label: "Cara bayar", nilai: "Sekali lunas pada tanggal jatuh tempo" },
    ];
    kelompok.push(
      { judul: "Dana yang Anda terima", baris: dana },
      { judul: "Yang Anda bayar", baris: bayar },
    );
  }

  if (pelunasan !== null) {
    const status: BarisRincian[] = [
      { label: "Jatuh tempo", nilai: tanggal(pelunasan.jatuhTempoPada) },
      {
        label: pelunasan.hariTerlambat > 0 ? "Terlambat" : "Sisa waktu",
        nilai:
          pelunasan.hariTerlambat > 0
            ? `${pelunasan.hariTerlambat} hari`
            : pelunasan.sisaHari === 0
              ? "Jatuh tempo hari ini"
              : `${pelunasan.sisaHari} hari lagi`,
      },
    ];
    if (pelunasan.dendaTerlambat > 0) {
      status.push({
        label: "Denda keterlambatan",
        nilai: rp(pelunasan.dendaTerlambat),
        nada: "potongan",
      });
    }
    status.push({
      label: "Total yang harus dibayar sekarang",
      nilai: rp(pelunasan.totalKewajibanDenganPenalti),
      tegas: true,
      nada: "total",
    });
    kelompok.push({ judul: "Status hari ini", baris: status });
  }

  return {
    nomorReferensi: loan.nomorReferensi,
    namaPeminjam: loan.namaLengkap,
    statusLabel: labelStatusPinjaman(loan.status),
    skemaTeks: bulanan ? "Bulanan" : "Harian",
    tenorTeks: bulanan ? `${tenorBulan} bulan` : `${loan.tenorHari} hari`,
    pokokPinjaman: loan.pokokPinjaman,
    diajukanTeks: tanggal(loan.diajukanPada),
    dicairkanTeks:
      loan.didanaiPada === null || loan.didanaiPada === undefined
        ? null
        : tanggal(loan.didanaiPada),
    jatuhTempoTeks: pelunasan === null ? null : tanggal(pelunasan.jatuhTempoPada),
    totalKewajiban: pelunasan?.totalKewajibanDenganPenalti ?? null,
    dendaTerlambat: pelunasan?.dendaTerlambat ?? 0,
    hariTerlambat: pelunasan?.hariTerlambat ?? 0,
    sisaHari: pelunasan?.sisaHari ?? null,
    kelompok,
    jadwal,
    catatan: catatanDokumen(loan),
    dibuatPada: opsi.sekarang,
  };
}

/** Label rekening tujuan, atau null bila datanya tidak lengkap. */
function rekeningTujuan(loan: PinjamanUntukRincian): string | null {
  const nomor = loan.nomorRekening?.trim() ?? "";
  if (nomor === "") return null;
  const bank = loan.namaBank?.trim() ?? "";
  return bank === "" ? samarkanRekening(nomor) : `${bank} ${samarkanRekening(nomor)}`;
}

/**
 * Catatan penutup dokumen. Kalimatnya menyebut batas dokumen apa adanya:
 * rincian ini perhitungan internal, bukan bukti pembayaran.
 */
function catatanDokumen(loan: PinjamanUntukRincian): string[] {
  const catatan: string[] = [];
  if (loan.status === "dibatalkan" || loan.status === "ditolak") {
    catatan.push("Pinjaman ini tidak berjalan, jadi tidak ada kewajiban yang perlu dibayar.");
  }
  catatan.push(
    `Dokumen ini dihasilkan dari catatan internal PINDAI untuk pinjaman ${loan.nomorReferensi}.`,
    "Angka dapat berubah bila petugas mencatat pembayaran atau penyesuaian.",
    "Dokumen ini bukan bukti pembayaran. Bukti pembayaran diberikan setelah pembayaran dicatat petugas.",
    "PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp maupun email.",
  );
  return catatan;
}

/** Nama berkas PDF yang diunduh atau dilampirkan. */
export function namaBerkasRincian(dok: DokumenRincianPinjaman): string {
  const referensi = dok.nomorReferensi.trim().replace(/[^A-Za-z0-9-]/g, "-");
  return `PINDAI-Rincian-Pinjaman-${referensi === "" ? "pindai" : referensi}.pdf`;
}

/** Pesan WhatsApp: ringkas, karena rincian penuhnya ada di lampiran PDF. */
export function teksRincianWhatsapp(dok: DokumenRincianPinjaman): string {
  const baris: string[] = [
    `Halo ${dok.namaPeminjam}, berikut rincian pinjaman PINDAI ${dok.nomorReferensi}.`,
    "",
    `Status: ${dok.statusLabel}`,
    `Pokok pinjaman: ${rp(dok.pokokPinjaman)}`,
    `Tenor: ${dok.tenorTeks}`,
  ];
  if (dok.totalKewajiban !== null) {
    baris.push(
      dok.hariTerlambat > 0
        ? `Total kewajiban termasuk denda: ${rp(dok.totalKewajiban)}`
        : `Total kewajiban: ${rp(dok.totalKewajiban)}`,
    );
  }
  if (dok.jatuhTempoTeks !== null) baris.push(`Jatuh tempo: ${dok.jatuhTempoTeks}`);
  baris.push(
    "",
    "Rincian lengkap (potongan di muka, bunga, dan jadwal bayar) kami lampirkan dalam berkas PDF.",
    "Simpan dokumen ini. PINDAI tidak pernah meminta kode OTP atau kata sandi lewat WhatsApp.",
  );
  return baris.join("\n");
}

/** Baris "Label: Nilai" untuk badan email versi teks biasa. */
export function teksRincianEmail(dok: DokumenRincianPinjaman): string {
  const bagian: string[] = [
    "RINCIAN PINJAMAN PINDAI",
    `Nomor referensi: ${dok.nomorReferensi}`,
    `Nama: ${dok.namaPeminjam}`,
    `Status: ${dok.statusLabel}`,
    "",
  ];
  for (const kelompok of dok.kelompok) {
    bagian.push(kelompok.judul.toUpperCase());
    for (const baris of kelompok.baris) bagian.push(`${baris.label}: ${baris.nilai}`);
    bagian.push("");
  }
  if (dok.jadwal !== null) {
    bagian.push(dok.jadwal.judul.toUpperCase());
    bagian.push(dok.jadwal.kolom.join(" | "));
    for (const baris of dok.jadwal.baris) bagian.push(baris.join(" | "));
    bagian.push("");
  }
  for (const catatan of dok.catatan) bagian.push(`- ${catatan}`);
  return bagian.join("\n");
}

function esc(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Badan email bergaya dokumen: rincian yang sama dengan PDF, diletakkan di
 * dalam surat supaya isinya tetap terbaca bila penerima membuka email tanpa
 * mengunduh lampiran.
 */
export function htmlRincianEmail(dok: DokumenRincianPinjaman): string {
  const kelompok = dok.kelompok
    .map(
      (k) => `
      <tr><td colspan="2" style="padding:16px 0 6px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b6257">${esc(k.judul)}</td></tr>
      ${k.baris
        .map(
          (b) => `
      <tr>
        <td style="padding:7px 12px;border-bottom:1px solid #eae5da;font:${b.tegas ? "600" : "400"} 13px/1.5 Arial,sans-serif;color:#1c1a15">${esc(b.label)}</td>
        <td align="right" style="padding:7px 12px;border-bottom:1px solid #eae5da;font:${b.tegas ? "700" : "400"} 13px/1.5 Arial,sans-serif;color:#1c1a15;white-space:nowrap">${esc(b.nilai)}</td>
      </tr>`,
        )
        .join("")}`,
    )
    .join("");

  const jadwal =
    dok.jadwal === null
      ? ""
      : `
    <p style="margin:22px 0 6px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b6257">${esc(dok.jadwal.judul)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font:400 12px/1.5 Arial,sans-serif;color:#1c1a15">
      <tr>${dok.jadwal.kolom
        .map(
          (kolom) =>
            `<th align="left" style="padding:6px 8px;border-bottom:1px solid #c9a86a;font-size:11px">${esc(kolom)}</th>`,
        )
        .join("")}</tr>
      ${dok.jadwal.baris
        .map(
          (baris) =>
            `<tr>${baris
              .map(
                (sel) =>
                  `<td style="padding:5px 8px;border-bottom:1px solid #eae5da;white-space:nowrap">${esc(sel)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}
    </table>`;

  const catatan = dok.catatan
    .map((c) => `<li style="margin-bottom:4px">${esc(c)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="id">
<body style="margin:0;padding:24px;background:#f6f3ec">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #c9a86a">
    <tr>
      <td style="padding:24px 24px 8px">
        <p style="margin:0;font:700 18px/1.3 Georgia,serif;color:#1c1a15">PINDAI</p>
        <p style="margin:4px 0 0;font:400 13px/1.5 Arial,sans-serif;color:#6b6257">Rincian pinjaman ${esc(dok.nomorReferensi)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 0">
        <p style="margin:0 0 12px;font:400 14px/1.6 Arial,sans-serif;color:#1c1a15">
          Rincian pinjaman ${esc(dok.namaPeminjam)} (${esc(dok.statusLabel)}, tenor ${esc(dok.tenorTeks)})
          kami lampirkan juga sebagai berkas PDF dalam email ini.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">${kelompok}</table>
        ${jadwal}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 24px 24px">
        <ul style="margin:0;padding-left:18px;font:400 11px/1.6 Arial,sans-serif;color:#6b6257">${catatan}</ul>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
