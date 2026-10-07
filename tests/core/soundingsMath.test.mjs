import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateDewPoint,
    calculateRelativeHumidity,
    calculateLCL,
    calculateCloudBase,
    calculateLapseRate,
    classifyAtmosphericStability,
    calculateBarometricAltitude,
    calculatePressureAtAltitude,
    detectInversions,
    estimateThermalCeiling,
    enrichSoundingProfile,
    STABILITY_CLASSES
} from '../../core/soundingsMath.js';

test('Atmospheric Thermodynamics - Magnus-Tetens Dew Point', async (t) => {
    await t.test('should calculate accurate dew point for standard summer conditions', () => {
        // T = 20°C, RH = 50% -> Td should be ~9.3°C
        const dewPoint = calculateDewPoint(20, 50);
        assert.ok(dewPoint !== null);
        assert.ok(Math.abs(dewPoint - 9.3) <= 0.2, `Expected ~9.3°C, got ${dewPoint}`);
    });

    await t.test('should return exact temperature when relative humidity is 100% (saturated)', () => {
        const dewPoint = calculateDewPoint(15.4, 100);
        assert.strictEqual(dewPoint, 15.4);
    });

    await t.test('should calculate valid dew point for sub-zero alpine temperatures', () => {
        // T = -5°C, RH = 70% -> Td should be negative and lower than T
        const dewPoint = calculateDewPoint(-5, 70);
        assert.ok(dewPoint !== null);
        assert.ok(dewPoint < -5, `Dew point ${dewPoint} should be lower than -5°C`);
        assert.ok(dewPoint > -12, `Dew point ${dewPoint} should be realistic`);
    });

    await t.test('should reject invalid or out-of-bounds inputs gracefully', () => {
        assert.strictEqual(calculateDewPoint(null, 50), null);
        assert.strictEqual(calculateDewPoint(20, null), null);
        assert.strictEqual(calculateDewPoint(NaN, 50), null);
        assert.strictEqual(calculateDewPoint(20, 0), null);
        assert.strictEqual(calculateDewPoint(20, -10), null);
        assert.strictEqual(calculateDewPoint(20, 105), null);
    });
});

test('Atmospheric Thermodynamics - Relative Humidity Inversion', async (t) => {
    await t.test('should invert dew point back to relative humidity accurately', () => {
        const originalT = 24.0;
        const originalRH = 55.0;
        const dewPoint = calculateDewPoint(originalT, originalRH);
        assert.ok(dewPoint !== null);

        const recoveredRH = calculateRelativeHumidity(originalT, dewPoint);
        assert.ok(recoveredRH !== null);
        assert.ok(Math.abs(recoveredRH - originalRH) <= 1.0, `Expected ~55%, got ${recoveredRH}`);
    });

    await t.test('should clamp to 100% when dew point equals or exceeds ambient temperature', () => {
        const rhEqual = calculateRelativeHumidity(18, 18);
        assert.strictEqual(rhEqual, 100);

        const rhExceeds = calculateRelativeHumidity(18, 20);
        assert.strictEqual(rhExceeds, 100);
    });

    await t.test('should return null for invalid inputs', () => {
        assert.strictEqual(calculateRelativeHumidity(null, 10), null);
        assert.strictEqual(calculateRelativeHumidity(20, NaN), null);
    });
});

