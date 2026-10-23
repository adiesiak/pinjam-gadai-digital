import { FileDown, Loader2, Send } from "lucide-react";
import { useState } from "react";

import { FOLIO } from "@/components/penyediaDana/folio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Kartu pengaturan kontak laporan WhatsApp di ruang penyedia dana.
 *
 * Satu bagian, dua tindakan yang berurutan wajar: isi nomor, lalu minta
 * laporannya. Keduanya diletakkan bersama karena tombol kirim tidak ada artinya
 * sebelum nomornya ada, dan pemisahan ke dua bagian akan membuat pendana
 * mencari-cari tempat mengisi nomornya.
 *
 * Murni presentasional, tanpa Convex: halaman (`pages/PenyediaDana.tsx`) yang
 * memegang query dan aksi, sama seperti bagian persetujuan risiko. Pola ini juga
 * yang membuat kartu ini bisa dirender langsung oleh uji markup
 * (`KontakLaporanWhatsapp.render.test.tsx`).
 */
export function KontakLaporanWhatsapp({
  /** Nomor tersimpan pada akun (`null` = belum pernah diisi). */
  nomor,
  menyimpan,
  mengirim,
  mengunduh,
  bolehUnduh,
  galat,
  onSimpan,
  onKirim,
  onUnduh,
  className,
}: {
  nomor: string | null;
  menyimpan: boolean;
  mengirim: boolean;
  mengunduh: boolean;
  /** Angka laporan sudah tersedia; tanpa itu PDF tidak bisa disusun. */
  bolehUnduh: boolean;
  galat: string | null;
  onSimpan: (nomor: string) => void;
  onKirim: () => void;
  onUnduh: () => void;
  className?: string;
}) {
  const [isian, setIsian] = useState("");

  const adaNomor = nomor !== null && nomor !== "";
  const bolehSimpan = isian.trim() !== "" && !menyimpan;
  const bolehKirim = adaNomor && !mengirim && !menyimpan;

  return (
    <section
      aria-label="Laporan pendanaan"
      className={cn("animate-masuk px-4 py-3 sm:px-5", FOLIO.kertas, className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2">
        <h2 className={FOLIO.judul}>Laporan pendanaan</h2>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          Salinan angka di halaman ini dalam satu berkas PDF. Unduh langsung, atau minta
          dikirim ke WhatsApp Anda.
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="nomor-laporan" className="text-xs font-semibold text-navy">
            Nomor WhatsApp untuk laporan
          </Label>
          <div className="mt-1.5 flex flex-wrap items-start gap-2">
            <Input
              id="nomor-laporan"
              value={isian}
              onChange={(e) => setIsian(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0812 3456 7890"
              className="min-h-11 max-w-56"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!bolehSimpan}
              onClick={() => onSimpan(isian)}
              className="min-h-11"
            >
              {menyimpan ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              {menyimpan ? "Menyimpan" : "Simpan nomor"}
            </Button>
          </div>
          <p className={cn("mt-1.5 text-xs leading-5", FOLIO.catatan)}>
            {adaNomor ? (
              <>
                Tersimpan di akun Anda:{" "}
                <span className={cn("font-medium text-navy", FOLIO.angka)}>{nomor}</span>. Laporan
                hanya dikirim ke nomor ini, dan hanya saat Anda memintanya. Nomor ini juga bisa
                dipakai untuk masuk lewat OTP WhatsApp.
              </>
            ) : (
              <>
                Belum ada nomor tersimpan, jadi tidak ada laporan yang dikirim ke mana pun. Isi
                nomor untuk mengaktifkan tombol kirim dan pintu masuk OTP WhatsApp.
              </>
            )}
          </p>
        </div>

        <div className="sm:border-l sm:border-slate-200 sm:pl-3">
          <p className="text-xs font-semibold text-navy">Laporan kinerja pendanaan</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!bolehUnduh || mengunduh || mengirim}
              onClick={onUnduh}
              className="min-h-11 rounded-lg px-4 text-sm font-semibold"
            >
              {mengunduh ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="mr-2 size-4" aria-hidden />
              )}
              {mengunduh ? "Menyiapkan PDF" : "Unduh PDF"}
            </Button>
            <Button
              type="button"
              disabled={!bolehKirim}
              onClick={onKirim}
              className="min-h-11 rounded-lg bg-[#064E3B] px-4 text-sm font-semibold text-white hover:bg-[#021E17]"
            >
              {mengirim ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-2 size-4" aria-hidden />
              )}
              {mengirim ? "Mengirim laporan" : "Kirim laporan ke WhatsApp"}
            </Button>
          </div>
          <p className={cn("mt-1.5 text-xs leading-5", FOLIO.catatan)}>
            {adaNomor
              ? "Berisi seluruh pinjaman atas nama Anda: dana tersalurkan, keuntungan yang sudah dibukukan, dan perkiraan dari pinjaman berjalan. Unduh PDF tidak memerlukan nomor."
              : "Isi nomor lebih dulu untuk mengaktifkan tombol WhatsApp. Tombol Unduh PDF tetap bisa dipakai tanpa nomor."}
          </p>
        </div>
      </div>

      {galat !== null && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300/70 bg-red-50/60 px-3 py-2 text-xs leading-5 text-red-900"
        >
          {galat}
        </p>
      )}

      <p className={cn("mt-3 border-t border-slate-200 pt-2", FOLIO.catatan)}>
        Laporan berisi angka pendanaan Anda. Unduhan PDF disimpan di perangkat ini. Kiriman
        WhatsApp memakai gateway yang diatur admin, dan salinannya berada di riwayat percakapan
        WhatsApp Anda, di luar aplikasi ini.
      </p>
    </section>
  );
}
