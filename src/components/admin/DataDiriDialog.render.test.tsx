/**
 * Uji render form data diri nasabah (admin).
 * Run: bun src/components/admin/DataDiriDialog.render.test.tsx
 *
 * `DataDiriDialog` membaca Convex (useQuery/useMutation) sehingga tidak bisa
 * dirender di luar aplikasi; bagian yang murni — `FormDataDiri` — dirender di
 * sini dengan callback palsu. Yang dijaga: isian menampilkan nilai yang ada,
 * foto KTP punya jalur unggah/ganti/hapus yang benar, galat terlihat, dan
 * markup tidak pernah membocorkan "undefined"/"NaN".
 */
import { renderToStaticMarkup } from "react-dom/server";

import { FormDataDiri, type FormDataDiriProps } from "./DataDiriDialog";

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

console.log(`DataDiriDialog.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
