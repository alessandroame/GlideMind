/**
 * GlideMind - Flight Logbook Database & Telemetry Management Engine (Headless Core)
 * Single Source of Truth for paragliding track persistence with dual-level storage:
 *   - 'flights_meta': Lightweight in-RAM KPI index, flight statistics, MSL altitudes, and SVG sparkline points.
 *   - 'flights_raw': On-demand storage holding authentic FAI IGC text (with G-record) and pre-decimated 3D track points.
 * 
 * Compliant with Headless Core (Gate 2): 100% executable in pure Node.js without DOM or window.
 * Employs Injectable Storage Adapter Pattern (createMemoryDbAdapter & createIndexedDbAdapter).
 */

import { parseIgc, trimFlightGroundPoints } from './igcParser.js';
import { analyzeFlightTelemetry, lttbDecimate } from './flightTelemetry.js';
import { store } from './store.js';
import { DEFAULT_COMPRENSORI, parseCoordinates } from './comprensorio.js';
import { POPULAR_GLIDERS } from './gliders.js';

/**
 * Computes a 64-bit FNV-1a synchronous hash of a string.
 * Operates purely in JavaScript without crypto.subtle dependencies,
 * ensuring 100% deterministic operation across Node.js, HTTPS, and local mobile HTTP.
 * 
 * @param {string} str
 * @returns {string} 16-character hexadecimal hash string
 */
export function fnv1a64(str) {
  let h1 = 0x811c9dc5; // Low 32 bits of FNV offset basis
  let h2 = 0xcbf29ce4; // High 32 bits of FNV offset basis

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    // XOR into low 32 bits
    h1 ^= ch;
    // 64-bit multiply by FNV prime 0x100000001b3
    // Split into 32-bit operations
    const h1Low = h1 & 0xffff;
    const h1High = h1 >>> 16;
    const h2Low = h2 & 0xffff;
    const h2High = h2 >>> 16;

    const primeLow = 0x01b3;
    const primeHigh = 0x0100;

    let p0 = h1Low * primeLow;
    let p1 = h1High * primeLow + (p0 >>> 16);
    let p2 = h2Low * primeLow + (p1 >>> 16);
    let p3 = h2High * primeLow + (p2 >>> 16);

    p1 += h1Low * primeHigh;
    p2 += h1High * primeHigh + (p1 >>> 16);
    p3 += h2Low * primeHigh + (p2 >>> 16);

    h1 = (p0 & 0xffff) | ((p1 & 0xffff) << 16);
    h2 = (p2 & 0xffff) | ((p3 & 0xffff) << 16);
  }

  const s1 = (h2 >>> 0).toString(16).padStart(8, '0');
  const s2 = (h1 >>> 0).toString(16).padStart(8, '0');
  return s1 + s2;
}

/**
 * Computes a deterministic flight identifier string: fl_YYYYMMDD_HHMMSS_<fnv64hex>.
 * 
 * @param {string} dateUtc - UTC flight date ("YYYY-MM-DD")
 * @param {string} firstBRecord - First B-record line of the IGC file
 * @param {string} lastBRecord - Last B-record line of the IGC file
 * @param {number} totalBRecords - Total count of B-records
 * @returns {string} Deterministic flight fingerprint ID
 */
export function computeFlightFingerprint(dateUtc, firstBRecord = '', lastBRecord = '', totalBRecords = 0) {
  const cleanDate = (dateUtc || '1970-01-01').replace(/[^0-9]/g, '');
  let timeStr = '000000';
  if (firstBRecord && firstBRecord.length >= 7) {
    timeStr = firstBRecord.substring(1, 7).replace(/[^0-9]/g, '');
  }

  const payload = `${dateUtc || ''}|${firstBRecord.trim()}|${lastBRecord.trim()}|${totalBRecords}`;
  const hash = fnv1a64(payload);
  return `fl_${cleanDate}_${timeStr}_${hash.substring(0, 10)}`;
}

/**
 * Yields control back to the browser or Node.js event loop
 * to prevent main thread starvation and ensure responsiveness within the Doherty threshold (<400ms).
 * 
 * @returns {Promise<void>}
 */
