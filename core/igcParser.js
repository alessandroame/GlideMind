/**
 * FAI IGC Tracklog Parser & Aeronautical Telemetry Extractor for GlideMind
 * Compliant with FAI GNSS Flight Recorder Specification (B-record telemetry, H-record metadata).
 * 
 * Headless module with zero DOM dependencies.
 */

import { igcDmmToDecimal, computeDistanceKm } from './geoSpatialMath.js';

/**
 * Calculates Great-Circle distance between two points in kilometers.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    return computeDistanceKm(lat1, lon1, lat2, lon2);
}

/**
 * Converts IGC coordinates into decimal degrees using geodesic WGS84 parsing.
 * Example Lat: 4522732N -> 45 + 22.732 / 60 = 45.378867
 * Example Lon: 00721407E -> 7 + 21.407 / 60 = 7.356783
 * 
 * @param {string} rawLat 
 * @param {string} rawLon 
 * @returns {{ lat: number, lon: number }}
 */
export function parseIgcCoords(rawLat, rawLon) {
    return {
        lat: igcDmmToDecimal(rawLat, 'lat'),
        lon: igcDmmToDecimal(rawLon, 'lon')
    };
}

/**
 * Auto-detects takeoff and landing site names from known spots catalog within a proximity radius.
 * 
 * @param {{ lat: number, lon: number }} firstPoint 
 * @param {{ lat: number, lon: number }} lastPoint 
 * @param {Array<Object>} [knownSpots=[]] Catalog of takeoff & landing spots
 * @param {number} [maxRadiusKm=0.50] Proximity threshold in kilometers (default 500m)
 * @returns {{
 *   takeoffName: string|null,
 *   landingName: string|null,
 *   siteTitle: string,
 *   minTakeoffDistKm: number|null,
 *   minLandingDistKm: number|null
 * }}
 */
export function matchTrackSpots(firstPoint, lastPoint, knownSpots = [], maxRadiusKm = 0.50) {
    let detectedTakeoffName = null;
    let detectedLandingName = null;
    let minTakeoffDist = maxRadiusKm;
    let minLandingDist = maxRadiusKm;

    if (firstPoint && lastPoint && Array.isArray(knownSpots) && knownSpots.length > 0) {
        for (const spot of knownSpots) {
            const spotLat = Number(spot.lat != null ? spot.lat : spot.latitude);
            const spotLon = Number(spot.lon != null ? spot.lon : (spot.lng != null ? spot.lng : spot.longitude));
            if (isNaN(spotLat) || isNaN(spotLon)) continue;

            const spotName = spot.name || spot.point || spot.location || spot.id || '';
            const spotNameLower = String(spotName).toLowerCase();
            const spotType = String(spot.type || '').toLowerCase();

            const isLandingType = spotType === 'landing' || spotNameLower.includes('atterraggio');
            const isTakeoffType = spotType === 'takeoff' || spotNameLower.includes('decollo');

            // Takeoff proximity check (first track point)
            const dTakeoff = calculateDistanceKm(firstPoint.lat, firstPoint.lon, spotLat, spotLon);
            if (!isLandingType && dTakeoff <= minTakeoffDist) {
                minTakeoffDist = dTakeoff;
                detectedTakeoffName = spotName;
            }

            // Landing proximity check (last track point)
            const dLanding = calculateDistanceKm(lastPoint.lat, lastPoint.lon, spotLat, spotLon);
            if (!isTakeoffType && dLanding <= minLandingDist) {
                minLandingDist = dLanding;
                detectedLandingName = spotName;
            }
        }
    }

    const siteTitle = detectedTakeoffName !== null
        ? (detectedLandingName !== null ? `${detectedTakeoffName} -> ${detectedLandingName}` : detectedTakeoffName)
        : (detectedLandingName !== null ? `Volo -> ${detectedLandingName}` : 'Decollo Sconosciuto');

    return {
        takeoffName: detectedTakeoffName,
        landingName: detectedLandingName,
        siteTitle,
        minTakeoffDistKm: detectedTakeoffName ? Math.round(minTakeoffDist * 1000) / 1000 : null,
        minLandingDistKm: detectedLandingName ? Math.round(minLandingDist * 1000) / 1000 : null
    };
}

