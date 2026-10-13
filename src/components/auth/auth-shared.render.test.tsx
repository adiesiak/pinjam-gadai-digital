/**
 * Uji render halaman MASUK (`/auth`): latar ambient, kartu glassmorphism,
 * segmented tab, medan + tombol, lencana keamanan, dan navigasi beranda.
 * Run: bun src/components/auth/auth-shared.render.test.tsx
 *
 * Yang dijaga:
 *  1. Token desain yang diminta benar-benar MUNCUL di markup — bukan sekadar
 *     ada di kode: gradient ambient + `min-h-screen` pada latar, `bg-white/85
 *     backdrop-blur-xl` pada kartu, kelas input fokus emerald, tombol hijau
 *     `#064E3B`, tombol WhatsApp peminjam lama, serta lencana keamanan.
 *  2. Segmented tab: "Masuk Akun" AKTIF secara default dan "Akses Cepat" belum
 *     — pintu email tetap yang pertama dilihat pengunjung.
 *  3. `pages/Auth.tsx` memakai potongan ini sambil TETAP memanggil logika
 *     submit yang sama (`handleEmailSubmit`, `signIn("email-otp")`, tamu, dan
 *     pintu kode akses bersama) — merapikan tampilan tidak boleh menyentuh
 *     autentikasi.
 *  4. Navigasi bawah kartu menuju rute publik `/`, dan rute `/auth` tetap
 *     mendarat di `/dashboard` setelah berhasil masuk.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

import {
  BadgeAksesAdmin,
  HitungMundurToken,
  KELAS_KARTU_ADMIN,
  KartuAuth,
  KepalaMerekAuth,
  KepalaPane,
  LatarAuth,
  LencanaKeamanan,
  MedanAdmin,
  MedanEmailMasuk,
  MedanTokenAdmin,
  MeterKekuatanSandi,
  PesanInfo,
  PesanKesalahan,
  TAB_CEPAT,
  TAB_MASUK,
  TabPintuMasuk,
  TautanBeranda,
  TombolAdmin,
  TombolKembaliAdmin,
  TombolLanjutEmail,
  TombolWhatsappPeminjamLama,
} from "@/components/auth/auth-shared";
import { Tabs } from "@/components/ui/tabs";
import { MASA_BERLAKU_TOKEN_DETIK, PANJANG_TOKEN_ADMIN } from "@/lib/authAdmin";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tanpa "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
}
function jumlah(teks: string, bagian: string): number {
  return teks.split(bagian).length - 1;
}
/** Semua komponen memakai `Link`, jadi butuh router (tanpa DOM). */
function render(node: ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>{node}</MemoryRouter>,
  );
}
function bacaSumber(relatif: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relatif}`, import.meta.url)),
    "utf8",
  );
}
/**
 * Isi aturan tab aktif di `src/index.css` — latar & warna hurufnya harus satu
 * paket. Selektor boleh berakhir pengecualian `:not([data-penanda-gerak])`:
 * tab yang menggambar penanda aktifnya sendiri (mis. navigasi dashboard
 * Peminjam) menandai dirinya dengan atribut itu supaya tidak dicat dua kali.
 */
function aturanAktif(css: string): string {
  return (
    /\[data-slot="tabs-trigger"\]\[data-state="active"\]:not\(\[data-penanda-gerak\]\)\s*\{([^}]*)\}/.exec(
      css,
    )?.[1] ?? ""
  );
}

// ===== 1. Latar ambient & kartu glassmorphism =====
{
  const latar = render(
    <LatarAuth>
      <span>isi</span>
    </LatarAuth>,
  );
  ada(
    latar,
    "bg-slate-50 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(6,78,59,0.15),rgba(255,255,255,0))] min-h-screen flex items-center justify-center p-4 text-slate-800",
    "kelas latar halaman persis seperti permintaan",
  );
  ada(latar, 'id="konten"', "latar tetap jadi target tautan lompat-ke-konten");
  ada(latar, 'tabindex="-1"', "konten tetap bisa difokus program");
  ada(latar, "isi", "anak latar dirender");

  const kartu = render(
    <KartuAuth>
      <span>isi</span>
    </KartuAuth>,
  );
  ada(
    kartu,
    "bg-white/85 backdrop-blur-xl border border-white/90 shadow-xl rounded-3xl p-8 max-w-md w-full",
    "kelas kartu glassmorphism persis seperti permintaan",
  );
  ada(kartu, "isi", "anak kartu dirender");
  bersih(kartu, "kartu");
}

// ===== 2. Kepala merek: logo PINDAI + tiga lencana fitur simetris =====
{
  const kepala = render(<KepalaMerekAuth />);
  ada(kepala, "PINDAI", "wordmark PINDAI tampil");
  ada(kepala, "Pinjam &amp; Gadai Digital", "tagline produk tampil");
  ada(kepala, "tracking-[0.22em]", "wordmark ditata rapi (bukan teks polos)");
  ada(kepala, 'href="/"', "logo menuju beranda");
  ada(kepala, "Pencatatan ledger", "lencana fitur ledger tampil");
  ada(kepala, "Pencatatan gadai", "lencana fitur gadai tampil");
  ada(kepala, "Jadwal angsuran", "lencana fitur angsuran tampil");
  ada(kepala, "grid-cols-3", "tiga lencana disusun simetris");
  ok(jumlah(kepala, "<li") === 3, "tepat tiga lencana fitur");
  bersih(kepala, "kepala merek");
}

// ===== 3. Segmented tab: "Masuk Akun" default, "Akses Cepat" pilihan kedua =====
{
  const tab = render(
    <Tabs value={TAB_MASUK}>
      <TabPintuMasuk />
    </Tabs>,
  );
  ada(tab, 'role="tablist"', "segmen punya peran tablist");
  ada(tab, "Masuk Akun", "tab Masuk Akun tampil");
  ada(tab, "Akses Cepat", "tab Akses Cepat tampil");
  ada(tab, "grid-cols-2", "segmen dua kolom simetris");
  ada(tab, "bg-slate-100/80", "segmen punya latar pemisah");
  ok(jumlah(tab, 'role="tab"') === 2, "tepat dua tab");

  const potongan = tab.split('role="tab"');
  ok(potongan.length === 3, "markup tab terbelah tepat dua bagian");
  ok(
    potongan[1].includes("Masuk Akun") &&
      potongan[1].includes('aria-selected="true"'),
    "Masuk Akun aktif secara default (tab pertama)",
  );
  ok(
    potongan[2].includes("Akses Cepat") &&
      potongan[2].includes('aria-selected="false"'),
    "Akses Cepat belum aktif sampai dipilih",
  );
  // KETERBACAAN tab aktif: aturan global `[data-slot="tabs-trigger"]
  // [data-state="active"]` mengecat latar `--primary` (#0f3d3a), jadi teksnya
  // wajib `--primary-foreground` (10,9:1). Sebelumnya komponen ini menulis
  // `text-emerald-900` #43341a yang praktis sebenderang latarnya — 1:1.
  ada(
    tab,
    "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
    "tab aktif memakai pasangan latar/teks yang kontras",
  );
  tidakAda(
    tab,
    "data-[state=active]:text-emerald-900",
    "teks cokelat gelap tidak lagi diwariskan ke atas hijau --primary",
  );
  ada(
    tab,
    "text-slate-600",
    "label pasif memakai slate-600 (5,7:1), bukan slate-500 (3,8:1)",
  );

  // Penjaga akar masalah: aturan globalnya sendiri harus memasang latar DAN
  // warna huruf bersama-sama, supaya pemanggil berikutnya tidak bisa lagi
  // mewariskan teks gelap ke atas `--primary`.
  const sumberCss = bacaSumber("index.css");
  const aturanTab = aturanAktif(sumberCss);
  ok(
    aturanTab.includes("background-color: var(--primary)") &&
      aturanTab.includes("color: var(--primary-foreground)"),
    "aturan tab aktif memasang latar dan warna huruf bersama-sama",
  );
  // Tab yang menggambar penanda aktifnya sendiri harus punya jalan keluar dari
  // aturan global di atas; tanpa `:not([data-penanda-gerak])`, latar `--primary`
  // tetap dicat walau pemanggil menulis `bg-transparent` (spesifisitas 0,3,0
  // mengalahkan utilitas 0,2,0) dan penanda gesernya terlihat dobel.
  ada(
    sumberCss,
    '[data-slot="tabs-trigger"][data-state="active"]:not([data-penanda-gerak])',
    "aturan tab aktif punya pengecualian untuk tab ber-penanda geser",
  );
  bersih(tab, "segmented tab");
}

