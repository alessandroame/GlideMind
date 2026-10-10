# Scheda Intervento: Redazione Piano Mini Mappa e Manica a Vento Vettoriale

- **Data**: 2026-10-10
- **Modulo**: Documentazione & Pianificazione Architetturale (`docs/`, `DESIDERATA.md`)
- **Stato**: 🟢 Completato

---

## 1. Contesto & Obiettivo
Su richiesta dell'utente, è stato recuperato il design del visore orografico contestuale e della manica a vento animata a 12 segmenti sviluppata nel prototipo legacy `ParaMeteo` (`C:\github\ParaMeteo\js\windsock.js` e `timelineUi.js`), per integrarla nella pagina delle previsioni (`ForecastView.js`) di GlideMind. L'obiettivo era redigere un piano architetturale dettagliato e salvarlo come task prioritario per la sessione successiva.

---

## 2. Decisioni Architetturali Registrate
1. **Disaccoppiamento del Calcolo Fisico**:
   - Creazione del modulo headless `core/windsock.js` privo di dipendenze DOM (`window`, `document`), contenente la cinematica dei 12 segmenti, il calcolo della frequenza di oscillazione guidata da turbolenza ed EDR, e la generazione di markup SVG puro.
2. **Estensione Cartografica**:
   - Estensione di `ui/map/mapEngineAdapter.js` per supportare istanze mini-mappa con disattivazione del drag touch (`dragging: false`), prevenendo blocchi nello scorrimento verticale mobile, e supporto per marker `L.divIcon` con manica a vento reattiva.
3. **Sincronizzazione Reattiva**:
   - Aggiornamento della manica a vento collegato direttamente al metodo `setHour(hour)` di `ForecastView.js` tramite mutazioni CSS `transform` senza ricaricamento dei tile Leaflet né ricreazione del DOM.
4. **Ciclo di Vita & Salvaguardia Memoria**:
   - Chiamata esplicita a `miniMapEngine.destroy()` nell'`unmount()` di `ForecastView`.

---

## 3. Artefatti Prodotti
- [docs/FORECAST_MINIMAP_AND_WINDSOCK_PLAN.md](file:///docs/FORECAST_MINIMAP_AND_WINDSOCK_PLAN.md): documento di piano con diagramma di flusso, specifiche di layout, casi limite e checklist di implementazione in 6 step.
- [DESIDERATA.md](file:///DESIDERATA.md): inserimento della funzionalità alla Fase 5-bis contrassegnata come `🔴 Prioritario (Prossima Sessione)`.
