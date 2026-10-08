# Scheda Intervento: Implementazione Home Dashboard (Fase 3) & Allineamento Laws of UX 2026

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Completamento della vista `HomeDashboardView.js`, modulo headless `comprensorio.js` e allineamento al nuovo standard Laws of UX 2026.

---

## 1. Modifiche e Moduli Realizzati

1. **Allineamento Laws of UX 2026 (Commit `30da414`)**:
   - Innalzamento del touch floor da 44px ad almeno **48px** per dispositivi touch (`--gm-touch-min: 48px;` in `css/theme.css`).
   - Aggiornamento della suite di test [tests/ui/shellIntegrity.test.mjs](file:///tests/ui/shellIntegrity.test.mjs).
   - Aggiunta in `css/theme.css` degli stili per:
     - **Floating Undo Toast** (`.gm-toast`, `.gm-toast-undo-btn`) conforme all'euristica NN/G #3 (User Control & Grace Period).
     - **Skeleton Loaders** (`.gm-skeleton` con animazione `@keyframes gm-shimmer`) a zero Cumulative Layout Shift (CLS).
     - Stili layout griglia e card per decolli/atterraggi (`.gm-home-card`, `.gm-home-explainability`, `.gm-home-metrics-grid`, `.gm-metric-box`).

2. **Modulo Headless Comprensorio Locality (`core/comprensorio.js`)**:
   - Importazione e normalizzazione del catalogo italiano dei comprensori da [data/locations.json](file:///data/locations.json).
   - Inclusione di comprensori default offline (Monte Cornizzolo LC, Meduno PN, Calascio AQ, Bassano del Grappa TV).
   - Funzione di calcolo planata verso l'atterraggio:
     $$E_{\text{richiesta}} = \frac{D}{\Delta H} = \frac{D_{\text{Haversine}}}{Alt_T - Alt_L}$$
   - Verifica di sicurezza atterraggio calibrata sul proxy della vela in uso (EN-A: limite sicuro $\le 5.5$, EN-B: $\le 6.5$, EN-C: $\le 7.5$, EN-D: $\le 8.5$).
   - Valutazione simultanea dei decolli ($T_{\text{best}}$ con scostamento angolare minimo e volabilità migliore) e dell'atterraggio di sicurezza $L_{\text{safe}}$.
   - Algoritmo di ordinamento dinamico `sortEvaluatedComprensori`: `Aperto/Volabile` in cima $\to$ `Cautela` $\to$ `Chiuso`.

3. **Controller di Vista `ui/views/HomeDashboardView.js`**:
   - Conformità al ciclo di vita del router (`mount(containerEl, params)`, `unmount()`).
   - Architettura minimale rigorosamente a due blocchi:
     1. **Comprensori Preferiti Ordinati per Volabilità Decrescente**:
        - Card con badge sintetico (`Aperto`, `Cautela`, `Chiuso`), Explainability contestuale inline, griglia duale $T_{\text{best}}$ e $L_{\text{safe}}$, e CTA secondaria "Vedi Previsioni Orarie".
        - Gestione rimozione dai preferiti con pattern **Undo (NN/G #3)**: card temporaneamente nascosta, Floating Toast con finestra di grazia (6 secondi) e pulsante `[ Annulla ]`.
     2. **Stato Attività / Currency del Pilota**:
        - Riga sintetica con data, località, durata ultimo volo e badge allenamento.
        - Pulsante primario prominente ad alto contrasto (Von Restorff Effect): `+ Carica Traccia IGC` ($\ge 48\text{px}$).
   - Registrazione nel bootstrap in [ui/app.js](file:///ui/app.js).

---

## 2. Risultati dei Test Automatizzati
- Suite dedicata comprensorio: [tests/core/comprensorio.test.mjs](file:///tests/core/comprensorio.test.mjs) (12/12 passati).
- Suite dedicata vista Home: [tests/ui/homeDashboardView.test.mjs](file:///tests/ui/homeDashboardView.test.mjs) (7/7 passati).
- **Test totali di progetto**: **192 superati su 192** (25 suite), zero fallimenti e zero regressioni.
