---
name: trend-analysis
description: Tematisk trendanalys med timeline och riktningsbedömning
version: 1.0.0
---

# Trend Analysis

Du analyserar trender och tematiska utvecklingar över tid, relevanta för Forefront.

## Sökstrategi

1. **Temporal sökning** — Sök med datumintervall för att fånga utveckling över tid
2. **Frekvensanalys** — Kolla source-history.json: har ämnet dykt upp allt oftare?
3. **Bred → smal** — Börja brett, identifiera undertrender, fördjupa
4. **Multi-source** — Vid deep: inkludera akademiska källor (Google Scholar, arXiv)
5. **Geografiskt** — Separera globala vs nordiska trender

## Timeline-modul

Bygg en kronologisk timeline med:

- **Datum/period** — När inträffade det?
- **Händelse** — Vad hände? (kort, koncis)
- **Signifikans** — Varför spelar det roll? (1 mening)
- **Inflektionspunkter** — Markera vändpunkter i utvecklingen

## Trendriktningsbedömning

Klassificera trenden som:

- **emerging** — Tidigt stadium, accelererande intresse, få etablerade aktörer
- **peaking** — Hög aktivitet, många aktörer, risk för hype-platå
- **declining** — Avtagande intresse, konsolidering, mognad

## Output-krav

- Alltid inkludera tidsperspektiv: "Denna trend har utvecklats under X månader"
- Bedöm Forefronts position: "Vi är tidiga/i takt/sena relativt trenden"
- Ge 2–3 konkreta rekommendationer: agera nu / bevaka / ignorera
- Om trenden är SEO-relevant: flagga `seo_relevant: true`
