import { useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Lock,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  landingTemplateInfo,
  landingTemplatePreset,
  templateLandingAman,
  type LandingTemplateId,
} from "@/lib/landingTemplate";
import { KartuHeroPindai } from "./KartuHeroPindai";
import type { HandleTemplate } from "./templateScene";

/**
 * Hero landing PINDAI — SATU komponen untuk ENAM template 3D.
 *
 * Konten hero (eyebrow, judul, deskripsi, CTA, poin kepercayaan, kartu merek)
 * sengaja TIDAK diduplikasi ke setiap template: yang berbeda antar template
 * hanyalah adegan 3D-nya. Ganti template = ganti pengalaman visual, bukan ganti
 * konten. Adegan dipilih dari ID template aktif (`lib/landingTemplate.ts`) dan
 * hanya SATU scene yang hidup pada satu waktu — preset di dalam
 * `templateScene.ts` yang menentukan gambarannya.
 *
 * Susunan lapisan (belakang → depan):
 *   1. Gradien gelap CSS bertema template — selalu ada; ini juga fallback bila
 *      WebGL gagal. Warnanya berasal dari palet template, bukan warna acak baru.
 *   2. `<canvas>` WebGL — kartu emerald matte (3D Premium Card), brankas siber
 *      (Cyber Vault), maskot A.I. (Cyber Mascot), jaringan ledger (Ledger
 *      Matrix), koin simulator (Loan Simulator), atau portal kuantum (Quantum
 *      Portal). Dimuat malas lewat `import("./templateScene")` supaya mesin 3D
 *      tidak ada di bundel awal.
 *   3. Fallback statis — hanya tampil saat WebGL tidak tersedia/gagal.
 *   4. Konten hero + kartu 3D (CSS transform) — selalu DOM, jadi teks/CTA tidak
 *      pernah bergantung pada 3D.
 *
 * INTERAKSI (yang membuatnya terasa seperti objek fisik):
 *   - Pointer di atas KARTU memiringkannya mengikuti cursor (rotateY ±14°,
 *     rotateX ±10°) dengan peredaman lerp — bukan lompatan.
 *   - Saat pointer masuk, kartu terangkat + membesar sedikit + glow hijau PINDAI
 *     naik, dan kilau permukaan mengikuti pointer (`--mx`/`--my`). Adegan 3D ikut
 *     menerima sinyal hover (`setHover`) — itulah yang membuat brankas (Vault)
 *     membuka cincinnya, maskot A.I. menyapa, dan portal menyala.
 *   - Seret (pointer ditekan lalu digeser) = PUTARAN BEBAS: sudut menumpuk
 *     (`PUTAR_Y_PER_PX` derajat per piksel) sehingga kartu bisa diputar penuh
 *     360° atau lebih oleh pengguna. Setelah dilepas, kartu menetap pada
 *     kelipatan putaran terdekat — arah putaran tidak pernah dibalik paksa.
 *   - Sentuh: `touch-action: pan-y` membuat gulir VERTIKAL tetap milik halaman,
 *     sedangkan geser horizontal memutar kartu. Tidak pernah `preventDefault`.
 *   - TIDAK ADA rotasi otomatis/spin sendiri: kartu hanya bergerak karena
 *     pengguna (hover memiringkan terbatas; seret memutar bebas).
 *   - Gulir halaman diteruskan ke adegan (`setSkrol`) sehingga template 3D
 *     Premium Card berputar mengikuti posisi gulir, bukan berputar sendiri.
 *   - Pada template 3D Interactive Loan Simulator, slider tenor di dalam hero
 *     menggerakkan `setSlider` (putaran koin + radius cincin kedalaman).
 *
 * Prinsip yang dijaga:
 *  - Headline, deskripsi, dan CTA SELALU tampil tanpa WebGL.
 *  - Tidak ada `setState` per frame: tilt, angkat, dan parallax ditulis langsung
 *    ke `style` lewat ref di dalam satu rAF yang berhenti saat idle.
 *  - `prefers-reduced-motion` menonaktifkan tilt, angkat, parallax, riak, dan
 *    loop animasi; yang tersisa hanya komposisi statis.
 *  - Semua akses window/document ada di dalam effect (aman untuk Electron).
 *  - Mobile: DPR dibatasi lebih ketat dan mode ringan mengurangi partikel/loop.
 *
 * Catatan penamaan: kelas CSS (`hero-laut`, `laut-dasar`, `laut-fallback`)
 * dipertahankan apa adanya karena token itulah yang sudah ada di `index.css`.
 * Latar tiap template diatur lewat palet template, bukan kelas baru per template.
 */
