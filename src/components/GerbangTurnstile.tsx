/**
 * Widget Cloudflare Turnstile untuk formulir pengajuan.
 *
 * Komponen ini hanya tampil bila `VITE_TURNSTILE_SITE_KEY` diisi saat build.
 * Token yang diterima widget langsung ditukar menjadi PAS di server
 * (`turnstile.verifikasiTurnstile`), dan pas itulah yang diperiksa gerbang
 * kirim. Menampilkan widget tanpa menukar tokennya tidak membuka apa pun.
 *
 * Satu komponen, satu pesan: keadaan "memeriksa" dan "gagal" dinyatakan apa
 * adanya, karena pengguna tidak bisa menyelesaikan pengajuan sebelum lolos.
 */
import { useAction } from "convex/react";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import { idPerangkatPpob } from "@/lib/ppob";
import { cn } from "@/lib/utils";

const KUNCI_SITUS = (
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? ""
).trim();

/** Apakah deployment ini memasang Turnstile di formulir. */
export const turnstileDipasang = KUNCI_SITUS !== "";

type ApiTurnstile = {
  render: (target: HTMLElement, opsi: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

let pemuatan: Promise<ApiTurnstile> | null = null;

/** Muat skrip Turnstile sekali per halaman; panggilan berikutnya memakai janji yang sama. */
function muatApi(): Promise<ApiTurnstile> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile hanya berjalan di peramban."));
  }
  if (window.turnstile !== undefined) return Promise.resolve(window.turnstile);
  if (pemuatan !== null) return pemuatan;

  pemuatan = new Promise<ApiTurnstile>((selesai, gagal) => {
    const skrip = document.createElement("script");
    skrip.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    skrip.async = true;
    skrip.defer = true;
    skrip.onload = () => {
      if (window.turnstile === undefined) {
        gagal(new Error("Widget Turnstile tidak tersedia setelah skrip dimuat."));
        return;
      }
      selesai(window.turnstile);
    };
    skrip.onerror = () => gagal(new Error("Skrip Turnstile gagal dimuat."));
    document.head.appendChild(skrip);
  }).catch((err: unknown) => {
    // Percobaan berikutnya boleh memuat ulang: kegagalan jaringan tidak boleh
    // mengunci formulir sampai halaman dimuat ulang.
    pemuatan = null;
    throw err;
  });

  return pemuatan;
}

type Status = "memuat" | "siap" | "memeriksa" | "lolos" | "gagal";

