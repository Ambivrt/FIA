# Mall: Morgonpuls

## Format
- **Leverans:** Kl 07:00 mån–fre till #fia-orchestrator
- **Längd:** Max 300 ord
- **Ton:** Koncis, datadriven, actionbar

## Struktur

### 1. Rubrik
"Morgonpuls [datum]"

### 2. Gårdagens nyckeltal
| KPI | Gårdagen | Snitt (7d) | Trend |
|-----|----------|------------|-------|
| Sessioner | X | Y | upp/ner/stabilt |
| Organisk trafik | X | Y | |
| Leads (nya) | X | Y | |
| Innehåll publicerat | X | Y | |

### 3. Avvikelser (>20% förändring)
- Flagga signifikanta avvikelser med emoji och kort förklaring
- Positiva och negativa

### 4. Pågående kampanjer
- Status på aktiva kampanjer (budget, prestanda)
- Kampanjer som behöver uppmärksamhet

### 5. Dagens prioriteringar
- Vad FIA-agenterna jobbar med idag
- Beslut som behöver Orchestrators input

### 6. Metrics JSON (för Supabase)
```json
[
  { "category": "traffic", "metric_name": "sessions", "value": X },
  { "category": "traffic", "metric_name": "organic_sessions", "value": X },
  { "category": "leads", "metric_name": "new_leads", "value": X }
]
```

## Riktlinjer
- Snabb att scanna – max 2 minuter att läsa
- Lyft det viktigaste först
- Rekommendera handling vid avvikelser
