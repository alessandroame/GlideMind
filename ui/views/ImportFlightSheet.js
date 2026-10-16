/**
 * GlideMind - Flight & Backup Import Sheet (UI Layer)
 * Dedicated modal drawer for FAI IGC track uploads and ParaMeteo JSON backups.
 * Keeps the main Logbook view clean and focused on flight browsing.
 * 
 * Features:
 *  - FAI IGC and ParaMeteo V1/V2 JSON format auto-detection.
 *  - Drag & drop zone with responsive touch target (>= 48px).
 *  - Deterministic progress reporting with linear progress bar.
 *  - Post-import summary with one-click return to logbook.
 *  - Governed by Laws of UX (Von Restorff, Doherty <400ms, Single Active Sheet).
 */

import { openSheet, closeSheet } from '../sheetManager.js';
import { logbookManager } from '../../core/logbookDb.js';
import { createFlightLogEntry } from '../../core/logbook.js';
import { DEFAULT_COMPRENSORI } from '../../core/comprensorio.js';
import { getPastDatePresets, formatDateIso } from '../../core/datePresets.js';
import { store } from '../../core/store.js';

/**
 * Escapes HTML characters safely.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates the HTML markup for the unified Import & Manual Flight Sheet content body.
 * @param {Object} [options={}]
 * @returns {string} HTML string
 */