export function GerbangTurnstile({
  onSiap,
  onGalat,
  onToken,
  publik = false,
  className,
}: {
  /** Dipanggil setiap status kelolosan berubah; `true` = boleh mengirim. */
  onSiap: (siap: boolean) => void;
  /** Pesan kegagalan untuk ditampilkan formulir induk, bila ada. */
  onGalat?: (pesan: string | null) => void;
  /** Pas sekali pakai untuk formulir tanpa akun, mis. pesanan PPOB. */
  onToken?: (token: string | null) => void;
  /** `true` = pembeli tanpa akun; memakai endpoint verifikasi publik. */
  publik?: boolean;
  className?: string;
}) {
  const verifikasi = useAction(api.turnstile.verifikasiTurnstile);
  const verifikasiPublik = useAction(api.turnstile.verifikasiGerbangPpob);
  const wadah = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<ApiTurnstile | null>(null);
  const idWidget = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("memuat");
  const [pesan, setPesan] = useState<string | null>(null);

  // Callback terbaru disimpan di ref lewat efek, bukan saat render: efek
  // pemasangan widget tidak boleh dipasang ulang setiap render (widget
  // Turnstile tidak suka dipasang dua kali).
  const cbRef = useRef({ verifikasi, verifikasiPublik, onSiap, onGalat, onToken, publik });
  useEffect(() => {
    cbRef.current = { verifikasi, verifikasiPublik, onSiap, onGalat, onToken, publik };
  });

  useEffect(() => {
    if (!turnstileDipasang) return;
    let batal = false;
    onSiap(false);

    const periksaToken = async (token: string) => {
      if (batal) return;
      setStatus("memeriksa");
      setPesan(null);
      cbRef.current.onGalat?.(null);
      cbRef.current.onToken?.(null);
      try {
        if (cbRef.current.publik) {
          const hasil = await cbRef.current.verifikasiPublik({
            token,
            perangkatId: idPerangkatPpob(),
          });
          if (batal) return;
          if (hasil.aktif && hasil.gerbangToken !== null) {
            setStatus("lolos");
            cbRef.current.onSiap(true);
            cbRef.current.onToken?.(hasil.gerbangToken);
            return;
          }
          if (!hasil.aktif) {
            // Situs dikonfigurasi tetapi server belum punya rahasia: server juga
            // melewati gerbang, jadi formulir tidak boleh terkunci.
            setStatus("lolos");
            cbRef.current.onSiap(true);
            return;
          }
          setStatus("gagal");
          setPesan(hasil.alasan ?? "Verifikasi keamanan tidak lolos.");
          cbRef.current.onSiap(false);
          cbRef.current.onGalat?.(
            hasil.alasan ?? "Verifikasi keamanan tidak lolos.",
          );
          return;
        }

        const hasil = await cbRef.current.verifikasi({ token });
        if (batal) return;
        if (hasil.ok) {
          setStatus("lolos");
          cbRef.current.onSiap(true);
          return;
        }
        setStatus("gagal");
        setPesan(hasil.alasan ?? "Verifikasi keamanan tidak lolos.");
        cbRef.current.onSiap(false);
        cbRef.current.onGalat?.(hasil.alasan ?? "Verifikasi keamanan tidak lolos.");
      } catch (err) {
        if (batal) return;
        setStatus("gagal");
        setPesan(
          err instanceof Error ? err.message : "Verifikasi keamanan gagal diperiksa.",
        );
        cbRef.current.onSiap(false);
        cbRef.current.onGalat?.(
          err instanceof Error ? err.message : "Verifikasi keamanan gagal diperiksa.",
        );
      }
    };

    muatApi()
      .then((api) => {
        if (batal || wadah.current === null) return;
        apiRef.current = api;
        idWidget.current = api.render(wadah.current, {
          sitekey: KUNCI_SITUS,
          theme: "light",
          language: "id",
          callback: (token: string) => void periksaToken(token),
          "expired-callback": () => {
            setStatus("siap");
            cbRef.current.onSiap(false);
            cbRef.current.onToken?.(null);
          },
          "error-callback": () => {
            setStatus("gagal");
            setPesan("Verifikasi keamanan gagal dimuat. Muat ulang halaman.");
            cbRef.current.onSiap(false);
          },
        });
        setStatus("siap");
      })
      .catch((err: unknown) => {
        if (batal) return;
        setStatus("gagal");
        setPesan(
          err instanceof Error ? err.message : "Verifikasi keamanan gagal dimuat.",
        );
        cbRef.current.onSiap(false);
        cbRef.current.onGalat?.(
          err instanceof Error ? err.message : "Verifikasi keamanan gagal dimuat.",
        );
      });

    return () => {
      batal = true;
      if (apiRef.current !== null && idWidget.current !== null) {
        apiRef.current.remove(idWidget.current);
      }
      idWidget.current = null;
    };
  }, []);

  if (!turnstileDipasang) return null;

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-slate-50/70 p-3", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
        Verifikasi keamanan
      </p>
      <div ref={wadah} className="mt-2 min-h-[65px]" />
      <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-5 text-slate-600">
        {status === "memuat" && (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memuat verifikasi
          </>
        )}
        {status === "siap" && (
          <>
            <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden /> Centang kotak di
            atas sebelum mengirim
          </>
        )}
        {status === "memeriksa" && (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Memeriksa verifikasi
          </>
        )}
        {status === "lolos" && (
          <>
            <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden /> Verifikasi lolos
          </>
        )}
        {status === "gagal" && (
          <>
            <ShieldX className="size-3.5 text-red-700" aria-hidden />{" "}
            {pesan ?? "Verifikasi gagal"}
          </>
        )}
      </p>
    </div>
  );
}
