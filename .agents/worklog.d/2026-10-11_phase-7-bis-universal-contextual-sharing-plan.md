# Worklog: Piano Architetturale Fase 7-bis - Condivisione Universale Contestuale & Deep Linking

- **Data**: 2026-10-11
- **Autore**: Antigravity Assistant & Alessandro Amé
- **Ambito**: Architettura PWA / Deep Linking / Web Share API / Compressione Tracce Senza Server

---

## 1. Contesto & Requisiti
- **Richiesta Utente**:
  Definizione di un piano prioritario per un pulsante "Condividi" universale che si adatti a qualsiasi elemento dell'applicazione:
  1. *Home*: condivisione dell'applicazione.
  2. *Previsioni spot a un'ora*: condivisione di quel decollo/comprensorio a quell'ora e data esatta.
  3. *Volo (Dettaglio o Replay 3D)*: condivisione della traccia del volo apribile da chiunque in modalità sola lettura / visualizzazione.
- **Priorità**: Impostata come `🔴 Prioritario` in [DESIDERATA.md](file:///DESIDERATA.md) in attesa di implementazione del codice.

---

## 2. Decisioni Architetturali & Risoluzioni Tecniche

1. **Risoluzione Vincolo Offline-First / Zero Backend**:
   - I voli salvati o importati risiedono nell'IndexedDB locale del dispositivo del pilota.
   - Per consentire la condivisione istantanea via link (WhatsApp, Telegram) senza richiedere server esterni, il sistema utilizzerà uno snapshot compresso della traccia:
     - Decimazione LTTB a 150–200 punti chiave `[lat, lon, alt, time]`.
     - Compressione binaria in memoria via standard web `CompressionStream('deflate')` codificata in Base64URL.
     - Dimensione risultante < 1.5 KB, ampiamente sotto il limite di sicurezza di 1.800 caratteri per URL nei client di messaggistica.
   - Su mobile viene inoltre offerta la condivisione nativa del file `.igc` autentico tramite Web Share API (`navigator.share({ files: [...] })`).

2. **Modulo Headless Core `urlState.js`**:
   - Gestione bidirezionale dei query params nell'hash dell'URL (es. `#forecast?spot=chialamberto...&hour=14`).
   - Serializzazione deterministica, compressione e decompressione del tracciato, validazione dimensioni payload.

3. **Modulo Headless Core `shareEngine.js`**:
   - Risoluzione del payload contestuale (titolo, testo riassuntivo con volabilità o metriche di volo, deep link URL) in base alla rotta e allo stato di `core/store.js`.

4. **Visualizzazione Ospite (Guest Mode)**:
   - In `FlightReplayView.js` e `FlightDetailSheet.js`, i voli aperti da link esterno mostrano un banner esplicito *"Volo Condiviso (Sola Lettura)"*, disabilitano le modifiche alle note pilota e forniscono il pulsante *"Salva nel mio libretto"*.

---

## 3. Artefatti Prodotti
- Piano Architetturale: [docs/plans/phase-7-bis-universal-contextual-sharing.md](file:///docs/plans/phase-7-bis-universal-contextual-sharing.md).
- Matrice di Stato: [DESIDERATA.md](file:///DESIDERATA.md) aggiornata con Fase 7-bis impostata su `🔴 Prioritario`.

---

## 4. Prossimi Passi
- **Step 1**: Implementazione di `core/urlState.js` e aggiornamento di `ui/router.js` per il parsing query string.
- **Step 2**: Implementazione di `core/shareEngine.js` e compressione LTTB snapshot.
- **Step 3**: Creazione componente `ui/components/ShareButton.js` e micro-toast feedback.
- **Step 4**: Idratazione parametri in `ForecastView.js` e `SpotMapView.js`.
- **Step 5**: Modalità ospite in `FlightReplayView.js` e suite di test d'integrazione.
