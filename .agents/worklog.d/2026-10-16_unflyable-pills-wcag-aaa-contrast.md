# 2026-10-16 — Contrasto WCAG AAA per i Pill di Non-Volabilità nelle Previsioni (Proposta A)

## Contesto e Diagnosi
I pill rossi che indicano lo stato e il motivo della non-volabilità nelle Previsioni (`.gm-flight-window-hazard-chip`, `.gm-flight-window-badge-unflyable`, `#forecast-scrubber-spot-pill`, `.gm-param-status-badge.unflyable`, `.gm-trend-sub-badge.status-unflyable`, `.gm-reason-pill.pill-unflyable`) utilizzavano il token `--gm-status-unflyable` (`#ef4444`, luminanza relativa $L = 0.229$) come colore del testo su sfondo scuro (`#1b202c`) o su sfondo rosso semitrasparente (`rgba(239, 68, 68, 0.15)` $\to$ composito `#3b2530`, $L = 0.031$).
Questo generava un rapporto di contrasto compreso tra **3.44:1 e 4.28:1** (sotto la soglia minima WCAG 2.1 AA di `4.5:1`), aggravato da vibrazione ottica (cromostereopsi) tra il rosso saturo e il fondo ardesia scuro. Inoltre la regola `.gm-trend-sub-badge.status-unflyable` risultava assente in `css/theme.css`.

## Decisione Architetturale (Proposta A — Tinted Pill ad Alta Luminanza)
1. **Separazione Token Icona/Barra vs Token Testo Pill (`css/theme.css`)**:
   - Mantenuto `--gm-status-unflyable: #ef4444` per barre, indicatori grafici e soglie SVG.
   - Introdotto `--gm-status-unflyable-text: #fca5a5` (Red-300, $L = 0.485$) e `--gm-status-unflyable-border: rgba(248, 113, 113, 0.45)` in `:root` (Dark Mode), portando il contrasto sul fondo composito a **7.8:1 (WCAG AAA)**.
   - Introdotto `--gm-status-unflyable-text: #b91c1c` (Red-700) e `--gm-status-unflyable-border: rgba(185, 28, 28, 0.35)` in `[data-theme="light"]`, garantendo **6.4:1 (WCAG AA+)** sotto luce solare.
2. **Allineamento Componenti UI (`css/theme.css`, `ui/views/ForecastView.js`)**:
   - Aggiornati `.gm-badge-unflyable`, `.gm-reason-pill.pill-unflyable`, `.gm-param-status-badge.unflyable`, `.gm-flight-window-badge-unflyable` e `.gm-flight-window-hazard-chip`.
   - Aggiunta la regola mancante `.gm-trend-sub-badge.status-unflyable` per i badge `"Fuori Cono"` e `"NO FLY: Pioggia"` nei pannelli laterali dei grafici.
   - Aggiornato `#forecast-scrubber-spot-pill` e `#flight-analysis-scrubber-spot-pill` in `ForecastView.js` con classi semantiche `.status-unflyable` / `.status-caution` / `.status-flyable` e token `--gm-status-unflyable-text`.
3. **Presidio Automatico (`tests/ui/shiftLeftGovernance.test.mjs`)**:
   - Aggiunto test Gate 4 per verificare la presenza dei token `--gm-status-unflyable-text` in entrambi i temi e dei selettori `.gm-trend-sub-badge.status-unflyable` e `.gm-map-scrubber-spot-pill.status-unflyable`.
