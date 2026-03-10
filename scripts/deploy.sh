#!/bin/bash
# FIA Gateway – Deploy Script
# Kör detta på GCP Compute Engine (efter SSH)
# Usage: bash scripts/deploy.sh

set -e

echo "=== FIA Gateway Deploy ==="

# --- 1. Systemkrav ---
echo "[1/6] Kontrollerar systemkrav..."

if ! command -v node &> /dev/null; then
  echo "  Installerar Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
  echo "  Installerar PM2..."
  sudo npm install -g pm2
fi

if ! command -v git &> /dev/null; then
  sudo apt-get install -y git
fi

echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"
echo "  PM2: $(pm2 --version)"

# --- 2. Kod ---
echo "[2/6] Hämtar kod..."

REPO_DIR="$HOME/FIA"
BRANCH="claude/setup-fia-gateway-gcp-Fv3DP"

if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  git clone https://github.com/Ambivrt/FIA.git "$REPO_DIR"
  cd "$REPO_DIR"
  git checkout "$BRANCH"
fi

# --- 3. Beroenden ---
echo "[3/6] Installerar beroenden..."
npm ci --production=false

# --- 4. Bygg ---
echo "[4/6] Bygger TypeScript..."
npm run build

# --- 5. Kontrollera .env ---
echo "[5/6] Kontrollerar .env..."
if [ ! -f .env ]; then
  echo ""
  echo "  ⚠️  .env saknas! Skapa den med:"
  echo "  cp .env.example .env"
  echo "  nano .env"
  echo ""
  echo "  Minst dessa variabler krävs:"
  echo "    GEMINI_API_KEY"
  echo "    SUPABASE_URL"
  echo "    SUPABASE_SERVICE_ROLE_KEY"
  echo "    SLACK_BOT_TOKEN"
  echo "    SLACK_APP_TOKEN"
  echo "    SLACK_SIGNING_SECRET"
  echo ""
  echo "  Kör deploy.sh igen efter att .env är konfigurerad."
  exit 1
fi

# Validera kritiska variabler
source .env 2>/dev/null || true
MISSING=""
[ -z "$GEMINI_API_KEY" ] && MISSING="$MISSING GEMINI_API_KEY"
[ -z "$SUPABASE_URL" ] && MISSING="$MISSING SUPABASE_URL"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"

if [ -n "$MISSING" ]; then
  echo "  ⚠️  Saknade env-variabler:$MISSING"
  echo "  Gateway kan starta utan dessa men agenter/API fungerar inte."
fi

if [ -z "$SLACK_BOT_TOKEN" ] || [ -z "$SLACK_APP_TOKEN" ]; then
  echo "  ℹ️  Slack-tokens saknas – Slack-integration startar inte."
fi

if [ -z "$SERPER_API_KEY" ]; then
  echo "  ℹ️  SERPER_API_KEY saknas – SEO/Strategy sökning fungerar inte."
fi

# --- 6. Starta med PM2 ---
echo "[6/6] Startar FIA Gateway med PM2..."

# Skapa logs-katalog
mkdir -p logs

# Stoppa eventuell gammal instans
pm2 delete fia-gateway 2>/dev/null || true

# Starta
pm2 start ecosystem.config.js

# Spara PM2-process för auto-restart
pm2 save

echo ""
echo "=== FIA Gateway är igång! ==="
echo ""
echo "Kommandon:"
echo "  pm2 logs fia-gateway     # Se loggar"
echo "  pm2 status               # Status"
echo "  pm2 restart fia-gateway  # Starta om"
echo "  pm2 stop fia-gateway     # Stoppa"
echo ""
echo "Verifiera:"
echo "  1. pm2 logs fia-gateway → 'FIA Gateway ready'"
echo "  2. /fia status i Slack → 7 agenter visas"
echo "  3. /fia run content blog_post Skriv om AI"
echo ""

# Visa de första loggraderna
sleep 2
echo "--- Senaste loggar ---"
pm2 logs fia-gateway --lines 15 --nostream