export function renderImportSheetHtml(options = {}) {
  const targetStore = options.store || store;
  const state = targetStore && typeof targetStore.getState === 'function' ? targetStore.getState() : {};
  const today = state.activeDate || formatDateIso(new Date());
  const pastPresets = getPastDatePresets(new Date(), 4);
  const catalog = Array.isArray(state.locationsCatalog) && state.locationsCatalog.length > 0
    ? state.locationsCatalog
    : DEFAULT_COMPRENSORI;
  const spotOptions = catalog.map((c) => {
    const label = `${c.name}${c.province ? ` (${c.province})` : ''}`;
    return `<option value="${escapeHtml(c.name)}">${escapeHtml(label)}</option>`;
  }).join('');

  return `
    <div class="gm-import-sheet-content" role="region" aria-label="Importazione Tracce e Registrazione Volo">
      <div class="gm-import-sheet-header">
        <p class="gm-import-sheet-intro">
          Carica un file di volo (.IGC o backup .JSON) oppure registra rapidamente una sessione manuale nel libretto.
        </p>
      </div>

      <!-- Dropzone -->
      <div class="gm-import-sheet-dropzone" id="gm-import-sheet-dropzone" role="region" aria-label="Area di rilascio file">
        <input
          type="file"
          id="gm-import-sheet-file-input"
          accept=".igc,.json,application/json"
          multiple
          class="hidden"
          aria-hidden="true"
        />

        <div class="gm-import-dropzone-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <div class="gm-import-sheet-dropzone-title">Trascina qui i tuoi file</div>
        <div class="gm-import-sheet-dropzone-sub">oppure selezionali dal dispositivo</div>

        <button
          type="button"
          class="gm-btn gm-btn-primary gm-import-browse-btn"
          id="gm-import-browse-btn"
          style="min-height: var(--gm-touch-min, 48px);"
          aria-label="Seleziona file dal dispositivo"
        >
          Sfoglia File (.IGC / .JSON)
        </button>
      </div>

      <!-- Supported formats & compatibility card -->
      <div class="gm-import-compat-card">
        <div class="gm-import-compat-title">Formati e Strumenti Supportati:</div>
        <ul class="gm-import-compat-list">
          <li><strong>Tracce FAI IGC:</strong> Flymaster, Syride, XCSoar, XContest, smartphone.</li>
          <li><strong>Backup ParaMeteo:</strong> esportazioni complete V1 e V2 con unione cronologica e deduplicazione automatica.</li>
        </ul>
      </div>

      <!-- Manual Flight Entry Collapsible Section -->
      <details class="gm-glider-custom-details" id="gm-manual-flight-details">
        <summary class="gm-glider-custom-summary">Registra Volo Manualmente (Senza Traccia)</summary>
        <form id="gm-manual-flight-form" class="gm-sheet-form mt-2.5">
          <div class="gm-form-group">
            <label for="gm-manual-flight-date" class="gm-form-label">Data del Volo</label>
            <div class="gm-past-presets" role="group" aria-label="Scelta rapida data">
              ${pastPresets.map(p => `
                <button
                  type="button"
                  class="gm-past-preset-chip ${p.date === today ? 'active' : ''}"
                  data-manual-date-preset="${escapeHtml(p.date)}"
                >${escapeHtml(p.label)}</button>
              `).join('')}
            </div>
            <input type="date" id="gm-manual-flight-date" class="gm-form-input" value="${escapeHtml(today)}" required />
          </div>

          <div class="gm-form-group">
            <label for="gm-manual-flight-site" class="gm-form-label">Località / Comprensorio</label>
            <select id="gm-manual-flight-site" class="gm-form-input">
              ${spotOptions}
            </select>
          </div>

          <div class="gm-form-group">
            <label for="gm-manual-flight-duration" class="gm-form-label">Durata (minuti)</label>
            <div class="gm-duration-presets">
              <button type="button" class="gm-preset-chip" data-manual-duration-add="15">+15m</button>
              <button type="button" class="gm-preset-chip" data-manual-duration-add="30">+30m</button>
              <button type="button" class="gm-preset-chip" data-manual-duration-add="60">+60m</button>
              <button type="button" class="gm-preset-chip" data-manual-duration-add="90">+90m</button>
            </div>
            <input type="number" id="gm-manual-flight-duration" class="gm-form-input" value="45" min="1" max="600" required />
          </div>

          <div class="gm-form-group">
            <label for="gm-manual-flight-notes" class="gm-form-label">Note / Debriefing (opzionale)</label>
            <textarea
              id="gm-manual-flight-notes"
              class="gm-form-textarea"
              rows="2"
              placeholder="Es. Termica generosa in cresta, orecchie e wingover in discesa..."
            ></textarea>
            <span class="gm-form-hint">Le sessioni di termica ed esercizi vengono dedotte in automatico dalle note.</span>
          </div>

          <button
            type="submit"
            class="gm-btn gm-btn-primary gm-btn-full"
            id="gm-manual-flight-save-btn"
          >
            Salva Volo nel Libretto
          </button>
        </form>
      </details>

      <!-- Progress Section (Dynamic) -->
      <div id="gm-import-progress-wrap" class="gm-import-progress-section hidden" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
        <div class="gm-import-progress-header">
          <span id="gm-import-progress-status" class="gm-import-progress-status">Importazione in corso...</span>
          <span id="gm-import-progress-pct" class="gm-import-progress-pct">0%</span>
        </div>
        <div class="gm-import-progress-bar-bg">
          <div id="gm-import-progress-bar" class="gm-import-progress-bar" style="width: 0%;"></div>
        </div>
      </div>

      <!-- Summary Outcome Section (Dynamic) -->
      <div id="gm-import-summary-wrap" class="gm-import-summary-wrap hidden" role="status" aria-live="polite">
        <div class="gm-import-summary-badge">
          <span id="gm-import-summary-icon" class="gm-import-summary-icon">&#10003;</span>
          <div class="gm-import-summary-text">
            <h4 id="gm-import-summary-title" class="font-bold text-sm text-[var(--gm-text-primary)]">Importazione Completata</h4>
            <p id="gm-import-summary-msg" class="text-xs text-[var(--gm-text-muted)]"></p>
          </div>
        </div>
        <button
          type="button"
          class="gm-btn gm-btn-primary w-full"
          id="gm-import-done-btn"
          aria-label="Chiudi e torna al flight log"
        >
          Vai al Flight Log
        </button>
      </div>
    </div>
  `;
}

/**
 * Handles the actual file parsing and database ingestion.
 * @param {Array<File>} files
 * @param {Object} options
 * @param {typeof logbookManager} options.manager
 * @param {typeof store} options.storeInstance
 * @param {() => void} [options.onSuccess]
 */
