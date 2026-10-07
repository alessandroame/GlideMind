import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MANEUVER_KEYS,
    normalizeManeuverName,
    mergeManeuversPreservingExisting,
    reconcileManeuversAfterMigration,
    detectThermals,
    detectFlightManeuvers,
    degToCardinal,
    smoothAltitudes,
    calculateAngularDelta
} from '../../core/flightManeuvers.js';

function generateTrackSegment(headings, speeds, varios, startLat = 45.0, startLon = 7.0, startAlt = 1200) {
    const points = [];
    let curLat = startLat;
    let curLon = startLon;
    let curAlt = startAlt;
    let curTime = 0;

    for (let i = 0; i < headings.length; i++) {
        const brgRad = (headings[i] * Math.PI) / 180;
        const spdKmh = speeds[i] !== undefined ? speeds[i] : 36;
        const spdMs = spdKmh / 3.6;
        const vz = varios[i] !== undefined ? varios[i] : -1.2;

        points.push({
            lat: curLat,
            lon: curLon,
            alt: curAlt,
            timeSeconds: curTime,
            speedKmh: spdKmh,
            vario: vz
        });

        const distM = spdMs * 1.0;
        const dLat = (distM * Math.cos(brgRad)) / 111139;
        const dLon = (distM * Math.sin(brgRad)) / (111139 * Math.cos((curLat * Math.PI) / 180));

        curLat += dLat;
        curLon += dLon;
        curAlt += vz * 1.0;
        curTime += 1;
    }
    return points;
}

test('Flight Maneuvers - String Utilities & Idempotent Merging', async (t) => {
    await t.test('should normalize maneuver names safely', () => {
        assert.strictEqual(normalizeManeuverName('  WingOver  '), 'wingover');
        assert.strictEqual(normalizeManeuverName(null), '');
        assert.strictEqual(normalizeManeuverName(''), '');
    });

    await t.test('should convert compass angles to 16-point cardinal strings', () => {
        assert.strictEqual(degToCardinal(0), 'N');
        assert.strictEqual(degToCardinal(45), 'NE');
        assert.strictEqual(degToCardinal(90), 'E');
        assert.strictEqual(degToCardinal(135), 'SE');
        assert.strictEqual(degToCardinal(180), 'S');
        assert.strictEqual(degToCardinal(225), 'SW');
        assert.strictEqual(degToCardinal(270), 'W');
        assert.strictEqual(degToCardinal(315), 'NW');
        assert.strictEqual(degToCardinal(360), 'N');
    });

    await t.test('should calculate signed angular difference across compass wrap-around', () => {
        assert.strictEqual(calculateAngularDelta(10, 40), 30);
        assert.strictEqual(calculateAngularDelta(350, 20), 30);
        assert.strictEqual(calculateAngularDelta(40, 10), -30);
        assert.strictEqual(calculateAngularDelta(20, 350), -30);
        assert.strictEqual(calculateAngularDelta(180, 180), 0);
    });

    await t.test('should merge maneuvers preserving existing manual entries and preventing duplicates', () => {
        const existing = ['Decollo rovescio', '360°'];
        const detected = ['360°', 'wingover', '360°'];

        const merged = mergeManeuversPreservingExisting(existing, detected);
        assert.deepStrictEqual(merged, ['Decollo rovescio', '360°', 'wingover']);
    });

    await t.test('should reconcile maneuvers during migrations while preserving pilot notes', () => {
        const legacyList = ['Pilot Note: Buona giornata', 'inversioni', 'Orecchie'];
        const withoutNewInversioni = reconcileManeuversAfterMigration(legacyList, ['360°']);
        assert.ok(!withoutNewInversioni.includes('inversioni'));
        assert.ok(withoutNewInversioni.includes('Pilot Note: Buona giornata'));
        assert.ok(withoutNewInversioni.includes('360°'));

        const withNewInversioni = reconcileManeuversAfterMigration(legacyList, ['inversioni']);
        assert.ok(withNewInversioni.includes('inversioni'));
    });
});

test('Flight Maneuvers - Altitude Smoothing', async (t) => {
    await t.test('should smooth altitudes while strictly preserving boundary endpoints', () => {
        const rawPoints = [
            { alt: 1000 },
            { alt: 1020 },
            { alt: 1005 },
            { alt: 1015 },
            { alt: 1030 },
            { alt: 1025 },
            { alt: 1040 },
            { alt: 1035 },
            { alt: 1050 },
            { alt: 1060 },
            { alt: 1070 }
        ];

        const smoothed = smoothAltitudes(rawPoints, 3);
        assert.strictEqual(smoothed.length, rawPoints.length);
        assert.strictEqual(smoothed[0], 1000, 'First endpoint must remain exact');
        assert.strictEqual(smoothed[smoothed.length - 1], 1070, 'Last endpoint must remain exact');
        assert.ok(smoothed[1] < 1020, 'Should smooth out local jitter peak');
    });
});

