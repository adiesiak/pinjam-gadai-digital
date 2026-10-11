# Penanganan Data Sensitif

Folder ini berisi panduan memisahkan data sensitif dari data operasional sebelum migrasi.

Data sensitif yang perlu diperhatikan:

- NIK
- Nomor rekening
- Nomor WhatsApp
- Email
- Dokumen identitas (referensi file KTP, selfie, dll.)
- Alamat, pekerjaan, penghasilan bila dianggap sensitif oleh kebijakan Anda
- Data lain yang menurut kebijakan perusahaan harus dilindungi

## Rekomendasi umum

- Pisahkan file sensitif dari file operasional jika sistem tujuan memungkinkan.
- Batasi akses ke file sensitif.
- Gunakan enkripsi pada transit dan/atau istirahat jika sistem tujuan memerlukannya.
- Hindari menyebarkan file sensitif dalam lingkungan yang tidak terkontrol.

Jika sistem tujuan belum ditetapkan, tunda langkah import sensitif sampai sistem tujuan diketahui.
