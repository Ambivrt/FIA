# Gränssnitt

FIA har tre likvärdiga gränssnitt – **Dashboard**, **CLI** och **Slack**. Alla tre ger tillgång till agenter, tasks, triggers och kill switch.

**Målgrupp:** Utvecklare och operatörer

## Dashboard

Web-baserad PWA på `fia.forefront.se`. React + Vite + Tailwind + shadcn/ui.

- [Översikt](dashboard/overview.md) – Teknikstack, komponentstruktur, routing
- [Agenter](dashboard/agents.md) – AgentDetailPage, flikar, display status
- [Godkännanden](dashboard/approvals.md) – Godkännandekö, TaskDetailSheet
- [Triggers](dashboard/triggers.md) – TriggersPage, konfiguration, reseed
- [Inställningar](dashboard/settings.md) – Kill switch, tema, rollhantering

## CLI

Terminalverktyg med 15 kommandon. Kräver `FIA_CLI_TOKEN`.

- [Installation](cli/install.md) – Auth, beroenden, alias
- [Kommandon](cli/commands.md) – Alla kommandon med syntax och exempel
- [Realtid](cli/realtime.md) – `fia tail`, `fia watch`, Supabase Realtime

## Slack

Bot-integration via Bolt SDK, Socket Mode.

- [Kommandon](slack/commands.md) – Alla /fia-kommandon
- [Kanaler](slack/channels.md) – Kanalstruktur, auto-notiser
