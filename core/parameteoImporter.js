/**
 * GlideMind - ParaMeteo Flight Logbook Importer (Headless Core)
 * Handles deterministic ingestion, schema normalization, and two-tier persistence
 * of flight backups exported from ParaMeteo:
 *   - V2 Full Backup packages (parameteo_backup_*.json)
 *   - V1 Logbook JSON exports (parameteo_logbook_*.json)
 *   - Bare flights JSON array
 * 
 * Compliant with Headless Core (Gate 1 & Gate 2): 100% executable in pure Node.js
 * without DOM, window, or document dependencies.
 */

import { deduceGliderClass, generateSparklinePoints, computeFlightFingerprint } from './logbookDb.js';
import { lttbDecimate, analyzeFlightTelemetry } from './flightTelemetry.js';
import { parseIgc } from './igcParser.js';
import { store } from './store.js';

/**
 * Validates and parses an incoming ParaMeteo JSON string or object.
 * Extracts flights array, consolidated flightTracks map, and package metadata.
 * 
 * @param {string|Object} jsonContent - JSON string or parsed object
 * @returns {{
 *   isValid: boolean,
 *   version: number,
 *   flights: Array<Object>,
 *   tracksMap: Map<string, Object>,
 *   summary: { flightsCount: number, tracksCount: number, exportedAt: string },
 *   error?: string
 * }}
 */
/**
 * Extracts raw IGC text or track points from a ParaMeteo flight object.
 * @param {Object} f
 * @returns {{ flightId: string, trackPoints: Array<Object>|null, rawIgc: string|null, telemetry: Object|null }|null}
 */
function extractEmbeddedTrack(f) {
  if (!f || typeof f !== 'object') return null;
  const rawIgc = (typeof f._rawIgcText === 'string' && f._rawIgcText.trim().length > 30)
    ? f._rawIgcText.trim()
    : ((typeof f.rawIgc === 'string' && f.rawIgc.trim().length > 30)
        ? f.rawIgc.trim()
        : ((typeof f.rawIgcText === 'string' && f.rawIgcText.trim().length > 30)
            ? f.rawIgcText.trim()
            : ((typeof f.igc === 'string' && f.igc.trim().length > 30)
                ? f.igc.trim()
                : null)));

  const pts = (Array.isArray(f.trackPoints) && f.trackPoints.length > 0)
    ? f.trackPoints
    : (Array.isArray(f.track) && f.track.length > 0
        ? f.track
        : (Array.isArray(f.points) && f.points.length > 0
            ? f.points
            : (Array.isArray(f.decimatedPoints) && f.decimatedPoints.length > 0 ? f.decimatedPoints : null)));

  if (pts || rawIgc) {
    return {
      flightId: f.id,
      trackPoints: pts || null,
      rawIgc: rawIgc || null,
      telemetry: f.telemetry || null
    };
  }
  return null;
}

