# Mall: Anomalidetektion

## Format

- **Syfte:** Identifiera och analysera avvikelser i marknadsdata
- **Triggad av:** Strategy Agent via `strategy_to_analytics`
- **Godkännande:** 5% sample review

## Struktur

### 1. Sammanfattning

- Vilken metrisk avviker? (sessions, leads, conversion rate, bounce rate, etc.)
- Avvikelsens storlek (% från baseline/7-dagarsmedel)
- Tidsperiod och datakälla

### 2. Analys

- **Rotorsak:** Trolig förklaring baserad på tillgänglig data
- **Korrelationer:** Andra metriker som rör sig samtidigt
- **Extern kontext:** Säsongseffekter, kampanjer, marknadshändelser
- **Historiskt mönster:** Har liknande avvikelser skett tidigare?

### 3. Påverkan

- Affärspåverkan (intäkt, pipeline, varumärke)
- Berörda segment eller kanaler
- **severity:** 0.0-1.0 (KRITISKT: detta fält krävs för trigger `anomaly_escalation`)
  - 0.0-0.3: Mindre avvikelse, informativ
  - 0.4-0.6: Betydande, kräver uppmärksamhet
  - 0.7-0.8: Allvarlig, kräver åtgärd
  - 0.9-1.0: Kritisk, eskaleras automatiskt till Orchestrator

### 4. Rekommendation

- Omedelbar åtgärd (om severity ≥ 0.7)
- Uppföljande analys som bör göras
- KPI:er att bevaka framöver

## Output-fält (JSON i content_json)

```json
{
  "output": "Full analystext",
  "severity": 0.75,
  "severity_reason": "Organic traffic -35% utan känd orsak",
  "metric": "organic_sessions",
  "deviation_pct": -35,
  "period": "2026-03-25"
}
```

## Riktlinjer

- Severity-fältet MÅSTE alltid sättas — triggern `anomaly_escalation` beror på det
- Var specifik — "sessions sjönk 23%" inte "trafiken minskade"
- Inkludera alltid jämförelseperiod
- Vid severity > 0.8: skriv i urgensens ton men undvik panik
