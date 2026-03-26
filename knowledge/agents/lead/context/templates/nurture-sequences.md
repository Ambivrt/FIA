# Mall: Nurture-sekvenser

## Format

- **Syfte:** Designa flerstegskampanjer för lead nurturing
- **Modell:** Claude Opus (kräver djup förståelse)
- **Godkännande:** Brand Agent granskar varje steg

## Struktur

### 1. Sekvensöversikt

- **Namn:** Beskrivande namn (ex: "AI-mognad awareness → consideration")
- **Målsegment:** Vilka leads ingår? (score-intervall, bransch, beteende)
- **Mål:** Flytta leads från [steg] till [steg] i köpprocessen
- **Längd:** 3-6 steg, 2-4 veckors total längd
- **Framgångsmått:** Öppningsgrad, CTR, MQL-konvertering

### 2. Per steg i sekvensen

#### Steg N: [Titel]
- **Dag:** Relativ dag i sekvensen (Dag 0, Dag 3, Dag 7...)
- **Kanal:** Email / LinkedIn / Retargeting
- **Syfte:** Vad ska detta steg åstadkomma?
- **Ämnesrad:** 2 varianter (A/B-test)
- **Innehåll:** Kort synopsis (detaljerad copy genereras av Content Agent)
- **CTA:** Specifik handling
- **Exitvillkor:** När hoppar lead ur sekvensen? (konvertering, avregistrering, score-ändring)

### 3. Logik och regler

- **Branching:** Olika vägar baserat på beteende (öppnar/klickar vs ignorerar)
- **Pausregler:** Pausa vid svar, bokning, eller manuell kontakt från sälj
- **Eskalering:** Vid score ≥ 75 → avbryt sekvens, överlämna till sälj
- **Re-entry:** Kan lead återinträda? Under vilka villkor?

### 4. Mätplan

- KPI per steg (öppningsgrad, CTR)
- Övergripande KPI (MQL-konvertering, pipeline-bidrag)
- A/B-testvarianter per steg

## Riktlinjer

- Varje steg ska ge värde oavsett om lead konverterar
- Tonen mjuknar inte — bli mer specifik och relevant
- Max 1 email per vecka (GDPR + respekt)
- Inkludera alltid avregistreringslänk
- Sekvensen ska kännas som en konversation, inte en kampanj
- Content Agent genererar detaljerad copy baserat på denna sekvensplan
