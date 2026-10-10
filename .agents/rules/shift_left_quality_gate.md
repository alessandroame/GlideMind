# Protocollo di Qualità Shift-Left & Pre-Delivery Gates (GlideMind)

Questo documento definisce il protocollo vincolante per l'eliminazione dei cicli di rework e la prevenzione sistematica dei difetti architetturali e di UI/UX.

---

## 1. Il Principio Shift-Left: Dai Controlli Reattivi ai Vincoli Generativi

Nel ciclo di sviluppo tradizionale, le verifiche (audit Laws of UX, controlli ergonomici, audit pilota principiante, test di layout) venivano eseguite ex-post su richiesta dell'utente.
Il principio **Shift-Left** inverte questa dinamica: **i criteri di conformità diventano pre-condizioni generative obbligatorie prima e durante la scrittura del codice**.

Nessuna modifica viene consegnata all'utente senza aver superato internamente i 5 Gate del protocollo.

---

## 2. I 5 Gate di Qualità Shift-Left

### Gate 1: Matrice Pre-Design UX & Dominio (Ex-Ante)
Prima di redigere markup, stili o controller:
1. **Occam's Razor & Prägnanz**: Zero controlli duplicati rispetto al frame globale (`#bottom-nav-bar` o `#desktop-nav-bar`). Nessun pulsante parassita di back o home negli header interni.
2. **Fitts's Law & Thumb Zone**: Touch target $\ge 48 \times 48\text{ px}$ per ogni elemento interattivo su mobile. Controlli primari (scrubber, azioni rapide) posizionati nel terzo inferiore dello schermo con clearance $\ge 24\text{ px}$ dalla navbar.
3. **Progressive Disclosure & Anti-Naked Data**:
   - Livello 0 (Panoramica): stato semantico qualitativo a colpo d'occhio (`● Stato`), frecce di direzione, mai numeri isolati senza unità.
   - Livello 1 (Dettaglio): grandezze fisiche complete con unità di misura esplicite (`km/h`, `°`, `m slm`).
4. **Vocabolario Pilota & Anti-Gergo (Novice Pilot Spec)**:
   - Traduzione fenomenologica immediata (*Instabilità / Temporali*, *Base Nubi*, *Turbolenza in Termica*).
   - Acronimi accademici (*CAPE*, *LCL*, *EDR*) rigorosamente subordinati in secondo livello o tra parentesi.
5. **Dual High-Contrast Theme (Dark Cockpit + Sunlight Mode)**:
   - Verifica preventiva dei contrasti WCAG 2.1 AA ($\ge 4.5:1$ per il testo, $\ge 3:1$ per indicatori grafici) sia su tema scuro sia su `[data-theme="light"]`.
6. **Mobile Portrait-First & Zero Horizontal Scroll**:
   - Layout fluido `100% width` su card e container, `100dvh` dinamico, `touch-action` esplicito.

### Gate 2: Rigore di Implementazione In-Flight
1. **Headless Core Purity (`core/`)**:
   - Zero riferimenti a `window`, `document`, `localStorage` o selettori DOM.
   - Tutti i moduli core devono poter essere eseguiti al 100% in Node.js puro.
2. **SSOT Reattivo (`core/store.js`)**:
   - Le viste non mutano mai lo stato manipolando nodi DOM fratelli; aggiornano unicamente lo store tramite azioni pub/sub.
3. **Mappatura Rigorosa CSS**:
   - Vietato utilizzare classi CSS utility non dichiarate in `css/theme.css`. Ogni nuova classe deve essere esplicitata e commentata prima o contestualmente all'uso.
4. **Inglese Esclusivo nel Codice**:
   - Identificatori, funzioni, commenti, log e test scritti al 100% in lingua inglese. Stringhe UI localizzate in italiano con chiavi pulite.

### Gate 3: Test Suite di Governance Automatizzata (`npm test`)
Prima di concludere il task, eseguire `npm test`.
La suite verifica automaticamente:
- Isolamento headless dei moduli core.
- Assenza di naked numbers e acronimi crudi senza etichetta pratica.
- Assenza di emoji decorative vietate (`📈`, `🎙️`, `⏱️`, `ℹ️`).
- Rispetto del touch floor $\ge 48\text{px}$ e delle regole flexbox anti-troncamento.
- Funzionamento deterministico delle funzioni di calcolo e dei fallback offline.

### Gate 4: Loop di Ispezione Geometrica & Visiva
Per modifiche con impatto UI:
- Verificare le dimensioni e i vincoli flexbox (`min-width: 0`, `flex-shrink: 0`) per prevenire troncamenti di etichette o accavallamenti.
- Assenza di overflow orizzontale su schermi 360px–390px.

### Gate 5: Briefing con Evidenza Pre-Flight
La risposta di consegna non si limita a dire "ho fatto la modifica", ma include la sintesi del passaggio dei 5 Gate, certificando che la conformità UX e architetturale è già stata garantita.
