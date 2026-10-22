import { useReducedMotion } from "framer-motion";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";
import { DEMO_CARD_NUMBER } from "@/lib/demoCardNumber";

export const TILT_MAKSIMUM_DERAJAT = 12;
const NOMOR_TAMPILAN = DEMO_CARD_NUMBER;

export interface GelombangPatternProps {
  warna?: string;
  opacity?: number;
  className?: string;
  /**
   * `none` meregangkan motif ke seluruh kotak (kartu, agar ubinnya pas).
   * `xMidYMid slice` memotong rapi di kotak lebar (latar hero) tanpa
   * memanjangkan ombaknya.
   */
  preserveAspectRatio?: "none" | "xMidYMid slice";
  /** Gaya tambahan (mis. mask gradien) untuk memakai motif sebagai latar. */
  style?: CSSProperties;
  /**
   * `kartu` = motif penuh (empat swell, titik kuningan) untuk bidang kecil.
   * `latar` = versi tenang untuk bidang lebar: dua swell tanpa titik, supaya
   * latar hero tidak bersaing dengan judul dan kartu di atasnya.
   */
  ragam?: "kartu" | "latar";
}

/**
 * Motif ombak berlapis: empat garis swell sejajar yang bergeser 8 satuan ke
 * bawah, masing-masing dengan wash biru tipis dan aksen biru muda di
 * puncaknya, plus satu titik kuningan di tiap puncak. Menggantikan pola Kawung
 * lama, dengan palet dan bobot visual yang sama supaya identitas kartu tidak
 * berubah — hanya iramanya yang kini mengalir seperti air.
 */
export function GelombangPattern({
  warna = "#326eb1",
  opacity = 0.56,
  className,
  preserveAspectRatio = "none",
  style,
  ragam = "kartu",
}: GelombangPatternProps) {
  const id = `ombak-pindai-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const opacityAman = Math.min(0.56, Math.max(0, opacity));
  // Titik sambung (0,8) dan (64,8) memakai kemiringan yang sama, jadi pola
  // berulang tanpa garis patah di tepi ubin.
  const ombak = "M0 8C4 2 10 2 16 8S28 14 32 8S44 2 48 8S60 14 64 8";
  const tenang = ragam === "latar";
  const lapis = tenang
    ? [
        { geser: 0, tebal: 1 },
        { geser: 14, tebal: 0.5 },
      ]
    : [
        { geser: 0, tebal: 1 },
        { geser: 8, tebal: 0.86 },
        { geser: 16, tebal: 0.72 },
        { geser: 24, tebal: 0.58 },
      ];

  return (
    <svg
      aria-hidden="true"
      data-ragam={ragam}
      className={cn(
        "pointer-events-none absolute inset-0 size-full",
        className,
      )}
      opacity={opacityAman}
      style={style}
      viewBox="0 0 420 265"
      preserveAspectRatio={preserveAspectRatio}
    >
      <defs>
        <pattern id={id} width="64" height="40" patternUnits="userSpaceOnUse">
          <g fill="none" strokeLinecap="round">
            {lapis.map(({ geser, tebal }) => (
              <g
                key={geser}
                transform={`translate(0 ${geser})`}
                opacity={tebal}
              >
                <path
                  d={ombak}
                  stroke={
                    tenang ? "rgba(50,110,177,0.10)" : "rgba(50,110,177,0.16)"
                  }
                  strokeWidth="5"
                />
                <path
                  d={ombak}
                  stroke={warna}
                  strokeWidth={tenang ? "1.1" : "1.4"}
                />
                <path
                  d={ombak}
                  stroke="#9bcdf0"
                  strokeWidth="0.8"
                  transform="translate(0 -2)"
                />
              </g>
            ))}
          </g>
          {!tenang && (
            <>
              <circle cx="16" cy="3.5" r="1.5" fill="#c9a86a" />
              <circle cx="48" cy="3.5" r="1.5" fill="#c9a86a" />
            </>
          )}
        </pattern>
      </defs>
      <rect width="420" height="265" fill={`url(#${id})`} />
    </svg>
  );
}

function CardWordmark() {
  return (
    <span className="font-sans text-lg font-semibold leading-none tracking-[0.24em] text-emerald-700">
      PINDAI
    </span>
  );
}

