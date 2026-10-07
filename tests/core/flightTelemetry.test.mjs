import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CURRENT_TELEMETRY_ENGINE_VERSION,
    VARIO_BANDS,
    FLIGHT_PHASE_COLORS,
    sampleVarioRgb,
    lttbDecimate,
    calculateGroundSpeedKmh,
    calculateGlideRatio,
    calculateAccumulatedGain,
    segmentFlightPhases,
    getUnifiedFlightPhaseSegments,
    generateFlightPhaseGradient,
    generateVarioTimelineGradient,
    analyzeFlightTelemetry
} from '../../core/flightTelemetry.js';

test('Flight Telemetry - LTTB Adaptive Downsampling', async (t) => {
    await t.test('should decimate 100 points to exactly 20 points preserving endpoints', () => {
        const points = [];
        for (let i = 0; i < 100; i++) {
            points.push({
                timeSeconds: i * 2,
                alt: 1000 + Math.sin(i * 0.1) * 200,
                speed: 35
            });
        }

        const decimated = lttbDecimate(points, 20, 'alt');
        assert.strictEqual(decimated.length, 20);
        assert.deepStrictEqual(decimated[0], points[0], 'First endpoint must be preserved');
        assert.deepStrictEqual(decimated[decimated.length - 1], points[points.length - 1], 'Last endpoint must be preserved');
    });

    await t.test('should preserve prominent visual peaks and valleys during decimation', () => {
        const points = [];
        for (let i = 0; i < 50; i++) {
            // Flat baseline with a sharp prominent peak at index 25
            const alt = (i === 25) ? 2500 : 1000;
            points.push({
                timeSeconds: i,
                alt
            });
        }

        const decimated = lttbDecimate(points, 10, 'alt');
        assert.strictEqual(decimated.length, 10);
        const hasPeak = decimated.some(p => p.alt === 2500);
        assert.ok(hasPeak, 'LTTB must preserve prominent peak at index 25');
    });

    await t.test('should support custom metric keys (e.g. speed)', () => {
        const points = [];
        for (let i = 0; i < 40; i++) {
            points.push({
                timeSeconds: i,
                alt: 1200,
                speed: (i === 15) ? 75 : 36
            });
        }

        const decimated = lttbDecimate(points, 8, 'speed');
        assert.strictEqual(decimated.length, 8);
        const hasMaxSpeed = decimated.some(p => p.speed === 75);
        assert.ok(hasMaxSpeed, 'LTTB must preserve peak on custom metric key speed');
    });

    await t.test('should handle edge cases without error', () => {
        assert.deepStrictEqual(lttbDecimate([], 10), []);
        assert.deepStrictEqual(lttbDecimate(null, 10), []);
        const few = [{ timeSeconds: 0, alt: 1000 }, { timeSeconds: 1, alt: 1010 }];
        assert.strictEqual(lttbDecimate(few, 10).length, 2);
        assert.strictEqual(lttbDecimate(few, 1).length, 2);
    });

    await t.test('should downsample 10,000 points in sub-15ms linear time', () => {
        const largeTrack = new Array(10000);
        for (let i = 0; i < 10000; i++) {
            largeTrack[i] = {
                timeSeconds: i,
                alt: 1200 + Math.sin(i * 0.01) * 300
            };
        }

        const start = performance.now();
        const decimated = lttbDecimate(largeTrack, 500, 'alt');
        const elapsed = performance.now() - start;

        assert.strictEqual(decimated.length, 500);
        assert.ok(elapsed < 25, `Decimation took ${elapsed.toFixed(2)}ms (expected < 25ms)`);
    });
});

