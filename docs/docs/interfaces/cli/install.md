# CLI – Installation

FIA CLI är ett terminalverktyg som ger full åtkomst till agenter, tasks, triggers och kill switch direkt från terminalen.

---

## Förutsättningar

| Krav        | Version                           |
| ----------- | --------------------------------- |
| Node.js     | ≥ 20                              |
| npm         | Medföljer Node.js                 |
| FIA Gateway | Körande instans (lokal eller VPS) |

---

## Autentisering

CLI:t autentiserar mot gateway-API:t med en token istället för JWT.

| Variabel        | Beskrivning                          |
| --------------- | ------------------------------------ |
| `FIA_CLI_TOKEN` | Hemlig token som definieras i `.env` |

```bash
# .env (på gateway-servern)
FIA_CLI_TOKEN=din-hemliga-token-här
```

!!! warning "Säkerhet"
`FIA_CLI_TOKEN` ger **admin-behörighet** och kringgår JWT-validering. Dela aldrig denna token. Använd en stark, slumpmässig sträng.

### Hur det fungerar

```
CLI-anrop → Authorization: Bearer <FIA_CLI_TOKEN>
         → Gateway auth middleware
         → Token matchar FIA_CLI_TOKEN i .env?
           → Ja: Tilldela admin-roll, skippa JWT
           → Nej: 401 Unauthorized
```

---

## Installation

### Alternativ 1: Bygg och kör via npx

```bash
# Bygg CLI
npm run build:cli

# Kör via npx
npx fia status
npx fia agents
```

### Alternativ 2: Kör direkt med ts-node (utveckling)

```bash
npx ts-node -P tsconfig.cli.json cli/index.ts status
npx ts-node -P tsconfig.cli.json cli/index.ts agents
```

!!! tip "Snabbare under utveckling"
`ts-node` kräver ingen build-steg men är långsammare vid start. Använd det vid utveckling och `npm run build:cli` i produktion.

---

## Alias-konfiguration

Lägg till ett alias i din shell-profil för snabbare åtkomst:

=== "Bash"

    ```bash
    # ~/.bashrc
    alias fia='npx fia'
    ```

=== "Zsh"

    ```bash
    # ~/.zshrc
    alias fia='npx fia'
    ```

Ladda om profilen:

```bash
source ~/.bashrc  # eller ~/.zshrc
```

Nu kan du köra:

```bash
fia status
fia agents
fia run content blog_post --priority high
```

---

## Konfigurationsvalidering

Vid start kör CLI:t `validateConfig()` som kontrollerar:

1. `FIA_CLI_TOKEN` finns i miljövariabler
2. Gateway-URL är nåbar (standard: `http://localhost:3000`)

```typescript
function validateConfig(): void {
  if (!process.env.FIA_CLI_TOKEN) {
    console.error("FIA_CLI_TOKEN saknas. Ange den i .env eller som miljövariabel.");
    process.exit(1);
  }
}
```

!!! note "Gateway-URL"
Standardadressen är `http://localhost:3000`. Ändra via miljövariabeln `FIA_API_URL` om gatewayen körs på annan adress.

---

## Forefront Earth-palett

CLI:t använder Forefronts varumärkesfärger i terminalutskrifter via `chalk`:

| Färg    | Hex       | Användning               |
| ------- | --------- | ------------------------ |
| Vinröd  | `#7D5365` | Rubriker, primär text    |
| Grön    | `#42504E` | Statusindikator (online) |
| Blålila | `#555977` | Sekundär information     |
| Brun    | `#756256` | Detaljer                 |
| Grå     | `#7E7C83` | Dämpade element          |

### Gradient

Gradienten `#FF6B0B → #FFB7F8 → #79F2FB` används i CLI-headern:

```
  ╔═══════════════════════════════════════╗
  ║  ███████╗██╗ █████╗                   ║
  ║  ██╔════╝██║██╔══██╗                  ║
  ║  █████╗  ██║███████║                  ║
  ║  ██╔══╝  ██║██╔══██║                  ║
  ║  ██║     ██║██║  ██║                  ║
  ║  ╚═╝     ╚═╝╚═╝  ╚═╝                 ║
  ║  Forefront Intelligent Automation     ║
  ╚═══════════════════════════════════════╝
```

!!! tip "Terminalkompatibilitet"
Färger kräver en terminal som stöder 256-färger eller truecolor (de flesta moderna terminaler). I terminaler utan färgstöd visas text utan formatering.
