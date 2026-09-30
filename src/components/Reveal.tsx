import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { EASE_OUT } from "@/lib/motion";

/**
 * Pembungkus animasi masuk PINDAI. Nilai easing dan variannya ada di
 * `@/lib/motion` supaya landing, halaman auth, dan dashboard seragam. Semua
 * animasi otomatis menyusut menjadi fade sederhana saat reduced-motion aktif.
 */

/** Prop gerak "muncul saat mount" untuk dipasang pada motion.* secara langsung. */
function useFadeUp({
  y = 16,
  duration = 0.5,
  delay = 0,
}: { y?: number; duration?: number; delay?: number } = {}) {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y },
    animate: reduce ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: { duration, delay, ease: EASE_OUT },
  };
}

/** Muncul sekali saat elemen masuk viewport — untuk bagian-bagian landing. */
export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Muncul saat mount — untuk halaman dan kolom konten saat pertama dirender. */
export function FadeIn({
  children,
  delay = 0,
  y = 16,
  duration = 0.5,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
}) {
  const props = useFadeUp({ y, duration, delay });
  return (
    <motion.div className={className} {...props}>
      {children}
    </motion.div>
  );
}
