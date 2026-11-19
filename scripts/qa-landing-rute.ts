/**
 * Harness SSR beranda publik: tujuan tombol akun per peran.
 *
 * Beranda pernah menautkan `/admin`, jalur yang bukan rute nyata, sehingga akun
 * admin yang menekan tombol akun mendarat di halaman 404; panel admin ada di
 * rute yang disamarkan (`ADMIN_ROUTE`). Halaman dirender apa adanya dengan sesi
 * distub, karena `useAuth` membaca Convex lewat hook.
 *
 * Run: bun scripts/qa-landing-rute.ts
 */
import { mock } from "bun:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { ADMIN_ROUTE } from "@/lib/routes";
import { KONTEN_LANDING_DEFAULT } from "@/lib/landing-cms";

type Sesi = { isAuthenticated: boolean; user: { role?: string } | undefined };

let sesi: Sesi = { isAuthenticated: false, user: undefined };

/**
 * Beranda membaca teks dari `announcements.getPublic`. Harness ini tidak punya
 * deployment Convex, jadi hook-nya diganti nilai tetap: `undefined` untuk
 * membuktikan fallback bawaan, atau objek `landing` untuk membuktikan teks CMS
 * benar-benar dipakai.
 */
let cmsUji: { landing: typeof KONTEN_LANDING_DEFAULT } | undefined;
/** Kampanye promo untuk penempatan beranda; kosong berarti tidak ada promo. */
let promoUji:
  | {
      badge: string;
      judul: string;
      deskripsi: string;
      mulai: number;
      selesai: number;
    }
  | undefined;

const { getFunctionName } = await import("convex/server");
const convexReact = await import("convex/react");
mock.module("convex/react", () => ({
  ...convexReact,
  // Tiap query dibedakan dari referensinya, bukan dari bentuk argumen: banner
  // promo (`promoPinjaman.promoAktif`) juga dipanggil dengan argumen, jadi
  // menebak lewat argumen membuat kampanye uji tidak pernah muncul.
  useQuery: (query: unknown) => {
    let nama = "";
    try {
      nama = getFunctionName(query as never);
    } catch {
      nama = "";
    }
    if (nama === "announcements:getPublic") return cmsUji;
    if (nama === "promoPinjaman:promoAktif") return promoUji ?? null;
    // `bolehTampilkanBannerPromo` hanya membuka banner setelah data promo bunga
    // TERMUAT dan kosong — `undefined` justru menahannya. Jadi daftar kosong,
    // bukan undefined.
    if (nama === "promoBunga:berjalan") return [];
    return undefined;
  },
}));

mock.module("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: sesi.isAuthenticated,
    isAnonymous: false,
    user: sesi.user,
    signIn: async () => undefined,
    signOut: async () => undefined,
  }),
}));

const { default: LandingHome } = await import("@/pages/LandingHome");

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}
const ada = (markup: string, teks: string, nama: string) =>
  cek(`${nama} (memuat ${teks})`, markup.includes(teks));
const tidakAda = (markup: string, teks: string, nama: string) =>
  cek(`${nama} (tidak memuat ${teks})`, !markup.includes(teks));

/** Render beranda dengan satu sesi uji. */
function render(s: Sesi): string {
  sesi = s;
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(LandingHome)),
  );
}

// 1. Akun admin: tombol akun menuju panel admin, bukan jalur lama.
{
  const markup = render({ isAuthenticated: true, user: { role: "admin" } });
  ada(markup, `href="${ADMIN_ROUTE}"`, "akun admin diarahkan ke panel admin");
  tidakAda(markup, 'href="/admin"', "tidak ada tautan ke jalur lama /admin");
}

// 2. Akun nasabah dan pendana: dashboard, tanpa rute panel admin.
for (const role of ["peminjam", "dana"]) {
  const markup = render({ isAuthenticated: true, user: { role } });
  ada(markup, 'href="/dashboard"', `peran ${role} diarahkan ke dashboard`);
  tidakAda(markup, 'href="/admin"', `peran ${role} tidak ke jalur lama`);
  tidakAda(markup, ADMIN_ROUTE, `peran ${role} tidak diberi rute panel admin`);
}

