# Specifica Architetturale Comprensorio-Centrica (Località, Decolli e Atterraggi)

Questo documento definisce il vincolo strutturale obbligatorio per la rappresentazione, ricerca, memorizzazione e visualizzazione dei siti di volo in GlideMind.

---

## 1. Principio Fondamentale: Paradigma Comprensorio-Centrico

Per soddisfare le esigenze operative del volo ricreativo e locale (piloti non orientati al cross-country/XC):
1. **Entità Radice Indivisibile**: L'unità primaria dell'applicazione è la **Località** (Comprensorio di Volo), mai il singolo decollo decontestualizzato.
2. **Relazione Genitore-Figli (1 a N)**:
   - Una `Località` aggrega obbligatoriamente uno o più `Decolli` (`takeoffs: []`) e uno o più `Atterraggi` (`landings: []`).
   - I singoli decolli e atterraggi non possono esistere come entità orfane nello Store, nei motori di ricerca o nelle schermate applicative.

---

## 2. Inseparabilità Decollo - Atterraggio (Launch & Landing Inseparability)

È tassativamente vietato presentare all'utente la volabilità di un decollo senza contestualizzare lo stato dell'atterraggio associato:
1. **Analisi Pre-Volo a Due Vie**:
   - **Condizione di Involo (Decollo)**: intensità del vento in quota, raffiche, allineamento angolare $\Delta\theta$ rispetto all'azimut del pendio e turbolenza EDR.
   - **Condizione di Rientro (Atterraggio)**: intensità del vento a fondo valle, gradiente di brezza termica pomeridiana e presenza di rotori/ostacoli.
2. **Verdetto di Sicurezza di Comprensorio**:
   - Una località è considerata praticabile in sicurezza solo se **almeno un decollo** è favorevole E **l'atterraggio principale** è agibile (vento $< 20\text{ km/h}$, assenza di raffiche pericolose).

---

## 3. Gestione Preferiti (Pinned Locations)

1. **Il Preferito è la Località**:
   - Il salvataggio nei preferiti (`pinnedLocationIds`) memorizza l'ID della `Località` (es. `it-cornizzolo`), non il singolo decollo.
2. **Card nei Preferiti (Home Dashboard)**:
   - La card di una località preferita sintetizza:
     - Nome del comprensorio e quota massima.
     - **Miglior Decollo Attuale**: decollo con il punteggio di volabilità più alto nelle ore centrali della giornata.
     - **Stato Atterraggio Principale**: velocità e direzione del vento al suolo.
3. **Apertura del Preferito**:
   - Il tap sulla card apre la panoramica della località mostrando l'elenco tabellare o a schede di tutti i suoi decolli e atterraggi, consentendo al pilota di confrontare gli orientamenti.

---

## 4. Motore di Ricerca & Filtri (Discovery)

1. **Ricerca per Comprensorio**:
   - L'input di ricerca interroga nomi di comprensori, toponimi montani, comuni o regioni.
   - I risultati presentano la `Località` come testata, con i relativi decolli elencati come sotto-opzioni.
2. **Prossimità GPS**:
   - La distanza chilometrica viene calcolata rispetto al **baricentro della località** (`centroid: { lat, lon }`).

---

## 5. Vincoli di Stato nello Store (`core/store.js`)

Lo stato applicativo globale deve conformarsi alla seguente nomenclatura e struttura:

```javascript
// SCHEMA STATO AMMESSO
{
  selectedLocationId: "it-cornizzolo", // ID della località attiva
  activeTakeoffId: "cornizzolo-sud",    // Sotto-selezione opzionale per grafici dettagliati
  pinnedLocationIds: [                  // Array di ID di località preferite
    "it-cornizzolo",
    "it-bassano",
    "it-calascio"
  ]
}
```

- **Divieto**: È vietato utilizzare chiavi come `selectedSpot` o `pinnedSpots` contenenti stringhe di decolli isolati non riconducibili all'ID di comprensorio.

---

## 6. Anti-Pattern e Pratiche Vietate

- ❌ **Anti-Pattern "Decollo Orfano"**: mostrare una card o un pin che fa riferimento a un decollo senza che sia visibile a quale atterraggio si fa riferimento.
- ❌ **Anti-Pattern "Meteo a Quota Piatta"**: calcolare il meteo di un intero comprensorio montano a quota costante; decollo e atterraggio devono campionare i livelli barici o le quote orografiche reali.
- ❌ **Anti-Pattern "Navigazione Frammentata"**: costringere l'utente a cercare e salvare 3 volte lo stesso monte per avere il decollo Sud, Nord e Ovest.