test('Atmospheric Thermodynamics - Lifted Condensation Level (LCL Cloud Base)', async (t) => {
    await t.test('should calculate LCL AGL and MSL with 125m per °C spread', () => {
        // T = 22°C, Td = 12°C, elev = 600m
        // Spread = 10°C -> AGL = 1250m -> MSL = 1850m
        const lcl = calculateLCL(22, 12, 600);
        assert.ok(lcl !== null);
        assert.strictEqual(lcl.lclAgl, 1250);
        assert.strictEqual(lcl.lclMsl, 1850);
    });

    await t.test('should place cloud base at ground when surface is saturated (fog)', () => {
        const lcl = calculateLCL(14, 14, 900);
        assert.ok(lcl !== null);
        assert.strictEqual(lcl.lclAgl, 0);
        assert.strictEqual(lcl.lclMsl, 900);
    });

    await t.test('should support calculateCloudBase convenience helper', () => {
        const cloudBase = calculateCloudBase(20, 10, 500);
        assert.strictEqual(cloudBase, 1750); // 500 + (10 * 125)
    });

    await t.test('should handle missing elevation defaulting to sea level', () => {
        const lcl = calculateLCL(20, 10);
        assert.ok(lcl !== null);
        assert.strictEqual(lcl.lclAgl, 1250);
        assert.strictEqual(lcl.lclMsl, 1250);
    });
});

test('Atmospheric Thermodynamics - Lapse Rate & Stability Classification', async (t) => {
    await t.test('should calculate environmental lapse rate between two sounding altitudes', () => {
        // Alt1 = 1000m, T1 = 18°C; Alt2 = 2000m, T2 = 11°C
        // deltaT = -7°C over 1000m -> Lapse rate = +0.70 °C / 100m, gradient = -0.70 °C / 100m
        const lr = calculateLapseRate(18, 1000, 11, 2000);
        assert.ok(lr !== null);
        assert.strictEqual(lr.lapseRate, 0.70);
        assert.strictEqual(lr.gradient, -0.70);
        assert.strictEqual(lr.deltaZ, 1000);
        assert.strictEqual(lr.deltaT, -7);
    });

    await t.test('should prevent division by zero when altitudes are equal', () => {
        const lr = calculateLapseRate(15, 1000, 15, 1000);
        assert.ok(lr !== null);
        assert.strictEqual(lr.lapseRate, 0);
        assert.strictEqual(lr.deltaZ, 0);
    });

    await t.test('should classify atmospheric stability correctly across all aeronautical regimes', () => {
        // Super-adiabatic (> 1.00)
        const superAdiabatic = classifyAtmosphericStability(1.20);
        assert.strictEqual(superAdiabatic.code, STABILITY_CLASSES.SUPER_ADIABATIC);
        assert.strictEqual(superAdiabatic.isThermal, true);

        // Dry adiabatic (0.95 - 1.05)
        const dryAdiabatic = classifyAtmosphericStability(0.98);
        assert.strictEqual(dryAdiabatic.code, STABILITY_CLASSES.DRY_ADIABATIC);
        assert.strictEqual(dryAdiabatic.isThermal, true);

        // Conditionally unstable (0.65 - 0.95) - Classic thermal soaring
        const condUnstable = classifyAtmosphericStability(0.75);
        assert.strictEqual(condUnstable.code, STABILITY_CLASSES.CONDITIONALLY_UNSTABLE);
        assert.strictEqual(condUnstable.isThermal, true);
        assert.strictEqual(condUnstable.ceilingLimit, false);

        // Stable (0.00 - 0.65)
        const stable = classifyAtmosphericStability(0.40);
        assert.strictEqual(stable.code, STABILITY_CLASSES.STABLE);
        assert.strictEqual(stable.isThermal, false);

        // Isothermal (~0.00)
        const isothermal = classifyAtmosphericStability(0.01);
        assert.strictEqual(isothermal.code, STABILITY_CLASSES.ISOTHERMAL);
        assert.strictEqual(isothermal.ceilingLimit, true);

        // Inversion (< 0.00)
        const inversion = classifyAtmosphericStability(-0.50);
        assert.strictEqual(inversion.code, STABILITY_CLASSES.INVERSION);
        assert.strictEqual(inversion.ceilingLimit, true);
    });
});

