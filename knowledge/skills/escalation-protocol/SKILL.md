---
name: escalation-protocol
description: Eskaleringslogik – när och hur uppgifter eskaleras till Orchestrator vid avslag eller fel.
version: 1.0.0
---

# Escalation Protocol

## Regler

1. Efter tre (3) konsekutiva avslag från Brand Agent eskaleras ärendet till Orchestrator via Slack
2. Eskalera omedelbart vid budgetöverskridande eller säkerhetsincidenter
3. Vid eskalering: inkludera taskId, agentens namn, antal försök och sammanfattad feedback
4. Eskalerade ärenden pausar tills Orchestrator tar beslut
5. Logga alla eskaleringar i activity-tabellen med action "escalated"
