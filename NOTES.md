# Annotazioni & Pensieri in Corso d'Opera (NOTES)

Buffer di cattura rapida a zero cambio di contesto (`/take-note`). Le osservazioni qui raccolte non sono ancora state analizzate sul codice: utilizza `/review-notes` a lavorazione conclusa per mostrarle, eseguire il task di analisi approfondita e promuoverle in `DESIDERATA.md`.
> **Governance anti-bloat**: tetto massimo **120 righe**. La sezione *Analizzate & Consolidate* mantiene al massimo le **ultime 10 note chiuse** in formato tabellare a 1 riga (storico in `.agents/archive/NOTES_archive.md`).
> **Ultimo ID Assegnato**: NOTE-005

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

## ✅ Analizzate & Consolidate (Ultime 10 Risolte)

| ID | Titolo Sintetico | Data | Esito & Destinazione ($\le 120\text{ char}$) |
| :--- | :--- | :---: | :--- |
| `NOTE-002` | Switcher rapido decollo/atterraggio e combo sub-spot | 2026-10-15 | Implementata in [`ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js) (`renderQuickSubSpotSwitcher`, `<select>` inline) |
| `NOTE-001` | Pills espandibili dei fattori determinanti volabilità | 2026-10-15 | Implementata in [`HomeDashboardView.js`](file:///c:/github/GlideMind/ui/views/HomeDashboardView.js) (`buildDeterminantReasonPills`, 1-tap drawer) |
