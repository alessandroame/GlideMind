# Worklog: Integrazione Campetto Scuola Peter Pan (Torino) nel Catalogo Dati

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Contesto**: Censimento e integrazione nei dati applicativi dell'area didattica e campo scuola di ground handling della Scuola Parapendio Peter Pan a Torino Mirafiori.
- **Tipo**: Data Integration / Domain Modeling / Test Automation

---

## 1. Dati del Sito Integrato

- **Denominazione**: `Campetto Scuola Peter Pan (Torino - TO)`
- **Coordinate WGS84**: `45.009697, 7.626743`
- **Quota s.l.m.**: 240 m
- **Ubicazione**: Strada Castello di Mirafiori, Parco Sangone / Colonnetti, Torino (TO)
- **Funzione di Volo**: Addestramento a terra, controllo vela al suolo (ground handling), gonfiaggio fronte/rovescio ed esercitazioni didattiche della Scuola Parapendio Peter Pan (A.S.D. diretta da Guido Teppa).
- **Contatti Club**: Scuola Parapendio Peter Pan A.S.D., +39 347 2575423, info@scuolapeterpan.it, RRM 8-16 / 144.300 MHz.

---

## 2. Decisioni di Modellazione di Dominio

1. **Conformità all'Unico Binomio**:
   - Modellato come comprensorio autonomo con 1 decollo didattico/gonfiaggio e 1 atterraggio coincidente su superficie erbosa a quota 240 m.
   - Trattandosi di un campetto pianeggiante ($\Delta h \approx 0$), la formula aerodinamica di planata calcola $E_{\text{richiesta}} = 0$, validando la sicurezza del rientro a terra per vele scuola (EN-A).
2. **Consultazione Meteo Dedicata**:
   - Consente agli allievi e ai piloti di monitorare vento a 10m e raffiche per sessioni di kiting/ground handling a Torino direttamente da `HomeDashboardView` e `ForecastView`.
3. **Isolamento e Staging**:
   - Integrato sia nel catalogo di produzione `data/locations.json` (totale 135 comprensori) sia in `data/staging-locations.json` (totale 200 record).

---

## 3. Validazione Automatizzata

- Aggiunto unit test dedicato in `tests/core/comprensorio.test.mjs` per verificare la presenza nel catalogo, la corretta estrazione da parte di `normalizeLocationsCatalog` e la valutazione deterministica via `evaluateComprensorio`.
- Esecuzione completa della suite di test di sistema: **270/270 test superati** (`node --test`).
