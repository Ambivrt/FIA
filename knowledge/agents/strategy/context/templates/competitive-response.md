# Mall: Konkurrentrespons

## Format

- **Syfte:** Snabb strategisk respons på konkurrentaktivitet
- **Triggad av:** Intelligence Agent via competitive_alert
- **Tidskrav:** Utkast inom 24 timmar
- **Godkännande:** 50% sample review

## Struktur

### 1. Konkurrentåtgärd

- Vad har konkurrenten gjort? (sammanfattning från Intelligence Agent)
- Konkurrentens namn och position
- Källa och datum
- Typ av åtgärd (produktlansering, kampanj, förvärv, partnerskap, etc.)

### 2. Påverkan på Forefront

- Direkt påverkan (kunder, pipeline, positionering)
- Indirekt påverkan (marknad, branschperception)
- Allvarlighetsgrad: Låg / Medium / Hög / Kritisk
- **severity_score:** 0.0-1.0 (KRITISKT: detta fält krävs för trigger `competitive_alert`)
  - 0.0-0.3: Låg — informativ, ingen omedelbar åtgärd
  - 0.4-0.6: Medium — bevaka och planera
  - 0.7-0.8: Hög — kräver respons, eskaleras automatiskt via Slack
  - 0.9-1.0: Kritisk — omedelbar eskalering till Orchestrator
- Tidskänslighet: Akut / Kort sikt / Lång sikt

### 3. Rekommenderad respons

- **Omedelbar åtgärd** (0-48h): Vad ska göras direkt?
- **Kort sikt** (1-2 veckor): Taktiska justeringar
- **Lång sikt** (nästa kvartal): Strategiska anpassningar
- Resursbehov per åtgärd

### 4. Differentiering

- Hur skiljer sig Forefronts erbjudande?
- Vilka styrkor ska lyftas fram?
- Budskapsanpassning (om relevant)

### 5. Risk-bedömning

- Risk om vi inte agerar
- Risk med föreslagen respons
- Osäkerhetsfaktorer

## Riktlinjer

- Fokusera på differentiering — aldrig imitation
- Aldrig nämna konkurrenter negativt i externt material
- Vid kritisk allvarlighetsgrad: eskalera omedelbart till Orchestrator
- Kopiera inte konkurrentens strategi — hitta egen vinkel
- Konkret och handlingsbart — inte akademisk analys