export function yieldToMainThread() {
  if (typeof globalThis !== 'undefined' && globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Generates normalized SVG coordinate string for altimetric sparklines.
 * 
 * @param {Array<Object>} points - Array of track points containing altitude property.
 * @param {number} [targetCount=60] - Number of decimated points.
 * @param {number} [width=100] - SVG viewBox coordinate width.
 * @param {number} [height=32] - SVG viewBox coordinate height.
 * @returns {string} String of coordinates "x,y x,y ..."
 */
export function generateSparklinePoints(points, targetCount = 60, width = 100, height = 32) {
  if (!Array.isArray(points) || points.length === 0) {
    return `0,${height / 2} ${width},${height / 2}`;
  }

  const decimated = points.length <= targetCount
    ? points
    : lttbDecimate(points, Math.max(2, targetCount), 'alt');

  if (decimated.length === 0) {
    return `0,${height / 2} ${width},${height / 2}`;
  }

  let minAlt = Infinity;
  let maxAlt = -Infinity;
  for (const pt of decimated) {
    const a = typeof pt.alt === 'number' ? pt.alt : 0;
    if (a < minAlt) minAlt = a;
    if (a > maxAlt) maxAlt = a;
  }

  const altRange = Math.max(1, maxAlt - minAlt);
  const paddingY = 4;
  const usableHeight = Math.max(1, height - paddingY * 2);

  const coords = [];
  const n = decimated.length;
  for (let i = 0; i < n; i++) {
    const pt = decimated[i];
    const x = n > 1 ? Math.round(((i / (n - 1)) * width) * 10) / 10 : width / 2;
    const a = typeof pt.alt === 'number' ? pt.alt : minAlt;
    const normalizedY = (a - minAlt) / altRange;
    const y = Math.round((height - paddingY - (normalizedY * usableHeight)) * 10) / 10;
    coords.push(`${x},${y}`);
  }

  return coords.join(' ');
}

/**
 * Deduces glider certification class from name string or object.
 * 
 * @param {string|Object} glider
 * @returns {'EN-A'|'EN-B'|'EN-C'|'EN-D'|'Tandem'|'Custom'} Glider class category
 */
export function deduceGliderClass(glider) {
  if (!glider) return 'Custom';
  const name = (typeof glider === 'string' ? glider : (glider.name || glider.model || '')).toUpperCase();
  const cat = typeof glider === 'object' && glider.category ? glider.category.toUpperCase() : '';

  if (cat.includes('EN-A') || cat === 'A') return 'EN-A';
  if (cat.includes('EN-B') || cat === 'B') return 'EN-B';
  if (cat.includes('EN-C') || cat === 'C') return 'EN-C';
  if (cat.includes('EN-D') || cat === 'D') return 'EN-D';
  if (cat.includes('TANDEM')) return 'Tandem';

  if (name.includes('EN-A') || name.includes('(EN-A)')) return 'EN-A';
  if (name.includes('EN-B') || name.includes('(EN-B)')) return 'EN-B';
  if (name.includes('EN-C') || name.includes('(EN-C)')) return 'EN-C';
  if (name.includes('EN-D') || name.includes('(EN-D)')) return 'EN-D';
  if (name.includes('TANDEM') || name.includes('BIPOSTO')) return 'Tandem';

  // Check known certified gliders catalog
  const cleanName = name.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (Array.isArray(POPULAR_GLIDERS)) {
    const matched = POPULAR_GLIDERS.find(g => {
      const full = `${g.brand} ${g.model}`.toUpperCase();
      const model = (g.model || '').toUpperCase();
      return cleanName === full || cleanName.includes(full) || (model.length >= 4 && cleanName.includes(model));
    });
    if (matched && matched.category) {
      return matched.category;
    }
  }

  return 'Custom';
}

/**
 * Flattens a comprensorio catalog into an array of individual takeoff and landing spots
 * with parsed decimal lat and lon coordinates for proximity matching.
 * 
 * @param {Array<Object>} catalog
 * @returns {Array<Object>} Flattened spots list with lat, lon, name, type
 */
export function flattenSpotsCatalog(catalog) {
  if (!Array.isArray(catalog)) return [];
  const spots = [];
  for (const item of catalog) {
    if (item.takeoffs && Array.isArray(item.takeoffs)) {
      for (const t of item.takeoffs) {
        const coords = t.coordinates ? parseCoordinates(t.coordinates) : null;
        spots.push({
          ...t,
          lat: t.lat != null ? t.lat : (coords ? coords.lat : undefined),
          lon: t.lon != null ? t.lon : (coords ? coords.lon : undefined),
          type: 'takeoff',
          comprensorioName: item.name
        });
      }
    }
    if (item.landings && Array.isArray(item.landings)) {
      for (const l of item.landings) {
        const coords = l.coordinates ? parseCoordinates(l.coordinates) : null;
        spots.push({
          ...l,
          lat: l.lat != null ? l.lat : (coords ? coords.lat : undefined),
          lon: l.lon != null ? l.lon : (coords ? coords.lon : undefined),
          type: 'landing',
          comprensorioName: item.name
        });
      }
    }
    if (item.type || item.lat != null || (typeof item.coordinates === 'string')) {
      const coords = item.coordinates ? parseCoordinates(item.coordinates) : null;
      spots.push({
        ...item,
        lat: item.lat != null ? item.lat : (coords ? coords.lat : undefined),
        lon: item.lon != null ? item.lon : (coords ? coords.lon : undefined)
      });
    }
  }
  return spots;
}

/**
 * In-Memory Database Adapter for Headless Node.js execution and unit tests (0ms latency).
 * @returns {import('./logbookDb.js').ILogbookDbAdapter}
 */
export function createMemoryDbAdapter() {
  /** @type {Map<string, Object>} */
  const metaMap = new Map();
  /** @type {Map<string, Object>} */
  const rawMap = new Map();

  return {
    async init() {
      // No-op for in-memory adapter
    },

    async saveFlight(meta, raw) {
      if (!meta || !meta.id) {
        throw new Error('[MemoryDbAdapter] Invalid flight meta record: missing id');
      }
      metaMap.set(meta.id, JSON.parse(JSON.stringify(meta)));
      if (raw && raw.id) {
        rawMap.set(raw.id, JSON.parse(JSON.stringify(raw)));
      }
      return meta.id;
    },

    async getFlight(flightId) {
      const meta = metaMap.get(flightId);
      const raw = rawMap.get(flightId);
      if (!meta) return null;
      return {
        meta: JSON.parse(JSON.stringify(meta)),
        raw: raw ? JSON.parse(JSON.stringify(raw)) : null
      };
    },

    async getAllFlightMetas() {
      const list = Array.from(metaMap.values());
      // Sort chronologically descending (newest first)
      list.sort((a, b) => {
        const da = a.date || '';
        const db = b.date || '';
        if (da !== db) return db.localeCompare(da);
        return (b.takeoffTime || '').localeCompare(a.takeoffTime || '');
      });
      return JSON.parse(JSON.stringify(list));
    },

    async getRawFlight(flightId) {
      const raw = rawMap.get(flightId);
      return raw ? JSON.parse(JSON.stringify(raw)) : null;
    },

    async getRawIgc(flightId) {
      const raw = rawMap.get(flightId);
      return raw && typeof raw.rawIgc === 'string' ? raw.rawIgc : null;
    },

    async getDecimatedTrack(flightId) {
      const raw = rawMap.get(flightId);
      return raw && Array.isArray(raw.decimatedPoints) ? JSON.parse(JSON.stringify(raw.decimatedPoints)) : null;
    },

    async updateFlightMeta(flightId, partialMeta) {
      const meta = metaMap.get(flightId);
      if (!meta) return null;
      const updated = { ...meta, ...partialMeta, id: flightId, updatedAt: Date.now() };
      metaMap.set(flightId, updated);
      return JSON.parse(JSON.stringify(updated));
    },

    async deleteFlight(flightId) {
      const existed = metaMap.has(flightId);
      metaMap.delete(flightId);
      rawMap.delete(flightId);
      return existed;
    },

    async getCareerKpis() {
      const metas = Array.from(metaMap.values());
      let totalMinutes = 0;
      let totalDistKm = 0;
      let maxAlt = 0;
      let maxClimb = 0;
      let maxDist = 0;
      let maxDuration = 0;
      let totalThermals = 0;
      let totalClimbMeters = 0;

      for (const m of metas) {
        const dur = Number(m.durationMinutes) || 0;
        totalMinutes += dur;
        if (dur > maxDuration) maxDuration = dur;

        const dist = Number(m.distanceKm) || 0;
        totalDistKm += dist;
        if (dist > maxDist) maxDist = dist;

        const alt = Number(m.maxAltMsl) || 0;
        if (alt > maxAlt) maxAlt = alt;

        const climb = Number(m.maxClimbRate) || 0;
        if (climb > maxClimb) maxClimb = climb;

        totalThermals += Number(m.thermalsCount) || 0;
        totalClimbMeters += Number(m.accumulatedClimbMeters) || 0;
      }

      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
      const formattedHours = totalHours >= 10 ? `${Math.round(totalHours)} h` : `${totalHours} h`;

      return {
        totalFlights: metas.length,
        totalDurationMinutes: totalMinutes,
        totalHours,
        formattedHours,
        totalDistanceKm: Math.round(totalDistKm * 10) / 10,
        maxAltMsl: maxAlt,
        maxClimbRate: Math.round(maxClimb * 10) / 10,
        maxDistanceKm: Math.round(maxDist * 10) / 10,
        maxDurationMinutes: maxDuration,
        totalThermals,
        totalAccumulatedClimbMeters: Math.round(totalClimbMeters)
      };
    },

    async clearAll() {
      metaMap.clear();
      rawMap.clear();
      return true;
    }
  };
}

/**
 * IndexedDB Database Adapter for real Browser environments.
 * Encapsulates ObjectStores: 'flights_meta' and 'flights_raw'.
 * 
 * @param {Object} [options={}]
 * @param {string} [options.dbName='glidemind_logbook']
 * @param {number} [options.version=1]
 * @returns {import('./logbookDb.js').ILogbookDbAdapter}
 */
export function createIndexedDbAdapter(options = {}) {
  const dbName = options.dbName || 'glidemind_logbook';
  const version = options.version || 1;
  let dbInstance = null;

  async function openDb() {
    if (dbInstance) return dbInstance;
    if (typeof globalThis === 'undefined' || !globalThis.indexedDB) {
      throw new Error('[IndexedDbAdapter] indexedDB is unavailable in current runtime');
    }

    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(dbName, version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('flights_meta')) {
          const metaStore = db.createObjectStore('flights_meta', { keyPath: 'id' });
          metaStore.createIndex('date', 'date', { unique: false });
          metaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('flights_raw')) {
          db.createObjectStore('flights_raw', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        reject(event.target.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  return {
    async init() {
      await openDb();
    },

    async saveFlight(meta, raw) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['flights_meta', 'flights_raw'], 'readwrite');
        const metaStore = tx.objectStore('flights_meta');
        const rawStore = tx.objectStore('flights_raw');

        metaStore.put(meta);
        if (raw) {
          rawStore.put(raw);
        }

        tx.oncomplete = () => resolve(meta.id);
        tx.onerror = () => reject(tx.error || new Error('Error saving flight in IndexedDB'));
      });
    },

    async getFlight(flightId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['flights_meta', 'flights_raw'], 'readonly');
        const metaReq = tx.objectStore('flights_meta').get(flightId);
        const rawReq = tx.objectStore('flights_raw').get(flightId);

        let meta = null;
        let raw = null;

        metaReq.onsuccess = () => { meta = metaReq.result || null; };
        rawReq.onsuccess = () => { raw = rawReq.result || null; };

        tx.oncomplete = () => {
          if (!meta) return resolve(null);
          resolve({ meta, raw });
        };
        tx.onerror = () => reject(tx.error);
      });
    },

    async getAllFlightMetas() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('flights_meta', 'readonly');
        const storeObj = tx.objectStore('flights_meta');
        const req = storeObj.getAll();

        req.onsuccess = () => {
          const list = req.result || [];
          list.sort((a, b) => {
            const da = a.date || '';
            const db = b.date || '';
            if (da !== db) return db.localeCompare(da);
            return (b.takeoffTime || '').localeCompare(a.takeoffTime || '');
          });
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async getRawFlight(flightId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('flights_raw', 'readonly');
        const req = tx.objectStore('flights_raw').get(flightId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    async getRawIgc(flightId) {
      const raw = await this.getRawFlight(flightId);
      return raw && typeof raw.rawIgc === 'string' ? raw.rawIgc : null;
    },

    async getDecimatedTrack(flightId) {
      const raw = await this.getRawFlight(flightId);
      return raw && Array.isArray(raw.decimatedPoints) ? raw.decimatedPoints : null;
    },

    async updateFlightMeta(flightId, partialMeta) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('flights_meta', 'readwrite');
        const store = tx.objectStore('flights_meta');
        const getReq = store.get(flightId);

        getReq.onsuccess = () => {
          const meta = getReq.result;
          if (!meta) {
            resolve(null);
            return;
          }
          const updated = { ...meta, ...partialMeta, id: flightId, updatedAt: Date.now() };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    async deleteFlight(flightId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['flights_meta', 'flights_raw'], 'readwrite');
        tx.objectStore('flights_meta').delete(flightId);
        tx.objectStore('flights_raw').delete(flightId);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    },

    async getCareerKpis() {
      const metas = await this.getAllFlightMetas();
      let totalMinutes = 0;
      let totalDistKm = 0;
      let maxAlt = 0;
      let maxClimb = 0;
      let maxDist = 0;
      let maxDuration = 0;
      let totalThermals = 0;
      let totalClimbMeters = 0;

      for (const m of metas) {
        const dur = Number(m.durationMinutes) || 0;
        totalMinutes += dur;
        if (dur > maxDuration) maxDuration = dur;

        const dist = Number(m.distanceKm) || 0;
        totalDistKm += dist;
        if (dist > maxDist) maxDist = dist;

        const alt = Number(m.maxAltMsl) || 0;
        if (alt > maxAlt) maxAlt = alt;

        const climb = Number(m.maxClimbRate) || 0;
        if (climb > maxClimb) maxClimb = climb;

        totalThermals += Number(m.thermalsCount) || 0;
        totalClimbMeters += Number(m.accumulatedClimbMeters) || 0;
      }

      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
      const formattedHours = totalHours >= 10 ? `${Math.round(totalHours)} h` : `${totalHours} h`;

      return {
        totalFlights: metas.length,
        totalDurationMinutes: totalMinutes,
        totalHours,
        formattedHours,
        totalDistanceKm: Math.round(totalDistKm * 10) / 10,
        maxAltMsl: maxAlt,
        maxClimbRate: Math.round(maxClimb * 10) / 10,
        maxDistanceKm: Math.round(maxDist * 10) / 10,
        maxDurationMinutes: maxDuration,
        totalThermals,
        totalAccumulatedClimbMeters: Math.round(totalClimbMeters)
      };
    },

    async clearAll() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['flights_meta', 'flights_raw'], 'readwrite');
        tx.objectStore('flights_meta').clear();
        tx.objectStore('flights_raw').clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }
  };
}

