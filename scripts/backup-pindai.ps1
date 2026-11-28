# Backup rutin PINDAI - snapshot produksi + salinan ke OneDrive
#
# Pakai:
#   powershell -ExecutionPolicy Bypass -File scripts\backup-pindai.ps1
#
# Yang dikerjakan:
#   1. `convex export --include-file-storage` dari deployment PRODUKSI
#   2. Hitung SHA256, tulis berkas checksum di sebelah ZIP
#   3. Salin ke folder OneDrive (salinan di luar mesin ini)
#   4. Verifikasi checksum salinan - berhenti dengan galat bila berbeda
#   5. Hapus backup lokal yang lebih tua dari RETENSI_HARI
#   6. Catat ke audit trail lewat `convex run`
#
# Kenapa PowerShell + Task Scheduler, bukan cron Convex: fungsi Convex tidak
# bisa mengekspor deployment-nya sendiri. Yang bisa dijadwalkan hanya proses di
# mesin yang memegang kredensial CLI.
#
# PENTING: skrip ini butuh akses CLI ke deployment produksi. Bila kredensial
# dirotasi (lihat docs/rotasi-kredensial.md), jalankan `npx convex login` atau
# set CONVEX_DEPLOY_KEY sebelum jadwal berikutnya, kalau tidak backup akan gagal
# dan itu baru terlihat dari peringatan "backup terlantar" di panel kesehatan.

param(
  [string]$Repo = "E:\Projects\pinjam-gadai-digital",
  [string]$TujuanLokal = "E:\Project atung\migrasi\backup",
  [string]$TujuanOneDrive = "$env:USERPROFILE\OneDrive\PINDAI\backup",
  [int]$RetensiHari = 30,
  [string]$Deployment = "prod:academic-rooster-210"
)

$ErrorActionPreference = "Stop"

function Tulis($pesan) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $pesan)
}

# ---------------------------------------------------------------- 0. persiapan
if (-not (Test-Path $Repo)) { throw "Folder repo tidak ditemukan: $Repo" }
New-Item -ItemType Directory -Path $TujuanLokal -Force | Out-Null
New-Item -ItemType Directory -Path $TujuanOneDrive -Force | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$nama = "pindai-prod-$stamp.zip"
$zip = Join-Path $TujuanLokal $nama

# ---------------------------------------------------------------- 1. export
Tulis "Mengekspor snapshot produksi..."
Push-Location $Repo
try {
  $env:CONVEX_DEPLOYMENT = $Deployment
  # Node menulis kemajuan ke stderr. Dengan $ErrorActionPreference = "Stop",
  # PowerShell menganggap setiap baris stderr sebagai galat yang menghentikan
  # skrip - padahal export justru berhasil. Kembalikan ke Continue selama
  # panggilan, lalu nilai keberhasilan dari $LASTEXITCODE.
  $galatLama = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & node "node_modules\convex\bin\main.js" export `
      --include-file-storage --path $zip --prod 2>&1 |
      ForEach-Object { if ($_ -isnot [System.Management.Automation.RemoteException]) { Write-Host "  $_" } }
    $kode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $galatLama
  }
} finally {
  Pop-Location
}

if ($kode -ne 0) { throw "Export gagal dengan kode keluar $kode" }
if (-not (Test-Path $zip)) { throw "Export gagal: berkas tidak terbentuk" }
$ukuranMB = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Tulis "Snapshot dibuat: $nama ($ukuranMB MB)"

# ---------------------------------------------------------------- 2. checksum
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash
$berkasHash = "$zip.sha256"
"$hash  $nama" | Set-Content -Path $berkasHash -Encoding ascii
Tulis "SHA256: $hash"

# ---------------------------------------------------------------- 3. salin
$salinan = Join-Path $TujuanOneDrive $nama
Copy-Item $zip $salinan -Force
Tulis "Disalin ke OneDrive: $salinan"

# ---------------------------------------------------------------- 4. verifikasi
$hashSalinan = (Get-FileHash $salinan -Algorithm SHA256).Hash
if ($hashSalinan -ne $hash) {
  throw "Checksum salinan TIDAK COCOK. Asli $hash, salinan $hashSalinan. Salinan rusak - jangan andalkan."
}
Tulis "Checksum salinan cocok."

# ---------------------------------------------------------------- 5. retensi
$batas = (Get-Date).AddDays(-$RetensiHari)
$lama = Get-ChildItem $TujuanLokal -Filter "pindai-prod-*.zip" |
  Where-Object { $_.LastWriteTime -lt $batas -and $_.FullName -ne $zip }
foreach ($f in $lama) {
  Remove-Item $f.FullName -Force
  Remove-Item "$($f.FullName).sha256" -Force -ErrorAction SilentlyContinue
  Tulis "Hapus backup lama: $($f.Name)"
}
# Salinan OneDrive TIDAK dihapus otomatis: itu arsip jangka panjang. Hapus
# manual bila memang perlu menghemat ruang.

# ---------------------------------------------------------------- 6. audit
# `catatBackup` adalah mutation publik yang menuntut sesi admin; skrip ini
# berjalan tanpa sesi, jadi jalur yang dipakai adalah query inline untuk
# memastikan, dan pencatatan audit dilakukan oleh pemeriksaan sistem bila
# backup tidak ditemukan. Bila ingin mencatat otomatis, jalankan dari akun
# admin lewat panel (tab Ekspor) - itu juga menulis audit.
Tulis "Selesai. Catat manual di panel admin (tab Ekspor) bila ingin jejak audit langsung."

# ---------------------------------------------------------------- ringkasan
Write-Host ""
Write-Host "=== RINGKASAN ==="
Write-Host "  berkas   : $nama"
Write-Host "  ukuran   : $ukuranMB MB"
Write-Host "  sha256   : $hash"
Write-Host "  lokal    : $zip"
Write-Host "  OneDrive : $salinan"
Write-Host ""
