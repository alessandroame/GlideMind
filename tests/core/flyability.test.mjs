import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    NO_FLY_BG,
    NO_DATA_BG,
    DEFAULT_GLIDER,
    PriorityWeights,
    calculateVectorShear,
    calculateTurbulenceEDR,
    calculateThermalLift,
    evaluateWindFlyability,
    evaluateTurbulenceFlyability,
    evaluateCapeFlyability,
    evaluateRainFlyability,
    evaluateDirectionFlyability,
    evaluateThermalQuality,
    getCardinalDirection,
    isTakeoffSite,
    getFlyabilityScore,
    calculateTimelineScores,
    calculateWeekOverview,
    calculateDailyFlyabilitySummary,
    resolveTranslation
} from '../../core/flyability.js';

describe('Flyability Engine - Atmospheric Physics & Turbulence Math', () => {

    it('should compute vector shear between two wind levels with veering/backing', () => {
        // Pure speed delta with identical directions (180° vs 180°)
        const shearIdentical = calculateVectorShear(10, 180, 25, 180);
        assert.equal(shearIdentical, 15);

        // 90° wind direction shift (0° North vs 90° East) at 20 km/h both
        // Vector difference magnitude: sqrt(20^2 + 20^2) = sqrt(800) = 28.28 -> 28.3 km/h
        const shear90 = calculateVectorShear(20, 0, 20, 90);
        assert.equal(shear90, 28.3);

        // 180° opposing wind shift (head-on shear) at 15 km/h each
        // Vector difference: 15 + 15 = 30 km/h
        const shear180 = calculateVectorShear(15, 0, 15, 180);
        assert.equal(shear180, 30);

        // Fallback when direction is missing
        const shearFallback = calculateVectorShear(12, null, 28, null);
        assert.equal(shearFallback, 16);
    });

    it('should compute synthetic EDR turbulence index bounded within [0, 1]', () => {
        // Calm conditions: zero gust delta, zero CAPE, zero vertical shear
        const edrCalm = calculateTurbulenceEDR(10, 10, 0, 0);
        assert.equal(edrCalm, 0);

        // Extreme convective mountain air: gust delta 20 km/h, CAPE 1200 J/kg, shear 20 km/h
        // t = (20 * 0.4 + 1200 / 200 + 20 * 0.2) / 25 = (8 + 6 + 4) / 25 = 18 / 25 = 0.72
        const edrSevere = calculateTurbulenceEDR(15, 35, 1200, 20);
        assert.equal(edrSevere, 0.72);

        // Clamping check: runaway numbers must not exceed 1.0
        const edrClamped = calculateTurbulenceEDR(10, 90, 4000, 80);
        assert.equal(edrClamped, 1.0);
    });

    it('should compute thermal climb rate and probability using Deardorff scaling', () => {
        // Night or insufficient solar radiation (< 80 W/m²) -> thermals completely suppressed
        const night = calculateThermalLift(0, 500, 10, 0, 1000);
        assert.equal(night.probability, 0);
        assert.equal(night.climbRate, 0);
        assert.equal(night.qualityKey, 'none');

        // Active precipitation -> suppresses thermals immediately
        const rainSuppress = calculateThermalLift(700, 1500, 10, 0.5, 1000);
        assert.equal(rainSuppress.probability, 0);
        assert.equal(rainSuppress.climbRate, 0);
        assert.equal(rainSuppress.qualityKey, 'none');

        // Strong midday summer conditions: 800 W/m² radiation, 1800m BLH, 10 km/h wind
        // w* = (9.45e-6 * 800 * 1800)^(1/3) = (13.608)^(1/3) ~= 2.387 m/s -> 2.4 m/s
        // netClimb = (1.5 * 2.4) - 1.1 = 2.5 m/s
        const strongDay = calculateThermalLift(800, 1800, 10, 0, 800);
        assert.ok(strongDay.wStar >= 2.3 && strongDay.wStar <= 2.5);
        assert.ok(strongDay.climbRate >= 2.4 && strongDay.climbRate <= 2.7);
        assert.ok(strongDay.probability >= 70);
        assert.equal(strongDay.qualityKey, 'strong');
    });
});

