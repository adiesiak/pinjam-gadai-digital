import { Loader2, UserRoundCog } from "lucide-react";
import { useState } from "react";

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
import { useAuth } from "@/hooks/use-auth";
import { usePratinjau } from "@/hooks/use-pratinjau";

/**
 * TOMBOL "MASUK SEBAGAI" — pratinjau Super Admin atas satu akun.
 *
 * Ini bukan sekadar tampilan: peramban yang menekannya berpindah ke SESI NYATA
 * akun target (lihat `convex/auth/pratinjau.ts`), sehingga layar yang muncul
 * adalah aplikasi yang dialami akun itu — data, ruang, dan haknya. Karena itu
 * konfirmasinya menyebutkan tiga hal sekaligus: akun siapa yang dibuka, di mana
 * admin akan mendarat, dan bahwa sesi adminnya sendiri akan tersimpan sehingga
 * bisa dikembalikan dari bilah di atas layar.
 *
 * Dialog sengaja tidak bisa ditutup selama proses berjalan: kegagalan di tengah
 * jalan (mis. tiket kedaluwarsa) harus terbaca di tempat, bukan menghilang
 * bersama dialognya.
 */
export function TombolMasukSebagai({
  targetId,
  nama,
  tujuan,
}: {
  targetId: string;
  nama: string;
  /** Ruang tujuan dalam kata-kata pemilik akun (mis. "ruang pendana"). */
  tujuan: string;
}) {
  const { user } = useAuth();
  const { busy, mulai } = usePratinjau();
  const [terbuka, setTerbuka] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);

  const adminLabel = user?.email ?? user?.name ?? "Super Admin";

  const kirim = async () => {
    setPesanGagal(null);
    try {
      await mulai({ targetId, alasan });
      // Berhasil berarti peramban sudah dimuat ulang ke ruang akun target;
      // tidak ada langkah lanjutan di sini.
    } catch (error) {
      const pesan =
        error instanceof Error ? error.message : "Gagal memulai pratinjau.";
      setPesanGagal(pesan);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 gap-2 rounded-xl sm:min-h-9"
        onClick={() => {
          setPesanGagal(null);
          setTerbuka(true);
        }}
      >
        <UserRoundCog className="size-3.5" aria-hidden="true" />
        Masuk sebagai
      </Button>

      <Dialog
        open={terbuka}
        onOpenChange={(buka) => {
          if (busy) return;
          if (!buka) setTerbuka(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Masuk sebagai {nama}?</DialogTitle>
            <DialogDescription>
              Peramban ini akan memakai sesi nyata akun itu, jadi Anda melihat{" "}
              {tujuan} persis seperti yang ia lihat. Sesi admin Anda disimpan di
              peramban ini dan dapat dikembalikan dari bilah di atas layar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              Selama pratinjau, tindakan yang dilakukan dari peramban ini tercatat sebagai
              pratinjau oleh {adminLabel} dan ikut jejak audit akun tersebut.
            </div>

            <div>
              <Label htmlFor={`alasan-pratinjau-${targetId}`} className="text-xs text-muted-foreground">
                Alasan pratinjau (opsional)
              </Label>
              <Input
                id={`alasan-pratinjau-${targetId}`}
                autoComplete="off"
                placeholder="mis. memeriksa keluhan saldo pendana"
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                disabled={busy}
                className="mt-1"
              />
            </div>

            {pesanGagal !== null && (
              <p role="alert" className="text-sm leading-6 text-destructive">
                {pesanGagal}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={busy}
              onClick={() => setTerbuka(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="gap-2 rounded-xl bg-[#064E3B] text-white hover:bg-[#04361f]"
              disabled={busy}
              onClick={() => void kirim()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserRoundCog className="size-4" aria-hidden="true" />
              )}
              Masuk sebagai {nama}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
