# Scheda Intervento: Attivazione Globale Suite Antigravity Plugins e Risoluzione Slash Command /next-step

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Correzione percorso di installazione della suite `antigravity-plugins` e attivazione permanente dei comandi slash a livello globale.

---

## 1. Causa Radice (Root Cause Analysis)

Nel precedente intervento (`2026-10-08_antigravity-plugins-suite-installation.md`), i plugin della suite erano stati collegati tramite Directory Junction NTFS all'interno di `GlideMind\.agents\plugins\`.

Tuttavia, l'architettura di Antigravity e del relativo Language Server prevede:
1. I plugin vengono rilevati e registrati unicamente nella directory di configurazione utente globale `~/.gemini/config/plugins/` (e tramite dichiarazione `"enabled": true` in `~/.gemini/config/config.json`). La sottocartella `.agents/plugins/` di un workspace non è una root riconosciuta dal discovery engine per i comandi slash dei plugin.
2. In `~/.gemini/config/plugins/` era presente unicamente `laws-of-ux`, mentre gli altri 7 plugin (incluso `cognitive-persistence`, che espone le skill `/next-step` e `/memory-sync`) erano assenti.
3. Il Language Server di Antigravity indicizza le nuove directory di plugin aggiunte su disco al momento dello startup/boot della sessione.

---

## 2. Azioni Correttive Eseguite

1. **Creazione Junction Globali NTFS**:
   Collegate tutte le directory dei plugin da `C:\github\antigravity-plugins\plugins\` direttamente a `C:\Users\aame\.gemini\config\plugins\`:
   - `cognitive-persistence` (Skill `/next-step`, `/memory-sync`)
   - `engineering-sobriety` (Skill `/tone-audit`, regole anti-sycophancy)
   - `engineering-workflow` (Skill `/worktree-lifecycle`, `/trace-debugging`)
   - `execution-guard` (Skill `/circuit-breaker`, `/task-watchdog`)
   - `laws-of-ux` (convertito in Junction per allineamento continuo con il repo sorgente)
   - `proactive-mentorship` (Skill `/prompt-refactor`)
   - `skill-governance` (Skill `/skill-audit`, `/skill-token-optimizer`, `/skill-collision-check`)
   - `telemetry-analytics` (Skill `/plugin-analytics`, `/telemetry-export`)

2. **Abilitazione nello Stato di Configurazione**:
   Invocato il metodo RPC `JetboxWriteState` sul Language Server per marcare esplicitamente `"enabled": true` per tutti gli 8 plugin all'interno di `~/.gemini/config/config.json`.

3. **Verifica Validità Suite**:
   Eseguito `npm test` sul repository `antigravity-plugins`: 9/9 componenti validati con 0 errori e 0 avvisi.

---

## 3. Risultato e Prossimi Passi

- Tutti gli 8 plugin sono ora collegati in modo simbiotico a livello globale.
- Per rendere visibili i comandi slash (es. `/next-step`) nel menu a tendina della chat di Antigravity, è necessario **riavviare Antigravity IDE** (o ricaricare la finestra) per far scattare la scansione iniziale del Language Server.
