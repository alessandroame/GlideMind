# [2026-10-07] ADR: Phase 2 - Design System & Shell Architecture

## Contesto & Motivazione
Conclusa con successo la Fase 1 di migrazione del motore core headless (149 test passati), la Fase 2 introduce la shell applicativa responsive, il sistema di token visuali per esterni, il motore di stato reattivo (Single Source of Truth) e la navigazione a 5 schede per GlideMind. L'obiettivo è garantire un'esperienza fluida su mobile (100dvh) e desktop, conformità alle leggi di Fitts (target touch >= 44px) e zero modali nidificate.

## Decisioni Architetturali
1. **Motore di Stato Reattivo Headless (`core/store.js`)**:
   - Architettura Pub/Sub sincrona con clonazione profonda difensiva contro le mutazioni esterne dello stato.
   - Interfaccia `storageAdapter` iniettabile: in-memory map per runtime Node.js/test e `createLocalStorageAdapter` con fallback resiliente nel browser.
   - Sottoscrizioni granulari per slice (`subscribeSlice`) per minimizzare i re-render delle viste.
2. **Design System & Token Glare-Resistant (`css/theme.css`)**:
   - Palette dark ad alto contrasto (`--gm-bg-base: #070d18`, `--gm-bg-card: #0f1c30`, accenti aeronautici per volabilità verde/giallo/rosso/arancio).
   - Target di tocco Fitts's law minimi a 44px (`--gm-touch-min: 44px`).
   - Caroselli orizzontali a riga singola con `touch-action: pan-x` e scroll-snap.
   - Overlay a foglio singolo (`#sheet-container`) con transizioni fluide.
3. **Shell Applicativa Ultraleggera (`index.html`)**:
   - Shell HTML5 semantica di 108 righe (< 200 righe da vincolo architetturale).
   - Viewport meta con `viewport-fit=cover` per safe-area-inset su iOS e Android.
   - Header superiore persistente per desktop (>= 768px) e barra a tab inferiore per mobile (< 768px).
4. **Router 5-Tab & View Lifecycle (`ui/router.js`)**:
   - Gestione delle 5 route aeronautiche: `home`, `forecast`, `map`, `logbook`, `settings`.
   - Sincronizzazione automatica bidirezionale tra window hash e `activeView` dello store.
   - Ciclo di vita del montaggio/smontaggio (`mount`, `unmount`).
   - Scorciatoie da tastiera desktop (`H`, `F`, `M`, `L`, `S`) con input guard (`isInputTarget`) per prevenire attivazioni durante la digitazione in input/textarea/contenteditable.
5. **Centralized Sheet Manager (`ui/sheetManager.js`)**:
   - Politica a singolo foglio attivo: chiusura automatica del foglio precedente per scongiurare popup nidificati.
   - Chiusura su tap su backdrop, tasto Escape e pulsante di chiusura esplicito.
6. **Bootstrap Entry Point (`ui/app.js`)**:
   - Inizializzazione coordinata di store, sheetManager e router su DOMContentLoaded, esponendo `window.__GLIDEMIND__` per ispezione e test.

## Impatto e Conseguenze
- Creazione di `core/store.js`, `css/theme.css`, `index.html`, `ui/router.js`, `ui/sheetManager.js`, `ui/app.js`.
- Creazione delle suite di test `tests/core/store.test.mjs`, `tests/ui/router.test.mjs`, `tests/ui/shellIntegrity.test.mjs`, `tests/server.test.mjs`.
- Tutti i 173 test complessivi del repository sono eseguiti e superati con successo in Node.js nativo (0 fallimenti).