/**
 * Automatically trims static pre-takeoff ground points (waiting/preparation on the mat)
 * and post-landing ground points (packing in the field) from a paragliding GPS track.
 * 
 * @param {Array<Object>} points Chronologically sorted track points
 * @returns {Array<Object>} Trimmed track points from true takeoff to true landing
 */
export function trimFlightGroundPoints(points) {
    if (!Array.isArray(points) || points.length < 15) return points ? [...points] : [];
    const n = points.length;

    // 1. Calculate ground speeds between consecutive points
    const speeds = new Array(n);
    speeds[0] = 0;
    for (let i = 1; i < n; i++) {
        const dt = Math.max(0.5, (points[i].timeSeconds || i) - (points[i - 1].timeSeconds || (i - 1)));
        const dKm = calculateDistanceKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
        speeds[i] = (dKm / (dt / 3600));
    }

    // 2. Identify Takeoff Point (Inflation & launch run)
    let takeoffIdx = 0;
    for (let i = 0; i < n - 5; i++) {
        const s0 = speeds[i], s1 = speeds[i + 1], s2 = speeds[i + 2];
        const altDelta = Math.abs(points[i + 3].alt - points[0].alt);
        const distFromStart = calculateDistanceKm(points[0].lat, points[0].lon, points[i].lat, points[i].lon) * 1000;

        // Sustained flight speed >= 11-12 km/h over 3 consecutive points OR displacement > 45m OR altitude drop/climb > 15m
        if ((s0 >= 11 && s1 >= 12 && s2 >= 12) || (distFromStart > 45 && s1 >= 10) || altDelta > 15) {
            takeoffIdx = Math.max(0, i - 2); // Retain 2 points of run-up / inflation
            break;
        }
    }

    // 3. Identify Landing Point (Touchdown flare)
    let landingIdx = n - 1;
    for (let i = n - 1; i >= Math.max(takeoffIdx + 10, 5); i--) {
        const s0 = speeds[i], sPrev1 = speeds[i - 1], sPrev2 = speeds[i - 2];
        const altDeltaFromEnd = Math.abs(points[i].alt - points[n - 1].alt);
        const distFromEnd = calculateDistanceKm(points[i].lat, points[i].lon, points[n - 1].lat, points[n - 1].lon) * 1000;

        // Sustained flight speed before touchdown >= 11-12 km/h OR displacement > 45m OR altitude delta > 15m
        if ((s0 >= 11 && sPrev1 >= 12 && sPrev2 >= 12) || (distFromEnd > 45 && sPrev1 >= 10) || altDeltaFromEnd > 15) {
            landingIdx = Math.min(n - 1, i + 2); // Retain 2 points of touchdown flare
            break;
        }
    }

    if (landingIdx - takeoffIdx < 5) return [...points];
    return points.slice(takeoffIdx, landingIdx + 1);
}

/**
 * Parses a raw FAI IGC text file string into structured flight metadata, telemetry, and statistics.
 * 
 * @param {string} igcText Raw IGC file content
 * @param {Array<Object>} [knownSpots=[]] Optional catalog of takeoff & landing spots
 * @param {Object} [options={}] Optional configuration options
 * @param {Object|string} [options.activeGlider] User active glider object or name
 * @param {boolean} [options.useActiveGlider=false] Always override glider with active glider
 * @param {string} [options.glider] Fallback glider name
 * @param {Function} [options.telemetryAnalyzer] Optional custom kinematics/thermal analyzer function
 * @returns {Object} Structured flight metadata and statistics
 */
