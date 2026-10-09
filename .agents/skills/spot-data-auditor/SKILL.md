---
name: spot-data-auditor
description: Use this skill when auditing, disambiguating, and validating paragliding spot clusters, flight hazards, and landing closures for the locations catalog.
---

# Spot Data Auditor Skill

Questo runbook operativo definisce il protocollo di audit semantico per convalidare i cluster grezzi di decolli e atterraggi generati da `scripts/geo-cluster-filter.mjs`.

---

## 1. Obiettivi e Ambito Operativo

L'agente non esegue calcoli trigonometrici (già convalidati nel Livello 1 geometrico). Il suo compito è analizzare i testi liberi e le annotazioni descrittive:
1. **Disambiguazione Toponimi**: Verificare che decolli vicini siano raggruppati sotto il comprensorio corretto.
2. **Estrazione Pericoli (`hazards`)**: Identificare cavi sospesi, elettrodotti, rotori da venti dominanti o brezze violente.
3. **Controllo Chiusure e Revoche**: Rilevare atterraggi dismessi, divieti stagionali (es. nidificazione o pascolo) o conflitti legali.
4. **Validazione Contatti Club**: Normalizzare frequenze radio (es. RRM 8-16 / 144.300 MHz) e telefoni navetta.

---

## 2. Flusso di Esecuzione (Runbook)

### Step 1: Ingestione Cluster Pre-Filtrati
Leggere il file generato dal pre-filtro geometrico:
```javascript
import fs from 'node:fs';
const clusters = JSON.parse(fs.readFileSync('data/raw-harvest/pre-filtered-clusters.json', 'utf-8'));
```

### Step 2: Audit Semantico & Assegnazione Flag
Per ogni candidato, valutare:
* Se `geometricReliability >= 75` e i testi non contengono segnalazioni di chiusura $\to$ `auditStatus: "APPROVED"`.
* Se emergono note di divieto, pericolo occulto non mappato o controversia sull'atterraggio $\to$ `auditStatus: "FLAGGED_FOR_HUMAN_REVIEW"`.
* Se l'atterraggio è esplicitamente chiuso o inagibile $\to$ declassare la volabilità e azzerare `reliability`.

### Step 3: Generazione Output Normalizzato
Formattare il record secondo lo schema di `data/locations.json`:
```json
{
  "location": "Nome Comprensorio (Comune - Provincia)",
  "description": "Descrizione asciutta con note di volo. [attendibilità XX%]",
  "club": {
    "name": "Nome Club",
    "radioFreq": "144.300 MHz / RRM 8-16",
    "shuttle": "Note navetta"
  },
  "takeoffs": [...],
  "landings": [...]
}
```

---

## 3. Criteri di Rigore e Anti-Allucinazione

* **Non inventare coordinate**: Mantenere inalterate le coordinate WGS84 validate da `geo-cluster-filter.mjs`.
* **Zero aggettivi promozionali**: Rispettare rigorosamente il protocollo di sobrietà ingegneristica (vietati termini come "paradiso del volo", "spot magico", "eccellenza assoluta").
* **Isolamento Staging**: Scrivere esclusivamente su `data/staging-locations.json`.
