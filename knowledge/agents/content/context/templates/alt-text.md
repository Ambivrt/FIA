# Mall: Alt-text för bilder

## Format

- **Syfte:** Generera tillgängliga, SEO-vänliga alt-texter för bilder
- **Modell:** Claude Sonnet (kostnadsoptimerad)
- **Godkännande:** 20% sample review

## Struktur

### Per bild

- **alt_text:** 50-125 tecken. Beskriv bildens innehåll och syfte, inte utseende.
- **context:** Var på sidan används bilden? (hero, illustration, diagram, porträtt)
- **seo_keywords:** 1-2 relevanta söktermer att väva in naturligt

### Output-format (JSON)

```json
{
  "alt_text": "...",
  "context": "hero|illustration|diagram|portrait|decorative",
  "seo_keywords": ["term1"]
}
```

## Riktlinjer

- Skriv alltid på svenska
- Beskriv **vad bilden kommunicerar**, inte bara vad den visar
- Undvik "Bild av..." eller "Foto av..." — börja direkt med innehållet
- Dekorativa bilder: `alt=""` (tom sträng, inte utelämnad)
- Diagram/grafer: beskriv trenden eller nyckelsiffran, inte varje datapunkt
- Porträtt: "Namn, roll på Forefront" om personen är identifierbar
- Inkludera inte text som redan finns i bildtexten (figcaption)
- WCAG 2.1 AA-kompatibel
