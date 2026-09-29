import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2, Search, Send, ShoppingBag, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

import { EmptyQueue, formatDate } from "./admin-shared";

const STATUS_LABEL: Record<string, string> = {
  diajukan: "Diajukan",
  sedang_ditinjau: "Sedang ditinjau",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  didanai: "Didanai",
  lunas: "Lunas",
};

function KreditStatusBadge({ status }: { status: string }) {
  if (status === "didanai") {
    return (
      <Badge className="gradient-primary border-0 text-primary-foreground">
        {STATUS_LABEL[status] ?? status}
      </Badge>
    );
  }
  if (status === "lunas") {
    return (
      <Badge className="border-primary/30 bg-primary/10 text-accent-foreground">
        {STATUS_LABEL[status] ?? status}
      </Badge>
    );
  }
  if (status === "disetujui") {
    return (
      <Badge className="border-primary/30 bg-primary/10 text-accent-foreground">
        {STATUS_LABEL[status] ?? status}
      </Badge>
    );
  }
  if (status === "ditolak") {
    return <Badge variant="destructive">{STATUS_LABEL[status] ?? status}</Badge>;
  }
  if (status === "sedang_ditinjau") {
    return (
      <Badge className="border-gold/40 bg-gold/15 text-gold-foreground">
        {STATUS_LABEL[status] ?? status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
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
  const tolak = useMutation(api.kredit.tolakKreditBarang);
  const [alasan, setAlasan] = useState<Record<string, string>>({});
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
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat pengajuan kredit barang…
      </div>
    );
  }

  const menunggu = filteredRows.filter((r) => r.status === "diajukan" || r.status === "sedang_ditinjau");
  // Riwayat = pengajuan yang sudah tidak menunggu keputusan.
  const selesai = filteredRows.filter(
    (r) => r.status !== "diajukan" && r.status !== "sedang_ditinjau",
  );

  const jalankan = async (
    id: Id<"kreditBarang">,
    aksi: "tinjau" | "setujui" | "tolak",
  ) => {
    setBusy(id);
    try {
      if (aksi === "tinjau") {
        await tandai({ kreditId: id });
        toast.success("Pengajuan ditandai sedang ditinjau.");
      } else if (aksi === "setujui") {
        await setujui({ kreditId: id });
        toast.success("Pengajuan kredit barang disetujui.");
      } else {
        const reason = (alasan[id] ?? "").trim();
        if (reason.length === 0) {
          toast.error("Isi alasan penolakan terlebih dahulu.");
          return;
        }
        await tolak({ kreditId: id, reason });
        toast.success("Pengajuan ditolak dan tercatat di audit trail.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aksi gagal diproses.");
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyQueue
        icon={ShoppingBag}
        title="Belum ada pengajuan kredit barang"
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Cari pengajuan kredit barang"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama pemohon, email, referensi, barang, merchant, atau catatan…"
          className="pl-9"
        />
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
          Tinjau pemohon, barang, tautan, harga, uang muka, dan tenor. Persetujuan hanya mencatat
          keputusan internal PINDAI; pembelian barang, pembayaran ke merchant, dan transfer dana
          tidak dijalankan atau diverifikasi oleh aplikasi.
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
                    <p className="text-sm font-semibold">{r.namaLengkap}</p>
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
                        "Pokok dibiayai",
                        r.pokokDibiayai !== null ? formatRupiah(r.pokokDibiayai) : "—",
                      ],
                      [
                        "Biaya layanan platform",
                        r.biayaLayanan !== null ? formatRupiah(r.biayaLayanan) : "—",
                      ],
                      [
                        `Cicilan / bulan`,
                        r.cicilanPerBulan !== null
                          ? `${formatRupiah(r.cicilanPerBulan)} × ${r.tenorBulan} bln`
                          : `${r.tenorBulan} bln`,
                      ],
                      [
                        "Imbal Hasil Pendana",
                        r.imbalHasilPendana !== null
                          ? `${formatRupiah(r.imbalHasilPendana)} (${r.marginPersenPerBulan}%/bln)`
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
                    Pemohon: <span className="text-navy">{r.namaLengkap}</span>
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
                  <Input
                    value={alasan[r._id] ?? ""}
                    onChange={(e) => setAlasan((m) => ({ ...m, [r._id]: e.target.value }))}
                    placeholder="Alasan penolakan (wajib saat menolak)"
                    className="w-full sm:w-72"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === r._id}
                    onClick={() => jalankan(r._id, "tolak")}
                  >
                    <XCircle className="mr-1.5 size-4" /> Tolak
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
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.namaLengkap} — {r.namaBarang} ({formatRupiah(r.hargaBarang)})
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {r.nomorReferensi} · {r.emailPemohon ?? "tanpa email"} · {r.merchant} · tenor {r.tenorBulan} bulan
                    {r.status !== "disetujui" && ` · cicilan ${r.dibayarBulan}/${r.totalBulan}`}
                    {r.catatanReview !== null && ` · ${r.catatanReview}`}
                  </p>
                </div>
                <KreditStatusBadge status={r.status} />
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
