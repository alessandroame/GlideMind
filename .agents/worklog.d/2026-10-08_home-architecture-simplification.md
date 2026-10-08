# Scheda Intervento: Semplificazione Architetturale Home Dashboard (Fase 3)

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Definizione della specifica concettuale minimale per `HomeDashboardView.js` (Ordinamento preferiti per volabilità e Currency pilota).

---

## 1. Contesto & Diagnosi
Durante l'iterazione esplorativa sul mockup statico (`mockup-preview.html`), è emerso che l'accumulo di 6 concetti disparati (selettore date multiplo, caroselli densi, Nowcast ridondante, statistiche di carriera, snippet voli con grafici SVG e bottoni multipli) generava un affollamento visivo opprimente (clutter), contrario alle leggi di usabilità (Miller's Law, Tesler's Law) e all'ergonomia outdoor sotto forte luce solare.
Inoltre, il mockup statico monolitico rischiava di creare debito da doppio binario rispetto ai componenti reattivi di produzione.

---

## 2. Decisione Architetturale (ADR)
La Home di GlideMind viene radicalmente snellita e circoscritta a **due soli blocchi funzionali**:

1. **Elenco dei Comprensori Preferiti Ordinato per Condizione di Volabilità**:
   - Consuma `pinnedLocationIds` dallo store (`core/store.js`).
   - Ordina automaticamente le località preferite in ordine decrescente di volabilità (Migliore condizione pre-volo in cima $\to$ Cautela $\to$ Chiuso in fondo).
   - Ogni card mostra esclusivamente:
     - Nome Comprensorio e provincia (es. `Monte Cornizzolo (LC)`).
     - Badge di stato sintetico (`Aperto`, `Cautela`, `Chiuso`).
     - Decollo migliore attivo ($T_{\text{best}}$): quota, direzione e intensità del vento.
     - Atterraggio di rientro ($L_{\text{safe}}$): vento al suolo ed efficienza planata richiesta $E_{\text{richiesta}}$.
   - Tap sulla card apre il dossier comprensorio o indirizza a `ForecastView`.

2. **Stato di Volo / Currency del Pilota**:
   - Singola riga o card pulita con indicazione dell'ultimo volo (data/giorni fa, decollo, durata) e stato di allenamento (`Attivo`).
   - Un solo pulsante primario di azione rapida: `+ Carica IGC`.
   - Tutte le statistiche di carriera complesse, grafici altimetrici e replay 3D rimangono confinate nel tab dedicato `LogbookView`.

---

## 3. Piano Esecutivo per la Prossima Sessione
1. **Creazione Modulo `ui/views/HomeDashboardView.js`**:
   - Implementare l'interfaccia standard `{ mount(containerEl, params), unmount() }`.
   - Integrare l'ordinamento dinamico dei preferiti in base a `evaluateFlyability` e stato atterraggio.
   - Sottoscrizione alle fette `pinnedLocationIds`, `selectedLocationId`, `activeDate`, `weatherData`.
2. **Suite di Test Unitari**:
   - Creare `tests/ui/homeDashboardView.test.mjs` (test di rendering DOM, ordinamento decrescente, interazioni click, pulizia unmount).
3. **Registrazione Router & Allineamento**:
   - Registrare la vista in `ui/app.js` (`router.registerView('home', homeDashboardView)`).
   - Eseguire suite `node --test` e aggiornare `DESIDERATA.md` (Fase 3 $\to$ Completato).
