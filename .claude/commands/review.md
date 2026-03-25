---
description: Granska senaste ändringar mot main
---

## Ändrade filer

!`git diff --name-only main...HEAD 2>/dev/null || git diff --name-only HEAD~5`

## Detaljerad diff

!`git diff main...HEAD 2>/dev/null || git diff HEAD~5`

Granska ändringarna för:

1. Brott mot agent.yaml-mönstret (hårdkodad logik som borde vara config)
2. Felaktiga statusövergångar
3. Saknad felhantering
4. Säkerhetsproblem (credentials, .env-läckage)

Ge specifik feedback per fil.
