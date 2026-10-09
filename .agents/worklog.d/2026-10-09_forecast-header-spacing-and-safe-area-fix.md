# Worklog: Correzione Spaziatura Header Previsioni, Safe-Area Top e Ergonomia Touch

**Data**: 2026-10-09  
**Autore**: Antigravity  
**Ambito**: UI / Ergonomia Mobile / CSS / Laws of UX  

---

## 1. Contesto & Diagnosi
- **Segnalazione**: L'utente ha segnalato che nel ForecastView "in alto è tutto appiccicato", allegando uno screenshot della schermata Previsioni.
- **Rilievi Analitici via Chrome DevTools (`evaluate_script` e screenshot)**:
  1. La Comprensorio Bar (`.gm-comprensorio-bar`), il selettore Sub-Spot (`.gm-subspot-select`) e le schede data (`.gm-date-tabs`) avevano letteralmente `0px` di distacco reciproco (`distBarToSelect: 0`, `distSelectToTabs: 0`).
  2. Causa: nel markup HTML era presente `class="gm-forecast-header flex flex-col gap-2.5"`. In `theme.css` non esisteva alcuna classe `.gap-2\.5`, provocando il fallback di flexbox a `gap: normal` (`0px`).
  3. Il contenitore `#main-view` non includeva `env(safe-area-inset-top, 0px)`, posizionando la prima card a ridosso del bordo superiore dello schermo/notch.
  4. Il selettore sub-spot aveva `min-height: 42px` (inferiore ai 48px prescritti dalle Laws of UX / Fitts's law) e `border-radius: 8px` disomogeneo rispetto ai 12px della Comprensorio Bar.

---

## 2. Modifiche Apportate
1. **`css/theme.css`**:
   - Aggiornato `#main-view` con `padding-top: calc(16px + env(safe-area-inset-top, 0px))`.
   - Aggiunte classi utility mancanti `.gap-1\.5 { gap: 6px; }` e `.gap-2\.5 { gap: 10px; }`.
   - Introdotta la classe semantica `.gm-forecast-header` con `display: flex; flex-direction: column; gap: 12px; margin-bottom: 2px;`.
   - Aggiunto `padding-top: 4px;` a `.gm-forecast-view`.
   - Aggiornato `.gm-subspot-select` con `min-height: var(--gm-touch-min, 48px)`, `border-radius: var(--gm-radius-md)`, padding `10px 14px`, `font-size: 0.88rem` e focus ring ad alta visibilità.
2. **`ui/views/ForecastView.js`**:
   - Sostituito `<header class="gm-forecast-header flex flex-col gap-2.5">` con il selettore semantico pulito `<header class="gm-forecast-header">`.

---

## 3. Verifica Visiva e Test
- **Ispezione Metrica Chrome DevTools**:
  - `headerGap`: 12px
  - `distBarToSelect`: 12px
  - `distSelectToTabs`: 12px
  - `barRect.top`: 20px (distanza confortevole dal margine superiore)
- **Verifica Grafica**: Acquisito screenshot con esito visivo confermato (elementi chiaramente distinti e conformi a Gestalt Common Region e Fitts's Law).
- **Test di Regressione**: 279/279 test superati in Node.js native test runner (`npm test`).
