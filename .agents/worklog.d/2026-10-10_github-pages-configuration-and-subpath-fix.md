# Worklog: GitHub Pages Configuration & Subpath Fetch Fix

**Data**: 2026-10-10  
**Autore**: Alessandro Amè / Antigravity  
**Ambito**: DevOps / GitHub Pages Deployment / Static Asset Routing

---

## Contesto & Motivazione
Preparazione del repository GlideMind per il deployment su GitHub Pages (`https://alessandroame.github.io/GlideMind/`). In ambiente GitHub Pages su repository di progetto (non user domain), l'applicazione viene servita sotto il subpath `/GlideMind/`.

## Diagnosi e Punti di Attrito Rilevati
1. **Chiamata fetch assoluta a `locations.json`**: In `ui/app.js`, la chiamata `window.fetch('/data/locations.json')` puntava alla radice assoluta del dominio (`https://alessandroame.github.io/data/locations.json`), causando un errore 404 e costringendo l'app a ricadere sui comprensori sintetici di default anziché caricare il catalogo completo di 35+ spot reali.
2. **Jekyll processing di default**: Senza `.nojekyll`, GitHub Pages attiva Jekyll, che esclude cartelle o file con prefisso punto o underscore e può interferire con gli asset statici.

## Interventi Eseguiti
1. **`ui/app.js`**: Convertito `window.fetch('/data/locations.json')` nel percorso relativo `window.fetch('./data/locations.json')`.
2. **`tests/ui/locationsCatalogHydration.test.mjs`**: Aggiornato il mock di `fetch` per accettare sia `./data/locations.json` sia `/data/locations.json`.
3. **`.nojekyll`**: Aggiunto file vuoto nella root del repository per disabilitare il processore Jekyll su GitHub Pages.

## Verifica
- Esecuzione completa della suite di test: 338 test superati con successo (`npm test`).
