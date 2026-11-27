#!/usr/bin/env bash
#
# Pasang PINDAI WhatsApp Sender (Baileys) di VPS Debian/Ubuntu.
#
# Pemakaian:
#   sudo bash install.sh <domain-https> [nomor-whatsapp]
#
# Contoh:
#   sudo bash install.sh wa.pindai.biz.id 6285119574032
#
# Skrip ini idempoten: aman dijalankan ulang. Token gateway dibuat SEKALI dan
# disimpan di /etc/pindai-wa-sender.env (mode 600) — tidak pernah masuk repo.
#
# Setelah selesai skrip mencetak:
#   - KODE PAUTAN untuk dimasukkan di WhatsApp
#   - TOKEN gateway untuk dipasang di Convex (WHATSAPP_API_KEY)
#   - URL yang dipakai sebagai apiUrl di waSettings
set -euo pipefail

DOMAIN="${1:-}"
NOMOR="${2:-}"
DIR=/opt/pindai-wa-sender
ENVFILE=/etc/pindai-wa-sender.env
UNIT=/etc/systemd/system/pindai-wa-sender.service
PORT=8787

if [[ -z "$DOMAIN" ]]; then
  echo "Pemakaian: sudo bash install.sh <domain-https> [nomor-whatsapp]"
  echo "Contoh   : sudo bash install.sh wa.pindai.biz.id 6285119574032"
  exit 2
fi

if [[ $EUID -ne 0 ]]; then
  echo "Harus dijalankan sebagai root (pakai sudo)."
  exit 2
fi

langkah() { echo ""; echo "=== $* ==="; }

# ------------------------------------------------------------------ 1. Node 20
langkah "1/8 Memeriksa Node.js"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAYOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
  if [[ "$MAYOR" -ge 20 ]]; then
    NEED_NODE=0
    echo "Node.js sudah ada: $(node -v)"
  fi
fi
if [[ "$NEED_NODE" -eq 1 ]]; then
  echo "Memasang Node.js 20..."
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

# ------------------------------------------------------------------ 2. Salin kode
langkah "2/8 Menyalin service ke $DIR"
mkdir -p "$DIR"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0644 "$SRC/server.mjs"   "$DIR/server.mjs"
install -m 0644 "$SRC/package.json" "$DIR/package.json"
echo "Tersalin."

# ------------------------------------------------------------------ 3. Dependensi
langkah "3/8 Memasang dependensi (Baileys)"
cd "$DIR"
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5
node --check "$DIR/server.mjs" && echo "Sintaks server.mjs OK"

# ------------------------------------------------------------------ 4. Token
langkah "4/8 Menyiapkan token gateway"
if [[ -f "$ENVFILE" ]] && grep -q '^WA_SENDER_TOKEN=' "$ENVFILE"; then
  echo "Token sudah ada di $ENVFILE — dipakai ulang."
else
  TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  {
    echo "WA_SENDER_TOKEN=$TOKEN"
    echo "WA_SENDER_PORT=$PORT"
    echo "WA_SENDER_HOST=127.0.0.1"
    echo "WA_SENDER_LOG=warn"
    if [[ -n "$NOMOR" ]]; then
      echo "WA_SENDER_PAIRING=$NOMOR"
    fi
  } > "$ENVFILE"
  chmod 600 "$ENVFILE"
  echo "Token baru dibuat dan disimpan di $ENVFILE (mode 600)."
fi

# ------------------------------------------------------------------ 5. systemd
langkah "5/8 Membuat layanan systemd"
cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=PINDAI WhatsApp Sender (Baileys)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
EnvironmentFile=$ENVFILE
ExecStart=$(command -v node) $DIR/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT_EOF

systemctl daemon-reload
systemctl enable pindai-wa-sender >/dev/null 2>&1 || true
systemctl restart pindai-wa-sender
sleep 6
systemctl is-active pindai-wa-sender || true

# ------------------------------------------------------------------ 6. Caddy
langkah "6/8 Menyiapkan HTTPS (Caddy)"
if ! command -v caddy >/dev/null 2>&1; then
  echo "Memasang Caddy..."
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

CADDYFILE=/etc/caddy/Caddyfile
touch "$CADDYFILE"
if grep -qE "^[[:space:]]*$DOMAIN[[:space:]]*\{" "$CADDYFILE"; then
  echo "Blok $DOMAIN sudah ada di $CADDYFILE."
else
  cat >> "$CADDYFILE" <<CADDY_EOF

$DOMAIN {
    reverse_proxy 127.0.0.1:$PORT
}
CADDY_EOF
  echo "Blok $DOMAIN ditambahkan."
fi
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ------------------------------------------------------------------ 7. Tunggu TLS
langkah "7/8 Menunggu sertifikat & memeriksa /health"
OK=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 3
done
if [[ "$OK" -eq 1 ]]; then
  echo "HTTPS siap: https://$DOMAIN/health"
  curl -s "https://$DOMAIN/health" || true
  echo ""
else
  echo "PERINGATAN: https://$DOMAIN/health belum menjawab."
  echo "Periksa:"
  echo "  journalctl -u caddy -n 40 --no-pager"
  echo "  journalctl -u pindai-wa-sender -n 40 --no-pager"
  echo "Pastikan record DNS A untuk $DOMAIN sudah menunjuk ke IP VPS ini."
fi

# ------------------------------------------------------------------ 8. Ringkasan
langkah "8/8 Ringkasan"
TOKEN_FINAL="$(grep '^WA_SENDER_TOKEN=' "$ENVFILE" | cut -d= -f2-)"
echo ""
echo "================= SIMPAN INFORMASI INI ================="
echo "apiUrl (untuk waSettings) : https://$DOMAIN/send"
echo "WHATSAPP_API_KEY          : $TOKEN_FINAL"
echo "========================================================"
echo ""
echo "=== KODE PAUTAN WHATSAPP ==="
journalctl -u pindai-wa-sender -n 120 --no-pager \
  | grep -E "KODE PAUTAN|tersambung|gagal|belum" | tail -12 || true
echo ""
echo "Bila kode belum muncul, tunggu lalu jalankan:"
echo "  journalctl -u pindai-wa-sender -n 80 --no-pager | grep -A6 'KODE PAUTAN'"
echo ""
echo "Kode berlaku sekitar 1 menit. Untuk kode baru:"
echo "  systemctl restart pindai-wa-sender && sleep 8"
echo "  journalctl -u pindai-wa-sender -n 80 --no-pager | grep -A6 'KODE PAUTAN'"
echo ""
echo "Uji kirim setelah WhatsApp tertaut:"
echo "  curl -s -X POST https://$DOMAIN/send \\"
echo "    -H 'Authorization: Bearer $TOKEN_FINAL' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"target\":\"${NOMOR:-6285119574032}\",\"message\":\"Uji PINDAI\"}'"
