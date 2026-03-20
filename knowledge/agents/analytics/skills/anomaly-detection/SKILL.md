---
name: anomaly-detection
description: Flaggar avvikelser >20% mot föregående period med automatisk varning.
version: 1.0.0
---

# Anomaly Detection

## Regler

1. Flagga automatiskt vid avvikelser >20% mot föregående mätperiod
2. Inkludera kontext: vilken metrik, aktuellt värde, förväntat värde och procentuell förändring
3. Positiva avvikelser (oväntat bra resultat) rapporteras som möjligheter
4. Negativa avvikelser triggar varning till Orchestrator via Slack
5. Spara baseline-metrics i memory/baseline-metrics.json för jämförelse
