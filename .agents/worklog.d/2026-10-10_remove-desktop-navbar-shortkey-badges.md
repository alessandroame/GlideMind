# Rimozione Badge Shortkey dalla Barra di Navigazione Desktop

**Data**: 2026-10-10  
**Ambito**: `index.html`, `css/theme.css`  
**Tipo**: UI Polish / De-cluttering  

---

### 1. Contesto & Diagnosi
I collegamenti di navigazione nella testata desktop (`#desktop-nav-bar`) esponevano badge visivi per le scorciatoie da tastiera (`[H]`, `[F]`, `[M]`, `[L]`, `[S]`).
Questi badge introducevano rumore visivo e appesantivano la linea grafica dei tab di navigazione primari, riducendo la pulizia visiva dell'interfaccia.

---

### 2. Interventi Applicati
1. **[`index.html`](file:///index.html)**:
   - Rimossi gli elementi `<span class="gm-kbd-badge">` dai 5 collegamenti della barra desktop (`Home`, `Previsioni`, `Mappa`, `Logbook`, `Impostazioni`).
2. **[`css/theme.css`](file:///css/theme.css)**:
   - Rimossa la classe CSS non più utilizzata `.gm-kbd-badge`.

---

### 3. Esito della Verifica
- Suite di test completa eseguita: 339 test su 339 superati.
- La barra di navigazione desktop presenta ora etichette testuali minimaliste e pulite.
