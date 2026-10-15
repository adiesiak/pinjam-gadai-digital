import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { LapisanTandaAir } from "@/components/WatermarkedDoc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * BUKTI KYC: foto berkas, penampil ber-zoom, mode bandingkan, dan checklist.
 *
 * Dipisah dari `KycPanel.tsx` karena berkas ini murni tampilan berkas: ia tidak
 * tahu apa pun soal status KYC, keputusan, atau server. Pemanggilnya cukup
 * menyerahkan daftar bukti (label + URL bertanda tangan + dimensi dari server).
 *
 * Aturan yang dipegang di sini:
 * - Bukti adalah INTI pekerjaan petugas, jadi bingkai foto diberi ruang besar
 *   dengan rasio asli berkas (dimensi dari metadata server), bukan thumbnail.
 * - Setiap bingkai punya tiga keadaan yang jujur: memuat (rangka seukuran
 *   berkasnya), siap, atau gagal dengan tombol "Coba lagi". Tidak ada pemintal
 *   tanpa batas: berkas yang tidak selesai dimuat dalam 10 detik dinyatakan
 *   gagal, bukan diputar selamanya.
 * - Semua berkas tetap memakai tanda air `LapisanTandaAir`, termasuk di
 *   penampil ber-zoom: salinan layar apa pun membawa jejak verifikasi.
 */

/** Satu berkas bukti yang siap ditampilkan. */
export type BuktiTampil = {
  /** Kunci stabil (slot berkas): `ktp`, `selfie`, atau `bukti`. */
  id: string;
  label: string;
  /** URL bertanda tangan berumur pendek, atau `null` bila belum diunggah. */
  url: string | null;
  /** Lebar asli berkas menurut metadata server, bila ada. */
  lebar: number | null;
  /** Tinggi asli berkas menurut metadata server, bila ada. */
  tinggi: number | null;
};

/** Batas tunggu satu berkas sebelum dinyatakan gagal (ms). */
export const BATAS_MUAT_BUKTI_MS = 10_000;

/** Keadaan satu bingkai bukti. */
type KeadaanBukti = "kosong" | "memuat" | "siap" | "gagal" | "lewatBatas";

/** Rasio tampilan berkas: rasio aslinya bila diketahui, atau 3:2 sebagai wadah. */
export function rasioBukti(bukti: BuktiTampil): number {
  if (bukti.lebar === null || bukti.tinggi === null || bukti.tinggi <= 0) return 3 / 2;
  return bukti.lebar / bukti.tinggi;
}


/**
 * Satu bingkai bukti: rangka seukuran berkasnya, foto ber-tanda-air, dan
 * keadaan gagal yang bisa dicoba ulang.
 */
