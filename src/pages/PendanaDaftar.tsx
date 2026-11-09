import { useMutation } from "convex/react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { JebakanFormulir } from "@/components/JebakanFormulir";
import { InfoFooter, InfoHeader } from "@/components/informasi/InfoShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { urlChatCs } from "@/lib/kontak";
import {
  LABEL_SUMBER_MINAT_PENDANA,
  SUMBER_MINAT_PENDANA,
  type SumberMinatPendana,
} from "@/lib/minatPendana";
import { formatRupiah } from "@/lib/money";
import { normalisasiNomorWa } from "@/lib/otpWa";

const NOMINAL_CONTOH = 5_000_000;

const LANGKAH = [
  {
    nomor: "01",
    judul: "Isi minat",
    isi: "Nama, WhatsApp, rencana nominal, dan kota. Tanpa KTP, tanpa transfer.",
  },
  {
    nomor: "02",
    judul: "Percakapan awal",
    isi: "Tim PINDAI menjelaskan siklus, pembagian hasil, risiko, dan langkah verifikasi.",
  },
  {
    nomor: "03",
    judul: "Putuskan setelah membaca",
    isi: "Jika cocok, penempatan dicatat untuk satu siklus. Tidak ada komitmen di formulir ini.",
  },
] as const;

/**
 * Halaman publik calon pendana.
 *
 * Berbeda dari `/jadi-pendana` yang tetap dijaga `RequirePendana`: halaman ini
 * tidak memuat proposal internal, angka hasil, atau berkas. Tujuannya hanya
 * membuka percakapan dan mencatat minat secara eksplisit. Karena itu tidak ada
 * janji imbal hasil di sini — angka baru dibaca setelah verifikasi dan
 * penjelasan risiko.
 */
