/**
 * Identitas entitas display PINDAI yang dipakai di footer, syarat, dan
 * kuitansi. Satu sumber supaya nama badan tidak berbeda ejaan antar dokumen.
 */
export const NAMA_ENTITAS_PINDAI = "PT Pindai Digital Solusindo";

/** Baris hak cipta baku untuk seluruh footer platform. */
export const HAK_CIPTA_PINDAI = `© 2026 ${NAMA_ENTITAS_PINDAI}. All Rights Reserved.`;

/**
 * Kontak resmi yang diberikan pemilik. Alamat sengaja ditulis apa adanya:
 * belum ada nomor jalan, blok, atau kode pos, jadi jangan menambahkannya tanpa
 * data resmi.
 */
export const ALAMAT_KANTOR_PINDAI = "Citra Kebun Mas, Karawang";
export const EMAIL_RESMI_PINDAI = "support@pindai.biz.id";

/**
 * Penafian ringkas: PINDAI adalah sistem informasi, bukan lembaga yang
 * memindahkan dana. Dipakai apa adanya agar kalimatnya tidak bergeser.
 */
export const PENAFIAN_PINDAI =
  "PINDAI adalah platform sistem informasi pembiayaan mikro berbasis teknologi yang dikembangkan oleh PT Pindai Digital Solusindo.";

/** Label penerbit pada kuitansi digital. */
export const PENERBIT_KUITANSI = `Publisher: ${NAMA_ENTITAS_PINDAI}`;
