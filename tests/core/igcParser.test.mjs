import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    parseIgc,
    parseIgcCoords,
    calculateDistanceKm,
    matchTrackSpots,
    trimFlightGroundPoints
} from '../../core/igcParser.js';

const mockCatalogSpots = [
    {
        name: 'Decollo Ciavanis',
        point: 'Decollo Ciavanis',
        location: 'Chialamberto (Valli di Lanzo - TO)',
        type: 'takeoff',
        lat: 45.378871,
        lon: 7.356792
    },
    {
        name: 'PeterPan school / Baratonga',
        point: 'PeterPan school / Baratonga',
        location: 'Chialamberto (Valli di Lanzo - TO)',
        type: 'landing',
        lat: 45.365077,
        lon: 7.331723
    },
    {
        name: 'Decollo Santa Elisabetta',
        point: 'Decollo Santa Elisabetta',
        location: 'Cuorgnè (Valle Sacra - TO)',
        type: 'takeoff',
        lat: 45.4123,
        lon: 7.6456
    }
];

test('IGC Parser - Geodesic Coordinate & Distance Helpers', async (t) => {
    await t.test('should parse raw IGC DMM coordinates to decimal degrees', () => {
        const coords = parseIgcCoords('4522732N', '00721407E');
        assert.ok(Math.abs(coords.lat - 45.378867) < 0.0001, `Expected ~45.378867, got ${coords.lat}`);
        assert.ok(Math.abs(coords.lon - 7.356783) < 0.0001, `Expected ~7.356783, got ${coords.lon}`);
    });

    await t.test('should calculate distance between coordinates accurately', () => {
        // Ciavanis to Baratonga (~2.44 km)
        const dist = calculateDistanceKm(45.378871, 7.356792, 45.365077, 7.331723);
        assert.ok(Math.abs(dist - 2.44) < 0.1, `Expected ~2.44 km, got ${dist}`);
    });
});

test('IGC Parser - Spot Proximity Matching', async (t) => {
    await t.test('should match both takeoff and landing within 500m radius', () => {
        const firstPoint = { lat: 45.378833, lon: 7.356750 }; // ~5m from Ciavanis
        const lastPoint = { lat: 45.365033, lon: 7.331133 };  // ~46m from Baratonga

        const result = matchTrackSpots(firstPoint, lastPoint, mockCatalogSpots, 0.50);
        assert.strictEqual(result.takeoffName, 'Decollo Ciavanis');
        assert.strictEqual(result.landingName, 'PeterPan school / Baratonga');
        assert.strictEqual(result.siteTitle, 'Decollo Ciavanis -> PeterPan school / Baratonga');
        assert.ok(result.minTakeoffDistKm < 0.05);
        assert.ok(result.minLandingDistKm < 0.10);
    });

    await t.test('should match only takeoff when landing is outside radius', () => {
        const firstPoint = { lat: 45.378833, lon: 7.356750 }; // Ciavanis
        const lastPoint = { lat: 45.1000, lon: 7.1000 };     // Remote field

        const result = matchTrackSpots(firstPoint, lastPoint, mockCatalogSpots, 0.50);
        assert.strictEqual(result.takeoffName, 'Decollo Ciavanis');
        assert.strictEqual(result.landingName, null);
        assert.strictEqual(result.siteTitle, 'Decollo Ciavanis');
    });

    await t.test('should match only landing when takeoff is unknown', () => {
        const firstPoint = { lat: 45.1000, lon: 7.1000 };     // Unknown takeoff
        const lastPoint = { lat: 45.365033, lon: 7.331133 };  // Baratonga landing

        const result = matchTrackSpots(firstPoint, lastPoint, mockCatalogSpots, 0.50);
        assert.strictEqual(result.takeoffName, null);
        assert.strictEqual(result.landingName, 'PeterPan school / Baratonga');
        assert.strictEqual(result.siteTitle, 'Volo -> PeterPan school / Baratonga');
    });

    await t.test('should return Decollo Sconosciuto when spots list is empty or far away', () => {
        const p1 = { lat: 41.9028, lon: 12.4964 };
        const p2 = { lat: 41.8902, lon: 12.4922 };

        const emptyRes = matchTrackSpots(p1, p2, [], 0.50);
        assert.strictEqual(emptyRes.siteTitle, 'Decollo Sconosciuto');

        const farRes = matchTrackSpots(p1, p2, mockCatalogSpots, 0.50);
        assert.strictEqual(farRes.siteTitle, 'Decollo Sconosciuto');
    });
});

