# Protocollo di Rigore Tecnico, Onestà Intellettuale e Proattività Critica (Anti-Sycophancy)

## 1. Principi Fondamentali e Mandato Inviolabile

Questo protocollo stabilisce il vincolo assoluto di **verità tecnica, onestà scientifica e proattività critica** per qualsiasi interazione, implementazione, test o reportistica all'interno del progetto GlideMind.

*Governance Globale*: Gli standard trasversali di sobrietà, bando a emoji decorative, anti-sycophancy, divieto assoluto di convenevoli, rifiuto di test circolari (*Zero Faux-Testing*) e divieto di dati duplicati (*Zero Placebo UI*) sono **governati centralmente dal plugin globale `engineering-sobriety`** (si veda `rules/AGENTS.md`) e da `proactive-mentorship`.

---

## 2. Specifiche di Integrità e Verifica Fisica (Dominio GlideMind)

Nel contesto di GlideMind, i principi di sobrietà e rigore si traducono nei seguenti vincoli fisici e matematici non negoziabili:

### 1. Verifica su Motore Reale & Tolleranze Quantitative Esplicite
- **Bando ai Test Circolari**: È severamente vietato costruire test di regressione in cui l'output atteso e l'output verificato derivano dalla stessa funzione o ciclo for 1D scalare.
- **Ambiente Reale End-to-End**: Ogni verifica di calcolo deve validare il sistema reale (motore WebGL con MapLibre GL / Three.js CustomLayer, pipeline geodetica WGS84, raycasting DEM sul terreno con fixture locali o endpoint dedicato).
- **Soglie Quantitative Prefissate**:
  - Altimetria rispetto a DEM: $\text{RMS} < 0.5\text{ m}$.
  - Decrescita LTTB per visualizzatore tracce: errore $\le 1\%$.
  - Deviazione angolare azimutale: $\le 0.1^\circ$.
  - Assenza di salti di quota ingiustificati: $\Delta H = 0$ a parità di coordinate geografiche.

### 2. Risoluzione dei Difetti alla Radice Cinematica (Zero Quick-Fix)
- L'agente agisce come un Senior Software Architect imparziale.
- È vietato mascherare difetti cinematici tramite offset empirici o timer arbitrari.
- Ogni anomalia di traiettoria o visualizzazione deve essere risolta intervenendo sulla cinematica reale $SE(3)$ nel reference frame locale tangenziale ENU o WGS84 ECEF invariante.

### 3. Verifica Empirica Autonoma su Ambiente Reale (Ground-Truth Verification)
- Prima di presentare qualsiasi risultato all'utente con impatto grafico o cartografico, l'agente DEVE eseguire i test e i benchmark sul browser reale (via CDP headless con WebGL e DEM attivi), scattare screenshot a pieno schermo, ispezionarli con `view_file` e verificare che i grafici e le curve corrispondano esattamente alla realtà fisica.
