import { FileDown, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { cetakLewatAplikasi } from "@/lib/jembatanAndroid";
import { lengkapiQrCetak } from "@/lib/qrDokumen";
import { unduhKontrakPdf } from "@/lib/unduhKontrak";

import { wrapContractHtml } from "./contract-doc";

/**
 * Dua jalan keluar dokumen: unduh PDF langsung (utama) dan cetak (cadangan).
 *
 * Unduhan langsung memakai HTML cetak yang sama dengan dialog cetak, jadi
 * angkanya tidak pernah berbeda. Bila penangkapan dokumen gagal, tombol Cetak
 * tetap tersedia dan pesan galatnya menyebutkan jalan itu — bukan diam-diam
 * membuka dialog yang tidak diminta.
 */
export function ContractPrintButton({
  html,
  label = "Unduh PDF",
  fileName = "kontrak-pindai.pdf",
}: {
  html: string;
  label?: string;
  /** Nama berkas unduhan; sebaiknya memuat nomor referensi. */
  fileName?: string;
}) {
  const [busy, setBusy] = useState(false);

  const siapkanDokumen = async () =>
    wrapContractHtml(await lengkapiQrCetak(html));

  const cetak = async () => {
    const dokumen = await siapkanDokumen();
    // Di aplikasi Android, window.open diblokir; dialog cetak Android dipakai.
    if (cetakLewatAplikasi(dokumen)) return;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup diblokir browser. Izinkan popup untuk mencetak dokumen.");
      return;
    }
    w.document.write(dokumen);
    w.document.close();
    w.focus();
    w.print();
  };

  const unduh = async () => {
    setBusy(true);
    try {
      const dokumen = await siapkanDokumen();
      // Jembatan Android tidak punya unduhan blob; dialog cetaknya sudah
      // menyediakan "Simpan sebagai PDF".
      if (cetakLewatAplikasi(dokumen)) return;
      await unduhKontrakPdf(dokumen, fileName);
      toast.success("PDF dokumen diunduh.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `${err.message} Gunakan tombol Cetak sebagai cadangan.`
          : "PDF gagal dibuat. Gunakan tombol Cetak sebagai cadangan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 rounded-full"
        disabled={busy}
        onClick={() => void unduh()}
      >
        {busy ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <FileDown className="mr-1.5 size-4" />
        )}
        {busy ? "Menyiapkan…" : label}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-h-11 rounded-full px-2.5 text-xs text-muted-foreground"
        disabled={busy}
        onClick={() => void cetak()}
        aria-label="Cetak dokumen lewat dialog cetak"
      >
        <Printer className="mr-1.5 size-4" />
        Cetak
      </Button>
    </span>
  );
}