test('Atmospheric Thermodynamics - Barometric Formula & Hypsometry', async (t) => {
    await t.test('should calculate standard geopotential altitude from pressure', () => {
        // Sea level
        const altSeaLevel = calculateBarometricAltitude(1013.25);
        assert.strictEqual(altSeaLevel, 0);

        // 850 hPa standard level is typically around 1457m
        const alt850 = calculateBarometricAltitude(850);
        assert.ok(alt850 >= 1450 && alt850 <= 1465, `Expected ~1457m for 850 hPa, got ${alt850}`);

        // 500 hPa standard level is typically around 5574m
        const alt500 = calculateBarometricAltitude(500);
        assert.ok(alt500 >= 5560 && alt500 <= 5590, `Expected ~5574m for 500 hPa, got ${alt500}`);
    });

    await t.test('should calculate pressure from altitude and verify roundtrip', () => {
        const alt = 1500;
        const p = calculatePressureAtAltitude(alt);
        assert.ok(p !== null);
        assert.ok(p > 840 && p < 860, `Expected ~845 hPa, got ${p}`);

        const invertedAlt = calculateBarometricAltitude(p);
        assert.ok(Math.abs(invertedAlt - alt) <= 5, `Roundtrip delta should be <= 5m, got ${invertedAlt}`);
    });

    await t.test('should return null or 0 for invalid barometric inputs', () => {
        assert.strictEqual(calculateBarometricAltitude(null), null);
        assert.strictEqual(calculateBarometricAltitude(-10), null);
        assert.strictEqual(calculatePressureAtAltitude(null), null);
    });
});

test('Atmospheric Thermodynamics - Inversion Layer Detection', async (t) => {
    await t.test('should detect temperature inversions and compute vertical gradient', () => {
        const sounding = [
            { height: 800, temp: 18.0 },
            { height: 1200, temp: 15.0 }, // Normal lapse: -3°C
            { height: 1500, temp: 17.5 }, // INVERSION: +2.5°C over 300m
            { height: 2000, temp: 13.0 }, // Normal lapse: -4.5°C
            { height: 2400, temp: 14.0 }, // INVERSION: +1.0°C over 400m
            { height: 3000, temp: 8.0 }   // Normal lapse
        ];

        const inversions = detectInversions(sounding);
        assert.strictEqual(inversions.length, 2);

        // First inversion: 1200m -> 1500m
        assert.strictEqual(inversions[0].baseAlt, 1200);
        assert.strictEqual(inversions[0].topAlt, 1500);
        assert.strictEqual(inversions[0].deltaAlt, 300);
        assert.strictEqual(inversions[0].deltaT, 2.5);
        assert.ok(inversions[0].gradient > 0.8, 'Gradient should be positive');

        // Second inversion: 2000m -> 2400m
        assert.strictEqual(inversions[1].baseAlt, 2000);
        assert.strictEqual(inversions[1].topAlt, 2400);
        assert.strictEqual(inversions[1].deltaT, 1.0);
    });

    await t.test('should return empty array when no inversions exist', () => {
        const sounding = [
            { height: 500, temp: 20.0 },
            { height: 1000, temp: 16.0 },
            { height: 1500, temp: 12.0 },
            { height: 2000, temp: 8.0 }
        ];
        const inversions = detectInversions(sounding);
        assert.strictEqual(inversions.length, 0);
    });
});

