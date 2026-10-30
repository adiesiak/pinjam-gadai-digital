import { useEffect, useState } from "react";

/**
 * Layar pemuatan PINDAI — SATU versi.
 *
 * Markup dan kelasnya sengaja disamakan persis dengan splash statis di
 * `index.html` (`#pindai-boot`): HTML itu tampil pada paint pertama sebelum
 * bundel JavaScript/CSS selesai, lalu komponen ini menggantikannya. Dengan
 * kelas `pb__*` yang sama, tidak ada lompatan tampilan saat React mengambil
 * alih. Bila salah satu diubah, ubah pasangannya di index.html juga.
 *
 * Brankas digambar TERTUTUP. Jarum dial dan garis pindai bergerak SATU KALI
 * saat masuk, lalu hanya bilah proses yang berulang. Halo tetap diam, jadi
 * layar tidak terasa seperti mesin slot. Tidak ada uang yang keluar.
 *
 * Komponen ini murni visual: durasi tampil tidak pernah ditentukan di sini.
 * Ia hanya dilepas saat data/sesi benar-benar siap.
 */
export function LoadingScreen({ label = "Menyiapkan ruang Anda…" }: { label?: string }) {
  const [lambat, setLambat] = useState(false);

  // Jangan biarkan layar penuh menjadi jalan buntu: setelah 8 detik, beri tahu
  // bahwa koneksi mungkin lambat dan sediakan satu tindakan pemulihan.
  useEffect(() => {
    const id = window.setTimeout(() => setLambat(true), 8_000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="pb__boot" aria-busy="true">
      <div className="pb__grup">
        <div className="pb__stage">
          <span className="pb__halo" aria-hidden="true" />
          <svg
            className="pb__vault vault-logo"
            width="96"
            height="96"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="5" y="6" width="54" height="50" rx="12" fill="#0f3d3a" stroke="#b99b62" strokeWidth="2" />
            <path d="M15 10h34" stroke="#ffffff" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" />
            <rect x="11" y="12" width="42" height="38" rx="7" fill="#f5f2e9" />
            <rect x="14" y="15" width="36" height="32" rx="5" stroke="#d9d2c1" strokeWidth="1.5" />
            <rect x="7" y="19" width="5" height="7" rx="2.5" fill="#cbb47e" />
            <rect x="7" y="36" width="5" height="7" rx="2.5" fill="#cbb47e" />
            <g className="pb__dial">
              <circle cx="31" cy="31" r="10" fill="#0f3d3a" />
              <circle cx="31" cy="31" r="7.2" stroke="#cbb47e" strokeWidth="1.5" />
              <path
                d="M31 31l7-5M31 24v2M38 31h-2M31 38v-2M24 31h2"
                stroke="#f5f2e9"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="31" cy="31" r="2.2" fill="#cbb47e" />
            </g>
            <path d="M20 57h8M36 57h8" stroke="#0b2d2a" strokeWidth="3" strokeLinecap="round" />
            <g className="vault-snow" aria-hidden="true">
              <path
                d="M6 16 C 13 9, 21 17, 31 12 C 41 7, 49 16, 58 10 L58 9 C58 7 56 6 54 6 L10 6 C8 6 6 7 6 9 Z"
                fill="#ffffff"
                opacity="0.96"
              />
              <circle cx="17" cy="13" r="2.6" fill="#ffffff" opacity="0.9" />
              <circle cx="45" cy="12" r="3" fill="#ffffff" opacity="0.92" />
            </g>
          </svg>
          <span className="pb__scan" aria-hidden="true" />
        </div>

        <div className="pb__brand">
          <span className="pb__line">
            <span className="pb__kata">PINDAI</span>
            <span className="pb__titik" aria-hidden="true" />
          </span>
          <span className="pb__sub">
            <i aria-hidden="true" />
            Pinjam · Gadai Digital
            <i aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="pb__progress">
        <div className="pb__track">
          <span className="pb__bar" />
        </div>
        <p className="pb__label" role="status" aria-live="polite">
          {label}
        </p>
        {lambat && (
          <div className="mt-2 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
              Masih menyiapkan. Koneksi mungkin lambat.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Muat ulang
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pemuatan perpindahan rute: bilah tipis di puncak halaman, bukan splash penuh.
 * Rute chunk biasanya selesai di bawah 300 ms; layar penuh untuk setiap
 * perpindahan membuat aplikasi terasa lebih lambat daripada kenyataannya.
 * Splash brankas tetap dipakai untuk gerbang sesi dan akses.
 */
export function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-border"
    >
      <span className="sr-only">Membuka halaman…</span>
      <span aria-hidden="true" className="route-progress block h-full w-1/3 bg-primary" />
    </div>
  );
}