// 3. Belum masuk: halaman masuk.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(
    markup,
    'href="/auth?returnTo=%2Fdashboard%3Ftab%3Dform"',
    "tamu diarahkan ke halaman masuk dengan tujuan formulir",
  );
  tidakAda(markup, ADMIN_ROUTE, "tamu tidak diberi rute panel admin");
}

// 4. Bagian pemasangan tidak lagi ditempel di beranda. Pengunjung diarahkan
//    ke halaman /aplikasi agar hanya ada satu jalur pemasangan.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  tidakAda(markup, "Pasang aplikasi", "beranda tidak menampilkan kartu pasang");
  tidakAda(
    markup,
    'href="/pindai.apk"',
    "beranda tidak menautkan berkas APK langsung",
  );
  tidakAda(markup, "play.google", "beranda tidak menautkan Play Store");
  tidakAda(markup, "apps.apple", "beranda tidak menautkan App Store");
}

// 5. Teks CMS benar-benar dipakai beranda — bukan hanya tersimpan di database.
{
  cmsUji = {
    landing: {
      ...KONTEN_LANDING_DEFAULT,
      heroJudul1: "Judul dari CMS",
      layanan: KONTEN_LANDING_DEFAULT.layanan.map((kartu, i) =>
        i === 0 ? { ...kartu, judul: "Kartu dari CMS" } : kartu,
      ),
      panduan: KONTEN_LANDING_DEFAULT.panduan.map((item, i) =>
        i === 1 ? { ...item, isi: "Panduan dari CMS." } : item,
      ),
      footerDeskripsi: "Footer dari CMS.",
    },
  };
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, "Judul dari CMS", "judul hero memakai teks CMS");
  ada(markup, "Kartu dari CMS", "kartu layanan memakai teks CMS");
  ada(markup, "Panduan dari CMS.", "panduan memakai teks CMS");
  ada(markup, "Footer dari CMS.", "footer memakai teks CMS");
  tidakAda(
    markup,
    KONTEN_LANDING_DEFAULT.heroJudul1,
    "teks bawaan tidak menimpa teks CMS",
  );
  cmsUji = undefined;
}

// 6. Menu aplikasi: satu tautan di navigasi beranda menuju halaman /aplikasi.
//    Nav desktop sengaja berhenti di lima tujuan (lihat `TAUTAN_NAV`), jadi
//    labelnya hanya ada di menu ponsel dan footer — bukan di header lebar.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, 'href="/aplikasi"', "beranda menautkan halaman unduh aplikasi");
  ada(markup, "Aplikasi Android", "menu ponsel menyebut aplikasi Android");
}

// 7. Skema imbal hasil pendana tidak diumumkan di beranda. Angka itu hanya
//    untuk pendana yang sudah diberi akses lewat ruang pendana, bukan halaman
//    publik yang juga dibaca calon peminjam.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  tidakAda(markup, "Imbal hasil", "beranda tidak menyebut imbal hasil pendana");
  tidakAda(markup, "30% p.p.", "beranda tidak menyebut yield pendana");
  tidakAda(markup, "siklus 30 hari", "beranda tidak menyebut siklus pendana");
}

// 8. Kampanye promo dari admin benar-benar muncul di beranda, dan tidak ada
//    saat admin belum menerbitkannya.
{
  const tanpaPromo = render({ isAuthenticated: false, user: undefined });
  tidakAda(
    tanpaPromo,
    "promo-pinjaman-beranda",
    "beranda tanpa promo tidak menampilkan banner",
  );

  const sekarang = Date.now();
  promoUji = {
    badge: "Promo uji beranda",
    judul: "Kampanye dari panel admin",
    deskripsi: "Teks ini datang dari kampanye yang diterbitkan admin.",
    mulai: sekarang - 86_400_000,
    selesai: sekarang + 86_400_000,
  };
  const denganPromo = render({ isAuthenticated: false, user: undefined });
  ada(denganPromo, "Kampanye dari panel admin", "beranda menampilkan kampanye aktif");
  ada(denganPromo, "Promo uji beranda", "label kampanye ikut tampil");
  ada(
    denganPromo,
    'href="/auth?returnTo=%2Fdashboard%3Ftab%3Dform"',
    "CTA kampanye menuju formulir",
  );
  promoUji = undefined;
}

