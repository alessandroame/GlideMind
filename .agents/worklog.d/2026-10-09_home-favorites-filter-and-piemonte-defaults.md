# Intervento: Filtraggio Località Home per Preferiti e Default Piemonte

- **Data**: 2026-10-09
- **Ambito**: `ui/views/HomeDashboardView.js`, `core/store.js`, `core/comprensorio.js`, `ui/views/ForecastView.js`
- **Oggetto**: Allineamento della schermata Home per visualizzare esclusivamente i comprensori contrassegnati come preferiti (icona stella nella pagina Previsioni), impostando come preferiti predefiniti Chialamberto, Martiniana Po e Monte Cavallaria.

---

## 1. Contesto & Rationale Architetturale
In precedenza, la vista Home Dashboard caricava l'intero catalogo dei comprensori (135 siti), generando rumore informativo e sovraccarico cognitivo per il pilota.
Su richiesta esplicita dell'utente:
- La vista Home Dashboard mostra **unicamente** le località selezionate come preferite nella pagina Previsioni.
- I 3 comprensori preferiti predefiniti sono: **Chialamberto**, **Martiniana Po** e **Monte Cavallaria**.
- La ricerca istantanea in Home consente comunque di filtrare o cercare nel catalogo se necessario.
- In assenza di preferiti, Home mostra uno stato vuoto esplicito con CTA verso la pagina Previsioni.

---

## 2. Modifiche Implementate

1. **`core/store.js`**:
   - Aggiornato `DEFAULT_INITIAL_STATE.pinnedSpotIds` con i 3 ID canonici:
     `'chialamberto-valli-di-lanzo-to-to'`, `'martiniana-po-valle-po-cn-cn'`, `'monte-cavallaria-calea-to-to'`.
   - Introdotta migrazione trasparente in `loadPersistedState()` per convertire i seed legacy eventualmente memorizzati in `localStorage`.

2. **`core/comprensorio.js`**:
   - Integrati Chialamberto, Martiniana Po e Monte Cavallaria in `DEFAULT_COMPRENSORI` per supporto offline e headless test immediato.
   - Esportata la funzione condivisa `isSpotPinned(spot, pinnedIds)` con supporto a matching per ID e alias.

3. **`ui/views/HomeDashboardView.js`**:
   - `getEvaluatedComprensori()` filtra il catalogo mostrando solo i comprensori in `state.pinnedSpotIds` quando non c'è ricerca attiva.
   - `fetchBatchWeatherAsync()` prioritizza il recupero meteo per i soli comprensori preferiti.
   - `renderComprensoriList()` fornisce feedback chiaro e CTA a Previsioni quando nessun sito è tra i preferiti.
   - Aggiunta reattività alle mutazioni di `pinnedSpotIds` tramite sottoscrizione allo store.

4. **`ui/views/ForecastView.js`**:
   - Utilizzo della funzione centralizzata `isSpotPinned`.
   - Rimozione pulita degli alias in fase di unpin.

5. **Test Suite (`tests/ui/homeDashboardView.test.mjs`, `tests/ui/locationsCatalogHydration.test.mjs`)**:
   - Validata la presenza dei 3 preferiti di default e la reattività al cambio preferiti.
   - 299 test eseguiti con successo (100% pass).
