---
name: outdoor-hmi-touch
description: >-
  Use this skill when designing, reviewing, or implementing touch UI components,
  mobile layouts, and high-glare outdoor paragliding interfaces.
---

# Standard Ergonomici per Interfaccia Touch e Uso all'Aperto (Outdoor HMI)

## 1. Vincoli Operativi del Pilota all'Aperto
I piloti utilizzano GlideMind principalmente all'aperto: sui decolli sotto luce solare diretta, con guanti da volo o dita fredde, o con lo smartphone montato sulla plancia porta-strumenti dell'imbrago:
- **Target di Tocco Minimi ($\ge 44 \times 44\text{ px}$)**: Target inferiori a 44px provocano tocchi mancati o errati con i guanti (target raccomandato $48\text{px}$).
- **Divieto di Griglie di Pulsanti Multiriga**: Raggruppare decine di bottoni con `flex-wrap: wrap` crea muri verticali che spingono le informazioni utili fuori schermo.
- **Divieto di Modali con Scorrimento Interno Bloccato**: Finestre popup ad altezza fissa con scroll interno su schermi stretti (390px) intrappolano i gesti. Utilizzare drawer o fogli ancorati a tutta altezza (`SheetManager`).
- **Leggibilità alla Luce Solare**: Contrasti elevati (conformi a WCAG AA/AAA) con sfondi scuri antiriflesso o temi chiari ad alto contrasto.

---

## 2. Regole Ergonomiche Fondamentali

### Regola 1: Caroselli Orizzontali a Riga Singola (`touch-action: pan-x`)
Per selettori di date, filtri o elenchi di decolli preferiti:
- Non usare wrapping verticale (`flex-wrap: wrap`) per più di 4 elementi.
- Usare scorrimento orizzontale nativo con scroll-snap:
  ```css
  .gm-carousel {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x;
    gap: 8px;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .gm-carousel::-webkit-scrollbar {
    display: none;
  }
  .gm-carousel-card {
    scroll-snap-align: start;
    flex-shrink: 0;
  }
  ```

### Regola 2: Dimensioni Minime e Spaziatura dei Target (Legge di Fitts)
- Qualsiasi elemento interattivo (pulsante, link, tab, checkbox) DEVE avere un'area cliccabile effettiva di almeno **$44 \times 44\text{ px}$**.
- Se il testo visivo è piccolo (badge $12\text{px}$), applicare padding trasparente o pseudo-elemento `::before` per estendere l'area di tocco.

### Regola 3: Dimensionamento Viewport Mobile (390px / 100dvh)
- Utilizzare unità `100dvh` per evitare problemi di mascheramento da parte delle barre di navigazione di iOS Safari o Chrome Mobile.
- Le informazioni prioritarie (stato volabilità, vento, parametri critici) devono rientrare nella prima schermata senza richiedere scorrimento immediato.

### Regola 4: Feedback Visivo Reattivo (Latenza < 100ms / Doherty Threshold < 400ms)
- Ogni pressione di controllo deve dare feedback immediato (`:active`).
- Gli indicatori di stato (Volabile, Attenzione, Non Volabile) devono combinare **Colore + Testo + Icona funzionale** (mai solo colore, per accessibilità e riflessi).

### Regola 5: Sobrietà Visiva ed Essenzialità dei Controlli
- **Nessuna Icona Decorativa nei Titoli**: Vietato inserire icone superflue prima di testi già espliciti (es. no icone prima di "Volabilità", "Dati Meteo", "Impostazioni").
- **Icone Riservate a Controlli Funzionali**:
  - Pulsanti compatti (chiudi `X`, preferiti, impostazioni) dotati di `aria-label`.
  - Indicatori di stato di sicurezza (Verde/Giallo/Rosso).
- **Testi e Microcopy Essenziali**:
  - Usare testi brevi, tecnici e non enfatici.
  - Banditi superlativi, testi promozionali e gergo pseudo-tattico o militaresco ("mappa tattica", "cruscotto aerodinamico", "radar", ecc.).

### Regola 6: Prevenzione Blocchi di Scorrimento su Canvas e Mappe
- I canvas di grafici telemetrici e le mappe MapLibre devono definire esplicitamente la modalità touch:
  - Grafici 2D con scrubbing: `touch-action: pan-y` (permettere lo scroll verticale della pagina se l'utente non sta facendo scrub orizzontale).
  - Mappe interattive: modalità a due dita (*cooperative gestures*) o tasto esplicito di ingaggio/disingaggio della cartografia, per evitare che lo swipe verticale dell'utente resti intrappolato nel pan della mappa.