describe('Flyability Engine - Component Risk Evaluators', () => {

    it('should evaluate wind flyability dynamically based on glider trim speed', () => {
        // Standard glider: vTrim = 37 km/h
        // Optimal wind: 10 km/h, gust 14 km/h -> Severity 0 (Green)
        const calm = evaluateWindFlyability(10, 14);
        assert.equal(calm.severity, 0);
        assert.equal(calm.text, 'Vento Calmo/Ottimale');

        // Moderate wind: 18 km/h (> 37 * 0.45 = 17) -> Severity 1 (Yellow)
        const moderate = evaluateWindFlyability(18, 22);
        assert.equal(moderate.severity, 1);
        assert.equal(moderate.text, 'Vento Moderato');

        // Strong wind: 25 km/h (> 37 * 0.65 = 24) -> Severity 2 (Red)
        const strong = evaluateWindFlyability(25, 30);
        assert.equal(strong.severity, 2);
        assert.equal(strong.text, 'Vento Forte');

        // Extreme wind: 33 km/h (> 37 * 0.85 = 31) -> Severity 3 (No Fly)
        const noFly = evaluateWindFlyability(33, 40);
        assert.equal(noFly.severity, 3);
        assert.equal(noFly.text, 'NO FLY: Vento Estremo');

        // Extreme gust delta trigger: base wind 12 km/h, but gust 35 km/h (delta 23 > 37 * 0.50 = 18.5)
        const gustTrigger = evaluateWindFlyability(12, 35);
        assert.equal(gustTrigger.severity, 3);
        assert.equal(gustTrigger.text, 'NO FLY: Raffiche Estreme');

        // Custom slow wing (vTrim = 30 km/h) triggers warning at lower absolute speeds
        const slowWing = { vTrim: 30, name: 'Miniwing Slow' };
        const lowerLimit = evaluateWindFlyability(21, 24, slowWing);
        assert.equal(lowerLimit.severity, 2); // 21 > 30 * 0.65 (19.5) -> Red!
    });

    it('should evaluate synthetic turbulence EDR against glider aspect ratio', () => {
        // Low turbulence
        const calmTurb = evaluateTurbulenceFlyability(0.12);
        assert.equal(calmTurb.severity, 0);

        // Moderate turbulence for AR 5.1 (turbYellow = 0.314): 0.35 > 0.314 -> Severity 1 (Yellow)
        const modTurb = evaluateTurbulenceFlyability(0.35);
        assert.equal(modTurb.severity, 1);
        assert.equal(modTurb.text, 'Turbolenza Moderata');

        // Strong turbulence for AR 5.1 (turbRed = 0.5125): 0.55 > 0.5125 -> Severity 2 (Red)
        const warnTurb = evaluateTurbulenceFlyability(0.55);
        assert.equal(warnTurb.severity, 2);
        assert.equal(warnTurb.text, 'Turbolenza Forte');

        // Severe turbulence (turbNoFly = 0.751): 0.80 > 0.751 -> Severity 3 (No Fly)
        const noFlyTurb = evaluateTurbulenceFlyability(0.80);
        assert.equal(noFlyTurb.severity, 3);
        assert.equal(noFlyTurb.text, 'NO FLY: Turbolenza Estrema');
    });

    it('should evaluate convective CAPE instability thresholds', () => {
        // Stable
        assert.equal(evaluateCapeFlyability(50).severity, 0);

        // Moderate convection (400 - 1000)
        const mod = evaluateCapeFlyability(550);
        assert.equal(mod.severity, 1);
        assert.equal(mod.text, 'Convezione Attiva');

        // Strong convection (1000 - 1800)
        const warn = evaluateCapeFlyability(1300);
        assert.equal(warn.severity, 2);
        assert.equal(warn.text, 'Forte Instabilità');

        // Extreme thunderstorm hazard (> 1800)
        const noFly = evaluateCapeFlyability(2100);
        assert.equal(noFly.severity, 3);
        assert.equal(noFly.text, 'NO FLY: Rischio Temporali Severi');
    });

    it('should evaluate precipitation risk', () => {
        // Dry
        assert.equal(evaluateRainFlyability(0).severity, 0);

        // Light rain (0.1 - 0.5 mm)
        const light = evaluateRainFlyability(0.25);
        assert.equal(light.severity, 2);
        assert.equal(light.text, 'Pioggia Leggera');

        // Moderate/heavy rain (> 0.5 mm)
        const heavy = evaluateRainFlyability(1.5);
        assert.equal(heavy.severity, 3);
        assert.equal(heavy.text, 'NO FLY: Pioggia/Temporale');
    });

    it('should guard against deadly lee-side rotor vortices in takeoff alignment', () => {
        const takeoffHeading = 180; // South-facing takeoff

        // Headwind: Wind from 180° (diff 0°) @ 15 km/h -> Severity 0 (Frontal)
        const headwind = evaluateDirectionFlyability(15, 180, takeoffHeading, true);
        assert.equal(headwind.severity, 0);
        assert.equal(headwind.isLeeSide, false);
        assert.equal(headwind.text, 'Vento Frontale');

        // Crosswind: Wind from 250° (diff 70°) @ 14 km/h -> Severity 1 (Crosswind)
        const crosswind = evaluateDirectionFlyability(14, 250, takeoffHeading, true);
        assert.equal(crosswind.severity, 1);
        assert.equal(crosswind.isLeeSide, false);
        assert.equal(crosswind.text, 'Vento Traverso');

        // Light tailwind breeze (< 4 km/h): Wind from 0° (diff 180°) @ 2.5 km/h -> Severity 1 (Brezza da Dietro)
        const lightBreeze = evaluateDirectionFlyability(2.5, 0, takeoffHeading, true);
        assert.equal(lightBreeze.severity, 1);
        assert.equal(lightBreeze.isLeeSide, true);
        assert.equal(lightBreeze.text, 'Brezza da Dietro');

        // Moderate lee-side rotor: Wind from 0° @ 12 km/h -> Severity 2 (Sottovento Sostenuto)
        const leeWarn = evaluateDirectionFlyability(12, 0, takeoffHeading, true);
        assert.equal(leeWarn.severity, 2);
        assert.equal(leeWarn.isLeeSide, true);
        assert.equal(leeWarn.text, 'Sottovento Sostenuto');

        // Severe lee-side rotor: Wind from 0° @ 22 km/h (> 18 km/h) -> Severity 3 (NO FLY: Sottovento Sostenuto)
        const leeNoFly = evaluateDirectionFlyability(22, 0, takeoffHeading, true);
        assert.equal(leeNoFly.severity, 3);
        assert.equal(leeNoFly.isLeeSide, true);
        assert.equal(leeNoFly.text, 'NO FLY: Sottovento Sostenuto');

        // Non-takeoff site returns null
        assert.equal(evaluateDirectionFlyability(20, 0, takeoffHeading, false), null);
    });

    it('should determine cardinal directions and takeoff site types', () => {
        assert.equal(getCardinalDirection(0), 'N');
        assert.equal(getCardinalDirection(45), 'NE');
        assert.equal(getCardinalDirection(90), 'E');
        assert.equal(getCardinalDirection(135), 'SE');
        assert.equal(getCardinalDirection(180), 'S');
        assert.equal(getCardinalDirection(225), 'SW');
        assert.equal(getCardinalDirection(270), 'W');
        assert.equal(getCardinalDirection(315), 'NW');

        // Takeoff site detection
        assert.equal(isTakeoffSite({ type: 'decollo' }, null), true);
        assert.equal(isTakeoffSite({ type: 'atterraggio' }, null), false);
        assert.equal(isTakeoffSite({ name: 'Decollo Col Rodella' }, null), true);
        assert.equal(isTakeoffSite({ name: 'Atterraggio Canazei' }, null), false);
        assert.equal(isTakeoffSite(null, { slope_deg: 25 }), true);
        assert.equal(isTakeoffSite(null, { slope_deg: 5 }), false);
    });
});

