/**
 * Kontrak event funnel landing.
 *
 * Belum ada pengirim pihak ketiga: event disimpan di `window.pindaiAnalitik`
 * dan dipancarkan sebagai `CustomEvent` supaya collector/analytics yang dipilih
 * nanti bisa membaca funnel yang sama tanpa mengubah komponen. Isinya sengaja
 * hanya nama aksi dan tempat; tidak ada nominal, identitas, atau isian formulir.
 */
export type TempatCtaLanding =
  | "header"
  | "hero"
  | "kalkulator"
  | "lengket"
  | "penutup";

export type PeristiwaLanding =
  | { nama: "landing_cta"; tempat: TempatCtaLanding }
  | { nama: "landing_demo"; aksi: "buka" | "tutup" };

export type PeristiwaLandingTercatat = PeristiwaLanding & { waktu: number };

declare global {
  interface Window {
    /** Antrean event lokal; collector boleh mengganti/membacanya. */
    pindaiAnalitik?: PeristiwaLandingTercatat[];
  }
}

const BATAS_ANTREAN = 100;

export function catatPeristiwaLanding(peristiwa: PeristiwaLanding): void {
  if (typeof window === "undefined") return;
  const tercatat: PeristiwaLandingTercatat = {
    ...peristiwa,
    waktu: Date.now(),
  };
  try {
    const antrean = (window.pindaiAnalitik ??= []);
    antrean.push(tercatat);
    if (antrean.length > BATAS_ANTREAN) antrean.shift();
    window.dispatchEvent(
      new CustomEvent<PeristiwaLandingTercatat>("pindai:analitik", {
        detail: tercatat,
      }),
    );
  } catch {
    // Analitik bersifat best-effort: kegagalan collector tidak boleh menahan
    // navigasi CTA atau merusak halaman.
  }
}
