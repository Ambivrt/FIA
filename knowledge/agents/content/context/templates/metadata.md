# Mall: SEO-metadata

## Format

- **Syfte:** Generera SEO-optimerad metadata för publicerat innehåll
- **Modell:** Claude Sonnet (kostnadsoptimerad)
- **Godkännande:** 20% sample review

## Struktur

### 1. Metadata-uppsättning per sida/artikel

- **meta_title:** Max 60 tecken. Inkludera primärt keyword naturligt. Sluta med " | Forefront" om plats finns.
- **meta_description:** Max 155 tecken. Sammanfatta värdet för läsaren. Inkludera CTA eller nyfikenhetsväckare.
- **og_title:** Kan skilja sig från meta_title — optimera för delning i sociala medier.
- **og_description:** Max 200 tecken. Mer konverserande ton än meta_description.
- **canonical_url:** Föreslå om relevant (undvik duplicering).
- **keywords:** 3-5 relevanta söktermer, primärt + sekundära. Svenska long-tail-termer prioriterade.

### 2. Output-format (JSON)

```json
{
  "meta_title": "...",
  "meta_description": "...",
  "og_title": "...",
  "og_description": "...",
  "keywords": ["term1", "term2", "term3"],
  "canonical_url": null
}
```

## Riktlinjer

- Skriv alltid på svenska
- Undvik keyword-stuffing — naturligt språk
- meta_description ska vara en komplett mening, inte en lista
- Prioritera sökintention framför sökvolym
- Testa mental modell: "Skulle jag klicka på detta i Google-resultat?"
- Inkludera Forefront-specifika termer där relevant (AI-konsulting, delade visioner, etc.)
