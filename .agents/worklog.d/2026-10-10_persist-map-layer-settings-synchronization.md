# Worklog: Persistenza e Sincronizzazione del Layer Cartografico nei Settings

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: State Management, Impostazioni & Preferenze, Cartografia, Persistenza, UI/UX

---

## Contesto e Requisiti

L'utente ha richiesto di persistere nei settings sincronizzati il layer cartografico selezionato:
- La preferenza sul layer (`dark`, `topo`, `satellite`, `streets`) deve essere conservata stabilmente nel `storageAdapter` (LocalStorage) e ripristinata al ricaricamento dell'applicazione.
- La selezione deve risultare accessibile e configurabile nella vista Impostazioni (`SettingsView.js` / `#settings`).
- La sincronizzazione deve essere reattiva e bi-direzionale: qualsiasi modifica effettuata nella Mini Mappa delle Previsioni (`ForecastView.js`), nella Mappa Comprensori (`SpotMapView.js`) o nelle Impostazioni (`SettingsView.js`) deve riflettersi istantaneamente e persistere nello stato globale.

---

## Causa Radice

1. Nel `DEFAULT_INITIAL_STATE.ui` del core reattivo (`core/store.js`), la chiave `mapLayer` non era dichiarata esplicitamente, ricadendo su valori dinamici o `undefined` al primo avvio.
2. Nella procedura `loadPersistedState()`, il caricamento del blocco `ui` da LocalStorage sostituiva l'oggetto senza effettuare il merge con i valori di default, rischiando di perdere proprietà aggiunte in versioni successive.
3. La rotta `#settings` non disponeva di una vista registrata dedicata, visualizzando unicamente il placeholder temporaneo della shell.

---

## Interventi Implementati

### 1. Hardening della Persistenza nello Store Reattivo (`core/store.js`)
- Dichiarata la proprietà `mapLayer: 'dark'` in `DEFAULT_INITIAL_STATE.ui`.
- Aggiornato `loadPersistedState()` per eseguire il merge di sicurezza (`deepClone(DEFAULT_INITIAL_STATE.ui) + loadedSlice.ui`), garantendo che `ui.mapLayer` venga sempre ripristinato dal `storageAdapter` (LocalStorage nel browser) e preservato con fallback solido.

### 2. Creazione della Vista Impostazioni (`ui/views/SettingsView.js`)
- Realizzato il controller `SettingsViewController` (`ui/views/SettingsView.js`), disaccoppiato dal DOM globale e testabile in Node.js puro.
- **Sezione Cartografia & Mappe**:
  - Schede interattive per i 4 layer cartografici: `Scuro` (Antiriflesso), `OpenTopo` (Curve di Livello), `Satellite` (Ortofoto HD), `CyclOSM` (Outdoor & Sentieri).
  - Indicatore visivo `Attivo` e radiobutton stilizzato.
  - Al tap/click, invoca `setMapLayer(layerId)` che aggiorna `store.setState({ ui: { ...ui, mapLayer: layerId } })` e scatena la persistenza automatica su LocalStorage.
- **Sezioni Correlate**:
  - Modalità Schermo e Tema Visivo (`Scuro`, `Chiaro`, `Auto`).
  - Unità di Misura Aeronautiche (`km/h` vs `kt`, `m` vs `ft`, `m/s` vs `fpm`).
  - Vela Attiva & Profilo Hangar.
  - Stato Memoria Locale, versione dell'app e ripristino valori di fabbrica.
- Sottoscrizione reattiva a `store.subscribe()`: la vista si aggiorna automaticamente se il layer o il tema vengono modificati da altre schermate (es. mini-mappa o barra mappa).

### 3. Registrazione della Vista nel Router e Shell (`ui/app.js`)
- Importata l'istanza `settingsView` e registrata nel router (`router.registerView('settings', settingsView)`).
- La navigazione via navbar desktop (`#settings`), bottom tab bar mobile o scorciatoia `S` monta immediatamente la vista delle impostazioni.

### 4. Definizione Stili CSS nel Design System (`css/theme.css`)
- Aggiunti i selettori per `.gm-settings-view`, `.gm-settings-layer-grid`, `.gm-settings-layer-card`, `.gm-settings-row` conformi agli standard ergonomici outdoor (touch target $\ge 48\text{px}$, contrasti WCAG AA).

---

## Verifiche e Test

1. **Test Core Store (`tests/core/store.test.mjs`)**:
   - Aggiornato il test di persistenza verificando che `ui.mapLayer: 'satellite'` venga salvato nel `storageAdapter` e ripristinato identico con `store.loadPersistedState()`.
2. **Nuova Suite di Test SettingsView (`tests/ui/settingsView.test.mjs`)**:
   - 6 test dedicati: mount/unmount, rendering 4 layer con indicatore attivo, mutazione e persistenza del layer su storage, reattività alle mutazioni esterne dello store, commutazione tema/unità e pulizia dei listener senza memory leak.
3. **Esecuzione Completa**:
   - `npm test`: **409/409 test superati** su 59 suite.
