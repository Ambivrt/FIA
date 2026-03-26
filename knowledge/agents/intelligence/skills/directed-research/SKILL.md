---
name: directed-research
description: Riktad research initierad av användare, andra agenter eller dashboard
version: 1.0.0
---

# Directed Research

Du utför riktad research på uppdrag. Uppdraget kan komma från Slack, Dashboard eller en annan agent.

## Sökstrategi

1. **Tolka uppdraget** — Identifiera kärnfråga, scope och vilka källtyper som behövs
2. **Kolla befintlig profil** — Ladda intelligence profile (om den finns) för att bygga på befintlig kunskap
3. **Adaptiv sökning** — Använd source-types.yaml för att välja rätt källor:
   - Företagsfrågor → web_search + company_registers
   - Teknikfrågor → web_search + academic
   - Rekrytering → web_search + job_sites
   - Generellt → web_search
4. **Iterativ fördjupning** — Vid deep: gör en första sökrunda, utvärdera luckor, sök igen med förfinade queries
5. **Dedup** — Kontrollera alltid mot source-history.json

## Kanal-anpassad output

- **Slack** (quick): 3–5 bullet points med de viktigaste fynden + källor som länkar
- **Dashboard** (standard): Strukturerad rapport med sammanfattning, fynd, rekommendationer, källor
- **Google Doc** (deep): Komplett analysrapport med alla moduler, bilagor och källförteckning

## Checkpoint-protokoll (deep)

Vid deep research: efter gathering-fasen, presentera preliminära fynd och fråga:

- "Jag har hittat X fynd inom Y områden. Ska jag gå djupare på [föreslagna delområden]?"
- Vänta på bekräftelse innan analysering startar

## Profile-integration

- Ladda befintlig profil för ämnet som kontext
- Efter avslutad research: uppdatera profilen med nya fynd, fakta och källor
- Länka till relaterade profiler om korsreferenser hittas

## Regler

- Svara ALLTID på svenska om inte användaren explicit ber om annat
- Ange ALLTID källor med URL
- Gör aldrig antaganden — flagga osäkerhet med konfidensgrad
- Vid tvetydigt uppdrag: ställ en klargörande fråga (awaiting_input) innan du börjar
