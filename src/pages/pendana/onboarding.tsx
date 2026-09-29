import { useMutation } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Eye,
  KeyRound,
  Landmark,
  Loader2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/** Kartu informasi untuk peran yang tidak dapat menjadi Pendana. */
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Coins className="mx-auto size-5 text-slate-400" />
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/dashboard">
          <ArrowLeft className="mr-2 size-4" />
          Kembali
        </Link>
      </Button>
    </div>
  );
}

/**
 * Isi panel kepercayaan — HARUS mencerminkan yang benar-benar diterapkan
 * platform. Setiap poin di bawah ini ada implementasinya di kode (server-side,
 * bukan klaim marketing): lihat convex/security.ts, convex/lokasi.ts,
 * convex/pendana.ts, dan ledger append-only di convex/schema.ts.
 */
const KEAMANAN = [
  {
    ikon: ShieldCheck,
    judul: "Batas saldo dan pendanaan",
    poin: [
      "Saldo, setoran, penarikan, dan alokasi adalah angka pada ledger simulasi PINDAI; aplikasi tidak memindahkan uang.",
      "Status setoran yang ditandai admin adalah status internal, bukan konfirmasi bank atau bukti dana masuk.",
      "Nilai pokok dan Imbal Hasil merupakan perhitungan simulasi, bukan pendapatan aktual atau hasil yang dijamin.",
    ],
  },
  {
    ikon: KeyRound,
    judul: "Aksi di aplikasi",
    poin: [
      "Tombol alokasi, setoran, penarikan, dan pelunasan memperbarui catatan internal; aksi tersebut bukan instruksi pembayaran atau transfer.",
      "Jika verifikasi kode ditampilkan, kode hanya terkait alur aplikasi dan bukan verifikasi pembayaran, identitas, atau ketersediaan dana.",
    ],
  },
  {
    ikon: MapPin,
    judul: "Data pengajuan dan lokasi",
    poin: [
      "Nama, NIK, rekening, alamat, tautan produk, dan catatan barang adalah informasi yang dimasukkan pengguna; PINDAI tidak menyatakan telah memverifikasinya secara eksternal.",
      "Titik peta yang tampil adalah referensi konfigurasi, bukan GPS live, lokasi gudang, atau bukti barang berada di tempat tertentu.",
    ],
  },
  {
    ikon: Eye,
    judul: "Catatan dan dokumen",
    poin: [
      "Status, rincian biaya, jadwal, dan perubahan pengajuan adalah catatan aplikasi, bukan bukti transaksi eksternal.",
      "Tampilan kontrak atau persetujuan elektronik di aplikasi tidak otomatis menjadi tanda tangan digital yang diverifikasi atau bukti pencairan.",
      "Simulasi Imbal Hasil bergantung pada angka masukan dan tidak menjamin pembayaran maupun pengembalian dana.",
    ],
  },
] as const;

/** Panel kepercayaan: apa yang PINDAI lakukan untuk melindungi Pendana. */
function PanelKepercayaan() {
  return (
    <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">
        Mengapa dana Anda aman di PINDAI
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Halaman ini menjelaskan dengan terbuka apa yang dicatat PINDAI dan batasnya: ini adalah simulasi ledger internal, bukan platform untuk menempatkan atau menarik dana.
      </p>
      <div className="mt-6 space-y-6">
        {KEAMANAN.map(({ ikon: Ikon, judul, poin }) => (
          <div key={judul}>
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Ikon className="size-4" /> {judul}
            </p>
            <ul className="mt-2 space-y-2">
              {poin.map((p) => (
                <li key={p} className="flex gap-2.5 text-sm leading-6">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span className="text-muted-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-muted-foreground">
        PINDAI tidak menerima, menyimpan, mengalokasikan, atau mengirim dana sungguhan. Tidak ada KYC/validasi identitas, verifikasi lokasi live, pengiriman barang, tanda tangan kontrak terverifikasi, atau pembayaran imbal hasil melalui fitur simulasi ini.
      </p>
    </section>
  );
}

/** Onboarding: ajakan menjadi Pendana. */
export function Onboarding() {
  const becomePendana = useMutation(api.pendana.becomePendana);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Landmark className="size-5" strokeWidth={2} />
        </span>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Peran Pendana
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Jelajahi ledger simulasi Pendana.</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Lihat contoh pencatatan alokasi, jadwal, dan perhitungan Imbal Hasil. Tidak ada dana sungguhan yang disetor atau dialokasikan, dan tidak ada pembayaran atau hasil investasi yang dijanjikan.
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            ["Saldo simulasi", "Angka dompet hanya catatan internal, bukan saldo bank atau uang yang dapat dicairkan."],
            ["Alokasi contoh", "Tombol alokasi mengubah ledger simulasi dan tidak mengirim uang kepada peminjam."],
            ["Tanpa pembayaran", "Tidak ada integrasi transfer, pembayaran, atau pencairan dana eksternal."],
          ].map(([t, b]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium">{t}</span>
                <span className="text-muted-foreground"> — {b}</span>
              </span>
            </li>
          ))}
        </ul>

        <Button
          className="mt-8 px-6"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
          await becomePendana({});
          toast.success("Mode Pendana simulasi aktif. Tidak ada dana sungguhan yang dipindahkan.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Gagal mengubah peran.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Buka mode simulasi
          <ArrowRight className="ml-1 size-4" />
        </Button>
      </div>

      <PanelKepercayaan />
    </div>
  );
}
