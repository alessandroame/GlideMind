# Specifica Evolutiva: Fase 4-quater — Telemetria Centraline Meteo Fisiche in Diretta

## 1. Obiettivo Architetturale
Integrare nella vista `#gm-spot-live-page` di [`ui/views/ForecastView.js`](file:///c:/github/GlideMind/ui/views/ForecastView.js) le letture reali provenienti da centraline meteorologiche fisiche (anemometri di decollo e stazioni meteo di atterraggio/fondovalle), affiancandole al nowcasting modellistico di [`core/openMeteoApi.js`](file:///c:/github/GlideMind/core/openMeteoApi.js) (ICON-D2 / AROME) senza confondere i due livelli informativi.

---

## 2. Analisi e Selezione dei Provider API

| Provider / Rete | Ambito Orografico | Accesso & Autenticazione | Intervallo | Compatibilità PWA Client-Side (CORS) |
| :--- | :--- | :--- | :---: | :--- |
| **OpenWindMap (Windbird / Pioupiou / FFVL)** | Crinali e decolli alpini (Alpi occidentali, Svizzera, Nord Italia, Francia) | REST JSON pubblica (`api.pioupiou.fr/v1/live/`) — Keyless / Open Data | `1–4 min` | Nativa da browser (`CORS *`, zero API key) |
| **MeteoHub ItaliaMeteo / DPC & ARPA** | Stazioni ufficiali regionali in quota e fondovalle su tutto il territorio italiano | REST API Open Data (`meteohub.agenziaitaliameteo.it`) — Gratuita (CC-BY 4.0) | `10–15 min` | Interrogabile via HTTP REST pubblico |
| **Holfuy (`api.holfuy.com`)** | Rete primaria di anemometri sui decolli italiani ed europei di volo libero | REST JSON — Richiede API Key partner/club (opzionale in `SettingsView.js`) | `1–2 min` | Tramite API Key utente o link diretto stazione |
| **MeteoNetwork (`api.meteonetwork.it`)** | Oltre 1.000 stazioni calibrate (prevalenza pianura, collina e fondovalle) | REST JSON v3 — Gratuita con registrazione e Bearer Token | `5–10 min` | Richiede token utente |
| **AviationWeather METAR (`aviationweather.gov`)** | Aeroporti (riferimento QNH barometrico e vento sinottico di pianura) | REST JSON/GeoJSON NOAA — Keyless | `20–60 min` | Richiede verifica header CORS |

---

## 3. Vincoli di Sicurezza di Dominio (Guardia Orografica $\Delta z$)

1. **Divieto di Matching Spaziale Cieco (Solo 2D)**:
   - In ambiente montano una stazione in fondovalle (es. `300 m MSL`, in regime di brezza termica o inversione) può registrare vento opposto in direzione e intensità rispetto al decollo (`1.300 m MSL`).
   - È vietato associare automaticamente una centralina a un decollo basandosi unicamente sul raggio orizzontale Haversine.
2. **Criterio Geometrico Combinato ($d_{\text{2D}} + \Delta z$)**:
   - **Associazione a un Decollo (`role: 'takeoff'`)**: distanza orizzontale $d \le 3{,}0\text{ km}$ **E** scarto altimetrico $|\Delta z| \le 200\text{ m}$ rispetto alla quota del decollo.
   - **Associazione a un Atterraggio (`role: 'landing'`)**: distanza orizzontale $d \le 5{,}0\text{ km}$ **E** scarto altimetrico $|\Delta z| \le 150\text{ m}$ rispetto alla quota dell'atterraggio.
3. **Guardia di Freschezza del Dato (Staleness Guard)**:
   - Ogni lettura deve esporre chiaramente l'età del campionamento (`es. Rilevato 4 min fa`).
   - Se il timestamp dell'osservazione supera i `30 minuti`, il dato viene marcato come `Dato non aggiornato (Stale)` e non concorre ad attenuare gli avvisi di sicurezza del modello previsionale.
4. **Principio di Conservativismo (Novice Pilot Safety)**:
   - Se la centralina fisica rileva vento o raffiche superiori alla previsione modellistica, il semaforo operativo nella vista `Live` adotta il caso peggiore (`max(vento_modello, vento_centralina)`).
   - Se la centralina rileva vento calmo ma il modello prevede raffiche forti o foehn in quota, l'avviso meteorologico rimane attivo.

---

## 4. Architettura Tecnica Prevista

1. **Estensione Schema Catalogo Spot (`data/locations/*.json`)**:
   - Supporto per un campo opzionale `weatherStations` a livello di comprensorio o singolo sub-spot:
     ```json
     "weatherStations": [
       {
         "id": "wb-412",
         "provider": "openwindmap",
         "role": "takeoff",
         "name": "Balise Decollo Sud",
         "lat": 45.8214,
         "lon": 9.3102,
         "elevation": 1240,
         "externalUrl": "https://www.openwindmap.org/PP412"
       }
     ]
     ```
2. **Modulo Headless (`core/weatherStationsApi.js`)**:
   - 100% puro Node.js (zero dipendenze DOM), dotato di normalizzatore multi-provider (`normalizeStationObservation`), validatore geometrico (`matchStationsToComprensorio(spot, stations)`), cache in-memory con TTL breve (`120s`), circuit breaker e generatore di fixture deterministiche per i test offline (`?mock=1`).
3. **Integrazione UI in `ForecastView.js` (`#gm-spot-live-page`)**:
   - Sezione dedicata `Centraline Fisiche Rilevate` sopra o a fianco dei parametri modellistici, con indicazione di:
     - Nome stazione, provider, quota MSL e dislivello $\Delta z$ rispetto al punto selezionato.
     - Vento medio, raffica massima, direzione (gradi + cardinale) e delta rispetto alla previsione oraria Open-Meteo.
4. **Chiavi Opzionali in `SettingsView.js`**:
   - Possibilità per l'utente o per il club di configurare localmente (in `localStorage`) una API Key opzionale per provider autenticati (es. Holfuy / MeteoNetwork), mantenendo attivi di default i provider open-data keyless.
