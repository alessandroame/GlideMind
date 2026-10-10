# Scheda Intervento: Consolidamento Piano Fase 6 & Audit Tracciamento IGC Duale

- **Data**: 2026-10-10
- **Fase**: Fase 6 (Logbook di Volo)
- **Tipo**: Architettura / Audit / ADR / Planning
- **Moduli Coinvolti**: `docs/plans/phase-6-flight-logbook-and-telemetry.md`, `MEMORY.md`, `WORKLOG.md`

---

## 1. Contesto & Diagnosi

A seguito dell'invocazione di `/next-step` per la presa in carico della Fase 6 (Modulo Logbook di Volo & Gestione Tracciati IGC), è stato condotto un audit ingegneristico approfondito sui contratti dati, algoritmi di decimazione e pipeline di persistenza.

L'audit ha evidenziato:
1. **Falso amico algoritmico su LTTB**: Eseguire la decimazione LTTB prima di `detectThermals` e `detectFlightManeuvers` altera i delta angolari orizzontali a quota costante (i punti a quota costante hanno area altimetrica nulla e vengono rimossi da LTTB), distruggendo la rilevazione di 360°, virate e termiche.
2. **Requisito di doppia conservazione del tracciato**:
   - Conservazione del file **IGC originale** (`rawIgc`) per tutelare la validità FAI, la firma digitale anticontraffazione (G-record) e la portabilità nei download.
   - Conservazione del tracciato **pre-decimato LTTB** (`decimatedPoints`, 1.500 campioni) per consentire l'avvio istantaneo (<10ms) del Replay 3D (Fase 7) a 60 FPS senza ricalcolo on-the-fly su dispositivi mobili.
3. **Resilienza Fingerprint su LAN / HTTP**: L'uso di `crypto.subtle` fallisce su contesti non sicuri (es. test LAN mobile su IP locale). Adottato algoritmo deterministico puro e sincrono (FNV-1a a 64-bit).
4. **Prevenzione Quota Exceeded su `localStorage` & Split-Brain**: IndexedDB è l'unica sorgente di verità persistente. `store.flights` opera come cache reattiva in RAM sincronizzata con il database.
5. **Bug contratti pre-esistente in `HomeDashboardView.js`**: `handleFileInput` utilizzava proprietà inesistenti (`parsed.metadata.date`, `parsed.statistics.durationMinutes`, `parsed.points`), provocando il fallback a dati fittizi.

---

## 2. Decisioni Architetturali (ADR)

1. **Separazione Funzionale LTTB**:
   - Il calcolo cinematico, termico e acrobatico (`analyzeFlightTelemetry`) viene eseguito sulla sequenza 1Hz dopo il trimming dei punti a terra.
   - LTTB viene applicato a valle per generare:
     - `sparklineSvgPoints` (60-80 punti) in `flights_meta`.
     - `decimatedPoints` (1.500 punti) in `flights_raw`.
2. **Schema a Due Livelli Arricchito**:
   - `flights_meta`: memorizza metadati, quote MSL, variometri, statistiche e sparkline SVG (~1.5 KB per record). Caricato in RAM all'avvio per lista e KPI istantanei.
   - `flights_raw`: memorizza `rawIgc` (testo originale FAI con G-record) e `decimatedPoints` (1.500 punti per Replay 3D). Caricato on-demand solo per Replay 3D o download del file IGC.
3. **Ponte con Fase 6-bis (Backup & Sync)**:
   - Singolo download: estrae `rawIgc` con MIME `application/x-igc`.
   - Full Backup JSON: include `flights_meta` + `flights_raw` con risoluzione Last-Write-Wins tramite `updatedAt`.
   - In caso di ripristino di backup privi di `decimatedPoints`, la pipeline rigenera i 1.500 punti LTTB da `rawIgc` in background.

---

## 3. Impatto e Prossimi Passi

- Aggiornato il piano formale in [docs/plans/phase-6-flight-logbook-and-telemetry.md](file:///docs/plans/phase-6-flight-logbook-and-telemetry.md).
- Registrata la Lezione Appresa #93 in `MEMORY.md`.
- Sbloccata l'implementazione esecutiva di `core/logbookDb.js` e dei relativi test.
