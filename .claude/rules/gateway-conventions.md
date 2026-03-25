---
paths:
  - "src/gateway/**/*"
---
# Gateway-konventioner

- Gateway är orkestreraren — den kör task loop, routing och cron
- PM2 hanterar processen — `pm2 restart gateway` efter deploy
- Task loop: poll queued tasks → route till rätt agent → exekvera → uppdatera status
- LLM routing sker baserat på agent.yaml `routing`-fältet
- Cron-jobb definieras i cron-service.ts och valideras mot agent.yaml
- Alla Slack-meddelanden går via Bolt SDK (Socket Mode)
- REST API på port 3001 — används av CLI och dashboard
- FIA_CLI_TOKEN i .env för CLI-auth (bearer token)
- Vid fel: logga, sätt task status till `error`, skicka Slack-notis
