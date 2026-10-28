import { useMutation } from "convex/react";
import { Ban, Coins, Loader2, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiahAman } from "@/lib/money";

/**
 * Catat atau batalkan keuntungan satu penyedia dana — khusus Super Admin.
 *
 * PINDAI tidak memindahkan uang. Admin mentransfer keuntungan pendana di luar
 * sistem, lalu mencatatnya di sini supaya keuntungan yang sama tidak tertagih
 * dua kali. Nominal TIDAK diambil dari isian: server menghitung ulang dari
 * pokok pinjaman dengan kebijakan yang berlaku, jadi angka yang tercatat selalu
 * sama dengan hak pendana.
 *
 * Catatan yang salah dibatalkan (alasan wajib), bukan diubah — keduanya masuk
 * Audit Trail. Membatalkan tidak mengembalikan uang apa pun.
 */

/** Satu pinjaman yang keuntungan pendananya sedang dicatat. */
export type TargetKeuntungan = {
  loanId: Id<"loans">;
  /** Nama pendana untuk ditampilkan (di ruang bersama sudah disamarkan). */
  pendanaNama: string;
  nomorReferensi: string;
  /** Nominal hak pendana menurut halaman; server tetap menghitung ulang. */
  jumlah: number;
};

const METODE = [
  { nilai: "transfer_bank", label: "Transfer bank" },
  { nilai: "e_wallet", label: "E-wallet" },
  { nilai: "tunai", label: "Tunai" },
] as const;

type Metode = (typeof METODE)[number]["nilai"];

