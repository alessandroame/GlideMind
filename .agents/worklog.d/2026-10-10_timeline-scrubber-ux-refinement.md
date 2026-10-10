# Worklog: Ottimizzazione UX Scrubber Orario e Contrasto Sunlight WCAG AA

- **Data**: 2026-10-10
- **Ambito**: `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/`
- **Autore**: Antigravity Pair Programming

## 1. Contesto & Diagnosi
A seguito di una revisione ergonomica e UX della vista previsioni (`ForecastView`), sono state rilevate criticità di ingombro verticale, rumore visivo e leggibilità:
1. **Header Superfluo**: La presenza del testo `Scrubber Orario` (gergo ingegneristico) e dei bottoni stepper `< ORE SELEZIONATE: 10:00 >` consumava circa 36–40px verticali, duplicando l'informazione già visibile nella colonna oraria attiva.
2. **Assenza Marcatore Ora Attuale**: Selezionando la data odierna (`today`), la timeline non offriva alcun riferimento visivo su dove si trovasse l'utente rispetto all'evoluzione oraria del giorno.
3. **Visibilità Semaforo Volabilità Ridotta**: La capsula oraria (.compact-bar) misurava appena 9px di larghezza con riempimento proporzionale (30% per non volabile = 9.6px di altezza), risultando poco percepibile a distanza d'uso outdoor.
4. **Deficit di Contrasto in Modalità Chiara**: Sotto `[data-theme="light"]`, la capsula `#e2e8f0` su sfondo card `#ffffff` esibiva un contrasto di 1.27:1, fallendo il requisito WCAG 2.1 Non-Text Contrast ($\ge 3:1$) e scomparendo sotto luce solare diretta.

## 2. Decisioni Architetturali & Modifiche
1. **Rimozione Header Superfluo & Recupero Viewport**:
   - Eliminato l'header superiore da `renderStickyScrubber()` in `ForecastView.js`.
   - Recuperati 36-40px verticali per le card e i grafici aerologici.
   - Aggiunto supporto alla navigazione oraria tramite tastiera con tasti freccia `ArrowLeft` / `ArrowRight`.
2. **Marcatore Situazionale "ORA"**:
   - Quando `this.activeDate === formatDateIso(new Date())`, la colonna corrispondente a `currentHour` riceve la classe `.is-now` e il badge assoluto `.compact-now-badge` ("ORA").
   - Le ore anteriori a quella corrente ricevono la classe `.is-past` con opacità attenuata (0.6) quando non selezionate.
3. **Potenziamento Indicatore di Volabilità**:
   - Allargata la capsula `.compact-bar` da 9px a **14px** (+55% di superficie).
   - Inserito lo sfondo colorato di stato (`slotBgColor: var(--gm-status-*-bg)`) per comunicare la volabilità sull'intera altezza della capsula a colpo d'occhio (< 200ms).
   - Riempimento solido elevato: 100% per volabile, 65% per cautela, 35% per non volabile.
4. **Contrasto Sunlight Mode (WCAG 2.1 AA $\ge 3:1$)**:
   - Assegnato a `.compact-bar` un bordo definito `1px solid rgba(0, 0, 0, 0.28)` e a `.compact-time` colore `#1e293b` (contrasto > 10:1).
   - Rifinito lo stato attivo con contorno ambra rinforzato (`box-shadow: 0 0 0 1.5px var(--gm-accent-strong)`).
5. **Allineamento Suite di Test**:
   - Aggiornato `tests/ui/uiIntegrityAudit.test.mjs` con asserzioni per la timeline compatta a 13 slot, presenza del marcatore `is-now` e rimozione di label/header ridondanti.
   - Aggiunti test in `tests/ui/forecastView.test.mjs` per la verifica del rendering del badge ORA e della timeline continua.

## 3. Risultato & Verifica
- Esecuzione `npm test`: 340 test superati con successo in 47 suite (0 errori, 0 regressioni).
