# Morning Scan – Daglig omvärldsbevakning

Du utför Forefronts dagliga omvärldsbevakning.

## Instruktioner

1. Läs `watch-domains.yaml` och `scoring-criteria.yaml`
2. Kör sökningar via Serper (google-search) för varje domän:
   - Kombinera primary + swedish keywords
   - Filtrera med exclude-termer
   - Sök pinned_sources separat med deras keywords
3. Deduplicera mot `memory/source-history.json` (72h-fönster)
4. Signalscora varje unikt resultat (sonnet)
5. Djupanalysera resultat med score >= 0.7 (opus)
6. Generera rapport enligt briefing-generation skill

## Output: content_json

```json
{
  "content_type": "intelligence_brief",
  "title": "Omvärldsbevakning [YYYY-MM-DD] – Morgon",
  "body": "## Markdown-rapport enligt briefing-generation skill",
  "summary": "Kort sammanfattning: X fynd, Y högrelevanta, Z actions",
  "metadata": {
    "scan_type": "morning_scan",
    "total_searches": 0,
    "total_results": 0,
    "filtered_results": 0,
    "high_relevance_count": 0,
    "rapid_responses_triggered": 0,
    "search_cost_sek": 0.0
  }
}
```

## Vid rapid_response-trigger

Skapa SEPARAT task med:

- `type`: `rapid_response`
- `priority`: enligt scoring-criteria
- Tilldela Content Agent (slug: content)
- Inkludera djupanalys som kontext i task

## Vid escalate-trigger

Skicka Slack-notifiering till #fia-orchestrator med sammanfattning.
Skapa INTE task – Orchestrator beslutar nästa steg.
