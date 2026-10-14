import { useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import { DEMO_CARD_NUMBER } from "@/lib/demoCardNumber";

export const TILT_MAKSIMUM_DERAJAT = 12;
const NOMOR_TAMPILAN = DEMO_CARD_NUMBER;

export interface BatikPatternProps {
  warna?: string;
  opacity?: number;
  className?: string;
}

export function BatikPattern({
  warna = "#1884e8",
  opacity = 0.9,
  className,
}: BatikPatternProps) {
  const id = `mega-mendung-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const opacityAman = Math.min(1, Math.max(0, opacity));
  const bentukAwan =
    "M-32 76C-12 76-5 66-6 54C-7 40 3 32 14 35C25 38 26 51 18 56C12 60 5 55 9 48C3 50 1 57 5 63C12 73 25 72 36 64C47 55 43 45 56 40C69 36 78 46 92 40C107 34 112 18 103 10C94 2 80 8 81 17C82 24 91 26 95 19C95 30 82 35 71 29C58 22 46 25 35 33C24 20 9 21-2 27C-17 35-23 52-17 66C-20 72-26 75-32 75Z";

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 size-full",
        className,
      )}
      opacity={opacityAman}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width="240" height="170" patternUnits="userSpaceOnUse">
          <g transform="translate(12 8)">
            <path
              d={bentukAwan}
              fill="#0d55b6"
              stroke="#62c4ff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
            />
            <path
              d={bentukAwan}
              fill="none"
              stroke="#effaff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M13 61C5 53 9 44 16 45C22 46 22 52 18 54C14 55 12 51 15 49M72 28C66 21 69 13 76 13C82 13 83 19 79 21C76 22 74 19 76 17"
              fill="none"
              stroke="#a4e5ff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.6"
            />
          </g>
          <g transform="translate(232 166) rotate(180) scale(0.78)">
            <path
              d={bentukAwan}
              fill="#104aab"
              stroke="#59b9f4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
            />
            <path
              d={bentukAwan}
              fill="none"
              stroke="#e5f7ff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M13 61C5 53 9 44 16 45C22 46 22 52 18 54C14 55 12 51 15 49M72 28C66 21 69 13 76 13C82 13 83 19 79 21C76 22 74 19 76 17"
              fill="none"
              stroke="#9bdcff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.6"
            />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

function CardWordmark() {
  return (
    <span className="font-sans text-lg font-semibold leading-none tracking-[0.24em] text-white">
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
        className="mt-0.5 text-[7px] font-semibold text-white"
        style={{ fontFamily: '"Mark for MC", Helvetica, Arial, sans-serif' }}
      >
        mastercard
      </span>
    </span>
  );
}

function PindaiCardMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[8px] font-semibold tracking-[0.12em] text-white">
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
          className="relative isolate aspect-[1.586/1] w-full overflow-hidden rounded-[4.5%] border border-[#91d9ff]/70 bg-[#07184f] p-5 text-white shadow-[0_20px_45px_-26px_rgba(5,12,45,0.7),inset_0_1px_1px_rgba(255,255,255,0.22),inset_0_-1px_1px_rgba(0,0,0,0.35)] ring-1 ring-[#91d9ff]/45 ring-offset-2 ring-offset-white/60 sm:p-6"
          style={{
            transformStyle: "preserve-3d",
            background:
              "linear-gradient(135deg, #102d86 0%, #07184f 48%, #06133f 100%)",
          }}
        >
          <BatikPattern warna="#1884e8" opacity={0.9} />
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white sm:text-xs">
                BUDI SANTOSO
              </p>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs tabular-nums tracking-[0.12em] text-white sm:text-sm">
                    {NOMOR_TAMPILAN}
                  </p>
                  <p className="mt-1 text-[8px] font-medium tracking-[0.12em] text-white/80">
                    BERLAKU SAMPAI{" "}
                    <span className="font-mono text-white">12/29</span>
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
