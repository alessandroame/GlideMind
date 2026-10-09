/**
 * GlideMind - Headless Flyability & Aeronautical Safety Engine
 * 
 * Provides pure meteorological risk evaluation and waterfall scoring for paragliding:
 * 1. Sustained wind & gust limits dynamic to glider trim speed (vTrim)
 * 2. Convective instability (CAPE) & overdevelopment thresholds
 * 3. Synthetic Eddy Dissipation Rate (EDR) atmospheric turbulence
 * 4. Deardorff convective scaling for thermal lift & boundary-layer climb
 * 5. Takeoff heading vs wind direction (frontal, crosswind, lee-side rotor guard)
 * 6. Multi-factor waterfall prioritization & timeline scoring
 * 
 * ZERO DOM DEPENDENCIES: 100% testable in Node.js runtime without browser APIs.
 */

export const NO_FLY_BG = 'fly-seg-nofly';
export const NO_DATA_BG = 'fly-seg-nd';

/**
 * @deprecated Aerodynamic limits derive directly from glider class and specifications (vTrim, AR, glideRatio),
 * avoiding arbitrary pilot self-declaration in the UI.
 */
export const PilotExperienceLevel = Object.freeze({
    BEGINNER: 'beginner',
    INTERMEDIATE: 'intermediate',
    EXPERT: 'expert'
});

/**
 * Standard FAI/EN Paraglider Certification Classes & Aerodynamic Baselines.
 */
export const GLIDER_CLASSES = Object.freeze({
    EN_A: Object.freeze({
        name: 'Scuola / Principiante (EN-A)',
        category: 'EN-A',
        vTrim: 36,
        vMax: 46,
        ar: 4.8,
        glideRatio: 7.8
    }),
    EN_B: Object.freeze({
        name: 'Standard / Intermedio (EN-B)',
        category: 'EN-B',
        vTrim: 38,
        vMax: 50,
        ar: 5.3,
        glideRatio: 8.6
    }),
    EN_C: Object.freeze({
        name: 'Sport / Avanzato (EN-C)',
        category: 'EN-C',
        vTrim: 40,
        vMax: 55,
        ar: 6.2,
        glideRatio: 9.8
    }),
    EN_D: Object.freeze({
        name: 'Competizione (EN-D / CCC)',
        category: 'EN-D',
        vTrim: 42,
        vMax: 60,
        ar: 7.0,
        glideRatio: 10.5
    })
});

export const PriorityWeights = Object.freeze({
    direction: 50,
    wind: 40,
    turbulence: 30,
    rain: 20,
    cape: 10
});

export const DEFAULT_GLIDER = Object.freeze({
    name: 'Standard EN-A/B',
    category: 'EN-A',
    vTrim: 37,
    vMax: 50,
    ar: 5.1,
    glideRatio: 8.5
});

/**
 * Built-in default dictionary for autonomous headless operation without UI dependencies.
 */
const DEFAULT_STRINGS = {
    'fly.optimum_wind': 'Vento Calmo/Ottimale',
    'fly.no_fly_wind': 'NO FLY: Vento Estremo',
    'fly.no_fly_gusts': 'NO FLY: Raffiche Estreme',
    'fly.warn_gusts': 'Vento Forte',
    'fly.warn_heavy_gusts': 'Raffiche Forti',
    'fly.mod_gusts': 'Vento Moderato',
    'fly.mod_heavy_gusts': 'Raffiche Moderate',
    'fly.stable_air': 'Aria Stabile',
    'fly.mod_turb': 'Turbolenza Moderata',
    'fly.warn_turb': 'Turbolenza Forte',
    'fly.no_fly_turb': 'NO FLY: Turbolenza Estrema',
    'fly.weak_thermals': 'Atmosfera Stabile',
    'fly.regular_thermals': 'Convezione Moderata',
    'fly.mod_thermals': 'Convezione Attiva',
    'fly.warn_thermals': 'Forte Instabilità',
    'fly.no_fly_cape': 'NO FLY: Rischio Temporali Severi',
    'fly.no_rain': 'Assenza di Pioggia',
    'fly.warn_rain': 'Pioggia Leggera',
    'fly.no_fly_rain': 'NO FLY: Pioggia/Temporale',
    'fly.exposure_ok': 'Vento Frontale',
    'fly.wind_calm': 'Vento Calmo',
    'fly.warn_crosswind': 'Vento Traverso',
    'fly.warn_light_tailwind': 'Brezza da Dietro',
    'fly.warn_tailwind': 'Vento da Dietro',
    'fly.warn_lee': 'Sottovento Sostenuto',
    'fly.no_fly_lee': 'NO FLY: Sottovento Sostenuto',
    'fly.fly_perfect': 'Condizioni Ottimali',
    'meteo.wind': 'Vento',
    'meteo.turbulence': 'Turbolenza',
    'meteo.thermals': 'Instabilità (CAPE)',
    'meteo.rain': 'Pioggia',
    'meteo.exposure': 'Esposizione Decollo',
    'meteo.thermal_quality': 'Attività Termica'
};

let activeTranslator = null;

/**
 * Pluggable translator setter for UI layer internationalization.
 * @param {((key: string, params?: object) => string)|null} fn
 */
export function setFlyabilityTranslator(fn) {
    activeTranslator = typeof fn === 'function' ? fn : null;
}

/**
 * Resolves a translation key with optional interpolation params.
 * @param {string} key
 * @param {object} [params]
 * @param {((key: string, params?: object) => string)|null} [overrideFn]
 * @returns {string}
 */
export function resolveTranslation(key, params = null, overrideFn = null) {
    if (typeof overrideFn === 'function') {
        const res = overrideFn(key, params);
        if (res && res !== key) return res;
    }
    if (typeof activeTranslator === 'function') {
        const res = activeTranslator(key, params);
        if (res && res !== key) return res;
    }
    let str = DEFAULT_STRINGS[key] || key;
    if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(`{${k}}`, v !== undefined && v !== null ? v : '');
        }
    }
    return str;
}

/**
 * Computes the vector shear difference between two wind vectors at different pressure altitudes.
 * Accounts for both speed difference and wind veering/backing.
 * 
 * @param {number} speed1 Speed at level 1 in km/h
 * @param {number|null} dir1 Direction at level 1 in degrees [0, 360)
 * @param {number} speed2 Speed at level 2 in km/h
 * @param {number|null} dir2 Direction at level 2 in degrees [0, 360)
 * @returns {number} Vector shear delta in km/h
 */