// ===== 4. Medan email & tombol aksi =====
{
  const medan = render(<MedanEmailMasuk isLoading={false} />);
  ada(medan, "Email atau nomor WhatsApp", "label medan tampil");
  ada(
    medan,
    "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all",
    "kelas input persis seperti permintaan",
  );
  ada(
    medan,
    'name="email"',
    "nama field tetap `email` sehingga FormData submit tidak berubah",
  );
  ada(medan, 'type="email"', "tipe email dipakai untuk papan ketik ponsel");
  ada(medan, 'for="masuk-email"', "label menunjuk medannya");
  ada(medan, 'id="masuk-email"', "medan punya id yang dirujuk label");
  ada(medan, "required", "medan wajib diisi");
  ada(
    medan,
    "Kode verifikasi dikirim ke email",
    "petunjuk menjelaskan kode dikirim ke email",
  );
  ada(
    medan,
    "tekan tombol hijau di bawah",
    "jalan WhatsApp lama diarahkan ke tombolnya",
  );
  bersih(medan, "medan email");

  const utama = render(<TombolLanjutEmail isLoading={false} />);
  ada(utama, "Lanjutkan dengan Email / WhatsApp", "label tombol utama tampil");
  ada(utama, 'type="submit"', "tombol utama mengirim formulir");
  ada(
    utama,
    "w-full mt-3 bg-[#064E3B] hover:bg-[#042F2E] text-white font-medium py-3 rounded-xl shadow-md transition-all active:scale-[0.98]",
    "kelas tombol utama persis seperti permintaan",
  );
  bersih(utama, "tombol utama");

  const utamaMemuat = render(<TombolLanjutEmail isLoading={true} />);
  ada(utamaMemuat, "disabled", "tombol utama nonaktif saat memuat");
  ada(utamaMemuat, "animate-spin", "keadaan memuat terlihat");

  const wa = render(
    <TombolWhatsappPeminjamLama onClick={() => {}} disabled={false} />,
  );
  ada(
    wa,
    "Peminjam lama? Masuk dengan nomor WhatsApp",
    "label tombol WhatsApp tampil",
  );
  ada(wa, 'type="button"', "tombol WhatsApp tidak mengirim formulir email");
  ada(
    wa,
    "w-full py-3 px-4 rounded-xl border border-emerald-600/30 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-900 font-medium flex items-center justify-center gap-2 transition-all mt-3 shadow-2xs",
    "kelas tombol WhatsApp peminjam lama persis seperti permintaan",
  );
  bersih(wa, "tombol WhatsApp");
}

