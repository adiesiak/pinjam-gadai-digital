/**
 * KARTU HERO PINDAI — "Warm Paper & Brass Batik Kawung".
 *
 * Objek MEREK untuk hero landing: kaca CERAH (kertas hangat, bukan obsidian)
 * dengan motif batik kawung modern (garis kuningan #c9a86a + titik petrol #1f6a62),
 * aksen logam kuningan pada logo/chip/nomor, garis ganda kuningan di tepi, dan
 * cucian kuningan + petrol di dua sudut. Keputusan pemilik 2026-10-12: titik
 * fokus halaman ikut satu wajah terang, jadi permukaan gelapnya ditinggalkan
 * (lihat DESIGN.md §3A).
 *
 * Kenapa kartunya "kartu contoh": PINDAI tidak menerbitkan kartu pembayaran.
 * Angka di kartu karena itu CONTOH, dan baris data (nomor, masa berlaku, nama)
 * ditandai `aria-hidden` supaya pembaca layar tidak mendengar angka palsu.
 * Catatan kecil "Kartu contoh · bukan alat bayar" tetap terlihat di kartu.
 *
 * SIFATNYA REUSABLE:
 *  - Semua data masuk lewat prop; tidak ada query Convex, tidak ada state
 *    aplikasi. Halaman boleh mengirim data nasabah yang benar-benar ada.
 *  - Interaksi (tilt + kilau mengikuti pointer) hidup DI DALAM komponen ini dan
 *    hanya mengubah CSS variable — tidak me-render ulang per frame. Kirim
 *    `interaktif={false}` bila wadah luar (mis. panggung 3D hero) sudah
 *    mengurus gerak kartu, supaya tidak ada dua kemiringan bertumpuk.
 *  - Kemiringan mati saat `prefers-reduced-motion` atau perangkat tanpa hover
 *    (sentuh), jadi di ponsel kartu diam dan halaman tetap ringan.
 */
import { useReducedMotion } from "framer-motion";
import { Wifi } from "lucide-react";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

import {
  CATATAN_KARTU_CONTOH,
  MASA_BERLAKU_CONTOH,
  NAMA_PEMEGANG_KOSONG,
  NOMOR_KARTU_CONTOH,
  formatNomorKartu,
  masaBerlakuKartu,
  namaPemegangKartu,
} from "@/lib/kartuNasabah";
import { cn } from "@/lib/utils";

/** Batas kemiringan (derajat). Vertikal lebih kecil supaya tidak terasa mabuk. */
const MAKS_DERAJAT_X = 6;
const MAKS_DERAJAT_Y = 9;

/** Label status bawaan kartu. */
const STATUS_CONTOH = "TERAKREDITASI & AMAN";

/**
 * Motif KAWUNG: satu unit = empat kelopak lonjong mengelilingi satu titik.
 * Ukuran tiap kelopak sudah menunjuk ke arah pusatnya, jadi tidak ada
 * transformasi rotasi yang perlu dihitung.
 */
const KELOPAK_KAWUNG: ReadonlyArray<
  readonly [number, number, number, number]
> = [
  // [geser x, geser y, rx, ry] dari titik pusat unit
  [0, -15, 7, 10],
  [15, 0, 10, 7],
  [0, 15, 7, 10],
  [-15, 0, 10, 7],
];

/**
 * Titik pusat unit kawung: tengah petak plus keempat sudutnya. Bentuk yang
 * digambar di sudut dipakai bersama empat petak yang bertemu di sana, jadi
 * motifnya bersambung tanpa jahitan walau petaknya hanya 64 x 64.
 */
const UNIT_KAWUNG: ReadonlyArray<readonly [number, number]> = [
  [32, 32],
  [0, 0],
  [64, 0],
  [0, 64],
  [64, 64],
];