function MastercardMark() {
  return (
    <span
      aria-label="Mastercard"
      className="flex flex-col items-center leading-none"
      role="img"
    >
      <svg aria-hidden="true" className="h-6 w-9" viewBox="0 0 48 32">
        <circle cx="18" cy="16" r="11" fill="#eb001b" />
        <circle cx="30" cy="16" r="11" fill="#f79e1b" />
        <path
          d="M24 7.75a11 11 0 0 1 0 16.5 11 11 0 0 1 0-16.5Z"
          fill="#ff5f00"
        />
      </svg>
      <span
        aria-hidden="true"
        className="mt-0.5 text-[7px] font-semibold text-[#1c1a15]"
        style={{ fontFamily: '"Mark for MC", Helvetica, Arial, sans-serif' }}
      >
        mastercard
      </span>
    </span>
  );
}

function PindaiCardMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[8px] font-semibold tracking-[0.12em] text-emerald-800">
      <svg
        aria-hidden="true"
        viewBox="0 0 28 14"
        className="h-3.5 w-7"
        fill="none"
      >
        <circle cx="9" cy="7" r="5.25" stroke="#1f6a62" strokeWidth="1.5" />
        <circle cx="20" cy="7" r="3.25" fill="#d4af37" />
      </svg>
      PINDAI CARD
    </span>
  );
}

function GoldChip() {
  const id = `chip-gold-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      aria-hidden="true"
      className="block h-[42px] w-14 shrink-0"
      viewBox="0 0 56 42"
      fill="none"
    >
      <defs>
        <linearGradient
          id={id}
          x1="0"
          y1="0"
          x2="56"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F6E27A" />
          <stop offset="0.28" stopColor="#D4AF37" />
          <stop offset="0.55" stopColor="#B8860B" />
          <stop offset="0.78" stopColor="#8A6A1F" />
          <stop offset="1" stopColor="#E8C85A" />
        </linearGradient>
        <linearGradient
          id={`${id}-shine`}
          x1="3"
          y1="5"
          x2="24"
          y2="27"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" stopOpacity="0.24" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="55"
        height="41"
        rx="6"
        fill={`url(#${id})`}
        stroke="#8A6A1F"
      />
      <rect
        x="1"
        y="1"
        width="54"
        height="40"
        rx="5.5"
        fill={`url(#${id}-shine)`}
      />
      <g stroke="#8A6A1F" strokeOpacity="0.5" strokeWidth="0.85">
        <rect x="19" y="10" width="18" height="22" rx="4" />
        <path d="M19 14H8a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4h11M37 14h11a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H37M28 10v22M4 21h15m18 0h15" />
      </g>
    </svg>
  );
}

