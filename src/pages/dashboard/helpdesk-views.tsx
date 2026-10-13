/**
 * Tab "Bantuan" — pengaduan nasabah (helpdesk dua arah).
 *
 * Sebelum ini pengaduan HANYA bisa dibuat petugas dari panel admin: nasabah yang
 * menemukan tagihan salah harus menelepon lebih dulu, lalu petugas mencatatnya.
 * Tab ini menutup lingkaran itu — nasabah menulis sendiri, membaca balasan, dan
 * menambah keterangan — tanpa membuka kemampuan memutuskan: status, penugasan,
 * dan penyelesaian tetap milik petugas.
 *
 * Ketahanan mobile yang dijaga di sini (bagian dari audit mobile):
 *  - **Draf tidak hilang**: tulisan disimpan berkala di `sessionStorage` lewat
 *    `lib/drafPengaduan.ts`, sehingga berpindah ke WhatsApp/galeri lalu kembali
 *    (atau halaman dimuat ulang) tidak menghapus tulisan.
 *  - **Sinyal kembali dari latar**: `useMobileLifecycle` memberi tahu halaman
 *    dipulihkan; tab ini memakainya untuk memberi tahu bahwa draf dikembalikan
 *    dan menandainya selesai dipulihkan (`markRestored`).
 *  - **Peringatan meninggalkan halaman** saat masih ada tulisan yang belum
 *    terkirim, agar tidak ada pengaduan yang batal karena tidak sengaja.
 *
 * Yang TIDAK dilakukan: tidak ada notifikasi baru yang dibuat dari sisi klien,
 * tidak ada status yang dikarang, dan tidak ada balasan otomatis.
 */
import { useMutation, useQuery } from "convex/react";
import { HelpCircle, Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCegahTinggalkan } from "@/hooks/use-cegah-tinggalkan";
import { useMobileLifecycle } from "@/hooks/useMobileLifecycle";
import {
  bacaDrafPengaduan,
  drafBerisi,
  hapusDrafPengaduan,
  simpanDrafPengaduan,
} from "@/lib/drafPengaduan";
import {
  nadaPrioritasPengaduan,
  nadaStatusPengaduan,
  ringkasAsalPesanTerakhir,
} from "@/lib/pengaduanStatus";
import {
  KATEGORI_PENGADUAN,
  LABEL_KATEGORI_PENGADUAN,
  PANJANG_MIN_PENGADUAN,
} from "@/lib/penagihan";

import { EmptyState } from "./empty-state";
import { formatDate } from "./shared";

export type PengaduanSaya = {
  _id: Id<"pengaduanNasabah">;
  nomorReferensi: string | null;
  kanal: string;
  kategori: string;
  kategoriLabel: string;
  isi: string;
  status: string;
  statusLabel: string;
  prioritas: string;
  prioritasLabel: string;
  penyelesaian: string | null;
  dibuatPada: number;
  diperbaruiPada: number;
  ditutupPada: number | null;
  jumlahPesan: number;
  pesanTerakhir: string | null;
  pesanTerakhirArah: string | null;
  pesanTerakhirPada: number | null;
  bolehBalas: boolean;
};

export type PesanUtasSaya = {
  _id: Id<"pengaduanPesan">;
  arah: string;
  isi: string;
  penulisLabel: string;
  dibuatPada: number;
};

/**
 * Daftar pesan satu utas — komponen MURNI (tanpa server) supaya dapat diuji
 * dengan render statis.
 */
