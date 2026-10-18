/**
 * Panel admin "Pengingat pembaruan aplikasi".
 *
 * Satu tempat untuk dua kabar yang harus sampai bersamaan:
 *  - notifikasi di pusat notifikasi setiap akun (otomatis begitu versi
 *    diumumkan, dibaca `convex/notifikasi.ts` dari tabel yang sama),
 *  - pesan WhatsApp ke akun yang punya nomor, dikirim bertahap lewat gateway
 *    yang sudah diatur di panel WhatsApp.
 *
 * Pengumuman dan pengiriman sengaja dua tombol terpisah: mengumumkan versi
 * tidak boleh langsung membanjiri puluhan nomor, dan mengirim pesan tidak boleh
 * mengubah isi pengumuman. Tombol kirim hanya mengirim ke penerima yang belum
 * menerima versi itu — server menyaringnya, panel menampilkan sisanya apa adanya.
 */
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Megaphone, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  MAKS_CATATAN_PEMBARUAN,
  TAUTAN_UNDUH_BAWAAN,
  urlUnduhAplikasi,
  validasiPembaruan,
} from "@/lib/pembaruanAplikasi";
import { cn } from "@/lib/utils";

/** Batas gelombang per satu klik — mencegah panel berputar tanpa akhir. */
const MAKS_GELOMBANG = 30;

