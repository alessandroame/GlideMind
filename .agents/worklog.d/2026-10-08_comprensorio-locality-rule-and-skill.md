# Scheda Intervento: Specifica Architetturale Comprensorio-Centrica (Rule & Skill)

- **Data**: 2026-10-08
- **Autore**: Alessandro Amè & DeepMind Antigravity Pair Programmer
- **Oggetto**: Formalizzazione del paradigma Comprensorio-Centrico (Località con decolli e atterraggi aggregati) per piloti ricreativi/locali.

---

## 1. Contesto & Motivazione
Un pilota ricreativo non orientato ai voli di cross-country necessita di una valutazione contestualizzata sul comprensorio di volo:
- Il singolo decollo decontestualizzato dall'atterraggio è un anti-pattern di sicurezza: un decollo può risultare volabile mentre l'atterraggio a fondo valle è impraticabile per brezza forte o rotori.
- Le ricerche e i preferiti devono operare sulla `Località` (Comprensorio) come entità radice, la quale espone i decolli disponibili e gli atterraggi associati.

---

## 2. Artefatti Prodotti e Aggiornati
1. **Regola Architetturale Permanente**:
   - Creato [.agents/rules/comprensorio_locality_spec.md](file:///.agents/rules/comprensorio_locality_spec.md).
   - Definisce i vincoli di non-separabilità decollo-atterraggio, le convenzioni dello store (`selectedLocationId`, `pinnedLocationIds`), e gli anti-pattern vietati.
2. **Skill Operativa di Dominio**:
   - Creato [.agents/skills/comprensorio-evaluator/SKILL.md](file:///.agents/skills/comprensorio-evaluator/SKILL.md).
   - Include schema TypeScript (`FlyingSite`, `Takeoff`, `Landing`), algoritmo di selezione miglior decollo ($T_{\text{best}}$), verifica sicurezza atterraggio ($L_{\text{safe}}$), calcolo efficienza minima richiesta in planata ($E_{\text{richiesta}} = D / \Delta h$) e campionamento barico multi-quota.
3. **Triade Cognitiva**:
   - Aggiunta la sezione 12 in [MEMORY.md](file:///MEMORY.md).
   - Allineate le diciture delle Fasi 3, 4 e 5 in [DESIDERATA.md](file:///DESIDERATA.md).

---

## 3. Impatti sui Task Successivi
- Nella fase di implementazione di `HomeDashboardView.js` e dei widget meteo, le card mostreranno la sintesi del comprensorio (miglior decollo + sicurezza atterraggio) e lo store utilizzerà `pinnedLocationIds`.
