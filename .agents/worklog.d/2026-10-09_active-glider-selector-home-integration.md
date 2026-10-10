# Intervento: Integrazione Selettore Vela Attiva nella Home Dashboard

- **Data**: 2026-10-09
- **Ambito**: `ui/views/HomeDashboardView.js`, `core/store.js`, `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/homeDashboardView.test.mjs`, `tests/core/store.test.mjs`
- **Oggetto**: Ripristino e integrazione del controllo per la selezione della classe di omologazione della vela attiva (EN-A, EN-B, EN-C, EN-D) direttamente nella scheda "Attività Pilota" della vista Home Dashboard, con bottom sheet dedicato e persistenza nello store.

---

## 1. Contesto & Rationale Architetturale
A seguito dei recenti interventi di decluttering e bonifica della Home Dashboard, il controllo di selezione della vela attiva era stato temporaneamente escluso dalla schermata principale.
Poiché la classe della vela (`activeGlider`) determina parametri fisici ed envelope aerodinamici fondamentali sia per i limiti di vento al decollo sia per il calcolo del cono di efficienza di planata verso l'atterraggio ($E_{\text{richiesta}} \le E_{\text{glider}}$), la selezione della vela deve risultare accessibile al pilota con un singolo tocco.

---

## 2. Modifiche Implementate

1. **`ui/views/HomeDashboardView.js`**:
   - Inserita una riga dedicata `.gm-pilot-glider-row` all'interno della card "Attività Pilota", posizionata tra l'intestazione/toggle periodo e la griglia KPI.
   - Creata una pill interattiva `#btn-home-select-glider.gm-glider-pill` conforme alla legge di Fitts (touch target >= 48px), con badge cromatico per classe (EN-A..EN-D), nome esteso della vela e chevron di selezione.
   - Implementato il metodo `openGliderSheet()` che invoca il gestore centralizzato `openSheet()`, presentando le 4 classi di omologazione FAI/EN (`GLIDER_CLASSES`) con indicazione di velocità trim ($v_{\text{trim}}$) ed efficienza massima di planata ($E$).
   - Aggiunta gestione degli eventi `open-glider-sheet` e `select-glider` via event delegation in `handleClick()`.
   - Aggiornata la sottoscrizione reattiva dello store in `mount()` per intercettare mutazioni su `state.activeGlider` e `state.glider`, innescando il re-render immediato e la ricalibrazione dei comprensori a 0ms di latenza.

2. **`core/store.js`**:
   - Aggiunto `activeGlider: DEFAULT_GLIDER` a `DEFAULT_INITIAL_STATE`.
   - Registrate le chiavi `'activeGlider'` e `'glider'` in `persistedKeys` per garantire la sincronizzazione e persistenza in `localStorage`.

3. **`ui/views/ForecastView.js`**:
   - Allineato il fallback `getActiveGlider()` per prioritizzare `state.activeGlider` e fallback su `state.glider` o `DEFAULT_GLIDER`.

4. **`css/theme.css`**:
   - Definiti i token e gli stili per `.gm-pilot-glider-row`, `.gm-glider-pill`, `.gm-glider-pill-badge` (en-a, en-b, en-c, en-d), `.gm-glider-pill-name`, `.gm-glider-pill-chevron`.
   - Definiti gli stili della scheda di selezione nel bottom sheet (`.gm-glider-sheet`, `.gm-glider-option-card`, `.gm-glider-badge`, `.gm-glider-check`).
   - Aggiunti override specifici per la modalità chiara ad alta luminanza (`[data-theme="light"]`).

5. **Test Suite (`tests/ui/homeDashboardView.test.mjs`, `tests/core/store.test.mjs`)**:
   - Aggiunti 3 test dedicati per il rendering della pill, apertura del bottom sheet e aggiornamento dello store con ricalcolo dinamico.
   - 311 test eseguiti con successo (100% pass).
