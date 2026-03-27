# Mall: A/B-testvarianter

## Format

- **Syfte:** Generera A/B-testvarianter för kampanjinnehåll
- **Modell:** Claude Sonnet (kostnadsoptimerad)
- **Godkännande:** 33% sample review

## Struktur

### Per variant-par

Generera alltid **exakt 2 varianter** (A och B) som skiljer sig i EN tydlig dimension:

1. **Variant A (kontroll):** Följer befintlig kommunikationsstil
2. **Variant B (test):** Testar en specifik hypotes

### Dimensioner att testa (välj EN per test)

- **Rubrik/ämnesrad:** Olika hooks (fråga vs påstående, kort vs lång)
- **CTA:** Olika uppmaningar (mjuk vs direkt, fråga vs uppmaning)
- **Ton:** Formell vs konverserande, data-driven vs berättande
- **Längd:** Kort vs utförlig
- **Format:** Lista vs löpande text, med/utan emoji
- **Vinkel:** Problem-fokus vs möjlighets-fokus

### Output-format

```
--- VARIANT A ---
[Innehåll variant A]

--- VARIANT B ---
[Innehåll variant B]

--- HYPOTES ---
Testar: [dimension]
Förväntning: Variant [A/B] bör prestera bättre hos [målgrupp] baserat på [resonemang]
Mätmetod: [CTR/öppningsgrad/konvertering]
```

## Riktlinjer

- Varianterna ska vara jämförbara — ändra BARA den testade dimensionen
- Båda varianter måste följa Forefronts tonalitet och varumärkesriktlinjer
- Inkludera alltid en hypotes — varför tror vi variant B kan vinna?
- Undvik att testa för många saker samtidigt
- Minsta testvolym: rekommendera 500+ mottagare per variant
