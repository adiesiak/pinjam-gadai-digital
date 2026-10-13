import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { wrapContractHtml } from "./contract-doc";

/** Tombol cetak/cetak-ke-PDF catatan HTML via dialog browser. */
export function ContractPrintButton({
  html,
  label = "Cetak catatan / simpan PDF",
}: {
  html: string;
  label?: string;
}) {
  const cetak = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup diblokir browser. Izinkan popup untuk mencetak catatan.");
      return;
    }
    w.document.write(wrapContractHtml(html));
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={cetak}>
      <FileDown className="mr-1.5 size-4" />
      {label}
    </Button>
  );
}
