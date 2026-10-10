# Piano Architetturale: Zonizzazione Territoriale di Sicurezza & Vincoli Aeroclub

> **Fase**: Fase 5-quinquies  
> **Stato**: ⚪ Pianificato (Static Data Enrichment)  
> **Target Repo**: `GlideMind`  
> **Riferimenti Chiave**: Bacheche e regolamenti aeroclub reali (es. Parapendio Club Cavallaria Brosso/Lessolo), `data/locations/it.json`, `ui/map/mapEngineAdapter.js`

---

## 1. Visione di Dominio & Obiettivo Sobrio

Nel volo libero reale, ogni sito federato dispone di regole territoriali stringenti deliberate dai club gestori per garantire la sicurezza del pilota ed evitare contenziosi legali con la popolazione locale e gli agricoltori.

L'analisi sul campo delle bacheche ufficiali (es. Parapendio Club Cavallaria) evidenzia una zonizzazione standardizzata dell'atterraggio:
1. **Area di Atterraggio Autorizzata (Zona Verde)**: Perimetro fisico delimitato (paletti gialli, manica a vento e bersaglio di precisione).
2. **Zone Interdette (Zone Rosse)**: Proprietà private, campi coltivati e aree a rischio rotori in cui vige il divieto categorico di atterraggio.
3. **Zona Ripiegamento Vele (Zona Arancione)**: Area a monte o ai margini del campo per sgonfiare e piegare la vela senza creare ostacolo ai piloti in avvicinamento finale.
4. **Viabilità & Parcheggio (Zona Azzurra)**: Accessi carrabili e parcheggi regolamentati.
5. **Corridoio di Avvicinamento / Uscita in Valle**: Traiettoria naturale dal decollo all'atterraggio con rispetto di quote minime sopra i costoni intermedi (es. Casette, Felci a Cavallaria).

### Delimitazione dei Confini di Progetto (Anti-Scope Creep)
In aderenza all'ADR di rimozione del Syllabus Peter Pan (`MEMORY.md #21`), **GlideMind non implementa moduli di monitoraggio didattico scolastico né tracker di esercizi per allievi**.
La Fase 5-quinquies si concentra **esclusivamente sulla rappresentazione cartografica passiva dei vincoli geografici di sicurezza e dei limiti fisici del comprensorio**.

---

## 2. Modello Dati Territoriale (`data/locations/*.json`)

I poligoni e i punti notevoli vengono aggiunti direttamente nella struttura del comprensorio nel catalogo:

```json
{
  "id": "monte_cavallaria",
  "name": "Monte Cavallaria",
  "club": "Parapendio Club Cavallaria A.S.D.",
  "radioFrequency": "130.000 MHz",
  "safetyZoning": {
    "landingZone": {
      "touchdown": { "lat": 45.498300, "lon": 7.828300, "alt": 320 },
      "authorizedPolygon": [
        [45.49910, 7.82750],
        [45.49940, 7.82880],
        [45.49780, 7.82940],
        [45.49750, 7.82800]
      ],
      "forbiddenPolygons": [
        [
          [45.49960, 7.82900],
          [45.50020, 7.83050],
          [45.49850, 7.83100],
          [45.49800, 7.82960]
        ]
      ],
      "foldingAreaPolygon": [
        [45.49740, 7.82780],
        [45.49770, 7.82850],
        [45.49710, 7.82880],
        [45.49680, 7.82810]
      ]
    },
    "valleyCorridor": {
      "name": "Discesa Valchiusella verso Lessolo",
      "waypoints": [
        { "lat": 45.51345, "lon": 7.79690, "minAltMsl": 1380, "label": "Decollo Manifestazione" },
        { "lat": 45.50910, "lon": 7.80420, "minAltMsl": 1100, "label": "Sorvolo Dorsale Felci" },
        { "lat": 45.49830, "lon": 7.82830, "minAltMsl": 320, "label": "Atterraggio Lessolo" }
      ]
    },
    "hazards": [
      {
        "type": "power_line",
        "description": "Elettrodotto media tensione a Sud-Est del campo",
        "coordinates": [ [45.4965, 7.8290], [45.4970, 7.8320] ]
      }
    ]
  }
}
```

---

## 3. Render Cartografico in `ui/map/mapEngineAdapter.js`

L'overlay a schermo intero `ForecastView.js` (`renderComprensorioFlightMap`) include il layer opzionale dei vincoli di comprensorio:
- **Verde chiaro con bordo solido (`#15803d`)**: Area autorizzata di atterraggio.
- **Rosso semitrasparente con tratteggio (`#b91c1c`)**: Zone vietate con label di avviso.
- **Arancione (`#d97706`)**: Area piegaggio vele.
- **Zero interferenza con la cartografia**: Poligoni discreti a opacità 0.25 con bordi a 1px, disattivabili tramite toggle `[Vincoli Club]` nell'header dell'overlay.

---

## 4. Priorità di Rilascio

Questa fase consiste nell'arricchimento dei dati geografici e nella visualizzazione passiva di poligoni esistenti in Leaflet.  
**Non richiede lo sviluppo di un editor CAD**, preservando la precedenza primaria per la **Fase 6 (Flight Logbook)** e la **Fase 7 (Replay 3D)**.
