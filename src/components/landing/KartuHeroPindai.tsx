/**
 * KARTU HERO PINDAI — "Black Obsidian Glass & Luxury Batik Parang".
 *
 * Objek MEREK untuk hero landing: kaca obsidian hitam dengan motif batik parang
 * modern (garis emas tua #D4AF37 + rona emerald pudar), aksen logam emas pada
 * logo/chip/nomor, dan pendaran emerald ganda (ring + glow + sudut bercahaya).
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
  const idParang = `parang-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

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
      data-kartu-panggung="obsidian-batik"
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
        data-kartu="obsidian-batik"
        role="group"
        aria-label={labelKartu}
        className={cn(
          "aspect-[1.586/1] w-full max-w-md rounded-2xl relative p-6 overflow-hidden transition-all duration-500 hover:scale-[1.02]",
          "bg-slate-950/90 backdrop-blur-2xl border border-emerald-500/40 shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)]",
          "ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-slate-950",
          // Lantai tinggi: pada lebar kartu kecil (ponsel), rasio 1.586:1
          // menghasilkan kotak yang lebih pendek daripada kebutuhan tiga baris
          // isi, dan `overflow-hidden` akan memotong baris bawah (nama +
          // catatan). Kartu tetap mengikuti rasio saat ada ruang, lalu tumbuh
          // (bukan memotong) saat ruangnya sempit.
          "min-h-[15.5rem] isolate flex flex-col",
          className,
        )}
      >
        {/* ── Pendaran emerald di sudut-sudut kartu (ganti pseudo-element: isi
            yang sama, tapi terlihat di DOM dan bisa diuji). ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-24 size-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.38),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.3),transparent_72%)]"
        />

        {/* ── Motif Batik Parang modern: gradasi emas tua redup + emerald pudar,
            dipasang tipis (opacity-15) dengan `mix-blend-overlay` supaya terbaca
            sebagai tekstur taktil, bukan gambar di atas kartu. ── */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full opacity-15 mix-blend-overlay"
        >
          <defs>
            <pattern
              id={idParang}
              width="72"
              height="72"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <path
                d="M0 14 C 14 4, 30 24, 44 14 S 72 4, 88 14"
                fill="none"
                stroke="#D4AF37"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d="M0 34 C 14 24, 30 44, 44 34 S 72 24, 88 34"
                fill="none"
                stroke="#10B981"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M0 52 C 14 42, 30 62, 44 52 S 72 42, 88 52"
                fill="none"
                stroke="#D4AF37"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="62" cy="22" r="2.2" fill="#D4AF37" />
              <circle cx="20" cy="44" r="1.7" fill="#10B981" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idParang})`} />
        </svg>

        {/* ── Cucian warna: emas tua redup di kiri atas, emerald pudar di kanan
            bawah — inilah yang memberi kesan obsidian "kaya tekstur". ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_-10%,rgba(212,175,55,0.16),transparent_55%),radial-gradient(90%_80%_at_100%_110%,rgba(16,185,129,0.14),transparent_60%)]"
        />

        {/* ── Kilau yang mengikuti pointer (light reflect). ── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 mix-blend-overlay transition-opacity duration-300"
          style={{
            opacity: "var(--kilau-opasitas, 0)",
            background:
              "radial-gradient(circle at var(--kilau-x, 50%) var(--kilau-y, 30%), rgba(255,255,255,0.35), rgba(16,185,129,0.12) 35%, transparent 62%)",
          }}
        />

        {/* ── Kepala kartu: logo emas mengkilap, KIRI ATAS saja. Sisi kanan
            sengaja kosong supaya bersih & elegan. ── */}
        <header className="relative flex items-center">
          <p className="text-amber-300 font-bold tracking-wider flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 via-amber-400 to-amber-700 text-xs font-black text-slate-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
            >
              P
            </span>
            <span className="drop-shadow-[0_1px_3px_rgba(212,175,55,0.45)]">
              PINDAI
            </span>
          </p>
        </header>

        {/* ── Chip EMV logam emas + ikon contactless, di kiri tengah. ── */}
        <div className="relative flex items-center gap-3">
          <div
            aria-hidden="true"
            className="bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-md w-12 h-9 shadow-inner border border-amber-200/50 flex flex-col justify-center gap-[3px] px-1.5"
          >
            <span className="h-px w-full bg-amber-900/35" />
            <span className="h-px w-full bg-amber-900/35" />
            <span className="h-px w-full bg-amber-900/35" />
          </div>
          {/* Ikon contactless: busur `Wifi` diputar 90° agar membuka ke kanan. */}
          <Wifi
            className="size-5 rotate-90 text-amber-300/90"
            aria-hidden="true"
          />
        </div>

        {/* ── Identitas kartu & nasabah (bawah). Baris data ditandai
            `aria-hidden`: angka contoh tidak perlu dibacakan. ── */}
        <div className="relative mt-auto">
          <p
            aria-hidden="true"
            className="font-mono text-amber-200/90 tracking-widest text-lg drop-shadow-sm"
          >
            {nomorTampil}
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
            {statusTeks}
          </p>

          <div
            aria-hidden="true"
            className="mt-3 flex items-end justify-between gap-4"
          >
            <p>
              <span className="block text-[9px] font-medium uppercase tracking-[0.24em] text-slate-400">
                Valid thru
              </span>
              <span className="block font-mono text-xs tracking-widest text-amber-200/80">
                {masaBerlakuTampil}
              </span>
            </p>
            <p className="text-right">
              <span className="block text-[9px] font-medium uppercase tracking-[0.24em] text-slate-400">
                Cardholder
              </span>
              <span className="block text-amber-300 font-semibold tracking-wider">
                {namaTampil}
              </span>
            </p>
          </div>

          {catatan !== "" && (
            <p className="mt-3 text-[9px] uppercase tracking-[0.18em] text-slate-500">
              {catatan}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
