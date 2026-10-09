import { useMutation, useQuery } from "convex/react";
import { FileUp, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BilahProgres, BilahTakTentu, SkeletonBarisDaftar } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKirimSekali } from "@/hooks/use-cegah-tinggalkan";
import { progresPersen, type TahapForm } from "@/lib/formInteraksi";
import { formatRupiah } from "@/lib/money";
import { unggahDokumen, type ProgresUnggah } from "@/lib/unggahDokumen";

/** Tanggal hari ini (YYYY-MM-DD) untuk nilai awal form — dihitung sekali saat
 * modul dimuat supaya render tetap murni (bebas `Date.now()` saat render). */
const HARI_INI = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10);

/** Batas & tipe berkas bukti — SAMA dengan yang diterima pemeriksa server. */
const BATAS_BUKTI_BYTES = 5_000_000;
const TIPE_BUKTI = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type GalatIsian = Partial<Record<"jumlah" | "referensi" | "berkas", string>>;

/**
 * Kirim bukti pembayaran untuk pencocokan manual.
 *
 * Interaksi yang dijaga di sini (pola yang sama dipakai formulir lain):
 *
 * - **Galat tampil di bawah isian yang salah**, bukan hanya sebagai toast yang
 *   hilang sendiri; aturan angkanya tidak berubah sedikit pun.
 * - **Tahap dibedakan**: mengunggah berkas, lalu mencatat antreannya ke server.
 *   Dua pekerjaan dengan lama berbeda tidak lagi ditutup satu kata "mengirim…".
 * - **Persen unggahan dari byte nyata** (`unggahDokumen` + `BilahProgres`); bila
 *   total byte tidak diketahui, bilahnya tak tentu — bukan persen karangan.
 * - **Tidak bisa terkirim dua kali** (klik ganda/Enter berulang) sebelum
 *   pemanggilan pertama selesai.
 * - **Isian tidak dibersihkan saat gagal**: nominal, metode, tanggal, referensi,
 *   dan berkas yang dipilih tetap ada supaya bisa dikirim ulang tanpa mengetik
 *   ulang. Baru setelah SERVER mengonfirmasi, referensi & berkas dikosongkan.
 */
