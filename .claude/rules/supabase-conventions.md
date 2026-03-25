---
paths:
  - "src/**/*.ts"
---

# Supabase-konventioner

- Supabase-klienten skapas i gateway, inte per agent
- Använd Realtime websockets för status-uppdateringar (tasks, agents)
- Alla task-statusändringar går via status-machine.ts — validera övergångar
- Feedback sparas i `feedback`-tabellen med dimensioner: tonality, accuracy, clarity, brand_fit, channel_fit
- system_settings-tabellen hanterar kill switch och global config
- Skriv aldrig direkt SQL — använd Supabase JS-klienten
- EU-region — data lämnar aldrig EU
