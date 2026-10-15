# 2026-10-16 — Selezione Rapida Previsioni Decollo/Atterraggio e Combo Inline per Spot Multipli ([NOTE-002])

## Contesto e Obiettivo
L'utente ha segnalato in `[NOTE-002]` (`NOTES.md`) l'esigenza, nella pagina delle Previsioni (`ForecastView.js`), di:
1. Commutare rapidamente con un solo tocco tra la vista `Panoramica` del comprensorio e le previsioni specifiche del `Decollo` o dell'`Atterraggio` mostrati, senza dover aprire il bottom sheet modale `Seleziona Comprensorio`.
2. Poter cambiare rapidamente decollo o atterraggio tramite una combo inline al posto del nome dello spot quando il comprensorio dispone di più di un decollo (`spot.takeoffs.length > 1`) o più di un atterraggio (`spot.landings.length > 1`).

## Interventi Tecnici Eseguiti
1. **Selettore Rapido 1-Tap (`renderQuickSubSpotSwitcher` in `ui/views/ForecastView.js`)**:
   - Introdotta la barra `.gm-quick-subspot-switcher` (`role="tablist"`) in testa a `renderSummaryMetrics` (`#forecast-summary-card`) e `renderSpecificSpotMetrics` (`#forecast-specific-spot-card`), con tre pillole (`Panoramica`, `Decollo`, `Atterraggio`) dotate di `data-action="select-subspot"`.
   - Rese interattive le righe `.gm-flight-stat-row-interactive` del decollo e dell'atterraggio nella card di sintesi per aprire con 1 tocco le rispettive previsioni micro-aerologiche.
2. **Combo Inline Condizionale (`renderInlineSubSpotControl` in `ui/views/ForecastView.js`)**:
   - Quando `spot.takeoffs.length > 1` o `spot.landings.length > 1`, il nome dello spot viene sostituito da una `<select class="gm-inline-subspot-select gm-flight-target">` con `data-action="change-active-takeoff"` o `data-action="change-active-landing"`, attiva sia in `Panoramica` sia nella vista specifica `Decollo`/`Atterraggio`.
   - Quando è presente un solo decollo o un solo atterraggio (`length <= 1`), viene mantenuta l'etichetta statica `<span class="gm-flight-target">` senza controlli superflui (Occam's Razor).
   - Aggiornato `handleChange` per gestire `change-active-takeoff` e `change-active-landing`, aggiornando lo store reattivo, la vista corrente e il fetch meteo per il nuovo punto.
   - Aggiornato `select-subspot` (`subSpotId === 'overview'`) per preservare il decollo e l'atterraggio scelti dall'utente quando si torna in `Panoramica`.
3. **Design System & Verifica Test (`css/theme.css`, `tests/ui/forecastView.test.mjs`)**:
   - Aggiunti gli stili dual-theme (dark cockpit + `[data-theme="light"]` sunlight mode) per `.gm-quick-subspot-switcher`, `.gm-quick-subspot-pill`, `.gm-flight-stat-row-interactive` e `.gm-inline-subspot-select` usando esclusivamente CSS custom properties (`var(--gm-*)`).
   - Aggiunta la suite di test dedicata `Quick Sub-Spot Forecast Switcher & Conditional Inline Multi-Spot Combo ([NOTE-002])` in `tests/ui/forecastView.test.mjs` (92/92 test superati tra `forecastView.test.mjs` e `uiIntegrityAudit.test.mjs`).
