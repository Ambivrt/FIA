# tests/ – Testsvit

Jest med ts-jest. Konfiguration i `jest.config.ts`.

## Köra tester

```bash
npm test             # Alla tester
npm run test:router  # Enbart router.test.ts
npm run test:brand   # Enbart brand-agent.test.ts
npm run test:cli     # Enbart CLI-tester
```

## Befintliga tester (23 filer)

### Gateway & agents

| Fil                          | Testar                                        |
| ---------------------------- | --------------------------------------------- |
| `router.test.ts`             | Modell-routing, agent.yaml, fallback          |
| `brand-agent.test.ts`        | Granskningslogik, eskalering, veto            |
| `content-agent.test.ts`      | Content Agent exekvering, tool_use            |
| `intelligence-agent.test.ts` | Intelligence pipeline, signal scoring         |
| `agent-loader.test.ts`       | Parsning av agent.yaml, filresolution, skills |
| `logger.test.ts`             | Loggformat, audit trail-struktur              |
| `config.test.ts`             | Miljövariabelladdning, defaults               |
| `skill-loader.test.ts`       | Skill-laddning (shared: + agent:)             |
| `task-queue.test.ts`         | Prioritetskö, concurrency, pausa/återuppta    |
| `parallel-screening.test.ts` | Parallell pre-screening                       |
| `self-eval.test.ts`          | Self-eval scoring-logik                       |
| `retry.test.ts`              | Exponential backoff retry                     |
| `display-status.test.ts`     | FIA Display Status resolve-logik              |
| `context-manager.test.ts`    | Kontexthantering, prompt-builder              |
| `command-listener.test.ts`   | Command-listener (reseed, pause, etc.)        |
| `gws-wrapper.test.ts`        | GWS MCP-wrapper                               |
| `manifest-sync.test.ts`      | Manifest sync-validering                      |
| `dns-rebinding.test.ts`      | DNS rebinding-skydd                           |
| `tasks-sort.test.ts`         | Task-sortering                                |

### CLI

| Fil                      | Testar                                        |
| ------------------------ | --------------------------------------------- |
| `cli/formatters.test.ts` | Earth-palett, tabellformatering, relativeTime |
| `cli/api-client.test.ts` | HTTP-klient, auth headers, error handling     |
| `cli/commands.test.ts`   | Kommando-registrering, argument-parsning      |

### Integration

| Fil                                             | Testar                        |
| ----------------------------------------------- | ----------------------------- |
| `integration/content-agent.integration.test.ts` | End-to-end content-generering |

## Konventioner

- Tester ligger i `tests/` (ej `__tests__/` eller colocated)
- Filnamnsmönster: `<modul>.test.ts`
- Mocka externa tjänster (Supabase, Anthropic, Slack) – inga riktiga API-anrop
- Testa routing-logik noggrant – felaktig routing = fel modell = fel resultat
