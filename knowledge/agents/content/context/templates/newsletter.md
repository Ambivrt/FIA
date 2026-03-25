# Mall: Nyhetsbrev (Insights)

## Format

- **Längd:** 500–800 ord totalt
- **Språk:** Svenska
- **Ton:** Personlig, nyfiken, generös med insikter — som ett brev från en klok kollega
- **Kanal:** E-post (publiceras även på forefront.se/insights)

## Filosofi

Nyhetsbrevet är Forefronts mest personliga kanal. Det ska kännas som att öppna ett brev från någon som har tänkt på saker du också funderar över — inte som att ta del av ett företags content calendar.

- **Generös med insikter** — ge bort tänkande, inte bara hänvisa till det
- **Curera med perspektiv** — om vi delar andras innehåll, säg varför det spelar roll
- **Respektera tid** — varje mening ska motivera sin plats
- **Personlig röst** — skriv som en person, inte som ett varumärke

## Struktur

### 1. Ämnesrad

- Max 50 tecken
- Väck nyfikenhet eller lova en konkret insikt
- Undvik versaler, utropstecken och emojis

**Bra:**

- "Vad hände när vi automatiserade fel process"
- "En sak de flesta missar med AI-strategi"
- "Tre veckor med agenter — våra lärdomar"

**Undvik:**

- "Forefronts nyhetsbrev mars 2026"
- "Spännande nyheter från oss!"
- "5 tips för din digitala resa"

### 2. Preheader

- Max 90 tecken — komplettera ämnesraden, upprepa den inte
- Synlig i inboxvy — behandla den som en andra chans att öppna

### 3. Öppning (2–3 meningar)

- Personlig och kontextuell — varför detta ämne just nu?
- Skriv som att du fortsätter en konversation, inte startar en kampanj
- Undvik: "Hej! Välkommen till mars månads nyhetsbrev."
- Föredra: "Förra veckan satt jag i ett möte där alla var överens om att de behövde AI-strategi. Ingen kunde förklara vad de menade."

### 4. Huvudinnehåll (2–3 block)

Varje block:

- **Rubrik** — kort, tydlig, väcker intresse
- **Brödtext** (3–5 meningar) — en insikt, ett perspektiv eller en observation. Inte bara en sammanfattning av en artikel
- **Länk** till fullständig artikel/resurs (om relevant)

Blanda:

- Egna insikter och erfarenheter
- Trender vi ser hos kunder
- Externt innehåll vi rekommenderar (med eget perspektiv på varför)

### 5. CTA

- En primär uppmaning per nyhetsbrev
- Naturlig förlängning av innehållet — inte ett säljbudskap

**Bra:**

- "Vi pratar mer om det här på [event] den [datum]. Häng med."
- "Svar på det här mailet räcker — vi tar en fika."
- En fråga som bjuder in till dialog

**Förbjudet:**

- "Boka en kostnadsfri konsultation"
- "Kontakta oss idag"
- "Besök vår hemsida för att läsa mer"

### 6. Avslutning

- Personlig signoff — skriv som en person, inte ett företag
- Uppmana till svar/feedback — visa att det är en konversation
- "Har du sett något intressant den här veckan? Svara på det här mailet."

## Förbjudna mönster

- Topp-X-listor
- Buzzwords (synergier, holistiskt, paradigmskifte)
- Emojis
- "Spännande nyheter" och liknande tomma entusiastfraser
- Säljpush i CTA
- Generiska hälsningsfraser ("Hoppas allt är bra!")

## Metadata att generera

```json
{
  "subject_line": "Ämnesrad (max 50 tecken)",
  "preheader": "Preheader (max 90 tecken)",
  "target_audience": "Kort beskrivning av vem numret riktar sig till",
  "core_theme": "Övergripande tema i en mening",
  "content_blocks": [
    {"title": "Block 1 rubrik", "type": "insight | trend | recommendation"},
    {"title": "Block 2 rubrik", "type": "insight | trend | recommendation"}
  ],
  "cta_type": "question | invitation | event",
  "sender_name": "Avsändarens namn"
}
```