export function calculateVectorShear(speed1 = 0, dir1 = null, speed2 = 0, dir2 = null) {
    const s1 = Number(speed1) || 0;
    const s2 = Number(speed2) || 0;
    if (dir1 != null && dir2 != null && !isNaN(dir1) && !isNaN(dir2)) {
        const deltaRad = Math.abs(Number(dir1) - Number(dir2)) * (Math.PI / 180);
        const shearSq = Math.max(0, (s1 ** 2) + (s2 ** 2) - (2 * s1 * s2 * Math.cos(deltaRad)));
        return Math.round(Math.sqrt(shearSq) * 10) / 10;
    }
    return Math.abs(s2 - s1);
}

/**
 * Computes Eddy Dissipation Rate (EDR) synthetic turbulence index (scale [0, 1])
 * based on gust delta, convective CAPE intensity, and vertical wind shear.
 * 
 * @param {number} wind Wind speed in km/h
 * @param {number} gust Gust speed in km/h
 * @param {number} cape CAPE in J/kg
 * @param {number} shear Vertical wind shear delta in km/h
 * @returns {number} Normalized EDR turbulence index
 */
export function calculateTurbulenceEDR(wind = 0, gust = 0, cape = 0, shear = 0) {
    const w = Math.max(0, Number(wind) || 0);
    const g = Math.max(w, Number(gust) || w);
    const c = Math.max(0, Number(cape) || 0);
    const s = Math.max(0, Number(shear) || 0);

    const t = (((g - w) * 0.4) + (c / 200) + (s * 0.2)) / 25;
    return Math.max(0, Math.min(1.0, Math.round(t * 100) / 100));
}

/**
 * Computes thermal climb rate and convective probability based on Deardorff convective scaling (w*).
 * 
 * @param {number} solarRadiation Incoming shortwave solar radiation in W/m2
 * @param {number} boundaryLayerHeight Convective boundary layer depth in meters AGL
 * @param {number} windSpeed Wind speed in km/h
 * @param {number} rain Precipitation in mm/h
 * @param {number} spotElevation Spot surface elevation in meters MSL
 * @returns {{
 *   probability: number,
 *   climbRate: number,
 *   wStar: number,
 *   ceilingAgl: number,
 *   ceilingMsl: number,
 *   qualityKey: 'strong'|'good'|'weak'|'none'
 * }}
 */
export function calculateThermalLift(solarRadiation = 0, boundaryLayerHeight = 0, windSpeed = 0, rain = 0, spotElevation = 0) {
    const rad = Math.max(0, Number(solarRadiation) || 0);
    const blh = Math.max(0, Number(boundaryLayerHeight) || 0);
    const wind = Math.max(0, Number(windSpeed) || 0);
    const precip = Math.max(0, Number(rain) || 0);
    const elev = Math.max(0, Number(spotElevation) || 0);

    if (precip > 0.1 || rad < 80) {
        return {
            probability: 0,
            climbRate: 0,
            wStar: 0,
            ceilingAgl: Math.round(blh),
            ceilingMsl: Math.round(elev + blh),
            qualityKey: 'none'
        };
    }

    let effectiveBlh = blh;
    if (effectiveBlh < 150 && rad >= 80) {
        effectiveBlh = Math.min(2400, Math.max(300, Math.round(1.8 * rad)));
    }

    const fluxProduct = rad * effectiveBlh;
    const wStarRaw = Math.cbrt(9.45e-6 * fluxProduct);
    const wStar = Math.max(0, Math.round(wStarRaw * 10) / 10);

    let netClimb = (1.5 * wStar) - 1.1;
    if (wind > 20) {
        const windPenalty = Math.max(0.2, 1 - ((wind - 20) * 0.05));
        netClimb *= windPenalty;
    }
    const climbRate = Math.max(0, Math.round(netClimb * 10) / 10);

    let pSolar = 0;
    if (rad >= 550) {
        pSolar = 75 + Math.min(20, (rad - 550) / 20);
    } else if (rad >= 300) {
        pSolar = 45 + ((rad - 300) / 250) * 30;
    } else if (rad >= 150) {
        pSolar = 20 + ((rad - 150) / 150) * 25;
    } else {
        pSolar = ((rad - 80) / 70) * 20;
    }

    let windFactor = 1.0;
    if (wind > 25) {
        windFactor = Math.max(0.1, 1 - ((wind - 25) * 0.08));
    } else if (wind > 15) {
        windFactor = 1 - ((wind - 15) * 0.02);
    }

    const probability = Math.max(0, Math.min(99, Math.round(pSolar * windFactor)));

    let qualityKey = 'weak';
    if (climbRate >= 2.5 && probability >= 60) {
        qualityKey = 'strong';
    } else if (climbRate >= 1.2 && probability >= 40) {
        qualityKey = 'good';
    } else if (climbRate <= 0.3 || probability < 20) {
        qualityKey = 'none';
    }

    return {
        probability,
        climbRate,
        wStar,
        ceilingAgl: Math.round(effectiveBlh),
        ceilingMsl: Math.round(elev + effectiveBlh),
        qualityKey
    };
}

/**
 * Evaluates wind speed, gusts, and gust delta against the glider's operational trim speed.
 * 
 * @param {number} wind Sustained wind at 10m in km/h
 * @param {number} gust Wind gusts at 10m in km/h
 * @param {object} [glider] Glider specifications (vTrim)
 * @param {Function} [translator] Optional translation function
 * @returns {{ name: string, text: string, color: string, bg: string, severity: number, desc: string }}
 */
