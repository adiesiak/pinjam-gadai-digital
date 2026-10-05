/**
 * Lapisan konfeti layar penuh untuk tema "Karnival".
 *
 * Potongan konfeti (kotak & bulat, warna-warni) jatuh sambil berputar, dijalankan
 * murni lewat CSS (lihat `.karnival-*` di index.css). Komponen ini tidak merender
 * apa pun yang terlihat kecuali ketika tema `karnival` aktif — pemanggil yang
 * menentukan, dan animasinya berhenti saat `prefers-reduced-motion: reduce`.
 */
const WARNA = ["#c2266f", "#f5b301", "#00b3a4", "#6a2fd0", "#ff7a3c", "#2fb6e6", "#ff4d8d"] as const;

type Potongan = {
  left: string;
  size: number;
  delay: string;
  duration: string;
  color: string;
  bulat?: boolean;
};

/** Posisi/ukuran/warna bervariasi; delay negatif agar layar langsung "penuh". */
const POTONGAN: Potongan[] = [
  { left: "2%", size: 11, delay: "-0.4s", duration: "6.2s", color: WARNA[0] },
  { left: "9%", size: 9, delay: "-3.1s", duration: "7.4s", color: WARNA[1], bulat: true },
  { left: "16%", size: 13, delay: "-1.8s", duration: "5.6s", color: WARNA[2] },
  { left: "23%", size: 8, delay: "-5.2s", duration: "8.1s", color: WARNA[3], bulat: true },
  { left: "30%", size: 12, delay: "-2.6s", duration: "6.9s", color: WARNA[4] },
  { left: "37%", size: 10, delay: "-4.4s", duration: "7.1s", color: WARNA[5], bulat: true },
  { left: "44%", size: 14, delay: "-0.9s", duration: "5.3s", color: WARNA[6] },
  { left: "51%", size: 9, delay: "-6s", duration: "8.4s", color: WARNA[0], bulat: true },
  { left: "58%", size: 12, delay: "-3.7s", duration: "6.4s", color: WARNA[1] },
  { left: "65%", size: 10, delay: "-1.3s", duration: "7.7s", color: WARNA[2], bulat: true },
  { left: "72%", size: 13, delay: "-5.7s", duration: "5.9s", color: WARNA[3] },
  { left: "79%", size: 8, delay: "-2.2s", duration: "8.8s", color: WARNA[4], bulat: true },
  { left: "86%", size: 12, delay: "-4.9s", duration: "6.7s", color: WARNA[5] },
  { left: "93%", size: 11, delay: "-3.4s", duration: "7.2s", color: WARNA[6], bulat: true },
  { left: "12%", size: 15, delay: "-6.5s", duration: "9.1s", color: WARNA[0] },
  { left: "68%", size: 14, delay: "-6.9s", duration: "9.6s", color: WARNA[2] },
];

export function KarnivalConfetti() {
  return (
    <div className="karnival-layer" aria-hidden="true">
      {POTONGAN.map((p, i) => (
        <span
          key={i}
          className={`karnival-piece${p.bulat ? " karnival-piece--bulat" : ""}`}
          style={{
            left: p.left,
            width: p.size,
            height: p.bulat ? p.size : Math.round(p.size * 1.5),
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}
