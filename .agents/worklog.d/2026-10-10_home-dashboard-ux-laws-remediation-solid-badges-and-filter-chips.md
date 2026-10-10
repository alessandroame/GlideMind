# Scheda Intervento: Remediation Laws of UX Home Dashboard (Solid Badges, Filtro Volabilità & Explainability Multi-Rischio)

- **Data**: 2026-10-10
- **Modulo**: `core/comprensorio.js`, `ui/views/HomeDashboardView.js`, `css/theme.css`, `tests/`
- **Oggetto**: Attuazione integrale del piano di remediation a seguito dell'Audit Laws of UX condotto sullo screenshot della Home Dashboard. Introduzione di badge di stato a riempimento solido ad alto contrasto per visione in pieno sole (WCAG AA/AAA), chip di filtro rapido della volabilità (Hick's Law), risoluzione del mascheramento dei rischi multipli in domain Core (Tesler's Law) e de-enfatizzazione degli indicatori nominali (Von Restorff Effect).

---

## 1. Contesto & Diagnosi

Dall'audit euristico della vista Home Dashboard sono emerse tre criticità ergonomiche e di sicurezza:
1. **Mascheramento Multi-Rischio (Tesler's Law & NN/G #1)**: Quando un comprensorio presentava sia un decollo critico (es. raffiche forti) sia un atterraggio fuori cono (inefficienza di planata), la riga di explainability in basso riportava unicamente il decollo, mascherando il pericolo geometrico d'atterraggio.
2. **Bassa Leggibilità in Pieno Sole dei Badge di Stato (Outdoor HMI & WCAG)**: I badge `NON VOLABILE` e `CAUTELA` con bordi sottili e sfondo trasparente subivano decadimento di contrasto sotto luce zenitale e riverbero.
3. **Saturazione Cromatica ("Christmas Tree Effect")**: Gli stati nominali (`● In asse`, `● Rientro agevole`) brillavano di verde con neon glow, distraendo l'occhio dai veri segnali di pericolo (gialli/rossi/neri) e violando l'effetto Von Restorff.
4. **Scansione Lenta in Giornate Sfavorevoli (Hick's Law & Baymard)**: In condizioni meteo avverse, l'utente era costretto a scorrere decine di card rosse identiche senza possibilità di isolare a 1-tap i soli siti praticabili.

---

## 2. Soluzioni Architetturali & Conformità Shift-Left

1. **Risoluzione Multi-Rischio nel Core Headless (`core/comprensorio.js`)**:
   - Aggiornato `evaluateComprensorio`: se sia il decollo sia l'atterraggio presentano allerte (`selectedTakeoffEval.severity >= 2` o `= 1` e `!glideMetrics.isSafe`), la proprietà `reason` riporta entrambi i fattori (es. `Raffiche forti • Rientro fuori cono (1:9.5 > 1:7.0)`).
   - Zero dipendenze DOM, 100% testabile in Node.js puro (Gate 1 e 2).
2. **Badge di Stato a Simbolo Geometrico Avionico ad Alto Contrasto (`HomeDashboardView.js` & `css/theme.css`)**:
   - Sostituite le etichette di testo estese (`NON VOLABILE`, `CAUTELA`, `VOLABILE`) con badge compatti da $26\times 26\text{ px}$ contenenti simboli geometrici avionici conformi a WCAG 2.1 SC 1.4.1 (Use of Color):
     - `✓` (Verde smeraldo, contrasto 4.5:1 dark / 7.2:1 light): Volabile / Condizioni ottimali.
     - `▲` (Ambra solido, contrasto 4.6:1 dark / 7.5:1 light): Cautela / Condizioni marginali.
     - `✕` (Rosso rubino, contrasto 5.8:1 dark / 7.9:1 light): Non Volabile / Condizioni sfavorevoli.
     - `⚡` (Rosso/Nero scuro, contrasto > 6:1): Pericolo / Severe.
     - `○` (Neutro ardesia): Dati meteo non disponibili (N/D).
   - Risparmio di $\approx 75\text{ px}$ orizzontali nella testata della card a beneficio del nome del comprensorio.
   - Piena accessibilità e glanceability per piloti daltonici o con occhiali polarizzati tramite `aria-label` e `title` espliciti.
3. **Chip di Filtro Rapido Volabilità (`ui/views/HomeDashboardView.js` & `css/theme.css`)**:
   - Inseriti due chip ergonomici sotto la search bar: `Tutti (N)` e `Volabili / Cautela (M)`.
   - Touch target $\ge 36\text{px}$ visivo con area di tocco estesa e classe `.active` ad alto contrasto.
   - Stato `this.flyabilityFilter` ('all' | 'flyable') gestito in modo reattivo via event delegation (`handleClick`).
   - Empty state dedicato in caso di zero comprensori volabili con tasto rapido di reset.
4. **De-enfatizzazione degli Stati Nominali (Von Restorff Effect)**:
   - Rimosso `box-shadow` fluorescente da `.gm-ind-flyable .gm-ind-dot`.
   - Testo nominale impostato a `var(--gm-text-secondary)` (`font-weight: 500`), lasciando il massimo risalto cromatico unicamente agli stati marginali e di allerta.
5. **Ergonomia Tipografica delle Quote**:
   - Quota altimetrica decollo/atterraggio `.gm-flight-alt` aumentata a `0.78rem` (`var(--gm-font-mono)`), più leggibile a distanza di braccio sull'imbrago.

---

## 3. Verifica & Test di Governance

- Eseguiti test automatizzati completi con `npm test`: **358/358 test superati in 49 suite**.
- Aggiunti 3 test di regressione:
  1. `tests/core/comprensorio.test.mjs`: verifica del report multi-rischio su doppio pericolo decollo/atterraggio.
  2. `tests/ui/homeDashboardView.test.mjs`: verifica del rendering e funzionamento dei chip di filtro rapido (`Tutti` vs `Volabili / Cautela`).
  3. `tests/ui/homeDashboardView.test.mjs`: verifica dei token CSS per solid pill badges, chip e indicatori de-enfatizzati.
- Certificati tutti i 5 Gate del Protocollo di Qualità Shift-Left (`.agents/rules/shift_left_quality_gate.md`).
