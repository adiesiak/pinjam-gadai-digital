/**
 * Chip skor risiko nasabah — warna mengikuti tinggi-rendahnya angka skor.
 *
 * Kenapa: skor 30 dan skor 85 terlihat sama saja kalau keduanya dicetak abu-abu.
 * Di ruang pendana, angka 3 digit yang menentukan apakah pengajuan layak didanai
 * harus bisa dinilai sekilas — hijau berarti riwayat bersih, kuning berarti perlu
 * dipantau, merah berarti berisiko.
 *
 * Ambang batas (sengaja angka bulat dan tetap, bukan persentil per-periode,
 * supaya arti warnanya tidak berubah-ubah antar sesi):
 *   > 70  sehat          · `bg-emerald-50 text-emerald-700 border-emerald-200`
 *   50–69 perlu dipantau · `bg-amber-50 text-amber-700 border-amber-200`
 *   < 50  berisiko       · `bg-rose-50 text-rose-700 border-rose-200`
 *
 * Warna TIDAK pernah menjadi satu-satunya penanda: angkanya selalu ikut tercetak,
 * dan `title` memuat kalimat penjelas — jadi tetap terbaca tanpa penglihatan warna.
 *
 * Angkanya juga memakai `.badge-pop` (masuk membesar, membesar lagi saat
 * disorot dengan pendar emerald) — skor integritas adalah angka yang paling
 * sering dibandingkan pendana antar pengajuan, jadi ia layak menarik mata.
 *
 * Murni presentasional (tanpa Convex) dan dapat diuji tanpa server.
 */
import { cn } from "@/lib/utils";

/** Ambang skor: di atas ini sehat, di antara ini perlu dipantau, di bawah ini berisiko. */
export const AMBANG_SKOR_SEHAT = 70;
export const AMBANG_SKOR_PANTAU = 50;

/** Kelas chip per rentang skor — diekspor agar bisa diuji sendiri. */
export function kelasSkorRisiko(skor: number): string {
  if (skor > AMBANG_SKOR_SEHAT) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (skor >= AMBANG_SKOR_PANTAU) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

/** Kalimat penjelas per rentang skor — dipakai sebagai `title` chip. */
export function labelSkorRisiko(skor: number): string {
  if (skor > AMBANG_SKOR_SEHAT) {
    return `Skor ${skor}/100 — di atas ${AMBANG_SKOR_SEHAT}: riwayat pembayaran sehat.`;
  }
  if (skor >= AMBANG_SKOR_PANTAU) {
    return `Skor ${skor}/100 — antara ${AMBANG_SKOR_PANTAU} dan ${AMBANG_SKOR_SEHAT}: perlu dipantau.`;
  }
  return `Skor ${skor}/100 — di bawah ${AMBANG_SKOR_PANTAU}: berisiko, wajib ditinjau.`;
}

/**
 * Chip `skor/100`. Angka dibulatkan untuk tampilan; nilainya sendiri tetap
 * angka penuh yang dihitung server (lihat `lib/kepercayaanPeminjam`).
 */
export function ChipSkorRisiko({
  skor,
  className,
}: {
  skor: number;
  className?: string;
}) {
  const angka = Math.round(skor);
  return (
    <span
      className={cn(
        "badge-pop inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tabular-nums",
        kelasSkorRisiko(skor),
        className,
      )}
      title={labelSkorRisiko(angka)}
    >
      {angka}/100
    </span>
  );
}
