# Vanliga frågor

Här hittar du svar på de vanligaste frågorna om FIA, ordnade efter ämne.

---

## Agenter

### Varför visar en agent "error" (röd status)?

Det kan bero på flera saker: ett tillfälligt problem med en extern tjänst, ett oväntat svar från LLM-modellen, eller ett nätverksproblem. Oftast löser sig felet automatiskt inom några minuter.

!!! tip "Vad du kan göra"
    1. Vänta 15 minuter -- många fel löser sig själva.
    2. Kontrollera **Aktivitet** i sidomenyn för att se felmeddelandet.
    3. Om felet kvarstår, prova att pausa och återaktivera agenten.
    4. Kontakta teknisk support om inget hjälper.

### Kan jag köra en uppgift manuellt?

Ja. Gå till **Agenter**, välj den agent du vill ge en uppgift och använd funktionen **Ny uppgift**. Du väljer typ av uppgift, anger eventuella detaljer och skickar. Uppgiften läggs i kön och bearbetas av agenten.

### Vad betyder "semi-autonomous"?

De flesta agenter är **autonoma** -- de arbetar självständigt och fattar egna beslut inom sina ramar. **Strategy Agent** är **semi-autonom**, vilket innebär att den föreslår planer och strategier men kräver ditt godkännande innan de aktiveras. Det beror på att strategiska beslut har större påverkan.

---

## Godkännanden

### Varför hamnar vissa uppgifter i godkännandekön men inte andra?

Det beror på uppgiftens typ och agentens autonominivå. Uppgifter som ska publiceras externt (bloggposter, sociala medier-inlägg, kampanjtexter) kräver godkännande. Interna uppgifter som analyser, keyword-listor och rapporter hanteras automatiskt.

### Vad händer om jag avslår en uppgift?

Uppgiften skickas tillbaka till agenten som skapade den, tillsammans med din feedback. Agenten gör en ny version baserat på din feedback. Den nya versionen hamnar åter i godkännandekön för din granskning.

### Kan jag ångra ett godkännande?

Nej, ett godkännande kan inte ångras efter att det gjorts. Om innehållet redan publicerats behöver du hantera det manuellt i respektive plattform (blogg, sociala medier, etc.).

!!! warning "Granska noggrant"
    Eftersom godkännanden inte kan ångras är det viktigt att läsa igenom innehållet ordentligt innan du godkänner.

---

## Triggers

### Vad är skillnaden mellan automatiska och manuella triggers?

| Typ           | Vad händer                                      | Exempel                                          |
| ------------- | ------------------------------------------------ | ------------------------------------------------ |
| **Automatisk**| Åtgärden utförs direkt utan din inblandning      | SEO-optimering efter publicerad bloggpost         |
| **Manuell**   | Triggern hamnar i kön och väntar på ditt OK      | Skapa kampanj baserad på strategidokument         |

Manuella triggers används för åtgärder som har större påverkan eller kostnad.

### Varför skapade en trigger en uppgift jag inte förväntade mig?

Det beror troligen på en trigger-kedja -- en händelse utlöste en trigger som i sin tur utlöste en annan. Gå till **Aktivitet** och filtrera på den aktuella tidsperioden för att spåra kedjan. Om triggern inte är önskvärd kan du inaktivera den under **Triggers** > **Konfiguration**.

---

## Kill switch

### Påverkar nödstoppet uppgifter som redan körs?

Ja. Pågående uppgifter avbryts. De markeras med en avbryten-status och kan behöva startas om efter att nödstoppet avaktiverats.

### Hur snabbt tar nödstoppet effekt?

Nödstoppet aktiveras inom **sekunder**. Alla agenter kontrollerar kill switch-statusen regelbundet och stannar omedelbart.

### Finns det en mellannivå mellan kill switch och att göra ingenting?

Ja -- du kan **pausa enskilda agenter** istället för att stoppa hela systemet. Se [Nödstopp](kill-switch.md) för mer information om skillnaden.

---

## Kostnader

### Hur mycket kostar en bloggpost?

Kostnaden varierar beroende på längd och antal omarbetningar, men en typisk bloggpost kostar ungefär **2--5 kr** i LLM-kostnader. Det inkluderar textgenerering, Brand Agent-granskning och SEO-optimering.

### Var kommer kostnaderna ifrån?

Kostnaderna består av:

| Källa                     | Beskrivning                                          |
| ------------------------- | ---------------------------------------------------- |
| **LLM-anrop**             | Varje gång en agent ber AI-modellen om hjälp         |
| **Bildgenerering**        | Bilder som skapas till innehåll                      |
| **Sökningar**             | Omvärldsbevakning och research via sökmotorer        |

!!! info "Inga dolda kostnader"
    Alla kostnader loggas och visas transparent på **Kostnader**-sidan i dashboarden.

### Vad är månadsbudgeten?

Månadsbudgeten sätts i systemets inställningar och övervakas löpande. Du ser aktuell förbrukning jämfört med budget på **Kostnader**-sidan. Om kostnaderna närmar sig budgettaket får du en varning.

---

## Säkerhet

### Vem kan se vad?

Åtkomsten styrs av roller:

| Roll                     | Rättigheter                                           |
| ------------------------ | ----------------------------------------------------- |
| **Marketing Orchestrator** | Full tillgång: granska, godkänna, konfigurera, kill switch |
| **Viewer**               | Läsbehörighet: se dashboarden och rapporter            |
| **Admin**                | Allt ovan plus systemkonfiguration och trigger-hantering |

### Var lagras data?

All data lagras i **Supabase** (PostgreSQL-databas) i **EU-regionen**. Ingen data skickas till servrar utanför EU. LLM-anrop går till Anthropic (Claude) och Google (Gemini) via deras europeiska endpoints.

### Kan jag radera data?

Ja, kontakta en administratör för att radera specifik data. Observera att viss data (som granskningsspår och kill switch-logg) sparas av revisionsskäl och kan ha andra regler för radering.

!!! info "GDPR"
    FIA hanterar inga personuppgifter om slutkunder direkt. Leads och kontaktuppgifter hanteras i HubSpot enligt Forefronts dataskyddspolicy.
