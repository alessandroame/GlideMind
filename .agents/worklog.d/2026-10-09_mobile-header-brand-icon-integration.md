# Worklog: Integrazione Icona Brand, Versione e Build Stamp nell'Header Mobile (HomeDashboardView)

- **Data**: 2026-10-09
- **Autore**: Alessandro Amè & Pair Programmer
- **Contesto**: Collocazione del marchio applicativo GlideMind nella UI mobile dell'applicazione, rimozione della data duplicata dall'header e visualizzazione di versione e build stamp per ambienti di test.
- **Tipo**: UI Enhancement / HMI Ergonomics / Brand Alignment / Visual Verification

---

## 1. Diagnosi del Difetto Visivo e Causa Radice (DevTools Inspection)

Dall'ispezione empirica del layout via Chrome DevTools su viewport mobile (375×667 e 412×924) è emersa un'anomalia di allineamento in cui il tag `v2.0.0` appariva sollevato come un esponente/apice sopra `GlideMind`:

1. **Margini Default dello User-Agent**: Il tag `<h1>` ereditava dal foglio di stile del browser `margin: 10.05px 0`, spingendo la baseline di `GlideMind` verso il basso di ~10px rispetto allo `<span>` adiacente.
2. **Assenza Utility Tailwind in Vanilla CSS**: Le classi `items-baseline` e `gap-1.5` non erano definite nel motore CSS custom [css/theme.css](file:///css/theme.css). Flexbox applicava quindi `align-items: stretch`, lasciando la versione ancorata al bordo superiore (`y: 16px`) mentre il testo del titolo partiva da `y: 26px`.

---

## 2. Risoluzione Architetturale e Classi Dedicate

Nel foglio di stile [css/theme.css](file:///css/theme.css) sono state introdotte classi semantiche dedicate che azzerano i margini ereditati e vincolano l'allineamento tipografico:

```css
.gm-home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--gm-border);
}

.gm-header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gm-header-title {
  margin: 0;
  padding: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--gm-text-primary);
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.gm-header-version {
  font-family: var(--gm-font-mono, monospace);
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--gm-text-muted);
  line-height: 1;
}

.gm-header-build {
  font-family: var(--gm-font-mono, monospace);
  font-size: 0.7rem;
  color: var(--gm-text-muted);
  background: var(--gm-bg-card);
  border: 1px solid var(--gm-border);
  padding: 2px 6px;
  border-radius: var(--gm-radius-sm, 4px);
  line-height: 1.2;
  letter-spacing: 0.02em;
}
```

In [ui/views/HomeDashboardView.js](file:///ui/views/HomeDashboardView.js), `<span class="gm-header-version">` è stato incapsulato direttamente all'interno del tag `<h1 class="gm-header-title">`, condividendo in modo matematico la medesima baseline tipografica.

---

## 3. Ciclo di Verifica e Risultati

1. **Ispezione DOM e Geometria**:
   - `h1`: `top: 18px`, `height: 18px`
   - `version`: `top: 23.6px`, `height: 10.8px` (allineato alla baseline inferiore di `h1` a `y: 34.4px / 36px`)
   - `build`: centrato verticalmente a `top: 18.8px` sul lato opposto dell'header.
2. **Verifica Visiva Headless**: Acquisiti screenshot su viewport 375×667 e 412×924 via Chrome DevTools MCP, confermando l'azzeramento dell'anomalia.
3. **Suite di Test Automatizzata**: 279/279 test passati (`node --test`).
