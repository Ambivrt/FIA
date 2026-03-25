# Template: LinkedIn-post

## Format

Det finns två format. Välj baserat på ämnet.

### Kortformat (standard)

- Max 200 ord
- Öppna med påstående eller scen som utmanar
- Bygg en poäng genom 3-5 stycken
- Avsluta med fråga eller insikt som bjuder in till dialog
- Inga emojis, inga listor, inga topp-X

### Longform / artikel

- Obegränsad längd
- Narrativdrivet: starta med scen, person, händelse
- Bygg en tes lager för lager — leverera inte slutsatsen först
- Tekniskt djup kontextualiserat med konsekvenser och mänskliga exempel
- Källhänvisningar stärker trovärdigheten
- Avsluta med perspektiv och eftertanke, inte sammanfattning

## Struktur (kortformat)

```
[HOOK — påstående, scen eller fråga som bryter scrollmönstret]

[KROPP — 2-3 stycken som bygger poängen. Konkreta exempel, inte abstrakta resonemang]

[AVSLUT — insikt, fråga eller perspektiv. Aldrig sammanfattning. Aldrig "Kontakta oss".]

[HASHTAGS — #Forefront #DeladeVisioner + 1-2 ämnesrelevanta]
```

## Hook-mönster som funkar för Forefront

- **Scen:** “Det är klockan tre på natten i Wien. En Mac mini surrar på ett skrivbord…”
- **Utmaning:** “Många organisationer börjar sin AI-resa med pilotprojekt. Det räcker inte.”
- **Kontrast:** “Vi pratar om AI-strategi. Men de flesta organisationer har inte ens en fungerande prompt-kultur.”
- **Fråga:** “Vem har egentligen mandat att fatta beslut om AI i din organisation?”

## Hook-mönster som INTE funkar

- **Topp-lista:** “5 saker varje ledare borde veta om AI”
- **Definition:** “Generativ AI är en teknik som…”
- **Clickbait:** “Det här kommer förändra ALLT”
- **Humblebrag:** “Vi har hjälpt 50+ organisationer att…”
- **Buzzword-salva:** “I en tid av digital transformation och disruptiv innovation…”

## CTA-filosofi

Målet: läsaren ska vilja leta reda på och kontakta någon på Forefront, bjuda in till möte, eller köpa ett instegserbjudande (inspirationsföreläsning, workshop, mognadsanalys).

CTA ska vara en naturlig förlängning av textens tes. Inbjudan, aldrig push.

**Bra CTA-mönster:**

- “Vi utforskar det här vidare på [event/datum]. Häng med.”
- “Nyfiken på hur det ser ut i just din organisation? Hör av dig till [namn].”
- En avslutande fråga som gör att läsaren vill svara eller veta mer

**Dåliga CTA-mönster:**

- “Kontakta oss för en kostnadsfri konsultation”
- “Boka en demo idag”
- “Läs mer på vår hemsida”
- “Fyll i formuläret så återkommer vi”

## Metadata att generera

```json
{
  "title": "Intern rubrik för tracking",
  "format": "short | longform",
  "target_audience": "Kort beskrivning av vem posten riktar sig till",
  "core_message": "Postens tes i en mening",
  "cta_type": "question | invitation | perspective",
  "hashtags": ["#Forefront", "#DeladeVisioner", "..."],
  "estimated_read_time": "< 1 min | 2-3 min | 5+ min"
}
```