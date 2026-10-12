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
  KartuAuth,
  KepalaMerekAuth,
  KepalaPane,
  LatarAuth,
  LencanaKeamanan,
  MedanEmailMasuk,
  PesanKesalahan,
  TAB_CEPAT,
  TAB_MASUK,
  TabPintuMasuk,
  TautanBeranda,
  TombolLanjutEmail,
  TombolWhatsappPeminjamLama,
} from "@/components/auth/auth-shared";
import { Tabs } from "@/components/ui/tabs";

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
    "nama field tetap `email` — FormData submit tidak berubah",
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
  ada(halaman, "<KartuAuth>", "halaman memakai kartu glassmorphism bersama");
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

console.log(`auth-shared.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
