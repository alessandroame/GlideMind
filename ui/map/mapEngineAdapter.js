/**
 * GlideMind - Map Engine Adapter Pattern (UI / Cartography Layer)
 * 
 * Provides an abstract IMapEngine interface and two concrete implementations:
 * 1. LeafletMapEngine: Interactive raster tile map for browser runtime.
 * 2. HeadlessMockMapEngine: Pure in-memory mock for Node.js test suites.
 * 
 * Enforces:
 * - 3-level progressive marker scaling (dot -> aureole -> micro-vectors)
 * - Dynamic dual-theme tile layer switching (Dark Cockpit vs Sunlight Light Mode)
 * - Wind-corrected glide cone and takeoff wind vector at true takeoff altitude
 */

import { parseCoordinates } from '../../core/comprensorio.js';

export const MAP_THEMES = Object.freeze({
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 19
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }
});

export const STATUS_COLORS = Object.freeze({
  flyable: {
    color: '#15803d',
    fill: '#22c55e',
    badge: 'Volabile',
    icon: '●'
  },
  caution: {
    color: '#b45309',
    fill: '#eab308',
    badge: 'Cautela',
    icon: '▲'
  },
  unflyable: {
    color: '#b91c1c',
    fill: '#ef4444',
    badge: 'Chiuso',
    icon: '✕'
  },
  severe: {
    color: '#09090b',
    fill: '#18181b',
    badge: 'Severo',
    icon: '⚡'
  },
  unavailable: {
    color: '#64748b',
    fill: '#94a3b8',
    badge: 'Dati N/D',
    icon: '○'
  }
});

/**
 * Headless In-Memory Mock Map Engine for deterministic testing.
 */
export class HeadlessMockMapEngine {
  constructor(containerEl = null, options = {}) {
    this.container = containerEl;
    this.options = options;
    this.center = options.center || { lat: 45.4, lon: 8.0 };
    this.zoom = options.zoom || 7;
    this.theme = options.theme || 'dark';
    this.renderedOverlays = [];
    this.renderedMode = 'none'; // 'dot' | 'aureole' | 'micro'
    this.eventListeners = new Map();
    this.destroyed = false;
  }

  init(containerEl, options = {}) {
    this.container = containerEl || this.container;
    this.options = { ...this.options, ...options };
    if (options.center) this.center = options.center;
    if (options.zoom) this.zoom = options.zoom;
    return this;
  }

  setView(center, zoom) {
    if (center) this.center = center;
    if (typeof zoom === 'number') this.zoom = zoom;
    this.emit('moveend', { center: this.center, zoom: this.zoom });
  }

  getView() {
    return { center: { ...this.center }, zoom: this.zoom };
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
  }

  renderOverlays(evaluatedSpots, zoomLevel = null, glider = null) {
    const currentZoom = typeof zoomLevel === 'number' ? zoomLevel : this.zoom;
    this.renderedOverlays = Array.isArray(evaluatedSpots) ? [...evaluatedSpots] : [];

    if (currentZoom < 7.5) {
      this.renderedMode = 'dot';
    } else if (currentZoom < 9.0) {
      this.renderedMode = 'aureole';
    } else {
      this.renderedMode = 'micro';
    }
  }

  clearOverlays() {
    this.renderedOverlays = [];
    this.renderedMode = 'none';
  }

  flyTo(coords, zoom = 9, options = {}) {
    if (coords) this.center = coords;
    if (typeof zoom === 'number') this.zoom = zoom;
    this.emit('moveend', { center: this.center, zoom: this.zoom });
  }

  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName).add(callback);
  }

  off(eventName, callback) {
    if (this.eventListeners.has(eventName)) {
      this.eventListeners.get(eventName).delete(callback);
    }
  }

  emit(eventName, data) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      for (const fn of listeners) {
        try {
          fn(data);
        } catch (err) {
          console.error(`[HeadlessMockMapEngine] Error in ${eventName} listener:`, err);
        }
      }
    }
  }

  destroy() {
    this.destroyed = true;
    this.eventListeners.clear();
    this.renderedOverlays = [];
  }
}