/** Asal halaman admin, dipakai mengubah jalur `/pindai.apk` jadi alamat utuh. */
function asalHalaman(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function labelStatus(status: string): string {
  if (status === "terkirim") return "terkirim";
  if (status === "gagal") return "gagal";
  return "belum dikirim";
}

/**
 * Versi APK yang benar-benar terbit, dibaca dari berkas yang ditulis
 * `android/build.sh`. Angka ini hanya dipakai sebagai pengingat di panel —
 * server tidak bisa membaca berkas statis itu, jadi bukan gerbang.
 */
type VersiTerbit = { versiKode: number; versiNama: string };

export function PengingatPembaruanPanel() {
  const status = useQuery(api.pembaruanAplikasi.status);
  const penerima = useQuery(api.pembaruanAplikasi.penerima);
  const umumkan = useMutation(api.pembaruanAplikasi.umumkan);
  const kirim = useAction(api.pembaruanAplikasi.kirimWhatsapp);

  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [tautan, setTautan] = useState(TAUTAN_UNDUH_BAWAAN);
  const [catatan, setCatatan] = useState("");
  const [wajib, setWajib] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [busy, setBusy] = useState<"umumkan" | "kirim" | null>(null);
  const [progres, setProgres] = useState<string | null>(null);
  const [versiTerbit, setVersiTerbit] = useState<VersiTerbit | null>(null);

  useEffect(() => {
    let batal = false;
    void fetch("/version.json")
      .then((respon) => (respon.ok ? respon.json() : null))
      .then((data: unknown) => {
        if (batal || data === null || typeof data !== "object") return;
        const isi = data as { versionCode?: unknown; versionName?: unknown };
        if (typeof isi.versionCode !== "number") return;
        setVersiTerbit({
          versiKode: isi.versionCode,
          versiNama: typeof isi.versionName === "string" ? isi.versionName : "",
        });
      })
      .catch(() => {
        // Berkas tidak terbaca: panel tetap bisa dipakai, hanya tanpa pengingat versi.
      });
    return () => {
      batal = true;
    };
  }, []);

  const terbaru = status?.terbaru ?? null;
  const alamatUnduh = useMemo(() => {
    const asal = asalHalaman();
    return asal === "" ? null : urlUnduhAplikasi(asal, tautan.trim());
  }, [tautan]);

  if (status === undefined || penerima === undefined) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat pengingat pembaruan…
        </p>
      </section>
    );
  }

  // Bukan admin (atau sesi TOTP belum sah): panel tidak menampilkan apa pun
  // daripada menampilkan angka yang bukan haknya.
  if (status === null || penerima === null) return null;

  const sisaKirim = Math.max(0, status.jumlahPenerima - status.terkirim);

  const kirimPengumuman = async () => {
    setGalat(null);
    const kodeAngka = Number(kode.trim());
    if (kode.trim() === "" || !Number.isFinite(kodeAngka)) {
      setGalat("Kode versi (versionCode) belum diisi.");
      return;
    }
    if (versiTerbit !== null && kodeAngka <= versiTerbit.versiKode) {
      setGalat(
        `Kode ${kodeAngka} tidak lebih besar dari versi terbit (kode ${versiTerbit.versiKode}). Android akan menolak memasangnya, jadi pesan ini belum berguna.`,
      );
      return;
    }
    const cek = validasiPembaruan({
      versiKode: kodeAngka,
      versiNama: nama,
      tautan: tautan,
      catatan,
      wajibDiperbarui: wajib,
    });
    if (!cek.ok) {
      setGalat(cek.alasan);
      return;
    }
    if (alamatUnduh === null) {
      setGalat("Tautan unduhan tidak bisa dibuka penerima. Isi alamat http(s) utuh.");
      return;
    }

    setBusy("umumkan");
    try {
      await umumkan({
        versiKode: cek.nilai.versiKode,
        versiNama: cek.nilai.versiNama,
        tautan: alamatUnduh,
        ...(cek.nilai.catatan === undefined ? {} : { catatan: cek.nilai.catatan }),
        ...(cek.nilai.wajibDiperbarui === true ? { wajibDiperbarui: true } : {}),
      });
      setKode("");
      setCatatan("");
      setWajib(false);
      toast.success(
        `PINDAI ${cek.nilai.versiNama} diumumkan. Notifikasi muncul di pusat notifikasi semua akun.${
          cek.nilai.wajibDiperbarui === true
            ? " Versi aplikasi di bawahnya kini wajib diperbarui."
            : ""
        }`,
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pengumuman gagal disimpan.");
    } finally {
      setBusy(null);
    }
  };

  const kirimPengingat = async () => {
    if (terbaru === null) return;
    setGalat(null);
    setBusy("kirim");
    setProgres("Menyiapkan gelombang pertama…");
    let terkirim = 0;
    let gagal = 0;
    let alasan = "";

    try {
      for (let gelombang = 1; gelombang <= MAKS_GELOMBANG; gelombang += 1) {
        const hasil = await kirim({ versiKode: terbaru.versiKode });
        terkirim += hasil.terkirim;
        gagal += hasil.gagal;
        alasan = hasil.alasanTerakhir;
        setProgres(
          `${terkirim} pesan terkirim${gagal > 0 ? `, ${gagal} gagal` : ""} · sisa ${hasil.sisa}`,
        );
        if (hasil.sisa === 0) break;
        // Semua penerima di gelombang ini gagal: mengulang lagi hanya
        // menghantam gateway yang sama. Berhenti dan laporkan alasannya.
        if (hasil.terkirim === 0) break;
      }

      if (terkirim === 0 && gagal === 0) {
        toast.info("Tidak ada penerima baru yang perlu dikirimi pesan.");
      } else if (gagal > 0) {
        toast.warning(
          `${terkirim} pesan terkirim, ${gagal} gagal.${alasan === "" ? "" : ` Alasan terakhir: ${alasan}`}`,
        );
      } else {
        toast.success(`${terkirim} pesan WhatsApp terkirim.`);
      }
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pengiriman WhatsApp gagal.");
    } finally {
      setBusy(null);
      setProgres(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Megaphone className="size-4" aria-hidden="true" />
            Pengingat pembaruan aplikasi
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Mengumumkan versi menaruh satu kabar di pusat notifikasi setiap akun. Pesan WhatsApp
            dikirim terpisah, bertahap, dan tidak pernah dua kali ke nomor yang sama untuk versi
            yang sama.
          </p>
        </div>
        {terbaru !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px] tabular-nums">
              terumumkan: {terbaru.versiNama} · kode {terbaru.versiKode}
            </Badge>
            {terbaru.wajibDiperbarui && (
              <Badge
                variant="outline"
                className="border-amber-300 text-[11px] text-amber-800"
              >
                wajib diperbarui
              </Badge>
            )}
          </div>
        ) : (
          <Badge variant="outline" className="text-[11px]">
            belum ada versi diumumkan
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pembaruan-kode">Kode versi (versionCode)</Label>
              <Input
                id="pembaruan-kode"
                className="mt-1.5 font-mono tabular-nums"
                inputMode="numeric"
                placeholder="2"
                value={kode}
                onChange={(e) => setKode(e.target.value.replace(/[^\d]/g, ""))}
              />
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                Angka yang dibandingkan Android. Harus lebih besar dari versi yang sedang
                terpasang{versiTerbit === null ? "" : ` (versi terbit ${versiTerbit.versiNama} · kode ${versiTerbit.versiKode})`}.
              </p>
            </div>
            <div>
              <Label htmlFor="pembaruan-nama">Nama versi</Label>
              <Input
                id="pembaruan-nama"
                className="mt-1.5"
                placeholder="1.2.0"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
              />
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                Bentuk <code className="font-mono">1.2</code> atau{" "}
                <code className="font-mono">1.2.0</code>.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="pembaruan-tautan">Tautan unduhan</Label>
            <Input
              id="pembaruan-tautan"
              className="mt-1.5 font-mono text-xs"
              value={tautan}
              onChange={(e) => setTautan(e.target.value)}
            />
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {alamatUnduh === null
                ? "Tautan belum bisa dibuka penerima."
                : `Penerima membuka: ${alamatUnduh}`}
            </p>
          </div>

          <div>
            <Label htmlFor="pembaruan-catatan">Catatan (opsional)</Label>
            <Textarea
              id="pembaruan-catatan"
              className="mt-1.5 min-h-20"
              maxLength={MAKS_CATATAN_PEMBARUAN}
              placeholder="Perbaikan layar KYC dan pengingat jatuh tempo."
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <Checkbox
              id="pembaruan-wajib"
              checked={wajib}
              onCheckedChange={(nilai) => setWajib(nilai === true)}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <Label htmlFor="pembaruan-wajib" className="text-xs font-semibold text-navy">
                Wajib diperbarui
              </Label>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                APK dengan kode lebih kecil berhenti di layar “PINDAI perlu diperbarui” dan
                tidak bisa dipakai sampai versi ini terpasang. Tandai hanya setelah berkas APK
                versi ini benar-benar tersedia di tautan di atas.
              </p>
            </div>
          </div>

          {galat !== null && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{galat}</span>
            </p>
          )}

          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => void kirimPengumuman()}
          >
            {busy === "umumkan" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Megaphone className="mr-1.5 size-4" />
            )}
            Umumkan versi
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-xs font-semibold text-navy">Pengingat WhatsApp</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Penerima bernomor</dt>
              <dd className="font-semibold tabular-nums text-navy">{status.jumlahPenerima}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sudah terkirim</dt>
              <dd className="font-semibold tabular-nums text-navy">
                {status.terkirim}
                <span className="font-normal text-muted-foreground"> / {status.jumlahPenerima}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Gagal</dt>
              <dd
                className={cn(
                  "font-semibold tabular-nums",
                  status.gagal > 0 ? "text-amber-700" : "text-navy",
                )}
              >
                {status.gagal}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tanpa nomor sah</dt>
              <dd className="font-semibold tabular-nums text-navy">{status.tanpaNomor}</dd>
            </div>
          </dl>
          {status.duplikat > 0 && (
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              {status.duplikat} akun memakai nomor yang sama — hanya satu pesan dikirim ke nomor itu.
            </p>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 w-full rounded-full"
            disabled={busy !== null || terbaru === null || sisaKirim === 0}
            onClick={() => void kirimPengingat()}
          >
            {busy === "kirim" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-4" />
            )}
            {terbaru === null
              ? "Umumkan versi dulu"
              : sisaKirim === 0
                ? "Semua penerima sudah dikirimi"
                : `Kirim ke ${sisaKirim} penerima`}
          </Button>

          {progres !== null && (
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{progres}</p>
          )}
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            Dikirim lewat gateway yang diatur di panel WhatsApp. Bila gateway belum aktif, pesan
            dicatat gagal — bukan dianggap terkirim.
          </p>
        </div>
      </div>

      {penerima.daftar.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-navy">Penerima versi terbaru</p>
            {penerima.terpotong && (
              <p className="text-[11px] text-muted-foreground">
                Ditampilkan {penerima.daftar.length} dari {penerima.jumlah} penerima.
              </p>
            )}
          </div>
          <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nama
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Nomor WhatsApp
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {penerima.daftar.map((p, i) => (
                  <tr key={`${p.nomor}-${i}`} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-700">{p.nama}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums text-slate-600">{p.nomor}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          p.status === "terkirim"
                            ? "text-emerald-700"
                            : p.status === "gagal"
                              ? "text-amber-700"
                              : "text-slate-500",
                        )}
                      >
                        {labelStatus(p.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