// ===== 5. Judul pane, pesan galat, lencana keamanan, navigasi beranda =====
{
  const pane = render(
    <KepalaPane
      judul="Masuk atau buat akun"
      keterangan="Masuk untuk mencatat."
    />,
  );
  ada(pane, "Masuk atau buat akun", "judul pane tampil");
  ada(pane, "Masuk untuk mencatat.", "keterangan pane tampil");
  ok(jumlah(pane, "<h1") === 1, "satu judul tingkat-1 per pane");
  ok(
    !pane.includes('<div class="mx-auto mb-3'),
    "tanpa ikon: tidak ada kotak ikon kosong",
  );
  bersih(pane, "kepala pane");

  const paneBerikon = render(
    <KepalaPane
      judul="Akses cepat"
      keterangan="Coba sebagai tamu."
      ikon={<span>ikon</span>}
    />,
  );
  ada(paneBerikon, "ikon", "ikon pane dirender saat diberikan");

  const galat = render(
    <PesanKesalahan pesan="Kode verifikasi salah atau kedaluwarsa." />,
  );
  ada(galat, 'role="alert"', "pesan galat diumumkan pembaca layar");
  ada(galat, "Kode verifikasi salah atau kedaluwarsa.", "pesan galat tampil");

  const lencana = render(<LencanaKeamanan />);
  ada(
    lencana,
    "Koneksi Terenkripsi &amp; Dilindungi Audit Trail PINDAI",
    "teks lencana keamanan tampil",
  );
  ada(lencana, "lucide-lock-keyhole", "lencana memakai ikon gembok");

  const beranda = render(<TautanBeranda />);
  ada(beranda, 'href="/"', "navigasi bawah mengarah ke rute /");
  ada(beranda, "Kembali ke Beranda", "label navigasi beranda tampil");
  ada(beranda, "lucide-arrow-left", "navigasi memakai panah kiri");
  tidakAda(
    beranda,
    "Kembali ke halaman login",
    "label lama tidak dipakai lagi",
  );
  bersih(beranda, "navigasi beranda");
}

