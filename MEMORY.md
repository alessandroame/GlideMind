# Lezioni Apprese & Vincoli Stabili di Progetto (MEMORY)

Questo documento registra vincoli stabili e lezioni tecniche apprese durante lo sviluppo di GlideMind per prevenire regressioni e iterazioni a vuoto.

---

## 1. Governance Git & Junctions NTFS (Windows)
- **Problema**: L'uso di giunzioni NTFS (`mklink /J`) dentro un workspace Git provoca l'indicizzazione dei file del repository sorgente come file ordinari se non esplicitamente esclusi.
- **Causa Radice**: Git su Windows non mappa le directory junction a symlink Git standard, trattandole come normali directory percorribili.
- **Pattern Vincolante**: I plugin operativi condivisi devono essere installati globalmente in `~/.gemini/config/plugins/` (o configurati in `.gitignore`), mantenendo il repository dell'applicazione interamente disaccoppiato da percorsi esterni.

---

## 2. Test Runner Nativo Node.js (`node --test`)
- **Problema**: Specificare stringhe glob come `node --test tests/**/*.test.mjs` fallisce su Windows (`Could not find tests/**/*.test.mjs`).
- **Causa Radice**: La shell di sistema di Windows (`cmd.exe`) non espande i glob prima di passare i parametri al processo.
- **Pattern Vincolante**: Utilizzare sempre `node --test` senza argomenti glob o con percorsi espliciti. Node.js gestisce nativamente la scoperta ricorsiva di tutti i file `*.test.{js,mjs}` nella cartella `tests/`.

---

## 3. Disaccoppiamento Assoluto del Core Headless (`core/`)
- **Problema**: Nel progetto legacy ParaMeteo, algoritmi matematici e logica di dominio erano mescolati con manipolazioni dirette del DOM (`document.getElementById`), Canvas e oggetti `window`.
- **Causa Radice**: Assenza di separazione architetturale tra logica di calcolo e rendering visuale.
- **Pattern Vincolante**: La cartella `core/` deve rimanere pura: zero dipendenze da `window`, `document`, `HTMLElement`, `navigator` o `Canvas`. Tutti i moduli di calcolo devono poter essere eseguiti e testati al 100% in Node.js puro senza polyfill del DOM.

---

## 4. Ergonomia Outdoor HMI & Standard Touch
- **Problema**: Target di tocco piccoli (<44px), modali popup nidificate o griglie a scorrimento verticale compresso risultano inutilizzabili all'aperto con guanti o sotto la luce del sole.
- **Causa Radice**: Progettazione desktop-first scalata forzatamente su mobile.
- **Pattern Vincolante**: Dimensionamento minimo di ogni elemento interattivo a $\ge 44 \times 44\text{px}$, adozione di caroselli a riga singola con `touch-action: pan-x`, viewport dinamico `100dvh` e divieto assoluto di modali nidificate.