export interface KartuHeroPindaiProps {
  /** Nama nasabah. Kosong atau belum terverifikasi → "CARDHOLDER". */
  nama?: string;
  /** Nasabah sudah lolos KYC/verifikasi. */
  terverifikasi?: boolean;
  /** Nomor kartu; digitnya dikelompokkan 4-4-4-4. */
  nomorKartu?: string;
  /** Masa berlaku "MM/YY". Bentuk lain jatuh ke contoh. */
  masaBerlaku?: string;
  /** Label status kecil di atas tanggal. */
  statusTeks?: string;
  /** Catatan paling bawah. Kirim "" untuk menyembunyikannya. */
  catatan?: string;
  /** Tilt & kilau mengikuti pointer (matikan bila wadah luar sudah mengurus). */
  interaktif?: boolean;
  className?: string;
}

export function KartuHeroPindai({
  nama,
  terverifikasi = false,
  nomorKartu = NOMOR_KARTU_CONTOH,
  masaBerlaku = MASA_BERLAKU_CONTOH,
  statusTeks = STATUS_CONTOH,
  catatan = CATATAN_KARTU_CONTOH,
  interaktif = true,
  className,
}: KartuHeroPindaiProps) {
  const reduce = useReducedMotion() === true;
  /**
   * Tilt hanya untuk perangkat berpenunjuk presisi yang punya hover. Di layar
   * sentuh tidak ada hover — memaksakan tilt hanya membuat kartu melompat saat
   * disentuh, dan itu memakan frame yang lebih berguna untuk menggulir.
   */
  const [bisaHover, setBisaHover] = useState(false);
  const panggungRef = useRef<HTMLDivElement | null>(null);
  /** Id unik pola batik: dua kartu di satu halaman tidak boleh berbagi `id`. */
  const idKawung = `kawung-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const terapkan = () => setBisaHover(mq.matches);
    terapkan();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", terapkan);
      return () => mq.removeEventListener("change", terapkan);
    }
    return undefined;
  }, []);

  const tiltAktif = interaktif && !reduce && bisaHover;

  const nomorTampil = formatNomorKartu(nomorKartu);
  const masaBerlakuTampil = masaBerlakuKartu(masaBerlaku);
  const namaTampil = namaPemegangKartu(nama, terverifikasi);
  const labelKartu =
    namaTampil === NAMA_PEMEGANG_KOSONG
      ? "Kartu contoh PINDAI"
      : `Kartu contoh PINDAI untuk ${namaTampil}`;

  /** Tulis kemiringan + posisi kilau ke CSS variable (tanpa re-render). */
  const ikutiPointer = (event: PointerEvent<HTMLDivElement>) => {
    const panggung = panggungRef.current;
    if (!tiltAktif || panggung === null) return;
    const kotak = panggung.getBoundingClientRect();
    if (kotak.width === 0 || kotak.height === 0) return;
    const px = Math.min(
      1,
      Math.max(0, (event.clientX - kotak.left) / kotak.width),
    );
    const py = Math.min(
      1,
      Math.max(0, (event.clientY - kotak.top) / kotak.height),
    );
    // Saat mengikuti pointer transisinya dipercepat; saat ditinggalkan diperlambat
    // (lihat `lepaskanPointer`) supaya kartu balik dengan tenang, bukan menyentak.
    panggung.style.transitionDuration = "90ms";
    panggung.style.setProperty(
      "--tilt-x",
      `${((0.5 - py) * 2 * MAKS_DERAJAT_X).toFixed(2)}deg`,
    );
    panggung.style.setProperty(
      "--tilt-y",
      `${((px - 0.5) * 2 * MAKS_DERAJAT_Y).toFixed(2)}deg`,
    );
    panggung.style.setProperty("--kilau-x", `${(px * 100).toFixed(1)}%`);
    panggung.style.setProperty("--kilau-y", `${(py * 100).toFixed(1)}%`);
    panggung.style.setProperty("--kilau-opasitas", "1");
  };

  const lepaskanPointer = () => {
    const panggung = panggungRef.current;
    if (panggung === null) return;
    panggung.style.transitionDuration = "420ms";
    panggung.style.setProperty("--tilt-x", "0deg");
    panggung.style.setProperty("--tilt-y", "0deg");
    panggung.style.setProperty("--kilau-opasitas", "0");
  };

  return (
    // Panggung terpisah dari kartunya sendiri: tilt dipasang di sini, sedangkan
    // `hover:scale-[1.02]` tetap milik kartu — dua-duanya menyentuh properti
    // `transform`, jadi kalau disatukan salah satunya akan saling menimpa.
    <div
      ref={panggungRef}
      data-kartu-panggung="kertas-batik"
      className="[perspective:1000px] [transform-style:preserve-3d]"
      style={{
        transform: "rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
        transitionProperty: "transform",
        transitionDuration: "420ms",
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      onPointerMove={tiltAktif ? ikutiPointer : undefined}
      onPointerLeave={lepaskanPointer}
      onPointerCancel={lepaskanPointer}
    >
      <div
        data-kartu="kertas-batik"
        role="group"
        aria-label={labelKartu}
        className={cn(
          "aspect-[1.586/1] w-full max-w-md rounded-2xl relative p-6 overflow-hidden transition-all duration-500 hover:scale-[1.02]",
          // Permukaan CERAH: kertas hangat setengah tembus dengan `backdrop-blur`,
          // jadi kartu tetap "kaca" (satu titik fokus per layar, DESIGN.md §4)
          // tanpa memakai permukaan gelap.
          "bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(253,250,241,0.9)_52%,rgba(241,237,227,0.92)_100%)] backdrop-blur-2xl border border-[#c9a86a]/55 shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)]",
          // Garis ganda pengganti ring emerald: tepi luar kuningan redup + celah
          // kertas tipis di dalamnya, jadi kartu tetap punya tepi tegas di atas
          // latar terang.
          "ring-1 ring-[#c9a86a]/35 ring-offset-2 ring-offset-white/60",
          // Lantai tinggi: pada lebar kartu kecil (ponsel), rasio 1.586:1
          // menghasilkan kotak yang lebih pendek daripada kebutuhan tiga baris
          // isi, dan `overflow-hidden` akan memotong baris bawah (nama +
          // catatan). Kartu tetap mengikuti rasio saat ada ruang, lalu tumbuh
          // (bukan memotong) saat ruangnya sempit.
          "min-h-[15.5rem] isolate flex flex-col",
          className,
        )}
      >
        {/* ── Cucian sudut: kuningan di kiri atas, petrol di kanan bawah (ganti
            pseudo-element: isi yang sama, tapi terlihat di DOM dan bisa diuji). ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-24 size-48 rounded-full bg-[radial-gradient(circle,rgba(201,168,106,0.5),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(31,106,98,0.28),transparent_72%)]"
        />

        {/* ── Motif batik KAWUNG: kelopak kuningan + titik petrol, dipasang tipis
            (opacity-15) dengan `mix-blend-multiply` supaya garisnya menyerap ke
            kertas — terbaca sebagai tekstur taktil, bukan gambar di atas kartu.
            Anyaman geometrisnya dipilih menggantikan parang karena lebih tenang
            dan sejalan dengan wajah buku besar (DESIGN.md §3A). ── */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full opacity-15 mix-blend-multiply"
        >
          <defs>
            <pattern
              id={idKawung}
              width="64"
              height="64"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              {UNIT_KAWUNG.map(([ux, uy]) => (
                <g key={`${ux}-${uy}`}>
                  {KELOPAK_KAWUNG.map(([dx, dy, rx, ry]) => (
                    <ellipse
                      key={`${dx}-${dy}`}
                      cx={ux + dx}
                      cy={uy + dy}
                      rx={rx}
                      ry={ry}
                      fill="none"
                      stroke="#c9a86a"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  ))}
                  <circle cx={ux} cy={uy} r="2.4" fill="#1f6a62" />
                </g>
              ))}
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idKawung})`} />
        </svg>

        {/* ── Cucian warna: kuningan tipis di kiri atas, petrol tipis di kanan
            bawah — inilah yang membuat kertasnya terbaca "kaya tekstur", bukan
            putih kosong. ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_-10%,rgba(201,168,106,0.2),transparent_55%),radial-gradient(90%_80%_at_100%_110%,rgba(31,106,98,0.1),transparent_60%)]"
        />

        {/* ── Kilau yang mengikuti pointer (light reflect). ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 mix-blend-multiply transition-opacity duration-300"
          style={{
            opacity: "var(--kilau-opasitas, 0)",
            background:
              "radial-gradient(circle at var(--kilau-x, 50%) var(--kilau-y, 30%), rgba(201,168,106,0.35), rgba(31,106,98,0.12) 38%, transparent 62%)",
          }}
        />

        {/* ── Kepala kartu: logo emas mengkilap, KIRI ATAS saja. Sisi kanan
            sengaja kosong supaya bersih & elegan. ── */}
        <header className="relative flex items-center">
          <p className="text-emerald-700 font-bold tracking-wider flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 via-amber-400 to-amber-700 text-xs font-black text-slate-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
            >
              P
            </span>
            <span>
              PINDAI
            </span>
          </p>
        </header>

        {/* ── Chip EMV logam emas + ikon contactless, di kiri tengah.
            `my-auto` menyerap sisa tinggi kartu sama besar di atas dan di bawah
            pita ini, jadi chip benar-benar duduk di kiri tengah seperti
            DESIGN.md §3A. Tanpa itu, seluruh sisa ruang jatuh ke atas blok
            nomor dan chip naik menempel di bawah logo. `my-auto` dipilih bukan
            `flex-1` supaya pita tidak bisa terhimpit jadi nol tinggi saat ruang
            kartu sempit. ── */}
        <div className="relative my-auto flex items-center gap-3">
          <div
            aria-hidden="true"
            className="bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-md w-12 h-9 shadow-inner border border-emerald-800/30 flex flex-col justify-center gap-[3px] px-1.5"
          >
            <span className="h-px w-full bg-emerald-900/35" />
            <span className="h-px w-full bg-emerald-900/35" />
            <span className="h-px w-full bg-emerald-900/35" />
          </div>
          {/* Ikon contactless: busur `Wifi` diputar 90° agar membuka ke kanan. */}
          <Wifi
            className="size-5 rotate-90 text-emerald-700/90"
            aria-hidden="true"
          />
        </div>

        {/* ── Identitas kartu & nasabah (bawah). Baris data ditandai
            `aria-hidden`: angka contoh tidak perlu dibacakan. Blok ini tidak
            lagi memakai `mt-auto`: sisa tinggi sudah diserap `my-auto` milik pita
            chip, dan dua sumber sisa ruang sekaligus akan membagi jarak jadi tiga
            bagian sehingga chip melenceng dari tengah. ── */}
        <div className="relative">
          <p
            aria-hidden="true"
            className="font-mono text-emerald-800 tracking-widest text-lg"
          >
            {nomorTampil}
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
            {statusTeks}
          </p>

          <div
            aria-hidden="true"
            className="mt-3 flex items-end justify-between gap-4"
          >
            <p>
              <span className="block text-[9px] font-medium uppercase tracking-[0.24em] text-slate-600">
                Valid thru
              </span>
              <span className="block font-mono text-xs tracking-widest text-emerald-800">
                {masaBerlakuTampil}
              </span>
            </p>
            <p className="text-right">
              <span className="block text-[9px] font-medium uppercase tracking-[0.24em] text-slate-600">
                Cardholder
              </span>
              <span className="block text-slate-900 font-semibold tracking-wider">
                {namaTampil}
              </span>
            </p>
          </div>

          {catatan !== "" && (
            <p className="mt-3 text-[9px] uppercase tracking-[0.18em] text-slate-600">
              {catatan}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