/**
 * Concrete Leaflet Map Engine for the browser DOM runtime.
 */
export class LeafletMapEngine {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.options = options;
    this.map = null;
    this.tileLayer = null;
    this.overlayLayerGroup = null;
    this.theme = options.theme || 'dark';
    this.renderedMode = 'none';
    this.init(containerEl, options);
  }

  init(containerEl, options = {}) {
    if (typeof window === 'undefined' || !window.L) return;
    this.container = containerEl;
    const center = options.center || { lat: 45.4, lon: 8.0 };
    const zoom = options.zoom || 7;

    this.map = window.L.map(containerEl, {
      center: [center.lat, center.lon],
      zoom,
      zoomControl: false,
      attributionControl: false,
      tap: false
    });

    // Add zoom control in top-right to preserve bottom Thumb Zone
    window.L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Apply thematic tile layer
    this.setTheme(this.theme);

    // Create persistent layer group for spots
    this.overlayLayerGroup = window.L.layerGroup().addTo(this.map);

    // Forward map lifecycle events
    this.map.on('moveend', () => {
      if (typeof this.options.onMoveEnd === 'function') {
        const c = this.map.getCenter();
        this.options.onMoveEnd({
          center: { lat: c.lat, lon: c.lng },
          zoom: this.map.getZoom()
        });
      }
    });

    this.map.on('zoomend', () => {
      if (typeof this.options.onZoomEnd === 'function') {
        this.options.onZoomEnd(this.map.getZoom());
      }
    });
  }

  setView(center, zoom) {
    if (this.map && center) {
      this.map.setView([center.lat, center.lon], zoom || this.map.getZoom());
    }
  }

  getView() {
    if (!this.map) return { center: { lat: 45.4, lon: 8.0 }, zoom: 7 };
    const c = this.map.getCenter();
    return {
      center: { lat: c.lat, lon: c.lng },
      zoom: this.map.getZoom()
    };
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    if (!this.map || typeof window === 'undefined' || !window.L) return;

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    const config = MAP_THEMES[this.theme] || MAP_THEMES.dark;
    this.tileLayer = window.L.tileLayer(config.url, {
      attribution: config.attribution,
      subdomains: config.subdomains,
      maxZoom: config.maxZoom
    }).addTo(this.map);
  }

  renderOverlays(evaluatedSpots, zoomLevel = null, glider = null) {
    if (!this.map || !this.overlayLayerGroup || typeof window === 'undefined' || !window.L) return;
    this.overlayLayerGroup.clearLayers();

    if (!Array.isArray(evaluatedSpots) || evaluatedSpots.length === 0) {
      this.renderedMode = 'none';
      return;
    }

    const currentZoom = typeof zoomLevel === 'number' ? zoomLevel : this.map.getZoom();

    if (currentZoom < 7.5) {
      // 1. MACRO ZOOM (5.0 - 7.4): Compact semantic pill/dot
      this.renderedMode = 'dot';
      for (const item of evaluatedSpots) {
        const coords = parseCoordinates(item.takeoff?.coordinates || item.comprensorio?.takeoffs?.[0]?.coordinates);
        if (!coords) continue;

        const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.unavailable;
        const spotName = item.name || item.comprensorio?.name || 'Spot';

        const iconHtml = `
          <div class="gm-map-dot-marker gm-status-${item.status || 'unavailable'}" title="${spotName} - ${statusStyle.badge}">
            <span class="gm-map-dot-glyph">${statusStyle.icon}</span>
            <span class="gm-map-dot-label">${spotName}</span>
          </div>
        `;

        const markerIcon = window.L.divIcon({
          className: 'gm-map-div-icon',
          html: iconHtml,
          iconSize: [120, 24],
          iconAnchor: [12, 12]
        });

        const marker = window.L.marker([coords.lat, coords.lon], { icon: markerIcon });
        marker.on('click', () => {
          if (typeof this.options.onSpotSelect === 'function') {
            this.options.onSpotSelect(item);
          }
        });
        this.overlayLayerGroup.addLayer(marker);
      }
    } else if (currentZoom < 9.0) {
      // 2. MEDIUM ZOOM (7.5 - 8.9): Aerological Basin Aureoles
      this.renderedMode = 'aureole';
      for (const item of evaluatedSpots) {
        const coords = parseCoordinates(item.takeoff?.coordinates || item.comprensorio?.takeoffs?.[0]?.coordinates);
        if (!coords) continue;

        const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.unavailable;
        const spotName = item.name || item.comprensorio?.name || 'Spot';

        // Basin circular aureole (8 km radius)
        const circle = window.L.circle([coords.lat, coords.lon], {
          radius: 8000,
          color: statusStyle.color,
          fillColor: statusStyle.fill,
          fillOpacity: 0.22,
          weight: 2,
          interactive: true
        });

        circle.on('click', () => {
          if (typeof this.options.onSpotSelect === 'function') {
            this.options.onSpotSelect(item);
          }
        });
        this.overlayLayerGroup.addLayer(circle);

        // Center badge with spot name and takeoff altitude
        const altStr = item.takeoff?.altitude ? `${item.takeoff.altitude}m` : '';
        const badgeHtml = `
          <div class="gm-map-aureole-badge gm-status-${item.status || 'unavailable'}">
            <span class="gm-aureole-dot">${statusStyle.icon}</span>
            <span class="gm-aureole-name">${spotName}</span>
            ${altStr ? `<span class="gm-aureole-alt">${altStr}</span>` : ''}
          </div>
        `;

        const centerIcon = window.L.divIcon({
          className: 'gm-map-div-icon',
          html: badgeHtml,
          iconSize: [140, 28],
          iconAnchor: [70, 14]
        });

        const centerMarker = window.L.marker([coords.lat, coords.lon], { icon: centerIcon });
        centerMarker.on('click', () => {
          if (typeof this.options.onSpotSelect === 'function') {
            this.options.onSpotSelect(item);
          }
        });
        this.overlayLayerGroup.addLayer(centerMarker);
      }
    } else {
      // 3. MICRO ZOOM (>= 9.0): High-fidelity vectors (Takeoff, Wind at takeoff altitude, Landing, Glide line)
      this.renderedMode = 'micro';
      for (const item of evaluatedSpots) {
        const tCoord = parseCoordinates(item.takeoff?.coordinates || item.comprensorio?.takeoffs?.[0]?.coordinates);
        const lCoord = parseCoordinates(item.landing?.coordinates || item.comprensorio?.landings?.[0]?.coordinates);
        if (!tCoord) continue;

        const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.unavailable;
        const takeoffName = item.takeoff?.name || 'Decollo';
        const landingName = item.landing?.name || 'Atterraggio';
        const tAlt = item.takeoff?.altitude || 1000;
        const windSpeed = item.weatherSnapshot?.windSpeed ?? 12;
        const windDir = item.weatherSnapshot?.windDir ?? 180;
        const windCard = item.weatherSnapshot?.direction?.cardinal || 'S';

        // 3a. Takeoff marker
        const takeoffHtml = `
          <div class="gm-map-takeoff-marker gm-status-${item.status}">
            <div class="gm-takeoff-badge">
              <span class="gm-takeoff-icon">▲</span>
              <span class="gm-takeoff-title">${takeoffName}</span>
              <span class="gm-takeoff-alt">${tAlt}m</span>
            </div>
            <div class="gm-wind-vector-tag">
              <span class="gm-wind-speed">${Math.round(windSpeed)} km/h ${windCard}</span>
              <span class="gm-wind-level">(${tAlt}m slm)</span>
            </div>
          </div>
        `;

        const takeoffIcon = window.L.divIcon({
          className: 'gm-map-div-icon',
          html: takeoffHtml,
          iconSize: [160, 48],
          iconAnchor: [80, 24]
        });

        const tMarker = window.L.marker([tCoord.lat, tCoord.lon], { icon: takeoffIcon });
        tMarker.on('click', () => {
          if (typeof this.options.onSpotSelect === 'function') {
            this.options.onSpotSelect(item);
          }
        });
        this.overlayLayerGroup.addLayer(tMarker);

        // 3b. Landing marker & Glide Cone line (if landing exists)
        if (lCoord) {
          const lAlt = item.landing?.altitude || 300;
          const glide = item.glideMetrics || { requiredGlideRatio: 5.0, isSafe: true };
          const glideRatioStr = typeof glide.requiredGlideRatio === 'number' ? `1:${glide.requiredGlideRatio}` : '1:5.0';

          const landingHtml = `
            <div class="gm-map-landing-marker ${glide.isSafe ? 'is-safe' : 'is-unsafe'}">
              <span class="gm-landing-icon">⏚</span>
              <span class="gm-landing-name">${landingName}</span>
              <span class="gm-landing-alt">${lAlt}m</span>
            </div>
          `;

          const landingIcon = window.L.divIcon({
            className: 'gm-map-div-icon',
            html: landingHtml,
            iconSize: [140, 28],
            iconAnchor: [70, 14]
          });

          const lMarker = window.L.marker([lCoord.lat, lCoord.lon], { icon: landingIcon });
          lMarker.on('click', () => {
            if (typeof this.options.onSpotSelect === 'function') {
              this.options.onSpotSelect(item);
            }
          });
          this.overlayLayerGroup.addLayer(lMarker);

          // Geodesic dashed glide line between takeoff and landing
          const glideColor = glide.isSafe ? '#16a34a' : (glide.severity === 1 ? '#ca8a04' : '#dc2626');
          const polyline = window.L.polyline(
            [[tCoord.lat, tCoord.lon], [lCoord.lat, lCoord.lon]],
            {
              color: glideColor,
              weight: 3,
              dashArray: '6, 8',
              opacity: 0.85
            }
          );

          polyline.bindTooltip(`Efficienza richiesta: ${glideRatioStr} (${glide.statusText || 'Planata'})`, {
            permanent: false,
            direction: 'center'
          });
          this.overlayLayerGroup.addLayer(polyline);
        }
      }
    }
  }

  clearOverlays() {
    if (this.overlayLayerGroup) {
      this.overlayLayerGroup.clearLayers();
    }
    this.renderedMode = 'none';
  }

  flyTo(coords, zoom = 9, options = {}) {
    if (!this.map || !coords) return;
    this.map.flyTo([coords.lat, coords.lon], zoom, {
      duration: options.duration || 0.8,
      easeLinearity: 0.25
    });
  }

  on(eventName, callback) {
    if (this.map) {
      this.map.on(eventName, callback);
    }
  }

  off(eventName, callback) {
    if (this.map) {
      this.map.off(eventName, callback);
    }
  }

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}

/**
 * Factory function creating either a LeafletMapEngine or a HeadlessMockMapEngine.
 * @param {HTMLElement|null} containerEl
 * @param {object} [options]
 * @returns {LeafletMapEngine | HeadlessMockMapEngine}
 */
export function createMapEngine(containerEl = null, options = {}) {
  if (typeof window !== 'undefined' && window.L && containerEl) {
    try {
      return new LeafletMapEngine(containerEl, options);
    } catch (err) {
      console.warn('[GlideMind Map] Leaflet initialization failed, falling back to HeadlessMockMapEngine:', err);
    }
  }
  return new HeadlessMockMapEngine(containerEl, options);
}
