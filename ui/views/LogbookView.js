/**
 * GlideMind - Flight Logbook & Telemetry View Controller (UI Layer)
 * Manages personal flight history, search & filtering, lean glanceable flight cards,
 * tab switching (Flights Feed vs Pilot Currency/Stats), and triggers for the dedicated Import Sheet.
 * 
 * Complies with Laws of UX:
 *  - Fitts's Law: Entire card is a touch target (>= 48px), single-row quick filter carousel.
 *  - Hick's Law: Separation of flight logbook feed vs pilot currency & career statistics.
 *  - Doherty Threshold: Instant search and responsive tab switching (<400ms).
 *  - NN/G Heuristic #3: User Control & Grace Period (Undo 5s) on flight deletion.
 *  - Flexbox Anti-Truncation & Mobile Sunlight Contrast (WCAG AA).
 */

import { store } from '../../core/store.js';
import { logbookManager, requestStoragePersistence } from '../../core/logbookDb.js';
import { openFlightDetailSheet } from './FlightDetailSheet.js';
import { openImportFlightSheet, processImportFiles } from './ImportFlightSheet.js';
import { renderLogbookStatsHtml } from './LogbookStatsView.js';

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

    // View sub-tabs: 'flights' | 'stats'
    this.activeTab = 'flights';

    // Search and filter state
    this.searchQuery = '';
    this.activeFilter = 'all'; // 'all' | 'EN-A' | 'EN-B' | 'year-current'

    // Storage persistence state
    this.isStoragePersisted = true;
    this.storagePersistenceChecked = false;
    this.storageWarningDismissed = false;

    // Deletion Undo Grace Window (NN/G #3)
    this.pendingDeleteFlight = null;
    this.pendingDeleteTimer = null;
    this.pendingDeleteInterval = null;
    this.pendingDeleteSeconds = 5;

    // Ingestion state & summary
    this.isIngesting = false;
    this.ingestionProgress = 0;
    this.importSummaryBanner = null;

    // Bound event handlers
    this.boundHandleClick = this.handleClick.bind(this);
    this.boundHandleSearchInput = this.handleSearchInput.bind(this);
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

    if (params && params.tab === 'stats') {
      this.activeTab = 'stats';
    }

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
    if (this.pendingDeleteFlight) {
      this.commitPendingDeletion();
    }

    if (this.containerEl) {
      this.containerEl.removeEventListener('click', this.boundHandleClick);
      this.containerEl.removeEventListener('dragover', this.boundHandleDragOver);
      this.containerEl.removeEventListener('dragleave', this.boundHandleDragLeave);
      this.containerEl.removeEventListener('drop', this.boundHandleDrop);

      const searchInput = this.containerEl.querySelector('#gm-logbook-search-input');
      if (searchInput) {
        searchInput.removeEventListener('input', this.boundHandleSearchInput);
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

    // Re-bind search input listener
    const searchInput = this.containerEl.querySelector('#gm-logbook-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this.boundHandleSearchInput);
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

    return `
      <section class="gm-logbook-view" role="region" aria-label="Libretto di Volo e Telemetria">
        ${this.renderStorageWarningBanner()}
        ${this.renderUndoBanner()}
        ${this.renderImportSummaryBanner()}

        <!-- Header Bar: Title, Import Trigger & Segmented Control -->
        <header class="gm-logbook-header">
          <div class="gm-logbook-header-top">
            <h2 class="gm-logbook-title">Libretto di Volo</h2>
            <button
              type="button"
              class="gm-btn gm-btn-primary gm-logbook-import-btn"
              data-action="open-import-sheet"
              aria-label="Importa traccia IGC o backup ParaMeteo"
              style="min-height: var(--gm-touch-min, 48px); padding: 8px 16px;"
            >
              + Importa
            </button>
          </div>

          <!-- Segmented Control: Voli vs Statistiche -->
          <div class="gm-segmented-control" role="tablist" aria-label="Sezioni del Libretto">
            <button
              type="button"
              class="gm-segment-btn ${this.activeTab === 'flights' ? 'active' : ''}"
              data-action="switch-tab"
              data-tab="flights"
              role="tab"
              aria-selected="${this.activeTab === 'flights'}"
              style="min-height: var(--gm-touch-min, 48px);"
            >
              Voli (${flights.length})
            </button>
            <button
              type="button"
              class="gm-segment-btn ${this.activeTab === 'stats' ? 'active' : ''}"
              data-action="switch-tab"
              data-tab="stats"
              role="tab"
              aria-selected="${this.activeTab === 'stats'}"
              style="min-height: var(--gm-touch-min, 48px);"
            >
              Statistiche &amp; Valuta
            </button>
          </div>
        </header>

        <!-- Dynamic Tab Content -->
        ${this.activeTab === 'stats' ? this.renderStatsTab(flights) : this.renderFlightsTab(flights)}
      </section>
    `;
  }

  /**
   * Renders the pure flights history feed tab.
   * @param {Array<Object>} flights
   * @returns {string}
   */
  renderFlightsTab(flights) {
    if (flights.length === 0) {
      return this.renderEmptyState();
    }

    const filteredFlights = this.filterFlights(flights);

    return `
      <div class="gm-flights-tab-content flex flex-col gap-3">
        <!-- Search and Quick Filter Chips -->
        <div class="gm-logbook-search-wrap">
          <div class="gm-search-input-box">
            <svg class="gm-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="search"
              id="gm-logbook-search-input"
              class="gm-logbook-search-input"
              placeholder="Cerca decollo, atterraggio, vela o note..."
              value="${escapeHtml(this.searchQuery)}"
              aria-label="Cerca nei voli"
            />
            ${this.searchQuery ? `
              <button type="button" class="gm-search-clear-btn" data-action="clear-search" aria-label="Cancella ricerca">&times;</button>
            ` : ''}
          </div>

          <!-- Single-row horizontal filter chips (touch-action: pan-x) -->
          <div class="gm-logbook-filters-carousel" role="toolbar" aria-label="Filtri rapidi">
            <button
              type="button"
              class="gm-filter-chip ${this.activeFilter === 'all' ? 'active' : ''}"
              data-action="filter-flights"
              data-filter="all"
            >
              Tutti
            </button>
            <button
              type="button"
              class="gm-filter-chip ${this.activeFilter === 'EN-A' ? 'active' : ''}"
              data-action="filter-flights"
              data-filter="EN-A"
            >
              EN-A
            </button>
            <button
              type="button"
              class="gm-filter-chip ${this.activeFilter === 'EN-B' ? 'active' : ''}"
              data-action="filter-flights"
              data-filter="EN-B"
            >
              EN-B
            </button>
            <button
              type="button"
              class="gm-filter-chip ${this.activeFilter === 'year-current' ? 'active' : ''}"
              data-action="filter-flights"
              data-filter="year-current"
            >
              Quest'anno
            </button>
          </div>
        </div>

        <!-- Flights List -->
        <div id="gm-flight-list-container">
          ${filteredFlights.length === 0 ? this.renderNoFilterMatches() : this.renderFlightList(filteredFlights, flights.length)}
        </div>
      </div>
    `;
  }

  /**
   * Filters flights based on search query and active category chip.
   * @param {Array<Object>} flights
   * @returns {Array<Object>}
   */
  filterFlights(flights) {
    let result = flights;

    if (this.activeFilter === 'EN-A') {
      result = result.filter((f) => (f.gliderClass || '').toUpperCase() === 'EN-A');
    } else if (this.activeFilter === 'EN-B') {
      result = result.filter((f) => (f.gliderClass || '').toUpperCase() === 'EN-B');
    } else if (this.activeFilter === 'year-current') {
      const currentYear = new Date().getFullYear().toString();
      result = result.filter((f) => (f.date || '').startsWith(currentYear));
    }

    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter((f) => {
        const text = `${f.siteName || ''} ${f.site || ''} ${f.glider || ''} ${f.notes || ''}`.toLowerCase();
        return text.includes(q);
      });
    }

    return result;
  }

  /**
   * Renders the Pilot Statistics & Currency Tab.
   * @param {Array<Object>} flights
   * @returns {string}
   */
  renderStatsTab(flights) {
    return renderLogbookStatsHtml(flights);
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
        <div class="text-sm max-w-md text-center text-[var(--gm-text-secondary)]">
          Carica il tuo primo file .IGC o ripristina un backup ParaMeteo per analizzare la telemetria, il guadagno in termica e visualizzare la traccia.
        </div>
        <button
          type="button"
          class="gm-btn gm-btn-primary mt-2"
          data-action="open-import-sheet"
          aria-label="Importa traccia IGC o backup ParaMeteo"
          style="min-height: var(--gm-touch-min, 48px); min-width: 220px;"
        >
          + Importa Traccia IGC / Backup
        </button>
      </div>
    `;
  }

  /**
   * Renders empty state when search/filter returns zero matches.
   * @returns {string}
   */
  renderNoFilterMatches() {
    return `
      <div class="gm-logbook-no-matches text-center py-8">
        <p class="text-sm font-semibold text-[var(--gm-text-secondary)]">Nessun volo corrisponde ai filtri selezionati.</p>
        <button
          type="button"
          class="gm-btn gm-btn-ghost text-xs mt-2"
          data-action="reset-filters"
          aria-label="Reimposta tutti i filtri"
        >
          Azzera Filtri
        </button>
      </div>
    `;
  }

  /**
   * Renders the flight cards list.
   * @param {Array<Object>} flights - Filtered flights
   * @param {number} totalOriginalCount - Total unfiltered flights count
   * @returns {string}
   */
  renderFlightList(flights, totalOriginalCount = null) {
    const totalCount = totalOriginalCount || flights.length;
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
   * Renders a single lean flight card (~110px height).
   * @param {Object} flight
   * @param {number|string} [flightNumber=null] - Progressive flight number
   * @returns {string}
   */
  renderFlightCard(flight, flightNumber = null) {
    const flightId = flight.id;
    const title = flight.siteName || flight.site || 'Volo da IGC';
    const dateFormatted = flight.date || 'Data N/D';
    const takeoffTime = flight.takeoffTime ? `Ore ${flight.takeoffTime}` : '';
    const duration = flight.durationMinutes ? `${flight.durationMinutes} min` : '--';
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
    const sparkline = flight.sparklineSvgPoints || '';
    const hasValidSparkline = sparkline &&
      sparkline.split(' ').length > 2 &&
      !sparkline.includes('0,16 100,16') &&
      !sparkline.includes('0,12 100,12');
    const siteArea = flight.site && flight.site !== title ? flight.site : '';

    return `
      <article
        class="gm-flight-card gm-flight-card-compact"
        role="listitem"
        aria-labelledby="fl-title-${escapeHtml(flightId)}"
        data-action="open-flight-detail"
        data-flight-id="${escapeHtml(flightId)}"
        tabindex="0"
      >
        <!-- Flight Card Header Row -->
        <div class="gm-flight-card-header">
          <div class="gm-flight-title-group">
            ${flightNumber != null ? `<span class="gm-flight-number-badge" aria-label="Volo numero ${flightNumber}">#${escapeHtml(flightNumber)}</span>` : ''}
            <h4 id="fl-title-${escapeHtml(flightId)}" class="gm-flight-site-title" title="${escapeHtml(title)}">
              ${escapeHtml(title)}
            </h4>
          </div>

          <div class="gm-flight-badge-group">
            <span class="gm-glider-pill-badge ${classBadgeStyle}">
              ${escapeHtml(gliderClass)}
            </span>
            <button
              type="button"
              class="gm-flight-delete-btn"
              data-action="delete-flight"
              data-flight-id="${escapeHtml(flightId)}"
              aria-label="Elimina volo ${escapeHtml(title)}"
              title="Elimina volo"
            >
              &times;
            </button>
          </div>
        </div>

        <!-- Date & Glider info row (No duplicate duration) -->
        <div class="gm-flight-card-sub">
          <span>${escapeHtml(dateFormatted)}</span>
          ${takeoffTime ? `<span>•</span><span>${escapeHtml(takeoffTime)}</span>` : ''}
          ${siteArea ? `<span>•</span><span class="font-medium text-[var(--gm-text-secondary)]">${escapeHtml(siteArea)}</span>` : ''}
          <span class="truncate max-w-[140px] text-[var(--gm-text-secondary)] font-medium">• ${escapeHtml(glider)}</span>
        </div>

        <!-- Altimetric Sparkline (Rendered only if track has altitude variation) -->
        ${hasValidSparkline ? `
          <div class="gm-flight-sparkline-wrap" aria-hidden="true">
            <svg viewBox="0 0 100 24" class="gm-flight-sparkline" preserveAspectRatio="none">
              <polyline points="${escapeHtml(sparkline)}" class="gm-flight-sparkline-polyline" />
            </svg>
          </div>
        ` : ''}

        <!-- Glanceable 3-Metric Row (Grid-based: Never wraps) -->
        <div class="gm-flight-metrics-row">
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-val">${escapeHtml(duration)}</span>
            <span class="gm-flight-metric-lbl">Tempo</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-val">${escapeHtml(maxAlt)}</span>
            <span class="gm-flight-metric-lbl">Quota MSL</span>
          </div>
          <div class="gm-flight-metric-item">
            <span class="gm-flight-metric-val">${escapeHtml(maxGain)}</span>
            <span class="gm-flight-metric-lbl">Guadagno</span>
          </div>
          <span class="gm-flight-chevron" aria-hidden="true">&#8250;</span>
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
      case 'open-import-sheet': {
        openImportFlightSheet({
          logbookManager: this.logbookManager,
          store: this.store,
          onSuccess: () => this.render()
        });
        break;
      }
      case 'switch-tab': {
        const tab = actionBtn.getAttribute('data-tab');
        if (tab && (tab === 'flights' || tab === 'stats')) {
          this.activeTab = tab;
          this.render();
        }
        break;
      }
      case 'filter-flights': {
        const filter = actionBtn.getAttribute('data-filter');
        if (filter) {
          this.activeFilter = filter;
          this.render();
        }
        break;
      }
      case 'clear-search':
      case 'reset-filters': {
        this.searchQuery = '';
        this.activeFilter = 'all';
        this.render();
        break;
      }
      case 'open-flight-detail': {
        if (flightId) {
          await this.handleOpenFlightDetail(flightId);
        }
        break;
      }
      case 'delete-flight': {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (flightId) {
          this.startPendingDeletion(flightId);
        }
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
      case 'download-igc': {
        if (flightId) await this.handleDownloadIgc(flightId);
        break;
      }
      case 'replay-flight': {
        if (flightId) this.handleReplayFlight(flightId);
        break;
      }
    }
  }

  /**
   * Search input handler.
   * @param {Event} e
   */
  handleSearchInput(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (!input) return;
    this.searchQuery = input.value;

    const state = this.store.getState();
    const flights = (state.flights || []).filter(
      (f) => !this.pendingDeleteFlight || f.id !== this.pendingDeleteFlight.id
    );
    const filteredFlights = this.filterFlights(flights);

    const listContainer = this.containerEl?.querySelector('#gm-flight-list-container');
    if (listContainer) {
      listContainer.innerHTML = filteredFlights.length === 0
        ? this.renderNoFilterMatches()
        : this.renderFlightList(filteredFlights, flights.length);
    }
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
  }

  /**
   * DragLeave listener.
   * @param {DragEvent} e
   */
  handleDragLeave(e) {
    // No-op
  }

  /**
   * Drop listener handling drag & drop IGC and ParaMeteo JSON files.
   * @param {DragEvent} e
   */
  async handleDrop(e) {
    e.preventDefault();
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
    this.importSummaryBanner = null;

    let totalImportedFlights = 0;
    let totalImportedTracks = 0;

    await processImportFiles(files, {
      manager: this.logbookManager,
      storeInstance: this.store,
      onSuccess: (res) => {
        totalImportedFlights = res.importedFlightsCount || 0;
        totalImportedTracks = res.tracksImportedCount || 0;
      }
    });

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

    if (this.pendingDeleteFlight) {
      this.commitPendingDeletion();
    }

    const state = this.store.getState();
    const flight = (state.flights || []).find((f) => f.id === flightId);
    if (!flight) return;

    this.pendingDeleteFlight = flight;
    this.pendingDeleteSeconds = 5;

    this.render();

    this.pendingDeleteInterval = setInterval(() => {
      this.pendingDeleteSeconds -= 1;
      if (this.pendingDeleteSeconds <= 0) {
        this.commitPendingDeletion();
      } else {
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
