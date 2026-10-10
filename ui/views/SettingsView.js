/**
 * GlideMind - Settings & Preferences View Controller (UI Layer)
 * Manages synchronized user preferences across views: cartography map layer,
 * visual theme, aeronautical measurement units, active glider profile, and local persistence.
 * Strictly decoupled from DOM globals, pure Node.js testable.
 */

import { store } from '../../core/store.js';
import { APP_VERSION, APP_BUILD } from '../../core/version.js';
import { applyTheme } from '../app.js';

/**
 * Cartographic layer options available across the application.
 */
export const SETTINGS_MAP_LAYERS = Object.freeze([
  {
    id: 'dark',
    name: 'Scuro',
    label: 'Scuro (Antiriflesso)',
    description: 'Esri Dark Canvas per contrasto elevato, penombra e risparmio energetico'
  },
  {
    id: 'topo',
    name: 'OpenTopo',
    label: 'OpenTopo (Curve di Livello)',
    description: 'Rilievo alpino con curve di livello a 20m, toponomastica orografica e quote'
  },
  {
    id: 'satellite',
    name: 'Satellite',
    label: 'Satellite (Ortofoto HD)',
    description: 'Fotografie satellitari Esri World Imagery ad alta risoluzione per studio creste e decolli'
  },
  {
    id: 'streets',
    name: 'CyclOSM',
    label: 'CyclOSM (Outdoor & Sentieri)',
    description: 'Cartografia outdoor specialistica con sentieri CAI, tracce sterrate e Hike & Fly'
  }
]);