describe('Flyability Engine - Waterfall Synthesis & Tie-Breaking', () => {

    it('should return synthesis optimal banner when all parameters are severity 0', () => {
        const score = getFlyabilityScore(10, 12, 80, 0.10, 0, 180, 180, true);
        assert.equal(score.severity, 0);
        assert.equal(score.text, 'Condizioni Ottimali');
        assert.equal(score.details.wind.severity, 0);
        assert.equal(score.details.rain.severity, 0);
        assert.equal(score.details.direction.severity, 0);
    });

    it('should apply aeronautical safety priority tie-breaking when severities are equal', () => {
        // Priority order: direction (50) > wind (40) > turbulence (30) > rain (20) > cape (10)

        // Case 1: Wind Severity 2 (wind 26 km/h) vs CAPE Severity 2 (CAPE 1200 J/kg)
        // Wind has higher priority (40 > 10) -> Wind text must be chosen
        const scoreWindOverCape = getFlyabilityScore(26, 30, 1200, 0.15, 0, 180, 180, true);
        assert.equal(scoreWindOverCape.severity, 2);
        assert.equal(scoreWindOverCape.text, 'Vento Forte');

        // Case 2: Lee-side Rotor Severity 3 (wind 20 km/h from back) vs Rain Severity 3 (rain 2.0 mm)
        // Direction/Lee-side has highest priority (50 > 20) -> Lee-side text must win
        const scoreLeeOverRain = getFlyabilityScore(20, 25, 0, 0.10, 2.0, 0, 180, true);
        assert.equal(scoreLeeOverRain.severity, 3);
        assert.equal(scoreLeeOverRain.text, 'NO FLY: Sottovento Sostenuto');
    });

    it('should compute daylight timeline scores filtering strictly between sunrise and sunset', () => {
        const weatherFixture = {
            meta: {
                takeoff_azimuth: 180,
                sunrise: '06:15',
                sunset: '19:45'
            },
            hourly: {
                time: [
                    '05:00', '06:00', '07:00', '08:00', '09:00', '10:00',
                    '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
                    '17:00', '18:00', '19:00', '20:00', '21:00'
                ],
                windspeed_10m: [5, 8, 10, 12, 14, 15, 16, 17, 18, 19, 18, 16, 14, 12, 10, 8, 6],
                windgusts_10m: [8, 11, 14, 16, 18, 20, 22, 23, 24, 25, 24, 21, 18, 15, 12, 10, 8],
                cape: [0, 0, 50, 100, 200, 400, 600, 800, 900, 700, 500, 300, 100, 50, 0, 0, 0],
                turbulence: [0.05, 0.08, 0.12, 0.15, 0.18, 0.22, 0.26, 0.28, 0.30, 0.28, 0.24, 0.20, 0.16, 0.12, 0.08, 0.05, 0.04],
                precipitation: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                winddirection_10m: [180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180]
            }
        };

        const timeline = calculateTimelineScores(weatherFixture);
        assert.ok(timeline.length > 0);

        // Hours should start at sunrise hour (06) and end at sunset hour (19)
        assert.equal(timeline[0].hour, '06');
        assert.equal(timeline[timeline.length - 1].hour, '19');

        // Check hour 12: wind 17, gusts 23, cape 800, dir 180 on heading 180
        const midday = timeline.find(h => h.hour === '12');
        assert.ok(midday != null);
        assert.equal(midday.wind, 17);
        assert.ok(midday.score != null);
        assert.ok(midday.score.severity <= 1);
    });

    it('should compute daily flyability summary and identify best flying day', () => {
        const fullPayload = {
            meta: { takeoff_azimuth: 180 },
            hourly: {
                time: [
                    '2026-06-15T10:00:00', '2026-06-15T12:00:00', '2026-06-15T14:00:00', '2026-06-15T16:00:00',
                    '2026-06-16T10:00:00', '2026-06-16T12:00:00', '2026-06-16T14:00:00', '2026-06-16T16:00:00'
                ],
                windspeed_10m: [10, 12, 14, 12, 35, 38, 40, 36],
                windgusts_10m: [13, 16, 18, 15, 45, 50, 52, 48],
                cape: [200, 400, 600, 300, 1500, 1800, 2000, 1600],
                precipitation: [0, 0, 0, 0, 1.5, 2.0, 3.0, 1.0],
                winddirection_10m: [180, 180, 180, 180, 0, 0, 0, 0]
            }
        };

        const summaries = calculateDailyFlyabilitySummary(fullPayload);
        assert.equal(summaries.length, 2);

        // Day 1 (June 15): Great conditions (wind 10-14 km/h, no rain, frontal) -> High score, isBestDay = true
        assert.equal(summaries[0].dateStr, '2026-06-15');
        assert.ok(summaries[0].score > 70);
        assert.equal(summaries[0].bestSeverity, 0);
        assert.equal(summaries[0].severity, 0);
        assert.equal(summaries[0].status, 'flyable');
        assert.equal(summaries[0].statusLabel, 'Volabile');
        assert.equal(summaries[0].statusIcon, '●');
        assert.equal(summaries[0].badgeClass, 'gm-badge-flyable');
        assert.equal(summaries[0].isBestDay, true);

        // Day 2 (June 16): Extreme storm (wind 35-40 km/h, rain > 1.5mm, tailwind) -> Score < 20
        assert.equal(summaries[1].dateStr, '2026-06-16');
        assert.ok(summaries[1].score <= 20);
        assert.equal(summaries[1].bestSeverity, 3);
        assert.equal(summaries[1].severity, 3);
        assert.equal(summaries[1].status, 'severe');
        assert.equal(summaries[1].statusLabel, 'Severo');
        assert.equal(summaries[1].statusIcon, '⚡');
        assert.equal(summaries[1].badgeClass, 'gm-badge-severe');
        assert.equal(summaries[1].isBestDay, false);
    });

    it('should calculate 14-day multi-day flyability summary with 4-color classifications', () => {
        // Construct 14-day mock dataset with varying regimes
        const times = [];
        const windspeed = [];
        const gusts = [];
        const cape = [];
        const rain = [];
        const winddir = [];

        for (let d = 0; d < 14; d++) {
            const dateStr = `2026-07-${String(d + 1).padStart(2, '0')}`;
            for (let h = 0; h < 24; h++) {
                times.push(`${dateStr}T${String(h).padStart(2, '0')}:00:00`);
                if (d % 4 === 0) {
                    // Flyable (Green)
                    windspeed.push(12);
                    gusts.push(16);
                    cape.push(250);
                    rain.push(0);
                    winddir.push(180);
                } else if (d % 4 === 1) {
                    // Caution (Yellow)
                    windspeed.push(16);
                    gusts.push(24);
                    cape.push(950);
                    rain.push(0);
                    winddir.push(180);
                } else if (d % 4 === 2) {
                    // Unflyable (Red) - crosswind & moderate gusts, light rain
                    windspeed.push(24);
                    gusts.push(30);
                    cape.push(300);
                    rain.push(0.3);
                    winddir.push(270);
                } else {
                    // Severe (Black)
                    windspeed.push(35);
                    gusts.push(45);
                    cape.push(1600);
                    rain.push(2.5);
                    winddir.push(360);
                }
            }
        }

        const payload14 = {
            meta: { takeoff_azimuth: 180 },
            hourly: {
                time: times,
                windspeed_10m: windspeed,
                windgusts_10m: gusts,
                cape,
                precipitation: rain,
                winddirection_10m: winddir
            }
        };

        const summaries = calculateDailyFlyabilitySummary(payload14, null, null, 14);
        assert.equal(summaries.length, 14);

        // Verify that all 4 statuses are present across the 14 days
        const statuses = summaries.map(s => s.status);
        assert.ok(statuses.includes('flyable'), 'Should contain flyable days (Green)');
        assert.ok(statuses.includes('caution'), 'Should contain caution days (Yellow)');
        assert.ok(statuses.includes('unflyable'), 'Should contain unflyable days (Red)');
        assert.ok(statuses.includes('severe'), 'Should contain severe days (Black)');

        // Every summary must have valid 4-color contract properties
        summaries.forEach(s => {
            assert.ok(['flyable', 'caution', 'unflyable', 'severe'].includes(s.status));
            assert.ok(['Volabile', 'Cautela', 'Non Volabile', 'Severo'].includes(s.statusLabel));
            assert.ok(['●', '▲', '✕', '⚡'].includes(s.statusIcon));
            assert.ok(s.color.startsWith('var(--gm-status-'));
            assert.ok(s.bg.startsWith('var(--gm-status-'));
            assert.ok(s.badgeClass.startsWith('gm-badge-'));
        });
    });

    it('should support custom translation resolver for internationalization', () => {
        const customTranslator = (key, params) => {
            if (key === 'fly.optimum_wind') return 'Calm/Optimal Wind';
            if (key === 'fly.no_fly_wind') return 'NO FLY: Extreme Wind';
            return key;
        };

        const calm = evaluateWindFlyability(10, 14, null, customTranslator);
        assert.equal(calm.text, 'Calm/Optimal Wind');

        const noFly = evaluateWindFlyability(40, 45, null, customTranslator);
        assert.equal(noFly.text, 'NO FLY: Extreme Wind');
    });

    describe('Takeoff Exposure & Slope Aspect Handling', () => {
        it('should handle spots without exposure (heading = null) without penalizing score or inventing azimuth', () => {
            const dirEval = evaluateDirectionFlyability(12, 180, null, true);
            assert.equal(dirEval, null);

            const score = getFlyabilityScore(10, 12, 100, 0.1, 0, 90, null, true);
            assert.equal(score.severity, 0, 'Score should remain flyable when wind and meteo are safe');
            assert.equal(score.details.direction.hasExposure, false);
            assert.equal(score.details.direction.severity, 0);
            assert.equal(score.details.direction.diffFromFront, null);
            assert.equal(score.details.direction.text, 'Esposizione N/D');
            assert.ok(score.details.direction.desc.includes('Esposizione del decollo non nota'));
        });

        it('should correctly evaluate calm wind (<= 4 km/h) as flyable when diff <= 90 deg', () => {
            // Ciavanis 180° with 2 km/h wind from 101° (79° delta)
            const dirEval = evaluateDirectionFlyability(2, 101, 180, true);
            assert.ok(dirEval);
            assert.equal(dirEval.severity, 0);
            assert.equal(dirEval.hasExposure, true);
            assert.equal(dirEval.text, 'Vento Calmo');
            assert.equal(dirEval.diffFromFront, 79);

            const score = getFlyabilityScore(2, 4, 50, 0.05, 0, 101, 180, true);
            assert.equal(score.severity, 0);
            assert.equal(score.text, 'Condizioni Ottimali');
        });

        it('should mark calm wind (<= 4 km/h) with tailwind (diff > 90 deg) as caution', () => {
            // Takeoff 180° with 3 km/h wind from 350° (170° delta)
            const dirEval = evaluateDirectionFlyability(3, 350, 180, true);
            assert.ok(dirEval);
            assert.equal(dirEval.severity, 1);
            assert.equal(dirEval.text, 'Brezza da Dietro');
            assert.equal(dirEval.isLeeSide, true);
        });

        it('should escalate crosswind > 14 km/h to severity 2 (Vento Traverso)', () => {
            const modCross = evaluateDirectionFlyability(12, 110, 180, true); // 70° diff, 12 km/h
            assert.equal(modCross.severity, 1);
            assert.equal(modCross.text, 'Vento Traverso');

            const strongCross = evaluateDirectionFlyability(16, 110, 180, true); // 70° diff, 16 km/h
            assert.equal(strongCross.severity, 2);
            assert.equal(strongCross.text, 'Vento Traverso');
            assert.equal(strongCross.bg, 'bg-red-500');
        });

        it('should escalate strong tailwind > 18 km/h to severity 3 (NO FLY: Sottovento Sostenuto)', () => {
            const severeLee = evaluateDirectionFlyability(20, 0, 180, true); // 180° diff, 20 km/h
            assert.equal(severeLee.severity, 3);
            assert.equal(severeLee.text, 'NO FLY: Sottovento Sostenuto');
            assert.equal(severeLee.bg, NO_FLY_BG);
        });

        it('should correctly process week overview and daily summary for takeoff without heading', () => {
            const times = [];
            const windspeed = [];
            for (let h = 0; h < 24; h++) {
                times.push(`2026-10-10T${String(h).padStart(2, '0')}:00`);
                windspeed.push(8);
            }
            const payloadNoHeading = {
                takeoff_azimuth: null,
                hourly: {
                    time: times,
                    windspeed_10m: windspeed,
                    windgusts_10m: windspeed,
                    winddirection_10m: new Array(24).fill(90),
                    cape: new Array(24).fill(100),
                    precipitation: new Array(24).fill(0)
                }
            };

            const summary = calculateDailyFlyabilitySummary(payloadNoHeading, { type: 'takeoff', heading: null }, null, 1);
            assert.equal(summary.length, 1);
            assert.equal(summary[0].status, 'flyable');
        });
    });
});