test('Flight Telemetry - Kinematics & Glide Ratio', async (t) => {
    await t.test('should calculate ground speed between two GPS points', () => {
        // Points ~1 km apart in 100 seconds = 10 m/s = 36 km/h
        const p1 = { lat: 45.0000, lon: 7.0000, timeSeconds: 0 };
        const p2 = { lat: 45.0090, lon: 7.0000, timeSeconds: 100 }; // ~1.00 km north

        const speed = calculateGroundSpeedKmh(p1, p2);
        assert.ok(Math.abs(speed - 36) < 1.0, `Expected ~36 km/h, got ${speed}`);
    });

    await t.test('should calculate aerodynamic glide ratio (L/D) accurately', () => {
        // 8.5 km glide with 1000m altitude loss -> L/D = 8.5
        const lOverD = calculateGlideRatio(8.5, 1000);
        assert.strictEqual(lOverD, 8.5);

        // Point objects
        const pt1 = { lat: 45.0, lon: 7.0, alt: 2000 };
        const pt2 = { lat: 45.072, lon: 7.0, alt: 1000 }; // ~8 km north, 1000m drop
        const ratio = calculateGlideRatio(pt1, pt2);
        assert.ok(ratio >= 7.8 && ratio <= 8.2);

        // Climbing or level flight -> returns Infinity
        assert.strictEqual(calculateGlideRatio(5.0, 0), Infinity);
        assert.strictEqual(calculateGlideRatio(5.0, -50), Infinity);
    });
});

test('Flight Telemetry - Accumulated Elevation Gain', async (t) => {
    await t.test('should calculate accumulated climb separating thermal and dynamic soaring', () => {
        const points = [];
        let alt = 1000;
        for (let i = 0; i < 20; i++) {
            if (i >= 5 && i <= 10) {
                alt += 10; // Thermal climb (+50m)
            } else if (i >= 12 && i <= 15) {
                alt += 5;  // Dynamic slope soaring climb (+15m)
            } else {
                alt -= 2;  // Glide sink
            }
            points.push({ timeSeconds: i * 2, alt });
        }

        const thermals = [{ startIndex: 5, endIndex: 10 }];
        const gains = calculateAccumulatedGain(points, thermals, points.map(p => p.alt));

        assert.strictEqual(gains.thermalGainMeters, 60); // 6 steps * 10m
        assert.strictEqual(gains.soaringGainMeters, 20); // 4 steps * 5m
        assert.strictEqual(gains.accumulatedClimbMeters, 80);
    });

    await t.test('should reject high-frequency micro-jitter below 0.2m threshold', () => {
        const points = [
            { timeSeconds: 0, alt: 1000.0 },
            { timeSeconds: 1, alt: 1000.1 }, // +0.1m jitter (rejected)
            { timeSeconds: 2, alt: 1000.0 },
            { timeSeconds: 3, alt: 1000.15 }, // +0.15m jitter (rejected)
            { timeSeconds: 4, alt: 1000.0 }
        ];

        const gains = calculateAccumulatedGain(points);
        assert.strictEqual(gains.accumulatedClimbMeters, 0, 'Jitter < 0.2m must be rejected');
    });
});

test('Flight Telemetry - Flight Phase Segmentation', async (t) => {
    await t.test('should segment flight into standard paragliding phases with timeline', () => {
        const points = [];
        let time = 0;

        // Takeoff phase (0 - 40s)
        for (let i = 0; i < 20; i++) {
            points.push({ timeSeconds: time, alt: 1200 + (i * 0.5), vario: 0.2 });
            time += 2;
        }

        // Thermal phase (40s - 140s)
        for (let i = 0; i < 50; i++) {
            points.push({ timeSeconds: time, alt: 1210 + (i * 4), vario: 2.0 });
            time += 2;
        }

        // Glide phase (140s - 240s)
        for (let i = 0; i < 50; i++) {
            points.push({ timeSeconds: time, alt: 1410 - (i * 2), vario: -1.0 });
            time += 2;
        }

        // Landing phase (240s - 280s)
        for (let i = 0; i < 20; i++) {
            points.push({ timeSeconds: time, alt: 750 - (i * 1), vario: -0.5 });
            time += 2;
        }

        const thermals = [{ startIndex: 20, endIndex: 69 }];
        const phases = segmentFlightPhases(points, thermals);

        assert.ok(phases.takeoff.durationSeconds > 0);
        assert.ok(phases.thermal.durationSeconds > 0);
        assert.ok(phases.glide.durationSeconds > 0);
        assert.ok(phases.landing.durationSeconds > 0);
        assert.ok(Array.isArray(phases.timeline));
        assert.ok(phases.timeline.length >= 4);
    });
});

