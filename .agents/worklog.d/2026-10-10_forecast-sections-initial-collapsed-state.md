# Scheda Intervento: Inizializzazione Collassata delle Sezioni Parametri nelle Previsioni

- **Data**: 2026-10-10
- **Autore**: Alessandro Amé / Antigravity
- **Oggetto**: Configurazione dello stato iniziale collassato per tutte le sezioni ad accordion dei parametri di volo nella vista Previsioni (`ForecastView.js`), garantendo una panoramica a colpo d'occhio senza espansione forzata.

---

## 1. Contesto e Motivazione

Precedentemente, `ForecastViewController` inizializzava la proprietà locale `this.expandedCardId` con il valore `'vento-decollo'`, determinando l'apertura automatica del corpo della prima scheda (griglia analitica, consiglio pilota e grafico orario SVG). 
Sebbene utile per esplorare direttamente il vento, questo comportamento spingeva le restanti 6 schede parametriche (raffiche, base cumulo, instabilità CAPE, ecc.) al di sotto della piega dello schermo, impedendo al pilota di visualizzare immediatamente la totalità dei parametri al momento dell'ingresso nella vista.

L'utente ha esplicitamente richiesto che all'avvio tutte le sezioni partano chiuse/collassate.

---

## 2. Modifiche Chirurgiche Eseguite

1. **Stato Iniziale del Controller (`ui/views/ForecastView.js`)**:
   - Impostato `this.expandedCardId = null;` nel costruttore di `ForecastViewController`.
   - Nel metodo `mount(containerEl)`, forzato `this.expandedCardId = null;` per assicurare che a ogni navigazione verso la scheda Previsioni tutte le sezioni partano collassate.
   - Nella selezione di un nuovo comprensorio (`pick-spot` e `handleChange` su `#forecast-spot-select`), resettato `this.expandedCardId = null;` per offrire un quadro pulito e sintetico del nuovo sito di volo.

2. **Suite di Test di Regressione (`tests/ui/forecastView.test.mjs`)**:
   - Aggiornato il test `should render all 7 parameter cards at-a-glance with 4-state indicator scale` verificando che `controller.expandedCardId` sia `null` e che nessun elemento `gm-param-body` risulti presente nel markup generato al primo render.
   - Aggiornato il test `should toggle expandedCardId and accordion body on toggle-param-card action` verificando che lo stato di partenza sia `null` prima del toggle interattivo.

---

## 3. Verifica e Integrità

- **Esecuzione Test Suite**: `npm test` superato con 379/379 test positivi (51 suite), 0 fallimenti e 0 regressioni.
- **Accessibilità & UX**: Rispetta la legge di Prägnanz e Hick's Law, permettendo all'utente di esaminare i 7 parametri di volo a colpo d'occhio e svelare progressivamente i dettagli solo su richiesta esplicita.
