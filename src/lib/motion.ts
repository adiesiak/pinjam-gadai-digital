import type { Transition, Variants } from "framer-motion";

/**
 * Fondasi animasi global PINDAI — satu sumber kebenaran untuk durasi, easing,
 * jarak, dan varian gerak.
 *
 * Aturan yang dijaga berkas ini:
 *  1. **Hanya tiga durasi.** `fast` 120 ms (umpan balik langsung: hover, tekan,
 *     tooltip), `normal` 200 ms (perpindahan kecil: panel, tab, lencana),
 *     `slow` 380 ms (masuknya bagian halaman: reveal, dialog, bagian panjang).
 *     Angka ini SAMA dengan custom property CSS di `src/index.css`; uji
 *     `src/lib/motion.test.ts` gagal kalau keduanya menyimpang.
 *  2. **Hanya opacity & transform.** Semua varian menggerakkan `opacity`, `x`,
 *     `y`, dan `scale` — properti yang digerakkan compositor. Jangan
 *     menganimasikan `width`/`height`/`top`/`margin`: itu memaksa layout ulang
 *     setiap frame dan menggeser tetangganya (layout shift).
 *  3. **Keadaan dasar = keadaan akhir.** Varian `hidden` hanya dipakai saat
 *     animasi berjalan; elemen tanpa animasi (mis. saat reduced-motion) tampil
 *     langsung pada bentuk akhirnya, jadi tidak ada elemen "menghilang" atau
 *     lompatan setelah hydration.
 *  4. **Reduced-motion dihormati komponen, bukan di sini.** Pembungkus React
 *     (`@/components/Reveal`, `@/components/Motion`) membaca `useReducedMotion()`
 *     dan memakai `transitionReduced` alih-alih tempo normal.
 *
 * Cara pakai cepat:
 * ```tsx
 * <motion.div variants={fadeIn} initial="hidden" animate="show" transition={transition.normal} />
 * <motion.li variants={slideIn("kiri")} ... />
 * ```
 */

/** Kurva easing utama PINDAI — percepatan cepat, pendaratan lembut. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Kurva dua arah untuk gerakan bolak-balik (denyut, geser terus-menerus). */
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

/**
 * Standar durasi (detik — satuan framer-motion).
 * Rentang yang diminta produk: fast 100–150 ms · normal 180–250 ms · slow 300–450 ms.
 */
export const DURATION = {
  /** Umpan balik langsung: hover, tekan, tooltip, transisi warna. */
  fast: 0.12,
  /** Perpindahan kecil: panel/tab, lencana, buka-tutup ringan. */
  normal: 0.2,
  /** Masuknya bagian halaman: reveal, dialog, daftar panjang. */
  slow: 0.38,
} as const;

/** Nilai standar durasi dalam milidetik — dicerminkan di `--motion-*` pada CSS. */
export const DURATION_MS = {
  fast: 120,
  normal: 200,
  slow: 380,
} as const;

/** Jeda antar-anak pada gerakan berurutan (stagger), dalam detik. */
export const STAGGER = {
  /** Deretan rapat: ikon/lencana dalam satu baris. */
  rapat: 0.04,
  /** Bawaan untuk daftar & kartu. */
  normal: 0.08,
  /** Baris besar yang butuh jeda terbaca. */
  lega: 0.12,
} as const;

/** Transisi siap pakai — pakai salah satu ini alih-alih menulis angka baru. */
export const transition = {
  fast: { duration: DURATION.fast, ease: EASE_OUT } satisfies Transition,
  normal: { duration: DURATION.normal, ease: EASE_OUT } satisfies Transition,
  slow: { duration: DURATION.slow, ease: EASE_OUT } satisfies Transition,
  /** Gerakan bolak-balik (denyut halus) — bukan untuk masuk/keluar. */
  denyut: { duration: DURATION.slow * 2, ease: EASE_IN_OUT } satisfies Transition,
} as const;

/**
 * Transisi pengganti saat `prefers-reduced-motion: reduce` aktif.
 * Nyaris instan, tetapi tetap melalui framer-motion supaya nilai akhirnya
 * dipastikan tercapai (bukan elemen yang tertinggal di keadaan awal).
 */
export const transitionReduced: Transition = { duration: 0.01 };

/** Muncul dari transparan. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

/** Arah gerakan untuk `slideIn` dan `buatSlide`. */
export type ArahGerak = "atas" | "bawah" | "kiri" | "kanan";

/** Jarak bawaan (px) per arah — kecil supaya tidak terasa "melompat". */
export const JARAK = { kecil: 8, normal: 16, besar: 24 } as const;

const SUMBU: Record<ArahGerak, "x" | "y"> = {
  atas: "y",
  bawah: "y",
  kiri: "x",
  kanan: "x",
};

const TANDA: Record<ArahGerak, number> = {
  atas: 1, // datang dari bawah, naik ke tempatnya
  bawah: -1,
  kiri: 1, // datang dari kiri, geser ke kanan
  kanan: -1,
};

/**
 * Geser + pudar dari satu arah. `arah` = dari mana elemen datang.
 * `slideIn("kiri")` berarti elemen masuk dari sisi kiri.
 */
export function slideIn(arah: ArahGerak = "atas", jarak: number = JARAK.normal): Variants {
  const sumbu = SUMBU[arah];
  return {
    hidden: { opacity: 0, [sumbu]: TANDA[arah] * jarak },
    show: { opacity: 1, [sumbu]: 0 },
  };
}

/** Membesar sedikit saat muncul — untuk kartu, dialog, lencana. */
export function scaleIn(mulai = 0.96): Variants {
  return {
    hidden: { opacity: 0, scale: mulai },
    show: { opacity: 1, scale: 1 },
  };
}

/** Denyut "sekali" untuk menarik mata (lencana status berubah). */
export const pulseSoft: Variants = {
  tenang: { scale: 1, opacity: 1 },
  denyut: {
    scale: [1, 1.04, 1],
    transition: { duration: DURATION.slow, ease: EASE_IN_OUT, repeat: 2, repeatType: "loop" },
  },
};

/** Wadah yang memunculkan anaknya secara berurutan. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.normal, delayChildren: 0.04 } },
};

/**
 * Wadah berurutan dengan tempo yang bisa diatur.
 * Anak-anaknya harus memakai salah satu varian gerak di berkas ini.
 */
export function buatStagger({
  langkah = STAGGER.normal,
  jeda = 0.04,
}: { langkah?: number; jeda?: number } = {}): Variants {
  return { hidden: {}, show: { transition: { staggerChildren: langkah, delayChildren: jeda } } };
}

/** Satu item di dalam wadah berurutan — naik + pudar. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: JARAK.normal },
  show: { opacity: 1, y: 0 },
};

/**
 * Pasangan wadah + item yang paling sering dipakai (daftar kartu).
 * Dipakai `buatGerakBerurutan()` di komponen; disediakan juga sebagai objek
 * supaya bisa langsung dipasang pada `motion.*`.
 */
export const daftarBerurutan = {
  wadah: staggerContainer,
  item: fadeUpItem,
} as const;
