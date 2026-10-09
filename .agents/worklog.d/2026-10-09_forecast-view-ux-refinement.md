# Worklog: ForecastView Mobile Ergonomics, Zero-Gap Scrubber & UX Laws Refinement

**Data**: 2026-10-09  
**Autore**: Antigravity Assistant & Senior Architect  
**Ambito**: UI / UX Layout / ForecastView / DatePresets / Ergonomia Outdoor

---

## 1. Contesto & Obiettivi
Affinamento chirurgico della vista previsioni meteo (`ForecastView.js`) e del design system (`css/theme.css`) a seguito dell'istituzione del **Gate di Validazione UX Laws Preventivo**:
1. Bonifica della prima riga dell'header: rimozione del pulsante Home duplicato e risoluzione del contrasto bianco-su-bianco mediante la classe semantica `.gm-comprensorio-bar`.
2. Risoluzione del bug di layout dello scrubber sticky: eliminazione del buco di 16px tra fondo scrubber e barra di navigazione tramite ancoraggio continuo `position: fixed; bottom: calc(var(--gm-nav-height-mobile) + env(safe-area-inset-bottom))`.
3. Rifinitura del drawer `Comprensorio Picker Sheet`: rimozione dell'autofocus della tastiera virtuale (accesso ai preferiti con 1 tap) e deduplicazione delle liste (gli spot in ⭐ Preferiti non vengono replicati in 🗺️ Altri Comprensori).
4. Risoluzione della velocità del vento fissa a 12 km/h: normalizzazione delle proprietà Open-Meteo (`windspeed_10m ?? wind_speed_10m`) in `core/comprensorio.js`.

---

## 2. Decisioni Architetturali (ADR)
- **ADR-01: Ancoraggio Fisso dello Scrubber sul Mobile Shell**:
  Lo scrubber orario sticky non deve arrestarsi sul padding del container scorrevole, ma saldarsi con continuità geometrica (gap 0.00px) sulla sommità della bottom navigation bar.
- **ADR-02: Zero Tastiera Virtuale Invasiva**:
  Nei drawer di selezione rapida, la tastiera software non deve aprirsi automaticamente; l'utente deve poter toccare il preferito con 1 tap senza ostacoli visivi.
- **ADR-03: Deduplicazione Semantica dei Cataloghi**:
  Se un'entità è già presente nella sezione dei preferiti, viene filtrata ed esclusa dalla sezione generale sottostante per evitare rumore cognitivo (Legge di Prägnanz).

---

## 3. Impatto sui File e Verifica
- `core/comprensorio.js`: supporto di entrambe le convenzioni di denominazione Open-Meteo per velocità, raffiche e direzione del vento.
- `core/datePresets.js` e `tests/core/datePresets.test.mjs`: inclusione del modulo di gestione date con preset intelligenti (12 test).
- `css/theme.css`: classi `.gm-comprensorio-bar`, posizionamento fixed `.gm-timeline-scrubber-sticky`, clearance `pb-48`, separazione visiva per il tasto stella.
- `ui/views/ForecastView.js`: rimozione del tasto home nell'header, rimozione autofocus su search, deduplicazione dei comprensori nel picker sheet.
- `tests/ui/forecastView.test.mjs`: allineamento dei test al nuovo scrubber sticky, alla tendina sub-spot e al toggle delle viste con marker orario.
- `DESIDERATA.md`: Fase 4 marcata come completata.

**Esito Test**: 221 test su 221 passati con successo (0 fallimenti).
