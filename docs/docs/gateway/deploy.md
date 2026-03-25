# Deploy

FIA Gateway koar pa Google Cloud Platform (GCP) Compute Engine i `europe-north1` (Finland) for lag latens och EU-datalagring.

---

## GCP-specifikation

| Parameter | Varde                                                   |
| --------- | ------------------------------------------------------- |
| Maskintyp | `e2-small` (2 vCPU, 2 GB RAM)                           |
| Zon       | `europe-north1-b`                                       |
| OS        | Ubuntu 24.04 LTS                                        |
| Disk      | 20 GB SSD (pd-balanced)                                 |
| Kostnad   | ~150-250 SEK/manad                                      |
| Brandvagg | Ingen inkommande trafik (Socket Mode + Supabase-klient) |

!!! info "Ingen inkommande trafik"
Gateway behovr inga oppna portar. Slack kommunicerar via Socket Mode (utgaende websocket) och Supabase via klient-SDK. REST API:t lyssnar enbart pa `localhost:3001`.

---

## SSH via IAP

Anslut till instansen via Identity-Aware Proxy (IAP) -- kravr inga oppna SSH-portar:

=== "Bash"

    ```bash
    gcloud compute ssh fia-gateway --zone europe-north1-b --tunnel-through-iap
    ```

=== "PowerShell"

    ```powershell
    gcloud compute ssh fia-gateway --zone europe-north1-b --tunnel-through-iap
    ```

!!! tip "Forsta gangen"
Om du inte har `gcloud` installerat, folj [Google Cloud SDK-installationen](https://cloud.google.com/sdk/docs/install). Logga in med `gcloud auth login` och satt projekt med `gcloud config set project <projekt-id>`.

---

## Deploy-script

Repot innehaller ett deploy-script (`scripts/deploy.sh`) som automatiserar hela processen:

```bash
bash deploy.sh
```

Scriptet utfor foljande steg:

| Steg | Beskrivning                                                                    |
| ---- | ------------------------------------------------------------------------------ |
| 1/6  | Kontrollerar systemkrav (Node.js 22, PM2, Git). Installerar vid behov.         |
| 2/6  | Hamtar senaste koden fran `main`-branchen.                                     |
| 3/6  | Installerar beroenden (`npm ci`).                                              |
| 4/6  | Bygger TypeScript (`npm run build`).                                           |
| 5/6  | Validerar `.env` -- stannar om filen saknas eller REQUIRED-variabler ar tomma. |
| 6/6  | Startar gateway med PM2, sparar konfiguration for auto-restart.                |

!!! warning "Forsta deploy"
Vid forsta deploy stannar scriptet vid steg 5 om `.env` saknas. Skapa den manuellt:

    ```bash
    cp ~/fia-server/.env.example ~/fia-server/.env
    nano ~/fia-server/.env
    ```

    Fyll i alla REQUIRED-nycklar och kor scriptet igen.

---

## PM2-konfiguration

Gateway koar som PM2-process med konfigurationen i `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "fia-gateway",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
```

### Vanliga PM2-kommandon

| Kommando                          | Beskrivning                                   |
| --------------------------------- | --------------------------------------------- |
| `pm2 start ecosystem.config.js`   | Starta gateway                                |
| `pm2 restart fia-gateway`         | Starta om gateway                             |
| `pm2 stop fia-gateway`            | Stoppa gateway                                |
| `pm2 logs fia-gateway`            | Visa loggar live                              |
| `pm2 logs fia-gateway --lines 50` | Visa senaste 50 raderna                       |
| `pm2 status`                      | Visa processens status                        |
| `pm2 monit`                       | Interaktiv overvakning                        |
| `pm2 save`                        | Spara processlist for auto-restart vid reboot |

!!! tip "Auto-start vid reboot"
Kor `pm2 startup` for att generera systemd-konfiguration och `pm2 save` for att spara nuvarande processlista. Gateway startar da automatiskt efter reboot.

---

## CI/CD via GitHub Actions

Repot har en CI-pipeline i `.github/workflows/ci.yml` som koar pa varje push och pull request till `main`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Typecheck
        run: npx tsc --noEmit
      - name: Lint
        run: npm run lint
      - name: Format check
        run: npm run format:check
      - name: Test
        run: npm test
```

Pipeline-steg:

| Steg      | Kommando               | Beskrivning                                         |
| --------- | ---------------------- | --------------------------------------------------- |
| Typecheck | `npx tsc --noEmit`     | Validerar TypeScript-typer utan att generera output |
| Lint      | `npm run lint`         | ESLint-kontroll                                     |
| Format    | `npm run format:check` | Prettier-kontroll                                   |
| Test      | `npm test`             | Kor testsviten (Jest)                               |

!!! note "Ingen automatisk deploy"
CI-pipelinen deployer inte automatiskt. Deploy sker manuellt via SSH + `deploy.sh`. Detta ar avsiktligt -- gateway-processen hanterar aktiva agentuppgifter och behover kontrollerad omstart.

---

## Deploy-checklista

For manuell deploy, folj denna checklista:

- [ ] SSH till instansen: `gcloud compute ssh fia-gateway --zone europe-north1-b --tunnel-through-iap`
- [ ] Navigera till projektet: `cd ~/fia-server`
- [ ] Hamta senaste koden: `git pull origin main`
- [ ] Installera beroenden: `npm ci`
- [ ] Bygg: `npm run build`
- [ ] Starta om: `pm2 restart fia-gateway`
- [ ] Verifiera loggar: `pm2 logs fia-gateway --lines 30`
- [ ] Kontrollera status: `pm2 status`

!!! danger "Kontrollera aktiva tasks"
Innan omstart, kontrollera att inga kritiska tasks kors. Anvand `pm2 logs fia-gateway --lines 50` eller Slack-kommandot `/fia status` for att se aktuell aktivitet.
