import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  ExternalLink,
  FileUp,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { KonfirmasiAksi } from "@/components/admin/KonfirmasiAksi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  BATAS_PENDANA,
  JUMLAH_FAQ,
  JUMLAH_ISI_PROPOSAL,
  JUMLAH_PRINSIP,
  JUMLAH_RISIKO,
  KONTEN_PENDANA_DEFAULT,
  TOKEN_PENDANA,
  type KontenPendana,
} from "@/lib/kontenPendana";
import { PROPOSAL_DIPERBARUI_PADA } from "@/lib/proposalPendana";
import { unggahDokumen } from "@/lib/unggahDokumen";

/**
 * Editor halaman `/jadi-pendana` dan proposal PDF-nya.
 *
 * Dua pekerjaan di satu tempat karena keduanya milik halaman yang sama:
 * tulisan yang dibaca calon pendana, dan berkas proposal yang mereka unduh.
 *
 * Yang tidak bisa diubah di sini: angka pembagian, tarif, rute, dan tombol.
 * Angka dihitung `lib/imbalPendana` dari Pengaturan Parameter Bisnis, jadi
 * mengubah kalimat tidak bisa mengubah perhitungan yang dicatat server. Teks
 * boleh memuat token (`{imbal}`, `{biaya}`, dan seterusnya) yang diisi saat
 * halaman dirender, supaya tarif baru tidak meninggalkan angka lama.
 *
 * Semua perubahan teks ditahan di `draft` sampai admin menekan Simpan.
 * Unggahan proposal langsung tersimpan karena berkasnya harus diunggah lebih
 * dulu; statusnya ditampilkan jujur di kotak proposal.
 */
