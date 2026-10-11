import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  FileCheck,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EContractWidget } from "@/components/EContract";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel, quotePinjaman } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  diTahapTinjauan,
  LABEL_STATUS_PINJAMAN,
  nominalTerkunci,
  STATUS_PINJAMAN,
  type StatusPinjaman,
} from "@/lib/statusPinjaman";

import { namaHurufBesar } from "@/lib/nama";

import { formatDate } from "./admin-format";
import { type LoanRow } from "./admin-shared";
import { AliranDanaPinjaman } from "./AliranDanaPinjaman";
import { LoanKycPanel } from "./LoanKycPanel";
import { PanelDataDiriNasabah } from "./PanelDataDiriNasabah";

// Sentinel NON-kosong: Radix Select menolak `<SelectItem value="">`, jadi
// "tidak diubah" dan "lepas pendana" memakai penandanya sendiri.
const PENDANA_TETAP = "__tetap";
const PENDANA_LEPAS = "__lepas";

type LoanRowWithOptionalProps = LoanRow & {
  readonly persenBunga?: number | null;
};

export function LoanReviewDialog({
  row,
  onClose,
}: {
  row: LoanRow | null;
  onClose: () => void;
}) {
  const ubahStatus = useMutation(api.loans.ubahStatusPinjaman);
  const fund = useMutation(api.loans.danaiPinjaman);
  const deleteLoan = useMutation(api.loans.hapusPinjaman);
  const kirimStatus = useAction(api.whatsapp.kirimStatusPinjaman);
  // Penetapan pendana + koreksi nominal memakai jalur yang sama dengan ruang
  // pendana, sehingga nama pendana langsung tampil di sana.
  const simpanPendana = useMutation(api.penyediaDana.ubahDataPinjaman);

  // Sasaran status memakai EMPAT status kanonik. "Disalurkan" adalah langkah
  // berikutnya yang paling sering diambil, jadi itu bawaannya untuk pinjaman
  // yang belum tersalurkan.
  const [statusTujuan, setStatusTujuan] = useState<StatusPinjaman>("didanai");
  const [nominal, setNominal] = useState("");
  // Konfirmasi khusus: pinjaman yang sudah berpindah dana (punya alokasi/jurnal)
  // hanya boleh dihapus bila admin menyatakannya sadar. Default mati.
  const [hapusMenyeluruh, setHapusMenyeluruh] = useState(false);
  const [pendana, setPendana] = useState<string>(PENDANA_TETAP);
  const [nominalPendana, setNominalPendana] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Galat penghapusan dipisah dari `error` supaya pesannya tampil TEPAT di
  // samping tombol Hapus dan centang "Hapus menyeluruh" — bukan jauh di bagian
  // atas dialog tempat admin tidak melihatnya setelah menggulir ke bawah.
  const [errorHapus, setErrorHapus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"detail" | "aliran" | "perjanjian">("detail");

  // Pratinjau pesan WhatsApp yang akan dikirim — admin melihat persis isinya
  // sebelum menekan tombol, termasuk kalimat persetujuan sebagian.
  const pratinjau = useQuery(
    api.whatsapp.previewStatusPinjaman,
    row === null ? ("skip" as const) : { loanId: row._id, alasan: "" },
  );
  // Kandidat pendana = semua akun yang pernah menjadi pendana. Hanya
  // admin (sesi TOTP) yang boleh membacanya, sama seperti server.
  const kandidatQ = useQuery(
    api.penyediaDana.kandidatPendana,
    row === null ? ("skip" as const) : {},
  );

  // Sasaran status & nominal menyesuaikan saat dialog dibuka untuk baris lain.
  //
  // Disesuaikan SAAT RENDER lewat `_id`, bukan lewat effect + identitas objek:
  // query reaktif Convex bisa mengirim objek baru untuk baris yang sama, dan
  // effect yang mengikuti identitas objek akan menghapus ketikan admin di
  // tengah proses review. Penyetelan saat render adalah pola React untuk
  // "menyesuaikan state ketika prop berubah" — tidak memicu render berantai.
  const idBaris: string | null = row?._id ?? null;
  const [idTerakhir, setIdTerakhir] = useState<string | null>(idBaris);
  if (idBaris !== idTerakhir) {
    setIdTerakhir(idBaris);
    setStatusTujuan(row?.status === "didanai" ? "lunas" : "didanai");
    setNominal("");
    setPendana(PENDANA_TETAP);
    setNominalPendana("");
    setHapusMenyeluruh(false);
    setError(null);
    setErrorHapus(null);
  }

  if (row === null) return null;
  // Nominal pengajuan asli — sama dengan pokokPinjaman kecuali admin menyetujui
  // sebagian. Dibaca toleran supaya baris lama tanpa field ini tetap aman.
  const pokokDiajukan =
    (row as { pokokDiajukan?: number }).pokokDiajukan ?? row.pokokPinjaman;
  const rowWithOptional = row as LoanRowWithOptionalProps;
  const q = quotePinjaman({
    pokokPinjaman: row.pokokPinjaman,
    persenBunga: rowWithOptional?.persenBunga ?? undefined,
  });
  // Pinjaman dianggap sudah berpindah dana bila statusnya berjalan/lunas atau
  // sudah ada pendana tercatat — di situlah alokasi dana & jurnal ledger
  // muncul, dan di situlah centang "Hapus menyeluruh" dibutuhkan.
  const sudahBerpindahDana =
    row.status === "didanai" || row.status === "lunas" || row.pendanaNama != null;


  const runDelete = async () => {
    // Konfirmasi tetap diminta supaya penghapusan tidak terjadi karena salah
    // tekan; catatan alasan tidak diminta lagi.
    if (
      !window.confirm(
        hapusMenyeluruh
          ? `Hapus MENYELURUH pinjaman ${row.nomorReferensi}? Alokasi dana, catatan transfer, dan bukti bayar ikut dihapus. Jurnal ledger tetap utuh sebagai riwayat. Audit Trail tetap tersimpan.`
          : `Hapus permanen pinjaman ${row.nomorReferensi}? Audit Trail tetap tersimpan. Data dengan transaksi terkait akan ditolak kecuali Anda mencentang "Hapus menyeluruh".`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setErrorHapus(null);
    try {
      await deleteLoan({
        loanId: row._id,
        ...(hapusMenyeluruh ? { bersihkanDana: true } : {}),
      });
      toast.success(
        hapusMenyeluruh
          ? "Pinjaman dan baris turunannya dihapus; jurnal ledger dipertahankan. Tercatat di Audit Trail."
          : "Data pinjaman dihapus dan tercatat di Audit Trail.",
      );
      onClose();
    } catch (err) {
      setErrorHapus(err instanceof Error ? err.message : "Gagal menghapus data pinjaman.");
    } finally {
      setBusy(null);
    }
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast.success("Perubahan status internal tersimpan pada ledger.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  const runPendana = async () => {
    const pokokBaru = nominalPendana.trim() === "" ? null : Number(nominalPendana);
    if (pokokBaru !== null && (!Number.isSafeInteger(pokokBaru) || pokokBaru <= 0)) {
      setError("Nominal yang disetujui harus rupiah bulat positif.");
      return;
    }
    setBusy("pendana");
    setError(null);
    try {
      const hasil = await simpanPendana({
        loanId: row._id,
        ...(pendana === PENDANA_TETAP
          ? {}
          : pendana === PENDANA_LEPAS
            ? { pendanaEmail: null }
            : { pendanaUserId: pendana as Id<"users"> }),
        ...(pokokBaru !== null && pokokBaru !== row.pokokPinjaman
          ? { pokokDisetujui: pokokBaru }
          : {}),
      });
      toast.success(
        hasil.perubahan.length === 0
          ? "Tidak ada perubahan pendana atau nominal."
          : `Tersimpan: ${hasil.perubahan.join(", ")}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pendana.");
    } finally {
      setBusy(null);
    }
  };

  const lokasi = row.lokasiAjukan;
  const petaHref = lokasi != null
    ? `https://www.openstreetmap.org/?mlat=${lokasi.lat}&mlon=${lokasi.lng}#map=16/${lokasi.lat}/${lokasi.lng}`
    : null;

  // ── Header (fixed) ──────────────────────────────────────────────────────
  const header = (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-emerald-50 font-bold tracking-tight">
            {row.pokokPinjaman.toString().slice(0, 2)}
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-slate-900 tabular-nums">
              Pokok pinjaman · {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              Catatan pengajuan internal · {row.nomorReferensi} · {formatDate(row._creationTime)}
            </DialogDescription>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {row.status !== "lunas" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-slate-500"
            onClick={onClose}
          >
            Tutup
          </Button>
        )}
        <StatusBadge status={row.status} kind="loan" />
      </div>
    </div>
  );

  // ── Tab 1: Detail & Dokumen ────────────────────────────────────────────
  const tabDetail = (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Kolom kiri: data diri + KYC */}
      <div className="space-y-4">
        <PanelDataDiriNasabah userId={row.userIdPeminjam} />
        <LoanKycPanel row={row} />
      </div>

      {/* Kolom kanan: koordinat + ringkasan detail */}
      <div className="space-y-4">
        {/* Koordinat perangkat */}
        {lokasi !== null && petaHref ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <MapPin className="size-4 text-primary" />
              Koordinat perangkat
            </p>
            <p className="mt-2 text-sm tabular-nums text-slate-700">
              {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · ±{Math.round(lokasi.akurasi)} m
            </p>
            <a
              href={petaHref}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <MapPin className="size-3.5" />
              Buka di peta
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <MapPin className="size-4 text-muted-foreground" />
              Koordinat perangkat
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Tidak ada (pengajuan sebelum fitur lokasi).
            </p>
          </div>
        )}

        <Separator />

        {/* Ringkasan detail peminjam */}
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Ringkasan pemohon
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Pemohon", namaHurufBesar(row.namaLengkap)],
              ["Email", row.emailPeminjam ?? "—"],
              ["Bank / e-wallet", row.namaBank ?? "Tidak dicatat (data lama)"],
              ["Rekening / akun", row.nomorRekening ?? "—"],
              ["Keperluan", loanPurposeLabel(row.tujuan)],
              [
                "Skema",
                row.tenorBulan !== null
                  ? `Bulanan — ${row.tenorBulan} bulan`
                  : `Harian — ${row.tenorHari ?? 30} hari`,
              ],
              ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,140px)_1fr] gap-1 sm:gap-3 sm:items-start">
                <dt className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm truncate">{label}</dt>
                <dd className="min-w-0 break-words text-right text-xs leading-5 text-slate-800 sm:text-sm truncate">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <EContractWidget kind="loan" loanId={row._id} />
      </div>
    </div>
  );

  // ── Tab 2: Aliran Uang & Pendana ───────────────────────────────────────
  const tabAliran = (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Kolom kiri: matriks aliran uang */}
      <div>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Nominal, tanggal acuan, alokasi, dan status lunas di panel ini mengikuti catatan ledger internal; perpindahan dana ditangani di luar aplikasi.
        </p>

        <AliranDanaPinjaman
          pokokPinjaman={row.pokokPinjaman}
          tenorBulan={row.tenorBulan}
          tenorHari={row.tenorHari}
          persenBunga={rowWithOptional.persenBunga}
          sudahLunas={row.status === "lunas"}
        />

        {/* Jadwal bayar (skema bulanan) atau ringkasan harian */}
        {row.tenorBulan !== null && row.tenorBulan === 3 && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Rincian bulanan (3 bulan)
            </p>
            <div className="mt-3 grid grid-cols-[1fr_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Cicilan per bulan</span>
              <span className="text-right font-semibold tabular-nums text-slate-800">
                {formatRupiah(row.cicilanPerBulan ?? 0)}
              </span>
              <span className="text-muted-foreground">Biaya admin (2%/cicilan)</span>
              <span className="text-right tabular-nums text-slate-800">
                {formatRupiah(row.biayaLayananTotal ?? 0)}
              </span>
            </div>
          </div>
        )}

        {/* Status jatuh tempo */}
        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`text-[11px] font-medium uppercase tracking-[0.16em] ${
                (row.hariTerlambat ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {(row.hariTerlambat ?? 0) > 0
                ? `Tanggal acuan terlewati ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Tanggal acuan hari ini"
                  : `Tanggal acuan dalam ${row.sisaHari} hari`}
            </p>
            <p className="mt-1 text-xs tabular-nums text-slate-700">
              Akumulasi terkaya (lunas) {formatRupiah(row.totalKewajibanDenganPenalti ?? row.totalKewajiban ?? 0)}
              {(row.dendaTerlambat ?? 0) > 0 && (
                <span className="tabular-nums text-destructive">
                  {" "}
                  · denda {formatRupiah(row.dendaTerlambat ?? 0)}
                </span>
              )}
            </p>
          </div>
        )}

        {row.status === "lunas" && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
            <p className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4" /> Pinjaman ini sudah <strong>lunas</strong>
            </p>
            <p className="mt-1 text-xs text-emerald-800">
              Status ditutup; perubahan tidak dapat diubah lagi.
            </p>
          </div>
        )}
      </div>

      {/* Kolom kanan: pendana & alokasi */}
      <div className="space-y-4">
        {row.status !== "lunas" && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Pendana & nominal disetujui
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Tetapkan pendana yang mendanai pinjaman ini sebelum menyetujui — namanya
              langsung tampil di ruang pendana dan tercatat di Audit Trail. Untuk pinjaman
              yang sudah disetujui, nominalnya juga dapat dikoreksi selama dana belum ditandai
              tersalurkan.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-700">
              <Users className="size-3.5 text-primary" />
              Pendana sekarang:{" "}
              <span className="font-medium">{row.pendanaNama ?? "belum ada"}</span>
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pendana-pinjaman" className="text-[11px] text-muted-foreground">
                  Pendana
                </Label>
                <Select value={pendana} onValueChange={setPendana}>
                  <SelectTrigger id="pendana-pinjaman">
                    <SelectValue placeholder="Tidak diubah" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PENDANA_TETAP}>Tidak diubah</SelectItem>
                    {(kandidatQ?.rows ?? []).map((r) => (
                      <SelectItem key={r.userId} value={r.userId}>
                        {r.nama}
                        {r.email ? ` — ${r.email}` : ""}
                        {r.aksesAktif ? "" : " (pendana lama)"}
                      </SelectItem>
                    ))}
                    <SelectItem value={PENDANA_LEPAS} disabled={nominalTerkunci(row.status)}>
                      Lepas pendana (tanpa pemilik dana)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {kandidatQ === undefined
                    ? "Memuat daftar pendana…"
                    : kandidatQ.rows.length === 0
                      ? "Belum ada akun yang pernah menjadi pendana. Beri akses di ruang pendana lebih dulu."
                      : "Daftar ini memuat semua akun yang pernah menjadi pendana, termasuk pendana lama."}
                </p>
              </div>

              {diTahapTinjauan(row.status) && !nominalTerkunci(row.status) && (
                <div>
                  <Label htmlFor="nominal-disetujui" className="text-[11px] text-muted-foreground">
                    Nominal disetujui (Rp)
                  </Label>
                  <Input
                    id="nominal-disetujui"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={50_000}
                    placeholder={`Tercatat: ${formatRupiah(row.pokokPinjaman)}`}
                    value={nominalPendana}
                    onChange={(e) => setNominalPendana(e.target.value)}
                    disabled={busy !== null}
                  />
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Koreksi nominal yang sudah disetujui — tidak boleh melebihi pengajuan{" "}
                    {formatRupiah(pokokDiajukan)}. Kosongkan bila tidak diubah.
                  </p>
                </div>
              )}
            </div>

            <Button disabled={busy !== null} onClick={() => void runPendana()} className="mt-3">
              {busy === "pendana" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {diTahapTinjauan(row.status) ? "Simpan pendana & nominal" : "Simpan pendana"}
            </Button>
          </section>
        )}
      </div>
    </div>
  );

  // ── Tab 3: Perjanjian & WhatsApp ───────────────────────────────────────
  const tabPerjanjian = (
    <div className="space-y-4">
      {/* Status dokumen perjanjian + ttd */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Status perjanjian
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Dokumen perjanjian</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Kontrak digital tersedia di ruang persetujuan. Admin dapat membuka widget kontrak
              dari panel ini untuk melihat isi dokumen yang disepakati.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "Tanda tangan peminjam", value: (row as { tandaTanganPeminjam?: string }).tandaTanganPeminjam ? "Ada" : "Belum ada", icon: FileCheck },
            { label: "Status persetujuan", value: (row as { persetujuanSyarat?: boolean }).persetujuanSyarat ? "Tersetujui" : "Belum", icon: ShieldCheck },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <item.icon className="size-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500">{item.label}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pratinjau WhatsApp */}
      {pratinjau !== undefined && pratinjau !== null && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <MessageCircle className="size-4" />
              Pratinjau pesan WhatsApp
            </p>
            {pratinjau.nomorWhatsApp === null && (
              <span className="text-xs font-medium text-amber-700">nomor belum ada di KYC</span>
            )}
          </div>
          <div className="mt-3 overflow-hidden rounded-xl bg-white p-3 text-xs leading-5 text-emerald-900 shadow-sm">
            <p className="whitespace-pre-line">{pratinjau.isi}</p>
          </div>
        </div>
      )}

      {/* Draft WhatsApp (admin bisa mengedit catatan sebelum dikirim) */}
      {row.status !== "lunas" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Draft pesan WhatsApp
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pesan yang dikirim otomatis ke peminjam sesuai status pinjaman. Admin dapat
            mengirim ulang jika diperlukan.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy !== null || pratinjau === undefined || pratinjau?.nomorWhatsApp === null}
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                run("wa", () =>
                  kirimStatus({ loanId: row._id, alasan: "", statusLama: row.status }),
                )
              }
            >
              {busy === "wa" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Kirim ulang WhatsApp
            </Button>
          </div>
        </div>
      )}

      {/* Widget kontrak */}
      <EContractWidget kind="loan" loanId={row._id} />
    </div>
  );

  // ── Footer aksi (sticky) ───────────────────────────────────────────────
  const footerAksi = (
    <div className="sticky bottom-0 z-10 flex flex-wrap gap-3 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur shadow-sm sm:px-5">
      {row.status === "lunas" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" />
          Pinjaman ini sudah lunas — tidak ada tindakan yang tersedia.
        </div>
      ) : (
        <>
          <Button
            disabled={busy !== null}
            onClick={() =>
              run("status", () =>
                ubahStatus({
                  loanId: row._id,
                  status: statusTujuan,
                  ...(statusTujuan !== "ditolak" && nominal.trim() !== ""
                    ? { pokokDisetujui: Number(nominal) }
                    : {}),
                }),
              )
            }
            className="flex-1 sm:flex-none"
          >
            {busy === "status" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Simpan status & kirim WA
          </Button>

          {row.status !== "didanai" && (
            <Button
              disabled={busy !== null}
              variant="outline"
              onClick={() => run("fund", () => fund({ loanId: row._id }))}
              className="flex-1 sm:flex-none"
            >
              {busy === "fund" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Tandai tersalurkan
            </Button>
          )}

          <div className="flex grow items-end justify-end gap-2 sm:gap-3">
            {/* Danger Zone */}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="destructive" disabled={busy !== null} onClick={runDelete} className="gap-1.5">
                {busy === "delete" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Hapus
              </Button>
              {sudahBerpindahDana && (
                <label className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/70 px-3 py-1.5 text-xs cursor-pointer hover:bg-red-100 transition-colors">
                  <Checkbox
                    id="hapus-menyeluruh-footer"
                    checked={hapusMenyeluruh}
                    onCheckedChange={(nilai) => setHapusMenyeluruh(nilai === true)}
                    className="shrink-0"
                  />
                  <span className="text-red-800 font-medium">Hapus menyeluruh</span>
                </label>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:p-0">
        <div className="flex flex-col gap-4">
          {/* Header fixed */}
          {header}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full justify-start rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <TabsTrigger value="detail" className="gap-2 text-sm">
                <FileText className="size-4" />
                Detail & Dokumen
              </TabsTrigger>
              <TabsTrigger value="aliran" className="gap-2 text-sm">
                <Wallet className="size-4" />
                Aliran Uang & Pendana
              </TabsTrigger>
              <TabsTrigger value="perjanjian" className="gap-2 text-sm">
                <FileCheck className="size-4" />
                Perjanjian & WhatsApp
              </TabsTrigger>
            </TabsList>

            <div className="min-h-0">
              <TabsContent value="detail" className="mt-4">
                {tabDetail}
              </TabsContent>
              <TabsContent value="aliran" className="mt-4">
                {tabAliran}
              </TabsContent>
              <TabsContent value="perjanjian" className="mt-4">
                {tabPerjanjian}
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer aksi sticky */}
          {footerAksi}
        </div>
      </DialogContent>
    </Dialog>
  );
}