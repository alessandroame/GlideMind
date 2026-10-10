# Protocollo di Qualità Shift-Left & Pre-Delivery Gates (GlideMind)

Questo documento definisce il protocollo vincolante per l'eliminazione dei cicli di rework e la prevenzione sistematica dei difetti architetturali e di UI/UX nel repository GlideMind.

*Governance Globale*: L'architettura generale e la metodologia operativa dei 5 gate sono governate centralmente dal plugin [`engineering-workflow`](file:///c:/github/antigravity-plugins/plugins/engineering-workflow) (Sezione 5) e dalla skill `shift-left-governance`.

---

## I 5 Gate di Qualità Shift-Left in GlideMind

Nessuna modifica viene consegnata all'utente senza aver superato internamente i 5 Gate:

### Gate 1: Matrice Pre-Design UX & Dominio (Ex-Ante)
1. **Occam's Razor & Ergonomia Touch**: Zero controlli duplicati rispetto al frame globale; touch target $\ge 48 \times 48\text{ px}$ con clearance $\ge 24\text{ px}$ dalla navbar (governato da `laws-of-ux`).
2. **Progressive Disclosure & Anti-Naked Data**:
   - Livello 0: stato semantico qualitativo (`● Stato`), frecce di direzione, mai numeri isolati senza unità.
   - Livello 1: grandezze fisiche complete con unità di misura esplicite (`km/h`, `°`, `m slm`).
3. **Vocabolario Pilota & Anti-Gergo (Novice Pilot Spec)**:
   - Traduzione fenomenologica immediata obbligatoria (*Instabilità / Temporali*, *Base Nubi*, *Turbolenza in Termica*).
   - Acronimi accademici (*CAPE*, *LCL*, *EDR*) rigorosamente subordinati in secondo livello o tra parentesi.
4. **Dual High-Contrast Theme (Sunlight Resilient)**:
   - Contrasti WCAG AA ($\ge 4.5:1$) verificati sia su tema scuro sia su `[data-theme="light"]`.

### Gate 2: Rigore di Implementazione In-Flight
1. **Headless Core Purity (`core/`)**: Zero riferimenti a `window`, `document`, `localStorage` o selettori DOM. 100% eseguibile in Node.js puro (`engineering-workflow`, Sez. 4).
2. **SSOT Reattivo (`core/store.js`)**: Le viste aggiornano unicamente lo store tramite azioni pub/sub.
3. **Mappatura Rigorosa CSS**: Vietato l'uso di utility CSS non dichiarate in `css/theme.css`.
4. **Strict English nel Codice**: 100% inglese per codice, commenti, log e test. Stringhe UI localizzate in italiano.

### Gate 3: Test Suite di Governance Automatizzata (`npm test`)
La suite [shiftLeftGovernance.test.mjs](file:///c:/github/GlideMind/tests/ui/shiftLeftGovernance.test.mjs) verifica programmaticamente:
- Isolamento headless dei moduli `core/` e adapter pattern per lo storage.
- Presenza di traduzione contestuale in linguaggio comune per LCL, CAPE ed EDR nelle viste.
- Assenza di naked numbers e arrow isolate nei widget temporali.
- Presenza del touch floor `--gm-touch-min` e della guardia landscape in `css/theme.css`.
- Assenza di emoji decorative vietate (`📈`, `🎙️`, `⏱️`, `ℹ️`, `🚀`, `✨`, `🔥`, `🎉`).
- Prevenzione troncamenti flexbox (`.gm-flight-label`, `.gm-flight-target`).

### Gate 4: Loop di Ispezione Geometrica & Visiva
- Assenza di overflow orizzontale su schermi 360px–390px.
- Unità `100dvh` su container a tutta altezza.

### Gate 5: Briefing con Evidenza Pre-Flight
La risposta di consegna deve certificare esplicitamente il superamento dei 5 Gate prima di richiedere la conferma di commit o rilascio.
