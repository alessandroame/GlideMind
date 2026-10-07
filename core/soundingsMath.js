/**
 * Atmospheric Soundings and Aerological Thermodynamics Engine for GlideMind
 * Headless module for calculating dew point, lifted condensation level (LCL),
 * environmental lapse rates, stability classification, and thermal ceiling.
 * 
 * Compliant with WMO standard formulas and aeronautical soaring meteorology.
 */

// Thermodynamic Constants
export const MAGNUS_A = 17.27;
export const MAGNUS_B = 237.7; // Sonntag / WMO standard (°C)
export const DRY_ADIABATIC_LAPSE_RATE = 0.98; // °C / 100m (DALR: g/Cp ≈ 9.8°C/km)
export const SATURATED_ADIABATIC_LAPSE_RATE = 0.50; // °C / 100m (SALR nominal approximation)
export const STANDARD_SEA_LEVEL_PRESSURE_HPA = 1013.25;

/**
 * Atmospheric Stability Classifications
 */
export const STABILITY_CLASSES = Object.freeze({
    SUPER_ADIABATIC: 'SUPER_ADIABATIC',
    DRY_ADIABATIC: 'DRY_ADIABATIC',
    CONDITIONALLY_UNSTABLE: 'CONDITIONALLY_UNSTABLE',
    STABLE: 'STABLE',
    ISOTHERMAL: 'ISOTHERMAL',
    INVERSION: 'INVERSION'
});

/**
 * Calculates Dew Point temperature (°C) using the Magnus-Tetens approximation.
 * 
 * Formula:
 *   gamma(T, RH) = (a * T) / (b + T) + ln(RH / 100)
 *   Td = (b * gamma) / (a - gamma)
 * 
 * @param {number} tempC Dry-bulb temperature in °C
 * @param {number} relativeHumidity Relative humidity percentage (0 - 100)
 * @param {number} [b=MAGNUS_B] Empirical constant b (°C)
 * @param {number} [a=MAGNUS_A] Empirical constant a (dimensionless)
 * @returns {number|null} Dew point in °C rounded to 1 decimal place, or null if invalid inputs
 */
export function calculateDewPoint(tempC, relativeHumidity, b = MAGNUS_B, a = MAGNUS_A) {
    if (tempC == null || isNaN(tempC) || relativeHumidity == null || isNaN(relativeHumidity)) {
        return null;
    }
    const rh = Number(relativeHumidity);
    const t = Number(tempC);

    if (rh <= 0 || rh > 100) return null;

    // Direct shortcut for saturated air (RH = 100%)
    if (rh === 100) {
        return Math.round(t * 10) / 10;
    }

    const gamma = (a * t) / (b + t) + Math.log(rh / 100);
    const denominator = a - gamma;
    if (Math.abs(denominator) < 1e-7) return null;

    const dewPoint = (b * gamma) / denominator;
    return Math.round(dewPoint * 10) / 10;
}

/**
 * Calculates Relative Humidity percentage from dry-bulb temperature and dew point.
 * 
 * @param {number} tempC Dry-bulb temperature in °C
 * @param {number} dewPointC Dew point in °C
 * @param {number} [b=MAGNUS_B] Empirical constant b
 * @param {number} [a=MAGNUS_A] Empirical constant a
 * @returns {number|null} Relative humidity percentage [0 - 100] rounded to 1 decimal place
 */
export function calculateRelativeHumidity(tempC, dewPointC, b = MAGNUS_B, a = MAGNUS_A) {
    if (tempC == null || isNaN(tempC) || dewPointC == null || isNaN(dewPointC)) {
        return null;
    }
    const t = Number(tempC);
    const td = Number(dewPointC);

    // Dew point cannot physically exceed ambient temperature
    const effectiveTd = Math.min(t, td);

    const actualVaporPressure = Math.exp((a * effectiveTd) / (b + effectiveTd));
    const saturationVaporPressure = Math.exp((a * t) / (b + t));

    if (saturationVaporPressure <= 0) return null;

    const rh = (actualVaporPressure / saturationVaporPressure) * 100;
    return Math.min(100, Math.max(0, Math.round(rh * 10) / 10));
}