export function evaluateWindFlyability(wind, gust, glider = null, translator = null) {
    const vTrim = glider?.vTrim || DEFAULT_GLIDER.vTrim;

    const windYellow = Math.round(vTrim * 0.45);
    const gustYellow = Math.round(vTrim * 0.60);
    const deltaYellow = Math.round(vTrim * 0.22);

    const windRed = Math.round(vTrim * 0.65);
    const gustRed = Math.round(vTrim * 0.80);
    const deltaRed = Math.round(vTrim * 0.35);

    const windNoFly = Math.round(vTrim * 0.85);
    const gustNoFly = Math.round(vTrim * 1.00);
    const deltaNoFly = Math.round(vTrim * 0.50);

    const delta = gust - wind;

    let text = resolveTranslation('fly.optimum_wind', null, translator);
    let color = "text-emerald-500";
    let bg = "bg-emerald-500";
    let severity = 0; // 0=Green, 1=Yellow, 2=Red, 3=Black/No-fly
    let desc = `Vento calmo o brezza ottimale (<=${windYellow} km/h). Condizioni ideali e sicure per il decollo con ${glider?.name || 'parapendio'}.`;

    if (wind > windNoFly || gust > gustNoFly || delta > deltaNoFly) {
        const isGustTrigger = wind <= windNoFly;
        text = isGustTrigger
            ? resolveTranslation('fly.no_fly_gusts', null, translator)
            : resolveTranslation('fly.no_fly_wind', null, translator);
        color = "text-rose-500 dark:text-rose-400 font-bold";
        bg = NO_FLY_BG;
        severity = 3;
        desc = isGustTrigger
            ? `Raffiche estreme (${gust} km/h, Delta ${delta} km/h) con vento base di ${wind} km/h. La turbolenza meccanica e le chiusure asimmetriche superano le capacità di recupero dell'ala.`
            : `Vento medio estremo (${wind} km/h) con raffiche fino a ${gust} km/h (Delta ${delta} km/h). La velocità del vento supera la penetrazione utile (${vTrim} km/h trim), con rischio elevato di arretramento.`;
    } else if (wind > windRed || gust > gustRed || delta > deltaRed) {
        const isGustTrigger = wind <= windRed;
        text = isGustTrigger
            ? resolveTranslation('fly.warn_heavy_gusts', null, translator)
            : resolveTranslation('fly.warn_gusts', null, translator);
        color = "text-red-500";
        bg = "bg-red-500";
        severity = 2;
        desc = isGustTrigger
            ? `Vento base (${wind} km/h) con raffiche forti o sbalzi marcati (Raffica ${gust} km/h, Delta ${delta} km/h). Condizioni turbolente che richiedono pilotaggio attivo esperto.`
            : `Vento sostenuto (${wind} km/h). Condizioni impegnative al limite operativo per trim di ${vTrim} km/h.`;
    } else if (wind > windYellow || gust > gustYellow || delta > deltaYellow) {
        const isGustTrigger = wind <= windYellow;
        text = isGustTrigger
            ? resolveTranslation('fly.mod_heavy_gusts', null, translator)
            : resolveTranslation('fly.mod_gusts', null, translator);
        color = "text-amber-400";
        bg = "bg-amber-400";
        severity = 1;
        desc = isGustTrigger
            ? `Vento base di ${wind} km/h con raffiche attive (Raffica ${gust} km/h, Delta ${delta} km/h). Condizioni termiche o meccaniche adatte a piloti intermedi.`
            : `Vento di brezza moderata (${wind} km/h) con raffiche di ${gust} km/h. Condizioni attive adatte a piloti con esperienza intermedia ed avanzata.`;
    }

    return {
        name: resolveTranslation('meteo.wind', null, translator),
        text,
        color,
        bg,
        severity,
        desc
    };
}

/**
 * Evaluates synthetic EDR atmospheric turbulence against glider aspect ratio.
 * 
 * @param {number} turbulence Normalized EDR index [0, 1]
 * @param {object} [glider] Glider specifications (ar)
 * @param {Function} [translator] Optional translation function
 * @returns {{ name: string, text: string, color: string, bg: string, severity: number, desc: string }}
 */
export function evaluateTurbulenceFlyability(turbulence, glider = null, translator = null) {
    const ar = glider?.ar || DEFAULT_GLIDER.ar;
    const turbYellow = Math.max(0.22, 0.32 - (ar - 4.8) * 0.02);
    const turbRed = Math.max(0.42, 0.52 - (ar - 4.8) * 0.025);
    const turbNoFly = Math.max(0.65, 0.76 - (ar - 4.8) * 0.03);

    let text = resolveTranslation('fly.stable_air', null, translator);
    let color = "text-emerald-500";
    let bg = "bg-emerald-500";
    let severity = 0;
    let desc = `Indice di turbolenza sintetico EDR ${turbulence}. Massa d'aria stabile e laminare con scarse variazioni di carico sui comandi.`;

    if (turbulence > turbNoFly) {
        text = resolveTranslation('fly.no_fly_turb', null, translator);
        color = "text-rose-500 dark:text-rose-400 font-bold";
        bg = NO_FLY_BG;
        severity = 3;
        desc = `Indice di turbolenza EDR ${turbulence}. Forte gradiente di vento e shear verticale severo. Rischio critico di chiusure asimmetriche o stalli dinamici incontrollabili.`;
    } else if (turbulence > turbRed) {
        text = resolveTranslation('fly.warn_turb', null, translator);
        color = "text-red-500";
        bg = "bg-red-500";
        severity = 2;
        desc = `Indice di turbolenza EDR ${turbulence}. Presenza di turbolenza meccanica o termica marcata. Richiede pilotaggio attivo costante e controllo continuo dell'incidenza.`;
    } else if (turbulence > turbYellow) {
        text = resolveTranslation('fly.mod_turb', null, translator);
        color = "text-amber-400";
        bg = "bg-amber-400";
        severity = 1;
        desc = `Indice di turbolenza EDR ${turbulence}. Turbolenza moderata legata al gradiente o alla risposta termica del pendio. Flussi vivi ma gestibili con pilotaggio attivo.`;
    }

    return {
        name: resolveTranslation('meteo.turbulence', null, translator),
        text,
        color,
        bg,
        severity,
        desc
    };
}

/**
 * Evaluates atmospheric CAPE (Convective Available Potential Energy) in J/kg.
 * 
 * @param {number} cape Convective energy in J/kg
 * @param {Function} [translator] Optional translation function
 * @returns {{ name: string, text: string, color: string, bg: string, severity: number, desc: string }}
 */