// ===== 6. Halaman & rute: tampilan dirapikan, autentikasi tetap utuh =====
{
  const halaman = bacaSumber("pages/Auth.tsx");
  ada(
    halaman,
    "useState<TabAuth>(TAB_MASUK)",
    "tab default halaman = Masuk Akun",
  );
  ada(halaman, "<LatarAuth>", "halaman memakai latar ambient bersama");
  // Kolom halaman digenggam di satu lebar dan dipusatkan. Tanpa `max-w-md`,
  // kolomnya `w-full` sehingga `items-center` tidak menggenggam apa pun: kartu
  // masuk (jalur nasabah maupun admin) menempel di tepi kiri layar lebar.
  ada(
    halaman,
    "mx-auto flex w-full max-w-md flex-col items-center",
    "kolom halaman dipusatkan selebar kartu",
  );
  ada(
    halaman,
    "<KartuAuth varian=",
    "halaman memakai kartu glassmorphism bersama",
  );
  ada(halaman, "<TabPintuMasuk />", "halaman memakai segmented tab bersama");
  ada(halaman, "value={TAB_CEPAT}", "tab Akses Cepat jadi wadah opsi cepat");
  ada(halaman, "<MedanEmailMasuk", "halaman memakai medan email bersama");
  ada(halaman, "<TombolLanjutEmail", "halaman memakai tombol utama bersama");
  ada(
    halaman,
    "<TombolWhatsappPeminjamLama",
    "halaman memakai tombol WhatsApp bersama",
  );
  ada(halaman, "<LencanaKeamanan />", "lencana keamanan di dasar kartu");
  // Label jalur admin→nasabah membungkus jadi dua baris di 360px; tanpa
  // `h-auto`, `h-9` bawaan mengunci kotaknya ke 36px sehingga teksnya melimpah
  // keluar kotak dan area ketuknya tidak ikut membesar.
  ada(
    halaman,
    "h-auto w-full text-xs whitespace-normal",
    "tombol alih jalur admin tumbuh mengikuti teksnya",
  );
  ada(halaman, "<TautanBeranda />", "navigasi bawah menuju beranda");
  tidakAda(halaman, "Kembali ke halaman login", "tautan lama sudah diganti");
  tidakAda(
    halaman,
    'Kembali ke halaman login")}',
    "tidak ada sisa tautan lama",
  );

  // Logika autentikasi tidak boleh ikut berubah saat tampilan dirapikan.
  ada(
    halaman,
    "onSubmit={handleEmailSubmit}",
    "submit email tetap handler yang sama",
  );
  ada(halaman, 'signIn("email-otp"', "autentikasi OTP email tidak berubah");
  ada(halaman, 'signIn("anonymous")', "login tamu tidak berubah");
  ada(halaman, "handleGuestLogin", "aksi tamu masih tersedia");
  ada(
    halaman,
    'to="/akses-bersama"',
    "pintu kode akses bersama masih tersedia",
  );
  ada(
    halaman,
    "Lanjut sebagai tamu",
    "opsi tamu kini berada di tab Akses Cepat",
  );
  tidakAda(
    halaman,
    'from "@/components/ui/card"',
    "kartu clay lama tidak dipakai lagi",
  );

  const main = bacaSumber("main.tsx");
  ada(
    main,
    'redirectAfterAuth="/dashboard"',
    "rute /auth tetap mendarat di dashboard",
  );
}