/**
 * Calculates Lifted Condensation Level (LCL - Cumulus Cloud Base) using the Esposito-Hennig formula.
 * The dry adiabatic expansion spreads ambient temperature and dew point at ~125m per °C difference.
 * 
 * Formula:
 *   H_LCL_AGL = 125 * (T_2m - Td_2m) [meters AGL]
 *   H_LCL_MSL = GroundElevation + H_LCL_AGL [meters MSL]
 * 
 * @param {number} tempC Surface temperature in °C (typically 2m)
 * @param {number} dewPointC Surface dew point in °C (typically 2m)
 * @param {number} [groundElevationM=0] Spot surface elevation in meters MSL
 * @returns {{ lclAgl: number, lclMsl: number }|null} Object with AGL and MSL cloud base altitudes in meters
 */
export function calculateLCL(tempC, dewPointC, groundElevationM = 0) {
    if (tempC == null || isNaN(tempC) || dewPointC == null || isNaN(dewPointC)) {
        return null;
    }
    const t = Number(tempC);
    const td = Number(dewPointC);
    const elev = Number(groundElevationM) || 0;

    // Spread cannot be negative
    const spread = Math.max(0, t - td);
    const lclAgl = Math.round(spread * 125);
    const lclMsl = Math.round(elev + lclAgl);

    return {
        lclAgl,
        lclMsl
    };
}

/**
 * Convenience helper returning Cloud Base altitude in meters MSL directly.
 * 
 * @param {number} tempC 
 * @param {number} dewPointC 
 * @param {number} [groundElevationM=0] 
 * @returns {number|null} Cloud Base MSL altitude
 */
export function calculateCloudBase(tempC, dewPointC, groundElevationM = 0) {
    const res = calculateLCL(tempC, dewPointC, groundElevationM);
    return res ? res.lclMsl : null;
}

/**
 * Calculates the Environmental Lapse Rate (ELR) and vertical temperature gradient between two altitudes.
 * 
 * Sign convention:
 *   - lapseRate: Positive when temperature decreases with altitude (°C / 100m)
 *   - gradient: dT/dz * 100, Negative when cooling (°C / 100m)
 * 
 * @param {number} temp1 Temperature at lower altitude in °C
 * @param {number} alt1 Lower altitude in meters
 * @param {number} temp2 Temperature at higher altitude in °C
 * @param {number} alt2 Higher altitude in meters
 * @returns {{ lapseRate: number, gradient: number, deltaZ: number, deltaT: number }|null}
 */
export function calculateLapseRate(temp1, alt1, temp2, alt2) {
    if (temp1 == null || isNaN(temp1) || alt1 == null || isNaN(alt1) ||
        temp2 == null || isNaN(temp2) || alt2 == null || isNaN(alt2)) {
        return null;
    }
    const t1 = Number(temp1);
    const a1 = Number(alt1);
    const t2 = Number(temp2);
    const a2 = Number(alt2);

    const deltaZ = a2 - a1;
    if (Math.abs(deltaZ) < 1.0) {
        return { lapseRate: 0, gradient: 0, deltaZ: 0, deltaT: 0 };
    }

    const deltaT = t2 - t1;
    const gradient = (deltaT / deltaZ) * 100; // °C / 100m (negative = cooling)
    const lapseRate = -gradient; // °C / 100m (positive = cooling)

    return {
        lapseRate: Math.round(lapseRate * 100) / 100,
        gradient: Math.round(gradient * 100) / 100,
        deltaZ: Math.round(deltaZ),
        deltaT: Math.round(deltaT * 100) / 100
    };
}

/**
 * Classifies atmospheric layer stability based on Environmental Lapse Rate (ELR).
 * 
 * Thresholds:
 *   - lapseRate > 1.00 °C/100m: SUPER_ADIABATIC (Unstable / turbulent lift)
 *   - lapseRate in [0.95, 1.00] °C/100m: DRY_ADIABATIC
 *   - lapseRate in [0.65, 0.95) °C/100m: CONDITIONALLY_UNSTABLE (ideal thermal soaring)
 *   - lapseRate in (0.00, 0.65) °C/100m: STABLE (weak or suppressed lift)
 *   - lapseRate == 0.00 °C/100m: ISOTHERMAL
 *   - lapseRate < 0.00 °C/100m: INVERSION (temperature increases with altitude)
 * 
 * @param {number} lapseRatePer100m Lapse rate in °C / 100m (positive = cooling)
 * @returns {{ code: string, label: string, isThermal: boolean, ceilingLimit: boolean }}
 */