export function evaluateCapeFlyability(cape, translator = null) {
    let text = resolveTranslation('fly.regular_thermals', null, translator);
    let color = "text-emerald-500";
    let bg = "bg-emerald-500";
    let severity = 0;
    let desc = `CAPE ${cape} J/kg. Energia convettiva moderata con termiche regolari e cumuli ben formati, favorevoli per il volo veleggiato.`;

    if (cape > 1800) {
        text = resolveTranslation('fly.no_fly_cape', null, translator);
        color = "text-rose-500 dark:text-rose-400 font-bold";
        bg = NO_FLY_BG;
        severity = 3;
        desc = `CAPE estremo (${cape} J/kg). Energia convettiva esplosiva con rischio critico di cumulonembi (CB), temporali severi, colpi di vento e risucchio di nube.`;
    } else if (cape > 1000) {
        text = resolveTranslation('fly.warn_thermals', null, translator);
        color = "text-red-500";
        bg = "bg-red-500";
        severity = 2;
        desc = `CAPE elevato (${cape} J/kg). Forte instabilità verticale con rischio di overdevelopment, rapido addensamento nuvoloso e ascendenze violente. Riservato a piloti esperti.`;
    } else if (cape >= 400) {
        text = resolveTranslation('fly.mod_thermals', null, translator);
        color = "text-amber-400";
        bg = "bg-amber-400";
        severity = 1;
        desc = `CAPE ${cape} J/kg. Potenziale convettivo attivo. Salite più sostenute con bordi termici turbolenti; monitorare lo sviluppo verticale delle nubi.`;
    } else if (cape < 100) {
        text = resolveTranslation('fly.weak_thermals', null, translator);
        color = "text-emerald-500";
        bg = "bg-emerald-500";
        severity = 0;
        desc = `CAPE ${cape} J/kg. Atmosfera libera stabile: assenza di rischi di temporali o overdevelopment.`;
    }

    return {
        name: resolveTranslation('meteo.thermals', null, translator),
        text,
        color,
        bg,
        severity,
        desc
    };
}

/**
 * Evaluates precipitation risk on glider fabric and aerodynamic safety.
 * 
 * @param {number} rain Precipitation in mm/h
 * @param {Function} [translator] Optional translation function
 * @returns {{ name: string, text: string, color: string, bg: string, severity: number, desc: string }}
 */
export function evaluateRainFlyability(rain, translator = null) {
    let text = resolveTranslation('fly.no_rain', null, translator);
    let color = "text-emerald-500";
    let bg = "bg-emerald-500";
    let severity = 0;
    let desc = "Nessuna precipitazione prevista nell'ora selezionata. Tessuto dell'ala asciutto e massima efficienza aerodinamica.";

    if (rain > 0.5) {
        text = resolveTranslation('fly.no_fly_rain', null, translator);
        color = "text-rose-500 dark:text-rose-400 font-bold";
        bg = NO_FLY_BG;
        severity = 3;
        desc = `Precipitazioni moderate o forti (${rain} mm/h). Il tessuto del parapendio assorbe acqua modificando drammaticamente il profilo aerodinamico con rischio immediato di stallo paracadutale ed aumento del peso alare.`;
    } else if (rain >= 0.1) {
        text = resolveTranslation('fly.warn_rain', null, translator);
        color = "text-red-500";
        bg = "bg-red-500";
        severity = 2;
        desc = `Precipitazioni deboli o pioviggine (${rain} mm/h). Rischio di bagnare l'ala e peggioramento delle caratteristiche di volo. Atterraggio consigliato.`;
    }

    return {
        name: resolveTranslation('meteo.rain', null, translator),
        text,
        color,
        bg,
        severity,
        desc
    };
}

/**
 * Returns cardinal compass direction string ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW').
 * 
 * @param {number} deg
 * @returns {string}
 */
export function getCardinalDirection(deg) {
    if (deg == null || isNaN(deg)) return 'N';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((deg % 360) / 45)) % 8;
    return directions[index];
}

/**
 * Determines whether a given site or metadata corresponds to an active takeoff slope.
 * 
 * @param {object|null} targetLocation
 * @param {object|null} weatherMeta
 * @returns {boolean}
 */
export function isTakeoffSite(targetLocation, weatherMeta) {
    if (targetLocation) {
        const t = (targetLocation.type || targetLocation.pointType || '').toLowerCase();
        if (t === 'atterraggio' || t === 'landing') return false;
        if (t === 'decollo' || t === 'takeoff') return true;
        const name = (targetLocation.point || targetLocation.name || targetLocation.id || '').toLowerCase();
        if (/atterraggio|landing/i.test(name)) return false;
        if (/decollo|takeoff/i.test(name)) return true;
    }
    const slopeDeg = (weatherMeta && weatherMeta.slope_deg != null) ? parseFloat(weatherMeta.slope_deg) : 0;
    return slopeDeg > 10;
}

/**
 * Evaluates takeoff directional alignment against wind direction and guards against deadly lee-side rotor vortices.
 * 
 * @param {number} wind Wind speed in km/h
 * @param {number} windDir Wind direction in degrees [0, 360)
 * @param {number|null} takeoffAzimuth Takeoff orientation in degrees [0, 360)
 * @param {boolean} [isTakeoff=true]
 * @param {Function} [translator] Optional translation function
 * @returns {object|null}
 */
