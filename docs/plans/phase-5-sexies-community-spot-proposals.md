# Piano Architetturale: Raccolta, Correzione Spot & Pipeline Ingestion Proposte Pilota

> **Fase**: Fase 5-sexies  
> **Stato**: ⚪ Pianificato (Community Spot Ingestion & Outdoor Form)  
> **Target Repo**: `GlideMind`  
> **Riferimenti Chiave**: [.agents/rules/comprensorio_locality_spec.md](file:///c:/github/GlideMind/.agents/rules/comprensorio_locality_spec.md), [.agents/rules/ui_layout_spec.md](file:///c:/github/GlideMind/.agents/rules/ui_layout_spec.md), [core/geoSpatialMath.js](file:///c:/github/GlideMind/core/geoSpatialMath.js), [scripts/shard-locations-catalog.mjs](file:///c:/github/GlideMind/scripts/shard-locations-catalog.mjs)

---

## 1. Visione di Dominio & Obiettivo Sobrio

Nel volo libero, i dati geografici e aerologici dei decolli e degli atterraggi evolvono continuamente: frequenze radio dei club aggiornate, nuove chiusure temporanee per pascolo o recinzioni, rettifiche di coordinate e quote barometriche, o inaugurazione di nuovi decolli comunali.

La Fase 5-sexies definisce l'architettura a due vie per la raccolta strutturata, la verifica e l'integrazione di questi dati:
1. **Lato Pilota sul Campo (Mobile Web HMI)**: Form ergonomico a bassissimo attrito per segnalare una correzione su uno spot esistente o censire un nuovo comprensorio completo, con rilevamento GPS a 1 tap, draft anti-perdita dati e link pubblici per immagini/foto. L'output è un payload JSON standardizzato (`GlideMindSpotProposal`).
2. **Lato Maintainer (Desktop Review Tooling)**: Uno strumento di revisione e validazione deterministica (`scripts/review-proposal.mjs`) che analizza la proposta, ne verifica la conformità geodetica e aerodinamica (dislivello positivo, efficienza di planata $E \le 7.0$ per vele scuola EN-A), evidenzia il diff rispetto ai dati esistenti e ne applica il merge nel catalogo sharded geografico.

---

## 2. Analisi di Contesto: Pilota Outdoor vs Maintainer

### 2.1 Il Pilota sul Campo
- **Contesto Operativo**: Luce solare diretta (high-glare), freddo, vento, batteria ridotta e dita con guanti.
- **Principi Ergonomici (Laws of UX & HMI Outdoor)**:
  - Touch target $\ge 48 \times 48\text{px}$ (Fitts's Law).
  - Contrasto elevato $\ge 4.5:1$ conforme al tema attivo (Cockpit o Sunlight).
  - Acquisizione coordinate GPS istantanea a 1 tap tramite `navigator.geolocation.getCurrentPosition`.
  - Salvaguardia automatica del draft in `localStorage` ad ogni carattere per azzerare perdite di dati su chiusura involontaria.
  - Zero upload di file pesanti: fotografie (bacheche, maniche a vento) fornite unicamente come URL pubblici accessibili (Google Photos, Imgur, cloud personale o sito club).
  - Canali di esportazione veloci: Web Share API (condivisione istantanea via Telegram/WhatsApp/Email), copia negli appunti o download JSON.

### 2.2 Il Maintainer
- **Esigenze di Integrità**:
  - Prevenzione assoluta di decolli orfani (ogni decollo deve avere almeno un atterraggio associato raggiungibile in sicurezza, come prescritto da `comprensorio_locality_spec.md`).
  - Prevenzione di coordinate errate o invertite (latitudine/longitudine) e quote incongruenti ($H_{\text{landing}} \ge H_{\text{takeoff}}$).
  - Rilevamento automatico di duplicati per prossimità spaziale ($< 500\text{m}$).
- **Diffing & Ingestion a 1 Comando**:
  - Lo strumento CLI deve mostrare le modifiche in forma tabellare/colorata e con il flag `--apply` aggiornare direttamente `data/locations/<country>.json`, rieseguendo lo sharding automatico.

---

## 3. Schema Formale del Payload JSON (`GlideMindSpotProposal`)

Il JSON generato dall'interfaccia deve conformarsi al seguente contratto di schema:

```json
{
  "$schema": "https://glidemind.app/schemas/spot-proposal-v1.json",
  "proposalId": "prop_20261010_142055_a8f9",
  "createdAt": "2026-10-10T14:20:55Z",
  "proposalType": "update_comprensorio", // "create_comprensorio" | "update_comprensorio"
  "targetLocationId": "monte-cornizzolo-suello-lc-lc", // null se "create_comprensorio"
  "contributor": {
    "callsign": "I-4821",
    "email": "pilot@example.com",
    "notes": "Corretta frequenza radio club e aggiunta nota sui rotori pomeridiani con vento da Est."
  },
  "data": {
    "name": "Monte Cornizzolo",
    "country": "IT",
    "region": "Lombardia",
    "province": "LC",
    "description": "...",
    "webcam": "https://www.cornizzolo.com/webcam/",
    "club": {
      "name": "Aero Club Monte Cornizzolo A.S.D.",
      "website": "https://www.cornizzolo.com",
      "phone": "+39 031 6878351",
      "radioFreq": "144.300 MHz / RRM 8-16",
      "shuttle": "Servizio navetta continuativo dall'atterraggio."
    },
    "takeoffs": [
      {
        "id": "monte-cornizzolo-suello-lc-lc-takeoff-1",
        "name": "Decollo Risparmio",
        "coordinates": "45.833265, 9.302084",
        "altitude": 1060,
        "heading": 170,
        "isPrimary": true,
        "description": "Decollo principale su prato inclinato con moquette.",
        "hazards": "Forte affollamento nei weekend.",
        "publicPhotos": [
          "https://photos.app.goo.gl/sample1"
        ]
      }
    ],
    "landings": [
      {
        "id": "monte-cornizzolo-suello-lc-lc-landing-1",
        "name": "Atterraggio Ufficiale Suello",
        "coordinates": "45.817209, 9.318668",
        "altitude": 260,
        "isPrimary": true,
        "isOfficial": true,
        "description": "Prato attrezzato di fronte al ristorante.",
        "hazards": "Brezza termica sostenuta nel pomeriggio.",
        "rules": "Vietato atterrare nei campi non falciati.",
        "publicPhotos": [
          "https://photos.app.goo.gl/sample2"
        ]
      }
    ]
  },
  "clientMetadata": {
    "appVersion": "1.4.0",
    "source": "mobile_web_hmi",
    "gpsAccuracyMeters": 4.5
  }
}
```

---

## 4. Architettura UX del Form (`SpotContributionView.js`)

### 4.1 Due Flussi Operativi Distinti
1. **Modalità "Segnala Correzione" (Update)**:
   - Accessibile direttamente dalla testata del comprensorio in `ForecastView` o `SpotMapView` tramite azione *"Suggerisci Correzione"*.
   - Precompila tutti i campi esistenti. L'utente modifica unicamente il campo errato (es. quota, radio o note sui pericoli).
   - Schermata unica a svelamento progressivo (nessun wizard superfluo).
2. **Modalità "Nuovo Comprensorio" (Create)**:
   - Accessibile dal menu Impostazioni o dalla Mappa.
   - Wizard guidato in 3 step:
     - **Step 1 (Identità Comprensorio)**: Nome località, Nazione, Regione, Sigla Provincia, Contatti Club (opzionali).
     - **Step 2 (Decollo Primario)**: Nome decollo, Pulsante GPS 1-tap, Quota, Esposizione pendio (gradi o freccia cardinale), Pericoli.
     - **Step 3 (Atterraggio Primario)**: Nome atterraggio, Pulsante GPS 1-tap, Quota, Regole di sorvolo e circuito.
     - **Step 4 (Verifica & Esportazione)**: Calcolo istantaneo locale di efficienza ($E = D / \Delta H$) con badge semaforico verde se $E \le 7.0$, generazione JSON e pulsanti di invio/condivisione.

### 4.2 Gestione Immagini e Foto
- Campi input dedicati `"Link Foto Decollo / Bacheca"` con validazione sintattica `https?://.+`.
- Istruzioni contestuali chiare: *"Inserisci un link pubblico condivisibile (es. Google Foto, Imgur, sito del club o cloud personale)"*.
- Nessuna manipolazione di file blob o storage server-side nell'applicazione.

---

## 5. Tooling di Revisione e Ingestion (`scripts/review-proposal.mjs`)

### 5.1 Pipeline di Validazione CLI
Lo script Node.js viene eseguito con:
```bash
node scripts/review-proposal.mjs path/to/proposal.json [--apply]
```

### 5.2 Controlli di Integrità Eseguiti
1. **Validazione Sintattica Schema**: Verifica campi obbligatori (`id`, `name`, `takeoffs`, `landings`, `coordinates`).
2. **Validazione Geodetica e Altimetrica (Headless Core)**:
   - Coordinate valide WGS84 ($[-90, 90]$, $[-180, 180]$).
   - $H_{\text{takeoff}} > H_{\text{landing}}$ (dislivello strettamente positivo).
   - Distanza Haversine compresa nell'inviluppo realistico di volo locale ($200\text{ m} \le D \le 12\text{ km}$).
   - Efficienza di planata $E = D / \Delta H \le 7.0$ (avviso critico se superiore a 7.0, blocco se $E > 10.0$).
3. **Controllo Duplicati / Prossimità**:
   - Confronto delle coordinate con tutti i decolli già censiti nel catalogo. Se un decollo si trova entro $500\text{ m}$, lo script evidenzia la sovrapposizione e suggerisce l'aggiornamento anziché la duplicazione.
4. **Diffing Visivo a Terminale**:
   - Stampa a colori con campi modificati, aggiunti o rimossi.
5. **Opzione di Applicazione Automatica (`--apply`)**:
   - Effettua il backup del file destinazione (`data/locations/<country>.json`).
   - Inserisce o aggiorna l'oggetto comprensorio.
   - Invoca [scripts/shard-locations-catalog.mjs](file:///c:/github/GlideMind/scripts/shard-locations-catalog.mjs) per rigenerare [data/locations-index.json](file:///c:/github/GlideMind/data/locations-index.json).
   - Riporta l'esito dell'operazione.

---

## 6. Pre-Delivery Gates & Verifiche

1. **Gate 1 (Zero Faux-Testing)**: Test automatici dello script di revisione con fixture di proposte valide, proposte con coordinate invertite e proposte con efficienza impossibile ($E > 12$).
2. **Gate 2 (Headless Core Purity)**: La logica di validazione delle proposte risiede in `core/spotProposalValidator.js` con zero dipendenze DOM, eseguibile ed importabile sia dal form client che dallo script CLI.
3. **Gate 3 (Touch Ergonomics)**: Test visuale su viewport mobile ($390 \times 844\text{px}$) del form di contribuzione, verificando assenza di scroll orizzontale e touch target $\ge 48\text{px}$.
