# Scheda Intervento: Refactoring Indicatori Semantici di Volabilità a 4 Stati & Layout Anti-Truncation (Home Dashboard)

- **Data**: 2026-10-10
- **Modulo**: `core/comprensorio.js`, `ui/views/HomeDashboardView.js`, `css/theme.css`, `tests/`
- **Oggetto**: Transizione da numeri grezzi primari (km/h, gradi, rapporto di planata 1:X) a indicatori semantici qualitativi a 4 stati (verde, giallo, rosso, nero) calcolati deterministicamente in base alla vela attiva (`activeGlider`) nel Core. Bonifica radicale del layout flexbox: eliminazione di capsule/badge pesanti con sfondi e bordi in favore di indicatori semaforici minimali (`● Stato`), azzeramento del troncamento dei nomi dei decolli (`↗ Ciavanis (1780m)`) e progressive disclosure dei numeri in tooltip e schermi ampi.

---

## 1. Contesto & Diagnosi del Problema
L'analisi ergonomica e di dominio della sezione volabilità nella Home Dashboard ha evidenziato tre criticità:
1. **Dissonanza Cognitiva & Low-Wind Fallacy**: Valori medi bassi esposti in grassetto primario (es. 2 km/h o 7 km/h) trasmettevano un'impressione di sicurezza in contrasto con il badge `NON VOLABILE` causato da raffiche o direzione incompatibile.
2. **Orientation Blindness**: Mostrare gradi bussola puri (es. `da SW (212°)`) richiedeva al pilota di ricordare l'azimut di ogni singolo pendio e calcolare mentalmente l'allineamento.
3. **Efficienza Geometrica Disaccoppiata dalla Vela**: Il rapporto geometrico dislivello/distanza (es. `1:2.5` o `1:7.1`) non esplicitava se il rientro fosse sicuro, marginale o proibitivo per l'ala in uso (EN-A vs EN-D).
4. **Layout Starvation & Troncamento Critico del Nome Decollo**: L'inserimento iniziale di pill badge con sfondi colorati, bordi e numeri lunghi (`[● Vento OK 15 km/h] [● In asse da SW (212°)]`) occupava oltre 240px su card smartphone da 340px, affamando il contenitore di sinistra e troncando visivamente i nomi dei decolli (es. `Ciavanis` ridotto a `(1780`).

---

## 2. Decisioni Architetturali (SSOT, Laws of UX & Progressive Disclosure)
1. **Centralizzazione Assoluta nel Core (`core/comprensorio.js`)**:
   - `calculateGlideToLanding` valuta la severità a 4 livelli (0=Verde, 1=Giallo, 2=Rosso, 3=Nero) confrontando il rapporto richiesto con la soglia `safeLimit` dinamica della vela attiva (EN-A: 5.5, EN-B: 6.5, EN-C: 7.5, EN-D: 8.5).
   - `evaluateComprensorio` espone un oggetto strutturato `indicators: { wind, direction, glide }` contenente severità, label concise (`formatShortWindLabel`, `formatShortDirLabel`), testo esteso e micro-dati numerici.
   - Risoluzione deterministica dell'indice orario tramite prefisso esatto `YYYY-MM-DDTHH:` a supporto di payload meteorologici parziali.
2. **Design System Semaforico Senza Riquadri (Legge di Prägnanz & Anti-Overload)**:
   - Eliminati sfondi colorati e bordi dalle capsule (`.gm-ind-pill { background: transparent; border: none; padding: 0; }`).
   - Gli indicatori consistono unicamente in un dot circolare semaforico da 6.5px (`.gm-ind-dot`) con bagliore cromatico coerente allo stato e label testuale nitida (`0.72rem`, `font-weight: 600`):
     - **0 (Verde / Volabile)**: `● Vento OK`, `● In asse`, `● Rientro agevole`.
     - **1 (Giallo / Cautela)**: `● Sostenuto`/`● Raffiche mod.`, `● Traverso`, `● Nel cono`.
     - **2 (Rosso / Non Volabile)**: `● Vento forte`/`● Raffiche forti`, `● In coda`, `● Rientro critico`.
     - **3 (Nero / Pericoloso / NO FLY)**: `● NO FLY`, `● Sottovento`, `● Fuori cono`. (In dark mode: dot nero con anello di pericolo `1.5px solid #ef4444`).
3. **Progressive Disclosure dei Dati Numerici**:
   - I valori numerici grezzi (`15 km/h`, `da SW (212°)`, `1:2.5`) sono rimossi dalla vista primaria mobile e risiedono nei tooltip `title` per l'ispezione al tocco/hover.
   - La classe `.gm-ind-micro` adotta `display: none;` su mobile (`<768px`) ed è visibile solo su viewport desktop larghi (`>=768px`).
   - La label `.gm-glide-label` è nascosta visivamente nella triage card (`display: none;`), mantenendo la parola "Efficienza" per gli screen reader e i test di accessibilità.
4. **Protezione Layout Flexbox Anti-Truncation**:
   - `.gm-flight-label` configurato con `min-width: 0; flex: 1 1 auto;`.
   - `.gm-flight-target` configurato con `min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis;`.
   - `.gm-flight-alt` configurato con `flex-shrink: 0;`.
   - L'ingombro degli indicatori a destra è ridotto a $\le 110\text{px}$, lasciando oltre 180px di larghezza utile per i nomi di decollo e atterraggio, eliminando categoricamente qualsiasi troncamento.

---

## 3. Impatto e Verifica
- **Test di Unità & Integrazione**:
  - `tests/core/comprensorio.test.mjs`: testata la variazione delle severità di planata e dei testi al variare della classe di omologazione (EN-A vs EN-D) e la formattazione dei label.
  - `tests/ui/offlineWeatherUX.test.mjs`: verificato che al cambio di vela nello store (`activeGlider: GLIDER_CLASSES.EN_A` vs `GLIDER_CLASSES.EN_D`), la Home Dashboard aggiorni deterministicamente le classi di severità (es. da Rosso a Giallo per vento forte ma gestibile con ala ad alta penetrazione).
  - Aggiunti controlli di regressione CSS per validare `background: transparent; border: none;`, la presenza dei dot a 4 stati, `display: none` per micro-numeri su mobile e la salvaguardia flexbox anti-troncamento.
  - `tests/ui/fieldView.test.mjs`: validata la compatibilità con `eval.status` e la risoluzione esatta dell'ora di nowcasting.
- **Test Suite**: 353/353 test superati con successo in 49 suite (`npm test`).