test('IGC Parser - Pre-Takeoff and Post-Landing Ground Points Trimming', async (t) => {
    await t.test('should trim static ground waiting points before launch run', () => {
        const points = [];
        let time = 1000;

        // 10 static points (< 5 km/h) at takeoff pad (elevation 1500m)
        for (let i = 0; i < 10; i++) {
            points.push({
                timeSeconds: time,
                timeFormatted: '10:00:00',
                lat: 45.3788 + (i * 0.000001),
                lon: 7.3567,
                alt: 1500
            });
            time += 2;
        }

        // Flight points: acceleration to 25 km/h and descent down the valley
        for (let i = 0; i < 20; i++) {
            points.push({
                timeSeconds: time,
                timeFormatted: '10:01:00',
                lat: 45.3788 - (i * 0.0005),
                lon: 7.3567 - (i * 0.0003),
                alt: 1500 - (i * 15)
            });
            time += 2;
        }

        // 10 static points after landing at LZ (elevation 650m)
        for (let i = 0; i < 10; i++) {
            points.push({
                timeSeconds: time,
                timeFormatted: '10:05:00',
                lat: 45.3650 + (i * 0.000001),
                lon: 7.3317,
                alt: 650
            });
            time += 2;
        }

        const trimmed = trimFlightGroundPoints(points);
        assert.ok(trimmed.length < points.length, 'Trimmed points should be fewer than raw points');
        assert.ok(trimmed.length >= 20, 'Should retain all in-flight points');
        // Initial static points should be trimmed, retaining only ~2 run-up points
        assert.ok(trimmed[0].timeSeconds > points[5].timeSeconds, 'Should have trimmed early ground points');
    });

    await t.test('should preserve short tracks intact (< 15 points)', () => {
        const shortTrack = [
            { timeSeconds: 10, lat: 45.0, lon: 7.0, alt: 1000 },
            { timeSeconds: 20, lat: 45.001, lon: 7.001, alt: 1010 }
        ];
        const res = trimFlightGroundPoints(shortTrack);
        assert.strictEqual(res.length, shortTrack.length);
    });
});

test('IGC Parser - Synthetic Track Parsing & Validation', async (t) => {
    const syntheticIgc = `AXCT123
HFDTE150826
HFPLTPILOT:Mario Rossi
HFGTYGLIDERTYPE:Ozone Rush 6
HFRFWFIRMWAREVERSION:1.2.3
HFFTYFRTYPE:Flymaster Live DS
B1200004522732N00721407EA0150001505
B1200054522750N00721415EA0151001515
B1200104522780N00721430EA0153001535
B1200154522820N00721460EA0156001565
B1200204522870N00721500EA0160001605
B1200254522920N00721550EA0165001655
B1200304522980N00721610EA0171001715
B1200354523050N00721680EA0178001785
B1200404523120N00721750EA0184001845
B1200454523190N00721820EA0189001895
B1200504523250N00721880EA0192001925
B1200554523300N00721930EA0194001945
B1201004523340N00721970EA0195001955
B1201054523360N00721990EA0194001945
B1201104523360N00721990EA0190001905
B1201154523350N00721980EA0185001855
B1201204523320N00721950EA0178001785
B1201254523280N00721910EA0170001705
B1201304523230N00721860EA0161001615
B1201354523170N00721800EA0151001515
`;

    await t.test('should parse metadata from H records correctly', () => {
        const parsed = parseIgc(syntheticIgc, mockCatalogSpots);
        assert.strictEqual(parsed.pilot, 'Mario Rossi');
        assert.strictEqual(parsed.glider, 'Ozone Rush 6');
        assert.strictEqual(parsed.gliderType, 'Ozone Rush 6');
        assert.strictEqual(parsed.gear?.glider, 'Ozone Rush 6');
        assert.strictEqual(parsed.date, '2026-08-15');
        assert.strictEqual(parsed.utcDate, '2026-08-15');
    });

    await t.test('should compute flight statistics and kinematics accurately', () => {
        const parsed = parseIgc(syntheticIgc, mockCatalogSpots);
        assert.ok(parsed.pointsCount >= 18);
        assert.strictEqual(parsed.stats.takeoffAltitude, 1505);
        assert.strictEqual(parsed.stats.maxAltitude, 1955);
        assert.strictEqual(parsed.stats.maxGainMeters, 450); // 1955 - 1505
        assert.ok(parsed.stats.maxClimb > 0);
        assert.ok(parsed.stats.maxSink < 0);
        assert.ok(parsed.stats.accumulatedClimbMeters >= 400);
        assert.ok(parsed.stats.totalDistanceKm > 0.5);
    });

    await t.test('should clamp GNSS altitude spikes to physical limits (+/- 18 m/s)', () => {
        // Inject an impossible +500m GNSS glitch in 5 seconds (100 m/s climb)
        const igcWithSpike = `AXCT123
HFDTE150826
B1200004522732N00721407EA0150001500
B1200054522750N00721415EA0200002000
B1200104522780N00721430EA0155001550
`;
        const parsed = parseIgc(igcWithSpike);
        // The spike of 500m / 5s = 100 m/s should be clamped to 18 m/s
        assert.ok(parsed.stats.maxClimb <= 18.0, `Max climb ${parsed.stats.maxClimb} must be clamped to <= 18 m/s`);
    });

    await t.test('should support active glider override when requested', () => {
        const parsedOverride = parseIgc(syntheticIgc, [], {
            activeGlider: { name: 'Advance Iota DLS' },
            useActiveGlider: true
        });
        assert.strictEqual(parsedOverride.glider, 'Advance Iota DLS');
        assert.strictEqual(parsedOverride.gliderType, 'Ozone Rush 6', 'Original IGC header gliderType preserved');
    });

    await t.test('should support custom telemetry analyzer injection', () => {
        const mockTelemetry = {
            pointsCount: 20,
            thermals: [{ altGain: 300 }],
            thermalCount: 1,
            accumulatedClimbMeters: 450,
            maxThermalGain: 300,
            detectedManeuverKeys: ['360_TURNS']
        };

        const parsed = parseIgc(syntheticIgc, [], {
            telemetryAnalyzer: () => mockTelemetry
        });

        assert.strictEqual(parsed.stats.thermalCount, 1);
        assert.strictEqual(parsed.stats.maxThermalGain, 300);
        assert.deepStrictEqual(parsed.maneuvers, ['360_TURNS']);
    });

    await t.test('should throw meaningful error on empty or invalid IGC file', () => {
        assert.throws(() => parseIgc(''), /Invalid or empty IGC text content/);
        assert.throws(() => parseIgc(null), /Invalid or empty IGC text content/);
        assert.throws(() => parseIgc('AXCT123\nHFDTE150826\n'), /contains no valid B-record/);
    });
});