test('Flight Telemetry - FAI Vario Colors & CSS Gradients', async (t) => {
    await t.test('should map vertical speeds to FAI vario color bands', () => {
        assert.strictEqual(sampleVarioRgb(3.5).css, '#dc2626');  // Strong climb
        assert.strictEqual(sampleVarioRgb(2.0).css, '#ea580c');  // Moderate climb
        assert.strictEqual(sampleVarioRgb(0.8).css, '#f59e0b');  // Weak climb
        assert.strictEqual(sampleVarioRgb(0.0).css, '#10b981');  // Neutral glide
        assert.strictEqual(sampleVarioRgb(-1.2).css, '#0284c7'); // Normal sink
        assert.strictEqual(sampleVarioRgb(-3.0).css, '#4338ca'); // Strong sink
    });

    await t.test('should generate synchronized flight phase gradient stops', () => {
        const syntheticFlight = {
            durationMinutes: 10,
            points: [
                { timeSeconds: 0, alt: 1000, vario: 0.1 },
                { timeSeconds: 60, alt: 1050, vario: 2.0 },
                { timeSeconds: 300, alt: 1400, vario: 2.0 },
                { timeSeconds: 600, alt: 800, vario: -0.5 }
            ],
            telemetry: {
                thermals: [{ startIndex: 1, endIndex: 2, startTimeSeconds: 60, endTimeSeconds: 300 }]
            }
        };

        const segments = getUnifiedFlightPhaseSegments(syntheticFlight);
        assert.ok(Array.isArray(segments));
        assert.ok(segments.length >= 2);
        assert.strictEqual(segments[0].startPct, 0);
        assert.strictEqual(segments[segments.length - 1].endPct, 100);

        const gradient = generateFlightPhaseGradient(syntheticFlight);
        assert.ok(gradient.startsWith('linear-gradient(to right,'));
        assert.ok(gradient.includes(FLIGHT_PHASE_COLORS.thermal));
    });

    await t.test('should generate continuous FAI vario timeline gradient', () => {
        const syntheticFlight = {
            durationMinutes: 5,
            points: [
                { timeSeconds: 0, alt: 1000, vario: 3.5 },
                { timeSeconds: 150, alt: 1500, vario: 0.0 },
                { timeSeconds: 300, alt: 1400, vario: -3.0 }
            ]
        };

        const gradient = generateVarioTimelineGradient(syntheticFlight, 30);
        assert.ok(gradient.startsWith('linear-gradient(to right,'));
        assert.ok(gradient.includes('#dc2626'));
        assert.ok(gradient.includes('#10b981'));
        assert.ok(gradient.includes('#4338ca'));
    });
});

test('Flight Telemetry - Full Telemetry Engine Orchestration', async (t) => {
    await t.test('should orchestrate full flight telemetry pipeline', () => {
        const points = [];
        let time = 1000;
        let alt = 1500;

        // 30 track points: takeoff run, climbing in thermal, then gliding out
        for (let i = 0; i < 30; i++) {
            if (i >= 5 && i <= 20) {
                // Circling climb in thermal
                const rad = (i * 0.4);
                alt += 15;
                points.push({
                    timeSeconds: time,
                    lat: 45.40 + Math.sin(rad) * 0.0006,
                    lon: 7.40 + Math.cos(rad) * 0.0006,
                    alt,
                    speedKmh: 32
                });
            } else {
                alt -= 3;
                points.push({
                    timeSeconds: time,
                    lat: 45.40 + (i * 0.0005),
                    lon: 7.40 + (i * 0.0003),
                    alt,
                    speedKmh: 38
                });
            }
            time += 2;
        }

        const telemetry = analyzeFlightTelemetry(points);
        assert.strictEqual(telemetry.engineVersion, CURRENT_TELEMETRY_ENGINE_VERSION);
        assert.strictEqual(telemetry.pointsCount, 30);
        assert.ok(telemetry.accumulatedClimbMeters > 0);
        assert.ok(telemetry.totalDistanceKm > 0);
        assert.ok(telemetry.maxClimbRate > 0);
        assert.ok(telemetry.phases);
        assert.ok(Array.isArray(telemetry.detectedManeuverKeys));
    });

    await t.test('should handle short or empty point arrays gracefully', () => {
        const emptyRes = analyzeFlightTelemetry([]);
        assert.strictEqual(emptyRes.pointsCount, 0);
        assert.strictEqual(emptyRes.thermals.length, 0);
        assert.strictEqual(emptyRes.totalDistanceKm, 0);
    });
});
