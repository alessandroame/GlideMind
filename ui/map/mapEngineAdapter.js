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
import {
  normalizeAngle,
  calculateWindsockKinematics,
  generateWindsockSvg,
  generateWindsockKeyframeCss
} from '../../core/windsock.js';

export const MAP_LAYERS = Object.freeze({
  topo: Object.freeze({
    id: 'topo',
    name: 'OpenTopo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 19,
    maxNativeZoom: 17
  }),
  satellite: Object.freeze({
    id: 'satellite',
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; World Imagery',
    maxZoom: 19,
    maxNativeZoom: 19
  }),
  dark: Object.freeze({
    id: 'dark',
    name: 'Scuro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Dark Gray Canvas',
    maxZoom: 19,
    maxNativeZoom: 16
  }),
  streets: Object.freeze({
    id: 'streets',
    name: 'CyclOSM',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.cyclosm.org">CyclOSM</a>',
    maxZoom: 19,
    maxNativeZoom: 18
  })
});

export const MAP_THEMES = Object.freeze({
  dark: MAP_LAYERS.dark,
  light: MAP_LAYERS.topo
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
    this.currentLayerId = options.layer || (this.theme === 'light' ? 'topo' : 'dark');
    this.renderedOverlays = [];
    this.renderedMode = 'circular';
    this.preferCanvas = Boolean(options.preferCanvas);
    this.isCanvasRendered = Boolean(options.preferCanvas);
    this.activePopupSpotId = null;
    this.eventListeners = new Map();
    this.isPaused = false;
    this.paused = false;
    this.destroyed = false;
  }

  init(containerEl, options = {}) {
    this.container = containerEl || this.container;
    this.options = { ...this.options, ...options };
    if (options.center) this.center = options.center;
    if (options.zoom) this.zoom = options.zoom;
    if (options.preferCanvas !== undefined) {
      this.preferCanvas = Boolean(options.preferCanvas);
      this.isCanvasRendered = Boolean(options.preferCanvas);
    }
    return this;
  }

  setView(center, zoom) {
    if (center) this.center = center;
    if (typeof zoom === 'number') this.zoom = zoom;
    this.emit('moveend', { center: this.center, zoom: this.zoom, bounds: this.getBounds() });
  }

  getBounds() {
    const latDelta = 10 / Math.pow(2, Math.max(0, this.zoom - 5));
    const lonDelta = 15 / Math.pow(2, Math.max(0, this.zoom - 5));
    return {
      south: this.center.lat - latDelta,
      north: this.center.lat + latDelta,
      west: this.center.lon - lonDelta,
      east: this.center.lon + lonDelta,
      getSouth: () => this.center.lat - latDelta,
      getNorth: () => this.center.lat + latDelta,
      getWest: () => this.center.lon - lonDelta,
      getEast: () => this.center.lon + lonDelta
    };
  }

  getView() {
    return { center: { ...this.center }, zoom: this.zoom };
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    this.currentLayerId = this.theme === 'light' ? 'topo' : 'dark';
  }

  setLayer(layerId) {
    this.currentLayerId = layerId;
    this.theme = (layerId === 'dark' || layerId === 'satellite') ? 'dark' : 'light';
  }

  renderOverlays(evaluatedSpots, zoomLevel = null, glider = null, activeSpotId = null) {
    this.renderedOverlays = Array.isArray(evaluatedSpots) ? [...evaluatedSpots] : [];
    this.activeSpotId = activeSpotId;
    this.renderedMode = 'circular';
    this.isCanvasRendered = Boolean(this.options.preferCanvas || (evaluatedSpots && evaluatedSpots.length > 50));
  }

  openSpotPopup(spotId) {
    this.activePopupSpotId = spotId;
    return true;
  }

  closeSpotPopup() {
    this.activePopupSpotId = null;
  }

  clearOverlays() {
    this.renderedOverlays = [];
    this.activePopupSpotId = null;
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

  renderSpotMiniMap(containerEl, spotData, options = {}) {
    this.container = containerEl || this.container;
    this.activeMiniMapSpotData = spotData;
    this.renderedMode = 'minimap';
    this.destroyed = false;
    return this;
  }

  updateWindsockMarker(weatherSnapshot, isLanding = false, takeoff = null) {
    this.lastWindsockUpdate = { weatherSnapshot, isLanding, takeoff };
    if (takeoff && this.activeMiniMapSpotData) {
      this.activeMiniMapSpotData.takeoff = takeoff;
    }
  }

  updateGlideLine(glideMetrics) {
    this.lastGlideUpdate = glideMetrics;
  }

  renderComprensorioFlightMap(containerEl, data, options = {}) {
    this.container = containerEl || this.container;
    this.activeFlightMapData = data;
    this.renderedMode = 'flightAnalysis';
    this.circuitData = data?.circuitData || null;
    this.procedures = this.circuitData;
    this.renderedCircuitPolylines = data?.circuitData?.polylines ? Object.keys(data.circuitData.polylines) : [];
    this.paused = false;
    this.destroyed = false;
    return this;
  }

  updateFlightProcedures(circuitData, options = {}) {
    this.lastCircuitUpdate = circuitData;
    this.circuitData = circuitData;
    this.procedures = circuitData;
    if (circuitData?.polylines) {
      this.renderedCircuitPolylines = Object.keys(circuitData.polylines);
    }
  }

  pause() {
    this.paused = true;
    this.isPaused = true;
  }

  resume() {
    this.paused = false;
    this.isPaused = false;
  }

  invalidateSize() {
    return this;
  }

  centerOnComprensorio() {
    this.centeredOnComprensorio = true;
    return this;
  }

  showUserLocation(lat, lon) {
    this.userLocation = { lat, lon };
    return this;
  }

  destroy() {
    this.destroyed = true;
    this.eventListeners.clear();
    this.renderedOverlays = [];
    this.activeMiniMapSpotData = null;
    this.activeFlightMapData = null;
    this.lastWindsockUpdate = null;
    this.lastGlideUpdate = null;
    this.lastCircuitUpdate = null;
    this.renderedCircuitPolylines = [];
  }
}

/**
 * Generates an SVG string representing the takeoff slope exposure sector (launch window).
 * Displays a 70° sector (heading ± 35°), the slope aspect arrow, and the heading angle badge.
 * Dynamically color-codes based on wind alignment (green = front, amber = cross, red = tail).
 * 
 * @param {number} heading Azimuth of the takeoff slope (0..360)
 * @param {number|null} [windDirection=null] Current wind direction (0..360)
 * @param {number|null} [altitude=null] Takeoff altitude in meters
 * @param {object} [options={}] Optional configuration
 * @returns {string} Clean SVG markup
 */
export function generateTakeoffSectorSvg(heading = 180, windDirection = null, altitude = null, options = {}) {
  const H = normalizeAngle(heading);
  const size = options.size || 130;
  const center = size / 2; // 65
  const radius = options.radius || 46;
  const prefix = options.prefix || 'miniws-to-';

  // Compute launch window: heading ± 35°
  const halfAngle = 35;
  const startAngle = normalizeAngle(H - halfAngle);
  const endAngle = normalizeAngle(H + halfAngle);

  // SVG polar coordinates: 0° is North (top), 90° East (right), 180° South (bottom), 270° West (left)
  const radStart = (startAngle - 90) * (Math.PI / 180);
  const radEnd = (endAngle - 90) * (Math.PI / 180);
  const radCenter = (H - 90) * (Math.PI / 180);

  const xStart = Math.round((center + radius * Math.cos(radStart)) * 10) / 10;
  const yStart = Math.round((center + radius * Math.sin(radStart)) * 10) / 10;
  const xEnd = Math.round((center + radius * Math.cos(radEnd)) * 10) / 10;
  const yEnd = Math.round((center + radius * Math.sin(radEnd)) * 10) / 10;

  // Arrow tip along slope heading
  const arrowLen = radius + 9;
  const xArrow = Math.round((center + arrowLen * Math.cos(radCenter)) * 10) / 10;
  const yArrow = Math.round((center + arrowLen * Math.sin(radCenter)) * 10) / 10;

  // Determine alignment color based on wind direction vs slope heading
  let statusColor = '#22c55e'; // Green: aligned (front wind)
  let fillColor = 'rgba(34, 197, 94, 0.22)';
  let statusLabel = 'In Asse';

  if (windDirection != null) {
    let diff = (Number(windDirection) - Number(H)) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const absDiff = Math.abs(diff);

    if (absDiff > 75) {
      statusColor = '#ef4444'; // Red: tailwind / rotori
      fillColor = 'rgba(239, 68, 68, 0.25)';
      statusLabel = 'Sottovento';
    } else if (absDiff > 35) {
      statusColor = '#f59e0b'; // Amber: crosswind
      fillColor = 'rgba(245, 158, 11, 0.22)';
      statusLabel = 'Traverso';
    }
  }

  // Sector arc path (70° opening, clockwise)
  const sectorPath = `M ${center} ${center} L ${xStart} ${yStart} A ${radius} ${radius} 0 0 1 ${xEnd} ${yEnd} Z`;

  // Arrowhead points
  const headLen = 7;
  const headAngle = 0.45;
  const xHead1 = Math.round((xArrow - headLen * Math.cos(radCenter - headAngle)) * 10) / 10;
  const yHead1 = Math.round((yArrow - headLen * Math.sin(radCenter - headAngle)) * 10) / 10;
  const xHead2 = Math.round((xArrow - headLen * Math.cos(radCenter + headAngle)) * 10) / 10;
  const yHead2 = Math.round((yArrow - headLen * Math.sin(radCenter + headAngle)) * 10) / 10;

  // Heading angle badge location (offset beyond arrow tip)
  const labelDist = arrowLen + 9;
  const xLabel = Math.round((center + labelDist * Math.cos(radCenter)) * 10) / 10;
  const yLabel = Math.round((center + labelDist * Math.sin(radCenter)) * 10) / 10;

  return `
    <svg class="gm-takeoff-sector-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow: visible; pointer-events: none;" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Esposizione decollo ${H} gradi (${statusLabel})">
      <!-- Launch Window Sector (+/-35 deg) -->
      <path id="${prefix}wedge" d="${sectorPath}" fill="${fillColor}" stroke="${statusColor}" stroke-width="1.5" stroke-dasharray="3 2" />
      
      <!-- Central Slope Aspect Line -->
      <line id="${prefix}line" x1="${center}" y1="${center}" x2="${xArrow}" y2="${yArrow}" stroke="${statusColor}" stroke-width="2.2" stroke-linecap="round" />
      
      <!-- Directional Arrowhead -->
      <polygon id="${prefix}arrow" points="${xArrow},${yArrow} ${xHead1},${yHead1} ${xHead2},${yHead2}" fill="${statusColor}" />
      
      <!-- Heading Angle Pill Badge -->
      <g id="${prefix}badge" transform="translate(${xLabel}, ${yLabel})">
        <rect x="-16" y="-8" width="32" height="15" rx="4" fill="rgba(18, 22, 31, 0.90)" stroke="${statusColor}" stroke-width="1" />
        <text x="0" y="2.5" font-family="monospace" font-size="9" font-weight="700" fill="#ffffff" text-anchor="middle">${Math.round(H)}°</text>
      </g>

      <!-- Center Hub Pivot Ring -->
      <circle id="${prefix}hub" cx="${center}" cy="${center}" r="11" fill="var(--gm-bg-card, #12161f)" stroke="${statusColor}" stroke-width="2" />
      <text x="${center}" y="${center + 3.5}" font-size="10" font-weight="800" fill="${statusColor}" text-anchor="middle">▲</text>
      ${altitude ? `<text x="${center}" y="${center + 21}" font-family="monospace" font-size="8.5" font-weight="700" fill="#cbd5e1" text-anchor="middle" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.9))">${altitude}m</text>` : ''}
    </svg>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    this.markersMap = new Map();
    this.lastRenderedSignature = null;
    this.activeSpotId = null;
    this.windsockMarker = null;
    this.takeoffSectorMarker = null;
    this.glidePolyline = null;
    this.landingMarker = null;
    this.takeoffMarker = null;
    this.theme = options.theme || 'dark';
    this.isMiniMap = Boolean(options.isMiniMap);
    this.canvasRenderer = null;
    this.renderedMode = 'circular';
    this.lastComprensorioBounds = null;
    this.userLocationMarker = null;
    this.init(containerEl, options);
  }

  init(containerEl, options = {}) {
    if (typeof window === 'undefined' || !window.L) return;
    this.container = containerEl;
    this.options = { ...this.options, ...options };
    this.isMiniMap = Boolean(this.options.isMiniMap);
    const center = this.options.center || { lat: 45.4, lon: 8.0 };
    const zoom = this.options.zoom || (this.isMiniMap ? 14 : 7);

    const mapOptions = {
      center: [center.lat, center.lon],
      zoom,
      zoomControl: false,
      attributionControl: false,
      tap: false
    };

    if (this.isMiniMap) {
      mapOptions.dragging = false;
      mapOptions.touchZoom = false;
      mapOptions.scrollWheelZoom = false;
      mapOptions.doubleClickZoom = false;
      mapOptions.boxZoom = false;
      mapOptions.keyboard = false;
    }

    this.map = window.L.map(containerEl, mapOptions);

    if (!this.isMiniMap && !this.options.isFlightAnalysis && this.options.zoomControl !== false) {
      // Add zoom control in top-right to preserve bottom Thumb Zone
      window.L.control.zoom({ position: 'topright' }).addTo(this.map);
    }

    // Apply thematic tile layer
    if (this.options.layer) {
      this.setLayer(this.options.layer);
    } else {
      this.setTheme(this.theme);
    }

    // Create persistent layer group for spots
    this.overlayLayerGroup = window.L.layerGroup().addTo(this.map);

    // Create dedicated Canvas renderer for scalable vector markers
    if (!this.isMiniMap && typeof window.L.canvas === 'function') {
      this.canvasRenderer = window.L.canvas({ padding: 0.5 });
    } else {
      this.canvasRenderer = null;
    }

    // Forward map lifecycle events
    this.map.on('moveend', () => {
      if (typeof this.options.onMoveEnd === 'function') {
        const c = this.map.getCenter();
        const b = typeof this.map.getBounds === 'function' ? this.map.getBounds() : null;
        this.options.onMoveEnd({
          center: { lat: c.lat, lon: c.lng },
          zoom: this.map.getZoom(),
          bounds: b ? {
            south: b.getSouth(),
            west: b.getWest(),
            north: b.getNorth(),
            east: b.getEast()
          } : null
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

  getBounds() {
    if (this.map && typeof this.map.getBounds === 'function') {
      return this.map.getBounds();
    }
    return null;
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
    this.setLayer(this.theme === 'light' ? 'topo' : 'dark');
  }

  setLayer(layerId) {
    const layer = MAP_LAYERS[layerId] || MAP_LAYERS.dark;
    this.currentLayerId = layer.id;
    this.theme = (layer.id === 'dark' || layer.id === 'satellite') ? 'dark' : 'light';
    if (!this.map || typeof window === 'undefined' || !window.L) return;

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    const tileOptions = {
      attribution: layer.attribution,
      maxZoom: layer.maxZoom || 19
    };
    if (layer.subdomains) {
      tileOptions.subdomains = layer.subdomains;
    }
    if (layer.maxNativeZoom) {
      tileOptions.maxNativeZoom = layer.maxNativeZoom;
    }
    this.tileLayer = window.L.tileLayer(layer.url, tileOptions).addTo(this.map);
  }

  renderOverlays(evaluatedSpots, zoomLevel = null, glider = null, activeSpotId = null) {
    if (!this.map || !this.overlayLayerGroup || typeof window === 'undefined' || !window.L) return;
    this.renderedMode = 'circular';

    if (!Array.isArray(evaluatedSpots) || evaluatedSpots.length === 0) {
      this.clearOverlays();
      return;
    }

    const signature = `${this.currentLayerId || 'layer'}_` + evaluatedSpots.map(s => `${s.id || s.comprensorio?.id}:${s.status}`).join('|');

    // If identical dataset is already mounted, avoid destroying DOM markers and closing active popups
    if (this.lastRenderedSignature === signature && this.overlayLayerGroup.getLayers().length > 0) {
      if (this.activeSpotId !== activeSpotId) {
        if (this.activeSpotId && this.markersMap?.has(this.activeSpotId)) {
          const m = this.markersMap.get(this.activeSpotId);
          if (m && typeof m.setStyle === 'function') {
            const oldStatus = evaluatedSpots.find(s => (s.id || s.comprensorio?.id) === this.activeSpotId)?.status;
            const oldStyle = STATUS_COLORS[oldStatus] || STATUS_COLORS.unavailable;
            m.setStyle({ color: oldStyle.color, weight: 2, radius: 9 });
          } else {
            const el = m?.getElement?.();
            el?.querySelector('.gm-map-dot-marker')?.classList.remove('gm-map-dot-focused');
          }
        }
        if (activeSpotId && this.markersMap?.has(activeSpotId)) {
          const m = this.markersMap.get(activeSpotId);
          if (m && typeof m.setStyle === 'function') {
            m.setStyle({ color: '#ffffff', weight: 3, radius: 13 });
          } else {
            const el = m?.getElement?.();
            el?.querySelector('.gm-map-dot-marker')?.classList.add('gm-map-dot-focused');
          }
        }
        this.activeSpotId = activeSpotId;
      }
      return;
    }

    this.lastRenderedSignature = signature;
    this.activeSpotId = activeSpotId;
    this.overlayLayerGroup.clearLayers();
    this.markersMap.clear();

    const useCanvas = Boolean(this.options.preferCanvas || evaluatedSpots.length > 50) && Boolean(this.canvasRenderer);

    for (const item of evaluatedSpots) {
      if (item.isCluster) {
        const clusterCoords = item.coordinates;
        if (!clusterCoords) continue;

        const clusterHtml = `
          <div class="gm-map-cluster-marker gm-status-${item.status || 'flyable'}" title="${escapeHtml(item.name || 'Cluster')} (${item.count} decolli)">
            <span class="gm-cluster-count">${item.count}</span>
          </div>
        `;
        const clusterIcon = window.L.divIcon({
          className: 'gm-map-cluster-div-icon',
          html: clusterHtml,
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        });
        const clusterMarker = window.L.marker([clusterCoords.lat, clusterCoords.lon], {
          icon: clusterIcon,
          zIndexOffset: 500
        });

        clusterMarker.on('click', () => {
          if (item.bounds && this.map) {
            this.map.fitBounds([
              [item.bounds.south, item.bounds.west],
              [item.bounds.north, item.bounds.east]
            ], { padding: [50, 50], maxZoom: 9 });
          }
        });

        this.overlayLayerGroup.addLayer(clusterMarker);
        continue;
      }

      const coords = parseCoordinates(item.takeoff?.coordinates || item.comprensorio?.takeoffs?.[0]?.coordinates);
      if (!coords) continue;

      const spotId = item.id || item.comprensorio?.id;
      const isFocused = Boolean(activeSpotId && spotId === activeSpotId);
      const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.unavailable;
      const spotName = item.name || item.comprensorio?.name || 'Spot';
      const locStr = item.comprensorio?.location || item.location || '';
      const provStr = item.comprensorio?.province || item.province || '';
      const fullLoc = [locStr, provStr ? `(${provStr})` : ''].filter(Boolean).join(' ');
      const alt = item.takeoff?.altitude || item.comprensorio?.takeoffs?.[0]?.altitude;
      const altStr = alt ? `${alt}m` : '';

      let marker;
      if (useCanvas) {
        // High-performance Canvas circle marker (zero DOM allocations, <5ms render for thousands of spots)
        marker = window.L.circleMarker([coords.lat, coords.lon], {
          renderer: this.canvasRenderer,
          radius: isFocused ? 13 : 9,
          fillColor: statusStyle.fill,
          color: isFocused ? '#ffffff' : statusStyle.color,
          weight: isFocused ? 3 : 2,
          fillOpacity: 0.95,
          className: `gm-canvas-marker gm-status-${item.status || 'unavailable'} ${isFocused ? 'gm-marker-focused' : ''}`,
          zIndexOffset: isFocused ? 1000 : 0
        });

        // Add pulsed halo beacon on canvas for the focused active spot
        if (isFocused) {
          const haloBeacon = window.L.circleMarker([coords.lat, coords.lon], {
            renderer: this.canvasRenderer,
            radius: 20,
            fillColor: statusStyle.fill,
            fillOpacity: 0.25,
            color: '#ffffff',
            weight: 1.5,
            dashArray: '3, 4',
            interactive: false
          });
          this.overlayLayerGroup.addLayer(haloBeacon);
        }
      } else {
        // Stylized DOM divIcon with CSS glyph
        const iconHtml = `
          <div class="gm-map-dot-marker gm-status-${item.status || 'unavailable'} ${isFocused ? 'gm-map-dot-focused' : ''}" title="${escapeHtml(spotName)} - ${statusStyle.badge}">
            <span class="gm-map-dot-glyph">${statusStyle.icon}</span>
          </div>
        `;

        const markerIcon = window.L.divIcon({
          className: 'gm-map-div-icon',
          html: iconHtml,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          popupAnchor: [0, -14]
        });

        marker = window.L.marker([coords.lat, coords.lon], {
          icon: markerIcon,
          zIndexOffset: isFocused ? 1000 : 0
        });
      }

      // Contextual speech bubble ("fumetto") on tap
      const popupHtml = `
        <div class="gm-map-spot-popup" role="tooltip">
          <div class="gm-map-popup-header">
            <span class="gm-map-popup-name">${escapeHtml(spotName)}</span>
            <span class="gm-map-popup-badge gm-status-${item.status || 'unavailable'}">
              ${statusStyle.icon} ${statusStyle.badge}
            </span>
          </div>
          ${fullLoc || altStr ? `
            <div class="gm-map-popup-meta">
              ${fullLoc ? `<span>${escapeHtml(fullLoc)}</span>` : ''}
              ${altStr ? `<span class="gm-map-popup-alt">${altStr} slm</span>` : ''}
            </div>
          ` : ''}
          <div class="gm-map-popup-actions">
            <button type="button" class="gm-map-popup-btn gm-popup-sheet-btn" data-spot-id="${escapeHtml(spotId || '')}">
              Scheda Spot ›
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        offset: [0, -12],
        className: 'gm-leaflet-popup',
        closeButton: true,
        autoPan: true
      });

      marker.on('click', () => {
        if (typeof this.options.onSpotSelect === 'function') {
          this.options.onSpotSelect(item);
        }
      });

      marker.on('popupopen', (e) => {
        const popupEl = e.popup?.getElement();
        if (popupEl) {
          const btn = popupEl.querySelector('.gm-popup-sheet-btn');
          if (btn) {
            btn.onclick = (evt) => {
              evt.preventDefault();
              evt.stopPropagation();
              if (typeof this.options.onSpotOpenSheet === 'function') {
                this.options.onSpotOpenSheet(item);
              }
            };
          }
        }
      });

      this.overlayLayerGroup.addLayer(marker);
      if (spotId) {
        this.markersMap.set(spotId, marker);
      }
    }
  }

  openSpotPopup(spotId) {
    if (!this.markersMap) return false;
    const marker = this.markersMap.get(spotId);
    if (marker && typeof marker.openPopup === 'function') {
      marker.openPopup();
      return true;
    }
    return false;
  }

  closeSpotPopup() {
    if (this.map && typeof this.map.closePopup === 'function') {
      this.map.closePopup();
    }
  }

  clearOverlays() {
    if (this.overlayLayerGroup) {
      this.overlayLayerGroup.clearLayers();
    }
    if (this.markersMap) {
      this.markersMap.clear();
    }
    this.lastRenderedSignature = null;
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

  renderSpotMiniMap(containerEl, spotData, options = {}) {
    if (typeof window === 'undefined' || !window.L) return this;
    if (containerEl && (!this.map || this.container !== containerEl)) {
      if (this.map) {
        this.destroy();
      }
      this.init(containerEl, { ...this.options, ...options, isMiniMap: true });
    }

    if (!this.map || !this.overlayLayerGroup) return this;
    this.overlayLayerGroup.clearLayers();
    this.windsockMarker = null;
    this.takeoffSectorMarker = null;
    this.glidePolyline = null;
    this.landingMarker = null;
    this.takeoffMarker = null;
    this.activeMiniMapSpotData = spotData;
    this.renderedMode = 'minimap';

    if (!spotData) return this;

    const tCoord = parseCoordinates(spotData.takeoff?.coordinates || spotData.comprensorio?.takeoffs?.[0]?.coordinates);
    const lCoord = parseCoordinates(spotData.landing?.coordinates || spotData.comprensorio?.landings?.[0]?.coordinates);
    const mode = spotData.subSpotType || 'overview';
    const weather = spotData.weatherSnapshot || {};
    const glide = spotData.glideMetrics || { requiredGlideRatio: 5.0, isSafe: true };

    const speed = weather.windSpeed ?? 12;
    const gust = weather.windGust ?? (speed > 0 ? speed * 1.3 : 15);
    const dir = weather.windDirection ?? weather.windDir ?? 180;
    const turb = weather.turbulence ?? 0.1;
    const tHeading = spotData.takeoff?.heading ?? 180;
    const tAlt = spotData.takeoff?.altitude || 1000;
    const lAlt = spotData.landing?.altitude || 300;

    const isLandingSelected = mode === 'landing' || (spotData.activeSubSpot?.spotType === 'landing');
    const isTakeoffSelected = mode === 'takeoff' || (spotData.activeSubSpot?.spotType === 'takeoff');

    // 1. Takeoff Slope Exposure Sector (Cono e Azimut di Decollo)
    if (tCoord) {
      const sectorSvg = generateTakeoffSectorSvg(tHeading, dir, tAlt, { prefix: 'miniws-to-' });
      const sectorIcon = window.L.divIcon({
        className: 'gm-takeoff-sector-marker-container',
        html: sectorSvg,
        iconSize: [130, 130],
        iconAnchor: [65, 65]
      });
      this.takeoffSectorMarker = window.L.marker([tCoord.lat, tCoord.lon], {
        icon: sectorIcon,
        zIndexOffset: isTakeoffSelected ? 400 : 250
      });
      if (typeof spotData.onSelectSubSpot === 'function') {
        this.takeoffSectorMarker.on('click', () => {
          spotData.onSelectSubSpot(spotData.takeoff?.id || 'takeoff');
        });
      }
      this.overlayLayerGroup.addLayer(this.takeoffSectorMarker);

      // 2. Vector Windsock Marker (Centered at takeoff with zero offset)
      const wsHtml = generateWindsockSvg(speed, gust, dir, turb, { prefix: 'miniws-', scale: 0.45 });
      const wsIcon = window.L.divIcon({
        className: 'gm-windsock-marker-container',
        html: wsHtml,
        iconSize: [240, 240],
        iconAnchor: [120, 120]
      });
      this.windsockMarker = window.L.marker([tCoord.lat, tCoord.lon], {
        icon: wsIcon,
        zIndexOffset: 600
      });
      this.overlayLayerGroup.addLayer(this.windsockMarker);
    }

    // 3. Landing Marker (Compact aeronautical pin, zero location name clutter)
    if (lCoord) {
      const landingName = (spotData.landing?.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');
      const lIcon = window.L.divIcon({
        className: 'gm-map-div-icon',
        html: `
          <div class="gm-mini-pin gm-mini-pin-landing ${isLandingSelected ? 'gm-mini-pin-focused' : ''}" title="Atterraggio ${landingName} (${lAlt}m)">
            <span class="gm-mini-pin-glyph">⏚</span>
            <span class="gm-mini-pin-alt">${lAlt}m</span>
          </div>
        `,
        iconSize: [54, 22],
        iconAnchor: [27, 11]
      });
      this.landingMarker = window.L.marker([lCoord.lat, lCoord.lon], {
        icon: lIcon,
        zIndexOffset: isLandingSelected ? 500 : 220
      });
      if (typeof spotData.onSelectSubSpot === 'function') {
        this.landingMarker.on('click', () => {
          spotData.onSelectSubSpot(spotData.landing?.id || 'landing');
        });
      }
      this.overlayLayerGroup.addLayer(this.landingMarker);
    }

    // 4. Geodesic Glide Cone Line
    if (tCoord && lCoord) {
      const glideColor = glide.isSafe ? '#16a34a' : (glide.severity === 1 ? '#ca8a04' : '#dc2626');
      this.glidePolyline = window.L.polyline(
        [[tCoord.lat, tCoord.lon], [lCoord.lat, lCoord.lon]],
        {
          color: glideColor,
          weight: 3,
          dashArray: '5, 7',
          opacity: 0.9
        }
      );
      this.overlayLayerGroup.addLayer(this.glidePolyline);
    }

    // 5. Fit bounds with safe padding and invalidate size
    if (tCoord && lCoord) {
      const bounds = window.L.latLngBounds([[tCoord.lat, tCoord.lon], [lCoord.lat, lCoord.lon]]);
      this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });

      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize();
            this.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
          }
        }, 50);
      }
    } else if (tCoord) {
      this.map.setView([tCoord.lat, tCoord.lon], 14.5);
    } else if (lCoord) {
      this.map.setView([lCoord.lat, lCoord.lon], 14.5);
    }

    // Schedule invalidateSize for layout readiness in SPAs
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        if (this.map) this.map.invalidateSize();
      });
    }

    return this;
  }

  updateWindsockMarker(weatherSnapshot, isLanding = false, takeoff = null) {
    if (!weatherSnapshot) return;

    if (takeoff && this.activeMiniMapSpotData) {
      this.activeMiniMapSpotData.takeoff = takeoff;
    }

    const speed = weatherSnapshot.windSpeed ?? 0;
    const gust = weatherSnapshot.windGust ?? speed;
    const dir = weatherSnapshot.windDirection ?? weatherSnapshot.windDir ?? 0;
    const turb = weatherSnapshot.turbulence ?? 0;

    // 1. In-place update of windsock rotation, SVG segments and animation keyframes
    if (this.windsockMarker) {
      const el = this.windsockMarker.getElement();
      if (el) {
        const k = calculateWindsockKinematics(speed, gust, dir, turb);

        const wrapper = el.querySelector('#miniws-wrapper') || el.querySelector('.gm-windsock-wrapper');
        if (wrapper) {
          wrapper.style.transform = `rotate(${k.rotation}deg)`;
          const pureSvg = generateWindsockSvg(speed, gust, dir, turb, {
            prefix: 'miniws-',
            scale: 0.45,
            includeWrapper: false
          });
          wrapper.innerHTML = pureSvg;
        } else {
          el.innerHTML = generateWindsockSvg(speed, gust, dir, turb, {
            prefix: 'miniws-',
            scale: 0.45,
            includeWrapper: true
          });
        }
      }
    }

    // 2. In-place update of Takeoff Exposure Sector alignment and color
    if (this.takeoffSectorMarker && this.activeMiniMapSpotData) {
      const tHeading = this.activeMiniMapSpotData.takeoff?.heading ?? 180;
      const tAlt = this.activeMiniMapSpotData.takeoff?.altitude || 1000;
      const el = this.takeoffSectorMarker.getElement();
      if (el) {
        el.innerHTML = generateTakeoffSectorSvg(tHeading, dir, tAlt, { prefix: 'miniws-to-' });
      }
    }
  }

  updateGlideLine(glideMetrics) {
    if (!this.glidePolyline || !glideMetrics) return;
    const color = glideMetrics.isSafe ? '#16a34a' : (glideMetrics.severity === 1 ? '#ca8a04' : '#dc2626');
    this.glidePolyline.setStyle({ color });
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    if (this.map && typeof window !== 'undefined') {
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 50);
    }
  }

  renderComprensorioFlightMap(containerEl, data, options = {}) {
    if (typeof window === 'undefined' || !window.L) return this;
    if (containerEl && (!this.map || this.container !== containerEl)) {
      if (this.map) {
        this.destroy();
      }
      this.init(containerEl, { ...this.options, ...options, isFlightAnalysis: true });
    }

    if (!this.map || !this.overlayLayerGroup) return this;
    this.overlayLayerGroup.clearLayers();
    this.activeFlightData = data;
    this.renderedMode = 'flightAnalysis';
    this.circuitLayers = {};

    if (!data) return this;

    const tCoord = parseCoordinates(data.takeoff?.coordinates || data.comprensorio?.takeoffs?.[0]?.coordinates);
    const lCoord = parseCoordinates(data.landing?.coordinates || data.comprensorio?.landings?.[0]?.coordinates);
    const takeoffWeather = data.takeoffWeather || data.weatherSnapshot || {};
    const landingWeather = data.landingWeather || data.weatherSnapshot || {};

    const tSpeed = takeoffWeather.windSpeed ?? 12;
    const tGust = takeoffWeather.windGust ?? (tSpeed > 0 ? tSpeed * 1.3 : 15);
    const tDir = takeoffWeather.windDirection ?? takeoffWeather.windDir ?? 180;
    const tTurb = takeoffWeather.turbulence ?? 0.1;
    const tHeading = data.takeoff?.heading ?? 180;
    const tAlt = data.takeoff?.altitude || 1000;

    const lSpeed = landingWeather.windSpeed ?? 10;
    const lGust = landingWeather.windGust ?? (lSpeed > 0 ? lSpeed * 1.3 : 12);
    const lDir = landingWeather.windDirection ?? landingWeather.windDir ?? 180;
    const lTurb = landingWeather.turbulence ?? 0.1;
    const lAlt = data.landing?.altitude || 300;

    // 1. Takeoff Pin + Windsock
    if (tCoord) {
      const takeoffName = (data.takeoff?.name || 'Decollo').replace(/^Decollo\s*/i, '');
      const tIcon = window.L.divIcon({
        className: 'gm-map-div-icon',
        html: `
          <div class="gm-mini-pin gm-mini-pin-takeoff gm-mini-pin-focused" title="Decollo ${takeoffName} (${tAlt}m)">
            <span class="gm-mini-pin-glyph">▲</span>
            <span class="gm-mini-pin-alt">${tAlt}m</span>
          </div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 12]
      });
      this.flightTakeoffPin = window.L.marker([tCoord.lat, tCoord.lon], {
        icon: tIcon,
        zIndexOffset: 500
      });
      this.overlayLayerGroup.addLayer(this.flightTakeoffPin);

      const wsTakeoffHtml = generateWindsockSvg(tSpeed, tGust, tDir, tTurb, { prefix: 'fl-to-ws-', scale: 0.5 });
      const wsTakeoffIcon = window.L.divIcon({
        className: 'gm-windsock-marker-container',
        html: wsTakeoffHtml,
        iconSize: [240, 240],
        iconAnchor: [120, 120]
      });
      this.flightTakeoffWindsock = window.L.marker([tCoord.lat, tCoord.lon], {
        icon: wsTakeoffIcon,
        zIndexOffset: 650
      });
      this.overlayLayerGroup.addLayer(this.flightTakeoffWindsock);
    }

    // 2. Landing Pin + Windsock
    if (lCoord) {
      const landingName = (data.landing?.name || 'Atterraggio').replace(/^Atterraggio\s*/i, '');
      const lIcon = window.L.divIcon({
        className: 'gm-map-div-icon',
        html: `
          <div class="gm-mini-pin gm-mini-pin-landing gm-mini-pin-focused" title="Atterraggio ${landingName} (${lAlt}m)">
            <span class="gm-mini-pin-glyph">⏚</span>
            <span class="gm-mini-pin-alt">${lAlt}m</span>
          </div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 12]
      });
      this.flightLandingPin = window.L.marker([lCoord.lat, lCoord.lon], {
        icon: lIcon,
        zIndexOffset: 500
      });
      this.overlayLayerGroup.addLayer(this.flightLandingPin);

      const wsLandingHtml = generateWindsockSvg(lSpeed, lGust, lDir, lTurb, { prefix: 'fl-ld-ws-', scale: 0.5 });
      const wsLandingIcon = window.L.divIcon({
        className: 'gm-windsock-marker-container',
        html: wsLandingHtml,
        iconSize: [240, 240],
        iconAnchor: [120, 120]
      });
      this.flightLandingWindsock = window.L.marker([lCoord.lat, lCoord.lon], {
        icon: wsLandingIcon,
        zIndexOffset: 650
      });
      this.overlayLayerGroup.addLayer(this.flightLandingWindsock);
    }

    // 3. Fit bounds strictly on authentic aeronautical points
    const allPoints = [];
    if (tCoord) allPoints.push([tCoord.lat, tCoord.lon]);
    if (lCoord) allPoints.push([lCoord.lat, lCoord.lon]);

    if (allPoints.length >= 2) {
      const bounds = window.L.latLngBounds(allPoints);
      this.lastComprensorioBounds = bounds;
      this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          if (this.map) {
            this.map.invalidateSize();
            this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
          }
        }, 60);
      }
    } else if (lCoord) {
      this.map.setView([lCoord.lat, lCoord.lon], 15);
    } else if (tCoord) {
      this.map.setView([tCoord.lat, tCoord.lon], 15);
    }

    return this;
  }

  updateFlightProcedures(circuitData, options = {}) {
    if (options.takeoffWeather && this.flightTakeoffWindsock) {
      const el = this.flightTakeoffWindsock.getElement();
      if (el) {
        const speed = options.takeoffWeather.windSpeed ?? 0;
        const gust = options.takeoffWeather.windGust ?? speed;
        const dir = options.takeoffWeather.windDirection ?? 0;
        const turb = options.takeoffWeather.turbulence ?? 0;
        el.innerHTML = generateWindsockSvg(speed, gust, dir, turb, { prefix: 'fl-to-ws-', scale: 0.5 });
      }
    }

    if (options.landingWeather && this.flightLandingWindsock) {
      const el = this.flightLandingWindsock.getElement();
      if (el) {
        const speed = options.landingWeather.windSpeed ?? 0;
        const gust = options.landingWeather.windGust ?? speed;
        const dir = options.landingWeather.windDirection ?? 0;
        const turb = options.landingWeather.turbulence ?? 0;
        el.innerHTML = generateWindsockSvg(speed, gust, dir, turb, { prefix: 'fl-ld-ws-', scale: 0.5 });
      }
    }
  }

  invalidateSize() {
    if (this.map && typeof this.map.invalidateSize === 'function') {
      this.map.invalidateSize();
    }
    return this;
  }

  centerOnComprensorio() {
    if (!this.map) return this;
    if (this.lastComprensorioBounds) {
      this.map.fitBounds(this.lastComprensorioBounds, { padding: [50, 50], maxZoom: 16 });
    } else if (this.activeFlightData) {
      const tCoord = parseCoordinates(this.activeFlightData.takeoff?.coordinates || this.activeFlightData.comprensorio?.takeoffs?.[0]?.coordinates);
      const lCoord = parseCoordinates(this.activeFlightData.landing?.coordinates || this.activeFlightData.comprensorio?.landings?.[0]?.coordinates);
      const pts = [];
      if (tCoord) pts.push([tCoord.lat, tCoord.lon]);
      if (lCoord) pts.push([lCoord.lat, lCoord.lon]);
      if (pts.length >= 2 && window.L) {
        this.map.fitBounds(window.L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16 });
      } else if (pts.length === 1) {
        this.map.setView(pts[0], 15);
      }
    }
    return this;
  }

  showUserLocation(lat, lon) {
    if (typeof window === 'undefined' || !window.L || !this.map) return this;
    if (!this.userLocationMarker) {
      const userIcon = window.L.divIcon({
        className: 'gm-user-gps-marker',
        html: '<div class="gm-gps-pulse-outer"><div class="gm-gps-pulse-inner"></div></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      this.userLocationMarker = window.L.marker([lat, lon], {
        icon: userIcon,
        zIndexOffset: 1500
      }).addTo(this.map);
    } else {
      this.userLocationMarker.setLatLng([lat, lon]);
    }
    this.map.setView([lat, lon], Math.max(this.map.getZoom(), 14));
    return this;
  }

  destroy() {
    this.clearOverlays();
    if (this.userLocationMarker) {
      this.userLocationMarker.remove();
      this.userLocationMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    if (this.flightTakeoffPin) {
      this.flightTakeoffPin.remove();
      this.flightTakeoffPin = null;
    }
    this.windsockMarker = null;
    this.takeoffSectorMarker = null;
    this.glidePolyline = null;
    this.landingMarker = null;
    this.takeoffMarker = null;
    this.flightTakeoffSector = null;
    this.flightTakeoffWindsock = null;
    this.flightLandingPin = null;
    this.flightLandingWindsock = null;
    this.flightGlideLine = null;
    this.circuitLayers = null;
    this.overlayLayerGroup = null;
    this.tileLayer = null;
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
