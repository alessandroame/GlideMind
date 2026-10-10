# Intervento: Selettore Vele per Marca e Modello con Catalogo Certificato e Input Custom

- **Data**: 2026-10-10
- **Ambito**: `core/gliders.js`, `core/flyability.js`, `ui/views/HomeDashboardView.js`, `css/theme.css`, `tests/core/gliders.test.mjs`, `tests/ui/homeDashboardView.test.mjs`
- **Oggetto**: Integrazione del selettore per marca e modello di parapendio in GlideMind con catalogo curato di 50+ ali certificate dei 14 principali costruttori mondiali, ricerca istantanea testuale, filtri a chip per marca e configurazione manuale per vele non a catalogo con deduzione aerodinamica automatica.

---

## 1. Contesto & Rationale Architetturale
Il pilota di parapendio non vola con una "classe generica astratta" (es. solo "EN-B"), ma con un'ala reale (es. "Ozone Buzz Z7", "Advance Iota DLS", "Niviuk Hook 6") avente parametri aerodinamici precisi: velocità di trim ($v_{\text{trim}}$), velocità accelerata ($v_{\text{max}}$), efficienza di planata ($L/D$) e allungamento ($AR$).
Per azzerare l'attrito decisionale (Laws of UX: Tesler's Law, Postel's Law, Fitts's Law):
1. La selezione non richiede al pilota di cercare manuali tecnici o inserire parametri numerici a mano: basta scegliere la propria ala dal catalogo.
2. In caso di ali recenti o non censite, il pilota può digitare marca e modello e selezionare la classe EN: il motore deduce automaticamente i parametri aerodinamici predefiniti di sicurezza.
3. Le 4 classi generiche EN-A..EN-D rimangono disponibili per retrocompatibilità e per chi desidera un profilo base immediato.

---

## 2. Modifiche Implementate

1. **Nuovo Modulo Core Headless (`core/gliders.js`)**:
   - Definisce `PARAGLIDER_BRANDS`: elenco dei 14 principali costruttori (Ozone, Advance, Niviuk, Skywalk, Gin, Nova, Phi, BGD, Supair, Triple Seven, Flow, Mac Para, UP, AirDesign).
   - Definisce `POPULAR_GLIDERS`: catalogo strutturato di 50+ ali iconiche certificate FAI/EN con `brand`, `model`, `category`, `vTrim`, `vMax`, `glideRatio`, `ar`.
   - Implementa `searchGliders({ query, brand, category })`: ricerca multi-criterio per testo e costruttore.
   - Implementa `getGliderById(id)`: lookup deterministico per ID univoco.
   - Implementa `createCustomGlider({ brand, model, category, ... })`: generazione di modelli personalizzati con fallback e deduzione aerodinamica automatica da `getGliderClassDefaults(category)`.
   - ZERO dipendenze dal DOM (100% testabile in Node.js headless).

2. **Retrocompatibilità Core (`core/flyability.js`)**:
   - Riesporta `GLIDER_CLASSES` e `DEFAULT_GLIDER` da `core/gliders.js`, garantendo zero impatti sui moduli consumatori preesistenti.

3. **Integrazione UI Bottom Sheet (`ui/views/HomeDashboardView.js`)**:
   - Aggiornato `openGliderSheet()` con layout ergonomico a 3 sezioni:
     - Ricerca istantanea testuale `#glider-search-input`.
     - Chips orizzontali scorrevoli per filtro rapido marca (`.gm-glider-brand-chips`).
     - Lista dinamica dei modelli a catalogo (`#glider-models-list`) con badge classe, specifiche aerodinamiche e checkmark di selezione.
     - Sezione profilo generico EN-A..EN-D per selezione rapida.
     - Modulo collassabile per ali personalizzate con deduzione automatica.
   - `handleClick` supporta le azioni `filter-glider-brand`, `select-glider-model` e `save-custom-glider`.
   - Aggiornata la pillola della vela attiva nella dashboard Home per visualizzare il nome completo `${brand} ${model}`.

4. **Design System & Ergonomia (`css/theme.css`)**:
   - Aggiunti stili dedicati per `.gm-glider-search`, `.gm-glider-brand-chips`, `.gm-glider-brand-chip`, `.gm-glider-models-list` e `.gm-glider-section-divider`.
   - Supporto scorrimento fluido touch e rispetto dei target ergonomici Fitts.

5. **Test Automatizzati Unitari & UI**:
   - Creata suite `tests/core/gliders.test.mjs` (9 test) per la validazione di catalogo, filtri, ricerca, lookup e deduzione custom.
   - Estesa suite `tests/ui/homeDashboardView.test.mjs` (+4 test per un totale di 20 test) per verificare rendering chips, ricerca, selezione modello e creazione ala custom.
   - 309 test eseguiti con successo su 43 suite (100% pass).
