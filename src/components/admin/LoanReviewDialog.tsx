import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Send, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel, quotePinjaman } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  diTahapTinjauan,
  keStatusTersimpan,
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
  const q = quotePinjaman({
    pokokPinjaman: row.pokokPinjaman,
    persenBunga: row.persenBunga ?? undefined,
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Gerbang persetujuan dua kolom: viewer bukti di kiri, keputusan di
          kanan. Lebar `max-w-6xl` memberi ruang nyata untuk penampil dokumen
          ber-zoom tanpa membuat baris teks keputusan terlalu panjang. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-6xl sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="tabular-nums">
              Pokok pinjaman · {formatRupiah(row.pokokPinjaman)}
            </DialogTitle>
            <StatusBadge status={row.status} kind="loan" />
          </div>
          <DialogDescription className="tabular-nums">
            Catatan pengajuan internal · {row.nomorReferensi} · {formatDate(row._creationTime)}
          </DialogDescription>
        </DialogHeader>

        {/* ── SPLIT-SCREEN: kolom kiri = BUKTI (identitas + dokumen KTP/slip
               dengan zoom), kolom kanan = DETAIL & TOMBOL KEPUTUSAN. Peninjau
               mencocokkan dokumen dan menekan keputusan tanpa menggulir
               bolak-balik. Pada layar sempit kedua kolom menumpuk. ── */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            {/* Data diri acuan nasabah (diisi admin / disunting nasabah) —
                ditampilkan SEBELUM isian pengajuan agar peninjau bisa
                membandingkan keduanya. KTP di dalamnya bisa diperbesar. */}
            <PanelDataDiriNasabah userId={row.userIdPeminjam} />

            {/* KTP, selfie + KTP, dan slip gaji dalam penampil ber-zoom. */}
            <LoanKycPanel row={row} />
          </div>

          <div className="space-y-4">

        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          Nominal, tanggal acuan, alokasi, dan status lunas di panel ini mengikuti catatan ledger internal; perpindahan dana ditangani di luar aplikasi.
        </p>

        {/* Aliran uang pinjaman ini — angka dari mesin uang yang sama dengan
            akad dan ledger pelunasan, bukan hitungan tampilan. */}
        <AliranDanaPinjaman
          pokokPinjaman={row.pokokPinjaman}
          tenorBulan={row.tenorBulan}
          tenorHari={row.tenorHari}
          persenBunga={row.persenBunga}
          sudahLunas={row.status === "lunas"}
        />

        <EContractWidget kind="loan" loanId={row._id} />

        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {[
            ["Pemohon", namaHurufBesar(row.namaLengkap)],
            ["Email", row.emailPeminjam ?? "—"],
            ["Bank / e-wallet yang dicatat", row.namaBank ?? "Tidak dicatat (data lama)"],
            ["Rekening / akun yang dicatat", row.nomorRekening],
            ["Keperluan", loanPurposeLabel(row.tujuan)],
            [
              "Skema",
              row.tenorBulan !== null
                ? `Bulanan — ${row.tenorBulan} bulan`
                : `Harian — ${row.tenorHari ?? 30} hari`,
            ],
            ["Catatan pemohon", row.catatanPeminjam ?? "—"],
            ...(row.tenorBulan !== null
              ? ([
                  ["Uang muka (DP 0%)", formatRupiah(0)],
                  ["Pokok pinjaman (dasar hitungan)", formatRupiah(row.pokokPinjaman)],
                  [
                    `Biaya ${row.tenorBulan === 3 || row.tenorBulan === 6 ? "admin" : "layanan"} (2% dari pokok, dipotong di muka; platform dihapus)`,
                    formatRupiah(
                      row.biayaLayananTotal ??
                        Math.max(
                          0,
                          (row.totalKewajiban ?? 0) -
                            row.pokokPinjaman -
                            (row.imbalHasilTotal ?? 0),
                        ),
                    ),
                  ],
                  ["Bunga flat dari pokok penuh", formatRupiah(row.imbalHasilTotal ?? 0)],
                  ["Cicilan per bulan (ilustrasi)", formatRupiah(row.cicilanPerBulan ?? 0)],
                  ["Total pengembalian", formatRupiah(row.totalKewajiban ?? 0)],
                ] as Array<[string, string]>)
              : ([
                  ["Biaya admin (2%)", formatRupiah(q.biayaAdmin)],
                  ["Biaya platform (0% — dihapus)", formatRupiah(q.biayaPlatform)],
                  ["Nilai bersih (98% dari pokok)", formatRupiah(q.danaBersihDitransfer)],
                  ["Bunga (30%)", formatRupiah(q.bunga)],
                  ["Total kewajiban (130%)", formatRupiah(q.totalKewajibanPelunasan)],
                ] as Array<[string, string]>)),
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 px-3 py-3 sm:gap-4 sm:px-4">
              <dt className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm">{label}</dt>
              <dd className="min-w-0 break-words text-right text-xs leading-5 sm:text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        {row.status === "didanai" && row.jatuhTempoPada !== null && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              (row.hariTerlambat ?? 0) > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-slate-200 bg-slate-50"
            }`}
          >
            <p
              className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
                (row.hariTerlambat ?? 0) > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {(row.hariTerlambat ?? 0) > 0
                ? `Tanggal acuan terlewati ${row.hariTerlambat} hari`
                : (row.sisaHari ?? 0) === 0
                  ? "Tanggal acuan hari ini"
                  : `Tanggal acuan dalam ${row.sisaHari} hari`}
            </p>
            <p className="mt-1 text-sm">
              Tanggal acuan {formatDate(row.jatuhTempoPada)} · total dengan denda{" "}
              <span className="font-semibold tabular-nums">
                {formatRupiah(row.totalKewajibanDenganPenalti ?? 0)}
              </span>
              {(row.dendaTerlambat ?? 0) > 0 && (
                <span className="tabular-nums text-destructive">
                  {" "}
                  (denda {formatRupiah(row.dendaTerlambat ?? 0)})
                </span>
              )}
            </p>
          </div>
        )}

        {row.status === "lunas" ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Pinjaman ini sudah <strong>lunas</strong> — posisinya ditutup dan statusnya tidak dapat
            diubah lagi.
          </p>
        ) : (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Ubah status pinjaman
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Perubahan status hanya mengubah catatan internal — tidak ada uang yang berpindah.
                Peminjam otomatis menerima kabar lewat WhatsApp berisi status dan catatan di bawah
                (kolom catatan boleh dikosongkan).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="status-tujuan" className="text-[11px] text-muted-foreground">
                  Status baru
                </Label>
                <Select
                  value={statusTujuan}
                  onValueChange={(v) => setStatusTujuan(v as StatusPinjaman)}
                >
                  <SelectTrigger id="status-tujuan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_PINJAMAN.filter(
                      (s) => keStatusTersimpan(s) !== row.status,
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {LABEL_STATUS_PINJAMAN[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {statusTujuan !== "ditolak" && !nominalTerkunci(row.status) && (
                <div>
                  <Label htmlFor="pokok-disetujui" className="text-[11px] text-muted-foreground">
                    Nominal disetujui (Rp)
                  </Label>
                  <Input
                    id="pokok-disetujui"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={pokokDiajukan}
                    step={50_000}
                    placeholder={`Penuh: ${formatRupiah(pokokDiajukan)}`}
                    value={nominal}
                    onChange={(e) => setNominal(e.target.value)}
                    disabled={busy !== null}
                  />
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    Boleh lebih kecil dari pengajuan ({formatRupiah(pokokDiajukan)}), tidak boleh
                    lebih besar. Kosongkan untuk menyetujui penuh.
                  </p>
                </div>
              )}
            </div>

            {pratinjau !== undefined && pratinjau !== null && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-900">
                  <Send className="size-3" aria-hidden /> Pratinjau WhatsApp
                  {pratinjau.nomorWhatsApp === null && " — nomor belum ada di KYC"}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-emerald-900">{pratinjau.isi}</p>
              </div>
            )}

            {error && (
              <p
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
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
              >
                {busy === "status" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Simpan status & kirim WhatsApp
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={busy !== null || pratinjau === undefined || pratinjau?.nomorWhatsApp === null}
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
          </section>
        )}

        {row.status !== "lunas" && (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Pendana & nominal disetujui
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Tetapkan pendana yang mendanai pinjaman ini sebelum menyetujui — namanya
                langsung tampil di ruang pendana dan tercatat di Audit Trail. Untuk pinjaman
                yang sudah disetujui, nominalnya juga dapat dikoreksi selama dana belum ditandai
                tersalurkan.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pendana sekarang:{" "}
                <span className="font-medium text-slate-700">
                  {row.pendanaNama ?? "belum ada"}
                </span>
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
                    : (kandidatQ.rows.length === 0)
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

            <Button disabled={busy !== null} onClick={() => void runPendana()}>
              {busy === "pendana" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {diTahapTinjauan(row.status) ? "Simpan pendana & nominal" : "Simpan pendana"}
            </Button>
          </section>
        )}

        {diTahapTinjauan(row.status) && (
          <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs leading-5 text-emerald-900">
              Tandai dana tersalurkan agar tanggal acuan dan jadwal pelunasan aktif pada ledger internal. Pencairan/transfer tetap ditangani di luar aplikasi.
            </p>
            <Button
              disabled={busy !== null}
              onClick={() => run("fund", () => fund({ loanId: row._id }))}
            >
              {busy === "fund" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Tandai dana tersalurkan (ledger internal)
            </Button>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-700">
            Hapus data salah input — penghapusan tetap tercatat di Audit Trail.
          </p>
          {/* Centang konfirmasi SELALU tersedia — bukan hanya saat baris sudah
              tampak berpindah dana. Penghapusan bisa ditolak server karena
              alokasi/jurnal yang tidak terbaca dari baris ringkas ini, dan admin
              harus tetap punya jalan keluar di tempat yang sama dengan tombol
              hapus (bukan menggulir mencari opsi yang tersembunyi). */}
          <div
            className={
              sudahBerpindahDana
                ? "flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                : "flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            }
          >
            <Checkbox
              id="hapus-menyeluruh"
              checked={hapusMenyeluruh}
              onCheckedChange={(nilai) => setHapusMenyeluruh(nilai === true)}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <Label
                htmlFor="hapus-menyeluruh"
                className={
                  sudahBerpindahDana
                    ? "text-xs font-semibold text-red-900"
                    : "text-xs font-semibold text-slate-900"
                }
              >
                Hapus menyeluruh (pinjaman sudah berpindah dana)
              </Label>
              <p
                className={
                  sudahBerpindahDana
                    ? "mt-1 text-[11px] leading-5 text-red-800"
                    : "mt-1 text-[11px] leading-5 text-muted-foreground"
                }
              >
                {sudahBerpindahDana
                  ? "Pinjaman ini sudah berpindah dana (punya alokasi dana dan/atau jurnal ledger). "
                  : "Butuh hanya bila server menolak dengan pesan \"memiliki alokasi atau jurnal\". "}
                Dengan centang ini, alokasi dana, catatan transfer, dan bukti bayar ikut
                dihapus, sedangkan jurnal ledger <strong>tetap utuh</strong> sebagai riwayat
                keuangan. Tanpa centang, penghapusan ditolak server.
              </p>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Pengajuan yang belum berpindah dana — termasuk yang sudah disetujui — dapat
            dihapus. Penghapusan ditolak bila pinjaman sudah punya alokasi dana atau jurnal
            ledger, kecuali Anda mencentang <strong>Hapus menyeluruh</strong>. Catatan Audit Trail
            tetap disimpan.
          </p>
          {errorHapus && (
            <p
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorHapus}
            </p>
          )}
          <Button variant="destructive" disabled={busy !== null} onClick={() => void runDelete()}>
            {busy === "delete" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
            {hapusMenyeluruh ? "Hapus pinjaman & alokasi dana" : "Hapus pinjaman"}
          </Button>
        </div>

            {row.catatanReview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan keputusan</p>
                <p className="mt-1 text-sm">{row.catatanReview}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
