import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIgcCoord,
  generateIgcFromPoints,
  reconstructTrackFromFlightMetadata
} from '../../core/flightTrackReconstruction.js';
import { parseIgc } from '../../core/igcParser.js';

describe('Flight Track Reconstruction & Synthetic IGC Generator (Headless Core)', () => {
  const sampleFlight50 = {
    id: 'fl_excel_1787747985586_10',
    indexNumber: 50,
    date: '2026-08-01',
    takeoffTime: '12:56',
    landingTime: '13:32',
    durationMinutes: 36,
    durationSeconds: 2148,
    siteName: 'Decollo Ciavanis -> PeterPan school / Baratonga',
    takeoffCoords: { lat: 45.3789667, lon: 7.3568167 },
    landingCoords: { lat: 45.3650333, lon: 7.3311833 },
    stats: {
      takeoffAltitude: 1777,
      landingAltitude: 912,
      minAltitude: 912,
      maxAltitude: 2037,
      maxGainMeters: 260,
      maxClimb: 98,
      maxSink: -100,
      totalDistanceKm: 17.6
    },
    telemetry: {
      pointsCount: 2148,
      thermals: [
        {
          id: 'th_1',
          startTimeSeconds: 46627,
          endTimeSeconds: 46814,
          entryAlt: 1779,
          exitAlt: 2001,
          altGain: 222,
          turnCount: 7.8,
          turnDirection: 'CW',
          meanRadiusMeters: 56.8,
          centerCoords: { lat: 45.37731, lon: 7.35712 }
        },
        {
          id: 'th_2',
          startTimeSeconds: 47137,
          endTimeSeconds: 47261,
          entryAlt: 1832,
          exitAlt: 1880,
          altGain: 48,
          turnCount: 3.7,
          turnDirection: 'CCW',
          meanRadiusMeters: 50.1,
          centerCoords: { lat: 45.37619, lon: 7.35897 }
        },
        {
          id: 'th_3',
          startTimeSeconds: 48034,
          endTimeSeconds: 48115,
          entryAlt: 1829,
          exitAlt: 1868,
          altGain: 39,
          turnCount: 2.4,
          turnDirection: 'CCW',
          meanRadiusMeters: 59.1,
          centerCoords: { lat: 45.37318, lon: 7.35471 }
        }
      ],
      phases: {
        timeline: [
          {
            phase: 'takeoff',
            startTimeSeconds: 46616,
            endTimeSeconds: 46626
          }
        ]
      }
    },
    maxAltPoint: {
      timeSeconds: 46833,
      lat: 45.3767167,
      lon: 7.3564167,
      alt: 2037
    },
    maxVarioPoint: {
      timeSeconds: 47649,
      lat: 45.37695,
      lon: 7.3586833,
      alt: 1884,
      vario: 98
    },
    glider: 'Axis Pluto 4',
    pilot: 'Alessandro Amé'
  };

  it('formatIgcCoord formats latitude and longitude into valid FAI DMMmmm string', () => {
    const latStr = formatIgcCoord(45.3789667, 'lat');
    const lonStr = formatIgcCoord(7.3568167, 'lon');

    assert.equal(latStr, '4522738N');
    assert.equal(lonStr, '00721409E');

    // Negative latitudes (South) and longitudes (West)
    assert.equal(formatIgcCoord(-33.8688, 'lat'), '3352128S');
    assert.equal(formatIgcCoord(-70.6693, 'lon'), '07040158W');
  });

  it('reconstructTrackFromFlightMetadata generates consistent points for Flight #50', () => {
    const result = reconstructTrackFromFlightMetadata(sampleFlight50);
    assert.ok(result, 'Should return a reconstruction result');
    assert.ok(Array.isArray(result.points), 'Points should be an array');
    assert.ok(result.points.length >= 100, `Expected at least 100 points, got ${result.points.length}`);

    const p0 = result.points[0];
    const pEnd = result.points[result.points.length - 1];

    // Takeoff point checks
    assert.equal(p0.alt, 1777);
    assert.ok(Math.abs(p0.lat - 45.3789667) < 0.002, `Expected lat ~45.3789, got ${p0.lat}`);
    assert.ok(Math.abs(p0.lon - 7.3568167) < 0.002, `Expected lon ~7.3568, got ${p0.lon}`);

    // Landing point checks
    assert.equal(pEnd.alt, 912);
    assert.ok(Math.abs(pEnd.lat - 45.3650333) < 0.002, `Expected lat ~45.3650, got ${pEnd.lat}`);
    assert.ok(Math.abs(pEnd.lon - 7.3311833) < 0.002, `Expected lon ~7.3311, got ${pEnd.lon}`);

    // Peak altitude check
    const maxP = result.points.reduce((max, p) => p.alt > max.alt ? p : max, result.points[0]);
    assert.equal(maxP.alt, 2037);

    // Variometer sanity
    assert.ok(result.points.every(p => typeof p.vario === 'number' && !isNaN(p.vario)));
    assert.ok(result.points.some(p => p.vario > 0), 'Must have climb segments');
    assert.ok(result.points.some(p => p.vario < 0), 'Must have sink segments');
  });

  it('generateIgcFromPoints produces valid FAI IGC text parseable by parseIgc', () => {
    const { points } = reconstructTrackFromFlightMetadata(sampleFlight50);
    const igcText = generateIgcFromPoints(points, sampleFlight50);

    assert.ok(typeof igcText === 'string', 'IGC text should be a string');
    assert.ok(igcText.includes('HFDTE010826'), 'Must contain flight date in HFDTE');
    assert.ok(igcText.includes('HFPLTPILOT:Alessandro Amé'), 'Must contain pilot in HFPLT');
    assert.ok(igcText.includes('HFGTYGLIDERTYPE:Axis Pluto 4'), 'Must contain glider in HFGTY');
    assert.ok(igcText.includes('B1256'), 'Must contain B records matching takeoff time');

    const parsed = parseIgc(igcText);
    assert.ok(parsed, 'parseIgc must parse the synthetic IGC successfully');
    assert.ok(parsed.trackPoints.length >= points.length - 20, 'Should preserve almost all track points');
    assert.ok(Math.abs(parsed.trackPoints[0].alt - 1777) <= 25, 'Takeoff altitude should be near 1777m');
    assert.ok(Math.abs(parsed.trackPoints[parsed.trackPoints.length - 1].alt - 912) <= 25, 'Landing altitude should be near 912m');
  });

  it('handles flights with only basic coordinates and duration gracefully', () => {
    const minimalFlight = {
      id: 'fl_min_1',
      date: '2026-09-01',
      takeoffTime: '11:00',
      durationMinutes: 20,
      takeoffCoords: { lat: 45.83, lon: 9.30 },
      landingCoords: { lat: 45.81, lon: 9.31 },
      stats: {
        takeoffAltitude: 1060,
        landingAltitude: 260,
        maxAltitude: 1280
      }
    };

    const result = reconstructTrackFromFlightMetadata(minimalFlight);
    assert.ok(result.points.length >= 50);
    assert.equal(result.points[0].alt, 1060);
    assert.equal(result.points[result.points.length - 1].alt, 260);
    assert.ok(result.rawIgc.length > 50);
  });
});
