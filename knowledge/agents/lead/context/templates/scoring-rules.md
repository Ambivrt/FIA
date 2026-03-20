# Lead Scoring-regler

## Poängsystem

### Demografiska signaler (max 30 poäng)

| Signal                                          | Poäng |
| ----------------------------------------------- | ----- |
| Beslutsfattare (C-level, VP, Director)          | +15   |
| Mellanchef (Manager, Team Lead)                 | +10   |
| Rätt bransch (tech, industri, offentlig sektor) | +10   |
| Företagsstorlek 50–500 anställda                | +10   |
| Företagsstorlek 500+ anställda                  | +5    |
| Sverige-baserat företag                         | +5    |

### Beteendesignaler (max 70 poäng)

| Signal                        | Poäng |
| ----------------------------- | ----- |
| Besökt prissida / tjänstesida | +15   |
| Laddat ner whitepaper/guide   | +15   |
| Deltagit i webinar/event      | +15   |
| Öppnat 3+ e-postmeddelanden   | +10   |
| Besökt webbplatsen 3+ gånger  | +10   |
| Klickat på CTA i e-post       | +10   |
| Fyllt i kontaktformulär       | +20   |
| Begärt demo                   | +25   |

### Negativa signaler

| Signal                        | Poäng |
| ----------------------------- | ----- |
| Avregistrerat sig från e-post | -20   |
| Ej öppnat e-post på 30 dagar  | -10   |
| Konkurrent (identifierad)     | -50   |
| Student/privat e-post         | -15   |

## Klassificering

- **0–24:** Cold – ingen åtgärd
- **25–49:** Warm – nurture-sekvens
- **50–74:** Hot – intensifierad nurture
- **75+:** MQL – överlämna till sälj (score_threshold_mql: 75)

## Kalibrering

- Utvärdera scoring-modellen månadsvis
- Jämför MQL-till-SQL-konverteringsgrad
- Justera poäng baserat på faktisk konverteringsdata