export function parseParaMeteoBackup(jsonContent) {
  if (!jsonContent) {
    return { isValid: false, version: 0, flights: [], tracksMap: new Map(), summary: { flightsCount: 0, tracksCount: 0, exportedAt: '' }, error: 'Empty backup content' };
  }

  let data;
  if (typeof jsonContent === 'string') {
    const trimmed = jsonContent.trim();
    if (!trimmed) {
      return { isValid: false, version: 0, flights: [], tracksMap: new Map(), summary: { flightsCount: 0, tracksCount: 0, exportedAt: '' }, error: 'Empty backup string' };
    }
    try {
      data = JSON.parse(trimmed);
    } catch (err) {
      return { isValid: false, version: 0, flights: [], tracksMap: new Map(), summary: { flightsCount: 0, tracksCount: 0, exportedAt: '' }, error: `JSON parse error: ${err.message}` };
    }
  } else if (typeof jsonContent === 'object') {
    data = jsonContent;
  } else {
    return { isValid: false, version: 0, flights: [], tracksMap: new Map(), summary: { flightsCount: 0, tracksCount: 0, exportedAt: '' }, error: 'Invalid payload type' };
  }

  // 1. Detect V2 Full Backup Package
  if ((data.version === 2 && data.database) || (data.app === 'ParaMeteo' && data.version === 2)) {
    const rawFlights = Array.isArray(data.database?.flights)
      ? data.database.flights
      : (Array.isArray(data.flights) ? data.flights : []);
    const validFlights = rawFlights.filter(f => f && typeof f === 'object' && !f.isDeleted);

    const rawTracks = Array.isArray(data.database?.flightTracks)
      ? data.database.flightTracks
      : (Array.isArray(data.flightTracks) ? data.flightTracks : []);

    const tracksMap = new Map();
    for (const trk of rawTracks) {
      if (trk && trk.flightId && Array.isArray(trk.trackPoints) && trk.trackPoints.length > 0) {
        tracksMap.set(trk.flightId, trk);
      }
    }

    // Reconcile any embedded tracks in flight objects
    for (const f of validFlights) {
      if (f.id && !tracksMap.has(f.id)) {
        const embedded = extractEmbeddedTrack(f);
        if (embedded) {
          tracksMap.set(f.id, embedded);
        }
      }
    }

    return {
      isValid: true,
      version: 2,
      flights: validFlights,
      tracksMap,
      summary: {
        flightsCount: validFlights.length,
        tracksCount: tracksMap.size,
        exportedAt: data.exportedAt || data.meta?.exportedAt || 'Unknown'
      }
    };
  }

  // 2. Detect V1 Logbook Export or Standard Flights Object
  if (Array.isArray(data.flights) || Array.isArray(data.logbook_flights) || (data.app === 'ParaMeteo' && Array.isArray(data.flights))) {
    const rawFlights = Array.isArray(data.flights) ? data.flights : (data.logbook_flights || []);
    const validFlights = rawFlights.filter(f => f && typeof f === 'object' && !f.isDeleted);

    const tracksMap = new Map();
    if (Array.isArray(data.flightTracks)) {
      for (const trk of data.flightTracks) {
        if (trk && trk.flightId && Array.isArray(trk.trackPoints) && trk.trackPoints.length > 0) {
          tracksMap.set(trk.flightId, trk);
        }
      }
    }

    for (const f of validFlights) {
      if (f.id && !tracksMap.has(f.id)) {
        const embedded = extractEmbeddedTrack(f);
        if (embedded) {
          tracksMap.set(f.id, embedded);
        }
      }
    }

    return {
      isValid: true,
      version: 1,
      flights: validFlights,
      tracksMap,
      summary: {
        flightsCount: validFlights.length,
        tracksCount: tracksMap.size,
        exportedAt: data.exportedAt || 'Legacy'
      }
    };
  }

  // 3. Detect Bare Flights Array
  if (Array.isArray(data)) {
    const validFlights = data.filter(f => f && typeof f === 'object' && !f.isDeleted);
    const tracksMap = new Map();

    for (const f of validFlights) {
      if (f.id && !tracksMap.has(f.id)) {
        const embedded = extractEmbeddedTrack(f);
        if (embedded) {
          tracksMap.set(f.id, embedded);
        }
      }
    }

    return {
      isValid: true,
      version: 0,
      flights: validFlights,
      tracksMap,
      summary: {
        flightsCount: validFlights.length,
        tracksCount: tracksMap.size,
        exportedAt: 'Raw Array'
      }
    };
  }

  return {
    isValid: false,
    version: 0,
    flights: [],
    tracksMap: new Map(),
    summary: { flightsCount: 0, tracksCount: 0, exportedAt: '' },
    error: 'Unrecognized backup structure: payload lacks valid flights collection.'
  };
}

/**
 * Converts a raw ParaMeteo flight record and optional associated track
 * into a GlideMind normalized bundle { meta, raw }.
 * 
 * @param {Object} flight - Raw flight record from ParaMeteo
 * @param {Object|null} [trackData=null] - Track data record { trackPoints, telemetry }
 * @param {Object} [options={}] - Additional conversion options
 * @returns {{ meta: Object, raw: Object }} Normalized GlideMind flight bundle
 */