// ===== 7. Jalur SUPER ADMIN: badge, kartu tegas, medan & toggle sandi =====
{
  const badge = render(<BadgeAksesAdmin />);
  ada(badge, "Akses Super Admin Terproteksi", "badge keamanan admin tampil");
  ada(
    badge,
    "bg-emerald-50 text-emerald-800 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-200/50 mb-3 inline-flex items-center gap-1.5",
    "kelas badge admin persis seperti permintaan",
  );
  ada(badge, "lucide-lock", "badge memakai ikon gembok");
  bersih(badge, "badge admin");

  const kartuAdmin = render(
    <KartuAuth varian="admin">
      <span>isi</span>
    </KartuAuth>,
  );
  ada(
    kartuAdmin,
    "bg-white/90 backdrop-blur-xl border border-white/90 shadow-2xl rounded-3xl p-8 max-w-md w-full",
    "kelas kartu admin persis seperti permintaan",
  );
  ok(
    kartuAdmin.includes(KELAS_KARTU_ADMIN),
    "kartu admin memakai varian tegas",
  );

  const medanEmail = render(
    <MedanAdmin
      id="admin-email"
      label="Email Super Admin"
      tipe="email"
      nilai=""
      onUbah={() => {}}
      nonaktif={false}
    />,
  );
  ada(medanEmail, "Email Super Admin", "label medan admin tampil");
  ada(medanEmail, 'id="admin-email"', "medan admin punya id");
  ada(medanEmail, 'for="admin-email"', "label menunjuk medannya");
  ada(medanEmail, 'type="email"', "medan email memakai tipe email");
  ada(
    medanEmail,
    "w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all",
    "kelas input admin persis seperti permintaan",
  );
  tidakAda(medanEmail, "Lihat kata sandi", "medan email tanpa tombol mata");
  bersih(medanEmail, "medan email admin");

  const medanSandi = render(
    <MedanAdmin
      id="admin-password"
      label="Kata sandi"
      tipe="password"
      nilai="rahasia"
      onUbah={() => {}}
      autoComplete="current-password"
      nonaktif={false}
    />,
  );
  ada(medanSandi, 'type="password"', "kata sandi tersembunyi secara default");
  ada(medanSandi, "Lihat kata sandi", "tombol mata tersedia untuk melihat");
  ada(medanSandi, 'aria-pressed="false"', "tombol mata melaporkan keadaannya");
  ada(medanSandi, "pr-12", "medan sandi menyisakan ruang untuk tombol mata");
  ada(medanSandi, "lucide-eye", "ikon mata dirender");
  tidakAda(
    medanSandi,
    "lucide-eye-off",
    "ikon mata-tertutup baru muncul setelah ditekan",
  );
  tidakAda(medanSandi, 'disabled=""', "medan sandi aktif saat tidak memproses");
  bersih(medanSandi, "medan kata sandi admin");

  const medanSibuk = render(
    <MedanAdmin
      id="admin-password"
      label="Kata sandi"
      tipe="password"
      nilai="rahasia"
      onUbah={() => {}}
      nonaktif={true}
    />,
  );
  ada(medanSibuk, 'disabled=""', "medan nonaktif saat memproses");

  const medanMinimal = render(
    <MedanAdmin
      id="activate-admin-password"
      label="Buat kata sandi (minimal 8 karakter)"
      tipe="password"
      nilai=""
      onUbah={() => {}}
      minPanjang={8}
      nonaktif={false}
    />,
  );
  ada(medanMinimal, 'minLength="8"', "panjang minimal diteruskan ke peramban");
}

// ===== 8. Meter kekuatan kata sandi: warna, skor, dan checklist =====
{
  const kosong = render(<MeterKekuatanSandi sandi="" />);
  ada(kosong, "Kekuatan: Belum diisi", "meter kosong menyatakan apa adanya");
  ada(kosong, 'aria-valuenow="0"', "skor 0 diumumkan pembaca layar");
  ada(kosong, "width:0%", "bar kosong saat sandi belum diisi");
  ada(kosong, "8+ Karakter", "syarat panjang tampil");
  ada(kosong, "Huruf Besar &amp; Angka/Simbol", "syarat campuran tampil");
  ok(
    jumlah(kosong, "(belum terpenuhi)") === 2,
    "dua syarat ditandai belum terpenuhi",
  );
  bersih(kosong, "meter kosong");

  const lemah = render(<MeterKekuatanSandi sandi="aaaaaaaa" />);
  ada(lemah, "Kekuatan: Lemah", "8 huruf kecil tetap Lemah");
  ada(lemah, "bg-red-500", "bar merah saat lemah");
  ada(lemah, 'aria-valuenow="1"', "skor 1 diumumkan");
  ok(jumlah(lemah, "(terpenuhi)") === 1, "hanya syarat panjang yang terpenuhi");

  const sedang = render(<MeterKekuatanSandi sandi="KataSandiPanjang" />);
  ada(sedang, "Kekuatan: Sedang", "huruf besar + panjang = Sedang");
  ada(sedang, "bg-amber-400", "bar kuning saat sedang");
  ada(sedang, 'aria-valuenow="2"', "skor 2 diumumkan");
  ok(jumlah(sedang, "(terpenuhi)") === 1, "angka/simbol belum terpenuhi");

  const kuat = render(<MeterKekuatanSandi sandi="Rahasia#2026" />);
  ada(kuat, "Kekuatan: Sangat Kuat", "kombinasi lengkap = Sangat Kuat");
  ada(kuat, "bg-emerald-600", "bar emerald saat sangat kuat");
  ada(kuat, "width:100%", "bar penuh saat sangat kuat");
  ada(kuat, 'aria-valuenow="3"', "skor 3 diumumkan");
  ok(jumlah(kuat, "(terpenuhi)") === 2, "kedua syarat ditandai terpenuhi");
}

