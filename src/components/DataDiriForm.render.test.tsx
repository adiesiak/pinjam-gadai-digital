/**
 * Uji render form data diri nasabah.
 * Run: bun src/components/DataDiriForm.render.test.tsx
 *
 * Form ini dipakai bersama oleh panel admin (`admin/DataDiriDialog`) dan
 * sunting mandiri nasabah (dashboard). Keduanya membaca Convex sehingga tidak
 * bisa dirender di luar aplikasi; bagian yang murni — `FormDataDiri` — dirender
 * di sini dengan callback palsu. Yang dijaga: isian menampilkan nilai yang ada,
 * foto KTP punya jalur unggah/ganti/hapus yang benar, galat terlihat, dan
 * markup tidak pernah membocorkan "undefined"/"NaN".
 */
import { renderToStaticMarkup } from "react-dom/server";

import { FormDataDiri, type FormDataDiriProps } from "./DataDiriForm";

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
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

function props(overrides: Partial<FormDataDiriProps> = {}): FormDataDiriProps {
  return {
    nama: "Rani Puspita",
    awal: {
      namaLengkap: "Rani Puspita",
      nik: "3271012345678901",
      nomorWhatsApp: "6281234567890",
      alamat: "Jalan Merdeka No. 10, Bandung",
      pekerjaan: "Karyawan swasta",
      penghasilan: "5.000.000",
      namaBank: "BCA",
      nomorRekening: "1234567890",
    },
    fotoKtpUrl: "https://example.test/ktp.png",
    sebelumnya: "Terakhir diperbarui 8/10/2026 oleh admin@pindai.test",
    unggah: async () => "kg2abc" as never,
    busy: false,
    error: null,
    onSimpan: () => {},
    onBatal: () => {},
    ...overrides,
  };
}

// ===== 1. Data lengkap + foto KTP =====
{
  const html = renderToStaticMarkup(<FormDataDiri {...props()} />);
  ada(html, "Rani Puspita", "nama nasabah tampil");
  ada(html, 'value="3271012345678901"', "NIK terisi dari data tersimpan");
  ada(html, 'value="6281234567890"', "nomor WhatsApp terisi");
  ada(html, "Jalan Merdeka No. 10, Bandung", "alamat terisi");
  ada(html, 'value="5.000.000"', "penghasilan diformat");
  ada(html, 'value="BCA"', "nama bank terisi");
  ada(html, "https://example.test/ktp.png", "pratinjau foto KTP memakai URL tersimpan");
  ada(html, "Ganti foto", "tombol ganti foto tersedia saat sudah ada foto");
  ada(html, "Simpan data diri", "tombol simpan tersedia");
  ok(!html.includes("Belum ada foto KTP"), "tidak mengklaim belum ada foto padahal ada");
  bersih(html, "form lengkap");
}

// ===== 2. Belum ada foto KTP =====
{
  const html = renderToStaticMarkup(<FormDataDiri {...props({ fotoKtpUrl: null })} />);
  ada(html, "Belum ada foto KTP", "kabar belum ada foto");
  ada(html, "Unggah foto", "tombol unggah foto (bukan ganti)");
  ok(!html.includes("Ganti foto"), "tidak menampilkan tombol ganti tanpa foto");
  bersih(html, "form tanpa foto");
}

// ===== 3. Nasabah belum pernah diisi (isian dikosongkan) =====
{
  const html = renderToStaticMarkup(
    <FormDataDiri
      {...props({
        awal: {
          namaLengkap: "",
          nik: "",
          nomorWhatsApp: "",
          alamat: "",
          pekerjaan: "",
          penghasilan: "",
          namaBank: "",
          nomorRekening: "",
        },
        fotoKtpUrl: null,
        sebelumnya: "Data diri belum pernah diisi.",
      })}
    />,
  );
  ada(html, "Data diri belum pernah diisi.", "kabar belum pernah diisi");
  ada(html, 'placeholder="16 angka"', "placeholder NIK tampil");
  ada(html, 'placeholder="6281234567890"', "placeholder WhatsApp tampil");
  bersih(html, "form kosong");
}