export function BingkaiBukti({
  bukti,
  keterangan,
  ukuran = "sedang",
  onBuka,
  kelas,
}: {
  bukti: BuktiTampil;
  /** Baris kecil di bawah foto: status dokumen menurut server. */
  keterangan?: React.ReactNode;
  /** `besar` dipakai mode bandingkan (foto berpasangan). */
  ukuran?: "sedang" | "besar";
  /** Membuka penampil ber-zoom. Tanpa ini, foto tidak bisa diklik. */
  onBuka?: () => void;
  kelas?: string;
}) {
  const [keadaan, setKeadaan] = useState<KeadaanBukti>(bukti.url === null ? "kosong" : "memuat");
  const [ulangan, setUlangan] = useState(0);
  const rasio = rasioBukti(bukti);

  // Berkas baru selalu mulai dari keadaan memuat — dan itu terjadi dengan
  // sendirinya karena pemanggil memberi `key` yang memuat URL-nya, sehingga
  // bingkai ini dipasang ulang saat URL berganti. Tidak perlu efek penyetel
  // keadaan yang hanya menambah render bergantian.

  // Tanpa batas waktu, berkas yang tidak pernah selesai akan berputar selamanya.
  useEffect(() => {
    if (keadaan !== "memuat") return;
    const jeda = window.setTimeout(() => setKeadaan("lewatBatas"), BATAS_MUAT_BUKTI_MS);
    return () => window.clearTimeout(jeda);
  }, [keadaan, ulangan]);

  const cobaLagi = () => {
    setKeadaan("memuat");
    setUlangan((n) => n + 1);
  };

  // URL TIDAK diubah saat "Coba lagi": URL-nya bertanda tangan, dan menambah
  // parameter bisa membuat tanda tangannya tidak lagi cocok. Yang diganti hanya
  // `key` elemen gambarnya, sehingga peramban memuat berkasnya sekali lagi.
  const gagal = keadaan === "gagal" || keadaan === "lewatBatas";
  // Tombol perbesar sudah tersedia sejak rangka pemuatan: fotonya boleh dibuka
  // sebelum selesai dimuat, dan tombol yang baru muncul setelah unduhan selesai
  // membuat petugas mengira berkasnya terkunci.
  const bisaDibuka = onBuka !== undefined && !gagal && keadaan !== "kosong";

  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border border-sky-100 bg-white p-1.5",
        kelas,
      )}
    >
      <div
        className={cn(
          "relative min-h-0 w-full flex-1 overflow-hidden rounded-lg bg-slate-100",
          ukuran === "besar" && "max-h-[72dvh]",
        )}
        // Rasio asli berkas (dari metadata server) menentukan tinggi wadahnya,
        // jadi rangka pemuatan pun sudah berbentuk seperti fotonya nanti. Kalau
        // bingkainya dipaksa lebih besar oleh tata letak, foto tetap utuh
        // (`object-contain`), bukan dipotong.
        style={{ aspectRatio: `${rasio}` }}
      >
        {keadaan === "memuat" && (
          <div className="absolute inset-0 animate-pulse bg-slate-200" aria-hidden />
        )}

        {bukti.url !== null && (
          <img
            key={ulangan}
            src={bukti.url}
            alt={bukti.label}
            loading={ukuran === "besar" ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            onLoad={() => setKeadaan("siap")}
            onError={() => setKeadaan("gagal")}
            className={cn(
              "h-full w-full object-contain transition-opacity",
              keadaan === "siap" ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {keadaan === "siap" && <LapisanTandaAir label={bukti.label} />}

        {keadaan === "siap" && bisaDibuka && (
          <button
            type="button"
            onClick={onBuka}
            aria-label={`Buka ${bukti.label} di penampil ber-zoom`}
            className="absolute inset-0 cursor-zoom-in rounded-lg focus-visible:ring-[3px] focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:outline-none"
          />
        )}

        {keadaan === "kosong" && (
          <div className="absolute inset-0 grid place-items-center px-3 text-center text-[11px] leading-4 text-slate-600">
            {bukti.label}: belum diunggah
          </div>
        )}

        {gagal && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50/95 px-3 text-center"
          >
            <AlertTriangle className="size-4 shrink-0 text-red-700" aria-hidden />
            <p className="text-[11px] leading-4 text-red-900">
              {keadaan === "lewatBatas"
                ? `Berkas tidak selesai dimuat dalam ${BATAS_MUAT_BUKTI_MS / 1000} detik.`
                : "Berkas gagal dimuat."}{" "}
              Periksa koneksi lalu coba lagi.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={cobaLagi}>
              <RefreshCw className="size-3.5" aria-hidden />
              Coba lagi
            </Button>
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 pb-0.5">
        <span className="text-[11px] font-semibold text-slate-800">{bukti.label}</span>
        {keterangan !== undefined && (
          <span className="min-w-0 flex-1 text-[10px] leading-4 text-slate-600">{keterangan}</span>
        )}
        {bisaDibuka && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-7 px-2 text-[11px]"
            onClick={onBuka}
            aria-label={`Perbesar ${bukti.label}`}
          >
            <Maximize2 className="size-3.5" aria-hidden />
            Perbesar
          </Button>
        )}
      </figcaption>
    </figure>
  );
}

/** Titik penunjuk aktif di penampil (untuk geser & cubit). */
type Penunjuk = { x: number; y: number };

/**
 * Isi penampil bukti: zoom (gulir/cubit/tombol), putar 90°, geser, dan
 * perpindahan berkas dengan tombol panah maupun tombol di bilah atas.
 *
 * Dipisah dari pembungkus dialognya supaya bisa dirender langsung oleh uji
 * (Radix tidak memasang portal pada render statis).
 */
export function IsiPenampilBukti({
  daftar,
  indeks,
  onPindah,
  onTutup,
}: {
  daftar: readonly BuktiTampil[];
  indeks: number;
  onPindah: (indeks: number) => void;
  onTutup: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotasi, setRotasi] = useState(0);
  const [geser, setGeser] = useState<Penunjuk>({ x: 0, y: 0 });
  const [siap, setSiap] = useState(false);
  // Penampil mengikuti batas waktu yang sama dengan bingkai: berkas yang tidak
  // selesai dimuat dalam 10 detik dinyatakan gagal, bukan diputar selamanya.
  const [gagal, setGagal] = useState(false);
  const [ulangan, setUlangan] = useState(0);
  const penunjuk = useRef(new Map<number, Penunjuk>());
  const jarakAwal = useRef<{ jarak: number; zoom: number } | null>(null);
  const wadah = useRef<HTMLDivElement | null>(null);
  const bukti = daftar[indeks];
  const adaBanyak = daftar.length > 1;

  const aturUlang = useCallback(() => {
    setZoom(1);
    setRotasi(0);
    setGeser({ x: 0, y: 0 });
  }, []);

  const ke = useCallback(
    (selisih: number) => {
      if (daftar.length === 0) return;
      onPindah((indeks + selisih + daftar.length) % daftar.length);
      aturUlang();
      setSiap(false);
      setGagal(false);
      setUlangan((n) => n + 1);
    },
    [daftar.length, indeks, onPindah, aturUlang],
  );

  // Berkas yang ditampilkan berganti (atau dicoba ulang) selalu mulai dari
  // keadaan memuat; perpindahan berkas menaikkan `ulangan`, dan `key` pada
  // elemen gambar memaksa peramban memuatnya sekali lagi.
  useEffect(() => {
    if (siap || gagal) return;
    const jeda = window.setTimeout(() => setGagal(true), BATAS_MUAT_BUKTI_MS);
    return () => window.clearTimeout(jeda);
  }, [siap, gagal, ulangan]);

  // Roda tetikus dipasang NON-pasif: menggulir di dalam penampil tidak boleh
  // ikut menggulir halaman di belakangnya.
  useEffect(() => {
    const el = wadah.current;
    if (el === null) return;
    const tangani = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.5, z - e.deltaY * 0.002)));
    };
    el.addEventListener("wheel", tangani, { passive: false });
    return () => el.removeEventListener("wheel", tangani);
  }, []);

  // Pintasan papan tombol: panah kiri/kanan pindah berkas, +/- zoom, R putar, 0 reset.
  useEffect(() => {
    const tangani = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        ke(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        ke(-1);
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => Math.min(4, z + 0.25));
      } else if (e.key === "-") {
        setZoom((z) => Math.max(0.5, z - 0.25));
      } else if (e.key.toLowerCase() === "r") {
        setRotasi((r) => (r + 90) % 360);
      } else if (e.key === "0") {
        aturUlang();
      }
    };
    document.addEventListener("keydown", tangani);
    return () => document.removeEventListener("keydown", tangani);
  }, [ke, aturUlang]);

  const mulaiSeret = (e: React.PointerEvent<HTMLDivElement>) => {
    penunjuk.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (penunjuk.current.size === 2) {
      const [a, b] = [...penunjuk.current.values()];
      jarakAwal.current = { jarak: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const geserSeret = (e: React.PointerEvent<HTMLDivElement>) => {
    const sebelumnya = penunjuk.current.get(e.pointerId);
    if (sebelumnya === undefined) return;
    penunjuk.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (penunjuk.current.size >= 2) {
      const [a, b] = [...penunjuk.current.values()];
      const jarak = Math.hypot(a.x - b.x, a.y - b.y);
      const awal = jarakAwal.current;
      if (awal !== null && awal.jarak > 0) {
        setZoom(Math.min(4, Math.max(0.5, (awal.zoom * jarak) / awal.jarak)));
      }
      return;
    }

    setGeser((g) => ({ x: g.x + (e.clientX - sebelumnya.x), y: g.y + (e.clientY - sebelumnya.y) }));
  };

  const lepasSeret = (e: React.PointerEvent<HTMLDivElement>) => {
    penunjuk.current.delete(e.pointerId);
    if (penunjuk.current.size < 2) jarakAwal.current = null;
  };

  if (bukti === undefined) return null;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-900">{bukti.label}</p>
          <p className="text-[11px] tabular-nums text-slate-600">
            Berkas {indeks + 1} dari {daftar.length} · zoom {Math.round(zoom * 100)}% · putar{" "}
            {rotasi}°
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!adaBanyak}
            onClick={() => ke(-1)}
            aria-label="Berkas sebelumnya"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Sebelumnya
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!adaBanyak}
            onClick={() => ke(1)}
            aria-label="Berkas berikutnya"
          >
            Berikutnya
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            aria-label="Perkecil foto"
          >
            <ZoomOut className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            aria-label="Perbesar foto"
          >
            <ZoomIn className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRotasi((r) => (r + 90) % 360)}
            aria-label="Putar foto 90 derajat"
          >
            <RotateCw className="size-4" aria-hidden />
            Putar 90°
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={aturUlang}>
            Reset
          </Button>
        </div>
      </div>

      <div
        ref={wadah}
        onPointerDown={mulaiSeret}
        onPointerMove={geserSeret}
        onPointerUp={lepasSeret}
        onPointerCancel={lepasSeret}
        className="relative flex min-h-[55dvh] flex-1 touch-none items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
      >
        {!siap && !gagal && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] text-white">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Memuat berkas…
          </span>
        )}
        {gagal && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <AlertTriangle className="size-4 shrink-0 text-amber-300" aria-hidden />
            <p className="text-[11px] leading-4 text-white">
              Berkas tidak selesai dimuat dalam {BATAS_MUAT_BUKTI_MS / 1000} detik. Periksa koneksi
              lalu coba lagi.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
              onClick={() => {
                setSiap(false);
                setGagal(false);
                setUlangan((n) => n + 1);
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Coba lagi
            </Button>
          </div>
        )}
        <img
          key={ulangan}
          src={bukti.url ?? ""}
          alt={bukti.label}
          draggable={false}
          onLoad={() => setSiap(true)}
          onError={() => setGagal(true)}
          style={{
            transform: `translate(${geser.x}px, ${geser.y}px) scale(${zoom}) rotate(${rotasi}deg)`,
          }}
          className={cn(
            "max-h-[68dvh] max-w-full select-none object-contain",
            siap ? "opacity-100" : "opacity-0",
          )}
        />
        {siap && (
          <div className="pointer-events-none absolute inset-0">
            <LapisanTandaAir label={bukti.label} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-4 text-slate-600">
          Gulir untuk zoom, seret untuk menggeser, panah kiri/kanan untuk pindah berkas.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onTutup}>
          Tutup penampil
        </Button>
      </div>
    </div>
  );
}

