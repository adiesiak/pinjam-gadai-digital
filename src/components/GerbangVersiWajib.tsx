/**
 * Layar wajib perbarui untuk APK yang sudah tidak didukung.
 *
 * Yang menentukan: satu pengumuman di panel admin yang ditandai **wajib
 * diperbarui**. Versi tertinggi yang bertanda itu menjadi batas bawah, dan
 * setiap APK dengan `versionCode` lebih kecil berhenti di layar ini.
 *
 * Kenapa lapisan web, bukan hanya shell APK: berkas web selalu versi terbaru
 * dari server, sedangkan shell APK tidak bisa mengubah dirinya sendiri. Dengan
 * memeriksa `versionCode` dari User-Agent, APK yang dibangun sejak penanda
 * `PINDAIApp/<kode>` ada bisa diblokir tanpa menunggu rilis baru.
 *
 * Batas yang disengaja:
 *  - Peramban biasa tidak pernah diblokir — halaman publik tetap bisa dibuka
 *    oleh orang yang justru sedang mencari berkas APK.
 *  - APK lama yang menulis `PINDAIApp/1.0` (tanpa kode) dianggap versi 0. Itu
 *    build sebelum penomoran ada; kalau admin menandai versi wajib, build itu
 *    memang harus diperbarui.
 *  - Pemeriksaan ini bukan kontrol keamanan: UA bisa dipalsukan. Ia mencegah
 *    pengguna sah memakai versi usang, bukan menahan penyerang.
 */
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { bukaLuarJendela } from "@/lib/jembatanAndroid";
import { versiAplikasiDariUA, wajibPerbarui } from "@/lib/pembaruanAplikasi";

/** Versi APK yang sedang dipakai, dibaca sekali dari User-Agent WebView. */
function versiTerpasang(): number | null {
  if (typeof navigator === "undefined") return null;
  return versiAplikasiDariUA(navigator.userAgent);
}

/**
 * Pasang layar wajib perbarui bila APK ini di bawah versi minimum.
 *
 * Null untuk peramban dan untuk aplikasi yang sudah memenuhi syarat — jadi
 * komponen ini tidak pernah menghalangi halaman publik di peramban.
 */
export function GerbangVersiWajib() {
  const terpasang = useMemo(() => versiTerpasang(), []);
  const syarat = useQuery(api.pembaruanAplikasi.wajib, {});

  if (terpasang === null || syarat === undefined) return null;
  if (!wajibPerbarui(terpasang, syarat.versiMinimum)) return null;

  return (
    <LayarWajibPerbarui
      terpasang={terpasang}
      versiNama={syarat.versiNama}
      tautan={syarat.tautan}
    />
  );
}

/** Props layar — dipisah agar bisa dirender di uji tanpa klien Convex. */
export type PropsLayarWajib = {
  /** `versionCode` APK yang sedang dipakai (0 = build tanpa penanda angka). */
  terpasang: number;
  /** Nama versi yang diwajibkan admin, bila ada. */
  versiNama: string | null;
  /** Alamat APK yang dikirim admin; null berarti panel belum punya tautannya. */
  tautan: string | null;
};

export function LayarWajibPerbarui({ terpasang, versiNama, tautan }: PropsLayarWajib) {
  const [menyalin, setMenyalin] = useState(false);

  // Selama layar ini tampil, halaman di belakangnya tidak boleh ikut bergulir.
  useEffect(() => {
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, []);

  const nama = versiNama ?? "terbaru";

  const bukaUnduhan = () => {
    if (tautan === null) return;
    if (bukaLuarJendela(tautan)) return;
    window.open(tautan, "_blank", "noopener,noreferrer");
  };

  const salinTautan = () => {
    if (tautan === null) return;
    void navigator.clipboard
      .writeText(tautan)
      .then(() => setMenyalin(true))
      .catch(() => setMenyalin(false));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gerbang-versi-judul"
      aria-describedby="gerbang-versi-alasan"
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#f6f2e8]"
    >
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-10">
        <div className="rounded-2xl border border-[#c9a86a]/55 bg-white p-6 shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)]">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f6efdd] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6e5523]">
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            Versi lama
          </span>

          <h1
            id="gerbang-versi-judul"
            className="mt-4 text-xl font-semibold tracking-tight text-slate-900"
          >
            PINDAI perlu diperbarui
          </h1>
          <p id="gerbang-versi-alasan" className="mt-2 text-sm leading-6 text-slate-600">
            Versi {nama} diwajibkan oleh PINDAI.
            {terpasang > 0
              ? ` Aplikasi yang terpasang masih kode ${terpasang}.`
              : " Aplikasi yang terpasang sudah tidak dikenali versinya."}{" "}
            Pasang versi terbaru untuk melanjutkan; data akun Anda tetap tersimpan di server.
          </p>

          <ol className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
            <li className="flex gap-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#efe6cf] text-[11px] font-semibold text-[#6e5523]">
                1
              </span>
              <span>Ketuk “Unduh pembaruan”. Berkas APK terbuka di peramban.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#efe6cf] text-[11px] font-semibold text-[#6e5523]">
                2
              </span>
              <span>Izinkan “instal dari sumber ini” saat Android memintanya.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#efe6cf] text-[11px] font-semibold text-[#6e5523]">
                3
              </span>
              <span>Buka PINDAI lagi setelah pemasangan selesai.</span>
            </li>
          </ol>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={bukaUnduhan}
              disabled={tautan === null}
              className="min-h-11 gap-2 rounded-full bg-[#065f46] px-5 text-white hover:bg-[#064e3b]"
            >
              <Download className="size-4" aria-hidden="true" />
              Unduh pembaruan
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
              className="min-h-11 gap-2 rounded-full"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Sudah dipasang, muat ulang
            </Button>
          </div>

          {tautan !== null && (
            <p className="mt-4 break-all text-[11px] leading-5 text-slate-500">
              Tombol tidak membuka peramban? Salin alamat ini:{" "}
              <span className="font-mono text-slate-600">{tautan}</span>{" "}
              <button
                type="button"
                onClick={salinTautan}
                className="font-semibold text-[#064e3b] underline underline-offset-4"
              >
                {menyalin ? "Tersalin" : "Salin"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