export async function processImportFiles(files, options = {}) {
  if (!files || files.length === 0) return;

  const manager = options.manager || logbookManager;
  const targetStore = options.storeInstance || store;

  const progressWrap = typeof document !== 'undefined' ? document.getElementById('gm-import-progress-wrap') : null;
  const progressBar = typeof document !== 'undefined' ? document.getElementById('gm-import-progress-bar') : null;
  const progressStatus = typeof document !== 'undefined' ? document.getElementById('gm-import-progress-status') : null;
  const progressPct = typeof document !== 'undefined' ? document.getElementById('gm-import-progress-pct') : null;
  const dropzone = typeof document !== 'undefined' ? document.getElementById('gm-import-sheet-dropzone') : null;
  const summaryWrap = typeof document !== 'undefined' ? document.getElementById('gm-import-summary-wrap') : null;
  const summaryMsg = typeof document !== 'undefined' ? document.getElementById('gm-import-summary-msg') : null;

  if (progressWrap) {
    progressWrap.classList.remove('hidden');
    progressWrap.style.display = 'block';
  }
  if (dropzone) dropzone.style.display = 'none';

  const totalFiles = files.length;
  let completedFiles = 0;
  let totalImportedFlights = 0;
  let totalImportedTracks = 0;

  for (const file of files) {
    const fileNameLower = file.name.toLowerCase();
    if (progressStatus) {
      progressStatus.textContent = `Elaborazione ${escapeHtml(file.name)} (${completedFiles + 1}/${totalFiles})...`;
    }

    try {
      const text = await file.text();
      if (fileNameLower.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        // ParaMeteo Backup Package
        const res = await manager.importParaMeteoBackup(text, {
          onProgress: (pct) => {
            const overallPct = Math.round(((completedFiles + pct / 100) / totalFiles) * 100);
            if (progressBar) progressBar.style.width = `${overallPct}%`;
            if (progressPct) progressPct.textContent = `${overallPct}%`;
          }
        });
        if (res && res.success) {
          totalImportedFlights += (res.importedFlightsCount || 0);
          totalImportedTracks += (res.tracksImportedCount || 0);
        }
      } else {
        // Standard FAI IGC Track
        await manager.importIgcTrack(text, {
          fileName: file.name,
          onProgress: (pct) => {
            const overallPct = Math.round(((completedFiles + pct / 100) / totalFiles) * 100);
            if (progressBar) progressBar.style.width = `${overallPct}%`;
            if (progressPct) progressPct.textContent = `${overallPct}%`;
          }
        });
        totalImportedFlights += 1;
      }
    } catch (err) {
      console.error(`[ImportFlightSheet] Error processing file ${file.name}:`, err);
    }

    completedFiles++;
    const overallPct = Math.round((completedFiles / totalFiles) * 100);
    if (progressBar) progressBar.style.width = `${overallPct}%`;
    if (progressPct) progressPct.textContent = `${overallPct}%`;
  }

  // Refresh flights in reactive store
  try {
    const updatedFlights = await manager.getAllFlights();
    if (Array.isArray(updatedFlights) && targetStore && typeof targetStore.setState === 'function') {
      targetStore.setState({ flights: updatedFlights });
    }
  } catch (err) {
    console.warn('[ImportFlightSheet] Error synchronizing store:', err);
  }

  // Show summary
  if (progressWrap) {
    progressWrap.classList.add('hidden');
    progressWrap.style.display = 'none';
  }
  if (summaryWrap) {
    summaryWrap.classList.remove('hidden');
    summaryWrap.style.display = 'flex';
    const tracksText = totalImportedTracks > 0 ? ` (${totalImportedTracks} con traccia GPS)` : '';
    if (summaryMsg) {
      summaryMsg.textContent = `${totalImportedFlights} ${totalImportedFlights === 1 ? 'volo importato' : 'voli importati'}${tracksText}. Dati sincronizzati nel flight log.`;
    }
  }

  if (typeof options.onSuccess === 'function') {
    options.onSuccess({
      importedFlightsCount: totalImportedFlights,
      tracksImportedCount: totalImportedTracks
    });
  }
}

/**
 * Opens the dedicated Import & Manual Flight Entry Sheet.
 * @param {Object} [options={}]
 * @param {typeof logbookManager} [options.logbookManager]
 * @param {typeof store} [options.store]
 * @param {() => void} [options.onSuccess]
 */