test('Flight Maneuvers - Thermal Circling Detection', async (t) => {
    await t.test('should detect thermals from continuous circling with climb', () => {
        const points = [];
        const centerLat = 45.40;
        const centerLon = 7.40;
        const radiusDeg = 0.0008; // ~60m radius
        let time = 1000;

        // Phase 1: Entry approach (descending slightly)
        for (let i = 0; i < 5; i++) {
            points.push({
                timeSeconds: time,
                timeFormatted: '12:00:00',
                lat: centerLat - 0.003 + (i * 0.0005),
                lon: centerLon,
                alt: 1010 - (i * 2)
            });
            time += 2;
        }

        // Phase 2: 4 full turns climbing from 1000m to 1160m (+160m gain)
        const totalSteps = 80;
        for (let i = 0; i <= totalSteps; i++) {
            let rad = (i / 20) * 2 * Math.PI;
            if (i === 15 || i === 35) rad -= 0.10;

            points.push({
                timeSeconds: time,
                timeFormatted: '12:05:00',
                lat: centerLat + Math.sin(rad) * radiusDeg,
                lon: centerLon + Math.cos(rad) * radiusDeg,
                alt: 1000 + (i / totalSteps) * 160
            });
            time += 2;
        }

        // Phase 3: Exit glide
        for (let i = 0; i < 5; i++) {
            points.push({
                timeSeconds: time,
                timeFormatted: '12:10:00',
                lat: centerLat + (i * 0.0005),
                lon: centerLon + 0.002,
                alt: 1160 - (i * 2)
            });
            time += 2;
        }

        const thermals = detectThermals(points);
        assert.strictEqual(thermals.length, 1);

        const th = thermals[0];
        assert.ok(th.turnDirection === 'CW' || th.turnDirection === 'CCW');
        assert.ok(th.altGain >= 150, `Alt gain ${th.altGain}m should be >= 150m`);
        assert.ok(th.turnCount >= 3.5, `Turn count ${th.turnCount} should be >= 3.5`);
        assert.ok(th.avgClimbRate > 0.5, `Avg climb rate ${th.avgClimbRate} should be positive`);
        assert.ok(th.meanRadiusMeters > 30 && th.meanRadiusMeters < 120);
        assert.ok(th.efficiencyPercent > 60);
    });

    await t.test('should ignore turns that do not produce positive elevation gain', () => {
        const points = [];
        let time = 1000;
        for (let i = 0; i <= 60; i++) {
            const rad = (i / 20) * 2 * Math.PI;
            points.push({
                timeSeconds: time,
                timeFormatted: '12:00:00',
                lat: 45.40 + Math.sin(rad) * 0.0008,
                lon: 7.40 + Math.cos(rad) * 0.0008,
                alt: 1200 - (i * 3)
            });
            time += 2;
        }

        const thermals = detectThermals(points);
        assert.strictEqual(thermals.length, 0, 'Sinking turns must not be classified as thermals');
    });
});

