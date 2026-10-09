# Scheda di Pianificazione Architetturale: Mappa di Volabilità (Fase 5 - SpotMapView.js)

- **Data**: 2026-10-09
- **Autore**: Pair Programmer & Alessandro Amè
- **Fase**: Fase 5 (Pianificazione)
- **Stato**: Approvato a piano (`⚪ Pianificato`)

---

## 1. Contesto & Obiettivo
Valutare e pianificare l'integrazione di una mappa di volabilità per il volo libero in [SpotMapView.js](file:///c:/github/GlideMind/ui/views/SpotMapView.js), traendo ispirazione dal concetto di [Paraglidable.com](https://paraglidable.com/) ma adattandola all'architettura PWA client-side e ai vincoli aeronautici di GlideMind.

---

## 2. Decisioni Architetturali (ADR)

1. **Rifiuto del Modello Raster Server-Side di Paraglidable**:
   - Paraglidable impiega una pipeline backend (reti neurali + generatore C++ di tile PNG) per creare piramidi di piastrelle raster su una griglia geografica regolare.
   - Tale approccio è incompatibile con GlideMind (PWA client-side senza backend dedicato) e comporta un rischio aeronautico concreto per il volo libero: l'interpolazione continua orografica "sfuma" il colore verde tra versanti opposti separati da alte creste alpine, ignorando rotori sottovento e zone impraticabili.

2. **Adozione del Paradigma "Aureole di Bacino & Coni Vento Dinamici"**:
   - **Livello Macro (Zoom 6–9)**: Aureole semitrasparenti di bacino aerologico (raggio 8–12 km) attorno a ciascuno dei 134 comprensori censiti in [locations.json](file:///c:/github/GlideMind/data/locations.json). Codice colore reattivo (🟢 Verde = Aperto/Volabile, 🟡 Giallo = Cautela, 🔴 Rosso = Chiuso) calcolato deterministicamente con `evaluateComprensorio`.
   - **Livello Micro (Zoom >= 10)**: Espansione geometrica ad alta fedeltà con cono del decollo primario ($T_{\text{best}}$) orientato all'azimut reale, freccia del vento a quota decollo, e linea geodetica verso l'atterraggio sicuro ($L_{\text{safe}}$) con cono di planata $E_{\text{richiesta}} \le E_{\text{glider}}$ calibrato sull'ala attiva (EN-A/B/C/D).

3. **Timeline Oraria Integrata a Zero Costo di Rete**:
   - Slider/stepper orario compatto (09:00–18:00) sincronizzato con `store.activeDate` e `store.activeHourIndex`.
   - Open-Meteo fornisce 168 ore di previsione oraria per ogni richiesta; lo scrubbing orario ricalcola la volabilità di tutti i comprensori visibili interamente in memoria RAM tramite la CPU del browser in $< 50\text{ms}$ con **0 chiamate di rete aggiuntive**.

4. **Budget Ingestione Meteo a Finestra Geografica (Bounding Box Batch)**:
   - Query batch Open-Meteo circoscritte ai soli comprensori visibili nella finestra geografica della mappa (15–30 coordinate ponderate per sessione).
   - Impatto su quote API: $< 2\%$ del limite gratuito giornaliero di 10.000 chiamate/giorno per IP e azzeramento del rischio di errore `HTTP 429`.
   - Cache in-memory LRU con TTL di 30 minuti in [openMeteoApi.js](file:///c:/github/GlideMind/core/openMeteoApi.js).

5. **Interfaccia e Navigazione**:
   - Filtro rapido raggio pilota "Dove volare oggi" (50 km / 100 km / 150 km).
   - Bottom sheet non bloccante via [SheetManager.js](file:///c:/github/GlideMind/ui/sheetManager.js) per il tap sui comprensori, con CTA diretto a [ForecastView.js](file:///c:/github/GlideMind/ui/views/ForecastView.js).

---

## 3. Impatti sui File di Progetto
- [MASTER_PLAN.md](file:///c:/github/GlideMind/MASTER_PLAN.md): Fase 5 aggiornata con specifica dettagliata.
- [DESIDERATA.md](file:///c:/github/GlideMind/DESIDERATA.md): Voce di Fase 5 aggiornata.
- [SpotMapView.js](file:///c:/github/GlideMind/ui/views/SpotMapView.js): Componente da implementare nella Fase 5.
