import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2, Search, Send, ShoppingBag, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CatatPengajuanManualButton } from "@/components/admin/CatatPengajuanManual";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SkeletonTabel } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";

import { formatDate } from "./admin-format";
import { EmptyQueue } from "./admin-shared";

const STATUS_LABEL: Record<string, string> = {
  diajukan: "Diajukan",
  sedang_ditinjau: "Sedang ditinjau",
  disetujui: "Disetujui (status aplikasi)",
  ditolak: "Ditolak",
  didanai: "Target tercapai (ledger)",
  lunas: "Lunas (ledger)",
};

/**
 * Warna chip status kredit barang — mengikuti SATU sistem warna yang sama
 * dengan `components/StatusBadge`: hijau = berjalan/selesai, kuning = menunggu
 * tindakan, merah muda = ditolak, abu = di luar ketiganya.
 */
const KREDIT_KELAS: Record<string, string> = {
  didanai: "border-emerald-300 bg-emerald-100 text-emerald-800",
  lunas: "border-emerald-300 bg-emerald-100 text-emerald-800",
  disetujui: "border-emerald-300 bg-emerald-100 text-emerald-800",
  ditolak: "border-rose-300 bg-rose-100 text-rose-800",
  sedang_ditinjau: "border-amber-300 bg-amber-100 text-amber-800",
};

function KreditStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${
        KREDIT_KELAS[status] ?? "border-slate-300 bg-slate-100 text-slate-700"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * Verifikasi pengajuan Kredit Barang (Skema C) — admin menelaah barang,
 * merchant, harga, dan data pemohon, lalu menyetujui / menolak. Setiap
 * keputusan tercatat di audit trail (lihat convex/kredit.ts).
 */
export function KreditQueuePanel() {
  const rows = useQuery(api.kredit.antreanKreditBarang);
  const tandai = useMutation(api.kredit.tandaiKreditDitinjau);
  const setujui = useMutation(api.kredit.setujuiKreditBarang);
  const danai = useMutation(api.kredit.danaiKreditBarang);
  const tolak = useMutation(api.kredit.tolakKreditBarang);
  const hapus = useMutation(api.kredit.hapusKreditBarang);
  // Konfirmasi per baris untuk "hapus menyeluruh": kredit yang sudah berjalan
  // atau punya alokasi/cicilan/jurnal hanya boleh dihapus bila admin sadar.
  const [hapusMenyeluruh, setHapusMenyeluruh] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((row) =>
      [
        row.namaLengkap,
        row.emailPemohon ?? "",
        row.nomorReferensi,
        row.namaBarang,
        row.merchant,
        row.kategori,
        row.catatanPeminjam ?? "",
        row.catatanReview ?? "",
        row.nomorRekening,
        row.nik,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [rows, search]);

  if (rows === undefined) {
    // Rangka tabel: baris kepala + baris berisi. Tinggi barisnya tetap (`h-14`)
    // sehingga tabel sungguhan menggantikannya tanpa menggeser halaman.
    return <SkeletonTabel kolom={5} baris={5} keterangan="Memuat pengajuan kredit barang…" />;
  }

  const menunggu = filteredRows.filter((r) => r.status === "diajukan" || r.status === "sedang_ditinjau");
  // Riwayat = pengajuan yang sudah tidak menunggu keputusan.
  const selesai = filteredRows.filter(
    (r) => r.status !== "diajukan" && r.status !== "sedang_ditinjau",
  );

  const jalankan = async (
    id: Id<"kreditBarang">,
    aksi: "tinjau" | "setujui" | "danai" | "tolak",
  ) => {
    setBusy(id);
    try {
      if (aksi === "tinjau") {
        await tandai({ kreditId: id });
        toast.success("Pengajuan ditandai sedang ditinjau.");
      } else if (aksi === "setujui") {
        await setujui({ kreditId: id });
        toast.success("Status aplikasi kredit barang disetujui dan tercatat pada ledger.");
      } else if (aksi === "danai") {
        await danai({ kreditId: id });
        toast.success("Kredit barang ditandai berjalan pada ledger internal (dana tersalurkan).");
      } else {
        // Catatan penolakan opsional — keputusan tidak boleh tertahan kolom alasan.
        await tolak({ kreditId: id });
        toast.success("Pengajuan ditolak dan tercatat di audit trail.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal diproses.");
    } finally {
      setBusy(null);
    }
  };

  const jalankanHapus = async (id: Id<"kreditBarang">, reference: string) => {
    // Catatan alasan tidak diminta lagi; konfirmasi tetap ada.
    const menyeluruh = hapusMenyeluruh[id] === true;
    if (
      !window.confirm(
        menyeluruh
          ? `Hapus MENYELURUH kredit ${reference}? Alokasi dana dan cicilan yang tercatat ikut dihapus. Jurnal ledger tetap utuh sebagai riwayat. Audit Trail tetap tersimpan.`
          : `Hapus permanen kredit ${reference}? Audit Trail tetap tersimpan. Data dengan transaksi terkait akan ditolak kecuali Anda mencentang "Hapus menyeluruh".`,
      )
    ) {
      return;
    }
    setBusy(id);
    try {
      await hapus({ kreditId: id, ...(menyeluruh ? { bersihkanDana: true } : {}) });
      toast.success(
        menyeluruh
          ? "Kredit dan baris turunannya dihapus; jurnal ledger dipertahankan. Tercatat di Audit Trail."
          : "Data kredit dihapus dan tercatat di Audit Trail.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus data kredit.");
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {/* Pencatatan manual tetap tersedia walau antrean kosong: pengajuan
            yang diterima di luar aplikasi masuk lewat jalur ini. */}
        <div className="flex justify-end">
          <CatatPengajuanManualButton jenis="kredit" />
        </div>
        <EmptyQueue
          icon={ShoppingBag}
          title="Belum ada pengajuan kredit barang"
          deskripsi="Pengajuan kredit barang akan tampil di sini setelah nasabah mengajukan pembelian barang."
          poin={[
            "Barang, merchant, dan harga yang diajukan",
            "Hitungan cicilan serta DP aplikasi",
            "Alur persetujuan hingga pelunasan",
          ]}
        />
      </div>
    );
  }

  return (
    <div className="animate-masuk space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Cari pengajuan kredit barang"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama pemohon, email, referensi, barang, merchant, atau catatan…"
            className="pl-9"
          />
        </div>
        <CatatPengajuanManualButton jenis="kredit" />
      </div>
      {filteredRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          Tidak ada pengajuan yang cocok dengan pencarian.
        </p>
      ) : (
      <>
      <section>
        <h2 className="text-sm font-semibold">Menunggu keputusan ({menunggu.length})</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Tinjau data yang dimasukkan dan hitungan aplikasi. Persetujuan mencatat keputusan
          internal PINDAI pada ledger; pembelian barang dan pembayaran ke merchant ditangani di luar
          aplikasi. Status alokasi/pelunasan di riwayat mengikuti status ledger.
        </p>
        {menunggu.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center text-sm text-muted-foreground">
            Tidak ada pengajuan yang menunggu keputusan.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {menunggu.map((r) => (
              <li key={r._id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{namaHurufBesar(r.namaLengkap)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.emailPemohon ?? "tanpa email"} · {r.nomorReferensi} · {r.namaBarang} · {r.merchant} · {r.kategori} · {formatDate(r._creationTime)}
                    </p>
                  </div>
                  <KreditStatusBadge status={r.status} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
                  {(
                    [
                      ["Harga barang", formatRupiah(r.hargaBarang)],
                      ["Uang muka", r.dp !== null ? `${r.dpPersen}% · ${formatRupiah(r.dp)}` : `${r.dpPersen}%`],
                      [
                        "Pokok pembiayaan",
                        r.pokokDibiayai !== null ? formatRupiah(r.pokokDibiayai) : "—",
                      ],
                      [
                        "Biaya layanan platform",
                        r.biayaLayanan !== null ? formatRupiah(r.biayaLayanan) : "—",
                      ],
                      [
                        `Cicilan per bulan`,
                        r.cicilanPerBulan !== null
                          ? `${formatRupiah(r.cicilanPerBulan)} × ${r.tenorBulan} bln`
                          : `${r.tenorBulan} bln`,
                      ],
                      [
                        "Imbal hasil (estimasi)",
                        r.imbalHasilPlatform !== null
                          ? `${formatRupiah(r.imbalHasilPlatform)} (${r.marginPersenPerBulan}%/bln)`
                          : `${r.marginPersenPerBulan}%/bln`,
                      ],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold tabular-nums text-navy">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>
                    Pemohon: <span className="text-navy">{namaHurufBesar(r.namaLengkap)}</span>
                    {r.emailPemohon !== null && ` · ${r.emailPemohon}`}
                  </p>
                  <p>
                    NIK: <span className="tabular-nums text-navy">{r.nik}</span>
                  </p>
                  <p>
                    Rekening tujuan tercatat: <span className="tabular-nums text-navy">{r.nomorRekening}</span>
                  </p>
                  <p>
                    WhatsApp: <span className="tabular-nums text-navy">{r.nomorWhatsApp}</span>
                  </p>
                  {r.tautanBarang !== null && (
                    <p className="sm:col-span-2">
                      Produk:{" "}
                      <a
                        href={r.tautanBarang}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        buka di merchant
                      </a>
                    </p>
                  )}
                  {r.catatanPeminjam !== null && (
                    <p className="sm:col-span-2">Catatan pemohon: {r.catatanPeminjam}</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {r.status === "diajukan" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === r._id}
                      onClick={() => jalankan(r._id, "tinjau")}
                    >
                      <Send className="mr-1.5 size-4" /> Tandai ditinjau
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={busy === r._id}
                    onClick={() => jalankan(r._id, "setujui")}
                  >
                    <CheckCircle2 className="mr-1.5 size-4" /> Setujui
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === r._id}
                    onClick={() => jalankan(r._id, "tolak")}
                  >
                    <XCircle className="mr-1.5 size-4" /> Tolak
                  </Button>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
                    <Checkbox
                      checked={hapusMenyeluruh[r._id] === true}
                      onCheckedChange={(nilai) =>
                        setHapusMenyeluruh((current) => ({ ...current, [r._id]: nilai === true }))
                      }
                      aria-label={`Hapus menyeluruh ${r.nomorReferensi}`}
                    />
                    Hapus menyeluruh (alokasi/cicilan ikut dihapus)
                  </label>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === r._id}
                    onClick={() => void jalankanHapus(r._id, r.nomorReferensi)}
                  >
                    <Trash2 className="mr-1.5 size-4" />
                    {hapusMenyeluruh[r._id] === true ? "Hapus menyeluruh" : "Hapus data"}
                  </Button>
                  {busy === r._id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold">Riwayat keputusan ({selesai.length})</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Kredit yang belum berjalan dan tanpa alokasi/pembayaran/jurnal bisa dihapus langsung.
          Untuk yang sudah berjalan, centang <strong>Hapus menyeluruh</strong> — alokasi dan cicilan
          ikut dihapus, sedangkan jurnal ledger tetap utuh sebagai riwayat keuangan.
        </p>
        {selesai.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center text-sm text-muted-foreground">
            Belum ada keputusan untuk pengajuan kredit barang.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {selesai.map((r) => (
              <li
                key={r._id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {namaHurufBesar(r.namaLengkap)} — {r.namaBarang} (harga {formatRupiah(r.hargaBarang)})
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {r.nomorReferensi} · {r.emailPemohon ?? "tanpa email"} · {r.merchant} · tenor {r.tenorBulan} bulan
                    {r.status !== "disetujui" && ` · status cicilan ledger ${r.dibayarBulan}/${r.totalBulan}`}
                    {r.catatanReview !== null && ` · ${r.catatanReview}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <KreditStatusBadge status={r.status} />
                </div>
                <div className="mt-3 flex w-full flex-wrap items-center gap-2">
                  {r.status === "disetujui" && (
                    <Button
                      size="sm"
                      disabled={busy === r._id}
                      onClick={() => jalankan(r._id, "danai")}
                    >
                      <CheckCircle2 className="mr-1.5 size-4" /> Tandai dana tersalurkan
                    </Button>
                  )}
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
                    <Checkbox
                      checked={hapusMenyeluruh[r._id] === true}
                      onCheckedChange={(nilai) =>
                        setHapusMenyeluruh((current) => ({ ...current, [r._id]: nilai === true }))
                      }
                      aria-label={`Hapus menyeluruh ${r.nomorReferensi}`}
                    />
                    Hapus menyeluruh (alokasi/cicilan ikut dihapus)
                  </label>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === r._id}
                    onClick={() => void jalankanHapus(r._id, r.nomorReferensi)}
                  >
                    <Trash2 className="mr-1.5 size-4" />
                    {hapusMenyeluruh[r._id] === true ? "Hapus menyeluruh" : "Hapus data"}
                  </Button>
                  {busy === r._id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </div>

              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
    </div>
  );
}