export function evaluateDirectionFlyability(wind, windDir = 0, takeoffAzimuth = null, isTakeoff = true, translator = null) {
    if (!isTakeoff || takeoffAzimuth == null) {
        return null;
    }

    let diffFromFront = Math.abs(windDir - takeoffAzimuth);
    if (diffFromFront > 180) diffFromFront = 360 - diffFromFront;

    let text = resolveTranslation('fly.exposure_ok', null, translator);
    let color = "text-emerald-500";
    let bg = "bg-emerald-500";
    let severity = 0;
    let isLeeSide = false;
    let desc = `Vento perfettamente orientato in asse al decollo (scostamento ${diffFromFront}° rispetto all'azimut ${takeoffAzimuth}°). Flusso laminare frontale ideale per il decollo.`;

    if (wind < 4) {
        if (diffFromFront > 90) {
            isLeeSide = true;
            text = resolveTranslation('fly.warn_light_tailwind', null, translator);
            color = "text-amber-400";
            bg = "bg-amber-400";
            severity = 1;
            desc = `Brezza debole (${wind} km/h) con provenienza dal settore posteriore del pendio (scostamento ${diffFromFront}°). Prestare attenzione alla direzione del gonfiaggio durante la corsa.`;
        } else {
            isLeeSide = false;
            text = resolveTranslation('fly.wind_calm', null, translator);
            color = "text-emerald-500";
            bg = "bg-emerald-500";
            severity = 0;
            desc = `Vento debole o calmo (${wind} km/h). La direzione del vento in quota ha influenza trascurabile ed è dominata dalle brezzoline locali di decollo.`;
        }
    } else {
        if (diffFromFront <= 45) {
            isLeeSide = false;
            text = resolveTranslation('fly.exposure_ok', null, translator);
            color = "text-emerald-500";
            bg = "bg-emerald-500";
            severity = 0;
            desc = `Vento orientato nel cono frontale di decollo (scostamento ${diffFromFront}° rispetto all'azimut ${takeoffAzimuth}°). Flusso favorevole per la corsa e il decollo.`;
        } else if (diffFromFront <= 90) {
            isLeeSide = false;
            text = resolveTranslation('fly.warn_crosswind', null, translator);
            color = "text-amber-400";
            bg = "bg-amber-400";
            severity = 1;
            desc = `Vento traverso/fuori asse (scostamento ${diffFromFront}° rispetto all'azimut del pendio ${takeoffAzimuth}°). Nelle previsioni sinottiche a griglia 10km, le brezze termiche locali in decollo tendono frequentemente a riallineare il vento.`;
        } else {
            isLeeSide = true;
            if (wind > 18) {
                text = resolveTranslation('fly.no_fly_lee', null, translator);
                color = "text-rose-500 dark:text-rose-400 font-bold";
                bg = NO_FLY_BG;
                severity = 3;
                desc = `Vento da dietro sostenuto (${wind} km/h, scostamento ${diffFromFront}°). Il vento sinottico scavalca la cresta formando rotori discendenti fatali sul versante di decollo.`;
            } else if (wind >= 10) {
                text = resolveTranslation('fly.warn_lee', null, translator);
                color = "text-red-500";
                bg = "bg-red-500";
                severity = 2;
                desc = `Vento da dietro di ${wind} km/h (scostamento ${diffFromFront}°). Flusso di sottovento pericoloso con rischio di turbolenza da rotore dietro il rilievo.`;
            } else {
                text = resolveTranslation('fly.warn_tailwind', null, translator);
                color = "text-amber-400";
                bg = "bg-amber-400";
                severity = 1;
                desc = `Vento sinottico previsto da dietro (${wind} km/h, scostamento ${diffFromFront}°). Le brezze termiche di pendio diurne potrebbero comunque girare il vento a favore in decollo. Verificare sul posto.`;
            }
        }
    }

    return {
        name: resolveTranslation('meteo.exposure', null, translator),
        text,
        color,
        bg,
        severity,
        isLeeSide,
        diffFromFront,
        desc
    };
}

/**
 * Evaluates thermal quality summary object.
 * 
 * @param {object|null} thermalLift
 * @param {Function} [translator]
 * @returns {object}
 */
export function evaluateThermalQuality(thermalLift, translator = null) {
    if (!thermalLift) {
        return {
            name: resolveTranslation('meteo.thermal_quality', null, translator),
            text: "--",
            color: "text-slate-400",
            bg: "bg-slate-500",
            severity: 0,
            desc: "Dati termici non disponibili."
        };
    }

    const probability = Number(thermalLift.probability) || 0;
    const climbRate = Number(thermalLift.climbRate) || 0;
    const qualityKey = thermalLift.qualityKey || 'none';

    let text = "Termiche Assenti / Solo Planata (0%)";
    let color = "text-slate-400";
    let bg = "bg-slate-500";
    let severity = 0;
    let desc = "Radiazione solare insufficiente (< 80 W/m²) per l'innesco di termiche. Aria calma adatta a planate o dinamica di pendio.";

    if (qualityKey === 'strong') {
        text = `Termiche Forti (+${climbRate} m/s, ${probability}%)`;
        color = "text-emerald-500 font-bold";
        bg = "bg-emerald-500";
    } else if (qualityKey === 'good') {
        text = `Termiche Buone (+${climbRate} m/s, ${probability}%)`;
        color = "text-emerald-500";
        bg = "bg-emerald-500";
    } else if (qualityKey === 'weak') {
        text = `Termiche Deboli (+${climbRate} m/s, ${probability}%)`;
        color = "text-amber-400";
        bg = "bg-amber-400";
    }

    return {
        name: resolveTranslation('meteo.thermal_quality', null, translator),
        text,
        color,
        bg,
        severity,
        desc,
        probability,
        climbRate,
        ceilingMsl: thermalLift.ceilingMsl,
        ceilingAgl: thermalLift.ceilingAgl,
        qualityKey
    };
}

/**
 * Core waterfall safety synthesizer: evaluates all individual risk factors and applies prioritized tie-breaking.
 * Priority: Direction/Lee-side (50) > Wind/Gusts (40) > Turbulence (30) > Rain (20) > CAPE (10).
 * 
 * @param {number} wind Sustained wind in km/h
 * @param {number} gust Peak gust in km/h
 * @param {number} cape CAPE in J/kg
 * @param {number} turbulence Normalized EDR index [0, 1]
 * @param {number} rain Precipitation in mm/h
 * @param {number} [windDir=0] Wind direction in degrees
 * @param {number|null} [takeoffAzimuth=null] Takeoff orientation in degrees
 * @param {boolean} [isTakeoff=true]
 * @param {object|null} [glider=null]
 * @param {object|null} [thermalLift=null]
 * @param {Function|null} [translator=null]
 * @returns {{ text: string, color: string, bg: string, severity: number, details: object }}
 */