export function DaftarPesanPengaduan({ pesan }: { pesan: PesanUtasSaya[] }) {
  if (pesan.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Belum ada pesan pada pengaduan ini.</p>;
  }
  return (
    <ul className="space-y-2">
      {pesan.map((m) => (
        <li
          key={m._id}
          className={
            m.arah === "nasabah"
              ? "rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"
              : "rounded-lg border border-slate-200 bg-white px-3 py-2"
          }
        >
          <p className="text-[11px] font-medium text-muted-foreground">
            {m.arah === "nasabah" ? "Anda" : "Petugas PINDAI"} · {m.penulisLabel} ·{" "}
            {formatDate(m.dibuatPada)}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-slate-700">{m.isi}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Satu baris pengaduan milik nasabah — MURNI, tanpa query. `isi` percakapan
 * dibuka pemanggil, supaya komponen ini tetap bisa diuji tanpa server.
 */
export function BarisPengaduanSaya({
  pengaduan,
  terbuka,
  onToggle,
}: {
  pengaduan: PengaduanSaya;
  terbuka: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-navy">
            {pengaduan.kategoriLabel} · {pengaduan.statusLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {pengaduan.nomorReferensi ?? "tanpa catatan pinjaman"} · dikirim{" "}
            {formatDate(pengaduan.dibuatPada)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className={nadaPrioritasPengaduan(pengaduan.prioritas)}>
            Prioritas {pengaduan.prioritasLabel}
          </Badge>
          <Badge className={nadaStatusPengaduan(pengaduan.status)}>{pengaduan.statusLabel}</Badge>
        </div>
      </div>

      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{pengaduan.isi}</p>

      {pengaduan.penyelesaian !== null && (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
          <b>Penyelesaian dari petugas:</b> {pengaduan.penyelesaian}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {pengaduan.jumlahPesan} pesan
          {ringkasAsalPesanTerakhir(pengaduan.pesanTerakhirArah) === ""
            ? ""
            : ` · ${ringkasAsalPesanTerakhir(pengaduan.pesanTerakhirArah)}`}
          {pengaduan.ditutupPada !== null ? ` · ditutup ${formatDate(pengaduan.ditutupPada)}` : ""}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-0"
          onClick={onToggle}
        >
          <MessageSquare className="mr-2 size-4" />
          {terbuka ? "Tutup percakapan" : "Lihat percakapan"}
        </Button>
      </div>
    </li>
  );
}

/** Utas + kotak balasan untuk satu pengaduan (mengambil datanya sendiri). */
function PercakapanPengaduan({ pengaduan }: { pengaduan: PengaduanSaya }) {
  const data = useQuery(api.penagihan.pesanPengaduanSaya, { pengaduanId: pengaduan._id });
  const balas = useMutation(api.penagihan.balasPengaduanSaya);
  const [pesan, setPesan] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      {data === undefined ? (
        <p className="text-[11px] text-muted-foreground" role="status">
          Memuat percakapan…
        </p>
      ) : (
        <DaftarPesanPengaduan pesan={data as unknown as PesanUtasSaya[]} />
      )}

      {pengaduan.bolehBalas ? (
        <div className="space-y-2">
          <Label htmlFor={`balas-${pengaduan._id}`}>Tambah keterangan</Label>
          <Textarea
            id={`balas-${pengaduan._id}`}
            value={pesan}
            onChange={(e) => setPesan(e.target.value)}
            rows={2}
            enterKeyHint="send"
            placeholder="Tambahkan informasi yang membantu petugas menindaklanjuti."
          />
          {galat !== null && (
            <p role="alert" className="text-xs text-destructive">
              {galat}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-0"
              disabled={busy || !drafBerisi(pesan)}
              onClick={async () => {
                setBusy(true);
                setGalat(null);
                try {
                  await balas({ pengaduanId: pengaduan._id, isi: pesan });
                  toast.success("Keterangan Anda terkirim.");
                  setPesan("");
                } catch (err) {
                  setGalat(
                    err instanceof Error
                      ? err.message
                      : "Keterangan gagal dikirim. Coba lagi sebentar lagi.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Kirim keterangan
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Pengaduan ini sudah ditutup petugas. Bila masih ada yang perlu ditangani, kirim pengaduan
          baru dan sebutkan nomor pengaduan sebelumnya.
        </p>
      )}
    </div>
  );
}

/** Kunci draf di sessionStorage dipisah supaya tidak menimpa draf lain. */
export function HelpdeskSayaView({
  loans,
}: {
  loans: ReadonlyArray<{ _id: Id<"loans">; nomorReferensi: string }>;
}) {
  const data = useQuery(api.penagihan.pengaduanSaya);
  const buka = useMutation(api.penagihan.bukaPengaduanSaya);
  const { state: lifecycle, markRestored } = useMobileLifecycle();

  // Draf dibaca SEKALI lewat penginisialisasi state (bukan di dalam efek):
  // nilainya sudah benar pada render pertama, sehingga tidak ada render
  // berantai dan tidak ada tulisan pengguna yang ditimpa sesudahnya.
  const [drafAwal] = useState(() => {
    const draf = bacaDrafPengaduan();
    return draf !== null && drafBerisi(draf.isi) ? draf : null;
  });
  const [kategori, setKategori] = useState<string>(drafAwal?.kategori ?? KATEGORI_PENGADUAN[0]);
  const [isi, setIsi] = useState(drafAwal?.isi ?? "");
  const [loanId, setLoanId] = useState<string>(drafAwal?.loanId ?? "__umum__");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [terbuka, setTerbuka] = useState<Record<string, boolean>>({});

  const kotor = drafBerisi(isi);
  const perluDicegah = useCegahTinggalkan(kotor);

  // Pemberitahuan draf dipulihkan dipisah ke timer: efek tidak boleh menyetel
  // keadaan secara sinkron (aturan repo), dan pesan singkat tidak perlu muncul
  // di tengah render.
  useEffect(() => {
    if (drafAwal === null) return;
    const id = setTimeout(() => {
      toast.info("Draf pengaduan Anda dipulihkan.");
    }, 0);
    return () => clearTimeout(id);
  }, [drafAwal]);

  // Sinyal "halaman kembali dari aplikasi lain": pastikan draf yang masih ada
  // dilaporkan kepada pengguna, lalu tandai pemulihan selesai supaya tidak
  // diulang oleh konsumen lain.
  useEffect(() => {
    if (!lifecycle.isPageRestored) return;
    const id = setTimeout(() => {
      const draf = bacaDrafPengaduan();
      if (draf !== null && drafBerisi(draf.isi)) {
        toast.info("Draf pengaduan Anda masih tersimpan.");
      }
      markRestored();
    }, 0);
    return () => clearTimeout(id);
  }, [lifecycle.isPageRestored, markRestored]);

  // Simpan draf berkala (500 ms setelah ketikan terakhir). Menulis di setiap
  // ketikan membuat perangkat mobile terasa berat.
  useEffect(() => {
    if (!kotor) return;
    const id = setTimeout(() => simpanDrafPengaduan({ kategori, isi, loanId: loanId === "__umum__" ? null : loanId }), 500);
    return () => clearTimeout(id);
  }, [kategori, isi, loanId, kotor]);

  const daftar = useMemo(() => (data ?? []) as unknown as PengaduanSaya[], [data]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <HelpCircle className="size-4 text-primary" /> Ajukan pengaduan
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Sampaikan hal yang tidak sesuai pada catatan PINDAI — mis. nominal yang berbeda atau
          prosedur petugas. Pengaduan ditinjau petugas; keputusan tetap ada di tangan mereka dan
          tercatat pada pengaduan ini.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pengaduan-kategori-saya">Kategori</Label>
            <Select value={kategori} onValueChange={setKategori}>
              <SelectTrigger id="pengaduan-kategori-saya" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KATEGORI_PENGADUAN.map((k) => (
                  <SelectItem key={k} value={k}>
                    {LABEL_KATEGORI_PENGADUAN[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pengaduan-loan-saya">Catatan pinjaman (opsional)</Label>
            <Select value={loanId} onValueChange={setLoanId}>
              <SelectTrigger id="pengaduan-loan-saya" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__umum__">Tidak untuk pinjaman tertentu</SelectItem>
                {loans.map((l) => (
                  <SelectItem key={l._id} value={l._id}>
                    {l.nomorReferensi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3">
          <Label htmlFor="pengaduan-isi-saya">
            Uraian (min. {PANJANG_MIN_PENGADUAN} karakter)
          </Label>
          <Textarea
            id="pengaduan-isi-saya"
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            rows={4}
            placeholder="Tuliskan yang terjadi apa adanya, beserta tanggalnya bila ingat."
          />
        </div>

        {perluDicegah && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Draf ini tersimpan otomatis di perangkat Anda, jadi pindah aplikasi atau memuat ulang
            halaman tidak menghilangkannya. Draf hilang bila tab ditutup.
          </p>
        )}

        {galat !== null && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {galat}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            className="min-h-11 w-full sm:min-h-0 sm:w-auto"
            disabled={busy || isi.trim().length < PANJANG_MIN_PENGADUAN}
            onClick={async () => {
              setBusy(true);
              setGalat(null);
              try {
                await buka({
                  kategori,
                  isi,
                  ...(loanId === "__umum__" ? {} : { loanId: loanId as Id<"loans"> }),
                });
                hapusDrafPengaduan();
                setIsi("");
                setLoanId("__umum__");
                toast.success("Pengaduan terkirim. Petugas akan meninjaunya.");
              } catch (err) {
                setGalat(
                  err instanceof Error
                    ? err.message
                    : "Pengaduan gagal dikirim. Periksa sambungan lalu coba lagi.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            Kirim pengaduan
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-navy">Pengaduan saya</p>
        {data === undefined ? (
          <p role="status" className="text-xs text-muted-foreground">
            Memuat pengaduan…
          </p>
        ) : daftar.length === 0 ? (
          <EmptyState
            icon={HelpCircle}
            title="Belum ada pengaduan"
            body="Pengaduan Anda tampil di sini beserta status, balasan petugas, dan penyelesaiannya."
          />
        ) : (
          <ul className="space-y-3">
            {daftar.map((p) => (
              <div key={p._id}>
                <BarisPengaduanSaya
                  pengaduan={p}
                  terbuka={terbuka[p._id] === true}
                  onToggle={() =>
                    setTerbuka((m) => ({ ...m, [p._id]: !(m[p._id] === true) }))
                  }
                />
                {terbuka[p._id] === true && (
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <PercakapanPengaduan pengaduan={p} />
                  </div>
                )}
              </div>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
