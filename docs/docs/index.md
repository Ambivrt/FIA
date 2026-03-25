# FIA – Forefront Intelligent Automation

**AI-agentgateway som ersätter Forefronts marknadsavdelning.**

Sju agentkluster utför operativt marknadsarbete. 1–2 Marketing Orchestrators styr – sätter riktning och godkänner.

---

## Princip

**Human on the loop** – agenter beslutar och exekverar inom definierade ramar. Orchestrator övervakar, godkänner och justerar.

## Triple-interface

FIA nås via tre gränssnitt:

| Gränssnitt    | Beskrivning                                 |
| ------------- | ------------------------------------------- |
| **Slack**     | Kommandon, notiser, snabb interaktion       |
| **Dashboard** | Grafisk vy, godkännandekö, KPI, kill switch |
| **CLI**       | Terminalverktyg för SSH/lokal access        |

## Agenter

| Agent        | Ansvar                                    | Autonomi     |
| ------------ | ----------------------------------------- | ------------ |
| Strategy     | Planering, kvartals-/månadsplaner         | Semi-autonom |
| Intelligence | Omvärldsbevakning, trendanalys            | Semi-autonom |
| Content      | All textproduktion, blogg, sociala medier | Autonom      |
| Campaign     | Kampanjer, email-sekvenser, annonser      | Autonom      |
| SEO          | Sökoptimering, keyword-analys             | Autonom      |
| Lead         | Lead scoring, nurture-sekvenser           | Autonom      |
| Analytics    | Rapporter, KPI-tracking, morgonpuls       | Autonom      |
| Brand        | Kvalitetsgranskning (vetorätt)            | Autonom      |

## Dokumentation

<div class="grid cards" markdown>

- :material-cog:{ .lg .middle } **Arkitektur**

  ***

  Systemöversikt, agentkluster, datamodell, API-kontrakt, trigger engine, LLM-routing, säkerhet.

  [:octicons-arrow-right-24: Arkitektur](architecture/overview.md)

- :material-server:{ .lg .middle } **Gateway**

  ***

  Installation, deploy, agent YAML-format, MCP-integrationer, scheduler, felsökning.

  [:octicons-arrow-right-24: Gateway](gateway/setup.md)

- :material-monitor-dashboard:{ .lg .middle } **Gränssnitt**

  ***

  Dashboard, CLI och Slack – alla tre gränssnitten dokumenterade.

  [:octicons-arrow-right-24: Gränssnitt](interfaces/dashboard/overview.md)

- :material-book-open-variant:{ .lg .middle } **Användarmanual**

  ***

  Kom igång, dagligt arbetsflöde, godkännanden, triggers och nödstopp.

  [:octicons-arrow-right-24: Användarmanual](user-guide/getting-started.md)

</div>

---

**Version:** 0.5.6 · **Senast uppdaterad:** 2026-03-25
