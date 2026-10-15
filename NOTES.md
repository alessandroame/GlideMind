# Annotazioni & Pensieri in Corso d'Opera (NOTES)

Buffer di cattura rapida a zero cambio di contesto (`/take-note`). Le osservazioni qui raccolte non sono ancora state analizzate sul codice: utilizza `/review-notes` a lavorazione conclusa per mostrarle, eseguire il task di analisi approfondita e promuoverle in `DESIDERATA.md`.

---

## 📥 Da Analizzare (Open)

### [NOTE-003] Revisione semantica pill "Live" solo sullo spot e pagina esplicita dati in tempo reale
- **Stato**: `📥 Da Analizzare`
- **Data Cattura**: 2026-10-15 19:44
- **Lavorazione Attiva al Momento della Nota**: Nessun task `🟡 In Lavorazione` in `DESIDERATA.md`
- **Ambito Presunto**: `HomeDashboardView` / `ForecastView` / Nuova Vista Real-Time
- **Testo Originale**:
  > L'indicazione live (la pill verde) mi turba perchè per me ha senso solo sullo spot e poi vorrei che ci fosse una pagina eplicita con i dati in tempo reale

### [NOTE-004] Rimozione o revisione della classe di omologazione vela usata come indicatore di performance
- **Stato**: `📥 Da Analizzare`
- **Data Cattura**: 2026-10-15 21:18
- **Lavorazione Attiva al Momento della Nota**: Nessun task `🟡 In Lavorazione` in `DESIDERATA.md`
- **Ambito Presunto**: Selettore Vela / Catalogo Vele / Logbook & Previsioni
- **Testo Originale**:
  > la classe della vela non è un'indicazione delle sue performance. Mi turba vederla come se invece lo fosse.. la toglierei se non necessaria

### [NOTE-005] Filtri Log di Volo a pills espandibili per argomento e metriche (vela, anno, traccia/termica, distanza, durata)
- **Stato**: `📥 Da Analizzare`
- **Data Cattura**: 2026-10-15 21:31
- **Lavorazione Attiva al Momento della Nota**: Nessun task `🟡 In Lavorazione` in `DESIDERATA.md`
- **Ambito Presunto**: `LogbookView` (Barra filtri sfaccettati del Flight Log)
- **Testo Originale**:
  > nei filtri del log di volo vorrei dei pills per argomento espandibili stile menu es. Gruppo Vela con le vele con cui ho volato gruppo data per anno per altre caratteristiche con traccia, con volo in termica. oppure ancora vorrei per distanza percorsa o tempo percorso poter fare filtri

---

## ✅ Analizzate & Consolidate (Resolved)

### [NOTE-001] Espansione volabilità comprensorio con pills dei fattori determinanti
- **Stato**: `✅ Consolidata & Implementata`
- **Data Cattura**: 2026-10-15 19:44
- **Risoluzione**: Implementato in [`HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js) (`buildDeterminantReasonPills`, `data-action="toggle-spot-reasons"`, `.gm-spot-reasons-drawer` e `.gm-reason-pill`): rimossa la micro-causa troncata dall'header e introdotta l'espansione a 1-tap sul badge di stato che rivela i pills espressivi dei fattori determinanti (finestra volabile, pioggia, vento/raffiche, direzione/esposizione, turbolenza/CAPE, cono di rientro, margine pilota).

### [NOTE-002] Selezione rapida decollo/atterraggio e combo per spot multipli in Previsioni
- **Stato**: `✅ Consolidata & Implementata`
- **Data Cattura**: 2026-10-15 19:44
- **Risoluzione**: Implementato in [`ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js) (`renderQuickSubSpotSwitcher`, `renderInlineSubSpotControl`, `handleChange` con `change-active-takeoff` / `change-active-landing`) e [`css/theme.css`](file:///c:/github/GlideMind/css/theme.css) (`.gm-quick-subspot-switcher`, `.gm-quick-subspot-pill`, `.gm-inline-subspot-select`): introdotto il selettore rapido a 1-tap (`Panoramica | Decollo | Atterraggio`) nella card di sintesi/dettaglio spot e la combo inline `<select>` condizionale al posto del nome statico quando il comprensorio dispone di più decolli (`takeoffs.length > 1`) o più atterraggi (`landings.length > 1`), preservando il binomio selezionato nel passaggio tra viste.

