# Scheda Intervento: Rifattorizzazione Terminologica Sezione "Aerologia" in ForecastView

- **Data**: 2026-10-10
- **Autore**: Antigravity
- **Oggetto**: Sostituzione della dicitura "Parametri di Volo" con "Aerologia" nella testata della vista Previsioni (`ForecastView.js`) e sincronizzazione dei relativi descrittori ARIA e test di regressione.

---

## 1. Contesto e Diagnosi Critica

La testata della modalità schede/grafici in `ForecastView.js` riportava la dicitura generica `PARAMETRI DI VOLO`.
Sotto il profilo del dominio aeronautico del volo libero:
1. **Ambiguità di Dominio**: In avionica e volo libero, l'espressione "parametri di volo" afferisce tipicamente alla telemetria e cinematica del mezzo (velocità indicata IAS, velocità al suolo GS, variometro verticale, efficienza L/D, fattore di carico G). Le grandezze esposte nella vista (vento in decollo, raffiche, base cumulo LCL, gradiente termico, wind shear, copertura e convezione) afferiscono invece interamente alla fisica e allo stato della massa d'aria.
2. **Ingombro Orizzontale Outdoor**: L'etichetta convive nella stessa riga con il controllo segmentato `[ Schede | Solo Grafici ]`. "Aerologia" (9 caratteri) dimezza l'ingombro rispetto a "Parametri di Volo" (17 caratteri), garantendo margine anti-wrapping sui dispositivi mobile più compatti (< 380px).

---

## 2. Modifiche Apportate

1. **`ui/views/ForecastView.js`**:
   - Sostituita l'etichetta visiva `<span ...>Parametri di Volo</span>` con `<span ...>Aerologia</span>`.
   - Aggiornato l'attributo di accessibilità da `aria-label="Modalità di visualizzazione parametri"` a `aria-label="Modalità di visualizzazione aerologia"`.
2. **`tests/ui/forecastView.test.mjs`**:
   - Aggiunta asserzione di validazione semantica a garanzia della presenza dell'etichetta `Aerologia` e della totale assenza del testo legacy `Parametri di Volo`.

---

## 3. Verifica e Impatto

- Esecuzione suite test completa: 379 test superati con successo (60 test file / 51 suite).
