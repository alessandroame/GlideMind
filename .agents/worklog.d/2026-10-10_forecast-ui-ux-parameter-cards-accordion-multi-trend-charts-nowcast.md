# Scheda Intervento: Riprogettazione UI/UX Previsioni (Schede Parametri a 4 Stati, Accordion con Consigli Pilota, Vista Multi-Grafico e Nowcast Integration)

- **Data**: 2026-10-10
- **Modulo**: `ui/views/ForecastView.js`, `css/theme.css`, `tests/ui/forecastView.test.mjs`
- **Oggetto**: Riprogettazione ergonomica e visuale completa della vista Previsioni (`ForecastView.js`) in conformità alle specifiche di dominio e ai requisiti utente: visualizzazione glanceable a colpo d'occhio di tutti i 7 parametri di volo con scala semaforica a 4 stati, espansione progressiva ad accordion con griglia analitica e consigli pratici di sicurezza per pilota principiante, grafici orari vettoriali SVG di tendenza (08:00-20:00) con marker orario sincronizzato, modalità alternativa "Solo Grafici" per monitorare l'evoluzione diurna simultanea di tutte le curve fisiche, selezione automatica nowcast dell'ora corrente locale per la data odierna, e bonifica della dicitura ingannevole "Live" nella testata delle previsioni numeriche.

---

## 1. Contesto & Diagnosi

1. **Eccessivo Carico Cognitivo & Visualizzazione Frammentata**:
   I dati previsionali erano ripartiti tra pannelli isolati (vento 360°, radiosondaggi isolati), costringendo il pilota a rimbalzare tra controlli diversi senza una visione d'insieme sintetica sui fattori critici per il parapendio (vento, raffiche, base cumulo, CAPE, turbolenza, insolazione, atterraggio).
2. **Assenza di Progressive Disclosure Omogenea**:
   Mancava un pattern coerente di svelamento progressivo: poter visualizzare istantaneamente lo stato qualitativo semaforico e toccare ciascun parametro per accedere all'approfondimento numerico, al consiglio operativo sul campo e al grafico orario di tendenza.
3. **Mancanza di una Vista Comparativa Multi-Grafico ("Solo Grafici")**:
   Per comprendere i cicli diurni (es. quando innescano le termiche, quando il vento rinforza, quando il rischio temporali/CAPE picca nel tardo pomeriggio), il pilota doveva commutare singolarmente i grafici; era necessaria una modalità per visualizzare a colpo d'occhio tutti i trend allineati sullo stesso asse temporale.
4. **Disallineamento Semantico Nowcast ("Live" vs Stazione Fisica)**:
   L'etichetta verde "• Live" collocata nella testata induceva il pilota a credere che esistesse una stazione anemometrica fisica reale attiva sul decollo, mentre si trattava di previsioni numeriche calcolate da modello (Open-Meteo). Inoltre, aprendo la data odierna ("Oggi"), la vista selezionava di default le 13:00 anziché posizionarsi immediatamente sull'ora locale corrente.

---

## 2. Soluzioni Architetturali & Conformità Shift-Left

1. **Modellazione dei 7 Parametri Aeronautici di Volo (`computeParamMetrics`)**:
   - `vento-decollo`: intensità media, direzione, scostamento dal pendio.
   - `raffiche`: raffica massima, delta termico/meccanico, fattore raffica e stabilità al suolo.
   - `base-cumulo`: quota base LCL, dislivello dal decollo, temperatura e rugiada al suolo.
   - `instabilita`: indice CAPE in J/kg, probabilità sovrasviluppi e rischio cumulonembi.
   - `turbolenza`: indice EDR / taglio del vento, tasso di salita termica stimato (m/s).
   - `copertura`: percentuale di copertura nuvolosa, radiazione solare/innesco pendio e precipitazioni.
   - `atterraggio`: brezza di valle e cono di planata di sicurezza decollo-atterraggio.
   - Indicatori semaforici standard a 4 stati (Verde / Favorevole, Giallo / Attenzione, Rosso / Non Favorevole, Nero / Pericoloso-Severe) conformi a WCAG AA/AAA.

