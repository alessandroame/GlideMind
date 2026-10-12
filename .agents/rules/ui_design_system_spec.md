# GlideMind UI Design System Specification & Visual Consistency

Questo documento definisce il contratto vincolante per la coerenza stilistica, l'integrità del Design System e la salvaguardia del doppio tema (Dark Cockpit e Sunlight Mode) in GlideMind.

---

## 1. Principi Fondamentali del Design System

1. **Single Source of Truth per lo Stile (`css/theme.css`)**:
   - Tutte le proprietà visive (colori, tipografia, raggi di curvatura, ombre, spaziature, altezze minime) derivano esclusivamente dai design token `--gm-*` dichiarati in `css/theme.css`.
   - È tassativamente vietato inventare stili ad-hoc, ridefinire palette cromatiche o introdurre proprietà slegate dai token globali.
2. **Dual-Theme Parity (Cockpit Scuro & Sunlight Light Mode)**:
   - Ogni componente, card, badge o testo deve mantenere leggibilità immediata e contrasto WCAG 2.1 AA ($\ge 4.5:1$ per testo normale, $\ge 7:1$ per testo critico) sia nel tema scuro predefinito sia in `[data-theme="light"]`.
   - L'uso di colori cablati (hardcoded `#...` o `rgb(...)`) rompe la commutazione dinamica del tema e genera elementi invisibili o abbaglianti sotto luce solare zenitale.
3. **Divieto di Stili Inline (`style="..."`) per Styling Statico**:
   - È vietato utilizzare attributi `style="..."` per definire colori, sfondi, bordi, margini, padding o dimensioni dei font nei template HTML dei view controller (`ui/views/*.js`).
   - *Unica eccezione ammessa*: grandezze matematiche dinamiche calcolate a runtime (es. percentuali di riempimento barre `width: ${pct}%`, trasformazioni geometriche SVG o rotazioni bussola `transform: rotate(${deg}deg)`).

---

## 2. Catalogo dei Componenti Canonici (Design Primitives)

Tutte le viste (`HomeDashboardView`, `ForecastView`, `SpotMapView`, `LogbookView`, `SettingsView`, fogli e modali) devono impiegare esclusivamente i seguenti pattern di markup:

### 2.1 Cards e Contenitori
- `.gm-card`: Contenitore base standard con bordo `var(--gm-border)`, sfondo `var(--gm-bg-card)` e raggio `var(--gm-radius-md)`.
- `.gm-card-interactive`: Card cliccabile con feedback touch e hover (`var(--gm-bg-hover)`).
- `.gm-trend-card.gm-trend-card-side-by-side`: Struttura a 2 colonne per serie temporali e grafici meteorologici (`ui_chart_design_spec.md`).
- *Regola Anti-Overboxing*: Massimo 1 livello di contenimento perimetrale per card. Vietato annidare card con bordi dentro altre card.

### 2.2 Pulsanti e Controlli Interattivi
- `.gm-btn-primary`: Azione principale prominente (Von Restorff effect, Fitts's law target floor $\ge 48\times 48\text{ px}$). Unico pulsante primario per vista o barra di azione.
- `.gm-btn-secondary`: Azione secondaria outline con bordo `var(--gm-border-strong)` e sfondo trasparente/elevated.
- `.gm-btn-ghost`: Azione terziaria o controllo compatto privo di sfondo permanente.
- `.gm-stepper-btn`: Controlli di incremento/decremento (es. scrubber orario) con pseudo-elemento `::before` per garantire $\ge 48\text{px}$ di area cliccabile.

### 2.3 Indicatori di Stato e Badge (Scala Semantica a 4 Colori)
Gli stati di volabilità e sicurezza devono impiegare le classi semantiche dedicate:
- `.gm-badge.gm-badge-flyable`: Verde (`var(--gm-status-flyable)` / `var(--gm-status-flyable-bg)`). Simbolo `●`.
- `.gm-badge.gm-badge-caution`: Giallo/Ambra (`var(--gm-status-caution)` / `var(--gm-status-caution-bg)`). Simbolo `▲`.
- `.gm-badge.gm-badge-unflyable`: Rosso (`var(--gm-status-unflyable)` / `var(--gm-status-unflyable-bg)`). Simbolo `✕`.
- `.gm-badge.gm-badge-severe`: Nero/Scuro con bordo rosso (`var(--gm-status-severe)`). Simbolo `⚡`.
- *Regola Tri-Modale di Sicurezza*: Ogni indicatore critico deve combinare sempre **Colore + Testo Esplicito + Icona/Simbolo Funzionale**. Vietato usare solo il colore.

### 2.4 Tipografia e Gerarchia di Titoli
- Titolo Principale di Vista: `.gm-header-title` o `.gm-view-title` (corpo `1.25rem` - `1.5rem`, grassetto, colore `var(--gm-text-primary)`).
- Titolo di Sezione: `.gm-section-title` (corpo `0.85rem` - `1rem`, maiuscolo o semibold, tracking proporzionato, colore `var(--gm-text-secondary)`). Sostituisce classi frammentate specifiche per vista.
- Valore Numerico Gigante: `.gm-stat-val` o `.gm-flight-metric-num` (`1.25rem` - `1.75rem`, `font-weight: 800`, mono o sans, colore `var(--gm-text-primary)`).
- Unità di Misura e Sub-Label: `.gm-stat-sub` o `.gm-flight-metric-desc` (corpo `0.70rem` - `0.75rem`, colore `var(--gm-text-muted)`). Mai numeri isolati senza unità.

### 2.5 Griglie Statistiche e KPI
- `.gm-stat-grid`: Layout a griglia responsive per KPI (2 colonne su mobile compatto, 4 su desktop).
- `.gm-stat-box`: Singolo blocco metrica incapsulato con etichetta, valore e unità.

---

## 3. Blacklist di Stile e Anti-Pattern Banditi

1. **Divieto di Colori Esadecimali (`#[0-9a-fA-F]`) nei File di Vista (`ui/views/*.js`)**:
   - Qualsiasi colore deve essere dichiarato come token in `css/theme.css` e richiamato tramite classe semantica o `var(--gm-*)`.
2. **Divieto di Utility Class Arbitrarie non Standardizzate**:
   - È vietato iniettare nel markup classi in stile Tailwind (es. `text-xs font-semibold uppercase tracking-wider text-[var(--gm-text-muted)]`) quando esiste la classe semantica standard (`.gm-section-title`).
3. **Divieto di Emoji Decorative**:
   - È vietato inserire emoji o simboli decorativi (`📈`, `🎙️`, `⏱️`, `ℹ️`, `🚀`, `✨`, `🔥`, `🎉`) in intestazioni, card o pulsanti (`engineering-sobriety`).
4. **Divieto di Troncamento a Ellisse su Dati di Volo**:
   - I dati di sicurezza e le spiegazioni fisiche non devono mai essere mascherati da `text-overflow: ellipsis`.
