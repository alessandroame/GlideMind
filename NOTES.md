# Annotazioni & Pensieri in Corso d'Opera (NOTES)

Buffer di cattura rapida a zero cambio di contesto (`/take-note`). Le osservazioni qui raccolte non sono ancora state analizzate sul codice: utilizza `/review-notes` a lavorazione conclusa per mostrarle, eseguire il task di analisi approfondita e promuoverle in `DESIDERATA.md`.
> **Governance anti-bloat**: tetto massimo **120 righe**. La sezione *Analizzate & Consolidate* mantiene al massimo le **ultime 10 note chiuse** in formato tabellare a 1 riga (storico in `.agents/archive/NOTES_archive.md`).
> **Ultimo ID Assegnato**: NOTE-006

---

## 📥 Da Analizzare (Open)

*(Nessuna nota in attesa di analisi)*

---

## ✅ Analizzate & Consolidate (Ultime 10 Risolte)

| ID | Titolo Sintetico | Data | Esito & Destinazione ($\le 120\text{ char}$) |
| :--- | :--- | :---: | :--- |
| `NOTE-006` | Integrazione dati in diretta da centraline meteo fisiche | 2026-10-16 | Promossa in [`DESIDERATA.md`](file:///c:/github/GlideMind/DESIDERATA.md) (`Fase 4-quater`, [spec](file:///c:/github/GlideMind/docs/plans/phase-4-quater-live-weather-stations.md)) |
| `NOTE-005` | Filtri Log di Volo a pills espandibili per argomento | 2026-10-16 | Implementata in [`LogbookView.js`](file:///c:/github/GlideMind/ui/views/LogbookView.js) (`Vela`, `Anno`, `Caratteristiche`, `Tempo`, `Distanza`) |
| `NOTE-004` | Rimozione classe EN come indicatore di performance | 2026-10-16 | Implementata in `HomeDashboardView`, `LogbookView`, `FlightDetailSheet`, `SettingsView`, `ForecastView` |
| `NOTE-003` | Rimozione pill Live fuorviante in stato nominale | 2026-10-16 | Nascosto badge `Live` nominale in `HomeDashboardView` e `ForecastView` (slot `ORA` su scrubbar) |
| `NOTE-002` | Switcher rapido decollo/atterraggio e combo sub-spot | 2026-10-15 | Implementata in [`ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js) (`renderQuickSubSpotSwitcher`, `<select>` inline) |
| `NOTE-001` | Pills espandibili dei fattori determinanti volabilità | 2026-10-15 | Implementata in [`HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js) (`buildDeterminantReasonPills`, 1-tap drawer) |