export function getFlyabilityScore(
    wind,
    gust,
    cape,
    turbulence,
    rain,
    windDir = 0,
    takeoffAzimuth = null,
    isTakeoff = true,
    glider = null,
    thermalLift = null,
    translator = null
) {
    const activeGlider = glider || DEFAULT_GLIDER;
    const rainEval = evaluateRainFlyability(rain, translator);
    const turbEval = evaluateTurbulenceFlyability(turbulence, activeGlider, translator);
    const dirEval = evaluateDirectionFlyability(wind, windDir, takeoffAzimuth, isTakeoff, translator);
    const windEval = evaluateWindFlyability(wind, gust, activeGlider, translator);
    const capeEval = evaluateCapeFlyability(cape, translator);
    const thermEval = thermalLift ? evaluateThermalQuality(thermalLift, translator) : null;

    const evals = [
        { ...rainEval, key: 'rain', priority: PriorityWeights.rain },
        { ...turbEval, key: 'turbulence', priority: PriorityWeights.turbulence },
        { ...windEval, key: 'wind', priority: PriorityWeights.wind },
        { ...capeEval, key: 'cape', priority: PriorityWeights.cape }
    ];

    if (dirEval) {
        evals.push({ ...dirEval, key: 'direction', priority: PriorityWeights.direction });
    }

    // Sort primarily by severity (highest first); if tied, sort by aeronautical safety priority
    evals.sort((a, b) => {
        if (b.severity !== a.severity) {
            return b.severity - a.severity;
        }
        return b.priority - a.priority;
    });

    const worstEval = evals[0];
    const details = {
        wind: windEval,
        turbulence: turbEval,
        cape: capeEval,
        rain: rainEval
    };

    if (thermEval) details.thermals = thermEval;
    if (dirEval) details.direction = dirEval;

    if (worstEval.severity === 0) {
        return {
            text: resolveTranslation('fly.fly_perfect', null, translator),
            color: "text-emerald-500",
            bg: "bg-emerald-500",
            severity: 0,
            details
        };
    }

    return {
        text: worstEval.text,
        color: worstEval.color,
        bg: worstEval.bg,
        severity: worstEval.severity,
        details
    };
}

/**
 * Calculates hourly timeline scores for daylight hours (sunrise to sunset) from a weather object.
 * 
 * @param {object} weather Weather object containing hourly arrays and meta
 * @param {boolean|null} [isTakeoffOverride=null]
 * @param {number|null} [headingOverride=null]
 * @param {object|null} [glider=null]
 * @param {Function|null} [translator=null]
 * @returns {Array<object>}
 */
export function calculateTimelineScores(weather, isTakeoffOverride = null, headingOverride = null, glider = null, translator = null) {
    if (!weather || !weather.hourly) return [];
    const activeGlider = glider || DEFAULT_GLIDER;

    let isTakeoff = true;
    if (isTakeoffOverride !== null) {
        isTakeoff = isTakeoffOverride;
    } else {
        isTakeoff = isTakeoffSite(null, weather.meta);
    }

    let azimuth = weather.meta ? weather.meta.takeoff_azimuth : null;
    if (headingOverride != null && !isNaN(parseFloat(headingOverride))) {
        azimuth = parseFloat(headingOverride);
    }

    let srHour = 6;
    let ssHour = 20;
    if (weather.meta && weather.meta.sunrise && typeof weather.meta.sunrise === 'string' && weather.meta.sunrise.includes(':')) {
        const parsed = parseInt(weather.meta.sunrise.split(':')[0], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) srHour = parsed;
    }
    if (weather.meta && weather.meta.sunset && typeof weather.meta.sunset === 'string' && weather.meta.sunset.includes(':')) {
        const parsed = parseInt(weather.meta.sunset.split(':')[0], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) ssHour = parsed;
    }
    if (srHour > ssHour) {
        srHour = 6;
        ssHour = 20;
    }

    const daytimeHours = [];
    for (let h = srHour; h <= ssHour; h++) {
        daytimeHours.push(h);
    }

    return daytimeHours.map(hour => {
        const hourFmt = hour.toString().padStart(2, '0');
        const timeSuffix = "T" + hourFmt + ":00";
        let hourIndex = -1;

        if (weather.hourly.rawTime && Array.isArray(weather.hourly.rawTime)) {
            hourIndex = weather.hourly.rawTime.findIndex(t => t && (t.endsWith(timeSuffix) || t.endsWith("T" + hourFmt) || t.includes("T" + hourFmt + ":")));
        }
        if (hourIndex === -1 && weather.hourly.time && Array.isArray(weather.hourly.time)) {
            const timeMatch = `${hourFmt}:00`;
            hourIndex = weather.hourly.time.findIndex(t => t === timeMatch || t === hourFmt || (typeof t === 'string' && (t.startsWith(hourFmt + ':') || t.includes("T" + hourFmt + ":"))));
        }

        if (hourIndex === -1) {
            return {
                hour: hourFmt,
                timeStr: `${hourFmt}:00`,
                score: null,
                bg: NO_DATA_BG,
                text: 'N/D',
                isMissing: true,
                wind: 0,
                gust: 0,
                rain: 0
            };
        }

        const wind = Math.round(weather.hourly.windspeed_10m?.[hourIndex] ?? weather.hourly.wind_speed_10m?.[hourIndex] ?? 0);
        const gust = Math.round(weather.hourly.windgusts_10m?.[hourIndex] ?? weather.hourly.gusts_10m?.[hourIndex] ?? wind);
        const cape = Math.round(weather.hourly.cape?.[hourIndex] ?? 0);
        const turbulence = parseFloat((weather.hourly.turbulence?.[hourIndex] ?? 0).toFixed(2));
        const rain = weather.hourly.precipitation?.[hourIndex] ?? weather.hourly.rain?.[hourIndex] ?? 0;
        const dir = Math.round(weather.hourly.winddirection_10m?.[hourIndex] ?? weather.hourly.wind_direction_10m?.[hourIndex] ?? 0);
        const thermalLift = weather.hourly.thermal_lift ? (weather.hourly.thermal_lift[hourIndex] || null) : null;

        const score = getFlyabilityScore(wind, gust, cape, turbulence, rain, dir, azimuth, isTakeoff, activeGlider, thermalLift, translator);

        return {
            hour: hourFmt,
            timeStr: `${hourFmt}:00`,
            score,
            bg: score.bg,
            text: score.text,
            wind,
            gust,
            rain,
            thermalLift
        };
    });
}

/**
 * Calculates a summarized daily overview array for a 7-day raw Open-Meteo payload.
 * 
 * @param {object} payload Open-Meteo daily and hourly dataset
 * @param {boolean} [isTakeoffOverride=true]
 * @param {number|null} [headingOverride=null]
 * @param {Function|null} [translator=null]
 * @returns {Array<object>}
 */
