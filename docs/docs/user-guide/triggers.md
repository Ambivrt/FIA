# Triggers

Triggers är automatiska åtgärder som utlöses när vissa villkor uppfylls i systemet. De gör att agenterna kan reagera på händelser utan att du behöver ge instruktioner manuellt.

---

## Vad är en trigger?

En trigger är en regel som säger: **"När X händer, gör Y."**

Triggers kopplar samman agenternas arbete och skapar automatiska flöden. Istället för att du manuellt behöver starta varje uppgift kan systemet reagera på händelser och skapa nya uppgifter på egen hand.

!!! example "Exempel"
    Intelligence Agent bevakar nyheter och trender. När den hittar en viktig branschnyhet skapas automatiskt en uppgift åt Content Agent att skriva en snabbrespons-artikel.

---

## Två typer av triggers

| Typ                    | Beskrivning                                                  | Kräver godkännande |
| ---------------------- | ------------------------------------------------------------ | ------------------ |
| **Automatisk (auto)**  | Utförs direkt utan att du behöver göra något                 | Nej                |
| **Manuell (manual)**   | Hamnar i kön och väntar på ditt godkännande innan den utförs | Ja                 |

!!! info "Varför finns manuella triggers?"
    Vissa åtgärder är för viktiga eller kostsamma för att köras helt automatiskt. Manuella triggers ger dig kontroll utan att du behöver initiera uppgiften själv -- systemet föreslår, du bestämmer.

---

## Pending triggers -- väntar på ditt godkännande

Gå till **Triggers** i sidomenyn för att se alla triggers som väntar på ditt godkännande.

Varje pending trigger visar:

| Fält              | Beskrivning                                              |
| ----------------- | -------------------------------------------------------- |
| **Trigger-namn**  | Vilken regel som utlösts                                 |
| **Källa**         | Vilken agent och uppgift som utlöste triggern            |
| **Åtgärd**        | Vad som kommer att hända om du godkänner                 |
| **Tidpunkt**      | När triggern utlöstes                                    |

### Godkänn eller avslå

- **Godkänn** -- åtgärden utförs och en ny uppgift skapas.
- **Avslå** -- ingenting händer. Triggern arkiveras.

!!! tip "Granska pending triggers dagligen"
    Pending triggers kan innehålla tidskänsliga åtgärder. Gör det till en vana att kolla dem under din morgonrutin.

---

## Aktivera och inaktivera triggers

Som administratör kan du styra vilka triggers som är aktiva.

1. Gå till **Triggers** i sidomenyn.
2. Välj fliken **Konfiguration**.
3. Här ser du alla triggers per agent.
4. Använd reglaget för att aktivera eller inaktivera en specifik trigger.

!!! warning "Tänk på kedjeeffekter"
    Om du inaktiverar en trigger som ingår i en kedja kan det påverka nedströms-uppgifter. Kontrollera vilka andra triggers som beror på den innan du stänger av den.

---

## Vanliga trigger-kedjor

Här är några exempel på hur triggers skapar automatiska arbetsflöden:

### Innehållsproduktion

1. **Strategy Agent** skapar en månadsplan.
2. Trigger: Månadsplan godkänd &#8594; Content Agent startar bloggproduktion.
3. Trigger: Bloggpost klar &#8594; SEO Agent optimerar metadata.
4. Trigger: SEO-optimering klar &#8594; Campaign Agent planerar distribution.

### Nyhetsbevakning

1. **Intelligence Agent** identifierar en relevant branschnyhet.
2. Trigger: Viktig nyhet &#8594; Content Agent skapar snabbrespons-artikel.
3. Trigger: Artikel godkänd &#8594; Campaign Agent skapar sociala medier-inlägg.

### Lead-hantering

1. **Analytics Agent** rapporterar ökad trafik till specifik landningssida.
2. Trigger: Trafikökningsrapport &#8594; Lead Agent justerar lead-scoring.
3. Trigger: Nya kvalificerade leads &#8594; Campaign Agent skapar nurture-sekvens.

---

## Sammanfattning

| Vad du behöver göra                     | Var i dashboarden                     |
| --------------------------------------- | ------------------------------------- |
| Godkänna/avslå pending triggers         | Triggers &#8594; Pending              |
| Se alla aktiva triggers                 | Triggers &#8594; Konfiguration        |
| Aktivera/inaktivera en trigger          | Triggers &#8594; Konfiguration        |
| Se vilka triggers som har körts         | Aktivitet (filtrera på trigger-typ)   |
