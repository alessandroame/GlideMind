# ADR: Indicatore Visivo di Presenza Traccia GPS nel Flight Log e Filtri Rapidi

**Data**: 2026-10-13  
**Stato**: Accettato e Implementato  
**Contesto**: `core/logbook.js`, `ui/views/LogbookView.js`, `ui/views/FlightDetailSheet.js`, `css/theme.css`, `tests/core/logbook.test.mjs`, `tests/ui/logbookView.test.mjs`

---

## 1. Contesto e Motivazione
A seguito dell'eliminazione categorica di tracce GPS e altimetrie fittizie, l'utente ha richiesto un feedback visivo immediato a colpo d'occhio nel logbook:
> *"vorrei un indicatore se il volo ha o no una traccia allegata"*

Nel feed del Flight Log, i piloti devono poter distinguere all'istante i voli che dispongono di una traccia GPS autentica registrata (abilitati per mappa 2D e Replay 3D) rispetto ai voli inseriti manualmente o storicizzati da tabelle prive di coordinate GPS. Inoltre, è necessario disporre di filtri rapidi nel carosello per isolare i voli con traccia da quelli senza traccia.

---

## 2. Decisioni Architetturali e Implementazione

### 2.1 Funzione di Dominio Pura `hasAttachedTrack(flight)` (`core/logbook.js`)
- Creata funzione headless e deterministica `hasAttachedTrack(flight)` esportata dal core logbook:
  - Valuta `true` se il volo dispone di dati GPS autentici: `hasDecimatedTrack === true`, `hasRawIgc === true`, `decimatedPoints.length >= 2`, `points.length >= 2`, `rawIgc` con lunghezza $> 30$ caratteri, o bundle con traccia valida.
  - Valuta tassativamente `false` se il volo è contrassegnato come sintetico (`isReconstructed === true`), se gli array sono vuoti o se l'oggetto è nullo.
  - **Integrità Scientifica & Anti-Sycophancy**: Ignora il flag ambiguo di legacy Excel `flight.hasTrack === true` qualora non corrisponda a coordinate fisiche effettive (evitando falsi positivi come per il Volo #50).

### 2.2 Badge Semantico Glanceable nelle Card del Logbook (`ui/views/LogbookView.js`)
- Inserito badge compatto ad alto contrasto nel blocco `.gm-flight-badge-group` delle sole card dotate di traccia autentica, adiacente al pulsante di cancellazione:
  - **Traccia Presente**: Badge smeraldo `.gm-track-badge-present` con icona polyline SVG e testo esplicito *"Traccia"*.
  - **Traccia Assente**: Nessun badge renderizzato (rimosso il badge negativo *"No traccia"* per eliminare il sovraccarico visivo e mantenere le card dei voli storici/tabellari essenziali e pulite).
- Conforme a WCAG 2.1 AA e a `laws-of-ux` (Tri-Modal Safety Feedback sul badge positivo: colore + icona + testo esplicito).
- Font compatto a spaziatura controllata per prevenire qualsiasi troncamento del titolo volo su display mobile da 360px-390px.

### 2.3 Filtri Rapidi nel Carosello del Logbook (`ui/views/LogbookView.js`)
- Aggiunti due chip di filtraggio rapido nel carosello orizzontale a scorrimento singolo (`touch-action: pan-x`):
  - `Con traccia` (`data-filter="with-track"`): filtra rigidamente tramite `hasAttachedTrack(flight)`.
  - `Senza traccia` (`data-filter="no-track"`): filtra i voli privi di traccia o purificati.
- Aggiornato il metodo `filterFlights(flights)` per gestire i nuovi filtri in combinazione trasparente con la ricerca testuale e i filtri di categoria vela (EN-A, EN-B).

### 2.4 Sincronizzazione Pilastro Dettaglio Volo (`ui/views/FlightDetailSheet.js`)
- Resi perfettamente simmetrici i pill badge di stato della testata nel foglio di dettaglio:
  - Se `hasValidTrack`: pill verde smeraldo `.gm-status-pill-emerald` con testo *"Traccia GPS"*.
  - Se `!hasValidTrack`: pill neutro ardesia `.gm-status-pill-slate` con testo *"Traccia Non Registrata"*.

### 2.5 Design Tokens e Supporto Sunlight Mode (`css/theme.css`)
- Definiti stili `.gm-track-badge`, `.gm-track-badge-present`, `.gm-track-badge-missing`, `.gm-status-pill-slate` garantendo contrasto elevato sia per Dark Theme sia per Sunlight Light Mode (`[data-theme="light"]`).

---

## 3. Verifica e Risultati
- **Suite di Test Unitari e di Integrazione**:
  - `tests/core/logbook.test.mjs`: suite `hasAttachedTrack` con 8 casi limite (100% pass, 25/25 test).
  - `tests/ui/logbookView.test.mjs`: verifica rendering badge e comportamento dei filtri `with-track` e `no-track` (100% pass, 11/11 test).
  - Regressione globale: 789 test passati su 133 suite (`npm test`), 0 falliti.
- **Shift-Left Quality Gates**: Rispettati al 100% i 5 gate di qualità (Zero DOM in core, Zero emoji decorative, touch target $\ge 48\text{px}$, anti-truncation).