/**
 * Checks and requests persistent storage from the browser (Anti-Eviction Guard, Lesson #27 & #87).
 * 
 * @returns {Promise<{persisted: boolean, supported: boolean}>}
 */
export async function requestStoragePersistence() {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persisted === 'function') {
    try {
      let isPersisted = await navigator.storage.persisted();
      if (!isPersisted && typeof navigator.storage.persist === 'function') {
        isPersisted = await navigator.storage.persist();
      }
      return { persisted: !!isPersisted, supported: true };
    } catch {
      return { persisted: false, supported: true };
    }
  }
  return { persisted: false, supported: false };
}

/**
 * Main Logbook Manager singleton facilitating IGC ingestion, storage operations, and store synchronization.
 */
class LogbookManager {
  constructor() {
    /** @type {ReturnType<typeof createMemoryDbAdapter>} */
    this.adapter = createMemoryDbAdapter();
    this.isInitialized = false;
  }

  /**
   * Sets the active database adapter.
   * @param {Object} adapter
   */
  setAdapter(adapter) {
    if (!adapter) return;
    this.adapter = adapter;
    this.isInitialized = false;
  }

  /**
   * Initializes the active adapter.
   */
  async init() {
    if (this.isInitialized) return;
    if (this.adapter && typeof this.adapter.init === 'function') {
      await this.adapter.init();
    }
    this.isInitialized = true;
  }

