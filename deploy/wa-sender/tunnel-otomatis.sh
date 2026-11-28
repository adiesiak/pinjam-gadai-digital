#!/usr/bin/env bash
# Tunnel otomatis untuk gateway WhatsApp PINDAI.
#
# MASALAH: `cloudflared tunnel --url` (quick tunnel) membuat nama acak sekali
# pakai. Setiap restart, URL berubah dan `waSettings.apiUrl` di PINDAI menunjuk
# alamat mati -> OTP WhatsApp berhenti terkirim tanpa ada yang menyadarinya.
#
# SOLUSI: skrip ini menjalankan cloudflared, menangkap URL yang dicetak, lalu
# MELAPORKANNYA ke PINDAI supaya `apiUrl` ikut berubah otomatis. Admin tidak
# perlu lagi menyalin URL secara manual.
#
# Pemakaian:
#   sudo cp tunnel-otomatis.sh /opt/pindai-wa-sender/
#   sudo chmod +x /opt/pindai-wa-sender/tunnel-otomatis.sh
#   sudo cp pindai-wa-tunnel.service /etc/systemd/system/
#   sudo systemctl daemon-reload && sudo systemctl enable --now pindai-wa-tunnel
#
# Butuh:
#   - cloudflared terpasang (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
#   - server.mjs sudah berjalan di PORT (default 8787)
#   - WHATSAPP_API_KEY di environment (token yang sama dengan di PINDAI)
#   - CONVEX_SITE_URL atau CONVEX_URL menunjuk deployment produksi
#
# CATATAN KEAMANAN: token di sini adalah token gateway yang sudah dipakai
# PINDAI untuk mengirim. PINDAI hanya menerima laporan dari token ini, dan hanya
# untuk host *.trycloudflare.com atau *.pindai.biz.id. Setiap perubahan URL
# tercatat di audit trail.

set -euo pipefail

PORT="${WA_SENDER_PORT:-8787}"
CONVEX_URL="${CONVEX_URL:-https://academic-rooster-210.convex.cloud}"
TOKEN="${WHATSAPP_API_KEY:?WHATSAPP_API_KEY wajib diset}"
JEDA_ULANG="${JEDA_ULANG:-5}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

# Laporkan URL ke PINDAI. Kegagalan TIDAK menghentikan tunnel: lebih penting
# WhatsApp tetap tersambung daripada pelaporan berhasil. Bila pelaporan gagal,
# admin masih bisa memperbarui apiUrl manual dari panel.
lapor_url() {
  local url="$1"
  local body
  body=$(printf '{"path":"waLaporUrl:laporkanUrl","args":{"token":"%s","apiUrl":"%s"},"format":"json"}' \
    "$TOKEN" "$url")

  log "melaporkan URL ke PINDAI: $url"
  local jawab
  if jawab=$(curl -sS -m 20 -X POST "$CONVEX_URL/api/mutation" \
      -H 'Content-Type: application/json' \
      -d "$body" 2>&1); then
    log "jawaban PINDAI: $jawab"
  else
    log "GAGAL melaporkan (tunnel tetap jalan): $jawab"
  fi
}

log "memulai tunnel ke http://localhost:$PORT"

while true; do
  # `--no-autoupdate` mencegah cloudflared restart sendiri di tengah jalan.
  # stderr digabung karena URL dicetak ke stderr.
  while IFS= read -r baris; do
    printf '%s\n' "$baris"

    # Cari URL publik pertama yang dicetak cloudflared.
    if [[ "$baris" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
      lapor_url "${BASH_REMATCH[1]}/send"
    fi
  done < <(cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate 2>&1)

  log "cloudflared berhenti; mengulang dalam ${JEDA_ULANG}s"
  sleep "$JEDA_ULANG"
done