export function openImportFlightSheet(options = {}) {
  const manager = options.logbookManager || logbookManager;
  const targetStore = options.store || store;

  openSheet({
    id: 'import-flight',
    title: 'Aggiungi o Importa Volo',
    content: renderImportSheetHtml({ store: targetStore }),
    onOpen: () => {
      if (typeof document === 'undefined') return;

      const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('gm-import-sheet-file-input'));
      const browseBtn = document.getElementById('gm-import-browse-btn');
      const dropzone = document.getElementById('gm-import-sheet-dropzone');
      const doneBtn = document.getElementById('gm-import-done-btn');
      const manualForm = /** @type {HTMLFormElement} */ (document.getElementById('gm-manual-flight-form'));

      if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', () => {
          fileInput.click();
        });
      }

      if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
          const input = /** @type {HTMLInputElement} */ (e.target);
          if (!input || !input.files || input.files.length === 0) return;
          const files = Array.from(input.files);
          await processImportFiles(files, {
            manager,
            storeInstance: targetStore,
            onSuccess: options.onSuccess
          });
          input.value = '';
        });
      }

      if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
          dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', async (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
          if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
          const files = Array.from(e.dataTransfer.files).filter((f) => {
            const n = f.name.toLowerCase();
            return n.endsWith('.igc') || n.endsWith('.json');
          });
          if (files.length > 0) {
            await processImportFiles(files, {
              manager,
              storeInstance: targetStore,
              onSuccess: options.onSuccess
            });
          }
        });
      }

      if (manualForm) {
        // Date preset chips
        const datePresets = manualForm.querySelectorAll('[data-manual-date-preset]');
        const dateInput = /** @type {HTMLInputElement} */ (document.getElementById('gm-manual-flight-date'));
        datePresets.forEach((btn) => {
          btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-manual-date-preset');
            if (val && dateInput) {
              dateInput.value = val;
              datePresets.forEach((b) => b.classList.toggle('active', b === btn));
            }
          });
        });

        // Duration preset chips
        const durBtns = manualForm.querySelectorAll('[data-manual-duration-add]');
        const durInput = /** @type {HTMLInputElement} */ (document.getElementById('gm-manual-flight-duration'));
        durBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            const addVal = parseInt(btn.getAttribute('data-manual-duration-add'), 10) || 15;
            if (durInput) {
              durInput.value = String(addVal);
            }
          });
        });

        // Manual form submission
        manualForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const siteInput = /** @type {HTMLSelectElement} */ (document.getElementById('gm-manual-flight-site'));
          const notesInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('gm-manual-flight-notes'));
          const state = targetStore && typeof targetStore.getState === 'function' ? targetStore.getState() : {};
          const activeGlider = state.activeGlider || state.glider || {};

          const newFlight = createFlightLogEntry({
            date: dateInput ? dateInput.value : undefined,
            siteName: siteInput ? siteInput.value : 'Monte Cornizzolo',
            site: siteInput ? siteInput.value : 'Monte Cornizzolo',
            durationMinutes: durInput ? parseInt(durInput.value, 10) || 45 : 45,
            glider: activeGlider.brand && activeGlider.model
              ? `${activeGlider.brand} ${activeGlider.model}`
              : (activeGlider.name || 'Parapendio'),
            gliderClass: activeGlider.category || 'EN-A',
            notes: notesInput ? notesInput.value : ''
          });

          const currentFlights = Array.isArray(state.flights) ? state.flights : [];
          if (targetStore && typeof targetStore.setState === 'function') {
            targetStore.setState({ flights: [newFlight, ...currentFlights] });
          }

          if (manager && typeof manager.saveFlight === 'function') {
            try {
              await manager.saveFlight(newFlight);
            } catch (_) {}
          }

          if (typeof options.onSuccess === 'function') {
            options.onSuccess({ importedFlightsCount: 1, tracksImportedCount: 0 });
          }
          closeSheet();
        });
      }

      if (doneBtn) {
        doneBtn.addEventListener('click', () => {
          closeSheet();
        });
      }
    }
  });
}