export interface LandingHeroProps {
  /** ID template aktif; nilai tak dikenal jatuh ke template default. */
  template?: LandingTemplateId;
  eyebrow: string;
  judul1: string;
  judul2: string;
  deskripsi: string;
  ctaUtama: { label: string; href: string; disabled?: boolean };
  ctaSekunder: { label: string; onClick: () => void };
  mikro: string;
  sudahMasuk: boolean;
}

/** Selang minimum antar riak (ms) — mencegah banjir riak tiap frame pointer. */
const JEDA_RIAK_MS = 190;
/** Batas kemiringan saat HOVER: cukup terasa, tidak sampai membuat kartu terbalik. */
const ROT_Y_MAKS = 14;
const ROT_X_MAKS = 10;
/**
 * Putaran saat DISERET: derajat per piksel. Sumbu Y bebas (bisa lewat 360°
 * untuk melihat sisi belakang), sumbu X tetap dibatasi `ROT_X_MAKS` supaya
 * kartu tidak pernah tenggelam ke dalam panggung.
 */
const PUTAR_Y_PER_PX = 0.72;
const PUTAR_X_PER_PX = 0.34;
/** Ambang (derajat) yang menandai seretan sebagai putaran sungguhan. */
const PUTAR_MIN_DERAJAT = 4;
/** Angkat (px) & tambahan skala saat pointer berada di atas kartu. */
const ANGKAT_PX = 22;
const SKALA_HOVER = 0.045;
/** Faktor peredaman gerak menuju target (0..1 per frame). */
const LERP = 0.12;
/** DPR maksimum desktop; perangkat kecil dibatasi lebih ketat (lihat `dprUntuk`). */
const DPR_DESKTOP = 1.75;
const DPR_MOBILE = 1.4;

type Gerak = {
  tx: number;
  ty: number;
  x: number;
  y: number;
  angkat: number;
  angkatTarget: number;
};

/** Keadaan seret kartu: posisi pointer terakhir + apakah sudah benar-benar berputar. */
type Seret = {
  aktif: boolean;
  x: number;
  y: number;
  berputar: boolean;
};

/** Tulis transform kartu dari keadaan gerak (dipakai loop & saat menetap). */
function tulisTransform(kartu: HTMLDivElement | null, k: Gerak): void {
  if (kartu === null) return;
  kartu.style.transform =
    `translate3d(0, ${(-k.angkat * ANGKAT_PX).toFixed(2)}px, 0) ` +
    `scale(${(1 + k.angkat * SKALA_HOVER).toFixed(4)}) ` +
    `rotateX(${k.y.toFixed(3)}deg) rotateY(${k.x.toFixed(3)}deg)`;
}

/** Batas DPR per perangkat: menghemat piksel retina tanpa terlihat pecah. */
function dprUntuk(hp: boolean): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, hp ? DPR_MOBILE : DPR_DESKTOP);
}