// ===== 9. Token 32 karakter: tempel sekali klik & hitung mundur =====
{
  const token = render(
    <MedanTokenAdmin nilai="" onUbah={() => {}} nonaktif={false} />,
  );
  ada(token, "Token verifikasi (32 karakter)", "label token tampil");
  ada(
    token,
    "font-mono tracking-wider bg-slate-50/80",
    "token memakai font monospace di atas latar lembut",
  );
  // Di layar 360px kartu hanya menyisakan ≈264px; medan monospace tanpa
  // `min-w-0` menolak menyusut di samping tombol `shrink-0`, jadi barisnya
  // melampaui tepi kartu dan tombol tempelnya terpotong.
  ada(
    token,
    "min-w-0",
    "medan token boleh menyusut di samping tombol tempel",
  );
  ada(
    token,
    `maxLength="${PANJANG_TOKEN_ADMIN}"`,
    "batas 32 karakter di medan",
  );
  ada(token, "Tempel Token", "tombol tempel token tersedia");
  ada(token, 'type="button"', "tombol tempel tidak mengirim formulir");
  ada(token, "lucide-clipboard-paste", "ikon tempel dirender");
  ada(
    token,
    "spasi &amp; baris baru otomatis dibuang",
    "pembersihan otomatis dijelaskan",
  );
  ada(token, `0/${PANJANG_TOKEN_ADMIN} karakter`, "penghitung karakter tampil");
  bersih(token, "medan token");

  const tokenTerisi = render(
    <MedanTokenAdmin
      nilai={"A".repeat(PANJANG_TOKEN_ADMIN)}
      onUbah={() => {}}
      nonaktif={true}
    />,
  );
  ada(tokenTerisi, "32/32 karakter", "penghitung mengikuti token nyata");
  ada(tokenTerisi, 'disabled=""', "medan token nonaktif saat memproses");

  const baru = render(
    <HitungMundurToken
      mulaiPada={Date.now()}
      onKirimUlang={() => {}}
      sibuk={false}
    />,
  );
  ada(baru, "Token berlaku:", "label hitung mundur tampil");
  ok(
    baru.includes("15:00") || baru.includes("14:59"),
    "token baru mulai dari 15:00 (14:59 bila sudah berjalan)",
  );
  ada(baru, "Kirim Ulang Token", "tombol kirim ulang tersedia");
  ada(baru, "lucide-timer", "ikon timer dirender");
  ada(
    baru.split("Kirim Ulang Token")[0] ?? "",
    'disabled=""',
    "kirim ulang belum aktif selama token masih berlaku",
  );

  const habis = render(
    <HitungMundurToken
      mulaiPada={Date.now() - (MASA_BERLAKU_TOKEN_DETIK + 1) * 1000}
      onKirimUlang={() => {}}
      sibuk={false}
    />,
  );
  ada(habis, "00:00", "token kedaluwarsa tampil 00:00");
  ada(habis, "text-red-600", "angka kedaluwarsa ditandai merah");
  tidakAda(
    habis.split("Kirim Ulang Token")[0] ?? "",
    'disabled=""',
    "kirim ulang aktif begitu masa berlaku habis",
  );

  const tanpaToken = render(
    <HitungMundurToken
      mulaiPada={null}
      onKirimUlang={() => {}}
      sibuk={false}
    />,
  );
  ok(tanpaToken === "", "tanpa token terkirim: hitung mundur tidak dirender");
}

