# Nödstopp

Kill switch -- nödstoppet -- är en säkerhetsmekanism som omedelbart stoppar alla agenter i FIA. Det är din sista utväg när något går fel och du behöver full kontroll.

---

## Vad gör nödstoppet?

När du aktiverar kill switch händer följande:

- **Alla agenter stoppas omedelbart.** Pågående uppgifter avbryts.
- **Schemalagda uppgifter körs inte.** Cron-jobb pausas.
- **Köade uppgifter ligger kvar** i kön men bearbetas inte.
- **Triggers utlöses inte.** Inga automatiska åtgärder sker.
- **Inga API-anrop görs** till LLM-tjänster, publiceringsverktyg eller andra externa system.

!!! danger "Nödstoppet påverkar hela systemet"
Kill switch stoppar **alla** agenter, inte bara en. Använd det bara när situationen kräver att allt stannar. För enskilda agenter, se avsnittet om att pausa nedan.

---

## När ska du använda det?

Aktivera nödstoppet i dessa situationer:

| Situation                         | Exempel                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| **Varumärkeskris**                | Negativ publicitet som kräver att all extern kommunikation stoppas |
| **Felaktigt innehåll publiceras** | Agenter publicerar innehåll med fel information eller olämplig ton |
| **Systemet beter sig oväntat**    | Agenter skapar stora mängder oväntade uppgifter                    |
| **Kostnader skenar**              | LLM-kostnader ökar snabbt utan förklaring                          |

---

## Så aktiverar du nödstoppet

Du kan aktivera kill switch på två sätt:

### Via dashboarden

1. Gå till **Inställningar** i sidomenyn.
2. Hitta **Kill Switch**.
3. Slå på reglaget.
4. Bekräfta i dialogen som visas.

### Via Slack

Skriv kommandot `/fia kill` i valfri Slack-kanal där FIA-boten finns.

!!! tip "Slack är snabbast"
Om du behöver stoppa systemet akut och inte har dashboarden öppen är Slack-kommandot snabbaste vägen.

---

## Så avaktiverar du nödstoppet

När situationen är under kontroll avaktiverar du kill switch på samma sätt:

### Via dashboarden

1. Gå till **Inställningar**.
2. Slå av **Kill Switch**-reglaget.
3. Agenterna återgår till **online**-status och börjar bearbeta köade uppgifter.

### Via Slack

Skriv kommandot `/fia resume` i Slack.

!!! info "Uppgifter som avbröts"
Uppgifter som var pågående när nödstoppet aktiverades markeras med en avbryten-status. De kan behöva startas om manuellt.

---

## Alternativ: pausa enskild agent

Om problemet gäller en specifik agent behöver du inte stoppa hela systemet. Du kan istället pausa den enskilda agenten.

| Åtgärd             | Omfattning   | Övriga agenter            | Lämpligt när                          |
| ------------------ | ------------ | ------------------------- | ------------------------------------- |
| **Pausa en agent** | En agent     | Fortsätter arbeta normalt | En agent beter sig konstigt           |
| **Kill switch**    | Alla agenter | Allt stoppas              | Systemövergripande problem eller kris |

Så pausar du en agent:

1. Gå till **Agenter** i sidomenyn.
2. Klicka på den agent du vill pausa.
3. Välj **Pausa**.
4. Agenten visar status **paused** (grå) och tar inte emot nya uppgifter.
5. För att återaktivera, klicka **Återuppta**.

---

## Granskningsspår

Alla aktiveringar och avaktiveringar av nödstoppet loggas automatiskt. I loggen registreras:

- Vem som aktiverade/avaktiverade
- Tidpunkt
- Varaktighet (hur länge nödstoppet var aktivt)

Du hittar detta i **Aktivitet** genom att filtrera på systemhändelser.

!!! info "Full spårbarhet"
Loggen kan inte redigeras eller raderas. Det ger full spårbarhet för revisioner och uppföljning.
