import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  LABEL_PERLU_SETUJU,
  LABEL_SUDAH_SETUJU,
  labelPeranPersetujuan,
  type StatusPersetujuan,
} from "@/lib/persetujuanRisiko";
import {
  ANCHOR_RISIKO_PENDANAAN,
  PERNYATAAN_PERSETUJUAN,
} from "@/lib/teksRisikoPendanaan";

/** Id kotak centang — dipakai `Label htmlFor` dan uji markup. */
const ID_CENTANG = "centang-persetujuan-risiko";

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function jam(ms: number): string {
  return new Date(ms).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Kartu persetujuan risiko pendana di ruang pendana.
 *
 * Kenapa ada: pendana harus menyatakan bahwa ia sudah membaca risikonya, dan
 * pernyataan itu perlu JEJAK. Persetujuannya disimpan di server atas nama akun
 * (lihat `convex/persetujuanRisiko.ts`), bukan di `localStorage` — supaya tidak
 * hilang saat peramban dibersihkan dan tetap terbaca dari perangkat lain. Karena
 * itu kartu ini menyebut sendiri di mana catatannya disimpan; tanpa keterangan
 * itu, tombol setuju terasa seperti formalitas kosong.
 *
 * Kenapa dua wajah: sebelum disetujui, kartunya hangat (krem) dan memuat kalimat
 * pernyataan lengkap yang harus dibaca — bukan ringkasan, sebab yang disetujui
 * adalah bunyi kalimatnya. Sesudah disetujui, kartunya tenang (hijau) dan hanya
 * menyebut versi, waktu, dan peran; versi lama tetap terbaca di riwayat bila
 * teksnya pernah berubah.
 *
 * Murni presentasional: seluruh keadaan datang dari props, dan yang dikirim balik
 * hanya niat menyetujui. Admin tidak mencatat persetujuan — ia bukan pihak yang
 * mendanai — jadi kartunya tidak tampil untuk admin.
 */
export function PersetujuanRisikoPendana({
  status,
  peran,
  bolehSetuju,
  menyimpan,
  galat,
  onSetuju,
}: {
  status: StatusPersetujuan;
  /** Peran akun pembaca: "dana" atau "pengamat". */
  peran: string;
  /** Hanya akun pendana yang mencatat persetujuan; admin hanya meninjau. */
  bolehSetuju: boolean;
  /** Permintaan pencatatan sedang berjalan. */
  menyimpan: boolean;
  /** Pesan kegagalan dari server, siap tampil. */
  galat: string | null;
  onSetuju: (versiTeks: number) => void;
}): ReactNode {
  const [centang, setCentang] = useState(false);

  if (!bolehSetuju) return null;

  const pesanGalat =
    galat !== null && galat !== "" ? (
      <p role="alert" className="mt-2 text-xs font-medium text-destructive">
        {galat}
      </p>
    ) : null;

  if (status.perluSetuju) {
    return (
      <section
        aria-label="Persetujuan risiko pendanaan"
        className="animate-masuk mt-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-4 sm:px-5"
      >
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-amber-950">
              Persetujuan risiko pendanaan (versi {status.versiBerlaku})
            </h2>
            <p className="mt-1 text-xs leading-6 text-amber-950">{LABEL_PERLU_SETUJU}</p>

            {/* Kalimat pernyataan ditampilkan UTUH: yang disetujui adalah bunyinya,
                jadi tidak boleh diringkas di sini. */}
            <p className="mt-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs leading-6 text-amber-950">
              {PERNYATAAN_PERSETUJUAN}
            </p>

            <div className="mt-3 flex items-start gap-2.5">
              <Checkbox
                id={ID_CENTANG}
                checked={centang}
                onCheckedChange={(nilai) => setCentang(nilai === true)}
                disabled={menyimpan}
                className="mt-0.5"
              />
              <Label
                htmlFor={ID_CENTANG}
                className="text-xs font-normal leading-6 text-amber-950"
              >
                Saya sudah membaca dan menyetujui pernyataan risiko di atas.
              </Label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                type="button"
                size="sm"
                loading={menyimpan}
                disabled={!centang || menyimpan}
                onClick={() => onSetuju(status.versiBerlaku)}
              >
                Saya menyetujui
              </Button>
              <a
                href={`#${ANCHOR_RISIKO_PENDANAAN}`}
                className="text-xs font-medium text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/60 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
              >
                Baca ulang poin risikonya
              </a>
            </div>

            <p className="mt-2 text-xs leading-6 text-amber-900">
              Persetujuan ini disimpan di server atas nama akun Anda, bukan di peramban ini, jadi
              tetap terbaca walau Anda berganti perangkat. Membaca halaman ini saja belum menjadi
              persetujuan.
            </p>
            {pesanGalat}
          </div>
        </div>
      </section>
    );
  }

  const waktu = status.disetujuiPada;
  return (
    <section
      aria-label="Persetujuan risiko pendanaan"
      className="animate-masuk mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 sm:px-5"
    >
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-emerald-950">
            Persetujuan risiko tercatat
          </h2>
          <p className="mt-1 text-xs leading-6 text-emerald-900">{LABEL_SUDAH_SETUJU}</p>
          {waktu !== null && (
            <p className="mt-1 text-xs leading-6 text-emerald-900">
              Versi {status.versiDisetujui} · tercatat {tanggal(waktu)} pukul {jam(waktu)} sebagai{" "}
              {labelPeranPersetujuan(peran)}.
            </p>
          )}
          <p className="mt-1 text-xs leading-5 text-emerald-900/80">
            Catatan ini bukan jaminan atas dana Anda dan bukan bukti transfer; risikonya tetap
            seperti yang diuraikan di panel risiko.
          </p>

          {/* Riwayat hanya muncul bila ada lebih dari satu baris: satu versi tidak
              perlu daftar, dan versi lama wajib tetap terbaca saat teks berubah. */}
          {status.riwayat.length > 1 && (
            <details className="mt-2 rounded-xl border border-emerald-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                Riwayat persetujuan ({status.riwayat.length})
              </summary>
              <ul className="mt-1.5 space-y-1">
                {status.riwayat.map((baris) => (
                  <li
                    key={`${baris.versiTeks}-${baris.disetujuiPada}`}
                    className="text-xs leading-6 tabular-nums text-slate-700"
                  >
                    Versi {baris.versiTeks} · {tanggal(baris.disetujuiPada)} pukul{" "}
                    {jam(baris.disetujuiPada)} · {labelPeranPersetujuan(baris.peran)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {pesanGalat}
        </div>
      </div>
    </section>
  );
}