export default function PendanaDaftar() {
  const kirimMinat = useMutation(api.minatPendana.kirimMinat);

  const [nama, setNama] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [nominal, setNominal] = useState(String(NOMINAL_CONTOH));
  const [kota, setKota] = useState("");
  const [sumber, setSumber] = useState<SumberMinatPendana>("instagram");
  const [catatan, setCatatan] = useState("");
  const [setuju, setSetuju] = useState(false);
  const [jebakan, setJebakan] = useState("");
  const [formDibukaPada] = useState(() => Date.now());
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [selesai, setSelesai] = useState(false);
  const [duplikat, setDuplikat] = useState(false);
  const suksesRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const judulAsli = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const deskripsiAsli = meta?.getAttribute("content") ?? null;
    document.title = "Jadi Pendana | PINDAI";
    meta?.setAttribute(
      "content",
      "Ajukan minat pendanaan PINDAI. Pahami siklus, pembagian hasil, dan risikonya sebelum menempatkan dana.",
    );
    return () => {
      document.title = judulAsli;
      if (meta && deskripsiAsli !== null) meta.setAttribute("content", deskripsiAsli);
    };
  }, []);

  useEffect(() => {
    if (!selesai) return;
    suksesRef.current?.focus();
  }, [selesai]);

  const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGalat(null);

    const namaBersih = nama.trim();
    if (namaBersih.length < 2) {
      setGalat("Isi nama lengkap, minimal 2 karakter.");
      return;
    }
    if (normalisasiNomorWa(nomorWhatsApp) === null) {
      setGalat("Nomor WhatsApp belum sah. Contoh: 0812 3456 7890.");
      return;
    }
    const nominalAngka = Number(nominal);
    if (
      !Number.isSafeInteger(nominalAngka) ||
      nominalAngka < 100_000 ||
      nominalAngka > 1_000_000_000
    ) {
      setGalat("Nominal rencana harus antara Rp100.000 dan Rp1.000.000.000.");
      return;
    }
    if (kota.trim().length < 2) {
      setGalat("Isi kota domisili, minimal 2 karakter.");
      return;
    }
    if (!setuju) {
      setGalat("Centang persetujuan agar tim PINDAI boleh menghubungi Anda.");
      return;
    }

    setMengirim(true);
    try {
      const hasil = await kirimMinat({
        nama: namaBersih,
        nomorWhatsApp,
        nominalRencana: nominalAngka,
        kota,
        ...(catatan.trim() === "" ? {} : { catatan }),
        sumber,
        setuju,
        formDibukaPada,
        ...(jebakan === "" ? {} : { jebakan }),
      });
      if (!hasil.ok) {
        setGalat(hasil.alasan);
        return;
      }
      setDuplikat(hasil.duplikat);
      setSelesai(true);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Minat belum bisa dikirim. Coba lagi.");
    } finally {
      setMengirim(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <InfoHeader />
      <main id="konten" tabIndex={-1}>
        <section className="border-b border-border bg-muted/35">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:py-18">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
                <Users className="size-3.5" aria-hidden="true" />
                Untuk calon pendana
              </p>
              <h1 className="mt-6 text-balance font-judul text-[2.3rem] leading-[1.05] tracking-[-0.03em] text-foreground min-[480px]:text-[2.8rem] sm:text-5xl lg:text-[3.35rem]">
                Tempatkan dana pada{" "}
                <span className="font-display text-primary">pinjaman yang sudah diverifikasi.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                PINDAI mempertemukan pendana dengan pinjaman UMKM yang melewati
                verifikasi. Anda melihat siklus, pembagian hasil, dan risikonya
                sebelum memutuskan.
              </p>

              <dl className="mt-8 grid gap-4 border-y border-border py-5 sm:grid-cols-3">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gold-foreground">
                    <CalendarClock className="size-3.5" aria-hidden="true" />
                    Siklus
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    30 hari
                    <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                      Pengingat siklus 30 hari; tenor produk mengikuti akad.
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gold-foreground">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    Pembagian
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    47 : 13
                    <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                      Dari marjin: 47 bagian pendana, 13 bagian platform.
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gold-foreground">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    Risiko
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    Dibaca dulu
                    <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                      Bukan deposito; hasil tidak dijamin.
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="outline" className="min-h-11 border-border bg-card">
                  <a href="#form-minat">
                    Lihat formulir
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild variant="ghost" className="min-h-11">
                  <a
                    href={urlChatCs(
                      "Saya ingin menjadi pendana PINDAI. Mohon dijelaskan siklus, risiko, dan langkah verifikasinya.",
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 size-4" aria-hidden="true" />
                    Chat layanan
                  </a>
                </Button>
              </div>
            </div>

            <div id="form-minat" className="scroll-mt-24">
              <div className="rounded-2xl border border-gold/55 bg-card p-5 shadow-[0_20px_45px_-32px_rgba(28,26,21,0.45)] ring-1 ring-gold/25 sm:p-6">
                {selesai ? (
                  <div role="status" aria-live="polite">
                    <span className="flex size-11 items-center justify-center rounded-full bg-success-soft text-success-foreground">
                      <CheckCircle2 className="size-5" aria-hidden="true" />
                    </span>
                    <h2
                      ref={suksesRef}
                      tabIndex={-1}
                      className="mt-4 font-judul text-2xl leading-tight text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {duplikat ? "Minat Anda sudah tercatat sebelumnya." : "Minat Anda sudah tercatat."}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Tim PINDAI akan mencoba menghubungi nomor WhatsApp yang
                      Anda isi pada jam kerja. Belum ada komitmen dan belum ada uang yang
                      berpindah di tahap ini.
                    </p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                      <Button asChild className="min-h-11">
                        <a
                          href={urlChatCs(
                            "Saya sudah mengisi formulir minat pendana PINDAI dan ingin melanjutkan percakapan.",
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="mr-2 size-4" aria-hidden="true" />
                          Chat layanan
                        </a>
                      </Button>
                      <Button asChild variant="outline" className="min-h-11">
                        <Link to="/">Kembali ke beranda</Link>
                      </Button>
                    </div>
                    <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                      Nomor yang Anda isi:{" "}
                      <span className="font-medium text-foreground">{nomorWhatsApp.trim()}</span>
                      . Jika ada perubahan, sampaikan saat dihubungi.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={kirim} noValidate>
                    <header>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
                        Langkah pertama
                      </p>
                      <h2 className="mt-1 font-judul text-2xl leading-tight text-foreground">
                        Ajukan minat pendanaan
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Bukan komitmen. Kami menghubungi Anda untuk menjelaskan
                        rincian dan langkah verifikasi.
                      </p>
                    </header>

                    <div className="mt-5 space-y-4">
                      <div>
                        <Label htmlFor="minat-nama">Nama lengkap</Label>
                        <Input
                          id="minat-nama"
                          name="nama"
                          autoComplete="name"
                          maxLength={80}
                          value={nama}
                          onChange={(event) => setNama(event.target.value)}
                          className="mt-1.5 min-h-11"
                          placeholder="Nama sesuai identitas"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="minat-wa">Nomor WhatsApp</Label>
                        <Input
                          id="minat-wa"
                          name="nomorWhatsApp"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={nomorWhatsApp}
                          onChange={(event) => setNomorWhatsApp(event.target.value)}
                          className="mt-1.5 min-h-11"
                          placeholder="0812 3456 7890"
                          required
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="minat-nominal">Rencana nominal</Label>
                          <Input
                            id="minat-nominal"
                            name="nominalRencana"
                            type="number"
                            inputMode="numeric"
                            min={100_000}
                            max={1_000_000_000}
                            step={100_000}
                            value={nominal}
                            onChange={(event) => setNominal(event.target.value)}
                            className="mt-1.5 min-h-11 tabular-nums"
                            required
                          />
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Minimal {formatRupiah(100_000)}. Bisa diubah setelah percakapan.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="minat-kota">Kota domisili</Label>
                          <Input
                            id="minat-kota"
                            name="kota"
                            autoComplete="address-level2"
                            maxLength={60}
                            value={kota}
                            onChange={(event) => setKota(event.target.value)}
                            className="mt-1.5 min-h-11"
                            placeholder="Contoh: Bandung"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="minat-sumber">Tahu PINDAI dari mana?</Label>
                        <select
                          id="minat-sumber"
                          name="sumber"
                          value={sumber}
                          onChange={(event) =>
                            setSumber(event.target.value as SumberMinatPendana)
                          }
                          className="mt-1.5 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {SUMBER_MINAT_PENDANA.map((nilai) => (
                            <option key={nilai} value={nilai}>
                              {LABEL_SUMBER_MINAT_PENDANA[nilai]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <Label htmlFor="minat-catatan">
                          Catatan <span className="font-normal text-muted-foreground">(opsional)</span>
                        </Label>
                        <Textarea
                          id="minat-catatan"
                          name="catatan"
                          maxLength={500}
                          value={catatan}
                          onChange={(event) => setCatatan(event.target.value)}
                          className="mt-1.5 min-h-20"
                          placeholder="Misalnya: ingin mulai dari nominal kecil, atau ingin tahu cara pencairan."
                        />
                      </div>

                      <JebakanFormulir nilai={jebakan} onUbah={setJebakan} />

                      <label className="flex min-h-11 items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={setuju}
                          onChange={(event) => setSetuju(event.target.checked)}
                          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                          required
                        />
                        <span>
                          Saya setuju PINDAI menghubungi saya lewat WhatsApp tentang
                          pendanaan. Saya sudah membaca{" "}
                          <Link
                            to="/privasi"
                            className="font-medium text-primary underline underline-offset-4"
                          >
                            Kebijakan Privasi
                          </Link>
                          .
                        </span>
                      </label>

                      {galat !== null && (
                        <p
                          role="alert"
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-6 text-red-800"
                        >
                          {galat}
                        </p>
                      )}

                      <Button type="submit" disabled={mengirim} className="min-h-11 w-full">
                        {mengirim ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                            Mengirim…
                          </>
                        ) : (
                          <>
                            Kirim minat
                            <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                          </>
                        )}
                      </Button>

                      <p className="text-xs leading-5 text-muted-foreground">
                        Kami tidak meminta KTP, rekening, atau transfer di halaman ini.
                        Jangan pernah mengirim uang ke rekening pribadi.
                      </p>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="judul-proses" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
              Setelah formulir
            </p>
            <h2 id="judul-proses" className="mt-2 font-judul text-3xl leading-tight text-foreground sm:text-4xl">
              Tiga langkah, tanpa lompatan.
            </h2>
          </div>
          <ol className="mt-7 grid gap-5 sm:grid-cols-3">
            {LANGKAH.map((langkah) => (
              <li key={langkah.nomor} className="border-t border-border pt-4">
                <p className="font-mono text-xs font-semibold tabular-nums text-gold-foreground">
                  {langkah.nomor}
                </p>
                <h3 className="mt-2 text-sm font-semibold text-foreground">{langkah.judul}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{langkah.isi}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-border bg-muted/35">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
            <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:p-5">
              <h2 className="font-semibold">Baca risiko sebelum menempatkan dana</h2>
              <p className="mt-1.5">
                Pendanaan PINDAI bukan deposito dan tidak dijamin LPS. Imbal hasil
                tidak dijanjikan; keterlambatan atau gagal bayar peminjam bisa
                terjadi. Pemulihan mengikuti penagihan dan kebijakan akun cadangan
                platform, bukan jaminan pihak ketiga. Baca{" "}
                <Link to="/syarat-ketentuan" className="font-semibold underline underline-offset-4">
                  Syarat &amp; Ketentuan
                </Link>{" "}
                sebelum memutuskan.
              </p>
            </div>
          </div>
        </section>
      </main>
      <InfoFooter />
    </div>
  );
}