export function LandingHero(props: LandingHeroProps) {
  // Dinormalkan di batas komponen: nilai tak dikenal dari API/kode lain tetap
  // menghasilkan template yang dapat dirender, bukan halaman kosong.
  const template = templateLandingAman(props.template);
  const info = landingTemplateInfo(template);
  const preset = landingTemplatePreset(template);
  /**
   * Riak permukaan hanya bermakna pada scene ber-air. Keenam template baru
   * (kartu premium, vault, maskot, ledger, simulator, portal) tidak punya air,
   * jadi jalur riak sengaja nonaktif — API `tambahRiak` tetap ada di mesin 3D
   * agar template ber-air bisa ditambahkan lagi tanpa mengubah antarmuka.
   */
  const beriak: boolean = false;

  const reduce = useReducedMotion() === true;
  /** Template simulator menampilkan kontrol tenor di dalam hero. */
  const simulator = template === "loan-simulator";
  const [tenorBulan, setTenorBulan] = useState(6);
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panggungRef = useRef<HTMLDivElement | null>(null);
  const kartuRef = useRef<HTMLDivElement | null>(null);
  const kilauRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HandleTemplate | null>(null);
  /**
   * Preset yang gagal membangun WebGL. Disimpan sebagai PRESET (bukan boolean)
   * supaya `gagal` otomatis kembali false ketika template diganti — tanpa
   * memanggil setState di dalam effect.
   */
  const [gagalPreset, setGagalPreset] = useState<number | null>(null);
  const gagal = gagalPreset === preset;

  // Keadaan gerak kartu + parallax pointer scene (-1..1).
  const gerakRef = useRef<Gerak>({
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    angkat: 0,
    angkatTarget: 0,
  });
  const loopRef = useRef(0);
  const riakTerakhirRef = useRef(0);
  const posisiRiakRef = useRef({ x: 0.5, y: 0.5 });
  const sentuhAktifRef = useRef(false);
  const seretRef = useRef<Seret>({ aktif: false, x: 0, y: 0, berputar: false });
  /**
   * Nilai interaksi dokumen yang harus langsung dipakai begitu adegan selesai
   * dibangun (lazy import). Disimpan di ref supaya tidak ada setState per frame
   * dan nilai tetap benar walau pengguna sudah menggulir/menggeser lebih dulu.
   */
  const skrolRef = useRef(0);
  const sliderRef = useRef(0.5);

  /* ── Bangun adegan WebGL (dimuat malas). Bila gagal → fallback CSS. ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let dibatalkan = false;
    let handle: HandleTemplate | null = null;
    let rafUkur = 0;

    const hp =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(max-width: 767px)").matches === true ||
        (window.matchMedia?.("(pointer: coarse)").matches === true &&
          window.innerWidth < 1024));

    void (async () => {
      try {
        const mod = await import("./templateScene");
        if (dibatalkan) return;
        handle = mod.buatSceneTemplate(canvas, {
          preset,
          reduceMotion: reduce,
          dpr: dprUntuk(hp),
          ringan: hp,
        });
      } catch {
        handle = null;
      }
      if (dibatalkan) {
        handle?.destroy();
        handle = null;
        return;
      }
      if (handle === null) {
        setGagalPreset(preset);
        return;
      }
      sceneRef.current = handle;
      // Terapkan interaksi dokumen yang sudah terjadi sebelum adegan siap.
      handle.setSkrol(skrolRef.current);
      handle.setSlider(sliderRef.current);
      handle.setUkuran(canvas.clientWidth || 1, canvas.clientHeight || 1);

      // Ukuran awal mungkin belum final saat lazy-load selesai — ukur ulang
      // sekali pada frame berikutnya, lalu biarkan ResizeObserver menangani.
      rafUkur = requestAnimationFrame(() => {
        if (!dibatalkan)
          handle?.setUkuran(canvas.clientWidth || 1, canvas.clientHeight || 1);
      });
    })();

    const ro = new ResizeObserver(() => {
      const h = sceneRef.current;
      if (h !== null)
        h.setUkuran(canvas.clientWidth || 1, canvas.clientHeight || 1);
    });
    ro.observe(canvas);

    return () => {
      dibatalkan = true;
      if (rafUkur !== 0) cancelAnimationFrame(rafUkur);
      ro.disconnect();
      sceneRef.current = null;
      handle?.destroy();
    };
  }, [preset, reduce]);

  /*
   * ── Gulir halaman → putaran/kedalaman adegan (`setSkrol`) ──
   * Dihitung dari posisi hero terhadap viewport, dibaca di dalam rAF supaya
   * satu gulir tidak memicu puluhan penulisan uniform. Listener pasif: gulir
   * milik halaman, bukan milik hero.
   */
  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;
    let raf = 0;
    const hitung = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const tinggi = rect.height || 1;
      const nilai = Math.min(1, Math.max(0, -rect.top / tinggi));
      skrolRef.current = nilai;
      sceneRef.current?.setSkrol(nilai);
    };
    const onSkrol = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(hitung);
    };
    hitung();
    window.addEventListener("scroll", onSkrol, { passive: true });
    return () => {
      window.removeEventListener("scroll", onSkrol);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  /* ── Slider simulator → putaran koin (`setSlider`), hanya template 5. ── */
  useEffect(() => {
    if (!simulator) return;
    const nilai = Math.min(1, Math.max(0, (tenorBulan - 1) / 23));
    sliderRef.current = nilai;
    sceneRef.current?.setSlider(nilai);
  }, [simulator, tenorBulan]);

  /* ── Hentikan loop saat hero keluar layar atau tab disembunyikan. ── */
  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;
    let terlihat = true;
    const terapkan = () =>
      sceneRef.current?.setAktif(terlihat && !document.hidden);
    const io = new IntersectionObserver(
      (entries) => {
        terlihat = entries.some((e) => e.isIntersecting);
        terapkan();
      },
      { threshold: 0.05 },
    );
    io.observe(section);
    document.addEventListener("visibilitychange", terapkan);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", terapkan);
    };
  }, []);

  /* ── Loop gerak kartu. Ditulis ke `style` (bukan setState) & berhenti idle. ── */
  const pastikanLoop = useCallback(() => {
    if (loopRef.current !== 0) return;
    const langkah = () => {
      const k = gerakRef.current;
      k.x += (k.tx - k.x) * LERP;
      k.y += (k.ty - k.y) * LERP;
      k.angkat += (k.angkatTarget - k.angkat) * LERP;
      const nyaman =
        Math.abs(k.tx - k.x) < 0.01 &&
        Math.abs(k.ty - k.y) < 0.01 &&
        Math.abs(k.angkatTarget - k.angkat) < 0.002;
      if (nyaman) {
        k.x = k.tx;
        k.y = k.ty;
        k.angkat = k.angkatTarget;
        // Putaran bebas bisa menumpuk (mis. 720°). Dinormalkan HANYA saat sudah
        // menetap (x === tx): mengurangi kelipatan 360° pada keduanya tidak
        // mengubah gambar sama sekali, tetapi menjaga angkanya tetap kecil.
        const kelipatan = Math.round(k.tx / 360);
        if (kelipatan !== 0) {
          k.tx -= kelipatan * 360;
          k.x = k.tx;
        }
        tulisTransform(kartuRef.current, k);
        loopRef.current = 0;
        return;
      }
      tulisTransform(kartuRef.current, k);
      loopRef.current = requestAnimationFrame(langkah);
    };
    loopRef.current = requestAnimationFrame(langkah);
  }, []);

  useEffect(() => {
    return () => {
      if (loopRef.current !== 0) cancelAnimationFrame(loopRef.current);
      loopRef.current = 0;
    };
  }, []);

  /* ── Kartu: tilt mengikuti pointer + highlight permukaan. ── */
  /**
   * Kilau permukaan mengikuti posisi pointer relatif panggung.
   * Mengembalikan posisi ternormalisasi (0..1) supaya pemanggil tidak perlu
   * mengukur ulang panggung, atau `null` bila panggung belum punya ukuran.
   */
  const perbaruiKilau = useCallback(
    (clientX: number, clientY: number): { px: number; py: number } | null => {
      const panggung = panggungRef.current;
      if (panggung === null) return null;
      const rect = panggung.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const kilau = kilauRef.current;
      if (kilau !== null) {
        kilau.style.setProperty("--mx", `${(px * 100).toFixed(2)}%`);
        kilau.style.setProperty("--my", `${(py * 100).toFixed(2)}%`);
      }
      return { px, py };
    },
    [],
  );

  const terapkanTilt = useCallback(
    (clientX: number, clientY: number) => {
      const posisi = perbaruiKilau(clientX, clientY);
      if (posisi === null) return;
      const k = gerakRef.current;
      k.tx = (posisi.px * 2 - 1) * ROT_Y_MAKS; // cursor kanan → miring kanan
      k.ty = -(posisi.py * 2 - 1) * ROT_X_MAKS; // cursor atas → miring atas
      pastikanLoop();
    },
    [pastikanLoop, perbaruiKilau],
  );

  /**
   * Putaran bebas saat kartu diseret.
   *
   * Beda dari `terapkanTilt` yang MENETAPKAN sudut (maksimum ±14°), di sini sudut
   * DITAMBAH dari pergerakan pointer: makin jauh seretan, makin besar putaran,
   * dan nilainya boleh melewati 360° sehingga kartu bisa dilihat dari sisi
   * belakang. Tidak ada animasi otomatis — semuanya berasal dari gerak pengguna.
   */
  const putarKartu = useCallback(
    (clientX: number, clientY: number) => {
      const seret = seretRef.current;
      const k = gerakRef.current;
      k.tx += (clientX - seret.x) * PUTAR_Y_PER_PX;
      k.ty = Math.max(
        -ROT_X_MAKS,
        Math.min(ROT_X_MAKS, k.ty - (clientY - seret.y) * PUTAR_X_PER_PX),
      );
      seret.x = clientX;
      seret.y = clientY;
      if (Math.abs(k.tx) >= PUTAR_MIN_DERAJAT) seret.berputar = true;
      perbaruiKilau(clientX, clientY);
      pastikanLoop();
    },
    [pastikanLoop, perbaruiKilau],
  );

  const onKartuMasuk = useCallback(() => {
    sceneRef.current?.setHover(true);
    if (reduce) return;
    gerakRef.current.angkatTarget = 1;
    kartuRef.current?.classList.add("kartu-3d--naik");
    if (kilauRef.current !== null) kilauRef.current.style.opacity = "1";
    pastikanLoop();
  }, [pastikanLoop, reduce]);

  /**
   * Kembalikan kartu ke netral dengan lembut (pointer keluar / selesai).
   *
   * Bila seretan sudah benar-benar memutar kartu, sudutnya DISELARASKAN ke
   * kelipatan 360° terdekat: kartu menetap pada tampak depan tanpa berputar balik
   * melewati seluruh putaran yang baru saja dilakukan pengguna. Dideklarasikan
   * sebelum handler seret karena dipakai di dalamnya (mis. saat tombol sudah
   * dilepas di luar jendela).
   */
  const selesaiSeret = useCallback(() => {
    sentuhAktifRef.current = false;
    const seret = seretRef.current;
    seret.aktif = false;
    sceneRef.current?.setHover(false);
    const k = gerakRef.current;
    k.angkatTarget = 0;
    if (seret.berputar) {
      k.tx = Math.round(k.tx / 360) * 360;
      k.ty = 0;
      seret.berputar = false;
    } else {
      k.tx = 0;
      k.ty = 0;
    }
    kartuRef.current?.classList.remove("kartu-3d--naik", "kartu-3d--putar");
    if (kilauRef.current !== null) kilauRef.current.style.opacity = "0";
    pastikanLoop();
  }, [pastikanLoop]);

  /**
   * Pointer keluar dari kotak kartu. Kalau kartu sedang diseret, seretannya
   * SENGAJA dilanjutkan: pointer sudah ditangkap (`setPointerCapture`), jadi
   * pengguna boleh memutar kartu sambil menggeser kursor keluar dari kartu.
   * Kalau tidak sedang diseret, cukup kembalikan kartu ke netral.
   */
  const onKartuKeluar = useCallback(() => {
    if (seretRef.current.aktif) return;
    selesaiSeret();
  }, [selesaiSeret]);

  /**
   * Mulai menyeret kartu (pointer ditekan). Berlaku untuk mouse MAUPUN sentuh:
   * seret adalah satu-satunya jalan masuk ke putaran bebas, sedangkan melintas
   * tanpa menekan hanya memiringkan kartu.
   */
  const mulaiSeret = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") sentuhAktifRef.current = true;
      onKartuMasuk();
      if (reduce) return;
      seretRef.current = {
        aktif: true,
        x: e.clientX,
        y: e.clientY,
        berputar: false,
      };
      kartuRef.current?.classList.add("kartu-3d--putar");
      // Penangkapan pointer membuat seretan tetap terlacak walau kursor keluar
      // dari kotak kartu, dan `pointerup` tetap sampai ke elemen ini sehingga
      // putaran tidak pernah "nyangkut" setengah jalan.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [onKartuMasuk, reduce],
  );

  const onKartuGerak = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      onKartuMasuk();
      if (reduce) return;
      const seret = seretRef.current;
      if (seret.aktif) {
        // Jaring pengaman: tombol sudah dilepas di luar jendela → selesaikan
        // seretan dengan perilaku yang sama seperti `pointerup`.
        if (e.buttons === 0) {
          selesaiSeret();
          return;
        }
        putarKartu(e.clientX, e.clientY);
        return;
      }
      // Sentuh tanpa menekan kartu tidak memiringkan apa pun (gulir tetap milik
      // halaman); mouse yang hanya melintas tetap mendapat tilt terbatas.
      if (e.pointerType === "touch") return;
      terapkanTilt(e.clientX, e.clientY);
    },
    [onKartuMasuk, putarKartu, reduce, selesaiSeret, terapkanTilt],
  );

  /* ── Section: parallax scene + riak. Tidak pernah preventDefault → scroll. ── */
  const onSectionGerak = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch" && !sentuhAktifRef.current) return;
      const section = sectionRef.current;
      if (section === null) return;
      const rect = section.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

      sceneRef.current?.setPointer(px * 2 - 1, py * 2 - 1);
      if (reduce || !beriak) return;

      // Riak: dibatasi jeda waktu DAN jarak supaya tidak menumpuk.
      const now = performance.now();
      const jauh =
        Math.abs(px - posisiRiakRef.current.x) +
          Math.abs(py - posisiRiakRef.current.y) >
        0.02;
      if (now - riakTerakhirRef.current > JEDA_RIAK_MS && jauh) {
        riakTerakhirRef.current = now;
        posisiRiakRef.current = { x: px, y: py };
        const handle = sceneRef.current;
        if (handle !== null) {
          // Riak selalu di laut: uv.y (dari bawah) di bawah horizon.
          const uvY = Math.min(1 - py, handle.horizonUv - 0.02);
          handle.tambahRiak(px, Math.max(0.06, uvY));
        }
      }
    },
    [beriak, reduce],
  );

  const onSectionTekan = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") sentuhAktifRef.current = true;
      if (reduce || !beriak) return;
      const section = sectionRef.current;
      const handle = sceneRef.current;
      if (section === null || handle === null) return;
      const rect = section.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      handle.tambahRiak(
        px,
        Math.max(0.06, Math.min(1 - py, handle.horizonUv - 0.02)),
      );
    },
    [beriak, reduce],
  );

  const onSectionLepas = useCallback(() => {
    sentuhAktifRef.current = false;
  }, []);

  return (
    <section
      ref={sectionRef}
      onPointerMove={onSectionGerak}
      onPointerDown={onSectionTekan}
      onPointerUp={onSectionLepas}
      onPointerCancel={onSectionLepas}
      aria-labelledby="hero-judul"
      data-template={template}
      className="hero-laut relative isolate overflow-hidden border-b border-slate-800/60 text-white"
      style={{ backgroundColor: info.palet[2] }}
    >
      {/* 0. Ambient mesh gradient Deep Emerald (#042F2E → #064E3B). Lapisan ini
             adalah "lantai" panggung: selalu ada, di bawah semua lapisan lain,
             sehingga hero tidak pernah bergantung pada WebGL untuk punya warna
             identitas. `aria-hidden` + `pointer-events-none`: murni dekoratif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#042F2E] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,78,59,0.8),rgba(4,47,46,1))]"
      />

      {/* 0b. Dua orb glow samar DIHAPUS (audit antislop + DESIGN.md §4).
              Alasannya ditulis supaya tidak dikembalikan tanpa berpikir:
              (a) orb blur di belakang hero termasuk keluarga default yang
                  dilarang R-01, dan (b) orb berdenyut memakai `animate-pulse`
                  tanpa peristiwa apa pun — pelanggaran R-19 (gerak berulang
                  tanpa tujuan). Titik fokus panggung ini adalah KARTU, dan
                  pendaran ganda emerald di kartu itu satu-satunya glow yang
                  boleh menonjol (R-13: maksimal 1–2 elemen). Lapisan 0 di
                  bawah tetap ada sebagai lantai warna panggung. */}

      {/* 1. Gradien dasar Deep Space Emerald — selalu ada, sekaligus fallback
             WebGL. Kuningan (gold foil) TIDAK dipakai sebagai wash latar;
             aksen emas hanya pada chip/logo kartu. */}
      <div
        aria-hidden="true"
        className="laut-dasar pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(120% 90% at 22% 18%, ${info.palet[0]}cc, transparent 62%), radial-gradient(90% 70% at 78% 82%, #10B98122, transparent 70%)`,
        }}
      />

      {/* 1b. Atmosfer: debu emerald halus (emerald dust) yang mengambang. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(1.6px 1.6px at 18% 24%, rgba(110,231,183,0.55), transparent 60%)," +
            "radial-gradient(1.4px 1.4px at 62% 12%, rgba(52,211,153,0.45), transparent 60%)," +
            "radial-gradient(1.8px 1.8px at 82% 46%, rgba(16,185,129,0.40), transparent 60%)," +
            "radial-gradient(1.3px 1.3px at 34% 72%, rgba(110,231,183,0.38), transparent 60%)," +
            "radial-gradient(1.5px 1.5px at 72% 84%, rgba(52,211,153,0.34), transparent 60%)",
          backgroundSize: "320px 260px",
        }}
      />

      {/* 1c. Light trails digital samar — memberi kedalaman, bukan subjek. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent, rgba(110,231,183,0.28) 50%, transparent)," +
            "linear-gradient(90deg, transparent, rgba(16,185,129,0.20) 50%, transparent)",
          backgroundSize: "100% 1px, 100% 1px",
          backgroundPosition: "0 26%, 0 62%",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* 2. Adegan WebGL (dekoratif — tidak pernah mencuri pointer). */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 size-full transition-opacity duration-700 ${
          gagal ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* 3. Fallback statis — hanya saat WebGL tidak tersedia/gagal. */}
      {gagal && (
        <div
          aria-hidden="true"
          className="laut-fallback pointer-events-none absolute inset-0"
        >
          {beriak && (
            <>
              <span className="laut-riak-css laut-riak-css--1" />
              <span className="laut-riak-css laut-riak-css--2" />
              <span className="laut-riak-css laut-riak-css--3" />
            </>
          )}
          <span
            className="absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
            style={{ backgroundColor: info.palet[0] }}
          />
        </div>
      )}

      {/* Cahaya aksen — lembut, memperkuat rim light kartu. Bukan warna dominan. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-[12%] size-[26rem] rounded-full blur-2xl sm:size-[34rem]"
        style={{
          background: `radial-gradient(circle, ${info.palet[1]}1f, transparent 62%)`,
        }}
      />

      {/* 4. Konten */}
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pb-24 lg:pt-20">
        <div className="relative z-10 max-w-xl">
          <p
            className="motion-slide-up inline-flex items-center gap-2 rounded-full border border-[#c9a86a]/30 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e6d3a5]"
            style={{ animationDelay: "0.02s" }}
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {props.eyebrow}
          </p>

          <h1
            id="hero-judul"
            className="motion-slide-up mt-6 text-[2.15rem] font-semibold leading-[1.08] tracking-[-0.035em] text-white min-[480px]:text-[2.7rem] sm:text-5xl lg:text-[3.6rem]"
            style={{ animationDelay: "0.08s" }}
          >
            {props.judul1}
            <br />
            <span className="font-serif font-medium italic text-[#6EE7B7]">
              {props.judul2}
            </span>
          </h1>

          <p
            className="motion-slide-up mt-6 max-w-lg text-base leading-7 text-slate-300/90 sm:text-lg sm:leading-8"
            style={{ animationDelay: "0.14s" }}
          >
            {props.deskripsi}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "0.2s" }}
          >
            <Button
              asChild
              disabled={props.ctaUtama.disabled}
              className="animate-sheen h-12 rounded-full bg-[#064E3B] px-6 text-white ring-1 ring-[#c9a86a]/40 transition-transform hover:-translate-y-0.5 hover:bg-[#0B5F49]"
            >
              <Link to={props.ctaUtama.href}>
                {props.ctaUtama.label}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={props.ctaSekunder.onClick}
              className="group h-12 rounded-full border-white/25 bg-white/[0.04] px-6 text-white hover:bg-white/10 hover:text-white"
            >
              {props.ctaSekunder.label}
              <ArrowRight
                className="ml-2 size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Button>
          </div>

          <p
            className="motion-slide-up mt-6 max-w-lg text-xs leading-5 text-slate-400"
            style={{ animationDelay: "0.26s" }}
          >
            {props.mikro}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-xs font-medium text-slate-300 sm:text-sm"
            style={{ animationDelay: "0.32s" }}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck
                className="size-4 text-[#6EE7B7]"
                aria-hidden="true"
              />
              Rincian biaya terbuka
            </span>
            <span className="flex items-center gap-2">
              <Lock className="size-4 text-[#6EE7B7]" aria-hidden="true" />
              Verifikasi OTP WhatsApp
            </span>
          </div>

          {/* Simulasi tenor hanya pada template 3D Interactive Loan Simulator:
              menggerakkan putaran koin & cincin kedalaman di adegan 3D. */}
          {simulator && (
            <div
              className="motion-slide-up mt-6 max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              style={{ animationDelay: "0.28s" }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6EE7B7]">
                  Simulasi tenor
                </p>
                <p className="text-sm font-semibold tabular-nums text-white">
                  {tenorBulan} bulan
                </p>
              </div>
              <Slider
                className="mt-3"
                min={1}
                max={24}
                step={1}
                value={[tenorBulan]}
                onValueChange={(v) => setTenorBulan(v[0] ?? 1)}
                aria-label="Simulasi tenor dalam bulan"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Geser untuk melihat koin dan cincin kedalaman bergerak. Angka
                ini ilustrasi interaksi visual — rincian biaya mengikuti produk
                yang berlaku.
              </p>
            </div>
          )}

          {/* Hanya saat WebGL gagal: pengunjung diberi tahu tanpa kehilangan CTA. */}
          {gagal && (
            <p
              role="status"
              className="mt-6 flex max-w-lg items-start gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2.5 text-xs leading-5 text-slate-300"
            >
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0 text-[#6EE7B7]"
                aria-hidden="true"
              />
              <span>
                Pengalaman 3D tidak dapat dimuat pada perangkat ini. PINDAI
                tetap dapat digunakan seperti biasa lewat tombol di atas.
              </span>
            </p>
          )}
        </div>

        {/* Kartu hero 3D — objek merek yang bisa disentuh, bukan alat bayar.
            Pembungkusnya mengambang perlahan (`.animate-float`, 7 detik
            naik-turun) seperti mockup melayang; animasi ini ada di pembungkus,
            bukan di panggung, sehingga kemiringan/putaran kartu yang dikendalikan
            pointer tidak pernah bertabrakan dengan gerak mengambangnya. Saat
            gerak dikurangi (`prefers-reduced-motion`), kartunya diam. */}
        <div
          className={`relative mx-auto w-full max-w-md lg:max-w-none ${
            reduce ? "" : "animate-float"
          }`}
        >
          <div
            ref={panggungRef}
            className="kartu-panggung motion-scale pointer-events-auto"
            style={{ animationDelay: "0.16s" }}
            onPointerEnter={onKartuMasuk}
            onPointerMove={onKartuGerak}
            onPointerDown={mulaiSeret}
            onPointerLeave={onKartuKeluar}
            onPointerUp={selesaiSeret}
            onPointerCancel={selesaiSeret}
          >
            <div ref={kartuRef} className="kartu-3d">
              {/* Tilt + angkat kartu diurus panggung di atas, jadi kartunya
                  diminta TIDAK mengurus geraknya sendiri (`interaktif={false}`)
                  supaya tidak ada dua kemiringan bertumpuk. Kilau permukaan
                  tetap dari lapisan `.kartu-3d__kilau` milik panggung ini. */}
              <KartuHeroPindai
                interaktif={false}
                className="lg:max-w-none"
                nama="Budi Setiawan"
                terverifikasi
              />
              <div
                ref={kilauRef}
                className="kartu-3d__kilau"
                aria-hidden="true"
              />
            </div>
          </div>
          <div aria-hidden="true" className="kartu-3d__bayangan" />
          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.26em] text-slate-500 lg:text-left">
            {props.sudahMasuk ? "Sesi aktif" : "Akun PINDAI"} · Pinjam &amp;
            gadai digital
          </p>
        </div>
      </div>

      {/* Pelebur ke bagian berikutnya. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{
          backgroundImage: `linear-gradient(to bottom, transparent, ${info.palet[2]})`,
        }}
      />
    </section>
  );
}

/**
 * Batas kesalahan untuk pengalaman 3D.
 *
 * Hero ini sengaja tidak membangun pohon React 3D (canvas digambar langsung),
 * jadi kegagalan WebGL sudah ditangani lewat `gagal`. Boundary ini menangkap
 * kegagalan RENDER yang tak terduga (mis. dari komponen kartu) supaya halaman
 * depan tidak pernah crash: yang tampil adalah fallback statis + jalan masuk
 * ke produk, bukan layar putih.
 */
export class TemplateBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}> {
  state = { rusak: false };

  static getDerivedStateFromError() {
    return { rusak: true };
  }

  componentDidCatch(error: unknown) {
    // Dicatat untuk debugging; tidak ada layanan logging yang dipanggil diam-diam.
    console.error("Landing template gagal dirender:", error);
  }

  render() {
    return this.state.rusak ? this.props.fallback : this.props.children;
  }
}
