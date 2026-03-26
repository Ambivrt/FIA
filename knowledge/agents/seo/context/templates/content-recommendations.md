# Mall: Innehållsrekommendationer

## Format

- **Syfte:** Generera SEO-baserade rekommendationer för nytt eller förbättrat content
- **Modell:** Claude Opus (kräver djup analys)
- **Godkännande:** Trigger `seo_recommendations_to_content` kräver orchestrator-godkännande

## Struktur

### 1. Sammanfattning

- Antal rekommendationer
- Förväntad total trafikpåverkan
- Koppling till aktuell kvartalsplan/kanalstrategi

### 2. Rekommendationer (sorterade efter prioritet)

Per rekommendation:
- **Typ:** Nytt content / Uppdatering / Konsolidering / Borttagning
- **Målkeyword:** Primärt sökord
- **Content-format:** Blog post, case study, landing page, whitepaper
- **Rubrikförslag:** 2-3 alternativ
- **Innehållsriktning:** Kort synopsis (3-5 meningar)
- **Konkurrensanalys:** Vad rankar top-3 idag? Hur differentierar vi?
- **Intern länkning:** Vilka befintliga sidor ska länka hit?
- **Förväntad effekt:** Uppskattad trafikökning (låg/medium/hög)

### 3. Trigger-fält (KRITISKT)

**Dessa fält MÅSTE finnas i content_json för trigger `seo_recommendations_to_content`:**

```json
{
  "has_content_recommendations": true,
  "recommendations": [
    {
      "type": "new|update|consolidate|remove",
      "target_keyword": "...",
      "content_format": "blog_post|case_study|landing_page|whitepaper",
      "title_suggestions": ["...", "..."],
      "synopsis": "...",
      "expected_impact": "low|medium|high"
    }
  ]
}
```

### 4. Handlingsplan

- Rekommendationer grupperade per sprint/månad
- Resursbehov (Content Agent + eventuell expert-input)
- Beroenden (kräver data, intervju, case-godkännande?)

## Riktlinjer

- Basera alltid på data — SERP-analys, keyword-volym, content gap
- Prioritera content med kommersiell intent
- Varje rekommendation ska vara exekverbar av Content Agent
- `has_content_recommendations` MÅSTE sättas till `true` om det finns minst 1 rekommendation
- `recommendations`-arrayen MÅSTE följa schemat ovan — trigger-enginen läser dessa fält