export function ManualPaymentEvidenceForm({
  jenis,
  targetId,
  reference,
  suggestedAmount,
}: {
  jenis: "pinjaman" | "kredit_barang" | "gadai";
  targetId: Id<"loans"> | Id<"kreditBarang"> | Id<"pawns">;
  reference: string;
  suggestedAmount: number;
}) {
  const instructions = useQuery(api.system.getPaymentInstructions);
  const generateUploadUrl = useMutation(api.loans.generatePaymentReceiptUploadUrl);
  const submit = useMutation(api.loans.submitManualPaymentReceipt);
  const [amount, setAmount] = useState(String(Math.max(1, Math.round(suggestedAmount))));
  const [method, setMethod] = useState<"transfer" | "qris">("transfer");
  const [transferDate, setTransferDate] = useState(HARI_INI);
  const [bankReference, setBankReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // Tahap proses dipisah supaya pengguna tahu di bagian mana pekerjaannya
  // berada: mengunggah berkas, atau mencatat buktinya.
  const [tahap, setTahap] = useState<TahapForm>("diam");
  const [progres, setProgres] = useState<ProgresUnggah | null>(null);
  const [galatIsian, setGalatIsian] = useState<GalatIsian>({});
  const [galatKirim, setGalatKirim] = useState<string | null>(null);
  const kirimSekali = useKirimSekali();
  const busy = tahap !== "diam";

  const bukaKunci = kirimSekali.buka;
  useEffect(() => {
    if (!busy) bukaKunci();
  }, [busy, bukaKunci]);

  /** Periksa isian dengan aturan yang sama seperti sebelumnya (tanpa perubahan). */
  const periksaIsian = (): GalatIsian => {
    const galat: GalatIsian = {};
    const rupiah = Number(amount);
    if (!Number.isSafeInteger(rupiah) || rupiah <= 0) {
      galat.jumlah = "Nominal harus rupiah bulat positif.";
    }
    if (bankReference.trim().length < 4) {
      galat.referensi = "Referensi bank wajib diisi (minimal 4 karakter).";
    }
    if (file === null) {
      galat.berkas = "Bukti unggahan wajib dipilih.";
    } else if (file.size > BATAS_BUKTI_BYTES || !TIPE_BUKTI.includes(file.type)) {
      galat.berkas = "Bukti harus JPG, PNG, WebP, atau PDF maksimal 5 MB.";
    }
    return galat;
  };

  const kirim = async () => {
    const galat = periksaIsian();
    setGalatIsian(galat);
    setGalatKirim(null);
    if (Object.keys(galat).length > 0 || file === null) return;
    if (!kirimSekali.kunci()) return;

    const rupiah = Number(amount);
    setTahap("mengunggah");
    setProgres(null);
    try {
      // Unggahan lewat helper bersama: batas ukuran, status HTTP, dan pesan
      // galatnya sama dengan unggahan dokumen lain.
      const buktiPembayaranId = await unggahDokumen(
        file,
        generateUploadUrl,
        "Bukti pembayaran",
        undefined,
        (p) => setProgres(p),
      );
      setTahap("mengirim");
      setProgres(null);
      const target =
        jenis === "pinjaman"
          ? { loanId: targetId as Id<"loans"> }
          : jenis === "kredit_barang"
            ? { kreditId: targetId as Id<"kreditBarang"> }
            : { pawnId: targetId as Id<"pawns"> };
      // "Berhasil" hanya setelah SERVER menjawab dengan nomor referensinya.
      const saved = await submit({
        jenis,
        ...target,
        jumlah: rupiah,
        metodePembayaran: method,
        tanggalTransfer: new Date(`${transferDate}T00:00:00`).getTime(),
        referensiTransfer: bankReference,
        buktiPembayaranId,
      });
      toast.success(`Bukti ${saved.nomorReferensi} masuk antrean pencocokan manual.`);
      setBankReference("");
      setFile(null);
    } catch (error) {
      // Isian SENGAJA tidak dibersihkan: kegagalan harus bisa dicoba ulang.
      setGalatKirim(
        error instanceof Error ? error.message : "Bukti pembayaran gagal dikirim.",
      );
    } finally {
      setTahap("diam");
      setProgres(null);
    }
  };

  const persen =
    tahap === "mengunggah" && progres !== null
      ? progresPersen(progres.dimuat, progres.total)
      : null;

  const labelTahap =
    tahap === "mengunggah"
      ? "Mengunggah bukti… jangan tutup halaman ini."
      : tahap === "mengirim"
        ? "Mencatat bukti ke antrean pencocokan…"
        : "";
  // Label tombol memakai kalimat pendek: bilah di atasnya sudah menjelaskan
  // tahapnya secara lengkap, jadi tombol tidak perlu mengulang peringatannya.
  const labelTombol =
    tahap === "mengunggah" ? "Mengunggah…" : tahap === "mengirim" ? "Mencatat…" : "Kirim bukti saja";

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold">Kirim bukti untuk pencocokan manual</h4>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Referensi {reference}. Pengiriman dan pencocokan bukti tidak mencatat cicilan, mengubah status, atau memengaruhi ledger. Pastikan instruksi penerima dengan kanal resmi sebelum transfer.</p>
      {instructions && (
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2">
          <div><p className="font-medium">Transfer bank (instruksi)</p><p className="mt-1">{instructions.namaBank} · {instructions.nomorRekening}</p><p>{instructions.namaRekening}</p></div>
          <div><p className="font-medium">QRIS · {instructions.namaMerchantQris}</p>{instructions.qrisUrl ? <img src={instructions.qrisUrl} alt={`QRIS ${instructions.namaMerchantQris}`} className="mt-2 max-h-36 max-w-full object-contain" /> : <p className="mt-1 text-muted-foreground">Gambar QRIS belum diunggah admin.</p>}</div>
        </div>
      )}
      <form
        aria-busy={busy || undefined}
        className="mt-3 grid gap-3 sm:grid-cols-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void kirim();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`receipt-amount-${targetId}`}>Nominal yang diklaim</Label>
          <Input
            id={`receipt-amount-${targetId}`}
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={galatIsian.jumlah !== undefined}
            aria-describedby={galatIsian.jumlah !== undefined ? `receipt-amount-galat-${targetId}` : undefined}
            disabled={busy}
          />
          {galatIsian.jumlah !== undefined && (
            <p id={`receipt-amount-galat-${targetId}`} role="alert" className="text-[11px] font-medium text-destructive">
              {galatIsian.jumlah}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`receipt-method-${targetId}`}>Metode</Label>
          <select id={`receipt-method-${targetId}`} className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm disabled:opacity-50" value={method} onChange={(e) => setMethod(e.target.value as "transfer" | "qris")} disabled={busy}><option value="transfer">Transfer bank</option><option value="qris" disabled={!instructions?.qrisUrl}>{instructions?.qrisUrl ? "QRIS" : "QRIS (belum tersedia)"}</option></select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`receipt-date-${targetId}`}>Tanggal transfer</Label>
          <Input id={`receipt-date-${targetId}`} type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} disabled={busy} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`receipt-reference-${targetId}`}>Referensi transfer</Label>
          <Input
            id={`receipt-reference-${targetId}`}
            value={bankReference}
            onChange={(e) => setBankReference(e.target.value)}
            maxLength={120}
            placeholder="Nomor referensi dari aplikasi bank"
            aria-invalid={galatIsian.referensi !== undefined}
            aria-describedby={galatIsian.referensi !== undefined ? `receipt-reference-galat-${targetId}` : undefined}
            disabled={busy}
          />
          {galatIsian.referensi !== undefined && (
            <p id={`receipt-reference-galat-${targetId}`} role="alert" className="text-[11px] font-medium text-destructive">
              {galatIsian.referensi}
            </p>
          )}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`receipt-file-${targetId}`}>Bukti unggahan (maks. 5 MB)</Label>
          <Input
            id={`receipt-file-${targetId}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-invalid={galatIsian.berkas !== undefined}
            aria-describedby={galatIsian.berkas !== undefined ? `receipt-file-galat-${targetId}` : undefined}
            disabled={busy}
          />
          {galatIsian.berkas !== undefined && (
            <p id={`receipt-file-galat-${targetId}`} role="alert" className="text-[11px] font-medium text-destructive">
              {galatIsian.berkas}
            </p>
          )}
        </div>
        {busy && (
          <div className="sm:col-span-2">
            {tahap === "mengunggah" ? (
              <BilahProgres nilai={persen} label={labelTahap} />
            ) : (
              <BilahTakTentu label={labelTahap} />
            )}
          </div>
        )}
        {galatKirim !== null && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive sm:col-span-2">
            {galatKirim} Isian Anda tetap ada — perbaiki bila perlu lalu kirim ulang.
          </p>
        )}
        <Button type="submit" size="sm" disabled={busy} className="gap-2 sm:col-span-2">{busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}{labelTombol}</Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">Jumlah contoh {formatRupiah(suggestedAmount)} · pencocokan dilakukan manual oleh tim PINDAI.</p>
    </section>
  );
}

export function ManualPaymentEvidenceHistory() {
  const rows = useQuery(api.loans.myManualPaymentReceipts);
  // Pemuatan pertama dibedakan dari "tidak ada riwayat": sebelumnya keduanya
  // sama-sama tidak menampilkan apa pun, sehingga pengguna tidak pernah tahu
  // apakah daftarnya masih dimuat atau memang kosong.
  if (rows === undefined) {
    return <SkeletonBarisDaftar baris={2} className="mt-6" />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Riwayat bukti pembayaran yang dikirim</h3>
      <ul className="mt-2 divide-y divide-slate-100">
        {rows.map((row) => <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span>{row.nomorReferensi} · {formatRupiah(row.jumlah)} · {row.jenis}</span><span className="text-muted-foreground">{row.status === "dicocokkan" ? "Mutasi dicocokkan — saldo tidak berubah" : row.status === "ditolak" ? `Ditolak${row.catatanAdmin ? `: ${row.catatanAdmin}` : ""}` : "Menunggu pencocokan"}</span></li>)}
      </ul>
    </section>
  );
}