  /**
   * Imports and processes an authentic FAI IGC text tracklog.
   * Execution pipeline:
   *  1. Chunked scan & yield to main thread (Doherty Threshold <400ms).
   *  2. Deterministic FNV-1a fingerprinting from date, first & last B-records.
   *  3. Standard IGC parsing & 1Hz telemetry kinematics calculation.
   *  4. Downstream LTTB decimation (60 pts for sparkline, 1,500 pts for 3D Replay).
   *  5. Atomically persists FlightMeta to 'flights_meta' and FlightRawRecord to 'flights_raw'.
   *  6. Synchronizes reactive state with store.setState({ flights: updatedMetas }).
   * 
   * @param {string} rawIgcText - Raw ASCII text of the IGC file.
   * @param {Object} [options={}]
   * @param {string} [options.fileName='track.igc'] - Original filename.
   * @param {Array<Object>} [options.spotsCatalog=[]] - Catalog of locations for takeoff/landing detection.
   * @param {Object|string} [options.activeGlider=null] - Pilot active glider profile.
   * @param {(pct: number) => void} [options.onProgress] - Optional progress callback [0..100].
   * @param {number} [options.chunkSize=2000] - Number of lines to process per event loop tick.
   * @returns {Promise<{ meta: Object, raw: Object, isNew: boolean, wasUpdated: boolean }>}
   */
  async importIgcTrack(rawIgcText, options = {}) {
    await this.init();

    if (!rawIgcText || typeof rawIgcText !== 'string' || rawIgcText.trim().length === 0) {
      throw new Error('[LogbookManager] Impossibile importare traccia: contenuto IGC vuoto o non valido.');
    }

    const fileName = options.fileName || 'track.igc';
    const rawCatalog = options.spotsCatalog || (store && store.getState().locationsCatalog) || DEFAULT_COMPRENSORI;
    const spotsList = flattenSpotsCatalog(rawCatalog);
    const chunkSize = Math.max(500, options.chunkSize || 2000);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    // 1. Chunked inspection of B-records for fingerprinting and yield guard
    const lines = rawIgcText.split(/\r?\n/);
    const totalLines = lines.length;
    let firstBRecord = '';
    let lastBRecord = '';
    let totalBRecords = 0;
    let utcDate = '';

    for (let i = 0; i < totalLines; i++) {
      const line = lines[i];
      if (line.startsWith('HFDTE')) {
        const dStr = line.replace('HFDTE', '').trim();
        if (dStr.length >= 6) {
          const dd = dStr.substring(0, 2);
          const mm = dStr.substring(2, 4);
          const yy = dStr.substring(4, 6);
          const fullYear = parseInt(yy, 10) < 80 ? `20${yy}` : `19${yy}`;
          utcDate = `${fullYear}-${mm}-${dd}`;
        }
      } else if (line.startsWith('B') && line.length >= 35) {
        if (!firstBRecord) firstBRecord = line;
        lastBRecord = line;
        totalBRecords++;
      }

      if (i > 0 && i % chunkSize === 0) {
        if (onProgress) onProgress(Math.round((i / totalLines) * 30));
        await yieldToMainThread();
      }
    }

    if (totalBRecords === 0) {
      throw new Error('Il file non contiene record di volo B-record conformi allo standard FAI IGC.');
    }

    if (onProgress) onProgress(35);

    // 2. Deterministic flight ID
    const flightId = computeFlightFingerprint(utcDate, firstBRecord, lastBRecord, totalBRecords);

    // Check if flight already exists for idempotent Last-Write-Wins check
    const existing = await this.adapter.getFlight(flightId);
    const existingMeta = existing ? existing.meta : null;

    // 3. Parse complete IGC structure
    const parsed = parseIgc(rawIgcText, spotsList, {
      activeGlider: options.activeGlider || (store && store.getState().activeGlider),
      useActiveGlider: !!options.useActiveGlider
    });

    if (onProgress) onProgress(65);
    await yieldToMainThread();

    const flightPoints = parsed.trackPoints || [];
    const stats = parsed.stats || {};
    const telemetry = parsed.telemetry || {};

    // 4. Downstream LTTB decimation:
    // 60 points for light UI sparkline rendering
    const sparklineSvgPoints = generateSparklinePoints(flightPoints, 60, 100, 32);

    // 1,500 points for high-performance 60 FPS 3D trajectory replay (Fase 7)
    const decimatedPoints = flightPoints.length <= 1500
      ? flightPoints
      : lttbDecimate(flightPoints, 1500, 'alt');

    if (onProgress) onProgress(85);

    const nowUtc = Date.now();
    const gliderName = parsed.gliderType || parsed.glider || 'Parapendio';
    const gliderClass = deduceGliderClass(gliderName);

    /** @type {Object} */
    const metaRecord = {
      id: flightId,
      date: parsed.date || utcDate || new Date().toISOString().split('T')[0],
      utcDate: utcDate || parsed.utcDate || parsed.date,
      takeoffTime: parsed.takeoffTime || '12:00',
      landingTime: parsed.landingTime || '12:30',
      durationSeconds: Math.round((parsed.durationMinutes || 30) * 60),
      durationMinutes: Math.max(1, Math.round(parsed.durationMinutes || 30)),
      site: parsed.takeoffLocationName || parsed.siteName || 'Spot da IGC',
      siteName: parsed.siteName || 'Decollo -> Atterraggio',
      takeoffLocationName: parsed.takeoffLocationName || null,
      landingLocationName: parsed.landingLocationName || null,
      pilot: parsed.pilot || 'Pilota',
      glider: gliderName,
      gliderClass,
      hasThermals: (telemetry.thermalCount || 0) > 0 || stats.thermalCount > 0,
      hasExercises: Array.isArray(telemetry.maneuvers) && telemetry.maneuvers.length > 0,
      thermalsCount: telemetry.thermalCount || stats.thermalCount || 0,
      maneuversCount: Array.isArray(telemetry.maneuvers) ? telemetry.maneuvers.length : 0,
      detectedManeuvers: telemetry.detectedManeuverKeys || [],
      takeoffAltMsl: stats.takeoffAltitude || (flightPoints[0] ? flightPoints[0].alt : 0),
      landingAltMsl: stats.landingAltitude || (flightPoints[flightPoints.length - 1] ? flightPoints[flightPoints.length - 1].alt : 0),
      maxAltMsl: stats.maxAltitude || 0,
      minAltMsl: stats.minAltitude || 0,
      maxGainMeters: stats.maxGainMeters || 0,
      maxClimbRate: stats.maxClimb || 0,
      maxSinkRate: stats.maxSink || 0,
      accumulatedClimbMeters: stats.accumulatedClimbMeters || telemetry.accumulatedClimbMeters || 0,
      distanceKm: stats.totalDistanceKm || telemetry.totalDistanceKm || 0,
      sparklineSvgPoints,
      hasRawIgc: true,
      hasDecimatedTrack: true,
      rawFileSizeBytes: rawIgcText.length,
      originalFileName: fileName,
      updatedAt: nowUtc
    };

    /** @type {Object} */
    const rawRecord = {
      id: flightId,
      rawIgc: rawIgcText,
      originalFileName: fileName,
      decimatedPoints,
      telemetry,
      sampleIntervalSeconds: flightPoints.length > 1
        ? Math.round(Math.max(1, ((flightPoints[flightPoints.length - 1].timeSeconds || 0) - (flightPoints[0].timeSeconds || 0)) / flightPoints.length))
        : 1,
      updatedAt: nowUtc
    };

    // 5. Persist to adapter
    await this.adapter.saveFlight(metaRecord, rawRecord);

    // 6. Synchronize reactive store
    const allMetas = await this.adapter.getAllFlightMetas();
    if (store && typeof store.setState === 'function') {
      store.setState({ flights: allMetas });
    }

    if (onProgress) onProgress(100);

    return {
      meta: metaRecord,
      raw: rawRecord,
      isNew: !existingMeta,
      wasUpdated: !!existingMeta
    };
  }

