# API-kontrakt

FIA Gateway exponerar ett internt REST API på port 3001. API:et konsumeras av Dashboard PWA och FIA CLI.

!!! warning "Ej exponerat externt"
    API:et är enbart tillgängligt internt (localhost/VPN). Det exponeras **inte** mot internet.

## Autentisering

FIA stödjer två autentiseringsmetoder:

### Supabase JWT (Dashboard / externa klienter)

Dashboard-användare autentiseras via Supabase Auth. JWT-token skickas i `Authorization`-headern:

```
Authorization: Bearer <supabase-jwt>
```

Gateway validerar JWT mot Supabase och extraherar användarens roll från `profiles`-tabellen.

### FIA_CLI_TOKEN (CLI)

CLI använder en enkel token-baserad autentisering som kringgår JWT-validering:

```
Authorization: Bearer <FIA_CLI_TOKEN>
```

!!! info "CLI-token ger admin-roll"
    FIA_CLI_TOKEN-autentisering ger automatiskt `admin`-roll. Token definieras i `.env` och delas mellan gateway och CLI.

## Felformat

Alla felrespons följer ett standardiserat format:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions to perform this action"
  }
}
```

### Statuskoder

| Kod | Betydelse |
|-----|-----------|
| `200` | OK – lyckad förfrågan |
| `201` | Created – resurs skapad |
| `400` | Bad Request – ogiltig indata |
| `401` | Unauthorized – saknar autentisering |
| `403` | Forbidden – otillräcklig behörighet |
| `404` | Not Found – resursen finns inte |
| `500` | Internal Server Error – oväntat fel |

### Felkoder

| Kod | Beskrivning |
|-----|-------------|
| `UNAUTHORIZED` | Saknar eller ogiltig autentisering |
| `FORBIDDEN` | Autentiserad men saknar behörighet |
| `NOT_FOUND` | Resursen hittades inte |
| `VALIDATION_ERROR` | Indata uppfyller inte Zod-schema |
| `KILL_SWITCH_ACTIVE` | Kill switch är aktiverad |
| `RATE_LIMIT_EXCEEDED` | För många förfrågningar |

## Rate Limiting

Alla `/api/*`-routes har rate limiting:

| Parameter | Värde |
|-----------|-------|
| **Fönster** | 15 minuter |
| **Max förfrågningar** | 100 per fönster |
| **Scope** | Per IP-adress |

## Health Check

```
GET /api/health
```

Kräver **ingen** autentisering. Returnerar gateway-status:

```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "0.5.5"
}
```

## API-specifikation (OpenAPI)

<swagger-ui src="../assets/openapi.json"/>

!!! note "Auto-genererad"
    Swagger UI-specifikationen genereras automatiskt från Zod-scheman som validerar alla API-endpoints. Se `src/api/` för route-definitioner.
