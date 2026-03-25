# Dagligt arbetsflöde

Som Marketing Orchestrator behöver du inte sitta vid dashboarden hela dagen. FIA:s agenter arbetar autonomt -- din roll är att ge riktning, granska och godkänna. Här beskriver vi en effektiv daglig och veckovis rutin.

---

## Morgonrutin (15 minuter)

Gör det här varje morgon, helst innan klockan 09:00.

### 1. Öppna dashboarden

Gå till **[fia.forefront.se](https://fia.forefront.se)** och logga in. Hem-sidan ger dig en snabb överblick.

### 2. Läs morgonpuls-rapporten

Analytics Agent skickar en morgonpuls varje dag klockan **07:00**. Den innehåller:

- Gårdagens nyckeltal (trafik, leads, publicerat innehåll)
- Avvikelser och trender
- Rekommenderade åtgärder

!!! tip "Var hittar jag morgonpulsen?"
    Morgonpulsen visas som en uppgift av typen "rapport" i aktivitetsloggen. Den skickas även till Slack-kanalen om du har den konfigurerad.

### 3. Granska godkännandekön

Gå till **Godkännanden** i sidomenyn. Här ser du alla uppgifter som väntar på din granskning. Prioritera:

- Tidskänsligt innehåll (nyhetsartiklar, kampanjer med deadline)
- Uppgifter som eskalerats av Brand Agent
- Äldsta uppgifterna först

### 4. Kolla pending triggers

Gå till **Triggers** och se om det finns triggers som väntar på ditt godkännande. Dessa är automatiska åtgärder som kräver ditt OK innan de utförs.

### 5. Överflyga aktivitetsloggen

Gå till **Aktivitet** och skrolla igenom de senaste händelserna. Leta efter:

- Felmeddelanden (röda rader)
- Ovanliga mönster
- Uppgifter som fastnat

---

## Hantera eskaleringar

Ibland eskalerar systemet ärenden till dig. Det händer i dessa situationer:

| Situation                                      | Vad du bör göra                                           |
| ---------------------------------------------- | --------------------------------------------------------- |
| Brand Agent har avvisat innehåll **3 gånger**  | Granska innehållet själv och ge tydlig feedback            |
| En agent visar **error** längre än 15 minuter  | Kontrollera aktivitetsloggen och kontakta teknisk support  |
| En trigger skapar oväntade uppgifter           | Pausa triggern och utvärdera om den behöver justeras       |
| Kostnaderna överstiger förväntat                | Kontrollera kostnadssidan och överväg att pausa agenter    |

!!! warning "Eskaleringarna väntar inte"
    När Brand Agent eskalerar till dig innebär det att automatiken inte klarar att lösa problemet. Ju snabbare du ger feedback, desto snabbare kan arbetet fortsätta.

---

## Kill switch vs. pausa enskild agent

Det finns två sätt att stoppa agentaktivitet. Välj rätt nivå:

| Åtgärd                    | Omfattning       | När du ska använda det                              |
| ------------------------- | ---------------- | --------------------------------------------------- |
| **Pausa enskild agent**   | En agent         | Agenten beter sig konstigt eller behöver justeras    |
| **Kill switch**           | Alla agenter     | Varumärkeskris, systemfel, felaktigt innehåll publiceras |

!!! info "Läs mer om nödstopp"
    Se [Nödstopp](kill-switch.md) för fullständig information om kill switch.

---

## Veckorutiner

### Fredagsrapport (fredag kl. 14:00)

Varje fredag klockan 14:00 genererar Analytics Agent en veckorapport. Den sammanfattar:

- Veckan som gått: publicerat innehåll, kampanjresultat, leads
- Jämförelse mot föregående vecka
- Rekommendationer inför nästa vecka

!!! tip "Avsätt 20 minuter"
    Läs fredagsrapporten i lugn och ro. Notera saker du vill justera och ge Strategy Agent eventuell ny riktning inför kommande vecka.

### Kontrollera kostnader

Gå till **Kostnader** i sidomenyn minst en gång per vecka. Kontrollera:

- Total kostnad hittills denna månad (MTD)
- Fördelning per agent -- vilken agent kostar mest?
- Fördelning per modell -- används rätt modell för rätt uppgift?
- Trend jämfört med föregående vecka

---

## Sammanfattning

| Rutin              | Frekvens        | Tid         | Vad                                          |
| ------------------ | --------------- | ----------- | -------------------------------------------- |
| Morgonrutin        | Varje dag       | 15 min      | Puls, godkännanden, triggers, aktivitet       |
| Godkännanden       | Löpande         | 5--10 min   | Granska och godkänn/avslå innehåll            |
| Fredagsrapport     | Varje fredag    | 20 min      | Läs veckorapport, planera nästa vecka         |
| Kostnadskontroll   | Varje vecka     | 5 min       | Kontrollera förbrukning                       |