  /**
   * Retrieves all flight metadata records ordered chronologically descending.
   * @returns {Promise<Array<Object>>}
   */
  async getAllFlights() {
    await this.init();
    return this.adapter.getAllFlightMetas();
  }

  /**
   * Directly saves a flight bundle (meta + raw) into adapter and updates store.
   * @param {Object} meta
   * @param {Object} raw
   * @returns {Promise<string>}
   */
  async saveFlight(meta, raw) {
    await this.init();
    const id = await this.adapter.saveFlight(meta, raw);
    const allMetas = await this.adapter.getAllFlightMetas();
    if (store && typeof store.setState === 'function') {
      store.setState({ flights: allMetas });
    }
    return id;
  }

  /**
   * Retrieves a single flight bundle (meta + raw).
   * @param {string} flightId
   * @returns {Promise<{ meta: Object, raw: Object }|null>}
   */
  async getFlight(flightId) {
    await this.init();
    return this.adapter.getFlight(flightId);
  }

  /**
   * Retrieves complete flight detail bundle with telemetry, thermals, and maneuvers.
   * If telemetry is not cached in raw record, recomputes on-the-fly.
   * @param {string} flightId
   * @returns {Promise<{ meta: Object, raw: Object, telemetry: Object }|null>}
   */
  async getFlightDetail(flightId) {
    await this.init();
    const bundle = await this.adapter.getFlight(flightId);
    if (!bundle || !bundle.meta) return null;

    let telemetry = bundle.raw?.telemetry || null;
    if (!telemetry && bundle.raw?.decimatedPoints && bundle.raw.decimatedPoints.length >= 5) {
      telemetry = analyzeFlightTelemetry(bundle.raw.decimatedPoints);
    }

    return {
      meta: bundle.meta,
      raw: bundle.raw,
      telemetry: telemetry || {}
    };
  }