export function classifyAtmosphericStability(lapseRatePer100m) {
    if (lapseRatePer100m == null || isNaN(lapseRatePer100m)) {
        return {
            code: 'UNKNOWN',
            label: 'Indeterminato',
            isThermal: false,
            ceilingLimit: false
        };
    }
    const lr = Number(lapseRatePer100m);

    if (lr < 0) {
        return {
            code: STABILITY_CLASSES.INVERSION,
            label: 'Inversione Termica',
            isThermal: false,
            ceilingLimit: true
        };
    }
    if (Math.abs(lr) < 0.05) {
        return {
            code: STABILITY_CLASSES.ISOTHERMAL,
            label: 'Isotermico',
            isThermal: false,
            ceilingLimit: true
        };
    }
    if (lr < 0.65) {
        return {
            code: STABILITY_CLASSES.STABLE,
            label: 'Stabile',
            isThermal: false,
            ceilingLimit: false
        };
    }
    if (lr < 0.95) {
        return {
            code: STABILITY_CLASSES.CONDITIONALLY_UNSTABLE,
            label: 'Condizionatamente Instabile',
            isThermal: true,
            ceilingLimit: false
        };
    }
    if (lr <= 1.05) {
        return {
            code: STABILITY_CLASSES.DRY_ADIABATIC,
            label: 'Adiabatico Secco',
            isThermal: true,
            ceilingLimit: false
        };
    }
    return {
        code: STABILITY_CLASSES.SUPER_ADIABATIC,
        label: 'Super-adiabatico (Instabile)',
        isThermal: true,
        ceilingLimit: false
    };
}

/**
 * Calculates geopotential barometric altitude in meters from atmospheric pressure in hPa
 * according to the ICAO Standard Atmosphere hypsometric equation.
 * 
 * Formula:
 *   z = 44330 * (1 - (P / P0)^(1 / 5.255))
 * 
 * @param {number} pressureHpa Atmospheric pressure in hPa
 * @param {number} [qnhHpa=STANDARD_SEA_LEVEL_PRESSURE_HPA] Reference sea-level pressure (QNH) in hPa
 * @returns {number|null} Altitude in meters MSL rounded to integer
 */
export function calculateBarometricAltitude(pressureHpa, qnhHpa = STANDARD_SEA_LEVEL_PRESSURE_HPA) {
    if (pressureHpa == null || isNaN(pressureHpa) || pressureHpa <= 0) return null;
    const p = Number(pressureHpa);
    const p0 = Number(qnhHpa) || STANDARD_SEA_LEVEL_PRESSURE_HPA;

    const alt = 44330 * (1 - Math.pow(p / p0, 1 / 5.255));
    return Math.round(alt);
}

/**
 * Calculates atmospheric pressure in hPa at a given altitude in meters MSL
 * according to the inverse ICAO Standard Atmosphere hypsometric equation.
 * 
 * Formula:
 *   P = P0 * (1 - z / 44330)^5.255
 * 
 * @param {number} altitudeM Altitude in meters MSL
 * @param {number} [qnhHpa=STANDARD_SEA_LEVEL_PRESSURE_HPA] Reference sea-level pressure in hPa
 * @returns {number|null} Pressure in hPa rounded to 1 decimal place
 */
export function calculatePressureAtAltitude(altitudeM, qnhHpa = STANDARD_SEA_LEVEL_PRESSURE_HPA) {
    if (altitudeM == null || isNaN(altitudeM)) return null;
    const z = Number(altitudeM);
    const p0 = Number(qnhHpa) || STANDARD_SEA_LEVEL_PRESSURE_HPA;

    const ratio = 1 - (z / 44330);
    if (ratio <= 0) return 0;

    const pressure = p0 * Math.pow(ratio, 5.255);
    return Math.round(pressure * 10) / 10;
}

/**
 * Detects atmospheric inversion layers where temperature increases with altitude.
 * 
 * @param {Array<{ height?: number, hpa?: number, temp: number }>} soundingLevels Sorted or unsorted levels
 * @param {number} [minDeltaT=0.2] Minimum temperature inversion increase to qualify as inversion (°C)
 * @returns {Array<{ baseAlt: number, topAlt: number, deltaAlt: number, baseTemp: number, topTemp: number, deltaT: number, gradient: number }>}
 */
