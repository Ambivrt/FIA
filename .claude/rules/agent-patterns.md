---
paths:
  - "knowledge/agents/**/*"
  - "src/agents/**/*"
---

# Agent-mönster

- Varje agent definieras av sin `agent.yaml` — det är source of truth
- Lägg aldrig till hårdkodad agentlogik i gateway
- agent.yaml innehåller: routing, skills, tools, autonomy, triggers, writable
- Shared skills ligger i `knowledge/shared/`, agentspecifika i `knowledge/agents/<slug>/skills/`
- `system_context` laddas alltid, `task_context` laddas per task_type
- `memory/`-mappen är skrivbar för agenten — ackumulerade lärdomar
- `sample_review_rate` styr stickprovsfrekvens (0.0–1.0)
- Triggers har `requires_approval`-flagg — respektera den
- Brand Agent har `has_veto: true` — allt content-output måste passera den