function FormCatat({
  target,
  onClose,
}: {
  target: TargetKeuntungan;
  onClose: () => void;
}) {
  const catat = useMutation(api.penyediaDana.catatTransferPendana);
  const kirimLaporan = useMutation(api.laporanPendana.kirimLaporanPelunasanManual);
  const kirimContoh = useMutation(api.laporanPendana.kirimContohLaporanCs);
  const [metode, setMetode] = useState<Metode>("transfer_bank");
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [kirimBusy, setKirimBusy] = useState(false);
  const [contohBusy, setContohBusy] = useState(false);

  /**
   * Kirim laporan pelunasan — yang memuat catatan keuntungan pendana ini — ke
   * WhatsApp pendananya sekarang juga. Laporan itu tidak lagi berangkat
   * sendiri saat pinjaman lunas; admin yang menentukan waktunya. Penerimanya
   * tetap pemilik pinjaman, bukan nomor pilihan pemanggil.
   */
  const kirimLaporanSekarang = async () => {
    setKirimBusy(true);
    try {
      await kirimLaporan({ loanId: target.loanId });
      toast.success("Laporan pelunasan dijadwalkan ke WhatsApp pendana.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim laporan.");
    } finally {
      setKirimBusy(false);
    }
  };

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const hasil = await catat({
        loanId: target.loanId,
        metode,
        referensi: referensi.trim() === "" ? undefined : referensi.trim(),
        catatan: catatan.trim() === "" ? undefined : catatan.trim(),
      });
      toast.success(
        `Keuntungan ${target.pendanaNama} dicatat: ${formatRupiahAman(hasil.jumlah)}.`,
      );
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mencatat keuntungan.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Kirim contoh format laporan ke nomor CS — data contoh, bukan data nasabah. */
  const kirimContohKeCs = async () => {
    setContohBusy(true);
    try {
      await kirimContoh({});
      toast.success("Contoh format laporan dikirim ke WhatsApp CS.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengirim contoh.");
    } finally {
      setContohBusy(false);
    }
  };

  return (
    <form onSubmit={kirim} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Catat keuntungan pendana</DialogTitle>
        <DialogDescription>
          {target.pendanaNama} · {target.nomorReferensi} ·{" "}
          <strong className="text-navy">{formatRupiahAman(target.jumlah)}</strong>
          . Catat hanya setelah uang benar-benar dikirim — PINDAI tidak
          memindahkan dana, dan nominalnya dihitung ulang server.
        </DialogDescription>
      </DialogHeader>

      <div>
        <Label htmlFor="keuntungan-metode" className="text-[11px] text-muted-foreground">
          Metode pengiriman
        </Label>
        <Select value={metode} onValueChange={(v) => setMetode(v as Metode)}>
          <SelectTrigger id="keuntungan-metode" className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METODE.map((m) => (
              <SelectItem key={m.nilai} value={m.nilai}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="keuntungan-referensi" className="text-[11px] text-muted-foreground">
          Referensi mutasi (opsional)
        </Label>
        <Input
          id="keuntungan-referensi"
          autoComplete="off"
          placeholder="mis. nomor jurnal bank / ID transaksi e-wallet"
          value={referensi}
          onChange={(e) => setReferensi(e.target.value)}
          disabled={busy}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="keuntungan-catatan" className="text-[11px] text-muted-foreground">
          Catatan (opsional)
        </Label>
        <Textarea
          id="keuntungan-catatan"
          placeholder="mis. ditransfer bersama pelunasan lain"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          disabled={busy}
          className="mt-1"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <p className="text-[11px] leading-4 text-slate-600">
          Laporan pelunasan ke pendana tidak dikirim otomatis. Kirim sekarang bila catatan
          keuntungan di atas sudah siap, atau nyalakan pengiriman otomatis di Pengaturan Sistem.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full justify-start"
          disabled={busy || kirimBusy}
          onClick={() => void kirimLaporanSekarang()}
        >
          {kirimBusy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4 text-emerald-600" />
          )}
          Kirim laporan pelunasan ke pendana
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-[11px]"
          disabled={busy || contohBusy}
          onClick={() => void kirimContohKeCs()}
        >
          {contohBusy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4 text-slate-500" />
          )}
          Kirim contoh format ke CS
        </Button>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Batal
        </Button>
        <Button type="submit" className="gap-2" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Coins className="size-4" />}
          Catat keuntungan
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormBatal({
  target,
  onClose,
}: {
  target: TargetKeuntungan;
  onClose: () => void;
}) {
  const batalkan = useMutation(api.penyediaDana.batalkanTransferPendana);
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (alasan.trim().length < 3) {
      toast.error("Isi alasan pembatalan (minimal 3 karakter).");
      return;
    }
    setBusy(true);
    try {
      await batalkan({ loanId: target.loanId, alasan: alasan.trim() });
      toast.success("Catatan keuntungan dibatalkan — riwayatnya tetap di Audit Trail.");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal membatalkan catatan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={kirim} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Batalkan catatan keuntungan?</DialogTitle>
        <DialogDescription>
          Catatan keuntungan {target.pendanaNama} ({target.nomorReferensi}) akan
          ditandai salah. Uang TIDAK dikembalikan dan saldo tidak berubah —
          catatan lama tetap terbaca di Audit Trail. Alasan wajib diisi.
        </DialogDescription>
      </DialogHeader>

      <div>
        <Label htmlFor="keuntungan-alasan" className="text-[11px] text-muted-foreground">
          Alasan pembatalan
        </Label>
        <Textarea
          id="keuntungan-alasan"
          placeholder="mis. salah nominal / ditransfer ke pendana lain"
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          disabled={busy}
          className="mt-1"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Tahan dulu
        </Button>
        <Button type="submit" variant="destructive" className="gap-2" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
          Batalkan catatan
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DialogCatatKeuntungan({
  target,
  onClose,
}: {
  target: TargetKeuntungan | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      <DialogContent>
        {target !== null && (
          <FormCatat key={`${target.loanId}-${target.jumlah}`} target={target} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DialogBatalkanKeuntungan({
  target,
  onClose,
}: {
  target: TargetKeuntungan | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      <DialogContent>
        {target !== null && (
          <FormBatal key={`${target.loanId}-${target.jumlah}`} target={target} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
