import { useMutation, useQuery } from "convex/react";
import {
  Banknote,
  Coins,
  Copy,
  GitCompareArrows,
  Info,
  KeyRound,
  Loader2,
  MailPlus,
  MessageCircle,
  Receipt,
  ShieldX,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";

import { MinatPendanaPanel } from "./MinatPendanaPanel";
import { PanelSiklusPendana } from "./PanelSiklusPendana";
import { PemulihanJejakPratinjauPanel } from "./PemulihanJejakPratinjauPanel";
import { PencatatanTransferGadai } from "./PencatatanTransferGadai";
import { PencatatanTransferPendana } from "./PencatatanTransferPendana";
import { PenyediaDanaTable } from "./PenyediaDanaTable";
import { DataUjiPanel } from "./DataUjiPanel";
import { PratinjauAktifPanel } from "./PratinjauAktifPanel";
import { RekonsiliasiPendana } from "./RekonsiliasiPendana";
import { RekonsiliasiSetoranPendana } from "./RekonsiliasiSetoranPendana";
import { PenarikanPendanaPanel } from "./PenarikanPendanaPanel";

/**
 * PENDANA — enam tab utama, satu tempat.
 *
 * 1. Manajemen Akun & Hak Akses — buat pendana baru, beri akses per email,
 *    kelola kode akses bersama/tamu, daftar akun pendana & pemantau (beserta
 *    tindakan isi/ubah data login dan pratinjau "masuk sebagai"), dan daftar
 *    pratinjau yang sedang berjalan.
 * 2. Pencatatan Transfer Keuntungan — catat transfer keuntungan yang sudah
 *    dikirim di luar sistem (nominal dihitung server).
 * 3. Rekonsiliasi Setoran — cocokkan bukti transfer dengan mutasi bank lalu
 *    kreditkan saldo pendana dalam satu jurnal.
 * 4. Penarikan Pendana — proses transfer keluar manual dengan referensi dan
 *    bukti; jalur otomatis tetap ditutup.
 * 5. Rekonsiliasi & Auditing Pendana — bandingkan posisi panel dengan rekap
 *    ruang pendana.
 * 6. Calon Pendana — prospek dari halaman publik `/pendana/daftar`, lengkap
 *    dengan tombol WhatsApp dan status tindak lanjut.
 *
 * Semua binding data Convex tetap: `aksesBersama.statusKodeBersama`,
 * `penyediaDana.{ubahAkses,buatPendana,daftarInvestor}`, dan
 * `aksesBersama.{terbitkanKodeBersama,nonaktifkanKodeBersama}`. Satu kode
 * akses bersama ditampilkan SEKALI di sini (yang tersimpan hanya hash-nya).
 */

/** Kelas kartu bersama panel ini. */
const KARTU = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";

/** Tombol aksi utama dengan aksen Deep Emerald. */
const TOMBOL_EMERALD = "gap-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90";

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

/** Kartu Kiri: buat akun pendana baru yang langsung berakses. */
function KartuBuatPendana() {
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [busy, setBusy] = useState(false);
  const buatPendana = useMutation(api.penyediaDana.buatPendana);

  const kirim = async (event: React.FormEvent) => {
    event.preventDefault();
    const namaBersih = nama.trim();
    const target = email.trim().toLowerCase();
    if (namaBersih === "") {
      toast.error("Isi nama pendana yang akan dibuat.");
      return;
    }
    if (target === "") {
      toast.error("Isi alamat email pendana yang akan dibuat.");
      return;
    }
    if (nomorWhatsApp.replace(/\D/g, "").length < 9) {
      toast.error("Isi nomor WhatsApp pendana, mis. 0812 3456 7890 atau +49 151 2345678.");
      return;
    }
    setBusy(true);
    try {
      await buatPendana({
        nama: namaBersih,
        email: target,
        nomorWhatsApp: nomorWhatsApp.trim(),
      });
      toast.success(
        `Pendana ${namaBersih} dibuat. Ia bisa masuk lewat OTP WhatsApp ${nomorWhatsApp.trim()} atau email ${target}.`,
      );
      setNama("");
      setEmail("");
      setNomorWhatsApp("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat pendana.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={kirim} className={KARTU}>
      <header className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/5 text-primary">
          <UserPlus className="size-4" />
        </span>
        <div>
          <h3 className="font-bold text-slate-900">Buat Pendana Baru</h3>
          <p className="text-xs text-muted-foreground">
            Akun langsung berakses; pendana masuk lewat OTP WhatsApp atau email.
          </p>
        </div>
      </header>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="pendana-nama" className="text-xs text-muted-foreground">
            Nama pendana
          </Label>
          <Input
            id="pendana-nama"
            autoComplete="off"
            placeholder="mis. Robert Tanaya"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="pendana-email" className="text-xs text-muted-foreground">
            Email pendana
          </Label>
          <Input
            id="pendana-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nama@contoh.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="pendana-whatsapp" className="text-xs text-muted-foreground">
            Nomor WhatsApp login
          </Label>
          <div className="relative mt-1">
            <MessageCircle
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              id="pendana-whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0812 3456 7890"
              value={nomorWhatsApp}
              onChange={(e) => setNomorWhatsApp(e.target.value)}
              disabled={busy}
              className="pl-9"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
            Nomor ini menjadi pintu masuk OTP WhatsApp pendana. Satu nomor hanya
            untuk satu akun. Nomor luar Indonesia ditulis dengan kode negaranya,
            mis. +49 151 2345678.
          </p>
        </div>
        <Button type="submit" className={`w-full ${TOMBOL_EMERALD}`} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Buat Pendana
        </Button>
      </div>
    </form>
  );
}

/** Kartu Kanan: beri akses lihat-saja ke akun beremail yang sudah terdaftar. */
function KartuBeriAkses() {
  const [email, setEmail] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);

  const kirim = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = email.trim().toLowerCase();
    if (target === "") {
      toast.error("Isi alamat email akun yang akan diberi akses.");
      return;
    }
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <form onSubmit={kirim} className={KARTU}>
      <header className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/5 text-primary">
          <MailPlus className="size-4" />
        </span>
        <div>
          <h3 className="font-bold text-slate-900">Beri Akses Email</h3>
          <p className="text-xs text-muted-foreground">
            Untuk akun yang sudah terdaftar (pernah masuk dengan email).
          </p>
        </div>
      </header>

      <div className="mt-4 space-y-3">
        <div>
          <Label htmlFor="akses-email" className="text-xs text-muted-foreground">
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
            disabled={busy}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="akses-alasan" className="text-xs text-muted-foreground">
            Alasan (opsional)
          </Label>
          <Input
            id="akses-alasan"
            placeholder="mis. mitra pendanaan terverifikasi"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </div>
        <Button type="submit" className={`w-full ${TOMBOL_EMERALD}`} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
          Beri Akses
        </Button>
      </div>
    </form>
  );
}

/** Kartu Tengah: kode akses bersama/tamu — versi, pemantau aktif, dan aksi. */
function KartuKodeBersama() {
  const status = useQuery(api.aksesBersama.statusKodeBersama, {});
  const terbitkanKode = useMutation(api.aksesBersama.terbitkanKodeBersama);
  const nonaktifkanKode = useMutation(api.aksesBersama.nonaktifkanKodeBersama);
  const [busy, setBusy] = useState(false);
  const [kodeBaru, setKodeBaru] = useState<string | null>(null);

  const terbitkan = async () => {
    setBusy(true);
    try {
      const hasil = await terbitkanKode({});
      setKodeBaru(hasil.kode);
      toast.success(`Kode akses bersama versi ${hasil.versi} diterbitkan.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menerbitkan kode.");
    } finally {
      setBusy(false);
    }
  };

  const matikan = async () => {
    setBusy(true);
    try {
      await nonaktifkanKode({});
      setKodeBaru(null);
      toast.success("Kode dinonaktifkan — seluruh pemantau diputus.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan kode.");
    } finally {
      setBusy(false);
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

  return (
    <section className={KARTU}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <KeyRound className="size-4" />
          </span>
          <div>
            <h3 className="flex items-center gap-1.5 font-bold text-slate-900">
              Kode Akses Bersama / Tamu
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Penjelasan kode akses bersama"
                    className="text-muted-foreground transition-colors hover:text-slate-700"
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Bagikan tautan /akses-bersama beserta kodenya. Setiap orang memakai sesi tamunya
                  sendiri, jadi beberapa orang dapat membukanya bersamaan. Kode hanya tampil sekali
                  dan tersimpan sebagai hash.
                </TooltipContent>
              </Tooltip>
            </h3>
            <p className="text-xs text-muted-foreground">
              Satu kode untuk tim pemantau — terbit baru memutus semua pemakai lama.
            </p>
          </div>
        </div>
        {status === undefined ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <Badge
            className={
              status.aktif
                ? "border-success-border bg-success-soft text-success-foreground hover:bg-success-soft"
                : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
            }
          >
            {status.aktif ? "Aktif" : status.adaKode ? "Nonaktif" : "Belum diterbitkan"}
          </Badge>
        )}
      </header>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Versi Kode
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-800">
            {status === undefined ? "—" : status.versi}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Pemantau Aktif
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-800">
            {status === undefined ? "—" : status.pemakaiAktif}
            <span className="ml-1 text-xs font-medium text-muted-foreground">
              / {status === undefined ? "—" : status.pemakaiTercatat} tercatat
            </span>
          </dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Terbit Terakhir
          </dt>
          <dd className="mt-1 text-sm font-bold text-slate-900">
            {status === undefined ? "—" : tanggalRingkas(status.diterbitkanPada)}
          </dd>
        </div>
      </dl>

      {status?.blokirSampai !== null && status?.blokirSampai !== undefined && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          Pemakaian kode dibekukan sementara karena percobaan gagal beruntun — aktif lagi setelah{" "}
          {tanggalRingkas(status.blokirSampai)}.
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
            Kode ini tidak dapat dilihat lagi setelah panel ditutup. Bagikan hanya kepada orang yang
            Anda percaya.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className={TOMBOL_EMERALD} disabled={busy} onClick={() => void terbitkan()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Terbitkan Kode Baru
        </Button>
        <Button
          variant="outline"
          className="gap-2 rounded-xl"
          disabled={busy || status?.aktif !== true}
          onClick={() => void matikan()}
        >
          <ShieldX className="size-4" /> Nonaktifkan
        </Button>
      </div>
    </section>
  );
}

/** Tab 1 — manajemen akun & hak akses. */
function TabAkunAkses() {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <KartuBuatPendana />
        <KartuBeriAkses />
      </div>
      <KartuKodeBersama />
      <PanelSiklusPendana />
      <PenyediaDanaTable />
      <PratinjauAktifPanel />
      <DataUjiPanel />
      <PemulihanJejakPratinjauPanel />
    </div>
  );
}

export function AksesPenyediaDanaPanel() {
  return (
    <Tabs defaultValue="akun" className="flex flex-col gap-4">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        <TabsTrigger value="akun" className="gap-2 text-xs sm:text-sm">
          <Users className="size-3.5" /> Manajemen Akun &amp; Hak Akses
        </TabsTrigger>
        <TabsTrigger value="minat" className="gap-2 text-xs sm:text-sm">
          <UserPlus className="size-3.5" /> Calon Pendana
        </TabsTrigger>
        <TabsTrigger value="transfer" className="gap-2 text-xs sm:text-sm">
          <Coins className="size-3.5" /> Pencatatan Transfer Keuntungan
        </TabsTrigger>
        <TabsTrigger value="setoran" className="gap-2 text-xs sm:text-sm">
          <Receipt className="size-3.5" /> Rekonsiliasi Setoran
        </TabsTrigger>
        <TabsTrigger value="penarikan" className="gap-2 text-xs sm:text-sm">
          <Banknote className="size-3.5" /> Penarikan Pendana
        </TabsTrigger>
        <TabsTrigger value="rekon" className="gap-2 text-xs sm:text-sm">
          <GitCompareArrows className="size-3.5" /> Rekonsiliasi &amp; Auditing Pendana
        </TabsTrigger>
      </TabsList>

      <TabsContent value="akun" className="mt-0">
        <TabAkunAkses />
      </TabsContent>
      <TabsContent value="minat" className="mt-0">
        <MinatPendanaPanel />
      </TabsContent>
      <TabsContent value="transfer" className="mt-0">
        <div className="space-y-5">
          <PencatatanTransferPendana />
          <PencatatanTransferGadai />
        </div>
      </TabsContent>
      <TabsContent value="setoran" className="mt-0">
        <RekonsiliasiSetoranPendana />
      </TabsContent>
      <TabsContent value="penarikan" className="mt-0">
        <PenarikanPendanaPanel />
      </TabsContent>
      <TabsContent value="rekon" className="mt-0">
        <RekonsiliasiPendana />
      </TabsContent>
    </Tabs>
  );
}
