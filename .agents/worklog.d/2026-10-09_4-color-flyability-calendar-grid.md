# Worklog: Classificazione Semantica della Volabilità a 4 Colori nel Calendario 14 Giorni

**Data**: 2026-10-09  
**Autore**: GlideMind Core & UI Architecture  
**Ambito**: `core/flyability.js`, `core/datePresets.js`, `core/openMeteoApi.js`, `ui/views/ForecastView.js`, `ui/views/HomeDashboardView.js`, `css/theme.css`

---

## 1. Contesto & Requisito Utente
L'utente ha richiesto di indicare visivamente lo stato di volabilità previsto per ciascuno dei 14 giorni nel calendario del selettore date adottando lo standard aeronautico a 4 colori:
- 🟢 **Verde (Volabile)**: Condizioni ottimali in asse con il decollo e finestra utile aperta.
- 🟡 **Giallo (Cautela)**: Condizioni marginali, turbolenza viva o moderato rischio convettivo.
- 🔴 **Rosso (Chiuso)**: Non volabile (vento fuori limiti, pioggia o traverso costante).
- ⚫ **Nero (Severo / Pericolo)**: Fenomeni violenti, raffiche estreme $> 35\text{ km/h}$, CAPE $> 1500\text{ J/kg}$, temporali.

---

## 2. Modifiche Architetturali & Tecniche

### 2.1 Motore di Volabilità Multi-Giorno (`core/flyability.js` & `core/openMeteoApi.js`)
- Esteso `calculateDailyFlyabilitySummary` per supportare fino a 14/16 giorni (rimosso limite fisso a 7).
- Inclusione deterministica nel payload di ogni giorno di:
  - `severity`: 0, 1, 2, 3
  - `status`: `'flyable'` | `'caution'` | `'unflyable'` | `'severe'`
  - `statusLabel`: `'Volabile'` | `'Cautela'` | `'Chiuso'` | `'Severo'`
  - `statusIcon`: `'●'` | `'▲'` | `'✕'` | `'⚡'`
  - `color`, `bg`, `badgeClass`
- Estesa `generateSyntheticWeather` fino a 16 giorni con progressione sinottica realistica (giornate termiche, passaggi frontali, temporali, rimonte anticicloniche) mantenendo invariato il giorno 0 per compatibilità di regressione.

### 2.2 Presets & Calendario Data (`core/datePresets.js`)
- Aggiunta funzione `normalizeDateFlyability(fly)` con fallback sicuro (`unknown` / `N/D`).
- Aggiunta funzione `attachFlyabilityToCalendarDates(calendarDates, flyabilityMap)`.
- Aggiornato `getAvailableCalendarDates(refDate, maxDays, flyabilityMap)` per restituire tessere già arricchite di metadati aeronautici.
- Aggiornato `getSmartDatePresets(refDate, activeDateIso, flyabilityMap)` con associazione della volabilità ai singoli tab.

### 2.3 Design System & Ergonomia Outdoor (`css/theme.css`)
- Aggiunti token semantici per lo stato severo (`--gm-status-severe`, `--gm-status-severe-bg`, `--gm-status-severe-border`, `--gm-status-severe-text`).
- Definite classi `.gm-badge-severe`, `.gm-badge-nd`.
- Tessere calendario `.gm-date-grid-item`:
  - Bordo inferiore semantico da 3px (`fly-flyable`, `fly-caution`, `fly-unflyable`, `fly-severe`).
  - Badge `.grid-fly-status` ad alto contrasto con icona funzionale + testo esteso (multimodalità Colore + Icona + Testo per `RULE[outdoor-hmi-touch]`).
  - Indicatore dot `.gm-tab-fly-dot` nei quick tabs dell'header bar.

### 2.4 Viste Utente (`ForecastView.js` & `HomeDashboardView.js`)
- Implementato metodo `getMultiDayFlyability(spot, days = 14)`.
- `openDatePickerSheet()`: arricchito con la griglia a 14 tessere con badge a 4 colori, classi di stato e legenda semantica esplicita alla base del bottom sheet.

---

## 3. Risultati dei Test & Verifica
- Esecuzione completa `npm test`: **241 test passati su 29 suite di test, 0 fallimenti**.
- Aggiunti test di regressione unitari e di integrazione per:
  - `calculateDailyFlyabilitySummary` su 14 giorni con verifica di tutti e 4 gli stati.
  - Normalizzazione e arricchimento calendario in `tests/core/datePresets.test.mjs`.
  - Apertura e rendering bottom sheet calendario con legenda in `tests/ui/forecastView.test.mjs` e `tests/ui/homeDashboardView.test.mjs`.