/**
 * Escapes HTML characters safely to prevent injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class SettingsViewController {
  /**
   * @param {object} [options]
   * @param {import('../../core/store.js').store} [options.store]
   */
  constructor(options = {}) {
    this.store = options.store || store;
    this.container = null;
    this.storeUnsub = null;
    this.handleClick = this.handleClick.bind(this);
  }

  /**
   * Mounts the Settings view into the container element.
   * @param {HTMLElement} containerEl
   */
  mount(containerEl) {
    this.container = containerEl;
    if (!this.container) return;

    this.render();

    // Attach event delegation listener
    this.container.addEventListener('click', this.handleClick);

    // Subscribe to store updates for reactive synchronization
    if (typeof this.store.subscribe === 'function') {
      this.storeUnsub = this.store.subscribe(() => {
        this.render();
      });
    }
  }

  /**
   * Unmounts the view and cleans up subscriptions and event listeners.
   */
  unmount() {
    if (this.container) {
      this.container.removeEventListener('click', this.handleClick);
      this.container.innerHTML = '';
      this.container = null;
    }
    if (typeof this.storeUnsub === 'function') {
      this.storeUnsub();
      this.storeUnsub = null;
    }
  }

  /**
   * Resolves the active map layer from store.
   * @returns {string}
   */
  getActiveMapLayer() {
    const state = this.store ? this.store.getState() : {};
    return (state.ui && state.ui.mapLayer) || 'dark';
  }

  /**
   * Resolves the active visual theme from store.
   * @returns {string}
   */
  getActiveTheme() {
    const state = this.store ? this.store.getState() : {};
    return (state.ui && state.ui.theme) || 'dark';
  }

  /**
   * Resolves the active measurement units from store.
   * @returns {{ speed: string, altitude: string, temperature: string, vario: string }}
   */
  getActiveUnits() {
    const state = this.store ? this.store.getState() : {};
    return state.units || { speed: 'km/h', altitude: 'm', temperature: 'C', vario: 'm/s' };
  }

  /**
   * Resolves the active glider profile from store.
   * @returns {object|null}
   */
  getActiveGlider() {
    const state = this.store ? this.store.getState() : {};
    return state.activeGlider || null;
  }

  /**
   * Sets the active map layer and persists in store.
   * @param {string} layerId
   */
  setMapLayer(layerId) {
    if (!layerId) return;
    const currentUi = (this.store.getState().ui) || {};
    this.store.setState({
      ui: {
        ...currentUi,
        mapLayer: layerId
      }
    });
  }

  /**
   * Sets the active visual theme and persists in store.
   * @param {string} themeId
   */
  setTheme(themeId) {
    if (themeId !== 'dark' && themeId !== 'light' && themeId !== 'auto') return;
    const currentUi = (this.store.getState().ui) || {};
    this.store.setState({
      ui: {
        ...currentUi,
        theme: themeId
      }
    });
    applyTheme(themeId);
  }

  /**
   * Updates measurement unit preference in store.
   * @param {string} unitKey
   * @param {string} unitValue
   */
  setUnit(unitKey, unitValue) {
    const currentUnits = this.getActiveUnits();
    this.store.setState({
      units: {
        ...currentUnits,
        [unitKey]: unitValue
      }
    });
  }

  /**
   * Resets preferences back to application factory defaults.
   */
  resetPreferences() {
    this.store.setState({
      ui: {
        activeSheet: null,
        drawerOpen: false,
        highContrast: true,
        theme: 'dark',
        mapLayer: 'dark'
      },
      units: {
        speed: 'km/h',
        altitude: 'm',
        temperature: 'C',
        vario: 'm/s'
      }
    });
    applyTheme('dark');
  }

  /**
   * Handles click events via event delegation.
   * @param {MouseEvent} evt
   */
  handleClick(evt) {
    const target = evt.target;
    if (!target) return;

    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.getAttribute('data-action');

    if (action === 'set-map-layer') {
      const layer = actionEl.getAttribute('data-layer');
      if (layer) {
        this.setMapLayer(layer);
      }
    } else if (action === 'set-theme') {
      const theme = actionEl.getAttribute('data-theme');
      if (theme) {
        this.setTheme(theme);
      }
    } else if (action === 'set-speed-unit') {
      const val = actionEl.getAttribute('data-value');
      if (val) this.setUnit('speed', val);
    } else if (action === 'set-altitude-unit') {
      const val = actionEl.getAttribute('data-value');
      if (val) this.setUnit('altitude', val);
    } else if (action === 'set-vario-unit') {
      const val = actionEl.getAttribute('data-value');
      if (val) this.setUnit('vario', val);
    } else if (action === 'reset-preferences') {
      this.resetPreferences();
    }
  }

  /**
   * Renders the complete HTML markup for Settings view.
   * @returns {string}
   */
  renderHtml() {
    const activeLayer = this.getActiveMapLayer();
    const activeTheme = this.getActiveTheme();
    const units = this.getActiveUnits();
    const glider = this.getActiveGlider();

    return `
      <section class="gm-settings-view" aria-label="Impostazioni applicazione">
        <!-- View Header -->
        <header class="gm-settings-header">
          <h1 class="text-xl font-bold text-[var(--gm-text-primary)]">Impostazioni & Preferenze</h1>
          <p class="text-xs text-[var(--gm-text-secondary)] mt-0.5">
            Configurazione cartografia, tema visivo, unità aeronautiche e profilo pilota sincronizzati
          </p>
        </header>

        <!-- Cartography Map Layer Preference -->
        <article class="gm-card" aria-labelledby="heading-cartography-settings">
          <h2 id="heading-cartography-settings" class="gm-settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
              <line x1="8" y1="2" x2="8" y2="18"></line>
              <line x1="16" y1="6" x2="16" y2="22"></line>
            </svg>
            <span>Cartografia & Layer Mappa</span>
          </h2>
          <p class="text-xs text-[var(--gm-text-secondary)] mb-3">
            Seleziona il layer cartografico predefinito. La scelta è sincronizzata in tempo reale con la mini-mappa previsioni e la mappa comprensori, e viene salvata automaticamente nella memoria del dispositivo.
          </p>
          <div class="gm-settings-layer-grid" role="radiogroup" aria-label="Layer cartografico sincronizzato">
            ${SETTINGS_MAP_LAYERS.map(l => {
              const isSelected = l.id === activeLayer;
              return `
                <button
                  type="button"
                  role="radio"
                  class="gm-settings-layer-card ${isSelected ? 'active' : ''}"
                  data-action="set-map-layer"
                  data-layer="${escapeHtml(l.id)}"
                  aria-checked="${isSelected ? 'true' : 'false'}"
                  title="Seleziona layer ${escapeHtml(l.name)}"
                >
                  <div class="flex-1 min-w-0 pr-2">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-bold text-sm text-[var(--gm-text-primary)]">${escapeHtml(l.name)}</span>
                      ${isSelected ? '<span class="text-xs font-mono font-bold text-[var(--gm-accent)]">Attivo</span>' : ''}
                    </div>
                    <p class="text-xs text-[var(--gm-text-secondary)] leading-tight m-0">
                      ${escapeHtml(l.description)}
                    </p>
                  </div>
                  <div class="gm-settings-layer-radio" aria-hidden="true">
                    ${isSelected ? '<div class="gm-settings-layer-radio-dot"></div>' : ''}
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </article>

        <!-- Visual Theme Selection -->
        <article class="gm-card" aria-labelledby="heading-theme-settings">
          <h2 id="heading-theme-settings" class="gm-settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <span>Tema Visivo & Luminanza</span>
          </h2>
          <div class="gm-settings-row">
            <div>
              <div class="font-semibold text-sm text-[var(--gm-text-primary)]">Modalità Schermo</div>
              <div class="text-xs text-[var(--gm-text-secondary)]">Antiriflesso scuro o alta luminanza per sole diretto</div>
            </div>
            <div class="gm-toggle-group" role="radiogroup" aria-label="Modalità tema visivo">
              <button
                type="button"
                class="gm-toggle-btn ${activeTheme === 'dark' ? 'active' : ''}"
                data-action="set-theme"
                data-theme="dark"
                aria-checked="${activeTheme === 'dark' ? 'true' : 'false'}"
              >
                Scuro
              </button>
              <button
                type="button"
                class="gm-toggle-btn ${activeTheme === 'light' ? 'active' : ''}"
                data-action="set-theme"
                data-theme="light"
                aria-checked="${activeTheme === 'light' ? 'true' : 'false'}"
              >
                Chiaro
              </button>
              <button
                type="button"
                class="gm-toggle-btn ${activeTheme === 'auto' ? 'active' : ''}"
                data-action="set-theme"
                data-theme="auto"
                aria-checked="${activeTheme === 'auto' ? 'true' : 'false'}"
              >
                Auto
              </button>
            </div>
          </div>
        </article>

        <!-- Aeronautical Measurement Units -->
        <article class="gm-card" aria-labelledby="heading-units-settings">
          <h2 id="heading-units-settings" class="gm-settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Unità di Misura Aeronautiche</span>
          </h2>
          <div class="gm-settings-row">
            <div>
              <div class="font-semibold text-sm text-[var(--gm-text-primary)]">Velocità del Vento</div>
              <div class="text-xs text-[var(--gm-text-secondary)]">Misura velocità al decollo e raffiche</div>
            </div>
            <div class="gm-toggle-group" role="radiogroup" aria-label="Unità velocità vento">
              <button
                type="button"
                class="gm-toggle-btn ${units.speed === 'km/h' ? 'active' : ''}"
                data-action="set-speed-unit"
                data-value="km/h"
                aria-checked="${units.speed === 'km/h' ? 'true' : 'false'}"
              >
                km/h
              </button>
              <button
                type="button"
                class="gm-toggle-btn ${units.speed === 'knots' ? 'active' : ''}"
                data-action="set-speed-unit"
                data-value="knots"
                aria-checked="${units.speed === 'knots' ? 'true' : 'false'}"
              >
                kt
              </button>
            </div>
          </div>

          <div class="gm-settings-row">
            <div>
              <div class="font-semibold text-sm text-[var(--gm-text-primary)]">Altitudine & Dislivelli</div>
              <div class="text-xs text-[var(--gm-text-secondary)]">Quote decolli, atterraggi e basi cumulo</div>
            </div>
            <div class="gm-toggle-group" role="radiogroup" aria-label="Unità altitudine">
              <button
                type="button"
                class="gm-toggle-btn ${units.altitude === 'm' ? 'active' : ''}"
                data-action="set-altitude-unit"
                data-value="m"
                aria-checked="${units.altitude === 'm' ? 'true' : 'false'}"
              >
                m
              </button>
              <button
                type="button"
                class="gm-toggle-btn ${units.altitude === 'ft' ? 'active' : ''}"
                data-action="set-altitude-unit"
                data-value="ft"
                aria-checked="${units.altitude === 'ft' ? 'true' : 'false'}"
              >
                ft
              </button>
            </div>
          </div>

          <div class="gm-settings-row">
            <div>
              <div class="font-semibold text-sm text-[var(--gm-text-primary)]">Variometro Termica</div>
              <div class="text-xs text-[var(--gm-text-secondary)]">Salita termica e stima efficienza</div>
            </div>
            <div class="gm-toggle-group" role="radiogroup" aria-label="Unità variometro">
              <button
                type="button"
                class="gm-toggle-btn ${units.vario === 'm/s' ? 'active' : ''}"
                data-action="set-vario-unit"
                data-value="m/s"
                aria-checked="${units.vario === 'm/s' ? 'true' : 'false'}"
              >
                m/s
              </button>
              <button
                type="button"
                class="gm-toggle-btn ${units.vario === 'fpm' ? 'active' : ''}"
                data-action="set-vario-unit"
                data-value="fpm"
                aria-checked="${units.vario === 'fpm' ? 'true' : 'false'}"
              >
                fpm
              </button>
            </div>
          </div>
        </article>

        <!-- Glider Profile Summary -->
        <article class="gm-card" aria-labelledby="heading-glider-settings">
          <h2 id="heading-glider-settings" class="gm-settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
              <path d="M2 17l10 5 10-5"></path>
              <path d="M2 12l10 5 10-5"></path>
            </svg>
            <span>Vela Attiva & Hangar</span>
          </h2>
          <div class="flex items-center justify-between">
            <div>
              <div class="font-bold text-sm text-[var(--gm-text-primary)]">
                ${escapeHtml(glider?.name || 'Vela Predefinita (EN-A)')}
              </div>
              <div class="text-xs text-[var(--gm-text-secondary)] font-mono">
                Categoria: ${escapeHtml(glider?.category || 'EN-A')} · VTrim: ${escapeHtml(glider?.vTrim || 38)} km/h · Efficienza: ${escapeHtml(glider?.glideRatio || 8.2)}
              </div>
            </div>
            <a href="#home" class="gm-text-btn" aria-label="Cambia vela nella Home">
              Cambia nella Home ›
            </a>
          </div>
        </article>

        <!-- System & Local Storage Information -->
        <article class="gm-card" aria-labelledby="heading-system-settings">
          <h2 id="heading-system-settings" class="gm-settings-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            <span>Stato Memoria & Versione</span>
          </h2>
          <div class="flex flex-col gap-2 text-xs text-[var(--gm-text-secondary)]">
            <div class="flex justify-between">
              <span>Versione Applicazione:</span>
              <span class="font-mono font-bold text-[var(--gm-text-primary)]">v${escapeHtml(APP_VERSION)} (build ${escapeHtml(APP_BUILD)})</span>
            </div>
            <div class="flex justify-between">
              <span>Archiviazione Locale:</span>
              <span class="font-mono font-bold text-[var(--gm-status-flyable)]">LocalStorage Attivo & Sincronizzato</span>
            </div>
            <div class="flex justify-between">
              <span>Cache Meteo:</span>
              <span class="font-mono text-[var(--gm-text-primary)]">Stale-While-Revalidate (Open-Meteo)</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-[var(--gm-border)] flex justify-end">
            <button
              type="button"
              class="gm-text-btn text-[var(--gm-status-closed)] hover:text-red-400"
              data-action="reset-preferences"
              title="Ripristina tutte le impostazioni ai valori di fabbrica"
            >
              Ripristina Predefinite
            </button>
          </div>
        </article>
      </section>
    `;
  }

  /**
   * Renders the view into its mounted container.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = this.renderHtml();
  }
}

// Default singleton instance
export const settingsView = new SettingsViewController();
