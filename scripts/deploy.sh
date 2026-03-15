#!/bin/bash
# ============================================================
# FIA Gateway – Deploy Script for GCP Compute Engine
# ============================================================
#
# FÖRUTSÄTTNINGAR (gör detta INNAN du kör scriptet):
#
# 1. MERGE KODEN TILL MAIN
#    Gå till https://github.com/Ambivrt/FIA
#    Skapa PR från branch claude/setup-fia-gateway-gcp-Fv3DP → main
#    Merga PR:en
#
# 2. SKAPA SLACK-APP (https://api.slack.com/apps)
#    a) Create New App → From Scratch → namn: "FIA", välj workspace
#    b) Socket Mode → Enable Socket Mode → generera App-Level Token
#       (ge den namn "fia-socket", scope: connections:write)
#       → spara som SLACK_APP_TOKEN (börjar med xapp-)
#    c) OAuth & Permissions → Bot Token Scopes, lägg till:
#       - chat:write
#       - commands
#       - channels:history
#       - channels:read
#       - groups:read
#    d) Install App to Workspace
#       → spara Bot User OAuth Token som SLACK_BOT_TOKEN (börjar med xoxb-)
#    e) Basic Information → Signing Secret
#       → spara som SLACK_SIGNING_SECRET
#    f) Slash Commands → Create New Command:
#       Command: /fia
#       Description: FIA Gateway commands
#       Usage Hint: status | kill | resume | approve | reject | run
#
# 3. SKAFFA API-NYCKLAR
#    - Gemini:  https://aistudio.google.com/apikey  (gratis tier räcker)
#    - Serper:  https://serper.dev  (2500 gratis sökningar)
#    - Supabase: Du har redan URL + Service Role Key + Anon Key
#
# ============================================================
#
# DEPLOY-ORDNING (kör dessa kommandon i ordning):
#
#   1. SSH till GCP-instans:
#      gcloud compute ssh fia-gateway --zone=europe-north1-b --tunnel-through-iap
#
#   2. Ladda ner deploy-scriptet (första gången):
#      curl -fsSL https://raw.githubusercontent.com/Ambivrt/FIA/main/scripts/deploy.sh -o deploy.sh
#
#   3. Kör det:
#      bash deploy.sh
#
#   4. Scriptet stannar om .env saknas. Skapa den:
#      cp ~/fia-server/.env.example ~/fia-server/.env
#      nano ~/fia-server/.env
#
#   5. Fyll i nycklarna (se REQUIRED nedan), spara, kör igen:
#      bash deploy.sh
#
# ============================================================
#
# .env NYCKLAR (REQUIRED = måste ha, OPTIONAL = kan vänta)
#
#   REQUIRED:
#     GEMINI_API_KEY=AIza...           # Google AI Studio
#     SUPABASE_URL=https://xxx.supabase.co
#     SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Supabase Settings → API
#     SUPABASE_ANON_KEY=eyJ...          # Supabase Settings → API
#     SLACK_BOT_TOKEN=xoxb-...          # Slack app → OAuth
#     SLACK_APP_TOKEN=xapp-...          # Slack app → Socket Mode
#     SLACK_SIGNING_SECRET=abc123...    # Slack app → Basic Info
#
#   OPTIONAL (agenter fungerar utan dessa, men saknar features):
#     SERPER_API_KEY=...               # SEO/Strategy webbsökning
#     HUBSPOT_API_KEY=...              # Lead Agent CRM
#     LINKEDIN_ACCESS_TOKEN=...        # Campaign Agent LinkedIn
#     BUFFER_ACCESS_TOKEN=...          # Social media scheduling
#     GA4_CREDENTIALS_PATH=...         # Analytics Agent
#
#   AUTO-DEFAULTS (behöver normalt inte ändras):
#     NODE_ENV=production
#     LOG_LEVEL=info
#     LOG_DIR=./logs
#     KNOWLEDGE_DIR=./knowledge
#     GATEWAY_API_PORT=3001
#
# ============================================================

set -e

echo ""
echo "========================================="
echo "  FIA Gateway – Deploy"
echo "========================================="
echo ""

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
echo "[2/6] Hämtar kod från main..."

REPO_DIR="$HOME/fia-server"
BRANCH="main"

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
  echo "  .env saknas!"
  echo ""
  echo "  Kör:"
  echo "    cp .env.example .env"
  echo "    nano .env"
  echo ""
  echo "  Fyll i REQUIRED-nycklar (se kommentarer överst i detta script)"
  echo "  Kör sedan: bash deploy.sh"
  echo ""
  exit 1
fi

# Validera REQUIRED-variabler
source .env 2>/dev/null || true
MISSING=""
[ -z "$GEMINI_API_KEY" ] && MISSING="$MISSING GEMINI_API_KEY"
[ -z "$SUPABASE_URL" ] && MISSING="$MISSING SUPABASE_URL"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"

if [ -n "$MISSING" ]; then
  echo ""
  echo "  SAKNAS (REQUIRED):$MISSING"
  echo "  Agenter/API fungerar inte utan dessa."
  echo "  Redigera .env: nano .env"
  echo ""
fi

if [ -z "$SLACK_BOT_TOKEN" ] || [ -z "$SLACK_APP_TOKEN" ] || [ -z "$SLACK_SIGNING_SECRET" ]; then
  echo "  VARNING: Slack-tokens saknas – Slack-integration startar inte."
  echo "  Se instruktioner i toppen av detta script."
  echo ""
fi

if [ -z "$SERPER_API_KEY" ]; then
  echo "  INFO: SERPER_API_KEY saknas – SEO/Strategy-sökning inaktiverad."
fi

# --- 6. Starta med PM2 ---
echo "[6/6] Startar FIA Gateway med PM2..."

mkdir -p logs

# Stoppa gammal instans
pm2 delete fia-gateway 2>/dev/null || true

# Starta
pm2 start ecosystem.config.js

# Auto-restart vid reboot
pm2 save
pm2 startup 2>/dev/null || true

echo ""
echo "========================================="
echo "  FIA Gateway ar igang!"
echo "========================================="
echo ""
echo "Verifiera:"
echo "  pm2 logs fia-gateway          # Se loggar live"
echo "  pm2 status                    # Processens status"
echo ""
echo "Testa i Slack:"
echo "  /fia status                   # Visa agenter"
echo "  /fia run content blog_post Skriv om AI i Sverige"
echo ""
echo "Hantera:"
echo "  pm2 restart fia-gateway       # Starta om"
echo "  pm2 stop fia-gateway          # Stoppa"
echo ""

# Visa initiala loggar
sleep 2
echo "--- Senaste loggar ---"
pm2 logs fia-gateway --lines 15 --nostream
