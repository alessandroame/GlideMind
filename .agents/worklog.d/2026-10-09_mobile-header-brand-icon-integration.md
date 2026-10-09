# Worklog: Integrazione Icona Brand, Versione e Build Stamp nell'Header Mobile (HomeDashboardView)

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Contesto**: Collocazione del marchio applicativo GlideMind nella UI mobile dell'applicazione, rimozione della data duplicata dall'header e visualizzazione di versione e build stamp per ambienti di test.
- **Tipo**: UI Enhancement / HMI Ergonomics / Brand Alignment / Metadata

---

## 1. Decisione di Progettazione ed Ergonomia (Laws of UX)

1. **Rifiuto Sostituzione Icona Home nella Bottom Bar (Jakob's Law)**:
   - Preservata l'icona canonica della casa (`M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z`) nella barra di navigazione inferiore.
   - Sostituire un controllo universale con un marchio proprietario avrebbe causato ambiguità semantica e rottura dei principi Gestalt di somiglianza rispetto agli altri glifi SVG lineari da 24×24 px.
2. **Integrazione Brand Icon e Versione nell'Header Mobile (HomeDashboardView)**:
   - Inserita l'icona reale `assets/icons/icon-192.png` con classi `.gm-brand-icon .gm-brand-icon-sm` (22×22 px, raggio curvatura 5 px, box-shadow ambrato discreto) subito a sinistra del tag `<h1>GlideMind</h1>` nell'header mobile.
   - A fianco del titolo è visualizzata la versione corrente (`v2.0.0`) con font ridotto monospace (`text-xs font-mono text-[var(--gm-text-muted)] font-normal`).
3. **Rimozione Data Ridondante e Inserimento Build Stamp**:
   - Rimossa la stringa della data statica (`2026-10-09`) dalla testata, in quanto la data attiva è già selezionabile ed evidente nel selettore orizzontale della sezione Volabilità.
   - Sulla destra dell'header è visualizzato il tag di build (`build 5bf6d1c`), garantendo tracciabilità immediata della versione in fase di test sia su mobile sia su desktop.
4. **Modulo Centralizzato `core/version.js`**:
   - Creata la SSOT `core/version.js` che espone `APP_VERSION`, `APP_BUILD`, `APP_BUILD_DATE`, `getFormattedVersion()` e `getFormattedBuild()`.
   - Aggiornato `ui/app.js` per esporre sia `version` sia `build` in `window.__GLIDEMIND__`.

---

## 2. File Modificati e Test

- `core/version.js`: SSOT per metadati di versione e build.
- `ui/views/HomeDashboardView.js`: rimossa data dall'header, integrata icona brand, versione e build stamp.
- `ui/app.js`: integrati metadati versione e build nel bootstrap e debug object globale.
- `css/theme.css`: definita variante `.gm-brand-icon-sm` (22×22 px) e reso `.gm-brand-icon` `inline-block` e `flex-shrink: 0`.
- `tests/core/version.test.mjs`: test di unità per costanti e funzioni di formattazione versione/build.
- `tests/ui/homeDashboardView.test.mjs`: test di regressione per assenza data in testata, presenza icona brand, versione e build.
- **Suite di Test**: 278/278 test superati (`node --test`).
