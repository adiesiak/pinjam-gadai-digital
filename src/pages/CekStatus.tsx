import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck } from "lucide-react";

import { KartuVerifikasi, type StatusVerifikasi } from "@/components/cekStatus/KartuVerifikasi";
import {
  RingkasanTagihan,
  type RingkasanKwitansi,
} from "@/components/cekStatus/RingkasanTagihan";
import { VaultLogo } from "@/components/VaultLogo";
import { Button } from "@/components/ui/button";
import {
  ambilKerangkaSelfie,
  asalSitusCekStatus,
  bukaKamera,
  kirimJson,
  matikanKamera,
  mintaLokasi,
  pesanGagalVerifikasi,
  tungguVideoSiap,
  unggahSelfie,
  urlEndpointCekStatus,
} from "@/lib/cekStatus";
import { TAUTAN_KEBIJAKAN } from "@/lib/tautanStatus";

/**
 * HALAMAN PUBLIK `/cek-status/<token>` — pintu masuk dari pesan WhatsApp admin.
 *
 * Susunannya mengikuti alur yang diminta produk, dengan satu perubahan yang
 * disengaja: **pengambilan data dinyatakan terbuka** (kartu verifikasi memuat
 * penjelasannya sebelum peminjam menekan tombol), bukan dilakukan diam-diam.
 * Izin kamera & lokasi tetap wajib diminta browser, jadi menyembunyikan
 * tujuannya hanya membuat halaman terasa menipu tanpa menambah keamanan.
 *
 * Urutan kerjanya:
 *  1. Tautan dikenali lewat `tautanStatus.bukaTautan` (token 128 bit per pinjaman).
 *  2. Peminjam menekan "Izinkan & mulai verifikasi" → kamera depan + satu bacaan GPS.
 *  3. Satu kerangka video dikodekan ulang jadi JPEG ≤ 500 KB lalu diunggah;
 *     pengambilan berhenti seketika setelah kerangka terambil (kamera tidak
 *     dibiarkan hidup di latar belakang).
 *  4. Server mencatat foto + waktu + koordinat + IP/UA sebagai audit verifikasi;
 *     setelah itu rincian tagihan terbuka.
 *  5. Selama halaman terbuka, titik lokasi dikirim ulang setiap 10 detik ke
 *     `live_locations` sehingga peta live admin ikut diperbarui.
 */

/** Jeda ping lokasi selama halaman terbuka (ms) — 10 detik sesuai ketentuan. */
const JEDA_PING_MS = 10_000;

