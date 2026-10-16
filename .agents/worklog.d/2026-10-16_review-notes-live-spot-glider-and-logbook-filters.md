# 2026-10-16 — Consolidamento e Implementazione Note Utente (`NOTE-003`, `NOTE-004`, `NOTE-005`)

- **Data**: 2026-10-16
- **Tipo**: Refactoring UX / Semantica Dominio / Filtri Log di Volo
- **Moduli Coinvolti**:
  - `ui/views/HomeDashboardView.js`
  - `ui/views/ForecastView.js`
  - `ui/views/LogbookView.js`
  - `ui/views/FlightDetailSheet.js`
  - `ui/views/SettingsView.js`
  - `css/theme.css`
  - `tests/ui/liveWeatherDataIngestion.test.mjs`
  - `tests/ui/homeDashboardView.test.mjs`
  - `tests/ui/logbookView.test.mjs`
  - `tests/ui/flightDetailSheet.test.mjs`

---

## 1. Contesto e Motivazione
Durante la sessione di revisione delle note salvate (`/review-notes`), sono state analizzate, promosse in `DESIDERATA.md` e implementate tre osservazioni strutturali di prodotto:
1. **`[NOTE-003]` — Semantica della pill verde `Live` e Pagina Esplicita Dati in Tempo Reale dello Spot**:
   - L'indicatore verde `Live` sulla lista generale della Home Dashboard creava dissonanza cognitiva perché lo stato "in tempo reale" ha senso operativo solo se riferito a uno spot specifico, corredato da una vista dedicata con la telemetria del momento attuale.
2. **`[NOTE-004]` — Rimozione della classe di omologazione (`EN-A` / `EN-B` / `EN-C`) usata come indicatore di performance**:
   - La classe di certificazione EN misura il comportamento passivo dell'ala ai test di chiusura e non le sue prestazioni aerodinamiche. Esporla come badge prestazionale sulla pillola Home, nei filtri del Flight Log, nell'header del Dettaglio Volo o nel debriefing istruzionale generava un falso parallelismo.
3. **`[NOTE-005]` — Filtri del Log di Volo a Pills Espandibili per Argomento e Metriche**:
   - I chip statici del Log di Volo sono stati sostituiti con 5 pills per argomento espandibili a menu (`Vela ▾`, `Anno ▾`, `Caratteristiche ▾`, `Tempo ▾`, `Distanza ▾`).

---

## 2. Decisioni Architetturali e Implementative
1. **Oscuramento Pill `Live` in Home e Vista `Dati in Tempo Reale` sullo Spot (`[NOTE-003]`)**:
   - In `HomeDashboardView.js`, `renderLiveWeatherBadge()` mantiene nascosto il badge quando `networkStatus === 'live'` (esponendo solo stati transitori o `Offline / Stima`).
   - In `ForecastView.js`, la pillola verde `● Live` sull'header dello spot (`data-action="open-spot-live-view"`) e il tab dedicato `● Live` in `.gm-quick-subspot-switcher` aprono la vista esplicita `#gm-spot-live-page` (`renderSpotLiveRealtimeCard`), che mostra la rilevazione dell'ora attuale per Decollo Attivo e Atterraggio Attivo (vento, raffiche, direzione, scarto angolare $\Delta^\circ$ rispetto all'orientamento del decollo, base cumuli LCL, pressione QNH/CAPE) e l'evoluzione a breve termine (`-1h → Adesso → +1h`).
2. **Neutralizzazione Badge Classe EN e Focus su Parametri Fisici (`[NOTE-004]`)**:
   - Rimossi i badge `.gm-glider-pill-badge` dalla pillola vela di `HomeDashboardView.js`, dalle card del selettore modelli e dall'header di `FlightDetailSheet.js`.
   - Aggiornati `SettingsView.js`, `ForecastView.js` (`generateFlightBriefing`) e `FlightDetailSheet.js` (`generateEducationalDebriefing`) per riferirsi esclusivamente ai parametri fisici dell'inviluppo ($V_{\text{trim}}$, $V_{\text{max}}$, efficienza e margine del cono di planata).
3. **Sistema di Filtri Multi-Criterio a Pills Espandibili (`[NOTE-005]`)**:
   - Implementati in `LogbookView.js` i 5 gruppi tematici (`glider`, `year`, `feature`, `duration`, `distance`) con estrazione dinamica delle vele volate e degli anni presenti nello storico (`extractFilterGroupOptions`) e drawer `.gm-filter-group-drawer` posizionati all'esterno del carosello orizzontale per prevenire il clipping CSS (`overflow-x: auto`).
