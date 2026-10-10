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
 * Generates the HTML markup for the Import Sheet content body.
 * @returns {string} HTML string
 */
export function renderImportSheetHtml() {
  return `
    <div class="gm-import-sheet-content" role="region" aria-label="Importazione Tracce e Backup">
      <div class="gm-import-sheet-header">
        <p class="gm-import-sheet-intro">
          Carica i tuoi file di volo per analizzare termiche, guadagni e visualizzare la traccia in 3D.
        </p>
      </div>

      <!-- Dropzone -->
      <div class="gm-import-sheet-dropzone" id="gm-import-sheet-dropzone" role="region" aria-label="Area di rilascio file">
        <input
          type="file"
          id="gm-import-sheet-file-input"
          accept=".igc,.json,application/json"
          multiple
          style="display: none;"
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
          class="gm-btn gm-btn-primary"
          id="gm-import-browse-btn"
          aria-label="Seleziona file dal dispositivo"
          style="min-height: var(--gm-touch-min, 48px); min-width: 220px;"
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

      <!-- Progress Section (Dynamic) -->
      <div id="gm-import-progress-wrap" class="gm-import-progress-section" style="display: none;" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
        <div class="gm-import-progress-header">
          <span id="gm-import-progress-status" class="gm-import-progress-status">Importazione in corso...</span>
          <span id="gm-import-progress-pct" class="gm-import-progress-pct">0%</span>
        </div>
        <div class="gm-import-progress-bar-bg">
          <div id="gm-import-progress-bar" class="gm-import-progress-bar" style="width: 0%;"></div>
        </div>
      </div>

      <!-- Summary Outcome Section (Dynamic) -->
      <div id="gm-import-summary-wrap" class="gm-import-summary-wrap" style="display: none;" role="status" aria-live="polite">
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
          aria-label="Chiudi e torna al libretto di volo"
          style="min-height: var(--gm-touch-min, 48px);"
        >
          Vai al Libretto di Volo
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

  if (progressWrap) progressWrap.style.display = 'block';
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
      console.error(`[ImportFlightSheet] Errore elaborazione file ${file.name}:`, err);
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
    console.warn('[ImportFlightSheet] Errore sincronizzazione store:', err);
  }

  // Show summary
  if (progressWrap) progressWrap.style.display = 'none';
  if (summaryWrap) {
    summaryWrap.style.display = 'flex';
    const tracksText = totalImportedTracks > 0 ? ` (${totalImportedTracks} con traccia GPS)` : '';
    if (summaryMsg) {
      summaryMsg.textContent = `${totalImportedFlights} ${totalImportedFlights === 1 ? 'volo importato' : 'voli importati'}${tracksText}. Dati sincronizzati nel libretto.`;
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
 * Opens the dedicated Import Flight Sheet.
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
    title: 'Importa Traccia o Backup',
    content: renderImportSheetHtml(),
    onOpen: () => {
      if (typeof document === 'undefined') return;

      const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('gm-import-sheet-file-input'));
      const browseBtn = document.getElementById('gm-import-browse-btn');
      const dropzone = document.getElementById('gm-import-sheet-dropzone');
      const doneBtn = document.getElementById('gm-import-done-btn');

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

      if (doneBtn) {
        doneBtn.addEventListener('click', () => {
          closeSheet();
        });
      }
    }
  });
}
