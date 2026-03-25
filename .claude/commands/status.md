---
description: Visa FIA systemstatus — processer, agenter, kö
---
## Systemstatus

!`pm2 jlist`

!`npx ts-node cli/index.ts status 2>/dev/null || echo "CLI ej tillgängligt"`

Sammanfatta statusen kort:
- Vilka processer kör?
- Finns det tasks i kön?
- Några agenter nere?
