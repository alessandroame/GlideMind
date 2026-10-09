# Frammento Worklog: Ideazione Brand Identity, Icona e Splash Screen

- **Data**: 2026-10-09
- **Ambito**: Brand Identity, PWA Assets, UI Architecture
- **Stato**: Consolidato (Fase di pianificazione e asset di riferimento archiviati)

---

## Contesto & Motivazione
Il progetto GlideMind necessitava di un'identità grafica per l'icona applicativa e lo splash screen mobile coerente con il design system aeronautico ad alto contrasto (`#0b0d12` ardesia/carbonio e `#f59e0b` ambra cockpit).

## Decisioni Architetturali (ADR)
1. **Selezione Emblema Alare**: Approvato il concept basato sul profilo alare aerodinamico a tre elementi rastremati verso destra, con finitura in gradiente ambra calda e bagliore perimetrale contenuto.
2. **Archiviazione Master Visivo**: Il rendering verticale di riferimento per lo splash screen è stato salvato in `assets/brand/glidemind_splash_concept.jpg`.
3. **Formalizzazione del Piano Operativo**: Redatto il piano dettagliato in `docs/BRAND_IDENTITY_AND_SPLASH_PLAN.md` che prevede vettorializzazione SVG master, generazione bundle PWA (standard e maskable safe-zone 80%) e overlay splash inline con rimozione controllata entro la soglia Doherty (< 400ms).

## File Coinvolti
- `assets/brand/glidemind_splash_concept.jpg` (Nuovo asset grafico di riferimento)
- `docs/BRAND_IDENTITY_AND_SPLASH_PLAN.md` (Piano operativo architetturale)
- `.agents/worklog.d/2026-10-09_brand-identity-and-splash-screen-plan.md` (Questo frammento)