export function calculateWeekOverview(payload, isTakeoffOverride = true, headingOverride = null, translator = null) {
    if (!payload || !payload.daily || !Array.isArray(payload.daily.time) || !payload.hourly || !payload.hourly.time) {
        return [];
    }

    const days = [];
    const isTakeoff = isTakeoffOverride;
    const azimuth = headingOverride != null ? parseFloat(headingOverride) : 0;

    payload.daily.time.forEach((dateStr, dIdx) => {
        const srStr = payload.daily.sunrise?.[dIdx] ? payload.daily.sunrise[dIdx].substring(11, 16) : '06:00';
        const ssStr = payload.daily.sunset?.[dIdx] ? payload.daily.sunset[dIdx].substring(11, 16) : '20:00';

        const srHour = parseInt(srStr.split(':')[0], 10) || 6;
        const ssHour = parseInt(ssStr.split(':')[0], 10) || 20;

        let bestSeverity = 3; // 0=Green, 1=Yellow, 2=Red, 3=Black/No-fly
        let totalRain = 0;
        let sumCloudCover = 0;
        let hourCount = 0;

        for (let i = 0; i < payload.hourly.time.length; i++) {
            const hTime = payload.hourly.time[i];
            if (hTime && hTime.startsWith(dateStr)) {
                const hour = parseInt(hTime.substring(11, 13), 10);
                if (hour >= srHour && hour <= ssHour) {
                    const wind = Math.round(payload.hourly.windspeed_10m?.[i] || 0);
                    const gust = Math.round(payload.hourly.windgusts_10m?.[i] || wind);
                    const dir = Math.round(payload.hourly.winddirection_10m?.[i] || 0);
                    const cape = Math.round(payload.hourly.cape?.[i] || 0);
                    const rain = payload.hourly.precipitation?.[i] || 0;
                    const elev = Number(payload.elevation) || 0;

                    let baseSpeed = wind;
                    let baseDir = dir;
                    let topSpeed = wind;
                    let topDir = dir;

                    if (elev < 800) {
                        const w950 = payload.hourly.windspeed_950hPa?.[i];
                        const d950 = payload.hourly.winddirection_950hPa?.[i];
                        const w850 = payload.hourly.windspeed_850hPa?.[i];
                        const d850 = payload.hourly.winddirection_850hPa?.[i];

                        baseSpeed = w950 !== undefined ? w950 : wind;
                        baseDir = d950 !== undefined ? d950 : dir;
                        topSpeed = w850 !== undefined ? w850 : baseSpeed;
                        topDir = d850 !== undefined ? d850 : baseDir;
                    } else {
                        const w850 = payload.hourly.windspeed_850hPa?.[i];
                        const d850 = payload.hourly.winddirection_850hPa?.[i];
                        const w700 = payload.hourly.windspeed_700hPa?.[i];
                        const d700 = payload.hourly.winddirection_700hPa?.[i];

                        baseSpeed = w850 !== undefined ? w850 : wind;
                        baseDir = d850 !== undefined ? d850 : dir;
                        topSpeed = w700 !== undefined ? w700 : baseSpeed;
                        topDir = d700 !== undefined ? d700 : baseDir;
                    }

                    const shear = calculateVectorShear(baseSpeed, baseDir, topSpeed, topDir);
                    const turbulence = calculateTurbulenceEDR(wind, gust, cape, shear);

                    const score = getFlyabilityScore(wind, gust, cape, turbulence, rain, dir, azimuth, isTakeoff, null, null, translator);

                    if (score.severity < bestSeverity) {
                        bestSeverity = score.severity;
                    }

                    totalRain += rain;
                    sumCloudCover += (payload.hourly.cloudcover_low?.[i] || 0);
                    hourCount++;
                }
            }
        }

        let icon = 'fa-sun text-yellow-500';
        const avgCloud = hourCount > 0 ? (sumCloudCover / hourCount) : 0;

        if (totalRain > 2) {
            icon = 'fa-cloud-showers-heavy text-slate-400';
        } else if (totalRain > 0.1) {
            icon = 'fa-cloud-rain text-slate-400';
        } else if (avgCloud > 60) {
            icon = 'fa-cloud text-slate-400';
        } else if (avgCloud > 20) {
            icon = 'fa-cloud-sun text-slate-400';
        }

        let colorClass = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30';
        let textClass = 'text-emerald-700 dark:text-emerald-400';
        if (bestSeverity === 1) {
            colorClass = 'border-amber-400 bg-amber-50 dark:bg-amber-900/30';
            textClass = 'text-amber-700 dark:text-amber-400';
        } else if (bestSeverity === 2) {
            colorClass = 'border-red-500 bg-red-50 dark:bg-red-900/30';
            textClass = 'text-red-700 dark:text-red-400';
        } else if (bestSeverity === 3) {
            colorClass = 'border-slate-500 bg-slate-100 dark:bg-slate-800';
            textClass = 'text-slate-700 dark:text-slate-400';
        }

        const dateObj = new Date(dateStr);
        const dayLabel = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
        const formattedLabel = dayLabel ? dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1) : dateStr;

        days.push({
            dateStr,
            label: formattedLabel,
            bestSeverity,
            icon,
            colorClass,
            textClass
        });
    });

    return days;
}

/**
 * Calculates a detailed 7-day flyability summary for a given weather payload and location.
 * 
 * @param {object} weather Weather object with hourly arrays and meta
 * @param {object|null} [targetLocOverride=null]
 * @param {Function|null} [translator=null]
 * @returns {Array<object>}
 */
