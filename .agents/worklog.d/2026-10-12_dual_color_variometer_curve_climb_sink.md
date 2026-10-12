# Colorazione Differenziata Salita / Discesa per la Curva Variometro

- **Data**: 2026-10-12
- **Ambito**: UI / UX, Telemetria di Volo, Grafica Vettoriale SVG, Avionica (`ui/views/FlightDetailSheet.js`, `css/theme.css`)
- **Autore**: Alessandro Amé (Pair programming con Antigravity)

---

## Contesto & Diagnosi

L'utente ha evidenziato che la curva del variometro visualizzata sul grafico altimetrico (`FlightDetailSheet.js`) era disegnata per intero con un unico colore verde smeraldo (`#10b981`), sia per i valori di salita termica/dinamica ($v > 0\text{ m/s}$) sia per i valori di sprofondamento e discesa planata ($v < 0\text{ m/s}$).
Tale uniformità cromatica costringeva il pilota a verificare manualmente la posizione della curva rispetto alla linea tratteggiata di zero, riducendo l'immediatezza visiva e discostandosi dagli standard della strumentazione avionica (XCSoar, SeeYou, Naviter).

---

## Interventi Eseguiti

1. **Partizionamento Dinamico con Calcolo Esatto del Punto di Zero-Crossing**:
   - In `generateExpandedSvgChart` (`FlightDetailSheet.js`), la serie campionata e smussata del variometro viene analizzata segmento per segmento.
   - Per ogni coppia di punti consecutivi che oltrepassa lo zero ($v_i$ e $v_{i+1}$ di segno opposto), viene calcolato l'istante e la coordinata geometrica esatta di intersezione con l'asse zero:
     $$t = \frac{|v_i|}{|v_i| + |v_{i+1}|}, \quad x_0 = x_i + t \cdot (x_{i+1} - x_i), \quad y_0 = varioZeroY$$
   - I punti vengono raggruppati in partizioni continue positive (salita, $v \ge 0$) e negative (discesa, $v < 0$), garantendo che le curve si congiungano perfettamente sull'asse senza buchi né sovrapposizioni.

2. **Differenziazione Cromatico-Vettoriale a Doppio Canale**:
   - **Salita ($v \ge 0$)**: Tratto vettoriale in verde smeraldo brillante (`stroke="#10b981"`, stroke-width: `1.8`) con riempimento semitrasparente verso la linea di zero (`fill="rgba(16, 185, 129, 0.16)"`, classe `.gm-vario-fill-climb`).
   - **Discesa ($v < 0$)**: Tratto vettoriale in rosso corallo (`stroke="#ef4444"`, stroke-width: `1.8`) con riempimento semitrasparente verso la linea di zero (`fill="rgba(239, 68, 68, 0.16)"`, classe `.gm-vario-fill-sink`).
   - **Asse di Riferimento 0 m/s**: Linea di datum neutra tratteggiata in grigio lavagna (`stroke="#64748b"`) con etichetta `0 m/s` in `#94a3b8`, separata nettamente dai colori della curva.

3. **Allineamento Design System, Dot Toolbar e Chip Legenda**:
   - In `css/theme.css`, aggiornato `.dot-vario` con gradiente diagonale bicolore a 135° (`linear-gradient(135deg, #10b981 50%, #ef4444 50%)`), comunicando visivamente al pilota la natura bivalente del canale (salita verde / discesa rossa).
   - Inserito nella barra della legenda `.gm-vario-legend-compact` il chip esplicito con indicatore bicolore `Vario: +Salita / -Discesa`.

---

## Verifiche e Collaudi

- **Unit & Integration Tests**:
  - `tests/ui/flightDetailSheet.test.mjs`: Test esteso con verifica deterministica della presenza congiunta di `#10b981` (salita) e `#ef4444` (discesa), unitamente ai selettori di classe `.gm-vario-stroke-climb` e `.gm-vario-stroke-sink`.
  - Suite complessiva: **696 test superati, 0 falliti, 1 saltato**.
- **Shift-Left Quality Gates**: Rispettati al 100% i vincoli di assenza di hex in style inline (Gate 2) e conformità contrasti (Gate 4).
