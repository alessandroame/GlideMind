---
name: comprensorio-evaluator
description: >-
  Use this skill when designing, implementing, querying, or evaluating paragliding flying sites
  (comprensori/località), aggregating multiple takeoffs and landings, evaluating dual launch-and-landing
  safety, or managing pinned locations.
---

# Comprensorio & Locality Evaluation Skill

## 1. Domain Model & Data Schemas

Ogni sito di volo in GlideMind è modellato come **Comprensorio / Località** (`FlyingSite`).
I decolli (`Takeoff`) e gli atterraggi (`Landing`) sono componenti strutturali subordinati al comprensorio.

### Schema JSDoc / TypeScript

```typescript
export interface Takeoff {
  id: string;               // Identificativo univoco (es. "cornizzolo-sud")
  name: string;             // Denominazione (es. "Decollo Sud - Caserte")
  altitude: number;         // Quota slm in metri (es. 1050)
  heading: number;          // Orientamento decollo in gradi [0, 360) (es. 180)
  cone?: [number, number];  // Settore angolare ammissibile (es. [150, 210])
  lat: number;              // Latitudine WGS84
  lon: number;              // Longitudine WGS84
  hazards?: string;         // Note di pericolo (es. "Cavi teleferica a sinistra")
  access?: string;          // Accessibilità (es. "Navetta da atterraggio")
}

export interface Landing {
  id: string;               // Identificativo univoco (es. "suello-atterraggio")
  name: string;             // Denominazione (es. "Atterraggio Ufficiale Suello")
  altitude: number;         // Quota fondo valle in metri (es. 280)
  lat: number;              // Latitudine WGS84
  lon: number;              // Longitudine WGS84
  isOfficial: boolean;      // Vero se atterraggio ufficiale del club
  hazards?: string;         // Note di pericolo (es. "Brezza pomeridiana > 25 km/h")
  rules?: string;           // Norme di circuito (es. "Circuito a sinistra obbligatorio")
}

export interface FlyingSite {
  id: string;               // ID canonico (es. "it-lombardia-cornizzolo")
  name: string;             // Nome comprensorio (es. "Monte Cornizzolo")
  region: string;           // Regione (es. "Lombardia")
  province: string;         // Sigla provincia (es. "LC")
  centroid: {
    lat: number;
    lon: number;
  };
  club?: {
    name: string;
    phone?: string;
    radioFreq?: string;     // Frequenza radio (es. "144.300 MHz")
    shuttle?: string;       // Servizio navetta
  };
  takeoffs: Takeoff[];      // Minimo 1 decollo
  landings: Landing[];      // Minimo 1 atterraggio
  reliability?: number;     // Indice affidabilità censimento (0-100%)
}
```

---

## 2. Algoritmo di Sintesi della Volabilità del Comprensorio

Per un pilota che non pratica cross-country, una località è fruibile se e solo se sussiste contemporaneamente la praticabilità di almeno un decollo e la sicurezza dell'atterraggio:

```
                  ┌───────────────────────────────┐
                  │ Meteo Comprensorio (T, W, P)  │
                  └──────────────┬────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
     ┌────────────────────────┐      ┌────────────────────────┐
     │  Valuta ogni Takeoff   │      │ Valuta Landing Primario│
     │  (flyability.js)       │      │ (vento al suolo, raffiche)
     └───────────┬────────────┘      └───────────┬────────────┘
                 │                               │
                 ▼                               ▼
       Miglior Decollo (T_best)         Sicurezza Atterraggio (L_safe)
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                     VERDETTO COMPRENSORIO
```

### Regole Decisionali

1. **Scelta del Miglior Decollo ($T_{\text{best}}$)**:
   - Tra tutti i decolli della località, calcolare l'indice di volabilità (`evaluateFlyability`) all'ora considerata.
   - Ordinare per severità decrescente: `GOOD` > `CALM_TRAINING` > `DEMANDING` > `WARNING` > `DANGER` > `NO_FLY`.
   - A parità di status, preferire il decollo con il minore scostamento angolare rispetto al vento:
     $$\Delta\theta = \min(|\text{windDir} - \text{heading}|, 360 - |\text{windDir} - \text{heading}|)$$

2. **Sicurezza Atterraggio ($L_{\text{safe}}$)**:
   - Se `windspeed_surface > 22 km/h` o `windgusts_surface > 30 km/h` $\implies$ **Allerta Brezza Atterraggio** (anche se il decollo è in condizioni perfette).
   - Se pioggia all'atterraggio $\implies$ **Chiusura Operativa**.

3. **Stato Sintetico Località**:
   - `OPEN`: $T_{\text{best}} \in \{\text{GOOD}, \text{CALM\_TRAINING}\}$ E $L_{\text{safe}} = \text{true}$.
   - `CAUTION`: $T_{\text{best}} = \text{DEMANDING}$ OPPURE Atterraggio con vento sostenuto ($16\text{-}22\text{ km/h}$).
   - `CLOSED`: Nessun decollo praticabile OPPURE $L_{\text{safe}} = \text{false}$.

---

## 3. Calcolo dell'Efficienza di Planata Richiesta ($E_{\text{richiesta}}$)

Per verificare se un decollo consente la planata fino all'atterraggio in sicurezza senza termica:

$$\Delta h = h_{\text{takeoff}} - h_{\text{landing}} \quad (\text{in metri})$$
$$D = \text{haversineDistance}(lat_T, lon_T, lat_L, lon_L) \quad (\text{in metri})$$
$$E_{\text{richiesta}} = \frac{D}{\Delta h}$$

- **Soglia Sicurezza**:
  - $E_{\text{richiesta}} \le 6.0$: **Fattibile in planata diretta** con ampio margine anche per vele scuola (EN-A).
  - $6.0 < E_{\text{richiesta}} \le 8.5$: **Attenzione**, margine ridotto controvento o con discendenza.
  - $E_{\text{richiesta}} > 8.5$: **Non raggiungibile in aria calma**; richiede galleggiamento termico o dinamica intermedia.

---

## 4. Interpolazione Meteo Multi-Quota

Non campionare il meteo a un'unica altitudine standard. Utilizzare i livelli di pressione Open-Meteo per assegnare il vento alla quota reale di ciascun elemento:

- **Decollo** ($h \ge 1000\text{ m}$): interpolare tra i livelli $925\text{ hPa}$ ($\approx 750\text{ m}$), $900\text{ hPa}$ ($\approx 1000\text{ m}$) e $850\text{ hPa}$ ($\approx 1500\text{ m}$).
- **Atterraggio** ($h \le 400\text{ m}$): utilizzare i dati a $10\text{ m}$ dalla superficie (`windspeed_10m`, `winddirection_10m`, `windgusts_10m`).

---

## 5. Pattern UI & Presentazione

1. **Card Preferiti (Home View)**:
   - Titolo: Nome Località (es. `Monte Cornizzolo`).
   - Badge Status: `Aperto (2/3 decolli volabili)` o `Chiuso (Vento forte)`.
   - Righe di Sintesi:
     - 🛫 Decollo consigliato con freccia vento e azimut.
     - 🛬 Vento atterraggio principale con intensità in km/h.
2. **Sheet / Vista Comprensorio**:
   - Tab o elenco dei decolli con confronto simultaneo dell'allineamento vento.
   - Scheda atterraggio con coordinate, quota e note operative del club.
