# Worklog: Risoluzione Mini Mappa — Cono Esposizione Pendio, Centratura Manica a Vento e Pin Compatti

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, Mini Mappa Previsioni, UI/UX, Aerologia

---

## Contesto e Problemi Riscontrati

Dallo screenshot dell'utente (`media_1791629847690_ed6638dc.png`) e dal riscontro di utilizzo della Mini Mappa in `ForecastView.js` sono emerse tre criticità:
1. **Manica a Vento Invisibile o Spostata**: La manica a vento risultava dislocata o nascosta: la sua punta spuntava dietro il marker dell'atterraggio a sud-est, anziché essere posizionata sul decollo a nord-ovest.
2. **Assenza dell'Angolo di Esposizione del Decollo**: Il pilota necessita di visualizzare l'azimut del pendio di decollo (orientamento orografico verso valle) e il relativo cono di decollo ($\pm 35^\circ$) per valutare se il vento stimato o misurato sia frontale, traverso o sottovento.
3. **Marker Ingombranti e Nomi Ridondanti**: I marker contenevano il nome esteso della località (es. `⏚ Ufficiale Suello`) in capsule da 120px su un canvas alto appena 170px, oscurando la valle e l'orografia, nonostante il nome fosse già riportato nella testata della card sovrastante.

---

## Causa Radice

1. **Disallineamento Geometrico dell'Icona Leaflet**: Il wrapper SVG della manica a vento (240x240 px, scalato con `scale(0.38)` intorno al centro `120, 120`) era racchiuso in un `divIcon` con `iconSize: [92, 92]` e `iconAnchor: [46, 46]`. Il box interno da 240px partiva da `(0, 0)` del div Leaflet, ponendo il centro visivo a `(120, 120)` e generando un offset sistematico di `+74px` verso est e `+74px` verso sud rispetto alle coordinate del decollo.
2. **Mancanza del Settore di Esposizione**: Nessun layer grafico disegnava l'azimut o la finestra di lancio di $70^\circ$ orientata lungo `takeoff.heading`.
3. **Capsule Nomi Monolitiche**: Utilizzo acritico del nome completo dello spot nei marker cartografici.

---

## Interventi Implementati

### 1. Cono di Esposizione del Pendio (`generateTakeoffSectorSvg` in `ui/map/mapEngineAdapter.js`)
- Generato un componente vettoriale SVG ad alta precisione ancorato a `tCoord`:
  - **Settore di Lancio a 70°** ($\text{heading} \pm 35^\circ$) con arco circolare e campitura semitrasparente.
  - **Freccia di Asse Pendio** orientata verso valle lungo `takeoff.heading` con cuspide direzionale.
  - **Badge Angolare** recante l'azimut in gradi (es. `170°`).
  - **Aggiornamento Reattivo della Volabilità**: Se il vento è frontale ($\le 35^\circ$), il settore si colora di verde (`#22c55e`); se traverso ($36^\circ-75^\circ$), si colora di ambra (`#f59e0b`); se sottovento ($> 75^\circ$), si colora di rosso pericolo (`#ef4444`).

### 2. Centratura Geometrica a Zero Offset della Manica a Vento
- Corretta la configurazione del `divIcon` Leaflet: impostati `iconSize: [240, 240]` e `iconAnchor: [120, 120]`. In questo modo l'origine di scala `(120, 120)` coincide esattamente con le coordinate geografiche del decollo, azzerando l'offset di 74px.
- Portata la scala a `0.45` con filtro `drop-shadow` per massima visibilità all'aperto sia su temi scuri che chiari.

### 3. Pin Aeronautici Compatti (Zero Location Name Clutter)
- Rimossi i nomi ridondanti dai marker:
  - **Atterraggio**: Pin compatto da $54\times 22\text{ px}$ con glifo semantico e quota: `⏚ 260m` (`.gm-mini-pin-landing`), con bordo verde e tooltip accessibile.
  - **Decollo**: Integrato con il mozzo centrale del cono di esposizione `▲` e quota `1060m`.
- Liberato oltre il 60% dell'area cartografica per l'orografia e la linea di planata.

### 4. Layout Leaflet e Salvaguardia Viewport
- Impostato `fitBounds` con padding di sicurezza (35px) e `invalidateSize()` asincrono (`setTimeout(..., 50)`), garantendo che l'intero binomio di volo (decollo, manica, cono, traiettoria, atterraggio) sia sempre interamente visibile nel canvas.

---

## Verifiche e Test

- Aggiunta la suite di test dedicata: [`tests/ui/mapTakeoffSector.test.mjs`](file:///c:/github/GlideMind/tests/ui/mapTakeoffSector.test.mjs) (5 test superati).
- Eseguito `npm test`: **398/398 test superati** su 58 suite senza errori o regressioni.
