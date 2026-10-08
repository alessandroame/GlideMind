# Scheda Intervento: Rimozione Funzionalità PIN e Preferiti dalla Schermata Home

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Rimozione totale di bottoni PIN, stelle preferiti e logiche di bookmarking dalla schermata Home (`HomeDashboardView.js`).

---

## 1. Motivazione & Richiesta Utente
Su esplicita direttiva dell'utente ("*Nella schermata home non voglio funzionalità di PIN e preferiti negli spot*"), la schermata Home è stata liberata da ogni meccanismo di micro-gestione preferiti/bookmarking.
Il pilota in decollo o a terra non deve gestire elenchi "finiti/aperti" o preoccuparsi di aggiungere/rimuovere spot con stelle: vuole visualizzare immediatamente le condizioni dei comprensori ordinati per volabilità pura.

---

## 2. Modifiche Apportate

1. **Bonifica della Vista `ui/views/HomeDashboardView.js`**:
   - Rimosse tutte le icone e i pulsanti stella/unpin (`★`, `data-action="unpin"`).
   - Rimosso il pulsante `+ Aggiungi` ai preferiti dall'intestazione.
   - Rimossa la logica del Floating Undo Toast per l'unpinning (`initiateUnpin`, `undoUnpin`, `commitUnpin`, `pendingRemovals`).
   - Rimosso lo stato vuoto di "Nessun comprensorio nei preferiti".
   - Ridenominata la sezione in **"Volabilità Comprensori"**.
   - Integrata una casella di ricerca e filtro istantaneo in tempo reale ad autocompletamento (NN/G #6 *Recognition over Recall*): permette di filtrare istantaneamente per nome o provincia senza digitare invio.
   - Tap sulla card o su "Vedi Previsioni Orarie" seleziona il comprensorio e naviga direttamente a `ForecastView`.

2. **Aggiornamento Contratti e Test in `tests/ui/homeDashboardView.test.mjs`**:
   - Asserzione esplicita che il markup HTML generato non contenga alcun attributo `data-action="unpin"`, né icone `★`, né riferimenti a "preferiti" o toast di rimozione.
   - Test per il filtro di ricerca istantaneo.
   - Tutti i 6 test della vista superati.

3. **Aggiornamento Documentazione e Memoria**:
   - Aggiornato [MEMORY.md](file:///MEMORY.md) (Sezione 14) sancendo il vincolo "Zero PIN/Preferiti nella Home".
   - Aggiornati [MASTER_PLAN.md](file:///MASTER_PLAN.md) e [DESIDERATA.md](file:///DESIDERATA.md).

---

## 3. Esito Test Regressione
- Esecuzione `node --test`: **191 test passati su 191** in 25 suite con 0 errori.
