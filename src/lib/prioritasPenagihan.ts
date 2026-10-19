/**
 * Skor prioritas penagihan harian.
 *
 * Daftar kasus sebelumnya hanya diurutkan menurut tahap dan lama keterlambatan.
 * Dua kasus dengan DPD sama bisa sangat berbeda mendesaknya: satu sudah
 * disomasi dan tidak pernah dihubungi, satu lagi punya janji bayar yang masih
 * berlaku. Skor ini menyusun antrean dari keadaan yang benar-benar tercatat,
 * dan selalu menyertakan alasannya supaya petugas tidak menebak angka.
 *
 * Batas: ini ALAT BANTU urutan, bukan keputusan otomatis. Tidak ada penagihan
 * yang dikirim sendiri, dan janji aktif tetap menahan somasi lewat aturan
 * `lib/suratSomasi`.
 */
import { STATUS_KASUS_TERTUTUP } from "./penagihan";

const HARI_MS = 86_400_000;

export type JanjiUntukPrioritas = {
  /** Tanggal janji (epoch ms). */
  tanggalJanji: number;
  nominal: number;
};

export type DataPrioritasPenagihan = {
  hariTerlambat: number;
  /** Tingkat tahap tunggakan: 0 lancar … 4 macet. */
  tahapTingkat: number;
  jumlahKewajiban: number;
  janjiAktif: JanjiUntukPrioritas | null;
  pengaduanTerbuka: number;
  somasi: { diserahkanPada: number | null } | null;
  jumlahTindakan: number;
  tindakanTerakhirPada: number | null;
  statusKasus: string;
  statusPembayaran: string;
  sekarang: number;
};

export type HasilPrioritasPenagihan = {
  /** 0–100; makin tinggi makin perlu ditangani lebih dulu. */
  skor: number;
  /** Alasan yang bisa dibaca petugas, urut dari yang paling menentukan. */
  alasan: string[];
  /** Masuk antrean "hari ini" atau cukup dipantau. */
  disarankanHariIni: boolean;
};

function hariSejak(waktu: number, sekarang: number): number {
  return Math.max(0, Math.floor((sekarang - waktu) / HARI_MS));
}

/**
 * Hitung prioritas satu kasus. Semua masukan berasal dari catatan server;
 * fungsi ini murni agar aturannya bisa diuji tanpa basis data.
 */
export function hitungPrioritasPenagihan(
  data: DataPrioritasPenagihan,
): HasilPrioritasPenagihan {
  const hari = Number.isFinite(data.hariTerlambat)
    ? Math.max(0, Math.floor(data.hariTerlambat))
    : 0;
  const tahap = Math.min(4, Math.max(0, Math.floor(data.tahapTingkat)));
  const alasan: string[] = [];
  let skor = tahap * 12 + Math.min(25, Math.round(hari * 0.8));

  if (hari > 0) {
    alasan.push(`Terlambat ${hari} hari`);
  }

  if (Number.isFinite(data.jumlahKewajiban) && data.jumlahKewajiban > 0) {
    const tambahan = Math.min(15, Math.floor(data.jumlahKewajiban / 1_000_000) * 3);
    if (tambahan > 0) skor += tambahan;
    alasan.push(`Kewajiban tercatat Rp${data.jumlahKewajiban.toLocaleString("id-ID")}`);
  }

  let janjiMasihBerlaku = false;
  if (data.janjiAktif !== null) {
    if (data.janjiAktif.tanggalJanji >= data.sekarang) {
      janjiMasihBerlaku = true;
      skor -= 18;
      alasan.push(
        `Janji bayar masih berlaku sampai ${new Date(data.janjiAktif.tanggalJanji).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" })}`,
      );
    } else {
      const lewat = hariSejak(data.janjiAktif.tanggalJanji, data.sekarang);
      skor += 18;
      alasan.push(lewat === 0 ? "Janji bayar jatuh tempo hari ini" : `Janji bayar lewat ${lewat} hari`);
    }
  }

  if (data.pengaduanTerbuka > 0) {
    skor += 12;
    alasan.push(
      `${data.pengaduanTerbuka} pengaduan belum selesai`,
    );
  }

  if (data.somasi !== null) {
    if (data.somasi.diserahkanPada !== null) {
      skor += 10;
      alasan.push("Surat somasi sudah diserahkan");
    } else {
      skor += 5;
      alasan.push("Surat somasi sudah terbit, belum ditandai diserahkan");
    }
  }

  if (data.tindakanTerakhirPada === null) {
    skor += 10;
    if (data.jumlahTindakan === 0) alasan.push("Belum ada tindakan tercatat");
  } else {
    const jeda = hariSejak(data.tindakanTerakhirPada, data.sekarang);
    if (jeda >= 7) {
      skor += 8;
      alasan.push(`Tidak ada tindakan tercatat ${jeda} hari`);
    }
  }

  const tertutup = (STATUS_KASUS_TERTUTUP as readonly string[]).includes(data.statusKasus);
  if (tertutup) {
    skor = Math.min(skor, 20);
    alasan.unshift("Kasus sudah selesai/ditutup");
  }

  const disarankanHariIni =
    !tertutup && hari > 0 && (!janjiMasihBerlaku || data.pengaduanTerbuka > 0);

  return {
    skor: Math.max(0, Math.min(100, Math.round(skor))),
    alasan: alasan.slice(0, 4),
    disarankanHariIni,
  };
}
