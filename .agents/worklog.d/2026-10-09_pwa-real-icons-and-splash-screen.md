# Worklog Fragment: Generazione Icone Reali PWA e Splash Screen

- **Data**: 2026-10-09
- **Ambito**: Brand Identity, PWA Icon Bundle, UI Architecture, Splash Screen
- **Stato**: Completato (269/269 test passanti)

---

## Contesto & Motivazione
A seguito della revisione critica sulla resa grafica dell'icona applicativa e della bonifica del payoff (`FREE FLIGHT AEROLOGY & LOGBOOK`), è stato richiesto di produrre i file iconografici fisici reali per l'applicazione e lo splash screen zero-FOUC.

## Interventi Eseguiti
1. **Generazione e Adozione Master Visivo**:
   - Generato il master 1:1 dell'icona con emblema alare a tre piume aerodinamiche in oro ambrato satinato, bisellatura aeronautica e bagliore perimetrale su texture in fibra di carbonio scura (`#0b0d12`).
   - Generato il rendering verticale 9:16 borderless (full bleed, senza cornici mockup di dispositivi) con il payoff ufficiale bonificato `FREE FLIGHT AEROLOGY & LOGBOOK`.
2. **Esportazione Bundle Icone PWA Reali su Disco**:
   - `assets/icons/icon-512.png` (512×512px raster ad alta fedeltà).
   - `assets/icons/icon-192.png` (192×192px per installazione Android / launcher).
   - `assets/icons/apple-touch-icon.png` (180×180px per WebClip iOS).
   - `assets/icons/icon-maskable-512.png` (512×512px con safe-zone circolare 80% su sfondo integrale carbonio).
   - `assets/icons/favicon-32.png` (32×32px per tab browser).
   - `assets/brand/glidemind_splash.jpg` (master 9:16 per splash screen).
3. **Configurazione Web App Manifest & HTML Shell**:
   - In `manifest.webmanifest`, censite le icone standard, maskable e favicon con `display: standalone` e colori tema `#0b0d12`.
   - In `index.html`, collegati favicon, apple-touch-icon, manifest, overlay splash screen `#gm-splash-screen` e sostituito il placeholder SVG dell'header con `.gm-brand-icon`.
4. **Stile CSS & Ciclo di Dismiss Doherty**:
   - In `css/theme.css`, stilizzato `#gm-splash-screen` con `height: 100dvh`, background cover/contain, e classe `.gm-splash-hidden` con transizione 300ms e `pointer-events: none`.
   - In `ui/app.js`, esportata la funzione `dismissSplashScreen()` invocata al bootstrap dell'app per rimuovere l'overlay dal DOM entro la soglia di Doherty (<400ms).
5. **Automated Test Suite**:
   - Creata suite `tests/ui/brandAndSplash.test.mjs` che valida la presenza e i pesi delle icone reali, la conformità del manifest, l'integrità di `index.html` (<200 righe) e il ciclo di vita del dismiss.
6. **Vincolo Mobile Portrait-Only & Salvaguardia Ergonomica**:
   - In `manifest.webmanifest`, impostato `"orientation": "portrait-primary"`.
   - In `css/theme.css`, protetti tutti i breakpoint desktop con la condizione combinata `@media (min-width: 768px) and (min-height: 550px)`, prevenendo l'attivazione della shell desktop e il collasso dell'interfaccia su smartphone orizzontali.
   - Aggiunto in `index.html` e `css/theme.css` l'overlay `#gm-landscape-guard` per dispositivi touch `(pointer: coarse)` con altezza $\le 520\text{px}$ per garantire l'ergonomia outdoor a una mano.
   - Formalizzata la Regola 31 in `MEMORY.md`.

## File Coinvolti
- `assets/icons/icon-512.png`
- `assets/icons/icon-192.png`
- `assets/icons/apple-touch-icon.png`
- `assets/icons/icon-maskable-512.png`
- `assets/icons/favicon-32.png`
- `assets/brand/glidemind_splash.jpg`
- `manifest.webmanifest`
- `index.html`
- `css/theme.css`
- `ui/app.js`
- `tests/ui/brandAndSplash.test.mjs`
- `MEMORY.md`
- `DESIDERATA.md`