test('Atmospheric Thermodynamics - Thermal Ceiling & Equilibrium Level', async (t) => {
    await t.test('should estimate thermal ceiling capped by a mid-altitude temperature inversion', () => {
        // Ground at 500m, surface T = 24°C, Td = 12°C -> LCL = 500 + (12 * 125) = 2000m
        const surfaceT = 24.0;
        const surfaceDew = 12.0;
        const groundElev = 500;

        // Sounding profile with a strong capping inversion at 2200m:
        const sounding = [
            { height: 500, temp: 24.0 },
            { height: 1000, temp: 19.5 }, // Env cools at 0.9°C/100m (parcel is 19.0°C)
            { height: 1500, temp: 15.0 }, // Env cools to 15.0°C (parcel is 14.0°C)
            { height: 2000, temp: 10.0 }, // Env is 10.0°C, parcel at LCL is 9.0°C -> capped before LCL
            { height: 2500, temp: 14.0 }  // Inversion layer
        ];

        const ceiling = estimateThermalCeiling(surfaceT, surfaceDew, groundElev, sounding);
        assert.ok(ceiling !== null);
        assert.strictEqual(ceiling.lclMsl, 2000);
        assert.ok(ceiling.thermalTopMsl >= 500 && ceiling.thermalTopMsl <= 2000);
    });

    await t.test('should handle profile where parcel rises above LCL into moist adiabatic lift', () => {
        // Surface: 26°C, Td: 18°C, Ground: 400m -> LCL = 400 + (8 * 125) = 1400m
        const surfaceT = 26.0;
        const surfaceDew = 18.0;
        const groundElev = 400;

        // Very cold air aloft, conditionally unstable:
        const sounding = [
            { height: 400, temp: 26.0 },
            { height: 1000, temp: 19.0 }, // Parcel is 20.0°C (buoyant)
            { height: 1400, temp: 14.5 }, // LCL: Parcel is 16.0°C (buoyant)
            { height: 2000, temp: 11.0 }, // Above LCL: Parcel cools at 0.5°C/100m -> 16.0 - 3.0 = 13.0°C (buoyant)
            { height: 2600, temp: 9.5 },  // Parcel cools to 10.0°C (buoyant)
            { height: 3200, temp: 9.0 }   // Parcel cools to 7.0°C (equilibrium reached around 2700-2900m)
        ];

        const ceiling = estimateThermalCeiling(surfaceT, surfaceDew, groundElev, sounding);
        assert.ok(ceiling !== null);
        assert.strictEqual(ceiling.lclMsl, 1400);
        assert.strictEqual(ceiling.reachesLcl, true);
        assert.ok(ceiling.thermalTopMsl > 1400, `Thermal top ${ceiling.thermalTopMsl} should exceed LCL 1400m`);
    });
});

test('Atmospheric Thermodynamics - Enrich Sounding Profile', async (t) => {
    await t.test('should enrich raw pressure levels with heights, dew points, and stability layers', () => {
        const rawLevels = [
            { hpa: 1000, temp: 22.0, rh: 60 },
            { hpa: 925, temp: 16.5, rh: 65 },
            { hpa: 850, temp: 11.0, rh: 70 },
            { hpa: 700, temp: 1.0, rh: 80 },
            { hpa: 500, temp: -15.0, rh: 85 }
        ];

        const enriched = enrichSoundingProfile(rawLevels, 23.0, 14.0, 300);
        assert.strictEqual(enriched.levels.length, 5);

        // Verify computed heights
        assert.ok(enriched.levels[0].height > 0);
        assert.ok(enriched.levels[4].height > 5000);

        // Verify dew points were computed
        assert.ok(enriched.levels[0].dew !== null);
        assert.ok(enriched.levels[0].dew < enriched.levels[0].temp);

        // Verify layer stability was evaluated
        assert.ok(enriched.levels[0].layerAbove);
        assert.ok(enriched.levels[0].layerAbove.lapseRate > 0);
        assert.ok(enriched.levels[0].layerAbove.stabilityCode);

        // Verify LCL and thermal ceiling
        assert.ok(enriched.lcl !== null);
        assert.strictEqual(enriched.lcl.lclMsl, 300 + (9 * 125)); // 1425m
        assert.ok(enriched.thermalCeiling !== null);
    });

    await t.test('should handle empty or malformed sounding levels gracefully', () => {
        const result = enrichSoundingProfile([], null, null);
        assert.strictEqual(result.levels.length, 0);
        assert.strictEqual(result.inversions.length, 0);
        assert.strictEqual(result.lcl, null);
        assert.strictEqual(result.thermalCeiling, null);
    });
});
