/**
 * Dedicated Track Setup & Calibration View for GlideMind (UI Layer)
 * 
 * Provides:
 *  - Takeoff and landing trimming adjustments (sliders, auto-detect, reset, apply).
 *  - Topographic elevation correction (QNH barometric calibration, two-point drift interpolation, uniform offset).
 *  - Clean decoupling from the main Flight Detail View to eliminate clutter.
 * 
 * Strictly follows Laws of UX, thumb zone ergonomics, and touch target floor >= 48px.
 */

import { logbookManager } from '../../core/logbookDb.js';
import { store } from '../../core/store.js';
import { detectTrimPoints } from '../../core/flightTrimming.js';

let activeSetupOverlay = null;
let previousActiveEl = null;
let escapeKeyHandler = null;
let hashChangeHandler = null;

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a track point timestamp and altitude for trimming labels.
 * @param {Object} point
 * @param {number} index
 * @returns {string}
 */
export function formatTrimPointLabel(point, index) {
  if (!point) return `Punto #${index}`;
  let timeStr = '';
  if (typeof point.time === 'string' && point.time.length >= 5) {
    timeStr = point.time;
  } else if (typeof point.timeSeconds === 'number') {
    const s = Math.round(point.timeSeconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    timeStr = hrs > 0
      ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  } else if (point.timeFormatted) {
    timeStr = point.timeFormatted.substring(0, 5);
  }
  const altStr = typeof point.alt === 'number' && !isNaN(point.alt) ? ` • ${Math.round(point.alt)} m` : '';
  return timeStr ? `Punto #${index} (${timeStr}${altStr})` : `Punto #${index}${altStr}`;
}

/**
 * Renders the HTML markup for the dedicated Track Setup View.
 * @param {Object} bundle - { meta, raw, telemetry }
 * @returns {string} HTML string
 */
export function renderTrackSetupHtml(bundle) {
  const meta = bundle?.meta || {};
  const raw = bundle?.raw || {};
  const flightId = String(meta.id || meta.flightId || '');
  const siteTitle = meta.siteName || meta.site || 'Volo Libero';
  const dateFormatted = meta.date || 'Data N/D';

  const sourcePoints = (raw.originalPoints && Array.isArray(raw.originalPoints) && raw.originalPoints.length >= 10)
    ? raw.originalPoints
    : (raw.points && Array.isArray(raw.points) && raw.points.length >= 10
        ? raw.points
        : (Array.isArray(raw.decimatedPoints) && raw.decimatedPoints.length >= 10 ? raw.decimatedPoints : []));

  const totalPoints = sourcePoints.length;
  const maxTrimIndex = Math.max(0, totalPoints - 1);

  const initialTakeoffIndex = (meta.trimIndices && typeof meta.trimIndices.takeoffIndex === 'number')
    ? Math.max(0, Math.min(meta.trimIndices.takeoffIndex, maxTrimIndex))
    : 0;

  const initialLandingIndex = (meta.trimIndices && typeof meta.trimIndices.landingIndex === 'number')
    ? Math.max(0, Math.min(meta.trimIndices.landingIndex, maxTrimIndex))
    : maxTrimIndex;

  const currentTakeoffAlt = meta.takeoffAltMsl !== undefined
    ? meta.takeoffAltMsl
    : (sourcePoints[0] ? Math.round(sourcePoints[0].alt || 0) : 0);

  const currentLandingAlt = meta.landingAltMsl !== undefined
    ? meta.landingAltMsl
    : (sourcePoints[totalPoints - 1] ? Math.round(sourcePoints[totalPoints - 1].alt || 0) : 0);

  const elevCorr = meta.elevationCorrection || null;
  const targetTakeoffVal = elevCorr?.targetTakeoffAlt !== undefined ? elevCorr.targetTakeoffAlt : currentTakeoffAlt;
  const targetLandingVal = elevCorr?.targetLandingAlt !== undefined ? elevCorr.targetLandingAlt : currentLandingAlt;

  return `
    <div id="track-setup-overlay" class="gm-flight-detail-fullscreen" role="dialog" aria-modal="true" aria-labelledby="gm-track-setup-title-text" data-flight-id="${escapeHtml(flightId)}">
      <!-- 1. Top Bar with Back Navigation (>= 48px touch floor) -->
      <header class="gm-flight-detail-topbar">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            id="btn-track-setup-back"
            class="gm-flight-detail-back-btn"
            aria-label="Torna al Dettaglio Volo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Dettaglio</span>
          </button>

          <div class="flex flex-col min-w-0">
            <h2 id="gm-track-setup-title-text" class="gm-flight-detail-title-heading">
              Setup &amp; Calibrazione Traccia
            </h2>
            <div class="text-xs text-[var(--gm-text-secondary)] flex items-center gap-2 truncate">
              <span>${escapeHtml(siteTitle)}</span>
              <span>•</span>
              <span>${escapeHtml(dateFormatted)}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- 2. Scrollable Body -->
      <main class="gm-flight-detail-scroll-body" tabindex="-1">
        <!-- Section 1: Track Trimming (Takeoff & Landing) -->
        <section class="gm-flight-detail-section" id="gm-track-trimming-setup-section" aria-label="Regolazione Trimming Decollo e Atterraggio">
          <div class="flex items-center justify-between">
            <h3 class="gm-flight-detail-section-title" style="margin: 0;">1. Regolazione Trimming (Inizio &amp; Fine Volo)</h3>
            ${meta.isTrimmed
              ? '<span class="text-xs px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">Traccia Trimmata</span>'
              : '<span class="text-xs px-2.5 py-0.5 rounded bg-white/10 text-[var(--gm-text-muted)] font-semibold">Traccia Integrale</span>'
            }
          </div>
          <p class="text-xs text-[var(--gm-text-secondary)] m-0">
            Elimina la preparazione pre-decollo sul tappeto e l&#39;attesa a terra post-atterraggio per ricalcolare durata, guadagno e dislivello reali.
          </p>

          <div class="gm-trim-card">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-[var(--gm-text-primary)]">Inizio Volo (Decollo):</span>
                <span id="gm-setup-trim-takeoff-val" class="font-mono text-[var(--gm-accent)] font-semibold">
                  ${escapeHtml(formatTrimPointLabel(sourcePoints[initialTakeoffIndex], initialTakeoffIndex))}
                </span>
              </div>
              <input
                type="range"
                id="gm-setup-trim-takeoff-range"
                min="0"
                max="${maxTrimIndex}"
                value="${initialTakeoffIndex}"
                class="w-full cursor-pointer accent-[var(--gm-accent)]"
                aria-label="Selettore punto di decollo"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-[var(--gm-text-primary)]">Fine Volo (Atterraggio):</span>
                <span id="gm-setup-trim-landing-val" class="font-mono text-[var(--gm-accent)] font-semibold">
                  ${escapeHtml(formatTrimPointLabel(sourcePoints[initialLandingIndex], initialLandingIndex))}
                </span>
              </div>
              <input
                type="range"
                id="gm-setup-trim-landing-range"
                min="0"
                max="${maxTrimIndex}"
                value="${initialLandingIndex}"
                class="w-full cursor-pointer accent-[var(--gm-accent)]"
                aria-label="Selettore punto di atterraggio"
              />
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--gm-border)]">
              <button
                type="button"
                id="btn-setup-auto-detect-trim"
                class="gm-btn gm-btn-secondary"
                style="min-height: var(--gm-touch-min, 48px); padding: 0 16px;"
              >
                Rileva Automaticamente
              </button>

              <div class="flex items-center gap-2">
                ${meta.isTrimmed ? `
                  <button
                    type="button"
                    id="btn-setup-reset-trim"
                    class="gm-btn gm-btn-secondary"
                    style="min-height: var(--gm-touch-min, 48px); padding: 0 16px;"
                  >
                    Ripristina Originale
                  </button>
                ` : ''}
                <button
                  type="button"
                  id="btn-setup-apply-trim"
                  class="gm-btn gm-btn-primary"
                  style="min-height: var(--gm-touch-min, 48px); padding: 0 20px;"
                >
                  Applica Trimming
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 2: Takeoff & Landing Elevation Calibration -->
        <section class="gm-flight-detail-section" id="gm-track-elevation-setup-section" aria-label="Calibrazione Quota Decollo e Atterraggio">
          <div class="flex items-center justify-between">
            <h3 class="gm-flight-detail-section-title" style="margin: 0;">2. Calibrazione Quota Decollo e Atterraggio</h3>
            ${elevCorr
              ? '<span class="text-xs px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">Quote Calibrate</span>'
              : ''
            }
          </div>
          <p class="text-xs text-[var(--gm-text-secondary)] m-0">
            Allinea le quote registrate dallo strumento all&#39;altitudine topografica reale di decollo e atterraggio. Compensa eventuali scostamenti di pressione atmosferica (QNH) o drift barometrico durante il volo.
          </p>

          <div class="gm-trim-card flex flex-col gap-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Takeoff Target Elevation -->
              <div class="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--gm-bg-base)] border border-[var(--gm-border)]">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-[var(--gm-text-primary)]">Quota Decollo (MSL):</span>
                  <span class="font-mono text-[var(--gm-text-muted)]">Attuale: ${currentTakeoffAlt} m</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    id="gm-setup-target-takeoff-input"
                    class="gm-input flex-1 font-mono text-sm"
                    style="min-height: var(--gm-touch-min, 48px); padding: 0 12px; background: var(--gm-bg-card); border: 1px solid var(--gm-border); border-radius: var(--gm-radius-sm); color: var(--gm-text-primary);"
                    value="${targetTakeoffVal}"
                    placeholder="es. 1060"
                    aria-label="Quota reale decollo in metri"
                  />
                  <span class="text-xs font-bold text-[var(--gm-text-secondary)]">m</span>
                </div>
              </div>

              <!-- Landing Target Elevation -->
              <div class="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--gm-bg-base)] border border-[var(--gm-border)]">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-[var(--gm-text-primary)]">Quota Atterraggio (MSL):</span>
                  <span class="font-mono text-[var(--gm-text-muted)]">Attuale: ${currentLandingAlt} m</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    id="gm-setup-target-landing-input"
                    class="gm-input flex-1 font-mono text-sm"
                    style="min-height: var(--gm-touch-min, 48px); padding: 0 12px; background: var(--gm-bg-card); border: 1px solid var(--gm-border); border-radius: var(--gm-radius-sm); color: var(--gm-text-primary);"
                    value="${targetLandingVal}"
                    placeholder="es. 260"
                    aria-label="Quota reale atterraggio in metri"
                  />
                  <span class="text-xs font-bold text-[var(--gm-text-secondary)]">m</span>
                </div>
              </div>
            </div>

            <!-- Correction Mode Selection -->
            <div class="flex flex-col gap-1.5 text-xs">
              <span class="font-bold text-[var(--gm-text-secondary)]">Metodo di Compensazione:</span>
              <div class="flex flex-col gap-2">
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="gm-setup-elevation-mode"
                    value="two_point"
                    ${!elevCorr || elevCorr.mode === 'two_point' ? 'checked' : ''}
                    class="mt-0.5 accent-[var(--gm-accent)]"
                  />
                  <div class="flex flex-col">
                    <span class="font-semibold text-[var(--gm-text-primary)]">Compensazione Drift Barometrico (Riscalatura Bi-Punto)</span>
                    <span class="text-[var(--gm-text-muted)] text-[11px]">Compensa linearmente nel tempo la variazione di pressione tra decollo e atterraggio (Consigliato).</span>
                  </div>
                </label>
                <label class="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="gm-setup-elevation-mode"
                    value="takeoff_offset"
                    ${elevCorr && elevCorr.mode === 'takeoff_offset' ? 'checked' : ''}
                    class="mt-0.5 accent-[var(--gm-accent)]"
                  />
                  <div class="flex flex-col">
                    <span class="font-semibold text-[var(--gm-text-primary)]">Offset Costante (Traslazione Verticale Uniforme)</span>
                    <span class="text-[var(--gm-text-muted)] text-[11px]">Applica la differenza di quota del decollo in modo costante a tutti i punti della traccia.</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Elevation Actions -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--gm-border)]">
              ${elevCorr || raw.uncalibratedOriginalPoints ? `
                <button
                  type="button"
                  id="btn-setup-reset-elevation"
                  class="gm-btn gm-btn-secondary"
                  style="min-height: var(--gm-touch-min, 48px); padding: 0 16px;"
                >
                  Ripristina Quote Strumento
                </button>
              ` : '<div></div>'}
              <button
                type="button"
                id="btn-setup-apply-elevation"
                class="gm-btn gm-btn-primary"
                style="min-height: var(--gm-touch-min, 48px); padding: 0 20px;"
              >
                Applica Calibrazione Quote
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

/**
 * Closes the active Track Setup View.
 */
export function closeTrackSetupView() {
  if (escapeKeyHandler && typeof window !== 'undefined') {
    window.removeEventListener('keydown', escapeKeyHandler);
    escapeKeyHandler = null;
  }

  if (hashChangeHandler && typeof window !== 'undefined') {
    window.removeEventListener('hashchange', hashChangeHandler);
    hashChangeHandler = null;
  }

  if (activeSetupOverlay) {
    if (activeSetupOverlay.parentNode) {
      activeSetupOverlay.parentNode.removeChild(activeSetupOverlay);
    }
    activeSetupOverlay = null;
  }

  // Restore keyboard focus
  if (previousActiveEl && typeof previousActiveEl.focus === 'function') {
    previousActiveEl.focus();
    previousActiveEl = null;
  }
}

/**
 * Opens the dedicated Track Setup View for a given flight.
 * @param {string} flightId
 * @param {Object} [options={}]
 * @returns {Promise<void>}
 */
export async function openTrackSetupView(flightId, options = {}) {
  if (!flightId) return;

  const targetStore = options.store || store;

  let bundle = null;
  try {
    bundle = await logbookManager.getFlightDetail(flightId);
  } catch (err) {
    console.error('[TrackSetupView] Impossibile recuperare i dettagli del volo:', err);
    return;
  }

  if (!bundle || !bundle.meta) {
    console.warn(`[TrackSetupView] Volo non trovato: ${flightId}`);
    return;
  }

  closeTrackSetupView();

  if (typeof document === 'undefined') return;

  previousActiveEl = document.activeElement;

  const overlayEl = document.createElement('div');
  overlayEl.innerHTML = renderTrackSetupHtml(bundle).trim();
  const setupEl = overlayEl.firstElementChild;
  document.body.appendChild(setupEl);
  activeSetupOverlay = setupEl;

  // 1. Back button
  const backBtn = setupEl.querySelector('#btn-track-setup-back');
  if (backBtn) {
    backBtn.addEventListener('click', async () => {
      closeTrackSetupView();
      if (typeof options.onClose === 'function') {
        options.onClose();
      } else {
        const { openFlightDetailView } = await import('./FlightDetailSheet.js');
        await openFlightDetailView(flightId, { store: targetStore });
      }
    });
  }

  // 2. Escape key navigation & hashchange dismissal
  escapeKeyHandler = (e) => {
    if (e.key === 'Escape') {
      closeTrackSetupView();
      if (typeof options.onClose === 'function') {
        options.onClose();
      }
    }
  };
  window.addEventListener('keydown', escapeKeyHandler);

  hashChangeHandler = () => {
    closeTrackSetupView();
  };
  window.addEventListener('hashchange', hashChangeHandler, { once: true });

  // 3. Trimming Controls Event Listeners
  const rawData = bundle.raw || {};
  const pts = rawData.decimatedPoints || [];
  const sourcePoints = (rawData.originalPoints && Array.isArray(rawData.originalPoints) && rawData.originalPoints.length >= 10)
    ? rawData.originalPoints
    : (rawData.points && Array.isArray(rawData.points) && rawData.points.length >= 10
        ? rawData.points
        : (pts && Array.isArray(pts) && pts.length >= 10 ? pts : []));

  const takeoffRange = setupEl.querySelector('#gm-setup-trim-takeoff-range');
  const landingRange = setupEl.querySelector('#gm-setup-trim-landing-range');
  const takeoffVal = setupEl.querySelector('#gm-setup-trim-takeoff-val');
  const landingVal = setupEl.querySelector('#gm-setup-trim-landing-val');
  const autoDetectBtn = setupEl.querySelector('#btn-setup-auto-detect-trim');
  const applyTrimBtn = setupEl.querySelector('#btn-setup-apply-trim');
  const resetTrimBtn = setupEl.querySelector('#btn-setup-reset-trim');

  const updateTrimLabels = () => {
    if (!sourcePoints || sourcePoints.length === 0) return;
    let tIdx = parseInt(takeoffRange.value, 10);
    let lIdx = parseInt(landingRange.value, 10);
    if (isNaN(tIdx)) tIdx = 0;
    if (isNaN(lIdx)) lIdx = sourcePoints.length - 1;

    if (takeoffVal) takeoffVal.textContent = formatTrimPointLabel(sourcePoints[tIdx], tIdx);
    if (landingVal) landingVal.textContent = formatTrimPointLabel(sourcePoints[lIdx], lIdx);
  };

  if (takeoffRange && landingRange) {
    takeoffRange.addEventListener('input', () => {
      let tIdx = parseInt(takeoffRange.value, 10);
      let lIdx = parseInt(landingRange.value, 10);
      if (tIdx > lIdx - 5) {
        tIdx = Math.max(0, lIdx - 5);
        takeoffRange.value = tIdx;
      }
      updateTrimLabels();
    });

    landingRange.addEventListener('input', () => {
      let tIdx = parseInt(takeoffRange.value, 10);
      let lIdx = parseInt(landingRange.value, 10);
      if (lIdx < tIdx + 5) {
        lIdx = Math.min(sourcePoints.length - 1, tIdx + 5);
        landingRange.value = lIdx;
      }
      updateTrimLabels();
    });
  }

  if (autoDetectBtn) {
    autoDetectBtn.addEventListener('click', () => {
      if (!sourcePoints || sourcePoints.length < 10) return;
      const auto = detectTrimPoints(sourcePoints);
      if (auto && typeof auto.takeoffIndex === 'number' && typeof auto.landingIndex === 'number') {
        if (takeoffRange) takeoffRange.value = auto.takeoffIndex;
        if (landingRange) landingRange.value = auto.landingIndex;
        updateTrimLabels();
      }
    });
  }

  if (applyTrimBtn) {
    applyTrimBtn.addEventListener('click', async () => {
      const tIdx = parseInt(takeoffRange.value, 10);
      const lIdx = parseInt(landingRange.value, 10);
      if (isNaN(tIdx) || isNaN(lIdx) || lIdx - tIdx < 5) return;

      applyTrimBtn.disabled = true;
      try {
        const existing = await logbookManager.adapter.getFlight(flightId);
        if (!existing && bundle.meta) {
          await logbookManager.adapter.saveFlight(bundle.meta, bundle.raw);
        }
        await logbookManager.trimFlightTrack(flightId, tIdx, lIdx);
        await openTrackSetupView(flightId, options);
      } catch (err) {
        console.error('[TrackSetupView] Errore applicazione trimming:', err);
        applyTrimBtn.disabled = false;
      }
    });
  }

  if (resetTrimBtn) {
    resetTrimBtn.addEventListener('click', async () => {
      resetTrimBtn.disabled = true;
      try {
        await logbookManager.resetFlightTrim(flightId);
        await openTrackSetupView(flightId, options);
      } catch (err) {
        console.error('[TrackSetupView] Errore ripristino trimming:', err);
        resetTrimBtn.disabled = false;
      }
    });
  }

  // 4. Elevation Correction Event Listeners
  const applyElevBtn = setupEl.querySelector('#btn-setup-apply-elevation');
  const resetElevBtn = setupEl.querySelector('#btn-setup-reset-elevation');
  const targetTakeoffInput = setupEl.querySelector('#gm-setup-target-takeoff-input');
  const targetLandingInput = setupEl.querySelector('#gm-setup-target-landing-input');

  if (applyElevBtn) {
    applyElevBtn.addEventListener('click', async () => {
      const tAlt = parseFloat(targetTakeoffInput?.value);
      const lAlt = parseFloat(targetLandingInput?.value);
      const modeRadio = setupEl.querySelector('input[name="gm-setup-elevation-mode"]:checked');
      const mode = modeRadio ? modeRadio.value : 'two_point';

      if (isNaN(tAlt)) return;

      applyElevBtn.disabled = true;
      try {
        await logbookManager.correctFlightElevations(
          flightId,
          tAlt,
          isNaN(lAlt) ? null : lAlt,
          mode
        );
        await openTrackSetupView(flightId, options);
      } catch (err) {
        console.error('[TrackSetupView] Errore calibrazione quote:', err);
        applyElevBtn.disabled = false;
      }
    });
  }

  if (resetElevBtn) {
    resetElevBtn.addEventListener('click', async () => {
      resetElevBtn.disabled = true;
      try {
        await logbookManager.resetFlightElevations(flightId);
        await openTrackSetupView(flightId, options);
      } catch (err) {
        console.error('[TrackSetupView] Errore ripristino quote:', err);
        resetElevBtn.disabled = false;
      }
    });
  }

  // Focus back button for keyboard accessibility
  if (backBtn && typeof backBtn.focus === 'function') {
    backBtn.focus();
  }
}