export default function CekStatus() {
  const { token = "" } = useParams<{ token: string }>();
  const info = useQuery(
    api.tautanStatus.infoTautan,
    token === "" ? "skip" : { token },
  );
  const catatBuka = useMutation(api.tautanStatus.bukaTautan);

  const [tahap, setTahap] = useState<StatusVerifikasi>("siap");
  const [pesan, setPesan] = useState<string | null>(null);
  const [pingTerakhir, setPingTerakhir] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sudahCatatBuka = useRef(false);

  const urlTitik = useMemo(() => urlEndpointCekStatus("titik"), []);
  const urlUnggah = useMemo(() => urlEndpointCekStatus("url-unggah"), []);
  const urlVerifikasi = useMemo(() => urlEndpointCekStatus("verifikasi"), []);

  /** Catat satu kali bahwa halaman dibuka (agar admin melihat respons nasabah). */
  useEffect(() => {
    if (info === undefined || !info.valid || sudahCatatBuka.current || token === "") return;
    sudahCatatBuka.current = true;
    void catatBuka({ token }).catch(() => {
      // Pencatatan kunjungan bersifat pelengkap: kegagalannya tidak boleh
      // menghalangi peminjam melihat kwitansinya.
    });
  }, [info, token, catatBuka]);

  /** Kamera tidak pernah dibiarkan hidup saat halaman ditinggalkan. */
  useEffect(() => {
    return () => {
      matikanKamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  /**
   * Ping lokasi berkala setelah verifikasi berhasil. Dijalankan sekali saat
   * masuk tahap "selesai", lalu tiap 10 detik; berhenti saat halaman ditutup
   * atau tab disembunyikan (tidak ada gunanya membangunkan radio HP untuk
   * halaman yang tidak dilihat).
   */
  useEffect(() => {
    if (tahap !== "selesai" || urlTitik === null || token === "") return;
    let dibatalkan = false;

    const kirim = async () => {
      if (document.visibilityState !== "visible") return;
      const lokasi = await mintaLokasi();
      if (dibatalkan || !lokasi.ok) return;
      const hasil = await kirimJson<{ waktu?: number }>(urlTitik, {
        token,
        lat: lokasi.titik.lat,
        lng: lokasi.titik.lng,
        akurasi: lokasi.titik.akurasi,
      });
      if (!dibatalkan && hasil.ok && typeof hasil.data?.waktu === "number") {
        setPingTerakhir(hasil.data.waktu);
      }
    };

    void kirim();
    const jam = window.setInterval(() => void kirim(), JEDA_PING_MS);
    return () => {
      dibatalkan = true;
      window.clearInterval(jam);
    };
  }, [tahap, urlTitik, token]);

  /** Seluruh langkah verifikasi: kamera → kerangka → unggah → catat di server. */
  const jalankanVerifikasi = async () => {
    setPesan(null);
    setTahap("memproses");

    const asal = asalSitusCekStatus();
    if (asal === null) {
      setTahap("gagal");
      setPesan("Halaman ini terbuka tanpa konfigurasi server. Hubungi petugas PINDAI.");
      return;
    }

    const kamera = await bukaKamera();
    if (!kamera.ok) {
      setTahap("gagal");
      setPesan(pesanGagalVerifikasi(kamera.pesan));
      return;
    }
    streamRef.current = kamera.stream;

    try {
      const video = videoRef.current;
      if (video === null) {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi("Elemen kamera tidak siap. Muat ulang halaman lalu coba lagi."));
        return;
      }
      video.srcObject = kamera.stream;
      try {
        await video.play();
      } catch {
        // Sebagian browser menolak autoplay; kerangka tetap bisa diambil selama
        // metadata video sudah siap, jadi kegagalan ini tidak menggagalkan alur.
      }
      const siap = await tungguVideoSiap(video);
      if (!siap) {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi("Kamera belum menghasilkan gambar. Coba lagi sebentar lagi."));
        return;
      }

      const lokasi = await mintaLokasi();
      const dataUrl = ambilKerangkaSelfie(video);
      // Kamera dimatikan segera setelah kerangka terambil — tidak ada waktu
      // tambahan saat kamera menyala tanpa dipakai.
      matikanKamera(streamRef.current);
      streamRef.current = null;

      if (dataUrl === null) {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi("Foto selfie tidak berhasil diambil. Coba ambil ulang."));
        return;
      }

      if (urlUnggah === null || urlVerifikasi === null) {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi("Alamat server verifikasi tidak tersedia."));
        return;
      }

      const izin = await kirimJson<{ url?: string }>(urlUnggah, { token });
      if (!izin.ok || typeof izin.data?.url !== "string") {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi(izin.error ?? "Server belum mengizinkan pengunggahan foto."));
        return;
      }

      const unggah = await unggahSelfie(dataUrl, izin.data.url);
      if (!unggah.ok) {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi(unggah.pesan));
        return;
      }

      const kirim = await kirimJson<{ waktu?: number }>(urlVerifikasi, {
        token,
        fileId: unggah.fileId,
        diambilPada: Date.now(),
        ...(lokasi.ok
          ? { lat: lokasi.titik.lat, lng: lokasi.titik.lng, akurasi: lokasi.titik.akurasi }
          : {}),
      });
      if (!kirim.ok) {
        setTahap("gagal");
        setPesan(pesanGagalVerifikasi(kirim.error ?? "Verifikasi belum bisa disimpan."));
        return;
      }

      setTahap("selesai");
      setPesan(
        lokasi.ok
          ? "Verifikasi diterima. Rincian tagihan Anda terbuka di bawah ini; lokasi akan diperbarui setiap 10 detik selama halaman terbuka."
          : `Verifikasi diterima. ${lokasi.pesan} Rincian tagihan Anda tetap terbuka di bawah ini.`,
      );
    } finally {
      matikanKamera(streamRef.current);
      streamRef.current = null;
    }
  };

  const ringkasan = info?.valid === true ? (info.ringkasan as RingkasanKwitansi) : null;
  const bolehLihatRincian = info?.valid === true && (tahap === "selesai" || info.sudahVerifikasi);
  const tampilkanRincian = ringkasan !== null && (bolehLihatRincian || tahap === "gagal");

  return (
    <main id="konten" tabIndex={-1} className="min-h-dvh bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="flex items-center gap-3">
          <VaultLogo size={36} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">PINDAI · Cek Status Kwitansi</p>
            <p className="text-xs text-muted-foreground">
              Halaman resmi rincian tagihan &amp; konfirmasi kwitansi digital.
            </p>
          </div>
        </header>

        {info === undefined && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Memuat rincian tagihan…
          </div>
        )}

        {info !== undefined && !info.valid && (
          <section className="rounded-2xl border border-amber-200 bg-white p-5">
            <h1 className="text-base font-semibold text-navy">Tautan tidak dapat dipakai</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{info.pesan}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/">Kembali ke beranda PINDAI</Link>
            </Button>
          </section>
        )}

        {info !== undefined && info.valid && (
          <>
            <KartuVerifikasi
              status={tahap}
              pesan={pesan}
              onMulai={() => void jalankanVerifikasi()}
              sudahVerifikasi={info.sudahVerifikasi}
            />

            {tahap === "selesai" && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900"
              >
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Pembaruan lokasi otomatis aktif
                  {pingTerakhir === null
                    ? " — titik pertama sedang dikirim."
                    : ` — titik terakhir dikirim ${new Date(pingTerakhir).toLocaleTimeString("id-ID")}.`}
                </span>
              </p>
            )}

            {tampilkanRincian && ringkasan !== null && (
              <RingkasanTagihan ringkasan={ringkasan} terverifikasi={bolehLihatRincian} />
            )}

            <p className="text-center text-[11px] leading-5 text-muted-foreground">
              Ukuran foto yang diterima paling banyak{" "}
              {Math.round(TAUTAN_KEBIJAKAN.maksByteSelfie / 1024)} KB dan tautan berlaku{" "}
              {TAUTAN_KEBIJAKAN.masaBerlakuHari} hari. Jangan bagikan tautan ini — siapa pun yang
              memegangnya bisa membuka rincian pinjaman Anda.
            </p>
          </>
        )}
      </div>

      {/* Elemen video hanya sumber gambar: sengaja disembunyikan dari tata letak
          dan dari pembaca layar, tanpa pratinjau interaktif. */}
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
      />
    </main>
  );
}