  /**
   * Updates flight personal notes in meta store and synchronizes reactive store.
   * @param {string} flightId
   * @param {string} notes
   * @returns {Promise<Object|null>}
   */
  async updateFlightNotes(flightId, notes) {
    await this.init();
    return this.updateFlightMeta(flightId, { notes: String(notes || '') });
  }

  /**
   * Updates custom metadata patch and synchronizes reactive store.
   * @param {string} flightId
   * @param {Object} partialMeta
   * @returns {Promise<Object|null>}
   */
  async updateFlightMeta(flightId, partialMeta) {
    await this.init();
    const updated = await this.adapter.updateFlightMeta(flightId, partialMeta);
    if (updated) {
      const allMetas = await this.adapter.getAllFlightMetas();
      if (store && typeof store.setState === 'function') {
        store.setState({ flights: allMetas });
      }
    }
    return updated;
  }

  /**
   * Retrieves raw IGC text for export or validation.
   * @param {string} flightId
   * @returns {Promise<string|null>}
   */
  async getRawIgc(flightId) {
    await this.init();
    return this.adapter.getRawIgc(flightId);
  }

  /**
   * Retrieves pre-decimated 3D track points for Replay 3D.
   * @param {string} flightId
   * @returns {Promise<Array<Object>|null>}
   */
  async getDecimatedTrack(flightId) {
    await this.init();
    return this.adapter.getDecimatedTrack(flightId);
  }

