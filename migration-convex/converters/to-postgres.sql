-- Template migrasi ke PostgreSQL
-- Isi DDL ini sesuai skema tujuan Anda.
-- File ini belum jadi script siap jalan tanpa penyesuaian.

BEGIN;

-- Contoh tabel users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  nama TEXT,
  email TEXT,
  role TEXT,
  plafon_pinjan NUMERIC,
  persen_bunga NUMERIC,
  kode_peminjam TEXT,
  dibuat_admin_pada BIGINT
);

-- Contoh tabel nasabah_profil
CREATE TABLE IF NOT EXISTS nasabah_profil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  user_id UUID REFERENCES users(id),
  nama_lengkap TEXT,
  nik TEXT,
  nomor_wa TEXT,
  alamat TEXT,
  pekerjaan TEXT,
  penghasilan_bulanan NUMERIC,
  nama_bank TEXT,
  nomor_rekening TEXT,
  foto_ktp_id TEXT,
  diperbarui_pada BIGINT,
  sumber TEXT
);

-- Conto tbl kyc_profil
CREATE TABLE IF NOT EXISTS kyc_profil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  user_id UUID REFERENCES users(id),
  status TEXT,
  catatan_peminjam TEXT,
  diputuskan_oleh_label TEXT
);

-- Conto tbl loans
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  user_id UUID REFERENCES users(id),
  pokok_pinjaman NUMERIC,
  pokok_diajukan NUMERIC,
  tujuan TEXT,
  namo_lengkap TEXT,
  nama_bank TEXT,
  nomor_rekening TEXT,
  status TEXT,
  nomor_referensi TEXT,
  tenor_hari INTEGER,
  didanai_pada BIGINT,
  lunas_pada BIGINT,
  pendana_id UUID REFERENCES users(id)
);

-- Conto tbl kredit_barang
CREATE TABLE IF NOT EXISTS kredit_barang (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  user_id UUID REFERENCES users(id),
  nomor_referensi TEXT,
  nama_barang TEXT,
  kategori TEXT,
  merchant TEXT,
  harga_barang NUMERIC,
  status TEXT,
  nama_lengkap TEXT,
  nik TEXT,
  nomor_rekening TEXT
);

-- Conto tbl fundings
CREATE TABLE IF NOT EXISTS fundings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  loan_id UUID REFERENCES loans(id),
  dana_id UUID REFERENCES users(id),
  jumlah_alokasi NUMERIC,
  imbal_hasi NUMERIC,
  status TEXT,
  nomor_referensi TEXT
);

-- Conto tbl deposits
CREATE TABLE IF NOT EXISTS deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  user_id UUID REFERENCES users(id),
  jumlah NUMERIC,
  nama_bank TEXT,
  nomor_rekening TEXT,
  status TEXT,
  nomor_referensi TEXT
);

-- Conto tbl withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convex_id TEXT,
  user_id UUID REFERENCES users(id),
  jumlah NUMERIC,
  nama_bank TEXT,
  nomor_rekening TEXT,
  status TEXT,
  nomor_referensi TEXT
);

COMMIT;

-- Setelah skema siap, import dari JSONL/CSV sesuai proses Anda.
-- Jangan lupa pasang index untuk relasi yang sering dipakai (user_id, loan_id, dana_id).
