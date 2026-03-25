---
description: Bygg och deploya gateway
---
## Pre-deploy check

!`git status --short`

!`npm run build 2>&1 | tail -20`

Om bygget lyckas, rapportera att det är redo för `pm2 restart gateway`.
Om bygget misslyckas, analysera felen och föreslå fix.

Kör INTE pm2 restart automatiskt — vänta på bekräftelse.