  /**
   * Deletes a flight record from database and updates store.
   * @param {string} flightId
   * @returns {Promise<boolean>}
   */
  async deleteFlight(flightId) {
    await this.init();
    const success = await this.adapter.deleteFlight(flightId);
    if (success) {
      const allMetas = await this.adapter.getAllFlightMetas();
      if (store && typeof store.setState === 'function') {
        store.setState({ flights: allMetas });
      }
    }
    return success;
  }

  /**
   * Calculates overall career KPIs.
   * @returns {Promise<Object>}
   */
  async getCareerKpis() {
    await this.init();
    return this.adapter.getCareerKpis();
  }

  /**
   * Exports an authentic FAI IGC file for download preserving cryptographic G-record signatures.
   * In browser context triggers automatic download.
   * 
   * @param {string} flightId
   * @returns {Promise<{ rawIgc: string, fileName: string, mimeType: string }|null>}
   */
  async exportFlightIgc(flightId) {
    await this.init();
    const bundle = await this.adapter.getFlight(flightId);
    if (!bundle || !bundle.raw || !bundle.raw.rawIgc) {
      return null;
    }

    const rawIgc = bundle.raw.rawIgc;
    const defaultName = `${bundle.meta.date || 'flight'}-${(bundle.meta.site || 'track').replace(/[^a-zA-Z0-9_-]/g, '_')}.igc`;
    const fileName = bundle.raw.originalFileName || defaultName;
    const mimeType = 'application/x-igc';

    if (typeof fileSaver === 'function') {
      try {
        fileSaver({ content: rawIgc, fileName, mimeType });
      } catch (err) {
        console.warn('[LogbookManager] Custom fileSaver failed:', err);
      }
    }

    return { rawIgc, fileName, mimeType };
  }

  /**
   * Clears all flights from storage and synchronizes state.
   */
  async clearAll() {
    await this.init();
    await this.adapter.clearAll();
    if (store && typeof store.setState === 'function') {
      store.setState({ flights: [] });
    }
    return true;
  }
}

/**
 * Singleton LogbookManager instance.
 */
export const logbookManager = new LogbookManager();