export function detectInversions(soundingLevels, minDeltaT = 0.2) {
    if (!Array.isArray(soundingLevels) || soundingLevels.length < 2) return [];

    // Ensure levels have valid height and temperature, sorted by altitude ascending
    const sorted = soundingLevels
        .filter(l => l && l.temp != null && !isNaN(l.temp) && (l.height != null || l.hpa != null))
        .map(l => ({
            ...l,
            alt: l.height != null ? Number(l.height) : calculateBarometricAltitude(l.hpa)
        }))
        .filter(l => l.alt != null && !isNaN(l.alt))
        .sort((a, b) => a.alt - b.alt);

    const inversions = [];

    for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const dz = p2.alt - p1.alt;
        if (dz <= 0) continue;

        const dt = p2.temp - p1.temp;
        if (dt >= minDeltaT) {
            const gradient = (dt / dz) * 100;
            inversions.push({
                baseAlt: Math.round(p1.alt),
                topAlt: Math.round(p2.alt),
                deltaAlt: Math.round(dz),
                baseTemp: Math.round(p1.temp * 10) / 10,
                topTemp: Math.round(p2.temp * 10) / 10,
                deltaT: Math.round(dt * 10) / 10,
                gradient: Math.round(gradient * 100) / 100
            });
        }
    }

    return inversions;
}

/**
 * Estimates the Thermal Ceiling (Equilibrium Level / Thermal Top) reached by a convective parcel.
 * 
 * Parcel ascent thermodynamics:
 *   - Below LCL: Parcel cools at the dry adiabatic rate (1.0 °C / 100m).
 *   - Above LCL: Parcel cools at the saturated adiabatic rate (0.5 °C / 100m).
 *   - Thermal Top: The altitude where the rising parcel's temperature drops below the environmental temperature.
 * 
 * @param {number} surfaceTemp Surface temperature in °C
 * @param {number} surfaceDewPoint Surface dew point in °C
 * @param {number} groundElevationM Ground elevation in meters MSL
 * @param {Array<{ height?: number, hpa?: number, temp: number }>} soundingLevels Vertical atmospheric profile
 * @returns {{
 *   thermalTopMsl: number,
 *   lclMsl: number,
 *   isBoundedByInversion: boolean,
 *   reachesLcl: boolean
 * }|null}
 */
export function estimateThermalCeiling(surfaceTemp, surfaceDewPoint, groundElevationM, soundingLevels) {
    if (surfaceTemp == null || surfaceDewPoint == null) return null;

    const sTemp = Number(surfaceTemp);
    const sDew = Number(surfaceDewPoint);
    const elev = Number(groundElevationM) || 0;

    const lclObj = calculateLCL(sTemp, sDew, elev);
    if (!lclObj) return null;
    const lcl = lclObj.lclMsl;

    if (!Array.isArray(soundingLevels) || soundingLevels.length === 0) {
        return {
            thermalTopMsl: lcl,
            lclMsl: lcl,
            isBoundedByInversion: false,
            reachesLcl: false
        };
    }

    // Prepare profile sorted by altitude ascending
    const profile = soundingLevels
        .filter(s => s && s.temp != null && (s.height != null || s.hpa != null))
        .map(s => ({
            ...s,
            alt: s.height != null ? Number(s.height) : calculateBarometricAltitude(s.hpa)
        }))
        .filter(s => s.alt != null && s.alt > elev)
        .sort((a, b) => a.alt - b.alt);

    if (profile.length === 0) {
        return {
            thermalTopMsl: lcl,
            lclMsl: lcl,
            isBoundedByInversion: false,
            reachesLcl: false
        };
    }

    let thermalTop = elev;
    let isBoundedByInversion = false;

    // Check each level above ground
    for (let i = 0; i < profile.length; i++) {
        const z = profile[i].alt;
        const envTemp = profile[i].temp;

        let parcelTemp;
        if (z <= lcl) {
            // Dry adiabatic cooling
            parcelTemp = sTemp - ((z - elev) / 100) * 1.0;
        } else {
            // Dry adiabatic to LCL, moist adiabatic above LCL
            const tempAtLcl = sTemp - ((lcl - elev) / 100) * 1.0;
            parcelTemp = tempAtLcl - ((z - lcl) / 100) * SATURATED_ADIABATIC_LAPSE_RATE;
        }

        if (parcelTemp >= envTemp) {
            thermalTop = z;
        } else {
            // Interpolate precise intersection between previous level and this level
            if (i > 0) {
                const prevZ = profile[i - 1].alt;
                const prevEnvTemp = profile[i - 1].temp;
                let prevParcelTemp;
                if (prevZ <= lcl) {
                    prevParcelTemp = sTemp - ((prevZ - elev) / 100) * 1.0;
                } else {
                    const tempAtLcl = sTemp - ((lcl - elev) / 100) * 1.0;
                    prevParcelTemp = tempAtLcl - ((prevZ - lcl) / 100) * SATURATED_ADIABATIC_LAPSE_RATE;
                }

                const parcelDiffPrev = prevParcelTemp - prevEnvTemp;
                const parcelDiffCurr = parcelTemp - envTemp;
                const denominator = parcelDiffPrev - parcelDiffCurr;
                if (denominator > 0) {
                    const fraction = parcelDiffPrev / denominator;
                    thermalTop = Math.round(prevZ + fraction * (z - prevZ));
                }
            } else {
                thermalTop = Math.max(elev, Math.round((elev + z) / 2));
            }

            // Check if boundary was caused by a temperature inversion
            if (i > 0 && profile[i].temp > profile[i - 1].temp) {
                isBoundedByInversion = true;
            }
            break;
        }
    }

    return {
        thermalTopMsl: Math.max(elev, thermalTop),
        lclMsl: lcl,
        isBoundedByInversion,
        reachesLcl: thermalTop >= lcl
    };
}

