import { useQuery } from "convex/react";
import { MapPin } from "lucide-react";

import {
  BadgeKredit,
  BadgePseudonim,
  KeadaanKosong,
} from "@/pages/penyedia-dana/bagian-umum";
import { LABEL_SUMBER, labelUmur } from "@/pages/penyedia-dana/format";
import { Badge } from "@/components/ui/badge";
import { MemuatBaris } from "@/components/ui/loading";
import { PetaLokasiPeminjam } from "@/components/penyediaDana/PetaLokasiPeminjam";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/convex/_generated/api";

/**
 * Isi tab "Titik terakhir".
 *
 * Query peta tinggal di komponen ini supaya kegagalan membaca titik lokasi
 * hanya mengganti tab ini, bukan seluruh ruang pendana. Pemanggil membungkusnya
 * dengan `BatasBagian`.
 */
export function TabLokasi({
  namaTampil,
  hanyaReferensi,
  sekarang,
}: {
  namaTampil: (nama: string) => string;
  /** Non-admin hanya melihat nomor referensi, tanpa nama/kode peminjam. */
  hanyaReferensi: boolean;
  sekarang: number;
}) {
  const titik = useQuery(api.penyediaDana.titikPeminjam, {});

  if (titik === undefined) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground sm:py-24">
        <MemuatBaris teks="Memuat titik lokasi…" />
      </p>
    );
  }

  return (
    <>
      <div className="animate-masuk rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-primary/10 text-accent-foreground">
            <MapPin className="mr-1 size-3" /> {titik.jumlahTitik} titik terakhir
          </Badge>
          <Badge
            variant="outline"
            className="border-slate-200 text-muted-foreground"
          >
            {titik.tanpaTitik} peminjam belum pernah mengirim titik
          </Badge>
          {titik.terpotong && (
            <Badge
              variant="outline"
              className="border-slate-200 text-muted-foreground"
            >
              menampilkan {titik.batas} pengajuan terbaru per kategori
            </Badge>
          )}
        </div>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
          Peta ini memakai koordinat yang{" "}
          <strong>dilaporkan perangkat peminjam</strong>. Titik diperbarui
          otomatis selama dashboard peminjam terbuka (±60 detik); pelacakan saat
          aplikasi ditutup memerlukan aplikasi native, sehingga label umur di
          bawah selalu menunjukkan kapan titik terakhir benar-benar diterima.
        </p>
      </div>

      <PetaLokasiPeminjam
        rows={titik.rows}
        vault={titik.vault}
        namaTampil={namaTampil}
        hanyaReferensi={hanyaReferensi}
      />

      {titik.rows.length === 0 ? (
        <KeadaanKosong pesan="Belum ada titik lokasi yang terkirim dari perangkat peminjam. Titik muncul setelah peminjam membuka dashboard dengan GPS aktif." />
      ) : (
        <ul className="animate-masuk divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {[...titik.rows]
            .sort((a, b) => b.posisi.waktu - a.posisi.waktu)
            .map((r) => (
              <li
                key={r.userId}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        hanyaReferensi
                          ? "break-all font-mono text-sm font-semibold text-slate-900"
                          : "font-medium uppercase text-slate-900"
                      }
                    >
                      {hanyaReferensi
                        ? r.nomorReferensi
                        : namaTampil(r.namaLengkap)}
                    </span>
                    {!hanyaReferensi && (
                      <BadgePseudonim kode={r.kodePeminjam} />
                    )}
                    {r.posisi.tanda.length > 0 && (
                      <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                        pola koordinat ditandai
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    {!hanyaReferensi && (
                      <span className="font-mono text-xs text-slate-600">
                        {r.nomorReferensi}
                      </span>
                    )}
                    {r.kategori === "pinjaman" ? (
                      <StatusBadge status={r.status} kind="loan" />
                    ) : r.kategori === "gadai" ? (
                      <StatusBadge status={r.status} kind="pawn" />
                    ) : (
                      <BadgeKredit status={r.status} />
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                  <span className="block font-medium text-slate-700">
                    {labelUmur(r.posisi.waktu, sekarang)}
                  </span>
                  <span className="block font-mono tabular-nums">
                    {r.posisi.lat.toFixed(5)}, {r.posisi.lng.toFixed(5)}
                  </span>
                  <span className="block">
                    ± {Math.round(r.posisi.akurasi)} m ·{" "}
                    {LABEL_SUMBER[r.posisi.sumber] ?? r.posisi.sumber}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