test('Flight Maneuvers - Rapid Descent & Acrobatic Detection', async (t) => {
    await t.test('should detect steep spirale rapida with high sink rate', () => {
        const points = [];
        let time = 1000;

        for (let i = 0; i < 5; i++) {
            points.push({ timeSeconds: time, lat: 45.40, lon: 7.40 + (i * 0.0002), alt: 1800, speedKmh: 38 });
            time += 1;
        }

        const spiralSteps = 20;
        for (let i = 0; i <= spiralSteps; i++) {
            const rad = (i / 10) * 2 * Math.PI;
            points.push({
                timeSeconds: time,
                lat: 45.40 + Math.sin(rad) * 0.0004,
                lon: 7.40 + Math.cos(rad) * 0.0004,
                alt: 1800 - (i * 5),
                speedKmh: 55
            });
            time += 1;
        }

        for (let i = 0; i < 5; i++) {
            points.push({ timeSeconds: time, lat: 45.40, lon: 7.40 + (i * 0.0002), alt: 1700, speedKmh: 36 });
            time += 1;
        }

        const maneuvers = detectFlightManeuvers(points);
        assert.ok(maneuvers.some(m => m.type === MANEUVER_KEYS.SPIRALE), 'Should detect vite positiva (spirale)');
    });

    await t.test('should detect 360° singolo outside thermals', () => {
        const points = [];
        let time = 1000;

        for (let i = 0; i < 5; i++) {
            points.push({ timeSeconds: time, lat: 45.40, lon: 7.40 + (i * 0.0002), alt: 1500, speedKmh: 36 });
            time += 1;
        }

        for (let i = 0; i <= 16; i++) {
            const rad = (i / 16) * 2 * Math.PI;
            points.push({
                timeSeconds: time,
                lat: 45.40 + Math.sin(rad) * 0.0005,
                lon: 7.40 + Math.cos(rad) * 0.0005,
                alt: 1500 - (i * 1.0),
                speedKmh: 34
            });
            time += 1;
        }

        for (let i = 0; i < 5; i++) {
            points.push({ timeSeconds: time, lat: 45.40, lon: 7.40 + (i * 0.0002), alt: 1484, speedKmh: 36 });
            time += 1;
        }

        const maneuvers = detectFlightManeuvers(points);
        assert.ok(maneuvers.some(m => m.type === MANEUVER_KEYS.SINGLE_360), 'Should detect single 360 turn');
    });

    await t.test('should detect Figure 8 (circuito a 8)', () => {
        const points = [];
        let t = 0;
        let lat = 45.0;
        let lon = 7.0;
        let heading = 0;

        // Turn 1: CW 336 deg over 12s
        for (let s = 0; s < 12; s++) {
            heading += 28;
            const rad = (heading * Math.PI) / 180;
            lat += Math.cos(rad) * 0.0001;
            lon += Math.sin(rad) * 0.0001;
            points.push({
                lat,
                lon,
                alt: 1200 - s * 1.2,
                timeSeconds: t,
                speedKmh: 36,
                vario: -1.2
            });
            t++;
        }

        // Turn 2: CCW 336 deg over 12s with short transition
        for (let s = 0; s < 12; s++) {
            heading -= 28;
            const rad = (heading * Math.PI) / 180;
            lat += Math.cos(rad) * 0.0001;
            lon += Math.sin(rad) * 0.0001;
            points.push({
                lat,
                lon,
                alt: 1200 - 14.4 - s * 1.2,
                timeSeconds: t,
                speedKmh: 36,
                vario: -1.2
            });
            t++;
        }

        const maneuvers = detectFlightManeuvers(points);
        assert.ok(maneuvers.some(m => m.type === MANEUVER_KEYS.FIGURE_8), 'Should detect circuito a 8');
    });

    await t.test('should detect dynamic acrobatic roll reversals and wingover', () => {
        const headings = [];
        const speeds = [];
        const varios = [];

        const cycleSpeeds = [26, 42, 48, 32];
        const cycleVarios = [-0.6, -2.8, -3.2, -1.0];

        for (let cycle = 0; cycle < 4; cycle++) {
            const isCW = cycle % 2 === 0;
            for (let s = 0; s < 4; s++) {
                const h = isCW ? (320 + (s + 1) * 20) % 360 : (40 - (s + 1) * 20 + 360) % 360;
                headings.push(h);
                speeds.push(cycleSpeeds[s]);
                varios.push(cycleVarios[s]);
            }
        }

        const points = generateTrackSegment(headings, speeds, varios);
        const maneuvers = detectFlightManeuvers(points);
        assert.ok(maneuvers.length > 0, 'Should detect maneuvers');
        const hasAcro = maneuvers.some(m => m.type === MANEUVER_KEYS.INVERSIONI || m.type === MANEUVER_KEYS.WINGOVER);
        assert.ok(hasAcro, 'Should detect inversioni di rollio or wingover');
    });

    await t.test('should suppress false maneuvers on final landing approach', () => {
        const points = [];
        let time = 1000;

        for (let i = 0; i < 30; i++) {
            const angle = Math.sin(i * 0.5) * 0.0002;
            points.push({
                timeSeconds: time,
                lat: 45.40 + angle,
                lon: 7.40 + (i * 0.0001),
                alt: 20 - (i * 0.6),
                speedKmh: 18 - (i * 0.4)
            });
            time += 1;
        }

        const maneuvers = detectFlightManeuvers(points);
        assert.strictEqual(maneuvers.length, 0, 'Must suppress maneuvers during landing approach');
    });
});
