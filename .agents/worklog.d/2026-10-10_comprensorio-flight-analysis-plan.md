# Worklog: Piano Architetturale Analisi Volo Comprensorio & Procedure (Audit & Consolidamento)

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, Previsioni, Procedure di Volo, Architettura Headless, HMI Outdoor, Governance & Audit

---

## Contesto e Requisiti

L'utente ha richiesto un audit completo e il consolidamento del piano architetturale per la vista Previsioni (`docs/COMPRENSORIO_FLIGHT_ANALYSIS_PLAN.md`), finalizzato a:
1. Riorientare il pulsante di ingrandimento della mini-mappa da redirect globale a modulo di ispezione analitica del comprensorio a schermo intero (`100dvh`).
2. Visualizzare la doppia manica a vento (decollo e atterraggio) sincronizzata con lo scrubber orario continuo.
3. Tracciare i circuiti di atterraggio (attacco a C e attacco a 8) orientati controvento con sottovento, base, finale e area di smaltimento quota.
4. Esibire le convenzioni locali, frequenze radio e allerte ostacoli del comprensorio attivo.

---

## Esito Audit e Correzioni Integrate (GAP-01 .. GAP-07)

A seguito dell'audit multidisciplinare (meccanica del volo, Novice Pilot Spec, headless core e Laws of UX), il piano è stato arricchito con 7 integrazioni vincolanti:
1. **GAP-01 (Geodesia WGS84)**: Aggiunta specifica per `calculateDestinationPoint(origin, distM, bearingDeg)` in `core/geoSpatialMath.js`.
2. **GAP-02 (Fallback Calma Anemometrica)**: Catena a 4 livelli in `core/flightProcedures.js`: `runwayHeading` $\to$ azimut convenzionale da `flightPlans` $\to$ bearing decollo-atterraggio $\to$ asse standard Sud ($180^\circ$).
3. **GAP-03 (Guardrail Vento Sostenuto EN-A)**: Allerta di sicurezza obbligatoria (`severe`/`unflyable`) con banner avionico per vento $> 18\text{ km/h}$ al suolo.
4. **GAP-04 (Preservazione FlightPlans)**: Aggiornamento della mappatura in `normalizeComprensorioCatalog()` (`core/comprensorio.js`) con sanificazione testi via `cleanUserText()`.
5. **GAP-05 (Finale Dinamico)**: Lunghezza finale $D_{\text{final}}$ correlata alla ground speed residua ($v_{\text{trim}} - v_{\text{wind}}$) con clamping $80 - 250\text{m}$.
6. **GAP-06 (Ergonomia Overlay 100dvh)**: `z-index: 1050`, blocco scroll del body, focus trap, tasto ESC e gestione `popstate` per back button mobile.
7. **GAP-07 (Contrasto Vettoriale & Sospensione Mini-Mappa)**: Polilinee a doppio tracciato (casing $6\text{px}$ + core $3\text{px}$) per contrasto WCAG AA su tutte le 4 basemap; sospensione cicli animati della mini-mappa sottostante durante l'overlay.

---

## Stato di Avanzamento e Registrazione

- Documento `docs/COMPRENSORIO_FLIGHT_ANALYSIS_PLAN.md` revisionato e aggiornato con tutte le specifiche corrette.
- Matrice `DESIDERATA.md` confermata con la voce **Fase 5-ter: Analisi Volo Comprensorio & Procedure (`ForecastView.js`)** marcata come `🔴 Prioritario`.
