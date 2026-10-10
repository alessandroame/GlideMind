# Worklog: Piano Architetturale Analisi Volo Comprensorio & Procedure

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, Previsioni, Procedure di Volo, Architettura Headless, HMI Outdoor

---

## Contesto e Requisiti

L'utente ha ridefinito lo scopo dell'ingrandimento della mappa nella vista Previsioni (`ForecastView.js`):
1. **Rifiuto della Visione Globale**: L'azione di ingrandimento non deve fungere da scorciatoia per la mappa regionale complessiva (`SpotMapView.js`), ma rimanere focalizzata sull'ispezione analitica del comprensorio selezionato.
2. **Doppia Manica a Vento Vettoriale**: Visualizzazione contestuale del vento sia al decollo (alla quota di lancio) sia all'atterraggio (al suolo a fondo valle), sincronizzate con lo scrubber orario.
3. **Procedure di Volo & Circuiti di Atterraggio**: Generazione geometrica dei circuiti standard di atterraggio (attacco a C e attacco a 8) orientati rigorosamente controvento in funzione dell'ora, con indicazione di sottovento, base, finale e area di smaltimento quota.
4. **Convenzioni Locali & Ostacoli**: Visualizzazione integrata dei dati del catalogo (regole del campo, sentieri di planata, cavi/linee elettriche, frequenze radio di club).

---

## Decisioni Architetturali (ADR)

1. **Separazione Headless Core (`core/flightProcedures.js`)**:
   - Tutta la trigonometria e la geometria dei circuiti (orientamento asse finale, calcolo coordinate dei bracci di sottovento e base, quota ingresso circuito) risiede in un modulo headless puro a zero dipendenze DOM.
   - Algoritmo resiliente a calma anemometrica ($v < 4\text{ km/h}$) con fallback sull'orientamento convenzionale della pista.
2. **Adapter Cartografico Integrato (`ui/map/mapEngineAdapter.js`)**:
   - Estensione di `LeafletMapEngine` per la gestione simultanea di due marker manica a vento animati.
   - Polilinee vettoriali orientate per il circuito di atterraggio aggiornabili in-place $(< 50\text{ms})$ durante lo scrubbing orario senza distruggere la mappa.
3. **UI Overlay Dedicato 100dvh (`ForecastView.js`)**:
   - Apertura di un visualizzatore di analisi volo a schermo intero mantenendo il contesto della sessione di previsione (data attiva, ora, modello meteo) e abilitando l'interazione pan & zoom.

---

## Stato di Avanzamento e Registrazione

- Documento di piano architetturale formalizzato e salvato in `docs/COMPRENSORIO_FLIGHT_ANALYSIS_PLAN.md`.
- Matrice `DESIDERATA.md` aggiornata con l'inserimento della voce **Fase 5-ter: Analisi Volo Comprensorio & Procedure (`ForecastView.js`)** marcata come `🔴 Prioritario`.
