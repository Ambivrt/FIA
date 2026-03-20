# Intelligence Agent

Omvärldsbevakning för Forefront Consulting Group. Skannar konfigurerade domäner,
scorar relevans, genererar briefs och triggar rapid response vid högrelevanta fynd.

## Schemalagda körningar

| Tid           | Uppgift             | Beskrivning             |
| ------------- | ------------------- | ----------------------- |
| 06:30 mån–fre | morning_scan        | Daglig morgonbevakning  |
| 13:00 mån–fre | midday_sweep        | Daglig middagsbevakning |
| 09:00 måndag  | weekly_intelligence | Veckobriefing           |

## Konfiguration

- `context/watch-domains.yaml` – Bevakningsdomäner, keywords, pinned sources
- `context/scoring-criteria.yaml` – Scoring-dimensioner, vikter, tröskelvärden
