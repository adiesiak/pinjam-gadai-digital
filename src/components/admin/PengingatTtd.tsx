import { MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  pesanPengingatTtd,
} from "@/lib/kontrakStatus";
import { urlWhatsapp } from "@/lib/pengingatWhatsapp";

export type BarisPengingatTtd = {
  id: string;
  nama: string;
  nomorReferensi: string;
  nomorWhatsApp: string | null;
};

/**
 * Daftar perjanjian yang sudah disetujui tetapi belum ditandatangani.
 *
 * Tombolnya membuka WhatsApp dengan pesan yang sudah diisi — bukan mengirim
 * otomatis. Aplikasi tidak berpura-pura punya gateway yang tidak dikonfigurasi,
 * dan admin tetap melihat nomor serta isi pesan sebelum menekan kirim.
 */
export function PengingatTtd({
  jenis,
  baris,
}: {
  jenis: "pinjaman" | "gadai";
  baris: readonly BarisPengingatTtd[];
}) {
  if (baris.length === 0) {
    return (
      <div className="rounded-2xl border border-success-border bg-success-soft px-4 py-3 text-sm text-success-foreground">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Tidak ada {jenis === "pinjaman" ? "perjanjian" : "akad"} yang menunggu tanda tangan.
        </p>
        <p className="mt-1 text-xs leading-5">
          Semua perjanjian pada saringan ini sudah punya tanda tangan elektronik atau bukti
          TTD manual.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`pengingat-ttd-${jenis}`}
      className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id={`pengingat-ttd-${jenis}`}
            className="flex items-center gap-2 text-sm font-semibold text-amber-950"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {baris.length} {jenis === "pinjaman" ? "perjanjian" : "akad"} menunggu tanda tangan
          </h2>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            Persetujuan sudah tercatat, tetapi belum ada tanda tangan elektronik atau bukti
            TTD manual. Buka WhatsApp untuk mengingatkan peminjam; pesan tidak dikirim
            otomatis.
          </p>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-amber-200/70 overflow-hidden rounded-xl border border-amber-200 bg-white">
        {baris.map((row) => {
          const wa =
            row.nomorWhatsApp === null
              ? null
              : urlWhatsapp(
                  row.nomorWhatsApp,
                  pesanPengingatTtd({
                    nama: row.nama,
                    nomorReferensi: row.nomorReferensi,
                    jenis,
                  }),
                );
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900">{row.nama}</p>
                <p className="mt-0.5 break-words font-mono text-[11px] text-slate-500">
                  {row.nomorReferensi}
                </p>
              </div>
              {wa === null ? (
                <span className="text-[11px] text-amber-800">Nomor WhatsApp belum ada</span>
              ) : (
                <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full">
                  <a href={wa} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1.5 size-4" aria-hidden="true" />
                    Buka WhatsApp
                  </a>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
