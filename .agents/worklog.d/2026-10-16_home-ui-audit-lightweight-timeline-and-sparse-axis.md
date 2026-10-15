# 2026-10-16 - Audit UI Home Dashboard: Alleggerimento Visivo Timeline Diurna e Rimozione Ripetizione Ore con Asse Condiviso

## Contesto e Problema
L'utente ha richiesto un audit UI/UX della Home Dashboard (`HomeDashboardView.js` e `css/theme.css`) segnalando due criticità visive specifiche sulla timeline diurna delle card comprensorio:
1. Gli indicatori della timeline (`.gm-home-timeline-bar`) risultavano troppo pesanti ed evidenti (`height: 8px`, blocchi saturi al 100% su tutte le 13 colonne di ogni card, inclusi gli slot rossi `Non Volabile`).
2. La ripetizione continua della sequenza dei numeri delle ore (`07 08 09 10 11 12 13 14 15 16 17 18 19`) su ogni singolo slot e ripetuta identicamente su ogni singola card comprensorio generava un forte rumore visivo.

Inoltre, l'audit statico secondo `laws-of-ux-audit` e `ui_design_system_spec.md` ha rilevato:
- Variabili CSS non definite in `:root` e `[data-theme="light"]` (`--gm-bg-surface-alt`, `--gm-border-subtle`, `--gm-surface-2`, `--gm-text`), che rendevano trasparenti le barre `status-unavailable` offline e i bordi di `.gm-reason-pill` / `.gm-spot-search-match`.
- Contrasto insufficiente in `[data-theme="light"]` per `.gm-glider-pill-badge.en-a/.en-b/.en-c/.en-d` (colori pastello da dark mode `#4ade80`, `#60a5fa`, `#fbbf24`, `#f87171` su sfondo chiaro, ~1.7:1 contro $\ge 4.5:1$ WCAG AA) e per `.gm-reason-pill`.
- Assenza di hit-area espansa `::before` ($\ge 44\text{px}$) su `.gm-spot-badge-toggle` e `.gm-home-timeline-slot`.
- Presenza di classe colore hardcoded `text-[#f87171]` e stile inline `style="height: 72px;"` in `HomeDashboardView.js`.

## Decisioni Architetturali e Interventi
1. **Asse Orario Diurno Condiviso e Diradato (`.gm-home-time-axis`) + Occultamento Numeri Ripetuti a Riposo**:
   - Introdotto `renderSharedTimelineAxis(evaluatedList)` in `HomeDashboardView.js`, renderizzato **una sola volta** in cima a `#home-spots-list` e allineato alla griglia di `.gm-home-timeline` (`padding: 0 12px`).
   - Nell'asse condiviso vengono mostrati solo i riferimenti orari principali (prima ora, multipli di 3 ore distanziati, ultima ora — es. `07 · 09 · · 12 · · 15 · · · 19`), sostituendo le ore intermedie con un punto discreto `·` (`.is-minor`).
   - All'interno di ciascuna card comprensorio, `.gm-home-timeline-hour` è nascosto a riposo (`opacity: 0; position: absolute; top: -15px;`) eliminando la ripetizione delle righe numeriche su ogni card, e compare come micro-badge flottante solo su `:hover`, `:focus-visible` o `.is-selected-hour`.
2. **Alleggerimento Geometrico e Gerarchia d'Opacità della Timeline (`.gm-home-timeline-bar`)**:
   - Spessore di `.gm-home-timeline-bar` ridotto da `8px` a una linea pill sottile da `3.5px` (`border-radius: var(--gm-radius-full)`), con altezza visiva dello slot ridotta a `14px` e area di tocco estesa via `::before` (`inset: -8px 0`).
   - Gerarchia cromatica calibrata (Von Restorff Effect): `status-flyable` (`opacity: 0.85`), `status-caution` (`opacity: 0.68`), `status-unflyable` de-enfatizzato (`opacity: 0.28`, così le ore chiuse non dominano visivamente la schermata) e `status-unavailable` (`opacity: 0.32` su `--gm-border-strong`).
3. **Bonifica Token CSS e Contrasto Light Mode (WCAG AA)**:
   - Definiti `--gm-bg-surface-alt`, `--gm-border-subtle` e `--gm-surface-2` in `:root` e `[data-theme="light"]`.
   - Corretto il contrasto in `[data-theme="light"]` per `.gm-glider-pill-badge` / `.gm-glider-badge` (`#15803d`, `#1d4ed8`, `#b45309`, `#b91c1c`) e `.gm-reason-pill`.
   - Sostituiti i riferimenti a `--gm-text` con `--gm-text-primary`, `text-[#f87171]` con `text-[var(--gm-status-severe-text)]` e `style="height: 72px;"` con `.gm-skeleton-card`.

## Verifica
- Eseguita la suite `node --test tests/ui/homeDashboardView.test.mjs tests/ui/uiIntegrityAudit.test.mjs`: **43/43 test superati** in 347ms.
