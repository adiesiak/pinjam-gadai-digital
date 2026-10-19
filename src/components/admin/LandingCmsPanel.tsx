import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  BATAS_LANDING,
  JUMLAH_KARTU_LAYANAN,
  JUMLAH_PANDUAN,
  KONTEN_LANDING_DEFAULT,
  type KontenLanding,
  type KartuLayanan,
  type ItemPanduan,
} from "@/lib/landing-cms";

/**
 * Editor teks beranda `/`.
 *
 * Yang diubah hanya tulisan. Rute CTA, ikon, dan urutan bagian tetap di kode,
 * jadi formulir ini tidak bisa mengarahkan pengunjung ke luar aplikasi atau
 * menghapus bagian halaman — dua hal yang akan terjadi bila konten disimpan
 * sebagai HTML bebas.
 *
 * Semua perubahan ditahan di `draft` sampai admin menekan Simpan. Pratinjau
 * yang sebenarnya adalah halaman `/`; tombol "Lihat beranda" membukanya di tab
 * baru, bukan menampilkan tiruan yang bisa berbeda dari hasil asli.
 */
export function LandingCmsPanel() {
  const publik = useQuery(api.announcements.getPublic);
  const save = useMutation(api.announcements.save);

  const [draft, setDraft] = useState<KontenLanding | null>(null);
  const [busy, setBusy] = useState(false);

  if (publik === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat konten landing…
      </div>
    );
  }

  const nilai = draft ?? publik.landing;
  const kotor = draft !== null;

  const ubah = <K extends keyof KontenLanding>(
    key: K,
    value: KontenLanding[K],
  ) => setDraft({ ...nilai, [key]: value });

  const ubahKartu = (
    index: number,
    key: keyof KartuLayanan,
    value: string,
  ) =>
    ubah(
      "layanan",
      nilai.layanan.map((kartu, i) =>
        i === index ? { ...kartu, [key]: value } : kartu,
      ),
    );

  const ubahPanduan = (index: number, key: keyof ItemPanduan, value: string) =>
    ubah(
      "panduan",
      nilai.panduan.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    );

  const simpan = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // Kirim objek utuh: server memotong panjang dan mengosongkan field yang
      // memang dikosongkan admin, lalu pembacaan melengkapinya dengan bawaan.
      // Daftar disalin agar nilai bawaan yang readonly tidak dikirim by-ref.
      await save({
        landing: {
          ...draft,
          layanan: draft.layanan.map((kartu) => ({ ...kartu })),
          panduan: draft.panduan.map((item) => ({ ...item })),
        },
      });
      setDraft(null);
      toast.success("Teks beranda tersimpan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const muatBawaan = () => {
    setDraft(KONTEN_LANDING_DEFAULT);
    toast.info(
      "Teks bawaan dimuat ke formulir. Tekan Simpan untuk menerapkannya.",
    );
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Konten Beranda
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Teks hero, tiga kartu layanan, panduan, dan footer halaman{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/</code>.
            Tautan dan ikon tetap diatur kode; di sini hanya tulisannya.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 size-3.5" />
            Lihat beranda
          </a>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bagian judul="Hero">
          <Field
            id="landing-hero-eyebrow"
            label="Label di atas judul"
            max={BATAS_LANDING.heroEyebrow}
            value={nilai.heroEyebrow}
            onChange={(v) => ubah("heroEyebrow", v)}
          />
          <Field
            id="landing-hero-judul-1"
            label="Judul — bagian pertama"
            max={BATAS_LANDING.heroJudul1}
            value={nilai.heroJudul1}
            onChange={(v) => ubah("heroJudul1", v)}
          />
          <Field
            id="landing-hero-judul-2"
            label="Judul — bagian aksen"
            max={BATAS_LANDING.heroJudul2}
            value={nilai.heroJudul2}
            onChange={(v) => ubah("heroJudul2", v)}
          />
          <Field
            id="landing-hero-deskripsi"
            label="Paragraf pembuka"
            area
            max={BATAS_LANDING.heroDeskripsi}
            value={nilai.heroDeskripsi}
            onChange={(v) => ubah("heroDeskripsi", v)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="landing-hero-cta"
              label="Tombol sekunder"
              max={BATAS_LANDING.heroCtaSekunder}
              value={nilai.heroCtaSekunder}
              onChange={(v) => ubah("heroCtaSekunder", v)}
            />
          </div>
          <Field
            id="landing-hero-mikro"
            label="Catatan kecil di bawah tombol"
            area
            max={BATAS_LANDING.heroMikro}
            value={nilai.heroMikro}
            onChange={(v) => ubah("heroMikro", v)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Tombol utama mengikuti status akun pengunjung (“Buat akun” atau
            “Buka dashboard”), jadi tidak diedit di sini.
          </p>
        </Bagian>

        <Bagian judul="Bagian layanan">
          <Field
            id="landing-layanan-eyebrow"
            label="Label bagian"
            max={BATAS_LANDING.layananEyebrow}
            value={nilai.layananEyebrow}
            onChange={(v) => ubah("layananEyebrow", v)}
          />
          <Field
            id="landing-layanan-judul"
            label="Judul bagian"
            max={BATAS_LANDING.layananJudul}
            value={nilai.layananJudul}
            onChange={(v) => ubah("layananJudul", v)}
          />
          <Field
            id="landing-layanan-cta"
            label="Teks tautan tiap kartu"
            max={BATAS_LANDING.layananCta}
            value={nilai.layananCta}
            onChange={(v) => ubah("layananCta", v)}
          />
          {Array.from({ length: JUMLAH_KARTU_LAYANAN }, (_, i) => (
            <fieldset
              key={i}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <legend className="px-1 text-xs font-semibold text-slate-600">
                Kartu {i + 1}
              </legend>
              <Field
                id={`landing-kartu-${i}-judul`}
                label="Judul"
                max={BATAS_LANDING.kartuJudul}
                value={nilai.layanan[i].judul}
                onChange={(v) => ubahKartu(i, "judul", v)}
              />
              <Field
                id={`landing-kartu-${i}-ringkasan`}
                label="Ringkasan"
                area
                max={BATAS_LANDING.kartuRingkasan}
                value={nilai.layanan[i].ringkasan}
                onChange={(v) => ubahKartu(i, "ringkasan", v)}
              />
              <Field
                id={`landing-kartu-${i}-detail`}
                label="Baris rincian"
                max={BATAS_LANDING.kartuDetail}
                value={nilai.layanan[i].detail}
                onChange={(v) => ubahKartu(i, "detail", v)}
              />
            </fieldset>
          ))}
        </Bagian>

        <Bagian judul="Bagian panduan">
          <Field
            id="landing-panduan-eyebrow"
            label="Label bagian"
            max={BATAS_LANDING.panduanEyebrow}
            value={nilai.panduanEyebrow}
            onChange={(v) => ubah("panduanEyebrow", v)}
          />
          <Field
            id="landing-panduan-judul"
            label="Judul bagian"
            max={BATAS_LANDING.panduanJudul}
            value={nilai.panduanJudul}
            onChange={(v) => ubah("panduanJudul", v)}
          />
          <Field
            id="landing-panduan-deskripsi"
            label="Paragraf pengantar"
            area
            max={BATAS_LANDING.panduanDeskripsi}
            value={nilai.panduanDeskripsi}
            onChange={(v) => ubah("panduanDeskripsi", v)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="landing-panduan-cta-kalkulator"
              label="Tombol kalkulator"
              max={BATAS_LANDING.panduanCta}
              value={nilai.panduanCtaKalkulator}
              onChange={(v) => ubah("panduanCtaKalkulator", v)}
            />
            <Field
              id="landing-panduan-cta-syarat"
              label="Tombol syarat"
              max={BATAS_LANDING.panduanCta}
              value={nilai.panduanCtaSyarat}
              onChange={(v) => ubah("panduanCtaSyarat", v)}
            />
          </div>
          {Array.from({ length: JUMLAH_PANDUAN }, (_, i) => (
            <fieldset
              key={i}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <legend className="px-1 text-xs font-semibold text-slate-600">
                Panduan {i + 1}
              </legend>
              <Field
                id={`landing-panduan-${i}-judul`}
                label="Judul"
                max={BATAS_LANDING.itemJudul}
                value={nilai.panduan[i].judul}
                onChange={(v) => ubahPanduan(i, "judul", v)}
              />
              <Field
                id={`landing-panduan-${i}-isi`}
                label="Isi"
                area
                max={BATAS_LANDING.itemIsi}
                value={nilai.panduan[i].isi}
                onChange={(v) => ubahPanduan(i, "isi", v)}
              />
            </fieldset>
          ))}
        </Bagian>

        <Bagian judul="Footer">
          <Field
            id="landing-footer-deskripsi"
            label="Deskripsi singkat aplikasi"
            area
            max={BATAS_LANDING.footerDeskripsi}
            value={nilai.footerDeskripsi}
            onChange={(v) => ubah("footerDeskripsi", v)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Kolom yang dikosongkan kembali ke teks bawaan saat halaman dibaca,
            bukan menjadi judul kosong. Nama, tautan, dan versi ketentuan footer
            tetap dari kode.
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
              ? "Ada perubahan yang belum tersimpan."
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
              className="min-h-11 bg-[#064E3B] text-white hover:bg-[#021E17]"
              disabled={busy || !draft}
              onClick={simpan}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-4" />
              )}
              Simpan teks beranda
            </Button>
          </div>
        </div>
      </div>
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
