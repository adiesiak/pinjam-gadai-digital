import { useQuery } from "convex/react";
import { ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import { CatatPengajuanManualButton } from "@/components/admin/CatatPengajuanManual";
import { SkeletonTabel } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";

import { EmptyQueue } from "./admin-shared";
import { barisKredit } from "./barisKredit";
import { KreditReviewDialog, type KreditRowData } from "./KreditReviewDialog";
import { PencarianCepat, TabelAntrean } from "./TabelAntrean";

/**
 * Verifikasi pengajuan Kredit Barang (Skema C).
 *
 * Daftar memakai tabel yang sama dengan antrean pinjaman & gadai: satu baris
 * satu pengajuan, nominal harga barang langsung terbaca, dan semua rincian
 * (DP, pokok dibiayai, cicilan, data pemohon) baru dibuka di panel review.
 * Sebelumnya setiap pengajuan menumpuk enam angka dan empat tombol di dalam
 * kartu — antrean beberapa baris saja sudah menghabiskan beberapa layar.
 */
export function KreditQueuePanel() {
  const rows = useQuery(api.kredit.antreanKreditBarang);
  const [search, setSearch] = useState("");
  const [dipilih, setDipilih] = useState<KreditRowData | null>(null);

  const filteredRows = useMemo(() => {
    const daftar = rows ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return daftar;
    return daftar.filter((row) =>
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

  const menunggu = filteredRows.filter(
    (r) => r.status === "diajukan" || r.status === "sedang_ditinjau",
  );
  // Riwayat = pengajuan yang sudah tidak menunggu keputusan.
  const selesai = filteredRows.filter(
    (r) => r.status !== "diajukan" && r.status !== "sedang_ditinjau",
  );

  return (
    <div className="animate-masuk space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PencarianCepat
          className="flex-1"
          value={search}
          onChange={setSearch}
          ariaLabel="Cari pengajuan kredit barang"
          placeholder="Cari nama, email, referensi, barang, merchant, atau kategori…"
        />
        <CatatPengajuanManualButton jenis="kredit" />
      </div>

      <p aria-live="polite" className="text-[11px] tabular-nums text-muted-foreground">
        Menampilkan {filteredRows.length} dari {rows.length} pengajuan
        {search.trim() !== "" ? " · filter pencarian aktif" : ""}
      </p>

      {filteredRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          Tidak ada pengajuan yang cocok dengan pencarian.
        </p>
      ) : (
        <>
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Menunggu keputusan</h2>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-800">
                {menunggu.length}
              </span>
            </div>
            <p className="text-[11px] leading-4 text-slate-500">
              Persetujuan mencatat keputusan internal pada ledger; pembelian ke merchant ditangani
              di luar aplikasi.
            </p>
            {menunggu.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center text-sm text-muted-foreground">
                Tidak ada pengajuan yang menunggu keputusan.
              </p>
            ) : (
              <TabelAntrean
                keterangan={`Kredit barang menunggu keputusan, ${menunggu.length} pengajuan`}
                judulNominal="Harga Barang"
                judulKeperluan="Barang & merchant"
                baris={menunggu.map((r) => barisKredit(r, setDipilih))}
              />
            )}
          </section>

          <section className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Riwayat keputusan</h2>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                {selesai.length}
              </span>
            </div>
            <p className="text-[11px] leading-4 text-slate-500">
              Status cicilan mengikuti ledger. Buka Detail untuk menandai pencairan atau menghapus
              data salah input.
            </p>
            {selesai.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center text-sm text-muted-foreground">
                Belum ada keputusan untuk pengajuan kredit barang.
              </p>
            ) : (
              <TabelAntrean
                keterangan={`Riwayat kredit barang, ${selesai.length} pengajuan`}
                judulNominal="Harga Barang"
                judulKeperluan="Barang & merchant"
                baris={selesai.map((r) => barisKredit(r, setDipilih))}
              />
            )}
          </section>
        </>
      )}

      <KreditReviewDialog row={dipilih} onClose={() => setDipilih(null)} />
    </div>
  );
}
