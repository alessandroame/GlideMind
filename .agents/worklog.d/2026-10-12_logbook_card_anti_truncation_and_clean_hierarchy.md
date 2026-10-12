# Logbook Card: Bonifica Gerarchia Visiva, Anti-Troncamento Rotte e Rimozione Ridondanze

- **Data**: 2026-10-12
- **Ambito**: UI / Logbook / Ergonomia Mobile / Laws of UX (Occam's Razor & Fitts's Law)
- **File Coinvolti**:
  - `ui/views/LogbookView.js`
  - `css/theme.css`
  - `tests/ui/logbookView.test.mjs`

---

## 1. Contesto & Diagnosi

Su viewport mobile ristretti (360px–390px), le card del Flight Log presentavano tre criticità ergonomiche:
1. **Troncamento Sistematico della Rotta di Volo**: L'header della card concentrava sulla stessa riga il badge numerico `#num`, il titolo, il badge di categoria velica `[EN-B]` e il pulsante di eliminazione `[x]`. Gli elementi ausiliari assorbivano 156px sui 300px disponibili della card, lasciando al titolo solo 144px (~13-15 caratteri). Rotte realistiche come `Decollo Ciavanis -> PeterPan Santa Elisabetta` (44 caratteri) venivano troncate al 30% (`Decollo Ciavanis -> PeterPan ...`), nascondendo completamente l'atterraggio.
2. **Badge Categoria Velica `EN-B` Ridondante**: Il pill badge colorato di classe velica nell'header costituiva rumore visivo superfluo, poiché il modello esatto della vela (`Axis Pluto 4`) è già riportato nella seconda riga, i filtri di categoria sono presenti nella barra superiore del logbook, e la scheda tecnica completa è accessibile nel dettaglio volo.
3. **Duplicazione del Toponimo di Decollo**: A causa della condizione `flight.site !== title`, in tutte le tracce in cui `siteName` rappresenta la rotta (`takeoff -> landing`) e `site` il decollo, il nome del decollo veniva ristampato tale e quale nella seconda riga (`... • Ore 16:42 • Decollo Ciavanis • Axis Pluto 4`), sprecando 100px orizzontali e forzando il troncamento artificiale del nome della vela (`truncate max-w-[140px]`).

---

## 2. Decisioni & Interventi Architetturali

1. **Rimozione del Badge di Categoria Velica dall'Header della Card**:
   - Rimosso `gm-glider-pill-badge` dal template di `renderFlightCard` in `ui/views/LogbookView.js`.
   - Recuperati immediatamente ~54px di larghezza utile per il titolo della rotta.
2. **Anti-Troncamento Titolo a Due Righe Controllate**:
   - In `css/theme.css`, aggiornato `.gm-flight-site-title` con `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; word-break: break-word;`.
   - Allineato l'header a `align-items: flex-start`, consentendo al titolo di estendersi su due righe (~480px di budget testuale) per mostrare sempre per intero decollo e atterraggio.
3. **Bonifica Sub-Header e Funzione di Riconoscimento Ridondanze (`isTakeoffRedundant`)**:
   - Introdotta la funzione `isTakeoffRedundant(site, title, takeoffName)` che verifica se il toponimo è già contenuto o coincide con il decollo della rotta. Se ridondante, `siteArea` viene omesso.
   - La seconda riga mostra ora una sequenza pulita e ariosa: `Data • Ore HH:MM • Modello Vela`.
   - Rimosso il limite rigido `max-w-[140px]` sullo span della vela, preservando i nomi di ali composti senza tagli.
4. **Allineamento Geometrico Pulsante Elimina**:
   - Configurato `margin-top: -6px; margin-right: -4px;` su `.gm-flight-delete-btn` per preservare il touch target di $48 \times 48\text{px}$ a filo con l'angolo superiore della card.

---

## 3. Verifica e Impatti sui Test

- Aggiunto test specifico in `tests/ui/logbookView.test.mjs`:
  - `should prevent redundant takeoff in subtitle and exclude EN category badge from card header`
- Esecuzione di tutti i test del modulo logbook (`tests/core/logbook*.test.mjs`, `tests/ui/logbook*.test.mjs`): 65 test passati al 100%.
- Nessuna regressione sui 710+ test della suite globale.
