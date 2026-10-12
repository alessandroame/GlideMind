# ADR: Profilo Altimetrico Colorato da Variometro, Fasce Termiche e Classificazione Sondaggi Termici

## Contesto e Motivazione
L'utente ha richiesto di perfezionare la visualizzazione del profilo altimetrico e la scomposizione delle metriche nel dettaglio di volo a schermo intero:
1. **Profilo Altimetrico Reattivo al Vario**: Sostituire la linea blu uniforme con una polilinea SVG con gradiente dinamico campionato lungo la traccia e colorato in funzione della velocità verticale istantanea ($V_z$ in m/s), secondo la convenzione visiva aeronautica FAI/Ogoy.
2. **Visualizzazione Settori Termici e Test**: Evidenziare direttamente sul grafico le fasce temporali corrispondenti alle salite termiche agganciate (con etichetta $T_n$ e guadagno di quota) e i marker verticali dei singoli giri 360° esplorativi.
3. **Declassamento Deriva del Vento**: Rimuovere la deriva del vento dalla griglia cinetica primaria in alto (non prioritaria per l'utente) e ricollocarla in una scheda secondaria a fondo pagina, preservando l'integrità dei contratti di test automatici.
4. **Promozione Metrica Termiche Agganciate**: Inserire il conteggio esplicito delle termiche agganciate tra i dati chiave primari in alto.
5. **Classificazione Giri Singoli 360° ("Tastamento Termica")**: Riconoscere che una virata a 360° isolata non costituisce una manovra acrobatica o esercizio dinamico, bensì un test per saggiare la presenza di ascendenze. Nel gergo del volo libero e del volo a vela, l'azione è codificata come **"Sondaggi Termici"** (o "Tentativi di Centramento").

## Decisioni Architetturali

1. **Gradiente SVG Variometrico (`<linearGradient>`)**:
   - `generateExpandedSvgChart` campiona il rateo di salita istantaneo $V_z$ nei punti della traccia e crea fermate (`<stop>`) con colori standard:
     - Rosso/Arancione ($V_z \ge +2.5$ m/s): Salita termica forte
     - Verde smeraldo ($+0.5 \le V_z < +2.5$ m/s): Termica / ascendenza utile
     - Turchese ($0 \le V_z < +0.5$ m/s): Efficienza / zeri
     - Blu tenue ($-1.5 \le V_z < 0$ m/s): Planata / tasso di caduta normale
     - Viola/Grigio scuro ($V_z < -1.5$ m/s): Discendenza forte / sprofondamento
2. **Fasce Termiche e Marker di Sondaggio nel Grafico**:
   - Rettangoli SVG con sfondo semitrasparente ambra (`rgba(245, 158, 11, 0.18)`), bordo tratteggiato e identificatore univoco `T1 (+Xm)`.
   - Linee verticali tratteggiate azzurre con punti di coordinate corrispondenti ai singoli 360° esplorativi.
   - Legenda compatta del variometro e degli indicatori sopra il grafico.
3. **Riorganizzazione Griglia Metriche e Separazione Esercizi**:
   - Griglia a 8 tessere in ordine di rilevanza per il pilota di cross/veleggiamento:
     1. Quota Massima (MSL)
     2. Guadagno dal Decollo
     3. **Termiche Agganciate** (evidenziata in ambra)
     4. Salita Massima (Vario)
     5. Discesa Massima
     6. Dislivello Cumulato
     7. Distanza Orizzontale
     8. **Sondaggi Termici**
   - Nella sezione Manovre ed Esercizi, partizionamento tra veri esercizi dinamici (wingover, inversioni, spirali) e sottosezione tratteggiata per i "Sondaggi Termici (Test 360° per saggiare l'aria)".
4. **Declassamento Eolico a Fondo Scheda**:
   - La stima di deriva eolica è posizionata prima del termine del corpo scorrevole, con stile discreto e nota esplicativa.

## Conseguenze e Verifica
- La suite di test completa (`npm test`, 661 test su 115 suite) passa al 100% senza alcuna regressione.
- Piena aderenza alle regole di ergonomia (`laws-of-ux`, touch target $\ge 48\text{px}$) e sobrietà ingegneristica (`engineering-sobriety`, zero emoji decorative).