function IkonContactless() {
  return (
    <svg
      aria-hidden="true"
      className="size-6 text-[#d4af37]"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M8 9a4 4 0 0 1 0 6M11 6a8 8 0 0 1 0 12M14 3a12 12 0 0 1 0 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function terapkanGerak(
  element: HTMLDivElement,
  tiltX: number,
  tiltY: number,
  offsetX: number,
  offsetY: number,
  glare = true,
) {
  element.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
  element.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
  element.style.setProperty("--layer-x", `${offsetX.toFixed(2)}px`);
  element.style.setProperty("--layer-y", `${offsetY.toFixed(2)}px`);
  element.style.setProperty("--shadow-x", `${(-offsetX * 1.5).toFixed(2)}px`);
  element.style.setProperty("--shadow-y", `${(-offsetY * 1.5).toFixed(2)}px`);
  element.style.setProperty("--glare-opacity", glare ? "1" : "0");
  element.style.setProperty("--glare-x", `${50 + offsetX * 4}%`);
  element.style.setProperty("--glare-y", `${50 + offsetY * 4}%`);
}

export interface KartuHeroPindaiProps {
  nama?: string;
  terverifikasi?: boolean;
  nomorKartu?: string;
  masaBerlaku?: string;
  statusTeks?: string;
  catatan?: string;
  interaktif?: boolean;
  className?: string;
}

export function PindaiCard3D({ className }: KartuHeroPindaiProps) {
  const reduceMotion = useReducedMotion() === true;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const currentTiltRef = useRef({ x: 0, y: 0 });
  const [touchActive, setTouchActive] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [sensorAllowed, setSensorAllowed] = useState(false);
  const [sensorActive, setSensorActive] = useState(false);
  const [needsMotionPermission, setNeedsMotionPermission] = useState(false);
  const [kartuTerlihat, setKartuTerlihat] = useState(false);
  const [halamanAktif, setHalamanAktif] = useState(true);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) =>
      setKartuTerlihat(entry.isIntersecting),
    );
    observer.observe(stage);
    const onVisibilityChange = () =>
      setHalamanAktif(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setCoarsePointer(query.matches);
      const orientation = window.DeviceOrientationEvent as
        | (typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<string>;
          })
        | undefined;
      const permissionRequired =
        query.matches && typeof orientation?.requestPermission === "function";
      setNeedsMotionPermission(permissionRequired);
      if (query.matches && !permissionRequired && orientation)
        setSensorAllowed(true);
    };
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reduceMotion) return;
    let visible = true;
    let pageActive = document.visibilityState === "visible";
    let frame = 0;
    const startedAt = performance.now();

    const pauseFrame = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const animate = (now: number) => {
      if (
        !visible ||
        !pageActive ||
        !coarsePointer ||
        sensorActive ||
        touchActive
      ) {
        frame = 0;
        return;
      }
      const phase = (((now - startedAt) % 8000) / 8000) * Math.PI * 2;
      const x = Math.sin(phase) * 3;
      const y = Math.cos(phase) * 3;
      currentTiltRef.current = { x, y };
      terapkanGerak(stage, x, y, (y / 3) * 2, (x / 3) * 2, false);
      frame = requestAnimationFrame(animate);
    };
    const resumeFrame = () => {
      if (
        !frame &&
        visible &&
        pageActive &&
        coarsePointer &&
        !sensorActive &&
        !touchActive
      ) {
        frame = requestAnimationFrame(animate);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        pauseFrame();
        terapkanGerak(stage, 0, 0, 0, 0, false);
      } else resumeFrame();
    });
    observer.observe(stage);
    const onVisibilityChange = () => {
      pageActive = document.visibilityState === "visible";
      if (!pageActive) pauseFrame();
      else resumeFrame();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    resumeFrame();

    return () => {
      pauseFrame();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    coarsePointer,
    halamanAktif,
    kartuTerlihat,
    reduceMotion,
    sensorActive,
    touchActive,
  ]);

  useEffect(() => {
    if (
      !sensorAllowed ||
      !coarsePointer ||
      reduceMotion ||
      !kartuTerlihat ||
      !halamanAktif
    )
      return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null || !stageRef.current)
        return;
      setSensorActive(true);
      const x = clamp(
        event.beta / 5,
        -TILT_MAKSIMUM_DERAJAT,
        TILT_MAKSIMUM_DERAJAT,
      );
      const y = clamp(
        event.gamma / 5,
        -TILT_MAKSIMUM_DERAJAT,
        TILT_MAKSIMUM_DERAJAT,
      );
      currentTiltRef.current = { x, y };
      terapkanGerak(
        stageRef.current,
        x,
        y,
        clamp(y * 0.65, -8, 8),
        clamp(x * 0.65, -8, 8),
      );
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () =>
      window.removeEventListener("deviceorientation", onOrientation, true);
  }, [coarsePointer, halamanAktif, kartuTerlihat, reduceMotion, sensorAllowed]);

  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (
      reduceMotion ||
      !stageRef.current ||
      (event.pointerType === "mouse" && coarsePointer)
    )
      return;
    const bounds = stageRef.current.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    const tiltX = (0.5 - y) * 2 * TILT_MAKSIMUM_DERAJAT;
    const tiltY = (x - 0.5) * 2 * TILT_MAKSIMUM_DERAJAT;
    if (event.pointerType === "touch") setTouchActive(true);
    currentTiltRef.current = { x: tiltX, y: tiltY };
    terapkanGerak(
      stageRef.current,
      tiltX,
      tiltY,
      (x - 0.5) * 16,
      (y - 0.5) * 16,
    );
  };

  const resetPointer = () => {
    setTouchActive(false);
    currentTiltRef.current = { x: 0, y: 0 };
    if (stageRef.current && !sensorActive)
      terapkanGerak(stageRef.current, 0, 0, 0, 0, false);
  };

  const requestMotion = async () => {
    const orientation = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    if (!orientation?.requestPermission) return;
    try {
      const permission = await orientation.requestPermission();
      setSensorAllowed(permission === "granted");
      if (permission !== "granted") setNeedsMotionPermission(false);
    } catch {
      setNeedsMotionPermission(false);
    }
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-[340px] lg:max-w-[420px]",
        className,
      )}
    >
      <div
        ref={stageRef}
        data-kartu-panggung="pindai-3d"
        className="relative [perspective:1000px] [transform-style:preserve-3d] [touch-action:pan-y]"
        style={{
          transform:
            "rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
          transition: reduceMotion ? "none" : "transform 120ms ease-out",
          willChange: reduceMotion ? "auto" : "transform",
        }}
        onPointerMove={updatePointer}
        onPointerLeave={resetPointer}
        onPointerCancel={resetPointer}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-4 left-[8%] right-[8%] h-8 rounded-full bg-emerald-950/35 blur-2xl"
          style={{
            transform: "translate(var(--shadow-x, 0px), var(--shadow-y, 0px))",
          }}
        />
        <article
          aria-hidden="true"
          data-kartu="pindai-hero"
          className="relative isolate aspect-[1.586/1] w-full overflow-hidden rounded-[4.5%] border border-[#c9a86a]/55 bg-white/90 p-5 text-[#1c1a15] shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45),inset_0_1px_1px_rgba(255,255,255,0.7),inset_0_-1px_1px_rgba(28,26,21,0.06)] ring-1 ring-[#c9a86a]/35 ring-offset-2 ring-offset-white/60 backdrop-blur-2xl sm:p-6"
          style={{
            transformStyle: "preserve-3d",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(241,237,227,0.92))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <GelombangPattern warna="#326eb1" opacity={0.56} />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full opacity-[0.035]"
            viewBox="0 0 120 76"
            preserveAspectRatio="none"
          >
            <filter id="pindai-card-noise">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="2"
                stitchTiles="stitch"
              />
            </filter>
            <rect width="100%" height="100%" filter="url(#pindai-card-noise)" />
          </svg>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(115deg,transparent_18%,rgba(255,255,255,0.18)_46%,transparent_68%)] transition-opacity duration-150"
            style={{
              opacity: reduceMotion ? 0.55 : "var(--glare-opacity, 0)",
              backgroundImage:
                "radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255,255,255,0.18), transparent 62%)",
            }}
          />
          <div
            className="relative flex h-full flex-col justify-between"
            style={{ transformStyle: "preserve-3d" }}
          >
            <header
              className="flex items-start justify-between"
              style={{
                transform:
                  "translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 24px)",
              }}
            >
              <CardWordmark />
              <div className="flex items-center gap-2">
                <MastercardMark />
                <IkonContactless />
              </div>
            </header>
            <div
              className="flex items-center"
              style={{
                transform:
                  "translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 26px)",
              }}
            >
              <GoldChip />
            </div>
            <div
              style={{
                transform:
                  "translate3d(var(--layer-x, 0px), var(--layer-y, 0px), 15px)",
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#1c1a15] sm:text-xs">
                BUDI SANTOSO
              </p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs tabular-nums tracking-[0.12em] text-emerald-800 sm:text-sm">
                    {NOMOR_TAMPILAN}
                  </p>
                  <p className="mt-1 text-[8px] font-medium tracking-[0.12em] text-slate-600">
                    BERLAKU SAMPAI{" "}
                    <span className="font-mono text-slate-900">12/29</span>
                  </p>
                </div>
                <PindaiCardMark />
              </div>
            </div>
          </div>
        </article>
      </div>
      {needsMotionPermission && !reduceMotion && (
        <button
          type="button"
          onClick={requestMotion}
          className="mx-auto mt-3 flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-emerald-900 underline decoration-emerald-800/50 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
        >
          Aktifkan gerak kartu
        </button>
      )}
      <p className="mt-3 text-center text-[11px] font-medium text-slate-700">
        PINDAI · Pinjaman dan gadai digital
      </p>
    </div>
  );
}
