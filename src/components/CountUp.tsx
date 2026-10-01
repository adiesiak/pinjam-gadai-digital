import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { useEffect } from "react";

import { EASE_OUT } from "@/lib/motion";

/** Pemformat bawaan: hitungan biasa tanpa pemisah ribuan. */
const formatAngka = (n: number) => `${n}`;

/**
 * Angka yang "naik" menuju nilai akhir dengan tempo animasi PINDAI.
 *
 * Nilai dibulatkan ke bilangan bulat di setiap frame, jadi aman dipakai
 * bersama `formatRupiah` yang menolak nilai berkoma. Saat nilai berubah
 * (mis. data server menyusul), animasi melanjutkan dari angka yang sedang
 * tampil. Reduced-motion → nilai akhir langsung ditampilkan.
 */
export function CountUp({
  value,
  format = formatAngka,
  duration = 0.9,
  className,
}: {
  value: number;
  /** Pemformat angka final, mis. `formatRupiah` atau hitungan biasa. */
  format?: (value: number) => string;
  /** Durasi animasi dalam detik. */
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const angka = useMotionValue(reduce ? value : 0);
  const teks = useTransform(angka, (terkini) => format(Math.round(terkini)));

  useEffect(() => {
    if (reduce) {
      angka.set(value);
      return;
    }
    const kontrol = animate(angka, value, { duration, ease: EASE_OUT });
    return () => kontrol.stop();
  }, [angka, duration, reduce, value]);

  return <motion.span className={className}>{teks}</motion.span>;
}
