# Scheda di Intervento: Grafico Misto a Doppio Asse e Donut Chart SVG nelle Statistiche Logbook

- **Data**: 2026-10-10
- **Modulo**: `ui/views/LogbookStatsView.js`, `css/theme.css`, `tests/ui/logbookStatsView.test.mjs`, `tests/ui/logbookView.test.mjs`
- **Tipologia**: Visualizzazione Grafica Avanzata & Data Visualization Outdoor (Fase 6)
- **Stato**: Completato e verificato (Suite 87/87, 546/546 test superati)

---

## 1. Contesto e Motivazione
A valle della suddivisione della pagina Logbook e dell'introduzione dell'istogramma a barre, l'utente ha richiesto due affinamenti visuali di alto valore ergonomico:
1. **Grafico Misto Sovrapposto (Doppio Asse Y)**: Mostrare simultaneamente le ore di volo (istogramma a barre) e il numero di voli (linea con nodi marcati) lungo i 12 mesi solari, esattamente come nel cruscotto storico di ParaMeteo, eliminando la necessità di commutare manualmente tra le due metriche e permettendo di correlare a colpo d'occhio la durata media dei voli stagionali (es. pochi voli ma molte ore = voli di cross/termica; molti voli ma poche ore = scuola/top landing/acro).
2. **Grafici a Torta / Donut Chart per Decolli e Vele**: Sostituire il semplice elenco tabellare delle distribuzioni per decolli più frequentati e vele utilizzate con diagrammi a ciambella (Donut Chart) SVG, affiancati dal dettaglio graduato delle percentuali e dal foro centrale con il conteggio totale dei voli.

---

## 2. Decisioni Architetturali ed Ergonomiche

1. **Grafico Misto a Doppio Asse Y SVG (`viewBox="0 0 360 160"`)**:
   - **Asse Sinistro (Ore di Volo)**: Barre verticali ad alto contrasto con scala Y adattiva a sinistra (`maxHours`, linea mediana e fondo scala).
   - **Asse Destro (Numero Voli)**: Curva spezzata (`<polyline>`) in ciano/blu avionico (`#38bdf8`) con marcatori circolari sui mesi con voli (`<circle r="3.5">`) ed etichette numeriche in apice (`<text>${count}v</text>`) per lettura istantanea.
   - **Legenda Integrata nella Testata**: Swatch visivi distintivi (rettangolino per le barre delle ore, linea continua con cerchietto per il conteggio voli) conformi ai principi Gestalt di somiglianza e connessione.

2. **Donut Chart Matematiche SVG a Zero Dipendenze**:
   - Calcolo geometrico tramite `<circle>` con `stroke-dasharray` e `stroke-dashoffset` su raggio $r = 44$ (circonferenza $C = 2 \times \pi \times 44 \approx 276.46$) e rotazione iniziale di $-90^\circ$ (partenza a ore 12).
   - **Tavolozza Armonizzata ad Alto Contrasto**: 5 tinte principali calibrate per visibilità solare (`#f59e0b`, `#0ea5e9`, `#10b981`, `#a855f7`, `#ec4899`) più grigio ardesia (`#64748b`) per il settore cumulativo "Altri".
   - **Raggruppamento Top 5 + Altri**: Se il pilota ha volato in più di 5 siti o con più di 5 vele, i primi 5 vengono evidenziati individualmente e i restanti aggregati in un unico spicchio residuale, garantendo la chiusura a $360^\circ$ ($100\%$) senza sovraccarico visivo (Miller's Law $7 \pm 2$).
   - **Foro Centrale con KPI**: Mostra il numero totale di voli registrati al centro della ciambella.
   - **Lista Graduata Affiancata**: Bullet cromatici coordinati, nome con protezione anti-troncamento (`truncate`), conteggio voli, percentuale sul totale e micro-barra di riempimento orizzontale.

3. **Disaccoppiamento DOM & Zero Dipendenze Esterne**:
   - Rendering matematico puro in stringa HTML/SVG, eseguibile al 100% in Node.js a latenza $0\text{ms}$ e senza caricare librerie esterne da centinaia di kilobyte.
   - Compatibilità bidirezionale con i temi dark cockpit e sunlight light mode.

---

## 3. Impatto sui Test e Shift-Left
- Aggiornate le suite di test in `tests/ui/logbookStatsView.test.mjs` e `tests/ui/logbookView.test.mjs` per convalidare la presenza della polyline a doppio asse, la legenda sdoppiata e le due donut chart SVG.
- Verifica complessiva con `npm test`: tutte le 87 suite e tutti i 546 test superati al 100%.
