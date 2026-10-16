# Specifica di Revisione: Sicurezza Aerodinamica e Prospettiva Pilota Base (Novice Pilot Spec)

Questo documento formalizza i requisiti operativi, i vincoli di sicurezza e la disciplina di invocazione per esaminare GlideMind attraverso la lente di un pilota principiante o in ripresa d'attività (vela entry-level con $V_{\text{trim}} \approx 36\text{ km/h}$, $L/D \approx 7.8$).

---

## 1. Principio Fondamentale: Proxy Aerodinamico della Vela & Prudenza Pilota Opt-In

1. **Divieto di Selettore Soggettivo 'Livello Pilota' e Rimozione Badge Burocratici `EN-A..D` in UI**:
   - L'applicazione non include dropdown soggettivi "principiante/esperto" e **non espone etichette normative `EN-A..D` nella UI o nei debriefing** (`NOTE-004`), poiché oscurano le reali prestazioni fisiche dell'ala.
   - Tutte le viste e i debriefing espongono direttamente i parametri fisici reali dell'ala attiva (`activeGlider`): velocità di trim $V_{\text{trim}}$, velocità massima $V_{\text{max}}$ ed efficienza di planata $L/D$.
2. **Invarianza dei Limiti Fisici ($V_{\text{trim}}$) e Fattore Prudenza Pilota (`usePilotCurrencyFactor`)**:
   - I parametri fisici della vela attiva determinano in modo invariante i limiti aerodinamici di penetrazione (`windRed`, `windNoFly`) e il cono di planata (`safeLimit`). Per un'ala scuola ($V_{\text{trim}} \approx 36\text{ km/h}$), un vento di $20\text{ km/h}$ lascia appena $16\text{ km/h}$ di penetrazione residua.
   - Il fattore opt-in `calculatePilotSafetyFactor` (`1.0x`, `0.85x`, `0.75x`, calcolato sulla continuità di volo nel Logbook) riduce in modo conservativo solo le soglie di pilotaggio attivo ($\Delta\text{Gust}$, turbolenza EDR, CAPE, vento traverso).

---

## 2. Contesto Operativo del Pilota Base

1. **Sul Decollo**:
   - Uso con guanti da volo (touch target rigorosamente $\ge 48 \times 48\text{ px}$) e sotto luce solare diretta (contrasto WCAG AA/AAA, token `--gm-status-unflyable-text`).
   - Finestra decisionale rapida: il verdetto deve essere leggibile in $< 3\text{ secondi}$ (*Glanceability*).
2. **In Volo e in Pianificazione**:
   - Priorità primaria: raggiungere sempre l'atterraggio ufficiale con margine di quota ed evitare rotori sottovento.
   - Traduzione fenomenologica anti-gergo: vietato esporre acronimi isolati (`CAPE`, `LCL`, `EDR`) senza la traduzione in italiano comprensibile (*Instabilità / Temporali*, *Base Nubi*, *Turbolenza in Termica*, *Gradiente Termico*).

---

## 3. Matrice delle Soglie di Sicurezza per Ali Base ($V_{\text{trim}} \approx 36\text{ km/h}$, $L/D \approx 7.8$)

| Parametro Operativo | Soglia Ottimale (Verde) | Soglia Attenzione (Giallo) | Soglia Pericolo (Rosso / NO FLY) |
| :--- | :---: | :---: | :---: |
| **Vento Base al Decollo** | $5 - 14\text{ km/h}$ | $15 - 18\text{ km/h}$ | $> 18\text{ km/h}$ ($> 50\%$ di $V_{\text{trim}}$) |
| **Raffica Massima (Gust)** | $\le 18\text{ km/h}$ | $19 - 22\text{ km/h}$ | $> 22\text{ km/h}$ |
| **Delta Raffica ($\Delta\text{Gust}$)** | $\le 5\text{ km/h}$ | $6 - 8\text{ km/h}$ | $> 8\text{ km/h}$ |
| **Deviazione Vento / Pendio ($\Delta\theta$)** | $\le \pm 15^\circ$ | $\pm 16^\circ - \pm 25^\circ$ | $> \pm 25^\circ$ (o componente da tergo) |
| **Gradiente Brezza in Atterraggio** | $< 12\text{ km/h}$ | $13 - 18\text{ km/h}$ | $> 18\text{ km/h}$ |
| **Cono di Planata verso Landing** | Richiesto $\le 1:5.0$ | Richiesto $1:5.1 - 1:6.0$ | Richiesto $> 1:6.0$ (o franco $< 150\text{m}$ AGL) |
| **Attività Termica (Vario Medio)** | $0.0 - +1.5\text{ m/s}$ | $+1.6 - +2.5\text{ m/s}$ | $> +2.5\text{ m/s}$ o CAPE $> 600\text{ J/kg}$ |

---

## 4. Checkpoint di Invocazione della Skill `novice-pilot-auditor`

1. **Checkpoint 1 — Design & Viste UI (`HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`)**:
   - Verifica anti-gergo preventivo, omissione di badge `EN-A..D` a favore di $V_{\text{trim}}$/$L/D$, regola dei 3 secondi, touch target $\ge 48\text{px}$ e zero icon clutter.
2. **Checkpoint 2 — Algoritmi di Volabilità (`flyability.js`, `soundingsMath.js`)**:
   - Verifica scalatura su $V_{\text{trim}}$ dell'ala attiva, applicazione di `pilotSafetyFactor` sulle soglie di pilotaggio attivo e inseparabilità decollo-atterraggio.
3. **Checkpoint 3 — Prompt di Briefing AI (`ai-briefing-gemini`)**:
   - Verifica assenza di acronimi isolati e indicazioni focalizzate sulle finestre orarie sicure.
4. **Checkpoint 4 — Analisi Manovre e Debriefing IGC (`flightManeuvers.js`, `FlightDetailSheet.js`)**:
   - Verifica feedback aerodinamico costruttivo basato sui parametri fisici dell'ala.
5. **Checkpoint 5 — End-of-Task Sync (`DESIDERATA.md`)**:
   - Verifica finale di zero regressioni ergonomiche o di sicurezza prima della chiusura del task.
