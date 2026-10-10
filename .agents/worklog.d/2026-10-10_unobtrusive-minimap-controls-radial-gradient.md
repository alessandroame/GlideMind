# Worklog: Comandi Mini Mappa Non Invasivi con Sfumatura Radiale

- **Data**: 2026-10-10
- **Autore**: AI Assistant (Antigravity)
- **Ambito**: Cartografia, Mini Mappa Previsioni, UI/UX, Design System, Ergonomia

---

## Contesto e Requisiti

L'utente ha evidenziato come i comandi sovraimpressi sulla mini-mappa della scheda previsioni (`ForecastView.js`) risultassero eccessivamente invasivi e coprenti rispetto al terreno montano e alle traiettorie di volo (come evidenziato nello screenshot fornito con pill e pulsante squadrato opachi e con bordi netti):
- Richiesta esplicita di rendere i comandi meno invasivi: testo essenziale per il layer cartografico ("scritta") e icona essenziale per l'ingrandimento a schermo intero ("icona").
- Adozione di una sfumatura radiale (radial gradient vignette) sottostante per garantire la massima leggibilità e contrasto (WCAG AA) senza creare blocchi o cornici rettangolari coprenti.

---

## Causa Radice

In precedenza, il selettore layer cartografico (`.gm-mini-map-layer-select`) e il pulsante di espansione a tutta mappa (`.gm-mini-map-expand-btn`) erano strutturati visivamente con:
1. Sfondo rigido semitrasparente (`rgba(15, 23, 42, 0.88)` / `0.78`) con filtro blur e ombreggiature marcate.
2. Bordi visibili netti (`border: 1px solid var(--gm-border)`).
3. Geometria a pillola e riquadro che occupava una porzione significativa degli angoli superiori della mappa (alta 180px), occludendo l'orografia e le creste montane.

---

## Interventi Implementati

### 1. Refactor Visivo con Sfumature Radiali (`css/theme.css`)
- **Selettore Layer (`.gm-mini-map-layer-select`)**:
  - Eliminato bordo (`border: none`) e ombra rettangolare (`box-shadow: none`).
  - Sostituito lo sfondo a blocco solido con un'ellisse a sfumatura radiale:
    `radial-gradient(ellipse at center, rgba(15, 23, 42, 0.76) 0%, rgba(15, 23, 42, 0.42) 55%, rgba(15, 23, 42, 0) 82%)`.
  - Integrata la freccia a chevron SVG coordinata nello stesso background multi-layer con posizionamento preciso.
  - Testo ad alto contrasto con doppio text-shadow e drop-shadow per risaltare su qualsiasi orografia (neve, roccia, boschi, pascoli).
  - Area touch minima conforme agli standard ergonomici outdoor ($\ge 40\text{px}$).
- **Pulsante di Espansione (`.gm-mini-map-expand-btn`)**:
  - Eliminati bordo squadrato e box-shadow.
  - Applicata sfumatura radiale circolare:
    `radial-gradient(circle at center, rgba(15, 23, 42, 0.76) 0%, rgba(15, 23, 42, 0.42) 55%, rgba(15, 23, 42, 0) 82%)`.
  - Icona SVG con drop-shadow morbido e transizione delicata di scala su `:hover` (1.1) e `:active` (0.95).
  - Pavimento tattile Fitts preservato a 44x44px con forma circolare.
- **Supporto Dual Theme (`[data-theme="light"]`)**:
  - Per i layer cartografici chiari (OpenTopo, CyclOSM): sfumatura radiale chiara a sfumare con testo/icona scuro ad alto contrasto.
  - Per i layer fotografici/scuri (Satellite, Scuro) selezionati in tema chiaro: mantenimento automatico della sfumatura radiale scura con testo bianco tramite selettore mirato `[data-map-layer="satellite"]` e `[data-map-layer="dark"]`.

### 2. Sostituzione Glifo Unicode con Icona SVG Vettoriale (`ForecastView.js`)
- Rimosso il glifo grezzo `⤢` (soggetto a rendering eterogeneo sui vari font/OS mobile) a favore di una composizione SVG vettoriale a 4 frecce diagonali pulita e centrata.
- Aggiunto l'attributo reattivo `data-map-layer="${activeLayer}"` su `#forecast-mini-map-container` mantenuto allineato sincronicamente sia al render che all'evento `change` del layer.

---

## Verifiche e Test

- Aggiunto test specifico in `tests/ui/forecastView.test.mjs` che certifica:
  - Presenza di `data-map-layer` sul container della mini-mappa.
  - Presenza dell'icona SVG vettoriale sull'expand button.
  - Assenza del glifo unicode grezzo `⤢`.
  - Presenza delle definizioni CSS con `radial-gradient` sia per `.gm-mini-map-layer-select` che per `.gm-mini-map-expand-btn`.
- Eseguito `npm test`: **403/403 test superati** su 58 suite.
