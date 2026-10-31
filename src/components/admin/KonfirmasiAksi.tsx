import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Satu bentuk konfirmasi untuk seluruh aksi admin yang menghapus, mencabut,
 * atau mengembalikan data ke bawaan.
 *
 * Dialog ini tidak menutup dirinya sendiri. Pemanggil menutup setelah mutation
 * berhasil, sehingga pesan galat tetap terlihat di samping aksi yang gagal dan
 * tombol tidak pernah tampak selesai sebelum server menjawab.
 */
export function KonfirmasiAksi({
  open,
  onOpenChange,
  judul,
  deskripsi,
  labelKonfirmasi,
  busy = false,
  onConfirm,
  alasan,
  onAlasanChange,
  labelAlasan = "Alasan",
  placeholderAlasan,
  alasanMin = 3,
}: {
  open: boolean;
  onOpenChange: (terbuka: boolean) => void;
  judul: string;
  deskripsi: ReactNode;
  labelKonfirmasi: string;
  busy?: boolean;
  onConfirm: () => void;
  /** Bila diisi, dialog menampilkan kolom alasan yang wajib diisi. */
  alasan?: string;
  onAlasanChange?: (nilai: string) => void;
  labelAlasan?: string;
  placeholderAlasan?: string;
  alasanMin?: number;
}) {
  const alasanCukup =
    onAlasanChange === undefined || (alasan ?? "").trim().length >= alasanMin;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{judul}</AlertDialogTitle>
          <AlertDialogDescription>{deskripsi}</AlertDialogDescription>
        </AlertDialogHeader>

        {onAlasanChange !== undefined && (
          <div className="space-y-1.5">
            <Label htmlFor="alasan-konfirmasi-admin">{labelAlasan}</Label>
            <Textarea
              id="alasan-konfirmasi-admin"
              value={alasan ?? ""}
              onChange={(event) => onAlasanChange(event.target.value)}
              placeholder={placeholderAlasan}
              disabled={busy}
              aria-describedby="alasan-konfirmasi-admin-hint"
            />
            <p
              id="alasan-konfirmasi-admin-hint"
              className="text-xs leading-5 text-muted-foreground"
            >
              Minimal {alasanMin} karakter. Alasan ikut tercatat di audit trail.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !alasanCukup}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Memproses…" : labelKonfirmasi}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