2. **Accordion a Svelamento Progressivo con Consigli Operativi (`renderParameterCards`)**:
   - Header compatto con touch target $\ge 48\text{px}$, dot di stato, etichetta testuale di sicurezza e valore sintetico completo di unità di misura.
   - Sezione espandibile contenente:
     - Griglia CSS responsive a 2 colonne con i dettagli analitici fisici.
     - Callout box con consiglio operativo specifico formulato per piloti principianti ed EN-A (*Consiglio Pilota*).
     - Grafico vettoriale SVG della tendenza oraria (08:00 - 20:00) con linea di soglia e marcatore dell'ora attiva.
   - Per `vento-decollo` e `base-cumulo`, integrazione nativa con i grafici `renderWindChart` e `renderSoundingChart` garantendo retrocompatibilità totale con i test esistenti.

3. **Modalità Alternativa "Solo Grafici" (`renderMultiTrendCharts`)**:
   - Barra di commutazione dedicata in testata: `Schede` vs `Solo Grafici` (zero emoji decorative vietate).
   - Stack compatto di 6 card di tendenza oraria sincronizzate sul medesimo asse 08:00-20:00.
   - Cursore verticale coordinato sull'ora attiva `this.selectedHour` con visualizzazione istantanea del valore numerico.

4. **Nowcast Integration & Pulizia Header**:
   - Metodo `_resolveInitialHour(targetDate)`: se la data attiva è oggi, seleziona in automatico l'ora locale corrente (clamped 08..20); per date future mantiene le 13:00.
   - Rimosso il badge "• Live" ingannevole dalla testata del comprensorio quando la connessione Open-Meteo è attiva, riservando la segnalazione visiva unicamente agli stati di transito (`Aggiornamento...`) o assenza di rete (`Offline / Stima`).
   - Aggiornamento in-place di `#forecast-params-container` in `setHour(hour)` al trascinamento dello scrubber orario, con tempo di risposta $<50\text{ms}$ (soglia Doherty).

5. **Design System & Contrasto Sunlight Mode (`css/theme.css`)**:
   - Dichiarati token e stili per `.gm-forecast-mode-bar`, `.gm-param-card`, `.gm-param-header`, `.gm-param-status-dot`, `.gm-param-status-badge`, `.gm-param-body`, `.gm-param-details-grid`, `.gm-param-advice-box`, `.gm-multi-charts-container`, `.gm-trend-card`.
   - Contrasto WCAG 2.1 AA ($\ge 4.5:1$ per il testo, $\ge 3:1$ per indicatori grafici) verificato sia su Dark Cockpit sia su `[data-theme="light"]`.

---

## 3. Verifica & Test di Governance

- Eseguiti test automatizzati completi con `npm test`: **364/364 test superati in 49 suite** (0 fallimenti, 0 regressioni).
- Aggiunti 6 nuovi test unitari in `tests/ui/forecastView.test.mjs`:
  1. Verifica di `_resolveInitialHour`: auto-selezione ora reale per oggi e default 13:00 per date future.
  2. Verifica di rendering at-a-glance di tutte le 7 schede con scala colori a 4 stati.
  3. Verifica della presenza di griglia analitica, box consigli pilota e grafico all'interno della scheda espansa.
  4. Verifica del toggle dell'accordion su azione `toggle-param-card`.
  5. Verifica della commutazione tra modalità `Schede` e `Solo Grafici` con rendering dello stack multi-trend.
  6. Verifica dell'aggiornamento in-place del contenitore `#forecast-params-container` all'invocazione di `setHour`.
- Certificati tutti i 5 Gate del Protocollo di Qualità Shift-Left (`.agents/rules/shift_left_quality_gate.md`).
