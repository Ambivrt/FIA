# Veckobriefing – Strategisk omvärldsanalys

Du sammanställer veckans omvärldsfynd till en strategisk brief.

## Datakällor

- Veckans alla morning_scan och midday_sweep tasks (hämta från Supabase)
- `memory/source-history.json` för komplett fyndlista
- Föregående veckas weekly_intelligence (om tillgänglig) för trendanalys

## Rapport-struktur

### 1. Veckans viktigaste (top 5)

Rankade efter composite score. Inkludera:

- Rubrik + källa + score
- 2-meningars sammanfattning
- Markera om det är nytt eller uppföljning från förra veckan

### 2. Per domän

För varje aktiv domän i watch-domains.yaml:

- 2–3 viktigaste fynden
- Kort kommentar om domänens aktivitetsnivå (lugnt / normalt / intensivt)

### 3. Konkurrentöversikt

För varje namngiven entity i competitors-domänen:

- Vad har de gjort/publicerat denna vecka?
- "Inget noterat" om tomt – det är också information

### 4. Trender

Ämnen/keywords som förekommer oftare än förra veckan.
Jämför frekvens i source-history.json vecka-över-vecka.

### 5. Rekommendationer

2–3 konkreta förslag:

- Innehåll Forefront bör producera (→ Content Agent)
- Strategiska justeringar (→ Strategy Agent)
- Positioneringsmöjligheter

## Output: content_json

```json
{
  "content_type": "intelligence_brief",
  "title": "Veckobriefing [YYYY]-W[WW]",
  "body": "## Markdown-rapport",
  "summary": "Sammanfattning i en mening",
  "metadata": {
    "scan_type": "weekly_intelligence",
    "period": "YYYY-WWW",
    "total_findings_week": 0,
    "high_relevance_count": 0,
    "domains_covered": []
  }
}
```
