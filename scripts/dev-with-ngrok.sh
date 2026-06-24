#!/usr/bin/env bash

set -euo pipefail

# Your SalesCRM Ngrok Token
NGROK_AUTHTOKEN="30Dibm8ltpf5Fkx59Ks6JIt7XjV_qSAKTaPN6Bnj9SpGmToL"
PORT="3000"

start_ngrok() {
  local cmd=(
    npx ngrok http "$PORT"
    --domain "pleadingly-nonfortifiable-tyron.ngrok-free.dev"
    --authtoken "$NGROK_AUTHTOKEN"
    --log stdout
    --log-format logfmt
  )

  # Run quietly in the background and capture PID
  "${cmd[@]}" >/tmp/salescrm-ngrok.log 2>&1 &
  NGROK_PID=$!
}

start_ngrok

# Function to cleanly kill Ngrok on Ctrl+C
cleanup() {
  if kill -0 "$NGROK_PID" >/dev/null 2>&1; then
    kill "$NGROK_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

# Give Ngrok 2 seconds to boot
sleep 2

if ! kill -0 "$NGROK_PID" >/dev/null 2>&1; then
  echo "Failed to start ngrok. Check /tmp/salescrm-ngrok.log"
  exit 1
fi

echo -e "\n============================================================"
echo "🚀 ngrok is running perfectly for SalesCRM!"

# Extract and print URL
FRONTEND_URL="$(sed -n 's/.*url=\(https:[^ ]*\).*/\1/p' /tmp/salescrm-ngrok.log | tail -n 1 || true)"
if [[ -z "$FRONTEND_URL" ]]; then
  FRONTEND_URL="$(grep -Eo 'https://[^ ]*ngrok[^ ]*' /tmp/salescrm-ngrok.log | tail -n 1 || true)"
fi

if [[ -n "$FRONTEND_URL" ]]; then
  echo "🔗 Public Webhook URL: $FRONTEND_URL"
else
  echo "Could not read URL. Check /tmp/salescrm-ngrok.log"
fi
echo -e "============================================================\n"

echo "Starting Next.js dev server on port 3000..."

# Start Next.js in foreground so Ctrl+C interrupts it directly!
npx next dev --turbopack --port "$PORT"