/** Penampil bukti dalam dialog layar penuh. */
export function PenampilBukti({
  daftar,
  indeks,
  onPindah,
  onTutup,
}: {
  daftar: readonly BuktiTampil[];
  /** `null` = tertutup. */
  indeks: number | null;
  onPindah: (indeks: number) => void;
  onTutup: () => void;
}) {
  return (
    <Dialog
      open={indeks !== null}
      onOpenChange={(terbuka) => {
        if (!terbuka) onTutup();
      }}
    >
      <DialogContent className="max-h-[95dvh] w-[min(96vw,72rem)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm text-slate-900">Penampil berkas bukti</DialogTitle>
          <DialogDescription className="text-[11px] leading-4">
            Foto ditampilkan ber-tanda-air. URL-nya bertanda tangan dan berumur pendek, hanya untuk
            admin ber-TOTP.
          </DialogDescription>
        </DialogHeader>
        {indeks !== null && (
          <IsiPenampilBukti
            daftar={daftar}
            indeks={indeks}
            onPindah={onPindah}
            onTutup={onTutup}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mode bandingkan: KTP dan selfie berdampingan pada ukuran penuh, supaya
 * kecocokan wajah dan ejaan nama bisa dinilai tanpa membuka dua penampil.
 */
export function BandingkanBukti({
  kiri,
  kanan,
  keteranganKiri,
  keteranganKanan,
}: {
  kiri: BuktiTampil;
  kanan: BuktiTampil;
  keteranganKiri?: React.ReactNode;
  keteranganKanan?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <BingkaiBukti bukti={kiri} keterangan={keteranganKiri} ukuran="besar" />
        <BingkaiBukti bukti={kanan} keterangan={keteranganKanan} ukuran="besar" />
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-600">
        <Columns2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Berdampingan untuk membandingkan wajah pada selfie dengan foto dan ejaan nama di KTP.
        Perbandingan ini alat bantu visual petugas, bukan hasil pencocokan mesin.
      </p>
    </div>
  );
}

/* ==========================================================================
 * Checklist verifikasi petugas
 * ========================================================================== */

/**
 * Empat pemeriksaan yang dilakukan petugas sebelum menyetujui. Semuanya WAJIB:
 * tombol "Setujui Verifikasi KYC" hanya aktif setelah keempatnya dicentang.
 */
export const CHECKLIST_KYC = [
  { id: "nama", label: "Nama sesuai KTP", wajib: true },
  { id: "nik", label: "NIK terbaca jelas", wajib: true },
  { id: "wajah", label: "Wajah selfie cocok dengan KTP", wajib: true },
  { id: "dokumen", label: "Dokumen tidak buram/terpotong", wajib: true },
] as const;

export type IdChecklistKyc = (typeof CHECKLIST_KYC)[number]["id"];

/** Checklist kosong: belum ada satu pun yang dicentang. */
export const CHECKLIST_KYC_KOSONG: Record<IdChecklistKyc, boolean> = {
  nama: false,
  nik: false,
  wajah: false,
  dokumen: false,
};

/** Apakah semua item WAJIB sudah dicentang. */
export function checklistLengkap(nilai: Readonly<Record<IdChecklistKyc, boolean>>): boolean {
  return CHECKLIST_KYC.every((item) => !item.wajib || nilai[item.id]);
}

/** Item wajib yang belum dicentang (dipakai menjelaskan kenapa Setujui terkunci). */
export function checklistKurang(
  nilai: Readonly<Record<IdChecklistKyc, boolean>>,
): readonly string[] {
  return CHECKLIST_KYC.filter((item) => item.wajib && !nilai[item.id]).map((item) => item.label);
}

/** Checklist kecil di dekat bar aksi keputusan. */
export function ChecklistVerifikasi({
  nilai,
  onUbah,
  nonaktif = false,
}: {
  nilai: Readonly<Record<IdChecklistKyc, boolean>>;
  onUbah: (id: IdChecklistKyc, tercentang: boolean) => void;
  nonaktif?: boolean;
}) {
  const kurang = checklistKurang(nilai);
  return (
    <fieldset className="min-w-0" disabled={nonaktif}>
      <legend className="text-[11px] font-semibold text-slate-800">
        Checklist pemeriksaan berkas ({CHECKLIST_KYC.length - kurang.length}/
        {CHECKLIST_KYC.length} tercentang)
      </legend>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {CHECKLIST_KYC.map((item) => (
          <label
            key={item.id}
            className="flex min-h-8 items-center gap-2 text-[11px] leading-4 text-slate-700"
          >
            <Checkbox
              checked={nilai[item.id]}
              disabled={nonaktif}
              onCheckedChange={(v) => onUbah(item.id, v === true)}
            />
            {item.label}
            {item.wajib ? <span className="text-slate-500">(wajib)</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