export function calculateDailyFlyabilitySummary(weather, targetLocOverride = null, translator = null, maxDays = 14) {
    if (!weather || !weather.hourly) return [];

    const times = weather.hourly.time || weather.hourly.rawTime;
    if (!times || !Array.isArray(times)) return [];

    let isTakeoff = true;
    if (targetLocOverride) {
        isTakeoff = (targetLocOverride.type === 'decollo' || targetLocOverride.type === 'takeoff');
    } else {
        isTakeoff = isTakeoffSite(null, weather.meta);
    }

    let azimuth = (weather.meta && weather.meta.takeoff_azimuth != null) ? parseFloat(weather.meta.takeoff_azimuth) : null;
    if (targetLocOverride && targetLocOverride.heading != null && !isNaN(parseFloat(targetLocOverride.heading))) {
        azimuth = parseFloat(targetLocOverride.heading);
    }

    const windspeedArr = weather.hourly.windspeed_10m || weather.hourly.wind_speed_10m || [];
    const gustsArr = weather.hourly.windgusts_10m || weather.hourly.gusts_10m || windspeedArr;
    const capeArr = weather.hourly.cape || [];
    const rainArr = weather.hourly.precipitation || [];
    const winddirArr = weather.hourly.winddirection_10m || weather.hourly.wind_direction_10m || [];
    const wind850Arr = weather.hourly.windspeed_850hPa || weather.hourly.windspeed_850hpa || [];

    const dateGroups = {};
    times.forEach((timeStr, idx) => {
        if (!timeStr) return;
        const dateStr = timeStr.split('T')[0];
        if (!dateGroups[dateStr]) dateGroups[dateStr] = [];
        dateGroups[dateStr].push(idx);
    });

    const dates = Object.keys(dateGroups).slice(0, maxDays);

    const summaries = dates.map(dateStr => {
        const indices = dateGroups[dateStr];
        let bestSeverity = 3;
        let validHoursCount = 0;
        let sumScore = 0;
        let maxWindowScore = -1;
        let bestWindowStart = null;
        let bestWindowEnd = null;

        const hourlyData = [];
        const limitingCounts = {};

        indices.forEach(i => {
            const timeStr = times[i];
            if (!timeStr) return;
            const timeParts = timeStr.split('T')[1];
            if (!timeParts) return;
            const hour = parseInt(timeParts.split(':')[0], 10);
            if (isNaN(hour)) return;

            // Active flying window: 10:00 to 18:00
            if (hour >= 10 && hour <= 18) {
                validHoursCount++;
                const wind = windspeedArr[i] || 0;
                const gust = gustsArr[i] || wind;
                const cape = capeArr[i] || 0;
                const rain = rainArr[i] || 0;
                const dir = winddirArr[i] || 0;
                const shear = (wind850Arr[i] != null) ? Math.abs(wind850Arr[i] - wind) : 0;
                const turbulence = calculateTurbulenceEDR(wind, gust, cape, shear);

                const scoreObj = getFlyabilityScore(wind, gust, cape, turbulence, rain, dir, azimuth, isTakeoff, null, null, translator);

                let hScore = 95;
                if (scoreObj.severity === 1) hScore = 72;
                else if (scoreObj.severity === 2) hScore = 40;
                else if (scoreObj.severity === 3) hScore = 10;

                if (scoreObj.severity <= 1 && cape > 300 && cape < 1200) {
                    hScore = Math.min(100, hScore + 5);
                }

                sumScore += hScore;
                hourlyData.push({ hour, score: hScore, severity: scoreObj.severity, text: scoreObj.text });

                if (scoreObj.severity < bestSeverity) {
                    bestSeverity = scoreObj.severity;
                }

                const mainLimiter = scoreObj.text;
                limitingCounts[mainLimiter] = (limitingCounts[mainLimiter] || 0) + 1;
            }
        });

        if (hourlyData.length >= 2) {
            for (let k = 0; k <= hourlyData.length - 2; k++) {
                const sub = hourlyData.slice(k, k + 3);
                const avgWindow = sub.reduce((acc, x) => acc + x.score, 0) / sub.length;
                if (avgWindow > maxWindowScore) {
                    maxWindowScore = avgWindow;
                    bestWindowStart = sub[0].hour;
                    bestWindowEnd = sub[sub.length - 1].hour + 1;
                }
            }
        }

        const avgScore = validHoursCount > 0 ? Math.round(sumScore / validHoursCount) : 0;

        let topLimiter = 'Vento Calmo';
        let maxCount = 0;
        for (const lim in limitingCounts) {
            if (limitingCounts[lim] > maxCount) {
                maxCount = limitingCounts[lim];
                topLimiter = lim;
            }
        }

        const dateObj = new Date(dateStr);
        const dayLabel = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
        const formattedLabel = dayLabel ? dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1) : dateStr;

        const bestWindowStr = (bestWindowStart != null && bestWindowEnd != null)
            ? `${bestWindowStart.toString().padStart(2, '0')}:00 - ${bestWindowEnd.toString().padStart(2, '0')}:00`
            : '12:00 - 16:00';

        // 4-Color Semantic Classification (Verde, Giallo, Rosso, Nero)
        let daySeverity = bestSeverity;
        if (bestSeverity === 0) {
            const hasSevereHour = hourlyData.some(h => h.severity === 3);
            if (hasSevereHour && avgScore < 60) {
                daySeverity = 1;
            }
        }

        let status = 'flyable';
        let statusLabel = 'Volabile';
        let statusIcon = '●';
        let color = 'var(--gm-status-flyable)';
        let bg = 'var(--gm-status-flyable-bg)';
        let badgeClass = 'gm-badge-flyable';

        if (daySeverity === 3 || (bestSeverity === 3 && avgScore < 30)) {
            status = 'severe';
            statusLabel = 'Severo';
            statusIcon = '⚡';
            color = 'var(--gm-status-severe)';
            bg = 'var(--gm-status-severe-bg)';
            badgeClass = 'gm-badge-severe';
        } else if (daySeverity === 2 || avgScore < 35) {
            status = 'unflyable';
            statusLabel = 'Chiuso';
            statusIcon = '✕';
            color = 'var(--gm-status-unflyable)';
            bg = 'var(--gm-status-unflyable-bg)';
            badgeClass = 'gm-badge-unflyable';
        } else if (daySeverity === 1 || avgScore < 70) {
            status = 'caution';
            statusLabel = 'Cautela';
            statusIcon = '▲';
            color = 'var(--gm-status-caution)';
            bg = 'var(--gm-status-caution-bg)';
            badgeClass = 'gm-badge-caution';
        }

        return {
            dateStr,
            label: formattedLabel,
            score: avgScore,
            bestSeverity,
            severity: (status === 'severe' ? 3 : status === 'unflyable' ? 2 : status === 'caution' ? 1 : 0),
            status,
            statusLabel,
            statusIcon,
            color,
            bg,
            badgeClass,
            bestWindow: bestWindowStr,
            limitingFactor: topLimiter,
            isBestDay: false
        };
    });

    if (summaries.length > 0) {
        let maxScore = -1;
        let bestIndex = 0;
        summaries.forEach((s, idx) => {
            if (s.score > maxScore) {
                maxScore = s.score;
                bestIndex = idx;
            }
        });
        if (maxScore > 35) {
            summaries[bestIndex].isBestDay = true;
        }
    }

    return summaries;
}
