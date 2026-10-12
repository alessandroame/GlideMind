# Worklog: Espansione a Piena Altezza e Ingrandimento del Grafico Altimetrico nel Dettaglio Volo

- **Data**: 2026-10-12
- **Ambito**: `ui/views/FlightDetailSheet.js`, `css/theme.css`
- **Autore**: Antigravity Assistant

---

## 1. Contesto e Problematiche Riscontrate

A seguito della segnalazione utente ("Il grafico é grosso la metà del contenitore ingrandisci"):
- **Causa Radice del Grafico Dimezzato**: L'elemento `<svg>` all'interno del contenitore `.gm-flight-detail-alt-chart` utilizzava la classe utility `class="w-full h-full"`. Tuttavia, la classe `.h-full` non era definita nel foglio di stile `css/theme.css` (esisteva solo `.w-full`). In assenza di un'altezza CSS esplicita o di attributi `height` sul tag SVG, i browser calcolavano l'altezza dell'SVG in base all'aspect ratio intrinseco del viewBox ($600 \times 140 \approx 4.3:1$). Su viewport mobile ($\approx 370\text{px}$ di larghezza), l'SVG veniva forzato ad un'altezza di soli $86\text{px}$, mentre la card ne misurava $160\text{px}$. Il grafico occupava letteralmente solo la metà superiore del box, lasciando un'ampia striscia scura e vuota sul fondo e comprimendo l'escursione altimetrica a soli $32\text{px}$ utili.
- **Dimensioni Generali Ridotte**: Un'altezza di $140\text{px}$ / $160\text{px}$ risultava insufficiente per apprezzare la traccia altimetrica e le termiche.

---

## 2. Decisioni Architetturali e Interventi Eseguiti

1. **Definizione Globale di `.h-full` in `css/theme.css`**:
   - Aggiunta la classe `.h-full { height: 100%; }` accanto a `.w-full`.
2. **Presidio Esplicito CSS e Attributi SVG**:
   - Aggiunta in `css/theme.css` la regola vincolante `.gm-flight-detail-alt-chart svg { width: 100%; height: 100%; display: block; }`.
   - Aggiunti sul tag `<svg>` gli attributi espliciti `width="100%" height="100%"`.
3. **Ingrandimento Dimensionale della Card e del ViewBox**:
   - Portata l'altezza della card `.gm-flight-detail-alt-chart` a $220\text{px}$ su mobile e $260\text{px}$ su desktop (`@media (min-width: 640px)`).
   - Impostato il viewBox a $600 \times 220$ con margini ottimizzati (`padTop = 30`, `padBottom = 22`).
   - L'escursione verticale netta per la polilinea del volo passa da $32\text{px}$ a $168\text{px}$ (oltre 5 volte più ampia).

---

## 3. Risultati della Verifica

- **Suite Test Automatizzati**: 675 superati, 0 falliti, 1 ignorato su 676 test complessivi (`npm test`).
- **Test Unitari Dettaglio Volo**: 24/24 superati in 110ms (`node --test tests/flightDetailView.test.js tests/ui/flightDetailSheet.test.mjs`).
- **Verifica Grafica**: L'SVG occupa il 100% dell'altezza e della larghezza della card senza bande vuote o ritagli.
