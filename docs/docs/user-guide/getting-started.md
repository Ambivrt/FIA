# Kom igång

Välkommen till FIA -- Forefront Intelligent Automation. Den här guiden hjälper dig att logga in, förstå dashboarden och snabbt komma igång med ditt dagliga arbete som Marketing Orchestrator.

---

## Logga in

1. Öppna **[fia.forefront.se](https://fia.forefront.se)** i din webbläsare.
2. Logga in med ditt Forefront-konto.
3. Du landar på **Hem-sidan** -- din dagliga överblick.

!!! tip "Bokmärk dashboarden"
    Lägg till `fia.forefront.se` som bokmärke eller installera FIA som app via webbläsarens "Installera"-funktion (PWA). Då får du en egen ikon på skrivbordet.

---

## Navigera dashboarden

Sidomenyn till vänster ger dig tillgång till alla delar av FIA.

| Sida              | Vad du hittar där                                                |
| ----------------- | ---------------------------------------------------------------- |
| **Hem**           | KPI-kort, agentpuls och senaste uppgifter                        |
| **Agenter**       | Översikt av alla sju agenter med status och senaste aktivitet    |
| **Godkännanden**  | Kö med uppgifter som väntar på din granskning                    |
| **Triggers**      | Automatiska åtgärder som kan behöva ditt godkännande             |
| **Kalender**      | Schemalagda uppgifter och publiceringsplan                       |
| **Aktivitet**     | Kronologisk logg över allt som hänt i systemet                   |
| **Inställningar** | Systemkonfiguration, kill switch och användarinställningar       |
| **Kostnader**     | Förbrukning per agent, modell och tidsperiod                     |

---

## Förstå agentstatus

Varje agent visar en statussymbol med färg. Här är vad de betyder:

| Status      | Färg    | Betydelse                                                        |
| ----------- | ------- | ---------------------------------------------------------------- |
| **Online**  | Grön    | Agenten är redo och väntar på uppgifter                          |
| **Working** | Gul     | Agenten arbetar aktivt med en uppgift just nu                    |
| **Paused**  | Grå     | Agenten är tillfälligt pausad och tar inte emot nya uppgifter    |
| **Killed**  | Svart   | Nödstopp är aktiverat -- agenten är helt stoppad                 |
| **Error**   | Röd     | Något har gått fel -- kräver uppmärksamhet                       |

!!! info "Vad gör jag om en agent visar error?"
    Oftast löser sig felet automatiskt. Om statusen kvarstår längre än 15 minuter, kontrollera aktivitetsloggen för detaljer. Se även [Vanliga frågor](faq.md).

---

## Hem-sidan

Hem-sidan är din dagliga startpunkt. Här ser du det viktigaste i ett ögonkast.

### KPI-kort

Överst visas fyra nyckeltal:

| KPI-kort                    | Beskrivning                                              |
| --------------------------- | -------------------------------------------------------- |
| **Content denna vecka**     | Antal innehållsenheter som producerats den här veckan     |
| **Godkännandegrad**         | Andel uppgifter som godkänts vid första granskning        |
| **Väntande godkännanden**   | Antal uppgifter som väntar på din granskning just nu      |
| **Kostnad MTD**             | Total LLM-kostnad hittills denna månad                    |

### Agentpuls

Under KPI-korten ser du en rad med alla sju agenter och deras aktuella status. Klicka på en agent för att se detaljer.

### Senaste uppgifter

Längst ner listas de senaste uppgifterna med status, agent och tidsstämpel. Klicka på en uppgift för att se innehåll och detaljer.

---

## Tips för nya användare

!!! success "Fem saker att göra din första dag"
    1. **Logga in** och bekanta dig med sidomenyn.
    2. **Kolla agentpulsen** -- alla agenter bör visa "online" (grönt).
    3. **Öppna godkännandekön** och se om något väntar.
    4. **Titta på aktivitetsloggen** för att förstå vad agenterna gör.
    5. **Läs igenom [Dagligt arbetsflöde](daily-workflow.md)** så att du vet din morgonrutin.

!!! warning "Du behöver inte övervaka allt"
    FIA är designat för att agenterna ska arbeta självständigt. Du behöver bara agera när något hamnar i godkännandekön eller när en eskalering dyker upp. Lita på systemet -- det kontaktar dig när det behövs.