// 9. Bagian yang ditambahkan agar pengunjung tidak perlu membuka halaman lain
//    untuk melihat angka, alur, dan kanal bantuan.
{
  const markup = render({ isAuthenticated: false, user: undefined });
  ada(markup, 'id="kalkulator"', "beranda memasang kalkulator interaktif");
  // Hero sengaja tidak memakai anchor `#kalkulator` sebagai CTA utama: tamu
  // diarahkan ke halaman masuk dengan tujuan formulir (lihat
  // `LandingHome.rute.test.ts`), sedangkan kalkulator dijangkau dari CTA
  // sekunder `/biaya` dan panduan.
  ada(markup, "Total pelunasan", "kalkulator menampilkan total pelunasan");
  ada(markup, "Kepercayaan", "beranda menampilkan blok kepercayaan");
  ada(markup, 'href="/privasi"', "blok kepercayaan menautkan privasi");
  ada(
    markup,
    "Citra Kebun Mas, Karawang",
    "alamat kantor tampil di halaman",
  );
  ada(
    markup,
    'href="mailto:support@pindai.biz.id"',
    "email resmi bisa dihubungi dari halaman",
  );
  ada(markup, "Lihat demo", "demo alur ditawarkan tanpa membanjiri halaman");
  tidakAda(
    markup,
    "Demo berjalan sendiri",
    "isi demo tidak dirender sebelum diminta",
  );
  ada(markup, 'id="dokumen-judul"', "beranda menjelaskan alur & dokumen");
  ada(markup, 'id="panduan-title"', "panduan tampil setelah dokumen");
  ada(markup, "Selfie sambil memegang KTP", "dokumen verifikasi disebut");
  ada(markup, 'id="faq-beranda-judul"', "pertanyaan umum tampil di beranda");
  ada(markup, 'id="banding-judul"', "tabel banding produk ada");
  ada(markup, "Murabahah", "kolom syariah menyebut akadnya");
  ada(
    markup,
    'href="/akses-bersama"',
    "ruang pendana tetap dapat dijangkau dari footer",
  );
  ada(
    markup,
    'href="/pemenang"',
    "program apresiasi tetap dapat dijangkau dari footer",
  );
  tidakAda(
    markup,
    'href="/jadi-pendana"',
    "beranda tetap tidak menautkan proposal pendanaan",
  );
  tidakAda(
    markup,
    'id="pendana-judul"',
    "strip ruang pendana keluar dari alur beranda",
  );
  tidakAda(
    markup,
    'id="doorprize-ringkas-judul"',
    "doorprize keluar dari alur beranda",
  );
  ada(markup, "wa.me", "footer menyediakan kanal WhatsApp CS");
  ada(markup, 'aria-label="Aksi cepat"', "aksi lengket ponsel tersedia");
  ada(markup, "Ajukan pinjaman", "CTA tamu memakai kata ajukan");

  const iDokumen = markup.indexOf('id="dokumen-judul"');
  const iPanduan = markup.indexOf('id="panduan-title"');
  const iFaq = markup.indexOf('id="faq-beranda-judul"');
  const iPenutup = markup.indexOf('id="penutup-judul"');
  cek(
    "urutan dokumen → panduan → FAQ → penutup",
    iDokumen !== -1 &&
      iPanduan > iDokumen &&
      iFaq > iPanduan &&
      iPenutup > iFaq,
  );
}

console.log(`qa-landing-rute: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
