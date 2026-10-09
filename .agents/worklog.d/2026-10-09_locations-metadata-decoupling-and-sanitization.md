# Worklog: Decoupling Metadati di Attendibilità e Bonifica Testuale Catalogo

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Contesto**: Risoluzione dell'inquinamento del testo descrittivo destinato all'utente provocato dalla presenza di tag tecnici tipo `[attendibilità XX%]` in `data/locations.json` e `data/staging-locations.json`.
- **Tipo**: Refactoring / Data Quality / Outdoor HMI / Architettura

---

## 1. Problema Riscontrato & Causa Radice

Nelle descrizioni di comprensori, decolli, atterraggi e navette figuravano stringhe come:
- `"description": "Decollo spettacolare erboso esposto a Sud con visuale mozzafiato. [attendibilità 94%]"`
- `"shuttle": "Auto propria su strada asfaltata per Rocca Calascio da Santo Stefano di Sessanio. [attendibilità 94%]"`
- `"hazards": "Volo d'alta montagna; attenzione alle raffiche pomeridiane. [attendibilità 85%]"`

Questa commistione:
1. Inquinava visivamente l'interfaccia utente (Outdoor HMI) con metadati e parentesi quadre non destinati al pilota.
2. Impediva l'interrogabilità numerica dell'attendibilità per filtri o ordinamenti geospaziali.

---

## 2. Azioni Eseguite

1. **Funzione Pura di Sanificazione (`core/comprensorio.js`)**:
   - Implementata `cleanUserText(text)` per rimuovere deterministicamente qualsiasi variante di `[attendibilità XX%]` e ripulire gli spazi/punteggiatura residui.
   - Aggiornata `normalizeLocationsCatalog` per applicare `cleanUserText` su `description`, `hazards`, `rules` e `shuttle`, preservando `reliability: number` come campo numerico strutturato.
2. **Aggiornamento Pipeline Builder (`scripts/build-locations-catalog.mjs`)**:
   - Rimossa la concatenazione automatica di `[attendibilità ${reliability}%]` dalle descrizioni generate.
   - I dati generati risiedono esclusivamente nel campo numerico `reliability`.
3. **Script di Bonifica Dati (`scripts/sanitize-locations-metadata.mjs`)**:
   - Creato script riutilizzabile che estrae il valore percentuale in `reliability` numerico e bonifica il testo in place.
   - Bonificati **780 tag** in `data/locations.json` (134 comprensori).
   - Bonificati **640 tag** in `data/staging-locations.json` (199 comprensori).
4. **Verifica Automatizzata (`tests/core/comprensorio.test.mjs`)**:
   - Aggiunti unit test per `cleanUserText` e per la normalizzazione strutturata.
   - Totale test superati: **265/265** (`node --test`).