// ===== 10. Tombol utama admin, pesan info & navigasi antar-langkah =====
{
  const tombol = render(
    <TombolAdmin memuat={false} nonaktif={false} ikon={<span>ikon</span>}>
      Kirim token aktivasi
    </TombolAdmin>,
  );
  ada(tombol, 'type="submit"', "tombol admin mengirim formulir");
  for (const kelas of [
    "bg-[#064E3B]",
    "hover:bg-[#042F2E]",
    "text-white",
    "font-medium",
    "py-3",
    "rounded-xl",
    "shadow-md",
    "transition-all",
    "active:scale-[0.98]",
    "w-full",
    "flex",
    "justify-center",
    "items-center",
    "gap-2",
    "mt-4",
  ]) {
    ada(tombol, kelas, `tombol admin memakai kelas ${kelas}`);
  }
  ada(tombol, "Kirim token aktivasi", "label tombol admin tampil");
  ada(tombol, "ikon", "ikon tombol dirender saat tidak memuat");
  tidakAda(tombol, 'disabled=""', "tombol aktif saat input sudah valid");

  const nonaktif = render(
    <TombolAdmin memuat={false} nonaktif={true}>
      Masuk
    </TombolAdmin>,
  );
  ada(nonaktif, 'disabled=""', "tombol nonaktif saat input belum valid");
  ada(nonaktif, "disabled:bg-slate-200", "keadaan nonaktif dibedakan warnanya");

  const memuat = render(
    <TombolAdmin memuat={true} nonaktif={false}>
      Masuk
    </TombolAdmin>,
  );
  ada(memuat, "animate-spin", "spinner berputar saat diproses");
  ada(memuat, 'disabled=""', "tombol terkunci selama diproses");

  const kembali = render(
    <TombolKembaliAdmin onClick={() => {}} nonaktif={false} />,
  );
  ada(kembali, "Kembali ke Login Admin", "navigasi kembali ke login admin");
  ada(kembali, 'type="button"', "tombol kembali tidak mengirim formulir");
  ada(kembali, "lucide-arrow-left", "ikon panah kiri dirender");
  bersih(kembali, "navigasi kembali admin");

  const info = render(<PesanInfo pesan="Token baru sudah dikirim." />);
  ada(info, 'role="status"', "pesan info diumumkan sebagai status");
  ada(info, "Token baru sudah dikirim.", "pesan info tampil");
}

// ===== 11. Halaman admin memakai potongan ini tanpa mengubah alur verifikasi =====
{
  const halaman = bacaSumber("pages/Auth.tsx");
  ada(halaman, "<BadgeAksesAdmin />", "badge keamanan admin dipakai halaman");
  ada(
    halaman,
    'varian={authMode === "admin" ? "admin" : "nasabah"}',
    "kartu admin memakai varian tegas",
  );
  ada(halaman, "<MedanAdmin", "medan admin dipakai halaman");
  ada(halaman, "minPanjang={8}", "syarat 8 karakter diteruskan ke peramban");
  ada(
    halaman,
    "<MeterKekuatanSandi sandi={newPassword} />",
    "meter kekuatan sandi dipakai",
  );
  ada(halaman, "<MedanTokenAdmin", "medan token 32 karakter dipakai");
  ada(halaman, "<HitungMundurToken", "hitung mundur token dipakai");
  ada(halaman, "<TombolAdmin", "tombol utama admin dipakai");
  ada(halaman, "<TombolKembaliAdmin", "navigasi kembali antar-langkah dipakai");
  ada(halaman, "kirimUlangToken", "kirim ulang token tersedia");
  ada(halaman, "pesanGalatAdmin", "terjemahan galat dipusatkan di lib");
  ada(halaman, 'signIn("password"', "autentikasi kata sandi tidak berubah");
  ada(halaman, 'flow: "signUp"', "aktivasi tetap memakai flow signUp");
  ada(halaman, 'flow: "reset"', "reset tetap memakai flow reset");
  ada(halaman, '"email-verification"', "verifikasi aktivasi tetap sama");
  ada(halaman, '"reset-verification"', "verifikasi reset tetap sama");
  tidakAda(
    halaman,
    "Kembali ke masuk admin",
    "label lama diganti menjadi Kembali ke Login Admin",
  );
  tidakAda(
    halaman,
    'from "@/components/ui/card"',
    "kartu clay lama tetap tidak dipakai",
  );
}

console.log(`auth-shared.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
