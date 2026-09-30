import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Setoran dinonaktifkan sampai ada izin dan jalur settlement yang diverifikasi. */
export function DepositForm() {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
      Setoran belum tersedia. Belum ada izin atau penyedia pembayaran yang dipilih; referensi manual dan persetujuan admin tidak membuktikan dana masuk.
    </section>
  );
}

/** Dialog kompatibilitas tanpa QR atau nomor rekening/VA contoh. */
export function DepositSimDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setoran belum tersedia</DialogTitle>
          <DialogDescription>
            Tidak ada QR, virtual account, atau instruksi pembayaran aktif. Jangan mengirim dana berdasarkan tampilan atau catatan aplikasi.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
