import { useMutation, useQuery } from "convex/react";
import { BellRing, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  labelKanalAktif,
  type KanalNotifikasi,
  type PreferensiNotifikasi as NilaiPreferensi,
} from "@/lib/preferensiNotifikasi";

type BarisKanal = {
  kanal: KanalNotifikasi;
  judul: string;
  tujuan: string | null;
  keteranganKosong: string;
  ikon: typeof MessageCircle;
};

/**
 * Kartu pengaturan kanal pengingat — bagian MURNI (tanpa server) supaya bentuk
 * dan teksnya bisa diuji dengan render statis.
 *
 * Sakelar diberi label teks "Aktif"/"Nonaktif" di sampingnya: posisi sakelar
 * saja bukan penanda yang cukup bagi pembaca layar maupun pengguna yang tidak
 * bisa membedakan warna.
 */
export function KartuPreferensiNotifikasi({
  nilai,
  nomorWhatsapp,
  emailAlamat,
  sibuk,
  galat,
  onUbah,
}: {
  nilai: NilaiPreferensi;
  nomorWhatsapp: string | null;
  emailAlamat: string | null;
  sibuk: KanalNotifikasi | null;
  galat: string | null;
  onUbah: (kanal: KanalNotifikasi, aktif: boolean) => void;
}) {
  const baris: BarisKanal[] = [
    {
      kanal: "whatsapp",
      judul: "WhatsApp",
      tujuan: nomorWhatsapp,
      keteranganKosong: "Belum ada nomor WhatsApp. Lengkapi di Data diri.",
      ikon: MessageCircle,
    },
    {
      kanal: "email",
      judul: "Email",
      tujuan: emailAlamat,
      keteranganKosong: "Akun ini belum punya alamat email.",
      ikon: Mail,
    },
  ];

  return (
    <section
      aria-labelledby="judul-preferensi-notifikasi"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="judul-preferensi-notifikasi"
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            <BellRing className="size-4" aria-hidden /> Pengingat tagihan
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Pilih kanal pengingat jatuh tempo dan angsuran. Notifikasi di aplikasi tetap tersimpan
            walau kedua kanal dimatikan.
          </p>
        </div>
        <span className="text-[11px] font-medium text-slate-500">Berlaku untuk akun ini</span>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
        {baris.map(({ kanal, judul, tujuan, keteranganKosong, ikon: Ikon }) => {
          const aktif = nilai[kanal];
          const idKeterangan = `notif-${kanal}-tujuan`;
          return (
            <li key={kanal} className="flex items-start gap-3 px-3 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Ikon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy">{judul}</p>
                <p id={idKeterangan} className="text-[11px] leading-4 text-muted-foreground">
                  {tujuan ?? keteranganKosong}
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
                  aria-label={`Pengingat lewat ${judul}`}
                  aria-describedby={idKeterangan}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-sky-700" aria-hidden />
        <p className="text-[11px] leading-4 text-sky-900">
          Kode OTP masuk dan peringatan keamanan tetap dikirim lewat WhatsApp, apa pun pilihan di
          atas.
        </p>
      </div>

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

/**
 * Pembungkus data kartu pengaturan kanal.
 *
 * Yang disimpan di state lokal hanya perubahan yang sedang dikirim. Setelah
 * server menjawab, tampilan kembali mengikuti query — jadi tidak ada dua salinan
 * pilihan yang bisa berbeda diam-diam.
 */
export function PreferensiNotifikasi() {
  const { isAuthenticated, isAnonymous } = useAuth();
  const boleh = isAuthenticated && !isAnonymous;
  const data = useQuery(api.notifikasiPreferensi.saya, boleh ? {} : "skip");
  const simpan = useMutation(api.notifikasiPreferensi.simpan);
  const [lokal, setLokal] = useState<NilaiPreferensi | null>(null);
  const [sibuk, setSibuk] = useState<KanalNotifikasi | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  // Setelah server menyiarkan nilai barunya, tampilan kembali mengikuti query.
  // Dijadwalkan sebagai microtask: setState langsung di badan efek dilarang
  // aturan react-hooks (pola yang sama dipakai pusat notifikasi).
  const whatsappServer = data?.whatsapp;
  const emailServer = data?.email;
  useEffect(() => {
    if (whatsappServer === undefined || emailServer === undefined) return;
    queueMicrotask(() => setLokal(null));
  }, [whatsappServer, emailServer]);

  if (!boleh) return null;

  if (data === undefined) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-5 py-6">
        <span className="sr-only">Memuat pilihan notifikasi…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  const nilai: NilaiPreferensi = lokal ?? { whatsapp: data.whatsapp, email: data.email };

  const ubah = async (kanal: KanalNotifikasi, aktif: boolean) => {
    const baru: NilaiPreferensi = { ...nilai, [kanal]: aktif };
    setLokal(baru);
    setSibuk(kanal);
    setGalat(null);
    try {
      await simpan(baru);
    } catch (error) {
      setLokal(null);
      setGalat(
        error instanceof Error
          ? error.message
          : "Pilihan notifikasi gagal disimpan. Coba lagi.",
      );
    } finally {
      setSibuk(null);
    }
  };

  return (
    <KartuPreferensiNotifikasi
      nilai={nilai}
      nomorWhatsapp={data.nomorWhatsapp}
      emailAlamat={data.emailAlamat}
      sibuk={sibuk}
      galat={galat}
      onUbah={(kanal, aktif) => void ubah(kanal, aktif)}
    />
  );
}
