import { useMutation } from "convex/react";
import { IdCard, Loader2, Save } from "lucide-react";
import { useState } from "react";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * ISI / UBAH DATA LOGIN SATU AKUN.
 *
 * Email adalah identitas masuk (kode OTP dikirim ke alamat itu), jadi formulir
 * ini menyebut akibatnya secara terang: alamat yang diisi di sini adalah alamat
 * yang harus dipakai pendana saat masuk lewat /auth. Server memindahkan akun
 * login pemiliknya ke alamat baru, sehingga tidak ada akun kosong yang lahir di
 * samping data pendananya.
 *
 * Untuk akun warisan "tanpa email", formulirnya sama — hanya judul dan tombolnya
 * yang berubah kata, karena pekerjaannya memang berbeda: mengisi, bukan
 * mengubah.
 *
 * Pemicunya bisa tombol sendiri (pemakaian lama) atau menu "Kelola" di tabel
 * pendana. Isi formulir dipasang hanya selama dialog terbuka, jadi ketikan yang
 * batal tidak menempel pada akun yang dibuka berikutnya.
 */
export function TombolUbahAkunPendana({
  targetId,
  nama,
  email,
  terbuka: terbukaKendali,
  onTerbukaChange,
  tampilkanTombol = true,
}: {
  targetId: string;
  nama: string;
  email: string | null;
  /**
   * Mode terkendali: menu "Kelola" di tabel yang membuka dialognya. Dialog
   * tetap tinggal di sini supaya alur simpan dan pesan gagal tidak bercabang;
   * hanya pemicunya yang dipindahkan ke menu.
   */
  terbuka?: boolean;
  onTerbukaChange?: (terbuka: boolean) => void;
  /** Sembunyikan tombol pemicu saat dialog dibuka dari menu lain. */
  tampilkanTombol?: boolean;
}) {
  const [terbukaLokal, setTerbukaLokal] = useState(false);
  const terbuka = terbukaKendali ?? terbukaLokal;
  /** Satu pintu ubah: state lokal untuk pemakaian biasa, menu untuk mode kendali. */
  const ubahTerbuka = (buka: boolean) => {
    if (terbukaKendali === undefined) setTerbukaLokal(buka);
    onTerbukaChange?.(buka);
  };
  const emailBelumAda = email === null;

  return (
    <>
      {tampilkanTombol && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2 rounded-xl"
          onClick={() => ubahTerbuka(true)}
        >
          <IdCard className="size-3.5" aria-hidden="true" />
          {emailBelumAda ? "Isi data login" : "Ubah data login"}
        </Button>
      )}

      <Dialog
        open={terbuka}
        onOpenChange={(bukaDialog) => {
          if (!bukaDialog) ubahTerbuka(false);
        }}
      >
        {terbuka && (
          <IsiUbahAkunPendana
            targetId={targetId}
            nama={nama}
            email={email}
            onTutup={() => ubahTerbuka(false)}
          />
        )}
      </Dialog>
    </>
  );
}

/** Isi dialog — dipasang ulang setiap kali dibuka, jadi selalu mulai dari data tersimpan. */
function IsiUbahAkunPendana({
  targetId,
  nama,
  email,
  onTutup,
}: {
  targetId: string;
  nama: string;
  email: string | null;
  onTutup: () => void;
}) {
  const ubahAkun = useMutation(api.penyediaDana.ubahAkunPendana);
  const [namaBaru, setNamaBaru] = useState(nama);
  const [emailBaru, setEmailBaru] = useState(email ?? "");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);

  const emailBelumAda = email === null;

  const simpan = async () => {
    setPesanGagal(null);
    setBusy(true);
    try {
      const hasil = await ubahAkun({
        userId: targetId as Id<"users">,
        nama: namaBaru,
        email: emailBaru,
        ...(alasan.trim() ? { alasan: alasan.trim() } : {}),
      });
      if (hasil.sudahSesuai) {
        toast.info("Tidak ada yang berubah pada data login akun ini.");
      } else {
        toast.success(
          `Data login ${hasil.email} disimpan${
            hasil.akunLoginDiperbarui > 0
              ? `; ${hasil.akunLoginDiperbarui} akun login ikut dipindahkan`
              : ""
          }.`,
        );
      }
      onTutup();
    } catch (error) {
      const pesan =
        error instanceof Error ? error.message : "Gagal menyimpan data login.";
      setPesanGagal(pesan);
      toast.error(pesan);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent
      className="max-w-lg"
      showCloseButton={!busy}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {emailBelumAda ? "Isi data login akun" : "Ubah data login akun"}
        </DialogTitle>
        <DialogDescription>
          Nama dan email ini yang dipakai akun untuk masuk. Mengubah email
          memindahkan akun loginnya ke alamat baru, jadi tidak ada akun kosong
          yang terbentuk di samping data pendananya.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor={`nama-akun-${targetId}`} className="text-xs text-muted-foreground">
            Nama akun
          </Label>
          <Input
            id={`nama-akun-${targetId}`}
            autoComplete="off"
            placeholder="mis. Robert Tanaya"
            value={namaBaru}
            onChange={(e) => setNamaBaru(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor={`email-akun-${targetId}`} className="text-xs text-muted-foreground">
            Email login
          </Label>
          <Input
            id={`email-akun-${targetId}`}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nama@contoh.com"
            value={emailBaru}
            onChange={(e) => setEmailBaru(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
          <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
            Kode masuk dikirim ke alamat ini saat pendana membuka /auth. Alamat
            tidak boleh sama dengan akun lain.
          </p>
        </div>

        <div>
          <Label htmlFor={`alasan-akun-${targetId}`} className="text-xs text-muted-foreground">
            Alasan perubahan (opsional)
          </Label>
          <Input
            id={`alasan-akun-${targetId}`}
            autoComplete="off"
            placeholder="mis. pendana berganti alamat email"
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
          onClick={onTutup}
        >
          Batal
        </Button>
        <Button
          type="button"
          className="gap-2 rounded-xl bg-[#064E3B] text-white hover:bg-[#04361f]"
          disabled={busy}
          onClick={() => void simpan()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          Simpan data login
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
