# [2026-10-07] ADR: Headless Open-Meteo API Client & Meteorological Ingestion Engine

## Contesto & Motivazione
Il modulo legacy `C:\github\ParaMeteo\js\api.js` presentava un forte accoppiamento con l'oggetto globale `window`, `localStorage` (tramite `store.js`) e il DOM, impedendo l'esecuzione headless e il testing deterministico in ambienti Node.js puri. Inoltre, mancava un'astrazione modulare per la cache in memoria, rendendo le verifiche automatizzate dipendenti da chiamate di rete reali e vulnerabili a rate limit (HTTP 429) o fallimenti di copertura dei modelli regionali.

## Decisioni Architetturali
1. **Disaccoppiamento Assoluto Headless (`core/openMeteoApi.js`)**:
   - Zero dipendenze da `window`, `document`, `navigator` o `localStorage`.
   - Compatibilità 100% nativa con runtime Node.js (>=20) e browser moderni.
2. **Astrazione di Caching Pluggable (`InMemoryCache`)**:
   - Cache LRU in memoria con TTL configurabile (default 30 minuti), supporto stale-while-revalidate e serializzazione/deserializzazione JSON (`toJSON`/`fromJSON`).
   - Supporto per iniezione di adapter di persistenza personalizzati (es. `localStorage` o `IndexedDB` a livello UI).
3. **Resilienza Radio Outdoor & Rate Limiting**:
   - Esecuzione fetch con `AbortController` e timeout rigido (default 5000 ms) per prevenire blocchi su connessioni radio alpine instabili.
   - Retry con backoff esponenziale su risposte HTTP 429.
   - Fallback automatico da modelli regionali ad alta risoluzione (es. `arome_france`, `icon_d2`) verso `best_match` in caso di HTTP 400 (coordinate fuori dominio).
   - Fallback a cache stale marcata con flag `isStaleOfflineFallback: true` in caso di perdita totale di connettività.
4. **Generatore Sintetico Deterministico (`generateSyntheticWeather`)**:
   - Generatore deterministico del ciclo diurno di volo libero (calma mattutina, termiche e CAPE pomeridiani, restituzione serale) per testing disconnesso senza rete.
5. **Arricchimento Meteorologico Avanzato (`enrichWeatherData`)**:
   - Calcolo integrato di Eddy Dissipation Rate (EDR) per la turbolenza atmosferica, scaling convettivo di Deardorff per la salita termica, e inversione dei punti di rugiada per tutti i livelli isobarici (1000hPa - 500hPa).
6. **Geocoding & Reverse Geocoding Rate-Limited**:
   - Client per Open-Meteo Geocoding API (`searchLocations`) e Nominatim reverse geocode (`fetchReverseGeocode`) con coda temporale di 1 req/sec e cache dedicata.

## Impatto e Conseguenze
- Creato [core/openMeteoApi.js](file:///core/openMeteoApi.js) (client puro headless).
- Implementata suite [tests/core/openMeteoApi.test.mjs](file:///tests/core/openMeteoApi.test.mjs) con 25 unit test nativi passing (LRU, TTL, normalizzazione coordinate, URL builders, generazione sintetica, arricchimento termico/turbolenza, retry rate limit, fallback stale e geocoding).
- Suite totale del repository portata a 149 test unitari con 100% success rate e zero chiamate di rete esterne durante i test.
