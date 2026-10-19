import { useMutation, useQuery } from "convex/react";
import { BellRing, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { labelKanalAktif, type KanalNotifikasi } from "@/lib/preferensiNotifikasi";

type NilaiOverride = { whatsapp: boolean; email: boolean };

/**
 * Kartu notifikasi per nasabah — bagian MURNI supaya teks dan keadaan
 * "ditahan sakelar global" bisa diuji tanpa server.
 *
 * Dua lapis ditampilkan terpisah: pilihan nasabah dan apakah kanal itu benar-
 * benar berjalan. Admin tidak perlu menghitung sendiri aturan `global && nasabah`.
 */
export function KartuNotifikasiNasabah({
  nilai,
  nomorWhatsapp,
  emailAlamat,
  efektifWhatsapp,
  efektifEmail,
  globalWhatsapp,
  globalEmail,
  sibuk,
  galat,
  onUbah,
}: {
  nilai: NilaiOverride;
  nomorWhatsapp: string | null;
  emailAlamat: string | null;
  efektifWhatsapp: boolean;
  efektifEmail: boolean;
  globalWhatsapp: boolean;
  globalEmail: boolean;
  sibuk: KanalNotifikasi | null;
  galat: string | null;
  onUbah: (kanal: KanalNotifikasi, aktif: boolean) => void;
}) {
  const baris = [
    {
      kanal: "whatsapp" as const,
      judul: "WhatsApp",
      ikon: MessageCircle,
      tujuan: nomorWhatsapp,
      kosong: "Nasabah belum punya nomor WhatsApp.",
      efektif: efektifWhatsapp,
      global: globalWhatsapp,
    },
    {
      kanal: "email" as const,
      judul: "Email",
      ikon: Mail,
      tujuan: emailAlamat,
      kosong: "Nasabah belum punya alamat email.",
      efektif: efektifEmail,
      global: globalEmail,
    },
  ];
  const adaYangDitahan = baris.some((b) => nilai[b.kanal] && !b.global);

  return (
    <section
      aria-labelledby="judul-notifikasi-nasabah"
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="judul-notifikasi-nasabah"
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            <BellRing className="size-4" aria-hidden /> Notifikasi nasabah ini
          </h3>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Pengingat tagihan lewat WhatsApp dan email. Sakelar global di Pengaturan Sistem tetap
            berlaku untuk semua akun.
          </p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {baris.map(({ kanal, judul, ikon: Ikon, tujuan, kosong, efektif, global }) => {
          const aktif = nilai[kanal];
          const idTujuan = `notif-nasabah-${kanal}-tujuan`;
          return (
            <li key={kanal} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Ikon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-navy">{judul}</p>
                <p id={idTujuan} className="text-[11px] leading-4 text-muted-foreground">
                  {tujuan ?? kosong}
                </p>
                <p
                  className={
                    efektif
                      ? "text-[10px] font-medium text-emerald-700"
                      : "text-[10px] font-medium text-amber-700"
                  }
                >
                  {efektif
                    ? "Pengingat berjalan"
                    : aktif && !global
                      ? "Ditahan sakelar global"
                      : "Pengingat tidak dikirim"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500">
                  {labelKanalAktif(aktif)}
                </span>
                <Switch
                  checked={aktif}
                  disabled={sibuk !== null}
                  onCheckedChange={(checked) => onUbah(kanal, checked)}
                  aria-label={`Pengingat ${judul} untuk nasabah ini`}
                  aria-describedby={idTujuan}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {adaYangDitahan && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
          Pilihan nasabah aktif, tetapi sakelar global sedang mati. Nyalakan sakelar global di
          Pengaturan Sistem agar pengingat berjalan.
        </p>
      )}

      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-[11px] text-slate-500">
        {sibuk === null ? "" : "Menyimpan pilihan…"}
      </p>
      {galat !== null && (
        <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">
          {galat}
        </p>
      )}
    </section>
  );
}

/** Pembungkus data untuk satu nasabah; hanya dirender di panel admin. */
export function PengaturanNotifikasiNasabah({ userId }: { userId: Id<"users"> }) {
  const data = useQuery(api.notifikasiNasabah.preferensiNasabah, { userId });
  const simpan = useMutation(api.notifikasiNasabah.simpanPreferensiNasabah);
  const [lokal, setLokal] = useState<NilaiOverride | null>(null);
  const [sibuk, setSibuk] = useState<KanalNotifikasi | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="sr-only">Memuat pengaturan notifikasi nasabah…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  const nilai: NilaiOverride = lokal ?? { whatsapp: data.whatsapp, email: data.email };
  const efektifWhatsapp = data.globalWhatsapp && nilai.whatsapp;
  const efektifEmail = data.globalEmail && nilai.email;

  const ubah = async (kanal: KanalNotifikasi, aktif: boolean) => {
    const baru: NilaiOverride = { ...nilai, [kanal]: aktif };
    setLokal(baru);
    setSibuk(kanal);
    setGalat(null);
    try {
      await simpan({ userId, ...baru });
      setLokal(null);
    } catch (error) {
      setLokal(null);
      setGalat(
        error instanceof Error
          ? error.message
          : "Pilihan notifikasi nasabah gagal disimpan. Coba lagi.",
      );
    } finally {
      setSibuk(null);
    }
  };

  return (
    <KartuNotifikasiNasabah
      nilai={nilai}
      nomorWhatsapp={data.nomorWhatsapp}
      emailAlamat={data.emailAlamat}
      efektifWhatsapp={efektifWhatsapp}
      efektifEmail={efektifEmail}
      globalWhatsapp={data.globalWhatsapp}
      globalEmail={data.globalEmail}
      sibuk={sibuk}
      galat={galat}
      onUbah={(kanal, aktif) => void ubah(kanal, aktif)}
    />
  );
}
