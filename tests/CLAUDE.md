# tests/ – Testsvit

Jest med ts-jest. Konfiguration i `jest.config.ts`.

## Köra tester

```bash
npm test             # Alla tester
npm run test:router  # Enbart router.test.ts
npm run test:brand   # Enbart brand-agent.test.ts
```

## Befintliga tester

| Fil                    | Testar                                              |
| ---------------------- | --------------------------------------------------- |
| `router.test.ts`       | Modell-routing baserat på agent.yaml                |
| `brand-agent.test.ts`  | Brand Agent granskningslogik, eskalering            |
| `agent-loader.test.ts` | Agent-loader: parsning av agent.yaml, filresolution |
| `logger.test.ts`       | Loggformat, audit trail-struktur                    |

## Konventioner

- Tester ligger i `tests/` (ej `__tests__/` eller colocated)
- Filnamnsmönster: `<modul>.test.ts`
- Mocka externa tjänster (Supabase, Anthropic, Slack) – inga riktiga API-anrop i tester
- Testa routing-logik noggrant – felaktig routing = fel modell = fel resultat
