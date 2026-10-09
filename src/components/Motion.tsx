import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";


import {
  DURATION,
  EASE_IN_OUT,
  EASE_OUT,
  fadeIn,
  fadeUpItem,
  JARAK,
  scaleIn,
  slideIn,
  STAGGER,
  type ArahGerak,
} from "@/lib/motion";

/**
 * Pembungkus gerak siap pakai — fade, slide, scale, stagger, dan pulse — di atas
 * token `@/lib/motion`.
 *
 * Kenapa ada dua lapis (CSS + React)?
 *  - `src/index.css` menyediakan kelas `.motion-*` untuk kasus tanpa state
 *    (elemen diam yang muncul sekali). Nol JavaScript, nol layout shift.
 *  - Berkas ini dipakai saat kemunculannya perlu DIKENDALIKAN React: daftar
 *    berurutan, kemunculan bersyarat, atau pembatalan saat reduced-motion.
 *
 * Keduanya memakai durasi/easing yang sama, jadi gerakan di seluruh aplikasi
 * terasa satu tangan. Aturan:
 *  - Hanya `opacity` dan `transform` yang dianimasikan (aman bagi compositor).
 *  - Saat `prefers-reduced-motion: reduce`, gerak translasi/scale dibuang dan
 *    hanya fade singkat yang tersisa (nilai akhir selalu tercapai).
 *  - Komponen ini tidak mengubah tata letak: ia membungkus, bukan menyusun.
 *
 * Contoh:
 * ```tsx
 * <Stagger className="grid gap-3 sm:grid-cols-3">
 *   {kartu.map((k) => <StaggerItem key={k.id}><Kartu {...k} /></StaggerItem>)}
 * </Stagger>
 *
 * <Slide arah="kiri" delay={0.1}>…</Slide>
 * <Scale mulai={0.96}>…</Scale>
 * <Pulse ulang={3}>lencana baru</Pulse>
 * ```
 */

type Durasi = keyof typeof DURATION;

/**
 * `useReducedMotion()` mengembalikan `null` sebelum preferensi perangkat
 * terbaca; bagi kita itu sama dengan "jangan kurangi". Dibungkus di satu tempat
 * supaya setiap pembungkus di berkas ini tidak perlu memeriksanya sendiri.
 */
function useGerakDikurangi(): boolean {
  return useReducedMotion() === true;
}

/** Terjemahkan nama durasi menjadi detik + easing standar. */
function tempo(durasi: Durasi, delay: number, reduce: boolean) {
  if (reduce) return { duration: 0.01, delay: 0, ease: EASE_OUT } as const;
  return { duration: DURATION[durasi], delay, ease: EASE_OUT } as const;
}

/** Muncul dari transparan. */
export function Fade({
  children,
  durasi = "normal",
  delay = 0,
  className,
}: {
  children: ReactNode;
  durasi?: Durasi;
  delay?: number;
  className?: string;
}) {
  const reduce = useGerakDikurangi();
  return (
    <motion.div
      className={className}
      variants={fadeIn}
      initial="hidden"
      animate="show"
      transition={tempo(durasi, delay, reduce)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Geser + pudar. `arah` = dari mana elemen datang.
 * `jarak` memakai skala `JARAK` dari `@/lib/motion` (kecil 8 / normal 16 / besar 24).
 */
export function Slide({
  children,
  arah = "atas",
  jarak = JARAK.normal,
  durasi = "slow",
  delay = 0,
  className,
}: {
  children: ReactNode;
  arah?: ArahGerak;
  jarak?: number;
  durasi?: Durasi;
  delay?: number;
  className?: string;
}) {
  const reduce = useGerakDikurangi();
  const sumbu = arah === "kiri" || arah === "kanan" ? "x" : "y";
  const tanda = arah === "atas" || arah === "kiri" ? 1 : -1;
  return (
    <motion.div
      className={className}
      variants={reduce ? fadeIn : slideIn(arah, jarak)}
      initial="hidden"
      animate="show"
      transition={tempo(durasi, delay, reduce)}
      data-sumbu={sumbu}
      data-tanda={tanda}
    >
      {children}
    </motion.div>
  );
}

/** Membesar sedikit saat muncul — kartu, dialog, lencana. */
export function Scale({
  children,
  mulai = 0.96,
  durasi = "normal",
  delay = 0,
  className,
}: {
  children: ReactNode;
  mulai?: number;
  durasi?: Durasi;
  delay?: number;
  className?: string;
}) {
  const reduce = useGerakDikurangi();
  return (
    <motion.div
      className={className}
      variants={reduce ? fadeIn : scaleIn(mulai)}
      initial="hidden"
      animate="show"
      transition={tempo(durasi, delay, reduce)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Wadah gerak berurutan. Anak-anaknya memakai `StaggerItem` agar jedanya
 * dihitung otomatis (`--motion-stagger` CSS memakai langkah yang sama).
 */
export function Stagger({
  children,
  langkah = STAGGER.normal,
  jeda = 0.04,
  className,
}: {
  children: ReactNode;
  langkah?: number;
  jeda?: number;
  className?: string;
}) {
  const reduce = useGerakDikurangi();
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: reduce
          ? { transition: { staggerChildren: 0, delayChildren: 0 } }
          : { transition: { staggerChildren: langkah, delayChildren: jeda } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Satu anak di dalam `Stagger`. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useGerakDikurangi();
  return (
    <motion.div
      className={className}
      variants={reduce ? fadeIn : fadeUpItem}
      transition={{ duration: reduce ? 0.01 : DURATION.normal, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Denyut perhatian. BAWAANNYA BERAKHIR (`ulang = 3`) — animasi yang berjalan
 * terus-menerus menghabiskan resource dan mengganggu; pakai `ulang="selamanya"`
 * hanya untuk keadaan yang memang hidup (mis. pengingat jatuh tempo).
 */
export function Pulse({
  children,
  ulang = 3,
  className,
}: {
  children: ReactNode;
  ulang?: number | "selamanya";
  className?: string;
}) {
  const reduce = useGerakDikurangi();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      animate={{ opacity: [1, 0.86, 1], scale: [1, 1.03, 1] }}
      transition={{
        duration: DURATION.slow,
        ease: EASE_IN_OUT,
        repeat: ulang === "selamanya" ? Infinity : ulang - 1,
      }}
    >
      {children}
    </motion.div>
  );
}