export function KontenPendanaPanel() {
  const publik = useQuery(api.announcements.getPendana);
  const baris = useQuery(api.announcements.getCmsRow);
  const simpan = useMutation(api.announcements.simpanKontenPendana);
  const mintaUrl = useMutation(api.announcements.generateUploadProposalUrl);
  const pasang = useAction(api.announcements.pasangProposal);
  const hapus = useMutation(api.announcements.hapusProposal);

  const [draft, setDraft] = useState<KontenPendana | null>(null);
  const [busy, setBusy] = useState(false);
  const [unggah, setUnggah] = useState(false);
  const [hapusBusy, setHapusBusy] = useState(false);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);

  if (publik === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat konten halaman pendana…
      </div>
    );
  }

  const nilai = draft ?? publik;
  const kotor = draft !== null;
  const berkas = baris?.pendana;

  const ubah = <K extends keyof KontenPendana>(
    key: K,
    value: KontenPendana[K],
  ) => setDraft({ ...nilai, [key]: value });

  const ubahPrinsip = (index: number, key: "judul" | "isi", value: string) =>
    ubah(
      "prinsip",
      nilai.prinsip.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );

  const ubahRisiko = (index: number, key: "judul" | "isi", value: string) =>
    ubah(
      "risiko",
      nilai.risiko.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );

  const ubahFaq = (index: number, key: "tanya" | "jawab", value: string) =>
    ubah(
      "faq",
      nilai.faq.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );

  const ubahIsiProposal = (index: number, value: string) =>
    ubah(
      "proposalIsi",
      nilai.proposalIsi.map((item, i) => (i === index ? value : item)),
    );

  const simpanTeks = async () => {
    if (draft === null) return;
    setBusy(true);
    try {
      // Kirim objek utuh: server memotong panjang dan mengosongkan field yang
      // memang dikosongkan admin, lalu pembacaan melengkapinya dengan bawaan.
      await simpan({
        pendana: {
          ...draft,
          prinsip: draft.prinsip.map((item) => ({ ...item })),
          risiko: draft.risiko.map((item) => ({ ...item })),
          faq: draft.faq.map((item) => ({ ...item })),
          proposalIsi: [...draft.proposalIsi],
        },
      });
      setDraft(null);
      toast.success("Konten halaman pendana tersimpan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const unggahProposal = async (file: File | undefined) => {
    if (file === undefined) return;
    if (file.type !== "application/pdf") {
      toast.error("Proposal harus berupa berkas PDF.");
      return;
    }
    setUnggah(true);
    try {
      const id = await unggahDokumen(file, () => mintaUrl({}), "Proposal");
      await pasang({ berkasId: id, namaBerkas: file.name });
      toast.success("Proposal diganti. Tombol unduh memakai berkas ini.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Berkas gagal diunggah.");
    } finally {
      setUnggah(false);
    }
  };

  const hapusProposal = async () => {
    setHapusBusy(true);
    try {
      await hapus({});
      toast.success("Unduhan kembali ke proposal yang disusun aplikasi.");
      setKonfirmasiHapus(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus berkas.");
    } finally {
      setHapusBusy(false);
    }
  };

  const muatBawaan = () => {
    setDraft(KONTEN_PENDANA_DEFAULT);
    toast.info(
      "Teks bawaan dimuat ke formulir. Tekan Simpan untuk menerapkannya.",
    );
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Halaman Pendana &amp; Proposal
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Teks halaman{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              /jadi-pendana
            </code>{" "}
            dan berkas proposal yang diunduh dari halaman itu.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <a href="/jadi-pendana" target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 size-3.5" />
            Lihat halaman
          </a>
        </Button>
      </div>

      <section className="space-y-3 rounded-xl border border-[#c9a86a]/50 bg-[#fbf7ec]/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-navy">
              Berkas proposal PDF
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {berkas?.berkasId === undefined
                ? "Belum ada berkas. Tombol unduh menyusun proposal dari kebijakan yang berlaku saat ditekan."
                : `Berkas aktif: ${berkas.berkasNama ?? "proposal-pendanaan-pindai.pdf"}${
                    berkas.berkasPada === undefined
                      ? ""
                      : ` · dipasang ${new Date(berkas.berkasPada).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                  }.`}
            </p>
            {berkas?.berkasId !== undefined &&
              (berkas.berkasPada ?? 0) < PROPOSAL_DIPERBARUI_PADA && (
                <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-800">
                  Berkas ini dipasang sebelum pembaruan proposal, jadi halaman
                  memakai dokumen terbaru sampai berkas diganti atau dihapus.
                </p>
              )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 transition-colors hover:border-primary hover:text-primary ${
                unggah ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {unggah ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileUp className="size-4" aria-hidden />
              )}
              {unggah ? "Mengunggah" : berkas?.berkasId === undefined ? "Unggah proposal" : "Ganti proposal"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={unggah}
                onChange={(event) => {
                  void unggahProposal(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {berkas?.berkasId !== undefined && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={hapusBusy}
                onClick={() => setKonfirmasiHapus(true)}
              >
                {hapusBusy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 size-3.5" />
                )}
                Hapus berkas
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] leading-5 text-slate-600">
          Hanya PDF sampai 5 MB. Setelah berkas dipasang, catatan di halaman
          memakai teks “catatan berkas”, bukan catatan proposal otomatis.
        </p>
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs leading-5 text-slate-600">
        <p className="font-semibold text-slate-800">Token angka</p>
        <p className="mt-1">
          Tulis token berikut di dalam kalimat, bukan angka mati:{" "}
          {TOKEN_PENDANA.map((token) => (
            <code
              key={token}
              className="mr-1 rounded bg-white px-1 py-0.5 font-semibold text-emerald-800 ring-1 ring-slate-200"
            >
              {token}
            </code>
          ))}
          . Halaman mengisinya dengan tarif yang berlaku, nominal contoh, dan
          nomor layanan resmi.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bagian judul="Hero">
          <Field
            id="pendana-hero-judul"
            label="Judul halaman"
            area
            max={BATAS_PENDANA.heroJudul}
            value={nilai.heroJudul}
            onChange={(v) => ubah("heroJudul", v)}
          />
          <Field
            id="pendana-hero-deskripsi"
            label="Paragraf pembuka"
            area
            max={BATAS_PENDANA.heroDeskripsi}
            value={nilai.heroDeskripsi}
            onChange={(v) => ubah("heroDeskripsi", v)}
          />
          <Field
            id="pendana-hero-catatan"
            label="Catatan kecil di bawah tombol"
            area
            max={BATAS_PENDANA.heroCatatan}
            value={nilai.heroCatatan}
            onChange={(v) => ubah("heroCatatan", v)}
          />
        </Bagian>

        <Bagian judul="Prinsip pembagian">
          <Field
            id="pendana-prinsip-judul"
            label="Judul bagian"
            max={BATAS_PENDANA.prinsipJudul}
            value={nilai.prinsipJudul}
            onChange={(v) => ubah("prinsipJudul", v)}
          />
          <Field
            id="pendana-prinsip-deskripsi"
            label="Paragraf pengantar"
            area
            max={BATAS_PENDANA.prinsipDeskripsi}
            value={nilai.prinsipDeskripsi}
            onChange={(v) => ubah("prinsipDeskripsi", v)}
          />
          {Array.from({ length: JUMLAH_PRINSIP }, (_, i) => (
            <fieldset
              key={i}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <legend className="px-1 text-xs font-semibold text-slate-600">
                Prinsip {i + 1}
              </legend>
              <Field
                id={`pendana-prinsip-${i}-judul`}
                label="Judul"
                max={BATAS_PENDANA.itemJudul}
                value={nilai.prinsip[i].judul}
                onChange={(v) => ubahPrinsip(i, "judul", v)}
              />
              <Field
                id={`pendana-prinsip-${i}-isi`}
                label="Isi"
                area
                max={BATAS_PENDANA.itemIsi}
                value={nilai.prinsip[i].isi}
                onChange={(v) => ubahPrinsip(i, "isi", v)}
              />
            </fieldset>
          ))}
        </Bagian>

        <Bagian judul="Kalkulator & perhitungan">
          <Field
            id="pendana-kalkulator-judul"
            label="Judul kalkulator"
            max={BATAS_PENDANA.kalkulatorJudul}
            value={nilai.kalkulatorJudul}
            onChange={(v) => ubah("kalkulatorJudul", v)}
          />
          <Field
            id="pendana-kalkulator-deskripsi"
            label="Pengantar kalkulator"
            area
            max={BATAS_PENDANA.kalkulatorDeskripsi}
            value={nilai.kalkulatorDeskripsi}
            onChange={(v) => ubah("kalkulatorDeskripsi", v)}
          />
          <Field
            id="pendana-kalkulator-catatan"
            label="Catatan di bawah kolom nominal"
            area
            max={BATAS_PENDANA.kalkulatorCatatan}
            value={nilai.kalkulatorCatatan}
            onChange={(v) => ubah("kalkulatorCatatan", v)}
          />
          <Field
            id="pendana-perhitungan-judul"
            label="Judul bagian perhitungan"
            max={BATAS_PENDANA.perhitunganJudul}
            value={nilai.perhitunganJudul}
            onChange={(v) => ubah("perhitunganJudul", v)}
          />
          <Field
            id="pendana-perhitungan-deskripsi"
            label="Pengantar bagian perhitungan"
            area
            max={BATAS_PENDANA.perhitunganDeskripsi}
            value={nilai.perhitunganDeskripsi}
            onChange={(v) => ubah("perhitunganDeskripsi", v)}
          />
        </Bagian>

        <Bagian judul="Bagian proposal">
          <Field
            id="pendana-proposal-judul"
            label="Judul bagian"
            max={BATAS_PENDANA.proposalJudul}
            value={nilai.proposalJudul}
            onChange={(v) => ubah("proposalJudul", v)}
          />
          <Field
            id="pendana-proposal-deskripsi"
            label="Paragraf pengantar"
            area
            max={BATAS_PENDANA.proposalDeskripsi}
            value={nilai.proposalDeskripsi}
            onChange={(v) => ubah("proposalDeskripsi", v)}
          />
          {Array.from({ length: JUMLAH_ISI_PROPOSAL }, (_, i) => (
            <Field
              key={i}
              id={`pendana-proposal-isi-${i}`}
              label={`Isi dokumen ${i + 1}`}
              max={BATAS_PENDANA.proposalIsi}
              value={nilai.proposalIsi[i]}
              onChange={(v) => ubahIsiProposal(i, v)}
            />
          ))}
          <Field
            id="pendana-proposal-catatan"
            label="Catatan saat proposal disusun aplikasi"
            area
            max={BATAS_PENDANA.proposalCatatan}
            value={nilai.proposalCatatan}
            onChange={(v) => ubah("proposalCatatan", v)}
          />
          <Field
            id="pendana-proposal-catatan-berkas"
            label="Catatan saat berkas PDF dipasang admin"
            area
            max={BATAS_PENDANA.proposalCatatan}
            value={nilai.proposalCatatanBerkas}
            onChange={(v) => ubah("proposalCatatanBerkas", v)}
          />
        </Bagian>

        <Bagian judul="Risiko">
          <Field
            id="pendana-risiko-judul"
            label="Judul bagian"
            max={BATAS_PENDANA.risikoJudul}
            value={nilai.risikoJudul}
            onChange={(v) => ubah("risikoJudul", v)}
          />
          <Field
            id="pendana-risiko-deskripsi"
            label="Paragraf pengantar"
            area
            max={BATAS_PENDANA.risikoDeskripsi}
            value={nilai.risikoDeskripsi}
            onChange={(v) => ubah("risikoDeskripsi", v)}
          />
          {Array.from({ length: JUMLAH_RISIKO }, (_, i) => (
            <fieldset
              key={i}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <legend className="px-1 text-xs font-semibold text-slate-600">
                Risiko {i + 1}
              </legend>
              <Field
                id={`pendana-risiko-${i}-judul`}
                label="Judul"
                max={BATAS_PENDANA.itemJudul}
                value={nilai.risiko[i].judul}
                onChange={(v) => ubahRisiko(i, "judul", v)}
              />
              <Field
                id={`pendana-risiko-${i}-isi`}
                label="Isi"
                area
                max={BATAS_PENDANA.itemIsi}
                value={nilai.risiko[i].isi}
                onChange={(v) => ubahRisiko(i, "isi", v)}
              />
            </fieldset>
          ))}
        </Bagian>

        <Bagian judul="Pertanyaan umum">
          <Field
            id="pendana-faq-judul"
            label="Judul bagian"
            max={BATAS_PENDANA.faqJudul}
            value={nilai.faqJudul}
            onChange={(v) => ubah("faqJudul", v)}
          />
          <Field
            id="pendana-faq-deskripsi"
            label="Paragraf pengantar"
            area
            max={BATAS_PENDANA.faqDeskripsi}
            value={nilai.faqDeskripsi}
            onChange={(v) => ubah("faqDeskripsi", v)}
          />
          {Array.from({ length: JUMLAH_FAQ }, (_, i) => (
            <fieldset
              key={i}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <legend className="px-1 text-xs font-semibold text-slate-600">
                Pertanyaan {i + 1}
              </legend>
              <Field
                id={`pendana-faq-${i}-tanya`}
                label="Pertanyaan"
                max={BATAS_PENDANA.faqTanya}
                value={nilai.faq[i].tanya}
                onChange={(v) => ubahFaq(i, "tanya", v)}
              />
              <Field
                id={`pendana-faq-${i}-jawab`}
                label="Jawaban"
                area
                max={BATAS_PENDANA.faqJawab}
                value={nilai.faq[i].jawab}
                onChange={(v) => ubahFaq(i, "jawab", v)}
              />
            </fieldset>
          ))}
        </Bagian>

        <Bagian judul="Ajakan terakhir">
          <Field
            id="pendana-ajakan-judul"
            label="Judul bagian"
            max={BATAS_PENDANA.ajakanJudul}
            value={nilai.ajakanJudul}
            onChange={(v) => ubah("ajakanJudul", v)}
          />
          <Field
            id="pendana-ajakan-deskripsi"
            label="Paragraf"
            area
            max={BATAS_PENDANA.ajakanDeskripsi}
            value={nilai.ajakanDeskripsi}
            onChange={(v) => ubah("ajakanDeskripsi", v)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Tombol WhatsApp dan tombol masuk tetap diatur kode. Nomor layanan
            ditulis sebagai <code className="rounded bg-slate-100 px-1">{"{kontak}"}</code>{" "}
            dan diambil dari pengaturan kontak resmi.
          </p>
        </Bagian>
      </div>

      <div className="glass-dock sticky bottom-0 z-20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`inline-flex size-2 rounded-full ${
                kotor ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
            {kotor
              ? "Ada perubahan teks yang belum tersimpan."
              : "Teks di halaman sama dengan yang tersimpan."}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={busy}
              onClick={muatBawaan}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Muat teks bawaan
            </Button>
            <Button
              size="sm"
              className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !draft}
              onClick={simpanTeks}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-4" />
              )}
              Simpan konten
            </Button>
          </div>
        </div>
      </div>

      <KonfirmasiAksi
        open={konfirmasiHapus}
        onOpenChange={(terbuka) => {
          if (!terbuka && !hapusBusy) setKonfirmasiHapus(false);
        }}
        judul="Hapus berkas proposal?"
        deskripsi="Unduhan proposal kembali ke berkas yang disusun aplikasi. Berkas unggahan akan dihapus dan tidak bisa dikembalikan."
        labelKonfirmasi="Hapus berkas"
        busy={hapusBusy}
        onConfirm={() => void hapusProposal()}
      />
    </div>
  );
}

function Bagian({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-navy">{judul}</h3>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  max,
  area = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  area?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {area ? (
        <Textarea
          id={id}
          rows={3}
          maxLength={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 bg-white"
        />
      ) : (
        <Input
          id={id}
          maxLength={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 bg-white"
        />
      )}
      <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground">
        {value.length}/{max}
      </p>
    </div>
  );
}
