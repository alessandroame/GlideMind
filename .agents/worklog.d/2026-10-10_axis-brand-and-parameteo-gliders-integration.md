# Intervento: Integrazione Costruttore Axis e Catalogo Modelli da ParaMeteo

- **Data**: 2026-10-10
- **Ambito**: `core/gliders.js`, `tests/core/gliders.test.mjs`, `tests/ui/homeDashboardView.test.mjs`
- **Oggetto**: Integrazione del marchio **Axis** e della gamma completa di modelli certificati provenienti dal catalogo canonico di ParaMeteo (`C:\github\ParaMeteo\data\gliders.json`), inclusi `Compact 4`, `Pluto 4`, `Comet 4`, `Vega 6`, `Venus 4 / SC` e `Sirius 2 (Tandem)`, con estensione di test unitari e test di interazione UI.

---

## 1. Contesto & Riconciliazione Dati
Nel repository di riferimento `ParaMeteo` (`data/gliders.json`), il costruttore ceco **Axis** era ampiamente supportato con le sue ali certificate e i parametri aerodinamici empirici ($v_{\text{trim}}$, $v_{\text{max}}$, allungamento $AR$, efficienza $L/D$, tasso di caduta minimo $\text{sinkMin}$). In GlideMind, il costruttore Axis e i relativi modelli mancavano nell'elenco predefinito.

---

## 2. Modifiche Implementate

1. **Aggiornamento Catalogo Core Headless (`core/gliders.js`)**:
   - Aggiunto `'Axis'` a `PARAGLIDER_BRANDS`.
   - Aggiunti in `POPULAR_GLIDERS` tutti i 6 modelli Axis canonici di ParaMeteo con parametri aerodinamici identici:
     - `Compact 4` (EN-A): $v_{\text{trim}} = 36$ km/h, $v_{\text{max}} = 46$ km/h, $AR = 4.8$, glide 8.4, sinkMin 1.06 m/s.
     - `Pluto 4` (EN-B): $v_{\text{trim}} = 37$ km/h, $v_{\text{max}} = 49$ km/h, $AR = 5.05$, glide 9.3, sinkMin 1.02 m/s.
     - `Comet 4` (EN-B): $v_{\text{trim}} = 39$ km/h, $v_{\text{max}} = 53$ km/h, $AR = 5.55$, glide 10.3, sinkMin 0.98 m/s.
     - `Vega 6` (EN-C): $v_{\text{trim}} = 40$ km/h, $v_{\text{max}} = 56$ km/h, $AR = 6.25$, glide 11.2, sinkMin 0.95 m/s.
     - `Venus 4 / SC` (EN-D): $v_{\text{trim}} = 41$ km/h, $v_{\text{max}} = 60$ km/h, $AR = 6.95$, glide 11.8, sinkMin 0.92 m/s.
     - `Sirius 2 (Tandem)` (EN-B): $v_{\text{trim}} = 38$ km/h, $v_{\text{max}} = 50$ km/h, $AR = 5.3$, glide 9.5, sinkMin 1.10 m/s.
   - Aggiunti anche i modelli ParaMeteo mancanti per altri costruttori: `ozone-zeno-2` (Ozone Zeno 2, EN-D), `nova-sector` (Nova Sector, EN-C), `niviuk-artik-r` (Niviuk Artik R, EN-C).

2. **Integrazione Test Unitari (`tests/core/gliders.test.mjs`)**:
   - Aggiunto `'Axis'` all'elenco dei marchi primari verificati in `PARAGLIDER_BRANDS`.
   - Aggiunto test specifico `should include Axis brand and all iconic Axis models from ParaMeteo catalog` che verifica l'accuratezza di tutti i parametri fisici dei modelli Axis.
   - Verificato il filtro `searchGliders({ brand: 'Axis' })`.

3. **Integrazione Test UI (`tests/ui/homeDashboardView.test.mjs`)**:
   - Verificata la presenza del chip `data-brand="Axis"` nel modal sheet della vela.
   - Verificato che la selezione del brand chip Axis filtri correttamente l'elenco escludendo gli altri brand.
   - Verificata la ricerca testuale (es. `"pluto"`) con individuazione immediata di `Axis Pluto 4`.

---

## 3. Risultati dei Test
- Esecuzione completa della suite di test: 316 test superati su 45 suite (100% pass rate, zero fallimenti, zero regressioni).
