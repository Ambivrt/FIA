# FIA – Forefront Intelligent Automation

## Kommandon

pm2 status # Processer
pm2 logs gateway --lines 50 # Gateway-loggar
npm run build # TypeScript build
npm run dev # Dev mode
npx ts-node cli/index.ts # FIA CLI

## Arkitektur

- Node.js 22, TypeScript strict, PM2
- Supabase (EU) med Realtime websockets
- Manifest-driven agents via agent.yaml
- Slack Bot (Socket Mode/Bolt SDK)
- Dashboard PWA på fia.forefront.se
- LLM routing: Claude Opus 4.6/Sonnet 4.6, Gemini, Nano Banana 2

## Mappstruktur

- src/gateway/ # Task loop, routing, status machine
- src/agents/ # Base agent + per-agent logic
- src/slack/ # Slack bot handlers
- knowledge/agents/ # agent.yaml, skills, context, memory
- knowledge/shared/ # Shared skills across agents
- cli/ # FIA CLI (Commander)
- dashboard/ # Lovable/React PWA (separat repo)

## Konventioner

- Alla agent-ändringar via agent.yaml, inte hårdkodat
- Status machine i status-machine.ts – alla övergångar valideras
- Tasks flödar: queued → in_progress → completed → awaiting_review → approved → delivered
- Brand Agent har vetorätt – allt content passerar den
- .env innehåller secrets – läs aldrig, visa aldrig
- Logga via gateway logger, inte console.log
- Svenska i all user-facing text och dokumentation
- Inga WordPress-integrationer

## Watch out

- gws CLI v0.4.4 har bugg med SA credentials → använd OAuth
- Kill switch lever i Supabase system_settings
- Triggers seedas från agent.yaml vid startup men dashboarden äger config efter seed
- ANTHROPIC_API_KEY finns i .env – används av gateway, inte direkt av agents
