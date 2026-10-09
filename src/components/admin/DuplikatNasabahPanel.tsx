import { useMutation, useQuery } from "convex/react";
import { Check, GitMerge, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pilihUtama, type SebabKembar } from "@/lib/duplikatNasabah";

/**
 * Alat "Data lama": temukan nasabah kembar dan gabungkan riwayatnya.
 *
 * Dipasang di dalam panel Plafon Nasabah, jadi hanya muncul saat memang ADA
 * duplikat — daftar kosong tidak menambah kebisingan di layar kerja.
 *
 * Satu kelompok dianggap orang yang sama. Admin memilih SATU akun utama lewat
 * tombol radio; akun lain yang dicentang akan digabungkan ke akun utama
 * (riwayatnya pindah, akunnya dihapus). Akun duplikat yang belum punya berkas
 * sama sekali boleh langsung dihapus tanpa digabung.
 */
const LABEL_SEBAB: Record<SebabKembar, string> = {
  nik: "NIK sama",
  whatsapp: "Nomor WhatsApp sama",
};

type PilihanGrup = {
  utama: string;
  pilih: Record<string, boolean>;
};

export function DuplikatNasabahPanel() {
  const data = useQuery(api.duplikatNasabah.daftarNasabahKembar);
  const gabungNasabah = useMutation(api.duplikatNasabah.gabungNasabah);
  const hapusNasabah = useMutation(api.admin.hapusNasabah);

  const [pilihan, setPilihan] = useState<Record<string, PilihanGrup>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [gabungTarget, setGabungTarget] = useState<{
    key: string;
    utamaId: string;
    utamaNama: string;
    sumberIds: string[];
  } | null>(null);
  const [hapusTarget, setHapusTarget] = useState<{ userId: string; nama: string } | null>(null);

  if (data === undefined) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memeriksa nasabah kembar…
        </p>
      </section>
    );
  }

  if (data.kelompok.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
        <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
        <p className="text-xs leading-5 text-emerald-900">
          Tidak ada nasabah kembar terdeteksi dari NIK maupun nomor WhatsApp pada{" "}
          <strong>{data.totalProfil}</strong> data diri.
        </p>
      </section>
    );
  }

  const setGrup = (key: string, nilai: PilihanGrup) =>
    setPilihan((current) => ({ ...current, [key]: nilai }));

  const jalankanGabung = async () => {
    if (gabungTarget === null) return;
    setBusy(gabungTarget.key);
    try {
      const hasil = await gabungNasabah({
        utamaId: gabungTarget.utamaId as Id<"users">,
        sumberIds: gabungTarget.sumberIds as Id<"users">[],
      });
      toast.success(
        `${hasil.digabung} akun digabungkan ke ${hasil.namaUtama} · ` +
          `${hasil.ringkas.pinjaman + hasil.ringkas.gadai + hasil.ringkas.kredit} berkas dipindahkan.`,
      );
      setGabungTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menggabungkan nasabah.");
    } finally {
      setBusy(null);
    }
  };

  const jalankanHapus = async () => {
    if (hapusTarget === null) return;
    setBusy(hapusTarget.userId);
    try {
      await hapusNasabah({ userId: hapusTarget.userId as Id<"users"> });
      toast.success(`Akun duplikat ${hapusTarget.nama.toUpperCase()} dihapus.`);
      setHapusTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus akun.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <GitMerge className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-navy">Nasabah kembar terdeteksi</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {data.kelompok.length} kelompok berbagi NIK atau nomor WhatsApp. Pilih satu akun utama
            per kelompok, centang akun duplikat yang riwayatnya ingin dipindahkan, lalu gabungkan.
            Riwayat keuangan tidak dihapus — hanya berpindah pemilik.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {data.kelompok.map((grup, indeks) => {
          const key = grup.baris
            .map((b) => b.userId)
            .slice()
            .sort()
            .join("|");
          const bawaan: PilihanGrup = {
            utama: pilihUtama(grup.baris).userId,
            pilih: Object.fromEntries(grup.baris.map((b) => [b.userId, true])),
          };
          const terpilih = pilihan[key] ?? bawaan;
          const utamaBaris = grup.baris.find((b) => b.userId === terpilih.utama) ?? grup.baris[0];
          const sumberIds = grup.baris
            .filter((b) => b.userId !== terpilih.utama && terpilih.pilih[b.userId] === true)
            .map((b) => b.userId);

          return (
            <li key={key} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
              <header className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Kelompok {indeks + 1}
                </span>
                {grup.sebab.map((s) => (
                  <Badge key={s} className="border-amber-200 bg-amber-100 text-amber-800">
                    {LABEL_SEBAB[s]}
                  </Badge>
                ))}
              </header>

              <ul className="mt-3 divide-y divide-slate-100">
                {grup.baris.map((r) => {
                  const jadiUtama = r.userId === terpilih.utama;
                  const dicentang = jadiUtama ? false : terpilih.pilih[r.userId] === true;
                  const sedangBusy = busy === r.userId || busy === key;
                  return (
                    <li
                      key={r.userId}
                      className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <button
                        type="button"
                        aria-label={`Jadikan ${r.nama} akun utama`}
                        aria-pressed={jadiUtama}
                        onClick={() =>
                          setGrup(key, {
                            ...terpilih,
                            utama: r.userId,
                            pilih: { ...terpilih.pilih, [r.userId]: false },
                          })
                        }
                        disabled={sedangBusy}
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          jadiUtama
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-slate-300 bg-white text-transparent hover:border-primary"
                        }`}
                      >
                        <Check className="size-3.5" />
                      </button>

                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 rounded border-slate-300 accent-primary"
                          checked={dicentang}
                          disabled={jadiUtama || sedangBusy}
                          onChange={(e) =>
                            setGrup(key, {
                              ...terpilih,
                              pilih: { ...terpilih.pilih, [r.userId]: e.target.checked },
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-navy">
                              {r.nama}
                            </span>
                            {jadiUtama ? (
                              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                                akun utama
                              </Badge>
                            ) : null}
                            {r.dibuatAdmin ? (
                              <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                                akun catatan admin
                              </Badge>
                            ) : (
                              <Badge className="border-sky-200 bg-sky-100 text-sky-700">
                                akun aplikasi
                              </Badge>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {r.email ?? "tanpa email"} · NIK {r.nik} · WA {r.nomorWhatsApp}
                          </span>
                          <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                            {r.jumlahBerkas} berkas · {r.jumlahPinjaman} pinjaman · {r.jumlahGadai}{" "}
                            gadai · {r.jumlahKredit} kredit
                          </span>
                        </span>
                      </label>

                      {r.jumlahBerkas === 0 && !jadiUtama && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={sedangBusy}
                          onClick={() => setHapusTarget({ userId: r.userId, nama: r.nama })}
                        >
                          {busy === r.userId ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                          <span className="ml-1">Hapus</span>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {sumberIds.length} akun duplikat terpilih dari {grup.baris.length - 1} kandidat.
                </p>
                <Button
                  size="sm"
                  disabled={sumberIds.length === 0 || busy === key}
                  onClick={() =>
                    setGabungTarget({
                      key,
                      utamaId: utamaBaris.userId,
                      utamaNama: utamaBaris.nama,
                      sumberIds,
                    })
                  }
                >
                  {busy === key ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <GitMerge className="size-4" />
                  )}
                  <span className="ml-1">Gabungkan {sumberIds.length} akun</span>
                </Button>
              </footer>
            </li>
          );
        })}
      </ul>

      {/* Konfirmasi penggabungan: menegaskan arah pindah dan bahwa akun
          duplikat benar-benar dihapus setelah riwayatnya pindah. */}
      <AlertDialog
        open={gabungTarget !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setGabungTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gabungkan nasabah kembar?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-navy">{gabungTarget?.sumberIds.length}</strong> akun duplikat
              akan digabungkan ke{" "}
              <strong className="text-navy">{gabungTarget?.utamaNama.toUpperCase()}</strong>.
              Seluruh pinjaman, gadai, kredit barang, cicilan, dan bukti pembayarannya berpindah ke
              akun utama; akun duplikat beserta kredensialnya dihapus. Riwayat keuangan tidak ada
              yang dibuang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === gabungTarget?.key}>Batal</AlertDialogCancel>
            <Button disabled={busy === gabungTarget?.key} onClick={() => void jalankanGabung()}>
              {busy === gabungTarget?.key ? <Loader2 className="size-4 animate-spin" /> : null}
              Gabungkan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konfirmasi hapus akun duplikat tanpa berkas. */}
      <AlertDialog
        open={hapusTarget !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setHapusTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus akun duplikat?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun <strong className="text-navy">{hapusTarget?.nama.toUpperCase()}</strong> belum
              punya berkas apa pun, jadi aman dihapus. Kredensial dan data turunannya ikut
              dibersihkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === hapusTarget?.userId}>Batal</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy === hapusTarget?.userId}
              onClick={() => void jalankanHapus()}
            >
              {busy === hapusTarget?.userId ? <Loader2 className="size-4 animate-spin" /> : null}
              Hapus akun
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