export function convertParaMeteoFlight(flight, trackData = null, options = {}) {
  if (!flight || typeof flight !== 'object') {
    throw new Error('[convertParaMeteoFlight] Invalid flight record provided');
  }

  // Extract raw IGC text from various known ParaMeteo export properties
  const rawIgc = (typeof flight._rawIgcText === 'string' && flight._rawIgcText.trim().length > 30)
    ? flight._rawIgcText.trim()
    : ((typeof flight.rawIgc === 'string' && flight.rawIgc.trim().length > 30)
        ? flight.rawIgc.trim()
        : ((typeof flight.rawIgcText === 'string' && flight.rawIgcText.trim().length > 30)
            ? flight.rawIgcText.trim()
            : ((typeof flight.igc === 'string' && flight.igc.trim().length > 30)
                ? flight.igc.trim()
                : (typeof trackData?.rawIgc === 'string' && trackData.rawIgc.trim().length > 30
                    ? trackData.rawIgc.trim()
                    : null))));

  // Extract or synthesize track points
  let rawPoints = trackData?.trackPoints
    || (Array.isArray(flight.trackPoints) && flight.trackPoints.length > 0 ? flight.trackPoints : null)
    || (Array.isArray(flight.track) && flight.track.length > 0 ? flight.track : null)
    || (Array.isArray(flight.points) && flight.points.length > 0 ? flight.points : null)
    || (Array.isArray(flight.decimatedPoints) && flight.decimatedPoints.length > 0 ? flight.decimatedPoints : null);

  let telemetry = trackData?.telemetry || flight.telemetry || null;

  // If track points are absent but raw IGC text is available, parse IGC on-the-fly
  if ((!rawPoints || rawPoints.length < 2) && rawIgc) {
    try {
      const catalog = options.spotsCatalog || (typeof store?.getState === 'function' ? store.getState()?.spotsCatalog : null) || [];
      const parsedIgc = parseIgc(rawIgc, catalog);
      if (parsedIgc && Array.isArray(parsedIgc.trackPoints) && parsedIgc.trackPoints.length >= 2) {
        rawPoints = parsedIgc.trackPoints;
        if (!telemetry || Object.keys(telemetry).length === 0) {
          telemetry = parsedIgc.telemetry;
        }
      }
    } catch (parseErr) {
      // Graceful fallback for malformed or incomplete IGC strings
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[convertParaMeteoFlight] IGC parse fallback for flight ${flight.id || 'unknown'}:`, parseErr.message);
      }
    }
  }

  const hasPoints = Array.isArray(rawPoints) && rawPoints.length >= 2;
  const points = hasPoints ? rawPoints : null;

  // Determine flight identifier
  let flightId = flight.id;
  if (!flightId || typeof flightId !== 'string' || !flightId.trim()) {
    const d = flight.date || flight.utcDate || '1970-01-01';
    flightId = computeFlightFingerprint(d, '', '', Number(flight.durationMinutes) || 0);
  }

  // Normalise dates and times
  const dateStr = flight.date || (flight.utcDate ? flight.utcDate.split('T')[0] : '') || new Date().toISOString().split('T')[0];
  const utcDateStr = flight.utcDate || flight.date || dateStr;
  const takeoffTime = flight.takeoffTime || '12:00';
  const landingTime = flight.landingTime || '12:30';

  let durationMinutes = Number(flight.durationMinutes);
  if (!durationMinutes || isNaN(durationMinutes) || durationMinutes <= 0) {
    if (Number(flight.durationSeconds) > 0) {
      durationMinutes = Math.max(1, Math.round(Number(flight.durationSeconds) / 60));
    } else {
      durationMinutes = 30;
    }
  } else {
    durationMinutes = Math.max(1, Math.round(durationMinutes));
  }
  const durationSeconds = Number(flight.durationSeconds) || Math.round(durationMinutes * 60);

  // Normalise locations & pilot
  const takeoffLocation = flight.takeoffLocationName || null;
  const landingLocation = flight.landingLocationName || null;
  const siteName = flight.siteName
    || (takeoffLocation && landingLocation ? `${takeoffLocation} -> ${landingLocation}` : null)
    || flight.site
    || flight.location
    || 'Volo ParaMeteo';
  const site = takeoffLocation || flight.site || (siteName.includes('->') ? siteName.split('->')[0].trim() : siteName);
  const pilot = flight.pilot || 'Pilota';

  // Normalise glider and certification class
  const gliderName = flight.gear?.glider || flight.glider || flight.gliderType || 'Parapendio';
  const gliderClass = deduceGliderClass(flight.gear?.category ? { name: gliderName, category: flight.gear.category } : gliderName);

  // Telemetry and decimation
  let decimatedPoints = [];
  let sparklineSvgPoints = '0,16 100,16';

  if (points) {
    sparklineSvgPoints = generateSparklinePoints(points, 60, 100, 32);
    decimatedPoints = points.length <= 1500
      ? points
      : lttbDecimate(points, 1500, 'alt');

    if (!telemetry || typeof telemetry !== 'object' || !Array.isArray(telemetry.thermals)) {
      if (points.length >= 5) {
        telemetry = analyzeFlightTelemetry(points);
      } else {
        telemetry = {};
      }
    }
  } else {
    telemetry = telemetry || {};
  }

  // Normalise flight statistics
  const stats = flight.stats || {};
  let takeoffAltMsl = stats.takeoffAltitude != null
    ? stats.takeoffAltitude
    : (flight.takeoffAltMsl != null ? flight.takeoffAltMsl : (points ? (points[0].alt || 0) : 0));
  if (takeoffAltMsl === 0 && points && points[0]?.alt) {
    takeoffAltMsl = points[0].alt;
  }

  let landingAltMsl = stats.landingAltitude != null
    ? stats.landingAltitude
    : (flight.landingAltMsl != null ? flight.landingAltMsl : (points ? (points[points.length - 1].alt || 0) : 0));
  if (landingAltMsl === 0 && points && points[points.length - 1]?.alt) {
    landingAltMsl = points[points.length - 1].alt;
  }

  let maxAltMsl = stats.maxAltitude != null
    ? stats.maxAltitude
    : (flight.maxAltMsl != null ? flight.maxAltMsl : (flight.maxAltitude != null ? flight.maxAltitude : 0));
  if (maxAltMsl === 0 && points) {
    maxAltMsl = Math.max(...points.map(p => p.alt || 0));
  }

  let minAltMsl = stats.minAltitude != null
    ? stats.minAltitude
    : (flight.minAltMsl != null ? flight.minAltMsl : (flight.minAltitude != null ? flight.minAltitude : 0));
  if (minAltMsl === 0 && points) {
    minAltMsl = Math.min(...points.map(p => p.alt || 0));
  }

  let maxGainMeters = stats.maxGainMeters != null
    ? stats.maxGainMeters
    : (flight.maxGainMeters != null ? flight.maxGainMeters : (flight.maxGain != null ? flight.maxGain : 0));
  if (maxGainMeters === 0 && maxAltMsl > takeoffAltMsl) {
    maxGainMeters = maxAltMsl - takeoffAltMsl;
  }

  let maxClimbRate = stats.maxClimb != null
    ? stats.maxClimb
    : (flight.maxClimbRate != null ? flight.maxClimbRate : (flight.maxClimb != null ? flight.maxClimb : 0));
  if (maxClimbRate === 0 && telemetry?.maxClimbRate) {
    maxClimbRate = telemetry.maxClimbRate;
  }

  let maxSinkRate = stats.maxSink != null
    ? stats.maxSink
    : (flight.maxSinkRate != null ? flight.maxSinkRate : (flight.maxSink != null ? flight.maxSink : 0));
  if (maxSinkRate === 0 && telemetry?.maxSinkRate) {
    maxSinkRate = telemetry.maxSinkRate;
  }

  const accumulatedClimbMeters = stats.accumulatedClimbMeters != null
    ? stats.accumulatedClimbMeters
    : (telemetry.accumulatedClimbMeters != null ? telemetry.accumulatedClimbMeters : (flight.accumulatedClimbMeters || 0));
  const distanceKm = stats.totalDistanceKm != null
    ? stats.totalDistanceKm
    : (flight.distanceKm != null ? flight.distanceKm : (telemetry.totalDistanceKm || 0));

  const thermalsCount = stats.thermalCount != null
    ? stats.thermalCount
    : (telemetry.thermalCount != null ? telemetry.thermalCount : (Array.isArray(telemetry.thermals) ? telemetry.thermals.length : 0));
  const hasThermals = thermalsCount > 0;

  const rawManeuvers = telemetry.detectedManeuverKeys
    || (Array.isArray(flight.maneuvers) ? flight.maneuvers : null)
    || (Array.isArray(flight.manouvers) ? flight.manouvers : null)
    || [];
  const detectedManeuvers = Array.isArray(rawManeuvers) ? rawManeuvers : [];
  const maneuversCount = detectedManeuvers.length;
  const hasExercises = maneuversCount > 0;

  // Personal notes and debriefing
  const notes = String(flight.notes || flight.debriefing || '').trim();

  // Timestamp
  let updatedAt = Date.now();
  if (typeof flight.updatedAt === 'number' && !isNaN(flight.updatedAt)) {
    updatedAt = flight.updatedAt;
  } else if (typeof flight.updatedAt === 'string') {
    const parsedTs = Date.parse(flight.updatedAt);
    if (!isNaN(parsedTs)) updatedAt = parsedTs;
  }

  // Construct meta record
  const metaRecord = {
    id: flightId,
    date: dateStr,
    utcDate: utcDateStr,
    takeoffTime,
    landingTime,
    durationSeconds,
    durationMinutes,
    site,
    siteName,
    takeoffLocationName: takeoffLocation,
    landingLocationName: landingLocation,
    pilot,
    glider: gliderName,
    gliderClass,
    hasThermals,
    hasExercises,
    thermalsCount,
    maneuversCount,
    detectedManeuvers,
    takeoffAltMsl,
    landingAltMsl,
    maxAltMsl,
    minAltMsl,
    maxGainMeters,
    maxClimbRate,
    maxSinkRate,
    accumulatedClimbMeters,
    distanceKm: Math.round(distanceKm * 10) / 10,
    sparklineSvgPoints,
    hasRawIgc: !!(rawIgc && rawIgc.length > 30),
    hasDecimatedTrack: decimatedPoints.length > 0,
    rawFileSizeBytes: rawIgc ? rawIgc.length : (points ? points.length * 40 : 0),
    isTrimmed: !!flight.isTrimmed,
    trimIndices: flight.trimIndices || null,
    originalFileName: flight.originalFileName || `parameteo_${flightId}.json`,
    notes,
    updatedAt
  };

  // Construct raw record
  const rawRecord = {
    id: flightId,
    rawIgc: rawIgc || null,
    originalFileName: metaRecord.originalFileName,
    originalPoints: points || null,
    decimatedPoints,
    telemetry,
    sampleIntervalSeconds: (points && points.length > 1)
      ? Math.round(Math.max(1, ((points[points.length - 1].timeSeconds || 0) - (points[0].timeSeconds || 0)) / points.length))
      : 1,
    updatedAt
  };

  return { meta: metaRecord, raw: rawRecord };
}

/**
 * Imports a complete ParaMeteo backup package or flights array into GlideMind.
 * Implements idempotent Last-Write-Wins merge or full overwrite.
 * 
 * @param {string|Object} jsonContent - JSON string or parsed object
 * @param {Object} logbookManager - LogbookManager instance
 * @param {Object} [options={}] - Import options
 * @param {'merge'|'overwrite'} [options.mode='merge'] - Restore strategy ('merge' preserves existing newer records)
 * @param {boolean} [options.overwrite=false] - Convenience alias for mode='overwrite'
 * @param {(pct: number) => void} [options.onProgress] - Optional progress notification callback
 * @returns {Promise<{
 *   success: boolean,
 *   totalFlightsInBackup: number,
 *   importedFlightsCount: number,
 *   newFlightsCount: number,
 *   updatedFlightsCount: number,
 *   skippedFlightsCount: number,
 *   tracksImportedCount: number,
 *   errors: Array<string>
 * }>}
 */
export async function importParaMeteoData(jsonContent, logbookManager, options = {}) {
  if (!logbookManager) {
    throw new Error('[importParaMeteoData] logbookManager instance is required');
  }

  const mode = options.overwrite === true ? 'overwrite' : (options.mode || 'merge');
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  if (onProgress) onProgress(5);

  const parsed = parseParaMeteoBackup(jsonContent);
  if (!parsed.isValid) {
    return {
      success: false,
      totalFlightsInBackup: 0,
      importedFlightsCount: 0,
      newFlightsCount: 0,
      updatedFlightsCount: 0,
      skippedFlightsCount: 0,
      tracksImportedCount: 0,
      errors: [parsed.error || 'Invalid ParaMeteo backup format']
    };
  }

  if (onProgress) onProgress(20);

  const flights = parsed.flights;
  const tracksMap = parsed.tracksMap;
  const totalFlights = flights.length;

  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let tracksImportedCount = 0;
  const errors = [];

  for (let i = 0; i < totalFlights; i++) {
    const rawFlight = flights[i];
    try {
      const trackData = rawFlight.id ? tracksMap.get(rawFlight.id) : null;
      const { meta, raw } = convertParaMeteoFlight(rawFlight, trackData, options);

      if (raw.decimatedPoints && raw.decimatedPoints.length > 0) {
        tracksImportedCount++;
      }

      if (mode === 'overwrite') {
        // Unconditional save
        await logbookManager.adapter.saveFlight(meta, raw);
        newCount++;
      } else {
        // Merge mode: check existing flight
        const existing = await logbookManager.adapter.getFlight(meta.id);
        if (!existing || !existing.meta) {
          await logbookManager.adapter.saveFlight(meta, raw);
          newCount++;
        } else {
          // Last-Write-Wins comparison
          const existingUpdated = Number(existing.meta.updatedAt) || 0;
          const incomingUpdated = Number(meta.updatedAt) || 0;
          const existingHasTrack = Array.isArray(existing.raw?.decimatedPoints) && existing.raw.decimatedPoints.length > 0;
          const incomingHasTrack = Array.isArray(raw.decimatedPoints) && raw.decimatedPoints.length > 0;

          const isNewer = incomingUpdated > existingUpdated;
          const addsTrack = !existingHasTrack && incomingHasTrack;

          // Update if incoming is strictly newer or incoming supplies track points that existing lacked
          if (isNewer || addsTrack) {
            // Retain existing notes if incoming notes are empty
            if (!meta.notes && existing.meta.notes) {
              meta.notes = existing.meta.notes;
            }
            await logbookManager.adapter.saveFlight(meta, raw);
            updatedCount++;
          } else {
            skippedCount++;
          }
        }
      }
    } catch (flightErr) {
      errors.push(`Flight #${i + 1} (${rawFlight.id || 'unidentified'}): ${flightErr.message}`);
    }

    if (onProgress && totalFlights > 0) {
      const pct = 20 + Math.round(((i + 1) / totalFlights) * 75);
      onProgress(Math.min(95, pct));
    }
  }

  // Refresh reactive store once at the end of the batch
  const allMetas = await logbookManager.adapter.getAllFlightMetas();
  if (store && typeof store.setState === 'function') {
    store.setState({ flights: allMetas });
  }

  if (onProgress) onProgress(100);

  return {
    success: errors.length === 0 || (newCount + updatedCount) > 0,
    totalFlightsInBackup: totalFlights,
    importedFlightsCount: newCount + updatedCount,
    newFlightsCount: newCount,
    updatedFlightsCount: updatedCount,
    skippedFlightsCount: skippedCount,
    tracksImportedCount,
    errors
  };
}
