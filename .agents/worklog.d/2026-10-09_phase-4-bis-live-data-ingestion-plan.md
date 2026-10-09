# Architectural Decision Record (ADR): Fase 4-bis - Live Weather Ingestion & Cache Sync

- **Data**: 2026-10-09
- **Stato**: Approvato / In Lavorazione
- **Contesto**: Richiesta utente di collegare dati reali Open-Meteo dietro l'interfaccia utente prima di completare i moduli cartografici complessi.

---

## 1. Contesto & Diagnosi

Nelle Fasi 3 e 4 dello sviluppo di GlideMind:
1. Il client di rete headless [core/openMeteoApi.js](file:///core/openMeteoApi.js) è stato implementato con supporto completo a chiamate HTTP verso `api.open-meteo.com`, cache LRU in memoria (TTL 30 min), arricchimento con turbolenza EDR, Deardorff thermal lift e 10 livelli isobarici di radiosondaggio (1000-500 hPa).
2. Per isolare il testing in Node.js ed evitare latenze e flicker durante lo scaffolding della UI, i controller [ui/views/ForecastView.js](file:///ui/views/ForecastView.js) e [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js) sono stati temporaneamente agganciati al generatore deterministico sincrono `generateSyntheticWeather`.
3. Di conseguenza, pur avendo il motore API già pronto, l'interfaccia eseguita nel browser mostra ancora dati simulati.

---

## 2. Decisione Architetturale: Fase 4-bis

Viene introdotta la **Fase 4-bis: Live Real Data Ingestion & Network Cache Sync (ForecastView & HomeDashboardView)** tra la Fase 4 (Previsioni) e la Fase 5 (Mappa Comprensori).

### Componenti dell'Intervento:
1. **Pattern Stale-While-Revalidate a 0ms**:
   - All'apertura della vista o al cambio data/comprensorio, la UI effettua un render immediato (0ms) attingendo alla cache in memoria o, in sua assenza, al generatore sintetico di fallback.
   - Contestualmente, se l'ambiente di runtime è il browser (`typeof window !== 'undefined'`), viene avviato in background `fetchWeatherData(coords, options)` verso l'endpoint reale di Open-Meteo.
2. **Aggiornamento Reattivo dello Store**:
   - Alla risoluzione della promessa di rete, il payload meteo arricchito viene salvato in `store.weatherData`.
   - Il controller intercetta l'aggiornamento via subscriber e riesegue il render con i dati reali misurati dai modelli (DWD ICON / ECMWF).
3. **Indicatore Discreto di Stato Rete**:
   - Badge nella testata superiore:
     - 🟢 *Live Open-Meteo (DWD ICON / ECMWF)* con indicazione dell'età del dato.
     - 🟡 *In aggiornamento...* (indicatore discreto non bloccante).
     - ⚪ *Offline / Stime* (in caso di mancata connessione o errore di rete).
4. **Isolamento Rigido dei Test**:
   - In ambiente Node.js (`typeof window === 'undefined'`), nessuna fetch di rete automatica viene eseguita, mantenendo i test istantanei, deterministici e funzionanti senza connessione internet.

---

## 3. Impatto sui File di Progetto

- [MASTER_PLAN.md](file:///MASTER_PLAN.md): inserita specifica di Fase 4-bis e allineato il piano di verifica.
- [DESIDERATA.md](file:///DESIDERATA.md): inserita riga Fase 4-bis in stato `🟡 In Lavorazione`; Fase 5 mantenuta in stato `⚪ Pianificato`.
- [MEMORY.md](file:///MEMORY.md): registrata Lezione #28 (*Pattern Stale-While-Revalidate e Disaccoppiamento Rete nei Controller UI*).
- Prossimi file da implementare:
  - [ui/views/ForecastView.js](file:///ui/views/ForecastView.js): integrazione background fetch asincrono.
  - [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js): sincronizzazione live spot primario.
  - [css/theme.css](file:///css/theme.css): micro-badge stato live/offline.
  - `tests/ui/liveWeatherIngestion.test.mjs`: suite di test di integrazione per il ciclo di vita asincrono.
