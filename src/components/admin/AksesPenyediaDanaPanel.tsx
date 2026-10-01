import { useMutation, useQuery } from "convex/react";
import { Eye, Loader2, MailPlus, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";

/**
 * Panel Akses Penyedia Dana — beri/cabut akses lihat saja.
 *
 * Akses ini hanya membuka halaman pantau pengajuan (pinjaman, gadai, kredit
 * barang) tanpa kemampuan mengubah apa pun: modul convex/penyediaDana.ts tidak
 * memiliki mutation transaksi, dan identitas pemohon tampil sebagai kode
 * pseudonim. Setiap perubahan akses tercatat di Audit Trail.
 */
export function AksesPenyediaDanaPanel() {
  const [email, setEmail] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const data = useQuery(api.penyediaDana.daftarAkses, {});
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);

  const kirim = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = email.trim().toLowerCase();
    if (target === "") {
      toast.error("Isi alamat email akun yang akan diberi akses.");
      return;
    }
    setBusy("form");
    try {
      const hasil = await ubahAkses({
        email: target,
        aktif: true,
        alasan: alasan.trim() === "" ? undefined : alasan.trim(),
      });
      toast.success(
        hasil.sudahSesuai
          ? `Akun ${target} memang sudah punya akses lihat saja.`
          : `Akses lihat saja diberikan ke ${target}.`,
      );
      setEmail("");
      setAlasan("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memberi akses.");
    } finally {
      setBusy(null);
    }
  };

  const cabut = async (target: string | null) => {
    if (target === null) {
      toast.error("Akun ini tidak memiliki email; cabut akses lewat basis data.");
      return;
    }
    setBusy(target);
    try {
      await ubahAkses({ email: target, aktif: false, alasan: "Dicabut dari panel admin" });
      toast.success(`Akses lihat saja ${target} dicabut.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencabut akses.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="animate-masuk space-y-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="size-4 text-primary" /> Akses penyedia dana (lihat saja)
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Memberi akses membuka halaman <strong>/penyedia-dana</strong>: daftar pengajuan pinjaman,
          gadai, dan kredit barang dalam mode baca. Pemegang akses tidak dapat mengubah data —
          modulnya tidak memiliki mutation transaksi — dan identitas pemohon tampil sebagai kode
          pseudonim (tanpa NIK, nomor rekening, atau dokumen). Pemberian dan pencabutan tercatat di
          Audit Trail.
        </p>
      </div>

      <form
        onSubmit={kirim}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor="akses-email" className="text-[11px] text-muted-foreground">
              Email akun
            </Label>
            <Input
              id="akses-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="nama@contoh.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy === "form"}
            />
          </div>
          <div>
            <Label htmlFor="akses-alasan" className="text-[11px] text-muted-foreground">
              Alasan (opsional)
            </Label>
            <Input
              id="akses-alasan"
              placeholder="mis. mitra pendanaan terverifikasi"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              disabled={busy === "form"}
            />
          </div>
          <Button type="submit" className="gap-2" disabled={busy === "form"}>
            {busy === "form" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MailPlus className="size-4" />
            )}
            Beri akses
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Akun harus sudah terdaftar (pernah masuk dengan email). Akun tamu dan akun tim (admin)
          tidak dapat diberi akses ini.
        </p>
      </form>

      {data === undefined ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat daftar akses…
        </p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          Belum ada akun dengan akses lihat saja.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {data.rows.map((r) => (
            <li
              key={r.userId}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.nama}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.email ?? "tanpa email"}
                  {r.kodePeminjam !== null ? ` · ${r.kodePeminjam}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge className="border-0 bg-primary/10 text-[10px] text-accent-foreground hover:bg-primary/10">
                    akses lihat saja
                  </Badge>
                  {r.emailTerverifikasi ? (
                    <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
                      email terverifikasi
                    </Badge>
                  ) : (
                    <Badge className="border-0 bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100">
                      email belum terverifikasi
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={busy === r.email}
                onClick={() => void cabut(r.email)}
              >
                {busy === r.email ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldOff className="size-4" />
                )}
                Cabut akses
              </Button>
            </li>
          ))}
        </ul>
      )}

      {data?.terpotong === true && (
        <p className="text-[11px] text-muted-foreground">
          Menampilkan {data.batas} akun pertama saja.
        </p>
      )}
    </div>
  );
}
