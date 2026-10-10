/**
 * GlideMind - Flight Logbook & Telemetry View Controller (UI Layer)
 * Manages personal flight history, FAI IGC track uploads, career KPIs,
 * altimetric sparkline profiles, authentic IGC downloads, and 3D trajectory replay triggers.
 * 
 * Complies with Laws of UX:
 *  - Von Restorff Effect: Prominent touch >= 48px upload action.
 *  - Doherty Threshold: Instant optimistic feedback (<400ms) with linear progress bar.
 *  - NN/G Heuristic #3: User Control & Grace Period (Undo 5s) on flight deletion.
 *  - Flexbox Anti-Truncation & Mobile Sunlight Contrast (WCAG AA).
 */

import { store } from '../../core/store.js';
import { logbookManager, requestStoragePersistence } from '../../core/logbookDb.js';
import { calculatePilotPeriodMetrics } from '../../core/logbook.js';
import { openFlightDetailSheet } from './FlightDetailSheet.js';

/**
 * Escapes HTML characters safely to prevent XSS injection.
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

export class LogbookViewController {
  /**
   * @param {Object} [options={}]
   * @param {typeof store} [options.store]
   * @param {typeof logbookManager} [options.logbookManager]
   */
  constructor(options = {}) {
    this.store = options.store || store;
    this.logbookManager = options.logbookManager || logbookManager;
    this.containerEl = null;
    this.storeUnsub = null;

    // Storage persistence state
    this.isStoragePersisted = true;
    this.storagePersistenceChecked = false;
    this.storageWarningDismissed = false;

    // Deletion Undo Grace Window (NN/G #3)
    this.pendingDeleteFlight = null;
    this.pendingDeleteTimer = null;
    this.pendingDeleteInterval = null;
    this.pendingDeleteSeconds = 5;

    // Ingestion progress state
    this.isIngesting = false;
    this.ingestionProgress = 0;
    this.importSummaryBanner = null;

    // Bound event handlers
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleFileChange = this.handleFileChange.bind(this);
    this.boundHandleDragOver = this.handleDragOver.bind(this);
    this.boundHandleDragLeave = this.handleDragLeave.bind(this);
    this.boundHandleDrop = this.handleDrop.bind(this);
  }

  /**
   * Mounts the Logbook view into the DOM container.
   * @param {HTMLElement} containerEl
   * @param {Object} [params={}]
   */
  async mount(containerEl, params = {}) {
    this.containerEl = containerEl;
    if (!this.containerEl) return;

    // 1. Initial storage persistence check
    if (!this.storagePersistenceChecked) {
      const res = await requestStoragePersistence();
      this.isStoragePersisted = res.persisted;
      this.storagePersistenceChecked = true;
    }

    // 2. Synchronize flights from DB into store if needed
    try {
      const dbFlights = await this.logbookManager.getAllFlights();
      if (Array.isArray(dbFlights) && dbFlights.length > 0) {
        this.store.setState({ flights: dbFlights });
      }
    } catch (err) {
      console.warn('[LogbookView] Impossibile recuperare voli da logbookDb:', err);
    }

    // 3. Render initial HTML
    this.render();

    // 4. Attach event listeners
    this.containerEl.addEventListener('click', this.boundHandleClick);
    this.containerEl.addEventListener('dragover', this.boundHandleDragOver);
    this.containerEl.addEventListener('dragleave', this.boundHandleDragLeave);
    this.containerEl.addEventListener('drop', this.boundHandleDrop);

    const fileInput = this.containerEl.querySelector('#gm-logbook-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', this.boundHandleFileChange);
    }

    // 5. Subscribe to reactive state updates
    if (typeof this.store.subscribeSlice === 'function') {
      this.storeUnsub = this.store.subscribeSlice('flights', () => {
        this.render();
      });
    }
  }

  /**
   * Unmounts the view, finalizing any pending deletion and clearing listeners.
   */
  unmount() {
    // If an undo deletion is pending upon leaving the view, commit it immediately
    if (this.pendingDeleteFlight) {
      this.commitPendingDeletion();
    }

    if (this.containerEl) {
      this.containerEl.removeEventListener('click', this.boundHandleClick);
      this.containerEl.removeEventListener('dragover', this.boundHandleDragOver);
      this.containerEl.removeEventListener('dragleave', this.boundHandleDragLeave);
      this.containerEl.removeEventListener('drop', this.boundHandleDrop);

      const fileInput = this.containerEl.querySelector('#gm-logbook-file-input');
      if (fileInput) {
        fileInput.removeEventListener('change', this.boundHandleFileChange);
      }

      this.containerEl.innerHTML = '';
      this.containerEl = null;
    }

    if (typeof this.storeUnsub === 'function') {
      this.storeUnsub();
      this.storeUnsub = null;
    }
  }

  /**
   * Main render orchestrator.
   */
  render() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = this.renderHtml();

    // Re-bind file input listener after re-render
    const fileInput = this.containerEl.querySelector('#gm-logbook-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', this.boundHandleFileChange);
    }
  }

  /**
   * Generates the complete HTML markup for the Logbook view.
   * @returns {string} HTML string
   */
  renderHtml() {
    const state = this.store.getState();
    const flights = (state.flights || []).filter(
      (f) => !this.pendingDeleteFlight || f.id !== this.pendingDeleteFlight.id
    );

    // Compute career KPIs dynamically
    let totalMinutes = 0;
    let maxAlt = 0;
    let maxDist = 0;

    for (const f of flights) {
      const dur = Number(f.durationMinutes) || 0;
      totalMinutes += dur;
      const alt = Number(f.maxAltMsl) || 0;
      if (alt > maxAlt) maxAlt = alt;
      const dist = Number(f.distanceKm) || 0;
      if (dist > maxDist) maxDist = dist;
    }

    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    const formattedHours = totalHours >= 10 ? `${Math.round(totalHours)} h` : `${totalHours} h`;

    return `
      <section class="gm-logbook-view" aria-label="Libretto di Volo e Telemetria">
        ${this.renderStorageWarningBanner()}
        ${this.renderUndoBanner()}
        ${this.renderImportSummaryBanner()}

        <!-- Career KPIs Glanceable Grid -->
        <header aria-labelledby="heading-career-kpis">
          <h2 id="heading-career-kpis" class="sr-only">Statistiche di Carriera</h2>
          <div class="gm-career-kpi-grid">
            <div class="gm-career-kpi-card">
              <span class="gm-career-kpi-val">${escapeHtml(formattedHours)}</span>
              <span class="gm-career-kpi-label">Ore Volate</span>
            </div>
            <div class="gm-career-kpi-card">
              <span class="gm-career-kpi-val">${escapeHtml(flights.length)}</span>
              <span class="gm-career-kpi-label">Numero Voli</span>
            </div>
            <div class="gm-career-kpi-card">
              <span class="gm-career-kpi-val">${maxAlt > 0 ? escapeHtml(maxAlt) + ' m' : '--'}</span>
              <span class="gm-career-kpi-label">Quota Max MSL</span>
            </div>
            <div class="gm-career-kpi-card">
              <span class="gm-career-kpi-val">${maxDist > 0 ? escapeHtml(maxDist) + ' km' : '--'}</span>
              <span class="gm-career-kpi-label">Distanza Max</span>
            </div>
          </div>
        </header>

        <!-- Primary Dropzone / Upload Action (Von Restorff Effect) -->
        <div class="gm-logbook-dropzone" id="gm-logbook-dropzone" role="region" aria-label="Caricamento Traccia IGC">
          <input
            type="file"
            id="gm-logbook-file-input"
            accept=".igc,.json,application/json"
            multiple
            style="display: none;"
            aria-hidden="true"
          />
          <button
            type="button"
            class="gm-btn gm-btn-primary"
            data-action="trigger-file-select"
            aria-label="Importa traccia IGC o backup ParaMeteo"
            style="min-height: var(--gm-touch-min, 48px); min-width: 200px;"
          >
            + Importa Traccia IGC / Backup
          </button>
          <div class="gm-logbook-dropzone-title">Trascina qui i tuoi file .IGC o export ParaMeteo .JSON</div>
          <div class="gm-logbook-dropzone-hint">
            Compatibile con Flymaster, Syride, XCSoar, XContest, smartphone e backup completi ParaMeteo.
          </div>

          <div
            class="gm-logbook-progress-wrap"
            id="gm-logbook-progress-wrap"
            style="${this.isIngesting ? 'display: block;' : 'display: none;'}"
            role="progressbar"
            aria-valuenow="${this.ingestionProgress}"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="gm-logbook-progress-bar"
              id="gm-logbook-progress-bar"
              style="width: ${this.ingestionProgress}%;"
            ></div>
          </div>
        </div>

        <!-- Flights List Section -->
        <div class="flex flex-col gap-3">
          <div class="flex justify-between items-center">
            <h3 class="font-bold text-base text-[var(--gm-text-primary)]">
              I Miei Voli (${flights.length})
            </h3>
          </div>

          ${flights.length === 0 ? this.renderEmptyState() : this.renderFlightList(flights)}
        </div>
      </section>
    `;
  }

  /**
   * Renders the storage persistence warning banner if browser persistence was denied.
   * @returns {string}
   */
  renderStorageWarningBanner() {
    if (this.isStoragePersisted || this.storageWarningDismissed) {
      return '';
    }

    return `
      <div class="gm-storage-warning-banner" role="status" aria-live="polite">
        <div>
          <strong>Archiviazione protetta consigliata:</strong> Su questo dispositivo mobile lo storage IndexedDB potrebbe essere liberato dal sistema se inattivo. Aggiungi GlideMind alla schermata Home (PWA) o esegui backup periodici del libretto.
        </div>
        <button
          type="button"
          class="gm-btn gm-btn-ghost text-xs"
          data-action="dismiss-storage-warning"
          aria-label="Ignora promemoria archiviazione"
          style="min-height: 36px; padding: 4px 8px; flex-shrink: 0;"
        >
          OK
        </button>
      </div>
    `;
  }

  /**
   * Renders the Undo Grace Period banner during active deletion (NN/G #3).
   * @returns {string}
   */
  renderUndoBanner() {
    if (!this.pendingDeleteFlight) return '';

    const flightName = this.pendingDeleteFlight.siteName || this.pendingDeleteFlight.site || 'Volo';

    return `
      <div class="gm-logbook-undo-banner" role="alert" aria-live="assertive">
        <div class="text-sm">
          Volo eliminato: <strong>${escapeHtml(flightName)}</strong>
          <span class="text-[var(--gm-text-muted)] ml-1">(${this.pendingDeleteSeconds}s)</span>
        </div>
        <button
          type="button"
          class="gm-btn gm-btn-primary text-xs"
          data-action="undo-delete"
          aria-label="Annulla eliminazione volo"
          style="min-height: 36px; padding: 4px 12px;"
        >
          Annulla
        </button>
      </div>
    `;
  }

  /**
   * Renders the import completion notification banner.
   * @returns {string}
   */
  renderImportSummaryBanner() {
    if (!this.importSummaryBanner) return '';

    return `
      <div class="gm-import-summary-banner" role="status" aria-live="polite">
        <div class="text-sm">
          <strong>${escapeHtml(this.importSummaryBanner.title)}:</strong> ${escapeHtml(this.importSummaryBanner.message)}
        </div>
        <button
          type="button"
          class="gm-btn gm-btn-ghost text-xs"
          data-action="dismiss-import-summary"
          aria-label="Chiudi notifica importazione"
          style="min-height: 36px; padding: 4px 10px; flex-shrink: 0;"
        >
          OK
        </button>
      </div>
    `;
  }

  /**
   * Renders the empty state when no flights have been uploaded yet.
   * @returns {string}
   */
  renderEmptyState() {
    return `
      <div class="gm-logbook-empty" role="region" aria-label="Nessun volo registrato">
        <div class="font-bold text-base text-[var(--gm-text-primary)]">
          Nessun volo memorizzato nel Logbook
        </div>
        <div class="text-sm max-w-md">
          Carica il tuo primo file .IGC per analizzare la telemetria, il guadagno in termica e visualizzare la traccia.
        </div>
      </div>
    `;
  }

  /**
   * Renders the flight cards list.
   * @param {Array<Object>} flights
   * @returns {string}
   */
  renderFlightList(flights) {
    const totalCount = Array.isArray(flights) ? flights.length : 0;
    return `
      <div class="gm-flight-list" role="list" aria-label="Elenco dei voli">
        ${flights.map((flight, index) => {
          const flightNum = flight.flightNumber || (totalCount - index);
          return this.renderFlightCard(flight, flightNum);
        }).join('')}
      </div>
    `;
  }

  /**
   * Renders a single flight card with altimetric sparkline, metrics, and actions.
   * @param {Object} flight
   * @param {number|string} [flightNumber=null] - Progressive flight number
   * @returns {string}
   */
  renderFlightCard(flight, flightNumber = null) {
    const flightId = flight.id;
    const title = flight.siteName || flight.site || 'Volo da IGC';
    const dateFormatted = flight.date || 'Data N/D';
    const takeoffTime = flight.takeoffTime ? `Ore ${flight.takeoffTime}` : '';
    const duration = flight.durationMinutes ? `${flight.durationMinutes} min` : '';
    const glider = flight.glider || 'Parapendio';
    const gliderClass = flight.gliderClass || 'Custom';
    const classBadgeStyle = (gliderClass || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
    const maxAlt = flight.maxAltMsl ? `${flight.maxAltMsl} m` : '--';
    const maxGain = flight.maxGainMeters ? `+${flight.maxGainMeters} m` : '--';
    const climbRate = flight.maxClimbRate ? `${flight.maxClimbRate} m/s` : '--';
    const thermals = flight.thermalsCount != null
      ? `${flight.thermalsCount} ${flight.thermalsCount === 1 ? 'termica' : 'termiche'}`
      : '--';
    const distance = flight.distanceKm ? `${flight.distanceKm} km` : '--';
    const sparkline = flight.sparklineSvgPoints || '0,16 100,16';

    const siteArea = flight.site && flight.site !== title ? flight.site : '';

    return `
      <article class="gm-flight-card" role="listitem" aria-labelledby="fl-title-${escapeHtml(flightId)}">
        <!-- Flight Header (Clickable for detail sheet) -->
        <div class="gm-flight-card-header cursor-pointer" role="button" tabindex="0" data-action="open-flight-detail" data-flight-id="${escapeHtml(flightId)}">
          <div class="flex items-start gap-2.5 min-w-0 flex-1">
            ${flightNumber != null ? `<span class="gm-flight-number-badge" aria-label="Volo numero ${flightNumber}">#${escapeHtml(flightNumber)}</span>` : ''}
            <div class="flex flex-col min-w-0 flex-1">
              <h4 id="fl-title-${escapeHtml(flightId)}" class="gm-flight-site-title">
                ${escapeHtml(title)}
              </h4>
              <div class="gm-flight-card-sub">
                ${siteArea ? `<span>${escapeHtml(siteArea)}</span><span>•</span>` : ''}
                <span>${escapeHtml(dateFormatted)}</span>
                ${takeoffTime ? `<span>•</span><span>${escapeHtml(takeoffTime)}</span>` : ''}
                ${duration ? `<span>•</span><span>${escapeHtml(duration)}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Glider badge -->
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span class="gm-glider-pill-badge ${classBadgeStyle}">
              ${escapeHtml(gliderClass)}
            </span>
            <span class="text-xs font-semibold text-[var(--gm-text-secondary)] max-w-[120px] truncate" title="${escapeHtml(glider)}">
              ${escapeHtml(glider)}
            </span>
          </div>
        </div>

        <!-- Altimetric Sparkline (Clickable for detail sheet) -->
        <div class="gm-flight-sparkline-wrap cursor-pointer" role="button" tabindex="0" data-action="open-flight-detail" data-flight-id="${escapeHtml(flightId)}" title="Clicca per aprire i dettagli del volo">
          <svg viewBox="0 0 100 32" class="gm-flight-sparkline" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="${escapeHtml(sparkline)}" class="gm-flight-sparkline-polyline" />
          </svg>
        </div>

        <!-- Telemetry Metrics Grid -->
        <div class="gm-flight-metrics-grid">
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(maxAlt)}</span>
            <span class="gm-flight-metric-desc">Quota Max MSL</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(maxGain)}</span>
            <span class="gm-flight-metric-desc">Guadagno Max</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(climbRate)}</span>
            <span class="gm-flight-metric-desc">Salita Max</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(thermals)}</span>
            <span class="gm-flight-metric-desc">Attività Termica</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(distance)}</span>
            <span class="gm-flight-metric-desc">Distanza GPS</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-num">${escapeHtml(duration || '--')}</span>
            <span class="gm-flight-metric-desc">Tempo in Volo</span>
          </div>
        </div>

        <!-- Actions Footer -->
        <div class="gm-flight-card-actions">
          <button
            type="button"
            class="gm-btn gm-btn-ghost text-xs font-bold text-[var(--gm-accent-sky)]"
            data-action="open-flight-detail"
            data-flight-id="${escapeHtml(flightId)}"
            aria-label="Dettagli e debriefing del volo ${escapeHtml(title)}"
            style="min-height: 38px; padding: 6px 12px;"
          >
            Dettagli &amp; Debriefing
          </button>
          <button
            type="button"
            class="gm-btn gm-btn-ghost text-xs"
            data-action="replay-flight"
            data-flight-id="${escapeHtml(flightId)}"
            aria-label="Visualizza replay 3D del volo ${escapeHtml(title)}"
            style="min-height: 38px; padding: 6px 12px;"
          >
            Visualizza Replay 3D
          </button>
          <button
            type="button"
            class="gm-btn gm-btn-ghost text-xs"
            data-action="download-igc"
            data-flight-id="${escapeHtml(flightId)}"
            aria-label="Scarica file originale IGC del volo ${escapeHtml(title)}"
            style="min-height: 38px; padding: 6px 12px;"
          >
            Scarica IGC
          </button>
          <button
            type="button"
            class="gm-btn gm-btn-ghost text-xs text-red-500 hover:text-red-400"
            data-action="delete-flight"
            data-flight-id="${escapeHtml(flightId)}"
            aria-label="Elimina volo ${escapeHtml(title)}"
            style="min-height: 38px; padding: 6px 12px;"
          >
            Elimina
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Event delegation router for user interactions.
   * @param {Event} e
   */
  async handleClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    const actionBtn = target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-action');
    const flightId = actionBtn.getAttribute('data-flight-id');

    switch (action) {
      case 'trigger-file-select': {
        const fileInput = this.containerEl?.querySelector('#gm-logbook-file-input');
        if (fileInput) {
          fileInput.click();
        }
        break;
      }
      case 'open-flight-detail': {
        await this.handleOpenFlightDetail(flightId);
        break;
      }
      case 'replay-flight': {
        this.handleReplayFlight(flightId);
        break;
      }
      case 'download-igc': {
        await this.handleDownloadIgc(flightId);
        break;
      }
      case 'delete-flight': {
        this.startPendingDeletion(flightId);
        break;
      }
      case 'undo-delete': {
        this.cancelPendingDeletion();
        break;
      }
      case 'dismiss-storage-warning': {
        this.storageWarningDismissed = true;
        this.render();
        break;
      }
      case 'dismiss-import-summary': {
        this.importSummaryBanner = null;
        this.render();
        break;
      }
    }
  }

  /**
   * Handles user file selection from disk.
   * @param {Event} e
   */
  async handleFileChange(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (!input || !input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    await this.processUploadedFiles(files);
    input.value = ''; // Reset input so same file can be re-selected
  }

  /**
   * Dragover listener with styling.
   * @param {DragEvent} e
   */
  handleDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    const dropzone = this.containerEl?.querySelector('#gm-logbook-dropzone');
    if (dropzone) {
      dropzone.classList.add('dragover');
    }
  }

  /**
   * DragLeave listener.
   * @param {DragEvent} e
   */
  handleDragLeave(e) {
    const dropzone = this.containerEl?.querySelector('#gm-logbook-dropzone');
    if (dropzone) {
      dropzone.classList.remove('dragover');
    }
  }

  /**
   * Drop listener handling drag & drop IGC and ParaMeteo JSON files.
   * @param {DragEvent} e
   */
  async handleDrop(e) {
    e.preventDefault();
    const dropzone = this.containerEl?.querySelector('#gm-logbook-dropzone');
    if (dropzone) {
      dropzone.classList.remove('dragover');
    }

    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith('.igc') || n.endsWith('.json');
    });
    if (files.length > 0) {
      await this.processUploadedFiles(files);
    }
  }

  /**
   * Processes a list of IGC or ParaMeteo JSON files sequentially with progress reporting.
   * @param {Array<File>} files
   */
  async processUploadedFiles(files) {
    if (!files || files.length === 0) return;

    this.isIngesting = true;
    this.ingestionProgress = 0;
    this.importSummaryBanner = null;
    this.render();

    const progressWrap = this.containerEl?.querySelector('#gm-logbook-progress-wrap');
    const progressBar = /** @type {HTMLElement} */ (this.containerEl?.querySelector('#gm-logbook-progress-bar'));

    if (progressWrap) progressWrap.style.display = 'block';

    const totalFiles = files.length;
    let completedFiles = 0;
    let totalImportedFlights = 0;
    let totalImportedTracks = 0;

    for (const file of files) {
      const fileNameLower = file.name.toLowerCase();
      try {
        const text = await file.text();
        if (fileNameLower.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
          // ParaMeteo JSON export or backup package
          const res = await this.logbookManager.importParaMeteoBackup(text, {
            onProgress: (pct) => {
              const overallPct = Math.round(((completedFiles + pct / 100) / totalFiles) * 100);
              if (progressBar) progressBar.style.width = `${overallPct}%`;
            }
          });
          if (res && res.success) {
            totalImportedFlights += (res.importedFlightsCount || 0);
            totalImportedTracks += (res.tracksImportedCount || 0);
          }
        } else {
          // Standard FAI IGC file
          await this.logbookManager.importIgcTrack(text, {
            fileName: file.name,
            onProgress: (pct) => {
              const overallPct = Math.round(((completedFiles + pct / 100) / totalFiles) * 100);
              if (progressBar) progressBar.style.width = `${overallPct}%`;
            }
          });
          totalImportedFlights += 1;
        }
      } catch (err) {
        console.error(`[LogbookView] Errore importazione file ${file.name}:`, err);
      }
      completedFiles++;
      const overallPct = Math.round((completedFiles / totalFiles) * 100);
      if (progressBar) progressBar.style.width = `${overallPct}%`;
    }

    this.isIngesting = false;
    if (totalImportedFlights > 0) {
      const tracksMsg = totalImportedTracks > 0 ? ` (${totalImportedTracks} con traccia GPS)` : '';
      this.importSummaryBanner = {
        title: 'Importazione completata',
        message: `${totalImportedFlights} ${totalImportedFlights === 1 ? 'volo importato' : 'voli importati'}${tracksMsg}.`
      };
    }
    this.render();
  }

  /**
   * Backward-compatible alias for processUploadedFiles.
   * @param {Array<File>} files
   */
  async processIgcFiles(files) {
    return this.processUploadedFiles(files);
  }

  /**
   * Triggers download of an authentic FAI IGC file.
   * @param {string} flightId
   */
  async handleDownloadIgc(flightId) {
    if (!flightId) return;
    try {
      await this.logbookManager.exportFlightIgc(flightId);
    } catch (err) {
      console.error('[LogbookView] Errore download IGC:', err);
    }
  }

  /**
   * Prepares or navigates to 3D trajectory replay.
   * @param {string} flightId
   */
  handleReplayFlight(flightId) {
    if (!flightId) return;
    // Synchronize selected flight in store for Replay 3D (Fase 7)
    if (typeof window !== 'undefined' && window.location) {
      window.location.hash = `#replay?flightId=${encodeURIComponent(flightId)}`;
    }
  }

  /**
   * Initiates Undo deletion grace period (5 seconds) per NN/G Heuristic #3.
   * @param {string} flightId
   */
  startPendingDeletion(flightId) {
    if (!flightId) return;

    // If another deletion was already pending, commit it first
    if (this.pendingDeleteFlight) {
      this.commitPendingDeletion();
    }

    const state = this.store.getState();
    const flight = (state.flights || []).find((f) => f.id === flightId);
    if (!flight) return;

    this.pendingDeleteFlight = flight;
    this.pendingDeleteSeconds = 5;

    // Optimistically re-render view without this flight
    this.render();

    // Start 1-second interval countdown
    this.pendingDeleteInterval = setInterval(() => {
      this.pendingDeleteSeconds -= 1;
      if (this.pendingDeleteSeconds <= 0) {
        this.commitPendingDeletion();
      } else {
        // Update countdown number in DOM banner directly to prevent full re-render
        const bannerText = this.containerEl?.querySelector('.gm-logbook-undo-banner span');
        if (bannerText) {
          bannerText.textContent = `(${this.pendingDeleteSeconds}s)`;
        }
      }
    }, 1000);
  }

  /**
   * Cancels pending deletion and restores flight view.
   */
  cancelPendingDeletion() {
    if (this.pendingDeleteInterval) {
      clearInterval(this.pendingDeleteInterval);
      this.pendingDeleteInterval = null;
    }
    this.pendingDeleteFlight = null;
    this.render();
  }

  /**
   * Commits deletion permanently to database and updates store.
   */
  async commitPendingDeletion() {
    if (this.pendingDeleteInterval) {
      clearInterval(this.pendingDeleteInterval);
      this.pendingDeleteInterval = null;
    }
    const flightToDelete = this.pendingDeleteFlight;
    this.pendingDeleteFlight = null;

    if (flightToDelete && flightToDelete.id) {
      try {
        await this.logbookManager.deleteFlight(flightToDelete.id);
      } catch (err) {
        console.error('[LogbookView] Errore eliminazione definitiva volo:', err);
      }
    }
    this.render();
  }

  /**
   * Opens the flight detail & debriefing sheet.
   * @param {string} flightId
   */
  async handleOpenFlightDetail(flightId) {
    if (!flightId) return;
    await openFlightDetailSheet(flightId);
  }
}

/**
 * Singleton LogbookViewController instance.
 */
export const logbookView = new LogbookViewController();
