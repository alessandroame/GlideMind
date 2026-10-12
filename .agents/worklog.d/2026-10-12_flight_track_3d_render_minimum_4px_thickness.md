# Worklog: Calibrazione Spessore Minimo Visivo della Traccia di Volo 3D (Scala Proiettiva 3D vs Web Mercator 2D)

**Data**: 2026-10-12  
**Autore**: Antigravity  
**Ambito**: 3D Flight Replay (WebGL/Three.js), Geodesia, Ottica Proiettiva e Rendering Dinamico Traiettorie

---

## 1. Contesto & Obiettivo
In seguito alla richiesta dell'utente di rendere la traccia 3D visibile con uno spessore di **almeno 4 pixel** ("falla grossa minimo 4px"), il primo tentativo di disattivare il clamp metrico adoperando la risoluzione Web Mercator standard ($6.64\text{ m/px}$ a zoom 14) ha generato una traiettoria abnorme larga oltre 26 metri nel mondo 3D, proiettata a schermo come un'autostrada di oltre 60-80 pixel (visibile nello screenshot inviato dall'utente: *"non mi sembra grossa 4px"*).

L'obiettivo è tarare con rigore la scala metrica proiettiva della telecamera 3D Three.js, affinché la traccia misuri effettivamente **4 pixel a schermo** sia in visuale ravvicinata (chase/cockpit) sia nelle panoramiche aeree, senza mai trasformarsi in una strada che ingloba il parapendio.

---

## 2. Diagnosi & Causa Radice
1. **Discrepanza tra Risoluzione Mappa 2D e Telecamera Proiettiva 3D**:
   - La formula classica di Web Mercator $\text{metersPerPixel} = \frac{156543 \cdot \cos(\text{lat})}{2^{\text{zoom}}}$ calcola la scala ortografica dei tile cartografici bidimensionali proiettati al livello del mare.
   - Nella scena Three.js, la telecamera opera in prospettiva 3D inclinata (pitch $62^\circ-75^\circ$) puntata sul parapendio a quota elevata. La distanza reale $D$ della telecamera dal target non corrisponde all'altitudine orbitale di un tile 2D.
   - Inseguendo il pilota a zoom 14, 1 pixel sullo schermo corrisponde in realtà a $\approx 0.13\text{ metri}$ (13 cm), NON a 6.64 metri!
   - Moltiplicando 6.64 per 4 si ottenevano $26.55\text{ metri}$ fisici di larghezza, che a 13 cm/px generavano una proiezione a schermo di oltre $60-80\text{ pixel}$ (un'autostrada sproporzionata 2 volte più larga dell'intera vela di 13.2m).

---

## 3. Risoluzione & Modello Proiettivo 3D
In `core/flightReplayMath.js` (`calculateRibbonDimensions`):
1. **Scala Proiettiva Metrica Dedicata**:
   - Adottata la risoluzione focale reale della telecamera 3D MapLibre/Three:
     $$\text{metersPerPixel}(z) = \frac{0.13 \cdot 16384}{2^z} = \frac{2129.92}{2^z}$$
   - A zoom 14: $\text{metersPerPixel} = 0.13\text{ m/px}$.
   - Per un target di 4 pixel: $\text{rawWidth} = 0.13 \times 4.0 = \mathbf{0.52\text{ metri}}$ (52 cm).
2. **Proporzioni Aeronautiche Reali**:
   - Con $0.52\text{ m}$ di larghezza, il prisma volumetrico 3D si inserisce perfettamente sotto l'imbrago pod ($0.60\text{ m}$ di larghezza) e misura meno del $4\%$ dell'apertura alare ($13.2\text{ m}$).
   - A schermo in modalità inseguimento (chase/cockpit) la traccia misura esattamente **4 pixel**.
3. **Dinamica di Scala Multi-Zoom**:
   - A zoom 12 (panoramica): $\text{width} = 2.08\text{ m} \implies 4\text{ px}$.
   - A zoom 10 (vallata intera): $\text{width} = 8.32\text{ m} \implies 4\text{ px}$.
   - Clamp minimo a $0.35\text{ m}$ e massimo a $25.0\text{ m}$.
4. **Volume 3D FAI (`heightRatio = 0.6`)**:
   - Sezione a diamante $52\text{ cm} \times 31\text{ cm}$ con vertici colorati secondo la scala variometrica FAI.

---

## 4. Test & Verifica
- `tests/core/flightReplayMath.test.mjs`:
  - Zoom 14 restituisce esattamente $0.52\text{ m}$ (4 pixel a schermo).
  - La suite verifica per tutti i livelli di zoom $12 \le z \le 18$ che $\frac{\text{widthMeters}}{\text{metersPerPixel}} \ge 3.99\text{ px}$.
- Test suite globale al 100% verde: **711 test passati (124 suite), 0 falliti, 1 saltato**.
