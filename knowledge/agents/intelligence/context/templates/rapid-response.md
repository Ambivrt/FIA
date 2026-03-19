# Rapid Response – Underlag för snabbreplik

Intelligence Agent har identifierat ett fynd som kräver snabb respons.
Detta template används för att skapa ett strukturerat underlag som
Content Agent kan använda för att producera en replik.

## OBS: Intelligence Agent SKRIVER INTE repliken

Du skapar ett underlag. Content Agent skriver. Brand Agent granskar.

## Underlag-struktur

```json
{
  "content_type": "rapid_response_brief",
  "title": "Rapid Response: [kort rubrik]",
  "body": "## Markdown-underlag (se nedan)",
  "summary": "Varför detta kräver respons",
  "metadata": {
    "trigger_score": 0.0,
    "trigger_action": "rapid_response",
    "source_urls": [],
    "suggested_channels": [],
    "urgency": "high | normal",
    "response_window_hours": 24
  }
}
```

## Body-struktur

1. **Vad har hänt**: Faktuell sammanfattning av fyndet
2. **Varför det är relevant**: Koppling till Forefront
3. **Föreslagna vinklar**: 2–3 förslag på hur Forefront kan svara
4. **Kanalrekommendation**: LinkedIn-post, blogg, nyhetsbrev, kombination?
5. **Tonalitetsriktning**: Ska vi vara first-movers, analyserande, kontrasterande?
6. **Risker**: Finns det anledning att INTE svara?

## Flöde efter skapande

1. Denna task skapas med `agent_id` = Content Agent
2. Content Agent tar emot och producerar replik baserat på underlaget
3. Brand Agent granskar
4. Publicering enligt autonominivå för vald kanal