// ===== 4. Galat terlihat =====
{
  const html = renderToStaticMarkup(
    <FormDataDiri {...props({ error: "Nomor KTP (NIK) harus terdiri dari 16 angka." })} />,
  );
  ada(html, 'role="alert"', "galat ditandai sebagai alert");
  ada(html, "Nomor KTP (NIK) harus terdiri dari 16 angka.", "pesan galat dari server tampil");
  bersih(html, "form bergalat");
}

// ===== 5. Galat per isian: hanya setelah disentuh / setelah Simpan =====
// Markup statis menggambarkan keadaan AWAL (belum ada isian disentuh), jadi
// pesan per isian TIDAK boleh muncul walau isian wajibnya masih kosong.
{
  const html = renderToStaticMarkup(
    <FormDataDiri
      {...props({
        awal: {
          namaLengkap: "",
          nik: "",
          nomorWhatsApp: "",
          alamat: "",
          pekerjaan: "",
          penghasilan: "",
          namaBank: "",
          nomorRekening: "",
        },
        fotoKtpUrl: null,
      })}
    />,
  );
  ok(
    !html.includes("Nama lengkap wajib"),
    "formulir yang belum disentuh tidak menampilkan galat wajib",
  );
  ok(!html.includes('aria-invalid="true"'), "belum ada isian ditandai tidak sah saat awal");
  bersih(html, "form kosong tanpa galat");
}

// ===== 6. Semua isian punya label + kaitan ke pesan galatnya =====
{
  const html = renderToStaticMarkup(<FormDataDiri {...props()} />);
  const id = ["dd-nama", "dd-nik", "dd-wa", "dd-alamat", "dd-pekerjaan", "dd-penghasilan", "dd-bank", "dd-rekening"];
  for (const k of id) {
    ok(html.includes(`for="${k}"`), `isian ${k} punya label yang menunjuk padanya`);
    ok(html.includes(`id="${k}"`), `isian ${k} ada di markup`);
  }
  // Isian yang punya keterangan menunjuk keterangannya lewat aria-describedby.
  for (const k of ["dd-alamat", "dd-pekerjaan", "dd-penghasilan", "dd-bank", "dd-rekening"]) {
    ok(html.includes(`id="${k}-hint"`), `keterangan ${k} ada di markup`);
  }
  ok(html.includes('id="dd-nik-hint"') === false, "isian wajib tanpa keterangan tidak mengarang hint");
  // Tombol simpan kini tombol submit form — Enter di dalam isian ikut mengirim.
  ada(html, 'type="submit"', "tombol simpan adalah submit form (aksesibel lewat keyboard)");
  bersih(html, "form aksesibel");
}

// ===== 7. Galat per isian tampil dekat isiannya (dengan kaitan aria) =====
// Diukur pada NIK & WhatsApp yang sengaja tidak sah, dengan galat dipaksa
// tampil — keadaan yang sama seperti setelah pengguna menekan Simpan.
{
  const html = renderToStaticMarkup(
    <FormDataDiri
      {...props({
        awal: {
          namaLengkap: "Rani Puspita",
          nik: "123",
          nomorWhatsApp: "0812",
          alamat: "",
          pekerjaan: "",
          penghasilan: "",
          namaBank: "",
          nomorRekening: "",
        },
        tampilkanGalat: true,
      })}
    />,
  );
  ada(html, "Nomor KTP (NIK) harus terdiri dari 16 angka.", "galat NIK tampil di form");
  ada(html, "Nomor WhatsApp harus diawali 62 tanpa tanda +", "galat WhatsApp tampil di form");
  ada(html, 'id="dd-nik-galat"', "galat NIK punya id yang bisa dirujuk");
  ada(html, 'aria-describedby="dd-nik-galat"', "isian NIK menunjuk galatnya sendiri");
  ada(html, 'aria-describedby="dd-wa-galat"', "isian WhatsApp menunjuk galatnya sendiri");
  ok(
    (html.match(/aria-invalid="true"/g) ?? []).length === 2,
    "hanya dua isian yang salah ditandai tidak sah",
  );
  ok(
    (html.match(/role="alert"/g) ?? []).length >= 2,
    "setiap galat isian diumumkan sebagai alert",
  );
  // Tanpa galat server, pesan banner lama tidak dipakai — pesannya per isian.
  ok(!html.includes("rounded-lg bg-destructive/10"), "galat per isian tidak menambah banner besar");
  bersih(html, "form dengan galat per isian");
}

console.log(`DataDiriForm.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
