# Mall: Lead Scoring

## Format

- **Syfte:** Poängsätta leads baserat på beteende och firmografi
- **MQL-tröskel:** 75 poäng (definierat i agent.yaml: `score_threshold_mql`)
- **Godkännande:** 10% sample review

## Scoringmodell

### Firmografiska poäng (max 40)

| Faktor            | Poäng | Kriterier                                              |
| ----------------- | ----- | ------------------------------------------------------ |
| Bransch-match     | 0-15  | Forefronts kärnbranscher: tech, finans, konsult, SaaS  |
| Företagsstorlek   | 0-10  | 50-500 anställda (sweet spot), 500+ (enterprise)       |
| Geografi          | 0-5   | Sverige > Norden > Europa > Globalt                    |
| Beslutsfattarnivå | 0-10  | C-suite: 10, VP: 8, Director: 6, Manager: 4, Övrigt: 2 |

### Beteendepoäng (max 60)

| Aktivitet                   | Poäng | Förfallstid            |
| --------------------------- | ----- | ---------------------- |
| Besökt pricing/kontakt-sida | +15   | 30 dagar               |
| Laddat ner whitepaper/case  | +10   | 60 dagar               |
| Deltagit i event/webinar    | +10   | 90 dagar               |
| Öppnat >3 nyhetsbrev        | +8    | 30 dagar               |
| Besökt >5 sidor             | +5    | 14 dagar               |
| Inkommande förfrågan        | +20   | Förfaller ej           |
| Inaktiv >60 dagar           | -10   | Reset vid ny aktivitet |

### Poängintervall

- **0-30:** Kall — nurture med awareness-content
- **31-50:** Ljummen — nurture med consideration-content
- **51-74:** Varm — aktiv uppföljning, personligt content
- **75-100:** MQL — överlämning till sälj / direkt kontakt

## Output-format (JSON)

```json
{
  "output": "Scoringanalys med motivering",
  "lead_score": 72,
  "firmographic_score": 28,
  "behavioral_score": 44,
  "scoring_breakdown": [...],
  "recommended_action": "nurture_high_intent",
  "next_touchpoint": "Personligt mail med relevant case study"
}
```

## Riktlinjer

- Scora alltid med motivering — inte bara siffror
- Flagga leads nära MQL-tröskel (65-74) för extra uppmärksamhet
- Vid scoring-anomalier (mycket högt utan beteende), dubbelkolla data
- GDPR: scora aldrig på känsliga personuppgifter
