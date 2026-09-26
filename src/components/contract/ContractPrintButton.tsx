import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { wrapContractHtml } from "./contract-doc";

/** Tombol unduh dokumen kontrak via dialog cetak browser. */
export function ContractPrintButton({
  html,
  label = "Unduh Dokumen PDF",
}: {
  html: string;
  label?: string;
}) {
  const cetak = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup diblokir browser — izinkan popup untuk mengunduh PDF.");
      return;
    }
    w.document.write(wrapContractHtml(html));
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={cetak}>
      <FileDown className="mr-1.5 size-3.5" />
      {label}
    </Button>
  );
}
