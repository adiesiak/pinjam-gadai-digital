import { useMutation, useQuery } from "convex/react";
import {
  Copy,
  Eye,
  KeyRound,
  Loader2,
  MailPlus,
  ShieldX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";

import { RekonsiliasiPendana } from "./RekonsiliasiPendana";

function tanggalRingkas(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Satu kartu penyedia dana, untuk tampilan tanpa batasan kolom pada layar sempit. */
function KartuPenawaran({
  r,
}: {
  r: { nama: string; role: string; saatIni: string; kode: string; status: string };
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 sm:flex-nowrap sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {r.nama.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold text-slate-900">{r.nama}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">{r.role}</p>
      </div>
      <div className="shrink-0 flex items-center gap-3 text-xs text-slate-600">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px]">{r.saatIni}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px]">{r.kode}</span>
        <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
      </div>
    </div>
  );
}

export function PenyediaDanaTable() {
  const [email, setEmail] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [kodeBaru, setKodeBaru] = useState<string | null>(null);

  const status = useQuery(api.aksesBersama.statusKodeBersama, {});
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);
  const terbitkanKode = useMutation(api.aksesBersama.terbitkanKodeBersama);
  const nonaktifkanKode = useMutation(api.aksesBersama.nonaktifkanKodeBersama);
  const daftar = useQuery(api.penyediaDana.daftarInvestor, {});

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

  const terbitkan = async () => {
    setBusy("kode");
    try {
      const hasil = await terbitkanKode({});
      setKodeBaru(hasil.kode);
      toast.success(`Kode akses bersama versi ${hasil.versi} diterbitkan.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menerbitkan kode.");
    } finally {
      setBusy(null);
    }
  };

  const salinKode = async () => {
    if (kodeBaru === null) return;
    try {
      await navigator.clipboard.writeText(kodeBaru);
      toast.success("Kode disalin ke papan klip.");
    } catch {
      toast.error("Gagal menyalin otomatis. Salin manual dari kotak kode.");
    }
  };

  const matikan = async () => {
    setBusy("kode");
    try {
      await nonaktifkanKode({});
      setKodeBaru(null);
      toast.success("Kode dinonaktifkan — seluruh pemantau diputus.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan kode.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="animate-masuk space-y-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="size-4 text-primary" /> Kelola penyedia dana (lihat saja)
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Memberi akses membuka halaman <strong>/penyedia-dana</strong>: daftar pengajuan
          pinjaman, gadai, dan kredit barang dalam mode baca. Pemegang akses tidak dapat
          mengubah data — modulnya tidak memiliki mutation transaksi. Nama lengkap pemohon dan
          titik lokasi terakhirnya ditampilkan; NIK, nomor rekening, dan nomor WhatsApp tidak
          dikirim sebagai kolom terpisah. <strong>Berkas identitas pemohon (KTP, selfie, slip,
          foto barang, tanda tangan) hanya dibuka untuk akun beremail dengan peran penyedia dana
          di bawah</strong> — sesi kode akses bersama tidak dapat membukanya. Semua perubahan akses
          tercatat di Audit Trail.
        </p>
      </div>

      {/* ===== Kode akses bersama ===== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-primary" /> Kode akses bersama
          </p>
          {status === undefined ? (
            /* Lencana belum diketahui: rangka berbentuk lencana yang sama, jadi
               barisnya tidak bergeser ketika status tiba. */
            <Skeleton className="h-6 w-20 rounded-full" />
          ) : (
            <Badge
              className={
                status.aktif
                  ? "border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
              }
            >
              {status.aktif
                ? "aktif"
                : status.adaKode
                  ? "nonaktif"
                  : "belum diterbitkan"}
            </Badge>
          )}
        </div>

        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Satu kode untuk tim pemantau: bagikan tautan{" "}
          <span className="font-medium text-slate-700">/akses-bersama</span> beserta kodenya.
          Setiap orang memakai sesi tamunya sendiri sehingga beberapa orang dapat membukanya
          bersamaan. Kode ditampilkan sekali dan tersimpan hanya sebagai hash.
        </p>

        {status !== undefined && (
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Versi kode</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{status.versi}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pemantau aktif</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {status.pemakaiAktif} dari {status.pemakaiTercatat} tercatat
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Terbit terakhir</dt>
              <dd className="mt-0.5 font-semibold">{tanggalRingkas(status.diterbitkanPada)}</dd>
            </div>
          </dl>
        )}

        {status?.blokirSampai !== null && status?.blokirSampai !== undefined && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            Pemakaian kode dibekukan sementara karena percobaan gagal beruntun — aktif lagi
            setelah {tanggalRingkas(status.blokirSampai)}.
            {status.gagalDalamJendela > 0 && ` (${status.gagalDalamJendela} percobaan tercatat)`}
          </p>
        )}

        {kodeBaru !== null && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
              Kode baru — ditampilkan sekali
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 font-mono text-sm tracking-[0.12em] text-slate-900">
                {kodeBaru}
              </code>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void salinKode()}>
                <Copy className="size-3.5" /> Salin
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-amber-800">
              Kode ini tidak dapat dilihat lagi setelah panel ditutup. Bagikan hanya kepada
              orang yang Anda percaya; siapa pun yang memegangnya bisa membaca ruang pantau.
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-2"
            disabled={busy === "kode"}
            onClick={() => void terbitkan()}
          >
            {busy === "kode" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {status?.adaKode ? "Terbitkan kode baru" : "Terbitkan kode"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={busy === "kode" || status?.aktif !== true}
            onClick={() => void matikan()}
          >
            <ShieldX className="size-4" /> Nonaktifkan kode
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Menerbitkan kode baru atau menonaktifkannya langsung memutus seluruh pemakai lama —
          mereka perlu kode terbaru untuk masuk lagi.
        </p>
      </section>

      {/* ===== Akses per akun email ===== */}
      <form
        onSubmit={kirim}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MailPlus className="size-4 text-primary" /> Akses tetap per akun email
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
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

      {/* ===== Daftar penyedia dana (tampilan kartu, tanpa scroll horizontal) ===== */}
      <div className="overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 px-4 pt-4 sm:px-5 sm:pt-5 md:hidden">
          {status !== undefined && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                  Kode akses bersama
                </p>
                <Badge
                  className={
                    status.aktif
                      ? "border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
                  }
                >
                  {status.aktif
                    ? "aktif"
                    : status.adaKode
                      ? "nonaktif"
                      : "belum diterbitkan"}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                Versi {status.versi} · Pemantau {status.pemakaiAktif}/{status.pemakaiTercatat}
                · Terbit {tanggalRingkas(status.diterbitkanPada)}
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Tabel baca-only disembunyikan di layar sempit. Susun ulang kolom menjadi kartu agar
            tidak perlu digeser.
          </p>
        </div>
        <div className="hidden md:block">
          <div className="space-y-3">
            {daftar !== undefined ? (
              daftar.rows.map((r) => (
                <KartuPenawaran
                  key={r.userId ?? r.email ?? r.nama}
                  r={{
                    nama: r.nama,
                    role: r.peran ?? "santai",
                    saatIni: r.aksesAktif ? "aktif" : "nonaktif",
                    kode: r.akunBersama ? String(r.terdaftarPada) : "—",
                    status: r.aksesAktif ? "Aktif" : "Tidak akses",
                  }}
                />
              ))
            ) : (
              <SkeletonBarisDaftar baris={3} />
            )}
          </div>
        </div>
        <RekonsiliasiPendana />
      </div>
    </div>
  );
}
