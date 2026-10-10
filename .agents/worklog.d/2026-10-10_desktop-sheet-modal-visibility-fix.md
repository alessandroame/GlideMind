# Ripristino Visibilità Modal Sheet e Date Picker in Modalità Desktop

**Data**: 2026-10-10  
**Ambito**: `css/theme.css`, `tests/ui/shellIntegrity.test.mjs`  
**Tipo**: Fix / Visual Regression  

---

### 1. Contesto & Diagnosi
In modalità desktop (`@media (min-width: 768px) and (min-height: 550px)`), al click del pulsante del date picker (o di qualsiasi altro foglio informativo gestito da `openSheet()`, es. selettore comprensori, classe del parapendio, aggiunta volo), il pannello modale non appariva a schermo. Lo sfondo veniva oscurato da `#sheet-backdrop` (`opacity: 1`), ma la scheda `.gm-sheet` rimaneva totalmente invisibile.

**Causa Radice**:
In `css/theme.css`:
- La regola desktop per `.gm-sheet` impostava `transform: scale(0.95); opacity: 0;` con transizione.
- Quando il contenitore riceveva la classe `.active`, la regola base impostava solo `transform: translateY(0);` senza dichiarare `opacity: 1;`.
- Nella media query desktop mancava la dichiarazione per `#sheet-container.active .gm-sheet`, lasciando `opacity: 0` inalterata e applicando `translateY(0)` anziché `scale(1)`. Di conseguenza, l'intero elemento modale rimaneva con opacità zero (trasparente).

---

### 2. Interventi Applicati
1. **Regola Base Attiva (`css/theme.css`)**:
   - Aggiornato `#sheet-container.active .gm-sheet` per dichiarare esplicitamente `opacity: 1;` oltre a `transform: translateY(0);`.
2. **Specializzazione Desktop (`css/theme.css`)**:
   - Inserita la regola `#sheet-container.active .gm-sheet` all'interno di `@media (min-width: 768px) and (min-height: 550px)`:
     ```css
     #sheet-container.active .gm-sheet {
       transform: scale(1);
       opacity: 1;
     }
     .gm-sheet-handle-bar {
       display: none;
     }
     ```
   - Nascosta la barra di trascinamento touch `.gm-sheet-handle-bar` su viewport desktop (non pertinente su interfacce puntatore).
3. **Test di Regressione e Integrità (`tests/ui/shellIntegrity.test.mjs`)**:
   - Aggiunto test automatizzato che verifica la presenza di `opacity: 1` sia nella regola base sia nella media query desktop con `transform: scale(1)`.

---

### 3. Esito della Verifica
- Suite di test completa eseguita: 339 test su 339 superati (0 errori).
- In ambiente desktop il date picker e tutti gli sheet modali compaiono regolarmente centrati, con dissolvenza fluida e transizione di scala da 0.95 a 1.0.