/**
 * Enriches a raw atmospheric sounding profile with computed dew points,
 * missing barometric altitudes, layer lapse rates, stability classifications,
 * detected inversions, LCL, and thermal ceiling.
 * 
 * @param {Array<{ hpa: number, temp: number, rh?: number, dew?: number, height?: number }>} rawLevels 
 * @param {number} [surfaceTemp] 
 * @param {number} [surfaceDew] 
 * @param {number} [groundElevationM=0] 
 * @param {number} [qnhHpa=STANDARD_SEA_LEVEL_PRESSURE_HPA] 
 * @returns {{
 *   levels: Array<Object>,
 *   inversions: Array<Object>,
 *   lcl: { lclAgl: number, lclMsl: number }|null,
 *   thermalCeiling: Object|null
 * }}
 */
export function enrichSoundingProfile(rawLevels, surfaceTemp = null, surfaceDew = null, groundElevationM = 0, qnhHpa = STANDARD_SEA_LEVEL_PRESSURE_HPA) {
    if (!Array.isArray(rawLevels)) {
        return { levels: [], inversions: [], lcl: null, thermalCeiling: null };
    }

    // Process levels
    const levels = rawLevels
        .filter(l => l && l.temp != null && !isNaN(l.temp))
        .map(l => {
            const hpa = Number(l.hpa);
            const temp = Number(l.temp);
            const height = l.height != null ? Number(l.height) : calculateBarometricAltitude(hpa, qnhHpa);
            let dew = l.dew;
            let rh = l.rh;

            if (dew == null && rh != null) {
                dew = calculateDewPoint(temp, rh);
            } else if (rh == null && dew != null) {
                rh = calculateRelativeHumidity(temp, dew);
            }

            return {
                hpa,
                temp,
                rh: rh != null ? rh : null,
                dew: dew != null ? dew : null,
                height: height != null ? height : 0
            };
        })
        .sort((a, b) => a.height - b.height);

    // Compute layer lapse rates and stability for adjacent levels
    for (let i = 0; i < levels.length - 1; i++) {
        const l1 = levels[i];
        const l2 = levels[i + 1];
        const lrInfo = calculateLapseRate(l1.temp, l1.height, l2.temp, l2.height);
        if (lrInfo) {
            const stability = classifyAtmosphericStability(lrInfo.lapseRate);
            l1.layerAbove = {
                deltaZ: lrInfo.deltaZ,
                deltaT: lrInfo.deltaT,
                lapseRate: lrInfo.lapseRate,
                gradient: lrInfo.gradient,
                stabilityCode: stability.code,
                stabilityLabel: stability.label
            };
        }
    }

    const inversions = detectInversions(levels);

    let lcl = null;
    let thermalCeiling = null;
    if (surfaceTemp != null && surfaceDew != null) {
        lcl = calculateLCL(surfaceTemp, surfaceDew, groundElevationM);
        thermalCeiling = estimateThermalCeiling(surfaceTemp, surfaceDew, groundElevationM, levels);
    }

    return {
        levels,
        inversions,
        lcl,
        thermalCeiling
    };
}
