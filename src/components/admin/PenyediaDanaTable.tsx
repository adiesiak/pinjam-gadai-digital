import { useMutation, useQuery } from "convex/react";
import {
  IdCard,
  Loader2,
  MoreHorizontal,
  Search,
  UserCheck,
  UserRoundCog,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";

import { TombolMasukSebagai } from "./MasukSebagaiDialog";
import { TombolUbahAkunPendana } from "./UbahAkunPendanaDialog";

/**
 * DAFTAR AKUN PENDANA & PEMANTAU — satu tabel, tanpa pengulangan.
 *
 * Hanya menampilkan akun beserta peran, status akses, dan tindakannya;
 * pemberian akses lewat email, pembuatan pendana baru, dan kode akses bersama
 * dikelola di kartu lain pada tab "Manajemen Akun & Hak Akses". Sakelar per
 * baris memanggil mutation `penyediaDana.ubahAkses` yang sama — memberi atau
 * mencabut akses lihat-saja tanpa menyentuh catatan pengajuan, dan tercatat di
 * Audit Trail.
 *
 * Kolom Tindakan memuat dua pekerjaan yang hanya boleh dilakukan Super Admin:
 *  - `penyediaDana.ubahAkunPendana` — isi/perbaiki nama & email login akun;
 *  - pratinjau "masuk sebagai" — sesi nyata akun itu, lihat
 *    `components/admin/MasukSebagaiDialog.tsx`.
 *
 * Keduanya diringkas menjadi satu menu "Kelola", pola yang sama dengan tombol
 * Kelola di Plafon Nasabah: dua tombol lebar per baris mendorong kolom lain
 * sampai terpotong di layar 1366, sedangkan isinya tetap sama.
 *
 * Akun pemantau bersama (peran `pengamat`) tidak punya sakelar maupun tindakan:
 * masa berlakunya ditentukan oleh kode akses bersama (terbit/nonaktif), bukan
 * per akun, dan sesinya terikat perangkat sehingga tidak dapat dipratinjau.
 *
 * Bagian tampilan (`TabelAkunPendana`) tetap MURNI — tindakannya datang lewat
 * prop `renderAksi`, jadi tabel ini masih bisa dirender & diuji tanpa Convex.
 */

/**
 * Bentuk minimal baris yang dibaca tabel ini — sengaja lebih kecil dari baris
 * `daftarInvestor` supaya bagian tampilan bisa dirender & diuji tanpa Convex.
 */
export type BarisAkunTampil = {
  userId: string;
  nama: string;
  email: string | null;
  /** Nomor WhatsApp login; dipakai formulir kelola akun. */
  nomorWhatsApp?: string | null;
  peran: string | null;
  peranLegacy: boolean;
  akunBersama: boolean;
  aksesAktif: boolean;
};

/** Kelas kartu bersama panel ini. */
const KARTU = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";

/** Inisial 1–2 huruf untuk avatar akun. */
function inisial(nama: string): string {
  const bagian = nama.trim().split(/\s+/).filter((b) => b !== "");
  const depan = bagian[0] ?? "";
  const belakang = bagian[bagian.length - 1] ?? "";
  const hasil = (depan.charAt(0) + belakang.charAt(0)).toUpperCase();
  return hasil === "" ? "?" : hasil;
}

/** Label + gaya lencana peran akun ([Pendana] / [Pengamat]). */
function labelPeran(r: BarisAkunTampil): { label: string; kelas: string } {
  if (r.akunBersama) {
    return { label: "Pengamat", kelas: "border-0 bg-slate-100 text-slate-700 hover:bg-slate-100" };
  }
  if (r.peranLegacy) {
    return {
      label: "Pendana (lama)",
      kelas: "border-0 bg-amber-50 text-amber-800 hover:bg-amber-50",
    };
  }
  return {
    label: "Pendana",
    kelas: "border-primary/20 bg-primary/5 text-primary hover:bg-primary/5",
  };
}

/**
 * Bagian tampilan MURNI: kartu + tabel daftar akun. `baris === undefined`
 * berarti masih dimuat (rangka daftar). Dipakai uji render.
 */
export function TabelAkunPendana({
  baris,
  busy,
  terpotong = false,
  batas,
  onUbahAkses,
  renderAksi,
}: {
  baris: readonly BarisAkunTampil[] | undefined;
  busy: string | null;
  terpotong?: boolean;
  batas?: number;
  onUbahAkses: (r: BarisAkunTampil, aktif: boolean) => void;
  /** Kolom Tindakan; tidak dirender bila tidak diberikan. */
  renderAksi?: (r: BarisAkunTampil) => ReactNode;
}) {
  const [cari, setCari] = useState("");
  const kueri = cari.trim().toLowerCase();
  const tampil = useMemo(
    () =>
      (baris ?? []).filter(
        (r) =>
          kueri === "" ||
          r.nama.toLowerCase().includes(kueri) ||
          (r.email ?? "").toLowerCase().includes(kueri),
      ),
    [baris, kueri],
  );
  const jumlahAkses = baris === undefined ? 0 : baris.filter((r) => r.aksesAktif).length;

  return (
    <section className={KARTU}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <UserCheck className="size-4" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Daftar Akun Pendana &amp; Pemantau</h3>
            <p className="text-xs text-muted-foreground">
              Sakelar memberi atau mencabut akses lihat-saja ke ruang pendana.
            </p>
          </div>
        </div>
        {baris !== undefined && (
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            {baris.length} akun · {jumlahAkses} aktif
          </Badge>
        )}
      </header>

      {baris === undefined ? (
        <div className="mt-4">
          <SkeletonBarisDaftar baris={4} />
        </div>
      ) : baris.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center text-xs text-muted-foreground">
          Belum ada akun pendana atau pemantau. Buat pendana baru atau beri akses pada kartu di atas.
        </p>
      ) : (
        <>
          <div className="relative mt-4">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={cari}
              onChange={(event) => setCari(event.target.value)}
              placeholder="Cari nama atau email akun…"
              aria-label="Cari akun pendana atau pemantau berdasarkan nama atau email"
              className="h-11 pl-9 pr-11"
            />
            {cari !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Bersihkan pencarian akun"
                className="absolute right-0 top-1/2 size-11 -translate-y-1/2 text-muted-foreground"
                onClick={() => setCari("")}
              >
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </div>

          <p className="mt-2 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
            {kueri === ""
              ? `Menampilkan ${tampil.length} akun`
              : `${tampil.length} dari ${baris.length} akun cocok dengan “${cari.trim()}”`}
          </p>

          {tampil.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center text-xs text-muted-foreground">
              <p>Tidak ada akun yang cocok dengan pencarian ini.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 min-h-11"
                onClick={() => setCari("")}
              >
                Tampilkan semua akun
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-3 hidden overflow-hidden rounded-xl border border-slate-200 md:block">
                <Table
                  containerClassName="max-h-[30rem] overflow-y-auto"
                  className="[&_td]:whitespace-normal [&_td]:align-middle"
                >
                  <TableCaption className="sr-only">
                    Daftar akun pendana beserta peran, status akses, dan tindakan admin
                  </TableCaption>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      {[
                        "Akun",
                        "Peran",
                        "Status",
                        "Akses",
                        ...(renderAksi === undefined ? [] : ["Tindakan"]),
                      ].map((kolom) => (
                        <TableHead
                          key={kolom}
                          scope="col"
                          className={`text-xs font-semibold text-slate-600 ${
                            kolom === "Akses" || kolom === "Tindakan"
                              ? "text-right"
                              : ""
                          }`}
                        >
                          {kolom}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tampil.map((r) => {
                      const peran = labelPeran(r);
                      return (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/5 text-xs font-bold text-primary">
                                {inisial(r.nama)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{r.nama}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {r.email ?? "tanpa email"}
                                </p>
                                {r.nomorWhatsApp != null && (
                                  <p className="truncate text-[11px] text-slate-500">
                                    WhatsApp {r.nomorWhatsApp}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={peran.kelas}>{peran.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                r.aksesAktif
                                  ? "border-success-border bg-success-soft text-success-foreground hover:bg-success-soft"
                                  : "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
                              }
                            >
                              {r.aksesAktif ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.akunBersama ? (
                              <span className="text-[11px] text-muted-foreground">via kode bersama</span>
                            ) : r.email === null ? (
                              <span className="text-[11px] text-muted-foreground">tanpa email</span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                {busy === r.userId && (
                                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                )}
                                <Switch
                                  checked={r.aksesAktif}
                                  disabled={busy === r.userId}
                                  aria-label={`${r.aksesAktif ? "Cabut" : "Beri"} akses untuk ${r.nama}`}
                                  onCheckedChange={(v) => onUbahAkses(r, v)}
                                />
                              </span>
                            )}
                          </TableCell>
                          {renderAksi !== undefined && (
                            <TableCell className="text-right">{renderAksi(r)}</TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <ul className="mt-3 space-y-3 md:hidden">
                {tampil.map((r) => {
                  const peran = labelPeran(r);
                  return (
                    <li
                      key={r.userId}
                      className="rounded-xl border border-slate-200 bg-white p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/5 text-xs font-bold text-primary">
                            {inisial(r.nama)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {r.nama}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {r.email ?? "tanpa email"}
                            </p>
                            {r.nomorWhatsApp != null && (
                              <p className="truncate text-[11px] text-slate-500">
                                WhatsApp {r.nomorWhatsApp}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge className={peran.kelas}>{peran.label}</Badge>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Status akses</p>
                          <Badge
                            className={
                              r.aksesAktif
                                ? "mt-1 border-success-border bg-success-soft text-success-foreground hover:bg-success-soft"
                                : "mt-1 border-0 bg-slate-100 text-slate-600 hover:bg-slate-100"
                            }
                          >
                            {r.aksesAktif ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        {r.akunBersama ? (
                          <span className="text-[11px] text-muted-foreground">via kode bersama</span>
                        ) : r.email === null ? (
                          <span className="text-[11px] text-muted-foreground">tanpa email</span>
                        ) : (
                          <span className="inline-flex min-h-11 items-center gap-2">
                            {busy === r.userId && (
                              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                            )}
                            <Switch
                              checked={r.aksesAktif}
                              disabled={busy === r.userId}
                              aria-label={`${r.aksesAktif ? "Cabut" : "Beri"} akses untuk ${r.nama}`}
                              onCheckedChange={(v) => onUbahAkses(r, v)}
                            />
                          </span>
                        )}
                      </div>

                      {renderAksi !== undefined && (
                        <div className="mt-3 flex justify-end">{renderAksi(r)}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {baris !== undefined && terpotong && (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Menampilkan {batas ?? 0} akun pertama. Gunakan pencarian bila akun yang dicari tidak tampil.
        </p>
      )}
    </section>
  );
}

/**
 * Satu menu aksi per akun pendana.
 *
 * Isinya dua pekerjaan yang sebelumnya tampil sebagai dua tombol terpisah.
 * Dialognya tetap komponen yang sama; menu hanya menjadi pemicunya, jadi alur
 * konfirmasi, pemulihan sesi, dan pesan gagal tidak bercabang. Tiap baris punya
 * instance sendiri, sehingga state dialog tidak berpindah antar akun.
 */
function MenuKelolaPendana({
  targetId,
  nama,
  email,
  nomorWhatsApp,
}: {
  targetId: string;
  nama: string;
  email: string | null;
  nomorWhatsApp: string | null;
}) {
  const [ubahTerbuka, setUbahTerbuka] = useState(false);
  const [masukTerbuka, setMasukTerbuka] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="min-h-9 gap-1.5 rounded-lg bg-primary px-2.5 text-xs text-primary-foreground hover:bg-primary/90 max-md:min-h-11"
            aria-label={`Kelola ${nama}`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
            Kelola
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => setUbahTerbuka(true)}
            className="gap-2 py-2"
          >
            <IdCard
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            {email === null ? "Isi data login" : "Ubah data login"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setMasukTerbuka(true)}
            className="gap-2 py-2"
          >
            <UserRoundCog
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Masuk sebagai
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TombolUbahAkunPendana
        targetId={targetId}
        nama={nama}
        email={email}
        nomorWhatsApp={nomorWhatsApp}
        terbuka={ubahTerbuka}
        onTerbukaChange={setUbahTerbuka}
        tampilkanTombol={false}
      />
      <TombolMasukSebagai
        targetId={targetId}
        nama={nama}
        tujuan="ruang pendana"
        terbuka={masukTerbuka}
        onTerbukaChange={setMasukTerbuka}
        tampilkanTombol={false}
      />
    </>
  );
}

export function PenyediaDanaTable() {
  const daftar = useQuery(api.penyediaDana.daftarInvestor, {});
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);
  const [busy, setBusy] = useState<string | null>(null);

  const ubah = async (r: BarisAkunTampil, aktif: boolean) => {
    if (r.email === null) {
      toast.error("Akun ini tidak punya email — akses tidak bisa diubah dari sini.");
      return;
    }
    setBusy(r.userId);
    try {
      const hasil = await ubahAkses({
        email: r.email,
        aktif,
        alasan: `Ubah akses dari daftar akun (${aktif ? "aktif" : "nonaktif"}).`,
      });
      toast.success(
        hasil.sudahSesuai
          ? `Akses ${r.email} sudah ${aktif ? "aktif" : "nonaktif"}.`
          : `${aktif ? "Akses diberikan ke" : "Akses dicabut dari"} ${r.email}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah akses.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <TabelAkunPendana
      baris={daftar?.rows}
      busy={busy}
      terpotong={daftar?.terpotong}
      batas={daftar?.batas}
      onUbahAkses={(r, aktif) => void ubah(r, aktif)}
      renderAksi={(r) =>
        r.akunBersama ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          <MenuKelolaPendana
            targetId={r.userId}
            nama={r.nama}
            email={r.email}
            nomorWhatsApp={r.nomorWhatsApp ?? null}
          />
        )
      }
    />
  );
}
