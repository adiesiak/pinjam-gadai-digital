import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { cetakLewatAplikasi } from "@/lib/jembatanAndroid";
import { lengkapiQrCetak } from "@/lib/qrDokumen";

import { wrapContractHtml } from "./contract-doc";

/** Tombol cetak/cetak-ke-PDF catatan HTML via dialog browser. */
export function ContractPrintButton({
  html,
  label = "Cetak catatan / simpan PDF",
}: {
  html: string;
  label?: string;
}) {
  const cetak = async () => {
    // QR bisa belum selesai dibuat saat tombol ditekan; isi dulu sebelum
    // dokumen ditulis ke jendela cetak agar PDF memuat QR verifikasi.
    const dokumen = wrapContractHtml(await lengkapiQrCetak(html));
    // Di aplikasi Android, window.open diblokir; dialog cetak Android dipakai.
    if (cetakLewatAplikasi(dokumen)) return;
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup diblokir browser. Izinkan popup untuk mencetak catatan.");
      return;
    }
    w.document.write(dokumen);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={() => void cetak()}>
      <FileDown className="mr-1.5 size-4" />
      {label}
    </Button>
  );
}
