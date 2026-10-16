# 2026-10-16 — Consolidamento Note Utente (`NOTE-003..005`) e Scrubbar Orizzontale ad Altezza Uniforme

- **Data**: 2026-10-16
- **Tipo**: Refactoring UX / Semantica Dominio / Filtri Log di Volo / Data-Ink Ratio
- **Moduli Coinvolti**:
  - `ui/views/HomeDashboardView.js`
  - `ui/views/ForecastView.js`
  - `ui/views/SpotMapView.js`
  - `ui/views/LogbookView.js`
  - `ui/views/FlightDetailSheet.js`
  - `ui/views/SettingsView.js`
  - `core/flightWindows.js`
  - `css/theme.css`
  - `tests/ui/liveWeatherDataIngestion.test.mjs`
  - `tests/ui/homeDashboardView.test.mjs`
  - `tests/ui/logbookView.test.mjs`
  - `tests/ui/flightDetailSheet.test.mjs`
  - `tests/flightDetailView.test.js`

---

## 1. Contesto e Motivazione
Durante la sessione `/review-notes` e il successivo audit `/how-its-made` della scrubbar oraria, sono stati risolti quattro punti architetturali e di ergonomia cognitiva:
1. **`[NOTE-003]` — Soppressione della pill verde `Live` nominale e distinzione tra Modello NWP e Centraline Fisiche (`[NOTE-006]`)**:
   - L'indicatore verde `● Live` induceva l'utente a credere di leggere dati in diretta da una centralina anemometrica fisica sul prato anziché il modello numerico orario Open-Meteo (già ispezionabile sullo slot `ORA` della scrubbar). I sensori fisici in diretta sono stati promossi a feature dedicata in `DESIDERATA.md` (`Fase 4-quater`, `NOTE-006`).
2. **`[NOTE-004]` — Rimozione della classe di omologazione (`EN-A..D`) usata come indicatore di performance**:
   - La certificazione EN misura la sicurezza passiva ai test di chiusura e non le prestazioni aerodinamiche. Esporla nella pillola vela, nei filtri, nel dettaglio volo o nei debriefing generava un falso parallelismo.
3. **`[NOTE-005]` — Filtri del Log di Volo a Pills Espandibili per Argomento**:
   - I chip statici del Log di Volo sono stati sostituiti con 5 pills per argomento espandibili a menu (`Vela ▾`, `Anno ▾`, `Caratteristiche ▾`, `Tempo ▾`, `Distanza ▾`).
4. **Scrubbar Oraria ad Altezza Uniforme (Tufte Data-Ink Ratio & Rasoio di Occam)**:
   - L'altezza variabile (`fillPct`) delle barre verticali nella scrubbar di `ForecastView.js` e `SpotMapView.js` era priva di asse Y, duplicava informazioni già esplicite e invertiva il modello mentale meteorologico (`100%` = vento calmo, `35%` = vento forte).

---

## 2. Decisioni Architetturali e Implementative
1. **Silenziamento Badge `Live` Nominale e Ripristino Switcher a 3 Colonne (`[NOTE-003]`)**:
   - Sia in `HomeDashboardView.js` (`#gm-home-live-badge`) sia in `ForecastView.js` (`#gm-forecast-live-badge`), `renderLiveWeatherBadge()` mantiene nascosto (`hidden`) il badge quando `networkStatus === 'live'`, esponendolo solo per stati diagnostici (`loading`, `rate_limit`, `offline`).
   - Mantenuto `.gm-quick-subspot-switcher` come griglia pulita a 3 colonne (`Panoramica | Decollo | Atterraggio`).
2. **Neutralizzazione Badge Classe EN e Focus su Parametri Fisici (`[NOTE-004]`)**:
   - Rimossi i badge `.gm-glider-pill-badge` e i riferimenti `EN-A..D` da `HomeDashboardView.js`, `ForecastView.js`, `LogbookView.js`, `FlightDetailSheet.js`, `SettingsView.js` e `core/flightWindows.js`, esponendo sempre $V_{\text{trim}}$, $V_{\text{max}}$ ed efficienza $L/D$.
3. **Sistema di Filtri Multi-Criterio a Pills Espandibili (`[NOTE-005]`)**:
   - Implementati in `LogbookView.js` i 5 gruppi tematici (`glider`, `year`, `feature`, `duration`, `distance`) con drawer `.gm-filter-group-drawer` esterni al carosello `overflow-x: auto`.
4. **Tacche Orizzontali ad Altezza Uniforme nella Scrubbar (`ForecastView.js`, `SpotMapView.js`, `css/theme.css`)**:
   - Rimossi i calcoli euristici di `fillPct` parziale in `evaluateTimelineSlot`, `renderTimelineGrid` e `updateScrubberBars`.
   - Convertito `.compact-bar` in `css/theme.css` da istogramma verticale (`14x30px`) a pillola orizzontale uniforme (`16x8px`, `border-radius: var(--gm-radius-full)`) con opacità attenuata (`0.35`) per `.compact-bar-unflyable`.