export function parseIgc(igcText, knownSpots = [], options = {}) {
    if (!igcText || typeof igcText !== 'string') {
        throw new Error('Invalid or empty IGC text content');
    }

    const lines = igcText.split(/\r?\n/);
    let flightDate = null; // YYYY-MM-DD
    let pilotName = '';
    let gliderType = '';
    let recorderType = '';
    const points = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const recordType = line.charAt(0);

        // Header Records (H)
        if (recordType === 'H') {
            const upper = line.toUpperCase();
            if (upper.startsWith('HFDTE') || upper.startsWith('HCDTE')) {
                // Formats: HFDTE150826, HFDTE 150826, HFDTE DATE:150826,01
                const dateMatch = line.match(/^H[FC]DTE(?:DATE:)?\s*([0-9]{6,8})/i);
                if (dateMatch) {
                    const dateStr = dateMatch[1];
                    const day = dateStr.substring(0, 2);
                    const month = dateStr.substring(2, 4);
                    let year;
                    if (dateStr.length >= 8) {
                        year = parseInt(dateStr.substring(4, 8), 10);
                    } else {
                        const yr2 = parseInt(dateStr.substring(4, 6), 10);
                        year = yr2 < 80 ? 2000 + yr2 : 1900 + yr2;
                    }
                    flightDate = `${year}-${month}-${day}`;
                }
            } else if (upper.includes('PLT') || upper.includes('PILOT')) {
                pilotName = line.split(':').slice(1).join(':').trim() || line.substring(line.indexOf('PILOT') + 5).trim();
            } else if (upper.includes('GTY') || upper.includes('GLIDERTYPE')) {
                gliderType = line.split(':').slice(1).join(':').trim() || line.substring(line.indexOf('GLIDERTYPE') + 10).trim();
            } else if (upper.includes('RFW') || upper.includes('FTY')) {
                recorderType = line.split(':').slice(1).join(':').trim();
            }
        }

        // Fix B Records: B HHMMSS DDMMmmmN DDDMMmmmE A PPPPP GGGGG (35 chars min)
        else if (recordType === 'B' && line.length >= 35) {
            try {
                const timeStr = line.substring(1, 7); // HHMMSS
                const hours = parseInt(timeStr.substring(0, 2), 10);
                const mins = parseInt(timeStr.substring(2, 4), 10);
                const secs = parseInt(timeStr.substring(4, 6), 10);
                const totalSeconds = hours * 3600 + mins * 60 + secs;

                const rawLat = line.substring(7, 15);
                const rawLon = line.substring(15, 24);
                const validity = line.charAt(24);

                if (validity !== 'A' && validity !== 'V') continue;

                const { lat, lon } = parseIgcCoords(rawLat, rawLon);
                const pressAlt = parseInt(line.substring(25, 30), 10) || 0;
                const gpsAlt = parseInt(line.substring(30, 35), 10) || pressAlt;

                points.push({
                    timeSeconds: totalSeconds,
                    timeFormatted: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
                    lat,
                    lon,
                    alt: gpsAlt || pressAlt,
                    pressAlt,
                    gpsAlt
                });
            } catch {
                // Ignore malformed B record
            }
        }
    }

    if (points.length === 0) {
        throw new Error('IGC file contains no valid B-record flight coordinates');
    }

    // Convert UTC timestamps to Local Time (IGC B-records and HFDTE are strictly in UTC per FAI standard)
    let localFlightDate = flightDate;
    const dStr = flightDate || new Date().toISOString().split('T')[0];
    const [y, m, d] = dStr.split('-').map(Number);

    points.forEach(p => {
        const utcHours = Math.floor(p.timeSeconds / 3600);
        const utcMins = Math.floor((p.timeSeconds % 3600) / 60);
        const utcSecs = p.timeSeconds % 60;

        const utcDate = new Date(Date.UTC(y, m - 1, d, utcHours, utcMins, utcSecs));
        const localHours = utcDate.getHours();
        const localMins = utcDate.getMinutes();
        const localSecs = utcDate.getSeconds();

        p.utcTimeSeconds = p.timeSeconds;
        p.utcTimeFormatted = p.timeFormatted;

        p.timeSeconds = localHours * 3600 + localMins * 60 + localSecs;
        p.timeFormatted = `${String(localHours).padStart(2, '0')}:${String(localMins).padStart(2, '0')}:${String(localSecs).padStart(2, '0')}`;
    });

    const firstUtcHours = Math.floor(points[0].utcTimeSeconds / 3600);
    const firstUtcMins = Math.floor((points[0].utcTimeSeconds % 3600) / 60);
    const firstUtcDate = new Date(Date.UTC(y, m - 1, d, firstUtcHours, firstUtcMins));
    const localY = firstUtcDate.getFullYear();
    const localM = String(firstUtcDate.getMonth() + 1).padStart(2, '0');
    const localD = String(firstUtcDate.getDate()).padStart(2, '0');
    localFlightDate = `${localY}-${localM}-${localD}`;

    // Sort chronologically in case records were unordered
    points.sort((a, b) => a.timeSeconds - b.timeSeconds);

    // Filter out static moments before takeoff and after landing
    const trimmedPoints = trimFlightGroundPoints(points);
    const flightPoints = (trimmedPoints && trimmedPoints.length >= 2) ? trimmedPoints : points;

    const firstPoint = flightPoints[0];
    const lastPoint = flightPoints[flightPoints.length - 1];

    const takeoffTime = firstPoint.timeFormatted.substring(0, 5); // Local HH:MM
    const landingTime = lastPoint.timeFormatted.substring(0, 5);
    const durationSeconds = Math.max(0, (lastPoint.utcTimeSeconds !== undefined && firstPoint.utcTimeSeconds !== undefined)
        ? (lastPoint.utcTimeSeconds - firstPoint.utcTimeSeconds)
        : (lastPoint.timeSeconds - firstPoint.timeSeconds));
    const durationMinutes = Math.round(durationSeconds / 60);

    // Physical bounds for free flight: max climb/sink +/- 18.0 m/s
    const MAX_PHYSICAL_VARIO_MS = 18.0;

    let minAlt = firstPoint.alt;
    let maxAlt = firstPoint.alt;
    let maxClimbRate = 0; // m/s
    let maxSinkRate = 0;  // m/s
    let totalDistanceKm = 0;
    let accumulatedClimbMeters = 0;
    let maxVarioPoint = firstPoint;
    let maxAltPoint = firstPoint;

    firstPoint.vario = 0;
    firstPoint.speedKmh = 0;

    for (let i = 1; i < flightPoints.length; i++) {
        const prev = flightPoints[i - 1];
        const curr = flightPoints[i];

        const dt = Math.max(0.5, curr.timeSeconds - prev.timeSeconds);
        const dz = curr.alt - prev.alt;
        let rawVario = dz / dt;
        const distKm = calculateDistanceKm(prev.lat, prev.lon, curr.lat, curr.lon);
        let speedKmh = Math.round((distKm / (dt / 3600)) * 10) / 10;

        // Anti-spike filter: if instantaneous vertical rate exceeds physical limits (+/- 25 m/s), clamp and smooth
        let vario = rawVario;
        if (Math.abs(rawVario) > 25.0) {
            vario = Math.sign(rawVario) * MAX_PHYSICAL_VARIO_MS;
            curr.alt = Math.round(prev.alt + vario * dt);
        }
        vario = Math.round(Math.min(MAX_PHYSICAL_VARIO_MS, Math.max(-MAX_PHYSICAL_VARIO_MS, vario)) * 10) / 10;

        if (curr.alt > maxAlt) {
            maxAlt = curr.alt;
            maxAltPoint = curr;
        }
        if (curr.alt < minAlt) minAlt = curr.alt;

        if (dt <= 10) {
            if (vario > maxClimbRate) {
                maxClimbRate = vario;
                maxVarioPoint = curr;
            }
            if (vario < maxSinkRate) maxSinkRate = vario;
        }

        if (dz > 0) {
            accumulatedClimbMeters += dz;
        }

        curr.vario = vario;
        curr.speedKmh = speedKmh;
        totalDistanceKm += distKm;
    }

    const maxGain = Math.max(0, maxAlt - firstPoint.alt);

    // Advanced kinematics or default telemetry summary
    let telemetry;
    if (typeof options.telemetryAnalyzer === 'function') {
        telemetry = options.telemetryAnalyzer(flightPoints);
    } else {
        telemetry = {
            pointsCount: flightPoints.length,
            thermals: [],
            thermalCount: 0,
            accumulatedClimbMeters: Math.round(accumulatedClimbMeters),
            thermalGainMeters: 0,
            soaringGainMeters: 0,
            maxThermalGain: 0,
            bestThermal: null,
            phases: [],
            dominantWindDrift: null,
            detectedManeuverKeys: []
        };
    }

    // Auto-detect takeoff and landing site names from known spots catalog within 500m
    const { takeoffName, landingName, siteTitle } = matchTrackSpots(firstPoint, lastPoint, knownSpots, 0.50);
    const detectedTakeoffName = takeoffName || 'Decollo Sconosciuto';
    const detectedLandingName = landingName || 'Atterraggio Sconosciuto';

    const finalLocalDate = localFlightDate || flightDate || new Date().toISOString().split('T')[0];

    // Glider resolution
    const activeGliderObj = options.activeGlider || (typeof options.getActiveGlider === 'function' ? options.getActiveGlider() : null);
    const activeGliderName = typeof activeGliderObj === 'string'
        ? activeGliderObj
        : (activeGliderObj?.name || (activeGliderObj ? `${activeGliderObj.brand || ''} ${activeGliderObj.model || ''}`.trim() : null));

    const defaultGliderName = options.glider || activeGliderName || 'Parapendio';
    const resolvedGlider = (options.useActiveGlider && defaultGliderName) ? defaultGliderName : (gliderType || defaultGliderName);

    return {
        id: `fl_igc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.floor(Math.random() * 100000)}`,
        date: finalLocalDate,
        flightDate: finalLocalDate,
        takeoffDate: finalLocalDate,
        utcDate: flightDate,
        takeoffTime,
        landingTime,
        durationMinutes,
        siteName: siteTitle,
        takeoffLocationName: detectedTakeoffName !== 'Decollo Sconosciuto' ? detectedTakeoffName : null,
        landingLocationName: detectedLandingName !== 'Atterraggio Sconosciuto' ? detectedLandingName : null,
        pilot: pilotName || '',
        glider: resolvedGlider,
        gliderType: gliderType || '',
        gear: { glider: resolvedGlider },
        recorder: recorderType,
        maneuvers: telemetry.detectedManeuverKeys || [],
        manouvers: telemetry.detectedManeuverKeys || [],
        stats: {
            takeoffAltitude: firstPoint.alt,
            landingAltitude: lastPoint.alt,
            minAltitude: minAlt,
            maxAltitude: maxAlt,
            maxGainMeters: maxGain,
            maxClimb: Math.round(maxClimbRate * 10) / 10,
            maxSink: Math.round(maxSinkRate * 10) / 10,
            totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
            accumulatedClimbMeters: telemetry.accumulatedClimbMeters ?? Math.round(accumulatedClimbMeters),
            thermalCount: telemetry.thermalCount ?? 0,
            maxThermalGain: telemetry.maxThermalGain ?? 0
        },
        telemetry,
        trackPoints: flightPoints,
        maxVarioPoint: {
            timeSeconds: maxVarioPoint.timeSeconds,
            timeFormatted: maxVarioPoint.timeFormatted,
            lat: maxVarioPoint.lat,
            lon: maxVarioPoint.lon,
            alt: maxVarioPoint.alt,
            vario: maxClimbRate
        },
        maxAltPoint: {
            timeSeconds: maxAltPoint.timeSeconds,
            timeFormatted: maxAltPoint.timeFormatted,
            lat: maxAltPoint.lat,
            lon: maxAltPoint.lon,
            alt: maxAlt,
            gainFromTakeoff: maxGain
        },
        pointsCount: flightPoints.length,
        takeoffCoords: { lat: firstPoint.lat, lon: firstPoint.lon },
        landingCoords: { lat: lastPoint.lat, lon: lastPoint.lon }
    };
}
