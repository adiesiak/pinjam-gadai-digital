import { useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

export const TILT_MAKSIMUM_DERAJAT = 12;

export interface BatikPatternProps {
  warna?: string;
  opacity?: number;
  className?: string;
}

export function BatikPattern({
  warna = "#34d399",
  opacity = 0.42,
  className,
}: BatikPatternProps) {
  const id = `mega-mendung-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const opacityAman = Math.min(0.2, Math.max(0, opacity));

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
        <pattern id={id} width="188" height="132" patternUnits="userSpaceOnUse">
          <path
            d="M88 142c-35-18-37-44-4-58 19-8 39-7 56 2 19 10 28 27 23 44-5 14-20 23-40 24M102 125c-24-13-26-30-4-40 14-6 28-5 40 2 13 7 19 18 15 29-4 9-14 15-28 17M116 109c-13-8-14-17-2-22 8-3 16-3 23 1 7 4 10 10 8 15-2 5-8 8-16 9M-18 40c23-21 49-22 67-2 14 15 33 17 50 5 10-7 17-18 19-32M-9 51c18-16 38-17 52-2 18 19 43 22 64 7 13-9 21-23 23-40M0 62c13-12 27-13 37-2 21 23 52 27 78 9 17-12 27-30 29-50"
            fill="none"
            stroke={warna}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
          <path
            d="M190 48c-22-20-47-21-64-2-13 14-31 16-47 5-9-7-16-17-18-30M181 59c-17-15-36-16-49-2-17 18-41 21-61 7-12-9-20-22-22-38M172 70c-12-11-25-12-35-2-20 22-49 25-74 8-16-11-25-28-27-47"
            fill="none"
            stroke={warna}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
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
          className="relative isolate aspect-[1.586/1] w-full overflow-hidden rounded-[4.5%] border border-emerald-950/50 bg-emerald-900 p-5 text-[#fff8dc] shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45),inset_0_1px_1px_rgba(255,255,255,0.18),inset_0_-1px_1px_rgba(0,0,0,0.2)] ring-1 ring-[#c9a86a]/35 ring-offset-2 ring-offset-white/60 sm:p-6"
          style={{ transformStyle: "preserve-3d" }}
        >
          <BatikPattern warna="#34d399" opacity={0.2} />
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
