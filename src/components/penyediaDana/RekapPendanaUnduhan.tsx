import { useAction, useQuery } from "convex/react";
import { FileDown, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { FOLIO } from "@/components/penyediaDana/folio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import { laporanRekapPendana, namaBerkasRekapPendana } from "@/lib/laporanPendana";
import { susunPdf } from "@/lib/pdfSederhana";
import { cn } from "@/lib/utils";

/**
 * Tombol rekap seluruh pendana, dipakai Super Admin di ruang penyedia dana.
 *
 * Dua tindakan untuk satu berkas yang sama: unduh ke perangkat, atau kirim ke
 * nomor WhatsApp yang ditulis admin. Nomornya sengaja tidak diambil dari akun
 * (berbeda dari laporan pendana): berkas ini milik admin, dan ia sering perlu
 * meneruskannya ke nomor kerja atau ke admin lain.
 *
 * Dipisah dari tabel di atasnya karena bentuknya lain: tabel dibaca di layar,
 * sedangkan bagian ini menghasilkan berkas yang dibaca di luar aplikasi.
 */
export function TombolRekapPendana({
  jumlahPendana,
  bolehUnduh,
  mengunduh,
  mengirim,
  galat,
  onUnduh,
  onKirim,
  className,
}: {
  /** Jumlah pendana pada rekap; 0 berarti tidak ada yang bisa dicetak. */
  jumlahPendana: number;
  /** Angka rekap sudah tersedia; tanpa itu PDF tidak bisa disusun. */
  bolehUnduh: boolean;
  mengunduh: boolean;
  mengirim: boolean;
  galat: string | null;
  onUnduh: () => void;
  onKirim: (nomor: string) => void;
  className?: string;
}) {
  const [isian, setIsian] = useState("");

  const adaPendana = jumlahPendana > 0;
  const bolehKirim = adaPendana && isian.trim() !== "" && !mengirim && !mengunduh;

  return (
    <section
      aria-label="Rekap seluruh pendana"
      className={cn("px-4 py-3 sm:px-5", FOLIO.kertas, className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className={FOLIO.label}>Berkas rekap</p>
          <p className="mt-1 text-sm font-semibold text-navy">
            Rekap pinjaman {jumlahPendana} pendana
          </p>
          <p className={cn("mt-1 max-w-xl", FOLIO.catatan)}>
            Satu PDF berisi total seluruh pendana dan rincian per pendana. Unduh ke perangkat,
            atau kirim ke WhatsApp nomor yang Anda tulis di bawah.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!adaPendana || !bolehUnduh || mengunduh || mengirim}
            onClick={onUnduh}
            className="min-h-11"
          >
            {mengunduh ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="mr-2 size-4" aria-hidden />
            )}
            {mengunduh ? "Menyiapkan PDF" : "Unduh PDF"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
        <div>
          <Label htmlFor="nomor-rekap-pendana" className="text-xs font-semibold text-navy">
            Nomor WhatsApp tujuan
          </Label>
          <Input
            id="nomor-rekap-pendana"
            value={isian}
            onChange={(e) => setIsian(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            className="mt-1.5 min-h-11 max-w-56"
          />
        </div>
        <Button
          type="button"
          disabled={!bolehKirim}
          onClick={() => onKirim(isian)}
          className="min-h-11 rounded-lg bg-[#064E3B] px-4 text-sm font-semibold text-white hover:bg-[#021E17]"
        >
          {mengirim ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="mr-2 size-4" aria-hidden />
          )}
          {mengirim ? "Mengirim rekap" : "Kirim rekap ke WhatsApp"}
        </Button>
      </div>

      <p className={cn("mt-1.5", FOLIO.catatan)}>
        {adaPendana
          ? "Isi nomor untuk mengaktifkan tombol WhatsApp. Tombol Unduh PDF tetap bisa dipakai tanpa nomor."
          : "Belum ada pendana pada rekap ini, jadi tidak ada berkas yang bisa dicetak."}
      </p>

      {galat !== null && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300/70 bg-red-50/60 px-3 py-2 text-xs leading-5 text-red-900"
        >
          {galat}
        </p>
      )}

      <p className={cn("mt-3 border-t border-slate-200 pt-2", FOLIO.catatan)}>
        Berkas memuat posisi keuangan seluruh pendana, jadi hanya Super Admin yang bisa
        menyusunnya. Nama peminjam tidak dicantumkan; rincian pinjaman per pendana ada di
        laporan masing-masing.
      </p>
    </section>
  );
}

/**
 * Versi yang membaca angka dan mengirim berkas sendiri.
 *
 * Angka unduhan dan angka kiriman dibaca dari query yang sama
 * (`dataRekapPendana`), dan PDF keduanya disusun dari fungsi yang sama
 * (`laporanRekapPendana`), sehingga salinan yang diunduh admin tidak mungkin
 * berbeda dari yang diterima WhatsApp.
 */
export function RekapPendanaUnduhan({ className }: { className?: string }) {
  const data = useQuery(api.laporanPendana.dataRekapPendana);
  const kirim = useAction(api.laporanPendana.kirimRekapPendana);
  const [mengunduh, setMengunduh] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function unduhPdf() {
    if (data === null || data === undefined) return;
    setMengunduh(true);
    setGalat(null);
    try {
      const byte = susunPdf(laporanRekapPendana(data));
      const blob = new Blob([new Uint8Array(byte)], { type: "application/pdf" });
      const nama = namaBerkasRekapPendana(data.dicetakPada);
      // Di aplikasi Android, unduhan blob: tidak ditangani WebView.
      if (await unduhLewatAplikasi(nama, "application/pdf", blob)) return;
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = nama;
      tautan.rel = "noopener";
      document.body.appendChild(tautan);
      tautan.click();
      tautan.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Rekap PDF gagal disiapkan. Coba lagi.");
    } finally {
      setMengunduh(false);
    }
  }

  async function kirimRekap(nomor: string) {
    setMengirim(true);
    setGalat(null);
    try {
      const hasil = await kirim({ nomor });
      toast.success(
        `Rekap ${hasil.jumlahPendana} pendana dikirim ke WhatsApp ${hasil.tujuan}.`,
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Rekap gagal dikirim. Coba lagi.");
    } finally {
      setMengirim(false);
    }
  }

  return (
    <TombolRekapPendana
      className={className}
      jumlahPendana={data?.total.jumlahPendana ?? 0}
      bolehUnduh={data !== undefined && data !== null}
      mengunduh={mengunduh}
      mengirim={mengirim}
      galat={galat}
      onUnduh={() => void unduhPdf()}
      onKirim={(nomor) => void kirimRekap(nomor)}
    />
  );
}