test('IGC Parser - End-to-End Real Flight Ingestion', async (t) => {
    const sampleIgcPath = 'C:\\github\\ParaMeteo\\data\\sample_tracks\\2026-07-04-XNA-0DC50E28ACAD23496445DB92F084AB1C-02.igc';

    // Verify sample file exists before running test
    if (!fs.existsSync(sampleIgcPath)) {
        t.skip('Sample IGC track file not found at path');
        return;
    }

    const rawIgc = fs.readFileSync(sampleIgcPath, 'utf8');
    const flight = parseIgc(rawIgc, mockCatalogSpots);

    await t.test('should parse real flight headers accurately', () => {
        assert.strictEqual(flight.pilot, 'Alessandro Ame');
        assert.strictEqual(flight.glider, 'Axis Pluto 4');
        assert.strictEqual(flight.date, '2026-07-04');
        assert.strictEqual(flight.utcDate, '2026-07-04');
    });

    await t.test('should identify Ciavanis takeoff spot from real GPS coordinates', () => {
        assert.strictEqual(flight.takeoffLocationName, 'Decollo Ciavanis');
        assert.ok(flight.siteName.includes('Decollo Ciavanis'));
    });

    await t.test('should extract high-density flight track and valid kinematics', () => {
        assert.ok(flight.pointsCount > 1000, `Track points count ${flight.pointsCount} should exceed 1000`);
        assert.ok(flight.durationMinutes > 15, `Duration ${flight.durationMinutes} min should be realistic`);
        assert.ok(flight.stats.maxAltitude > 1700, `Max alt ${flight.stats.maxAltitude}m should exceed 1700m`);
        assert.ok(flight.stats.takeoffAltitude > 1600, `Takeoff alt ${flight.stats.takeoffAltitude}m should be ~1635-1772m`);
        assert.ok(flight.stats.totalDistanceKm > 3.0, `Total distance ${flight.stats.totalDistanceKm}km should exceed 3km`);
        assert.ok(flight.stats.maxClimb > 0 && flight.stats.maxClimb <= 18.0);
        assert.ok(flight.stats.maxSink < 0 && flight.stats.maxSink >= -18.0);
    });
});
