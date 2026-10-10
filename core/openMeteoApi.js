/**
 * GlideMind - Headless Open-Meteo API Client & Meteorological Ingestion Engine
 * 
 * Capabilities:
 * 1. Open-Meteo forecast URL builder (surface variables + isobaric pressure levels 1000-500 hPa)
 * 2. Pluggable In-Memory LRU/TTL Cache with stale-while-revalidate and offline fallback support
 * 3. Network fetcher with AbortController timeout, exponential backoff on HTTP 429, and regional model fallback
 * 4. Deterministic synthetic weather generator for offline simulations and unit testing
 * 5. Meteorological payload enrichment (turbulence EDR, Deardorff thermal lift, dew points)
 * 6. Location search and rate-limited reverse geocoding
 * 
 * ZERO DOM DEPENDENCIES: 100% pure Node.js / browser headless compatible.
 */

import { calculateDewPoint } from './soundingsMath.js';
import {
    calculateVectorShear,
    calculateTurbulenceEDR,
    calculateThermalLift,
    calculateWeekOverview,
    calculateDailyFlyabilitySummary
} from './flyability.js';

// Base API Endpoints
export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

// Caching and Timing Defaults
export const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_STALE_WEATHER_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_REQUEST_TIMEOUT_MS = 5000; // 5 seconds

// Supported Atmospheric Models
export const SUPPORTED_WEATHER_MODELS = Object.freeze([
    'best_match',
    'ecmwf_ifs025',
    'icon_seamless',
    'icon_eu',
    'icon_d2',
    'gfs_seamless',
    'arome_france',
    'meteofrance_seamless'
]);

export const WEATHER_MODELS_METADATA = Object.freeze({
    best_match: {
        id: 'best_match',
        name: 'Auto Best Match (DWD/ECMWF)',
        maxHorizonDays: 7,
        resolutionKm: 2.2,
        description: 'Automatic optimal model selection based on geographic coordinate resolution.'
    },
    ecmwf_ifs025: {
        id: 'ecmwf_ifs025',
        name: 'ECMWF IFS (0.25°)',
        maxHorizonDays: 10,
        resolutionKm: 25.0,
        description: 'Global benchmark model for synoptic medium-range atmospheric trends.'
    },
    icon_seamless: {
        id: 'icon_seamless',
        name: 'DWD ICON Seamless',
        maxHorizonDays: 7,
        resolutionKm: 7.0,
        description: 'German Weather Service high-resolution global and regional blend.'
    },
    icon_eu: {
        id: 'icon_eu',
        name: 'DWD ICON-EU',
        maxHorizonDays: 5,
        resolutionKm: 6.5,
        description: 'European domain high-resolution forecast with alpine terrain resolution.'
    },
    icon_d2: {
        id: 'icon_d2',
        name: 'DWD ICON-D2',
        maxHorizonDays: 2,
        resolutionKm: 2.2,
        description: 'Convection-permitting high-resolution model for Central Europe.'
    },
    gfs_seamless: {
        id: 'gfs_seamless',
        name: 'NOAA GFS Seamless',
        maxHorizonDays: 16,
        resolutionKm: 22.0,
        description: 'US NOAA global numerical prediction model for long-range outlook.'
    },
    arome_france: {
        id: 'arome_france',
        name: 'Météo-France AROME',
        maxHorizonDays: 2,
        resolutionKm: 1.3,
        description: 'Ultra-high resolution convective model for France and Western Alps.'
    },
    meteofrance_seamless: {
        id: 'meteofrance_seamless',
        name: 'Météo-France Seamless',
        maxHorizonDays: 4,
        resolutionKm: 2.5,
        description: 'Blended high-resolution model for Western Europe.'
    }
});

// Standard Atmospheric Pressure Levels for Soundings / Shear (hPa)
export const STANDARD_PRESSURE_LEVELS_HPA = Object.freeze([
    1000, 975, 950, 925, 900, 850, 800, 700, 600, 500
]);

// Default Surface Variables for Paragliding Flyability
export const DEFAULT_HOURLY_SURFACE_VARS = Object.freeze([
    'temperature_2m',
    'dewpoint_2m',
    'pressure_msl',
    'surface_pressure',
    'cloudcover_low',
    'cloudcover_mid',
    'cloudcover_high',
    'windspeed_10m',
    'winddirection_10m',
    'windgusts_10m',
    'precipitation',
    'precipitation_probability',
    'cape',
    'shortwave_radiation_instant',
    'boundary_layer_height'
]);

export const DEFAULT_DAILY_VARS = Object.freeze([
    'sunrise',
    'sunset'
]);

/**
 * Pluggable In-Memory LRU/TTL Cache.
 * Zero browser API requirements, suitable for Node.js runtimes and memory-safe caching.
 */
export class InMemoryCache {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxEntries=100] Maximum entries to retain
     * @param {number} [options.defaultTtlMs=1800000] Default TTL in ms (30 mins)
     */
    constructor({ maxEntries = 100, defaultTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
        this.maxEntries = Math.max(1, Number(maxEntries) || 100);
        this.defaultTtlMs = Math.max(0, Number(defaultTtlMs) || DEFAULT_CACHE_TTL_MS);
        this._store = new Map();
    }

    /**
     * Retrieves an entry if present and not expired.
     * @param {string} key
     * @returns {any|undefined} Cached value or undefined
     */
    get(key) {
        if (!this._store.has(key)) return undefined;
        const entry = this._store.get(key);
        const now = Date.now();
        if (entry.expiresAt != null && now > entry.expiresAt) {
            this._store.delete(key);
            return undefined;
        }
        // Move to end of Map to maintain LRU order
        this._store.delete(key);
        this._store.set(key, entry);
        return entry.value;
    }

    /**
     * Retrieves an entry including metadata (timestamp, age, expiration, stale status).
     * @param {string} key
     * @returns {{ value: any, timestamp: number, expiresAt: number, isStale: boolean, ageMs: number } | null}
     */
    getEntry(key) {
        if (!this._store.has(key)) return null;
        const entry = this._store.get(key);
        const now = Date.now();
        const ageMs = now - entry.timestamp;
        const isStale = entry.expiresAt != null && now > entry.expiresAt;
        return {
            value: entry.value,
            timestamp: entry.timestamp,
            expiresAt: entry.expiresAt,
            isStale,
            ageMs
        };
    }

    /**
     * Stores a key-value pair with TTL.
     * @param {string} key
     * @param {any} value
     * @param {number} [ttlMs] Custom TTL in ms
     */
    set(key, value, ttlMs = this.defaultTtlMs) {
        const now = Date.now();
        const effectiveTtl = (ttlMs != null && !isNaN(ttlMs) && ttlMs > 0) ? ttlMs : this.defaultTtlMs;
        const expiresAt = now + effectiveTtl;

        if (this._store.has(key)) {
            this._store.delete(key);
        } else if (this._store.size >= this.maxEntries) {
            // Evict oldest entry (first item in Map iterator)
            const oldestKey = this._store.keys().next().value;
            if (oldestKey !== undefined) {
                this._store.delete(oldestKey);
            }
        }

        this._store.set(key, {
            value,
            timestamp: now,
            expiresAt
        });
    }

    /**
     * Checks if key exists and has not expired.
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== undefined;
    }

    /**
     * Deletes a specific key.
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
        return this._store.delete(key);
    }

    /**
     * Clears all cached entries.
     */
    clear() {
        this._store.clear();
    }

    /**
     * Removes all expired entries from the cache.
     * @returns {number} Number of evicted entries
     */
    pruneExpired() {
        const now = Date.now();
        let evicted = 0;
        for (const [key, entry] of this._store.entries()) {
            if (entry.expiresAt != null && now > entry.expiresAt) {
                this._store.delete(key);
                evicted++;
            }
        }
        return evicted;
    }

    /**
     * Returns the total count of stored items (including potentially stale unpruned items).
     * @returns {number}
     */
    get size() {
        return this._store.size;
    }

    /**
     * Exports a serializable JSON-friendly dump of stored entries.
     * @returns {Record<string, { value: any, timestamp: number, expiresAt: number }>}
     */
    toJSON() {
        const out = {};
        for (const [k, v] of this._store.entries()) {
            out[k] = v;
        }
        return out;
    }

    /**
     * Imports entries from a previously serialized dump.
     * @param {Record<string, { value: any, timestamp: number, expiresAt: number }>} dump
     */
    fromJSON(dump) {
        if (!dump || typeof dump !== 'object') return;
        const now = Date.now();
        for (const [k, entry] of Object.entries(dump)) {
            if (entry && entry.value !== undefined && entry.timestamp) {
                if (!entry.expiresAt || entry.expiresAt > now) {
                    this.set(k, entry.value, entry.expiresAt ? (entry.expiresAt - entry.timestamp) : undefined);
                }
            }
        }
    }
}

// Default global in-memory cache singleton
export const defaultWeatherCache = new InMemoryCache();

/**
 * Generates a normalized cache key for a given spot coordinates, target date, and weather model.
 * 
 * @param {number|string} lat
 * @param {number|string} lon
 * @param {string} targetDate YYYY-MM-DD
 * @param {string} [modelKey='best_match']
 * @returns {string} Normalized cache key
 */
export function generateWeatherCacheKey(lat, lon, targetDate, modelKey = 'best_match') {
    const nLat = Number(lat);
    const nLon = Number(lon);
    const latStr = !isNaN(nLat) ? nLat.toFixed(3) : String(lat);
    const lonStr = !isNaN(nLon) ? nLon.toFixed(3) : String(lon);
    const model = (modelKey && SUPPORTED_WEATHER_MODELS.includes(modelKey)) ? modelKey : 'best_match';
    return `glidemind_weather_${latStr}_${lonStr}_${targetDate}_${model}`;
}

/**
 * Normalizes coordinates from various input structures:
 * - { latitude, longitude }
 * - { lat, lng } or { lat, lon }
 * - [lat, lon]
 * 
 * @param {any} coords
 * @returns {{ lat: number, lon: number, elev: number|null }}
 */
export function normalizeCoordinates(coords) {
    if (!coords) throw new Error('Coordinate input is null or undefined.');
    let lat, lon, elev = null;

    if (typeof coords === 'string') {
        const parts = coords.split(',').map(s => Number(s.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            lat = parts[0];
            lon = parts[1];
            if (parts.length > 2 && !isNaN(parts[2])) elev = parts[2];
        }
    } else if (Array.isArray(coords)) {
        lat = Number(coords[0]);
        lon = Number(coords[1]);
        if (coords.length > 2) elev = Number(coords[2]);
    } else if (typeof coords === 'object') {
        lat = Number(coords.latitude ?? coords.lat);
        lon = Number(coords.longitude ?? coords.lon ?? coords.lng);
        elev = coords.elevation != null ? Number(coords.elevation) : null;
    }

    if (isNaN(lat) || lat < -90 || lat > 90) {
        throw new Error(`Invalid latitude value: ${lat}. Must be between -90 and 90.`);
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
        throw new Error(`Invalid longitude value: ${lon}. Must be between -180 and 180.`);
    }

    return { lat, lon, elev };
}

/**
 * Builds the list of hourly parameter strings requested from Open-Meteo.
 * Combines surface paragliding metrics with isobaric sounding levels (1000hPa down to 500hPa).
 * 
 * @param {Object} [options]
 * @param {boolean} [options.includeSounding=true] Include atmospheric pressure levels
 * @param {number[]} [options.pressureLevels=STANDARD_PRESSURE_LEVELS_HPA] Custom pressure levels
 * @param {string[]} [options.customSurfaceVars] Custom surface variables to request
 * @returns {string[]} Combined hourly variable names
 */
export function buildHourlyVariablesList(options = {}) {
    const surfaceVars = Array.isArray(options.customSurfaceVars) && options.customSurfaceVars.length > 0
        ? [...options.customSurfaceVars]
        : [...DEFAULT_HOURLY_SURFACE_VARS];

    const includeSounding = options.includeSounding !== false;
    if (!includeSounding) {
        return surfaceVars;
    }

    const levels = Array.isArray(options.pressureLevels) && options.pressureLevels.length > 0
        ? options.pressureLevels
        : STANDARD_PRESSURE_LEVELS_HPA;

    levels.forEach(hpa => {
        surfaceVars.push(`temperature_${hpa}hPa`);
        surfaceVars.push(`relative_humidity_${hpa}hPa`);
        surfaceVars.push(`geopotential_height_${hpa}hPa`);

        // Vertical wind shear probe levels: 950hPa (~500m), 850hPa (~1500m), 700hPa (~3000m)
        if (hpa === 950 || hpa === 850 || hpa === 700) {
            surfaceVars.push(`windspeed_${hpa}hPa`);
            surfaceVars.push(`winddirection_${hpa}hPa`);
        }
    });

    return surfaceVars;
}

/**
 * Builds an Open-Meteo Forecast API URL deterministically based on coordinates and parameters.
 * 
 * @param {Object|Array} coords Geographic coordinates
 * @param {Object} [options] Query configuration
 * @param {string} [options.targetDate] Specific target date (YYYY-MM-DD)
 * @param {string} [options.startDate] Explicit start date (YYYY-MM-DD)
 * @param {string} [options.endDate] Explicit end date (YYYY-MM-DD)
 * @param {number} [options.forecastDays=7] Number of forecast days (1 to 16)
 * @param {string} [options.weatherModel='best_match'] Atmospheric numerical model
 * @param {string} [options.timezone='auto'] Timezone string
 * @param {boolean} [options.includeSounding=true] Whether to include isobaric pressure levels
 * @param {string[]} [options.hourly] Explicit override of hourly variables
 * @param {string[]} [options.daily] Daily variables (defaults to sunrise,sunset)
 * @param {string} [options.baseUrl=OPEN_METEO_FORECAST_URL] Base forecast endpoint URL
 * @returns {URL} Constructed URL object
 */
export function buildForecastUrl(coords, options = {}) {
    const { lat, lon } = normalizeCoordinates(coords);
    const baseUrl = options.baseUrl || OPEN_METEO_FORECAST_URL;
    const url = new URL(baseUrl);

    url.searchParams.append('latitude', lat.toFixed(4));
    url.searchParams.append('longitude', lon.toFixed(4));
    url.searchParams.append('timezone', options.timezone || 'auto');

    // Date range resolution
    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = options.targetDate;

    if (options.startDate && options.endDate) {
        url.searchParams.append('start_date', options.startDate);
        url.searchParams.append('end_date', options.endDate);
    } else if (targetDate) {
        if (targetDate >= todayStr) {
            // Future or today: fetch from today up to targetDate + horizon (capped at 16)
            url.searchParams.append('start_date', todayStr);
            const todayObj = new Date(todayStr);
            const targetObj = new Date(targetDate);
            const diffDays = Math.max(0, Math.round((targetObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24)));
            const maxHorizon = (options.weatherModel && WEATHER_MODELS_METADATA[options.weatherModel]?.maxHorizonDays) || 7;
            const daysToFetch = Math.min(16, Math.max(diffDays + 1, maxHorizon));
            const endTarget = new Date(todayObj);
            endTarget.setDate(endTarget.getDate() + daysToFetch);
            url.searchParams.append('end_date', endTarget.toISOString().split('T')[0]);
        } else {
            // Historical date: narrow 2-day slice around target
            url.searchParams.append('start_date', targetDate);
            const pastEnd = new Date(targetDate);
            pastEnd.setDate(pastEnd.getDate() + 1);
            url.searchParams.append('end_date', pastEnd.toISOString().split('T')[0]);
        }
    } else {
        const forecastDays = Math.min(16, Math.max(1, Number(options.forecastDays) || 7));
        url.searchParams.append('forecast_days', String(forecastDays));
    }

    // Hourly variables
    const hourlyVars = Array.isArray(options.hourly) && options.hourly.length > 0
        ? options.hourly
        : buildHourlyVariablesList({ includeSounding: options.includeSounding !== false });

    url.searchParams.append('hourly', hourlyVars.join(','));

    // Daily variables
    const dailyVars = Array.isArray(options.daily) && options.daily.length > 0
        ? options.daily
        : DEFAULT_DAILY_VARS;

    url.searchParams.append('daily', dailyVars.join(','));

    // Model selection
    const activeModel = options.weatherModel;
    if (activeModel && activeModel !== 'best_match' && SUPPORTED_WEATHER_MODELS.includes(activeModel)) {
        url.searchParams.append('models', activeModel);
    }

    return url;
}

/**
 * Builds the URL for Open-Meteo Geocoding search API.
 * 
 * @param {string} query Search string (e.g. "Monte Cornizzolo")
 * @param {Object} [options]
 * @param {number} [options.count=10]
 * @param {string} [options.language='it']
 * @returns {URL}
 */
export function buildGeocodingUrl(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Geocoding search query cannot be empty.');
    }
    const url = new URL(OPEN_METEO_GEOCODING_URL);
    url.searchParams.append('name', query.trim());
    url.searchParams.append('count', String(Math.min(50, Math.max(1, Number(options.count) || 10))));
    url.searchParams.append('language', options.language || 'it');
    url.searchParams.append('format', 'json');
    return url;
}

/**
 * Executes a network fetch with an AbortController timeout.
 * Prevents hanging indefinitely on degraded mobile/outdoor connections.
 * 
 * @param {string|URL} url
 * @param {RequestInit} [options={}]
 * @param {number} [timeoutMs=DEFAULT_REQUEST_TIMEOUT_MS]
 * @param {Function} [fetchFn=globalThis.fetch]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, fetchFn = globalThis.fetch) {
    if (typeof fetchFn !== 'function') {
        throw new Error('A valid fetch implementation must be available in globalThis or injected.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchFn(url.toString(), {
            ...options,
            signal: controller.signal
        });
        return response;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeoutMs}ms: ${url.toString()}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Internal sleep helper for rate limiter backoff.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a deterministic synthetic weather dataset for offline simulations and testing.
 * Accurately models paragliding diurnal cycles (morning calm -> midday convection -> evening restitution).
 * 
 * @param {Object|Array} coords Geographic coordinates
 * @param {Object} [options]
 * @param {string} [options.targetDate] Reference date (default: today)
 * @param {number} [options.days=3] Number of days to generate (1 to 7)
 * @param {string} [options.weatherModel='best_match']
 * @param {number} [options.takeoffAzimuth=180]
 * @param {number} [options.slopeDeg=18]
 * @returns {Object} Complete synthetic Open-Meteo JSON payload
 */
export function generateSyntheticWeather(coords, options = {}) {
    const { lat, lon, elev } = normalizeCoordinates(coords);
    const targetDate = options.targetDate || new Date().toISOString().split('T')[0];
    const days = Math.min(16, Math.max(1, Number(options.days) || 3));
    const effectiveElev = elev != null ? elev : 900;

    const times = [];
    const tempArr = [];
    const dewArr = [];
    const windArr = [];
    const gustArr = [];
    const dirArr = [];
    const capeArr = [];
    const rainArr = [];
    const radArr = [];
    const blhArr = [];
    const pressMslArr = [];
    const surfPressArr = [];

    const baseDate = new Date(`${targetDate}T00:00:00Z`);

    // Generate hourly timeline
    const totalHours = days * 24;
    for (let h = 0; h < totalHours; h++) {
        const currentDate = new Date(baseDate.getTime() + (h * 3600 * 1000));
        const isoTime = currentDate.toISOString().substring(0, 19);
        times.push(isoTime);

        const hourOfDay = h % 24;
        const dayIndex = Math.floor(h / 24);

        let wind = 10;
        let gust = 14;
        let cape = 200;
        let rain = 0;
        let temp = 20;
        let dir = 180;
        let dew = 12.0;

        if (hourOfDay >= 0 && hourOfDay <= 5) {
            // Night: calm, stable catabatic flow
            wind = 5;
            gust = 7;
            cape = 0;
            temp = 14;
            dir = 360;
            dew = 11.5;
        } else if (hourOfDay >= 6 && hourOfDay <= 8) {
            // Early Morning: calm, optimal student window (Green)
            wind = 8;
            gust = 11;
            cape = 80;
            temp = 17;
            dir = 180;
            dew = 11.8;
        } else if (hourOfDay >= 9 && hourOfDay <= 11) {
            // Late Morning: active thermals developing (Yellow)
            wind = 14;
            gust = 20;
            cape = 450;
            temp = 22;
            dir = 185;
            dew = 12.2;
        } else if (hourOfDay >= 12 && hourOfDay <= 14) {
            // Midday: strong thermals, gusty (Peak flying)
            wind = 18;
            gust = 26;
            cape = 950;
            temp = 26;
            dir = 190;
            dew = 13.0;
        } else if (hourOfDay >= 15 && hourOfDay <= 17) {
            // Late Afternoon: intense convective activity
            wind = 22;
            gust = 32;
            cape = 1100;
            temp = 24;
            dir = 200;
            dew = 13.5;
        } else if (hourOfDay >= 18 && hourOfDay <= 20) {
            // Evening: smooth evening restitution (Green)
            wind = 9;
            gust = 12;
            cape = 120;
            temp = 21;
            dir = 180;
            dew = 12.5;
        } else {
            // Night
            wind = 6;
            gust = 8;
            cape = 0;
            temp = 16;
            dir = 350;
            dew = 11.8;
        }

        // Apply realistic deterministic multi-day synoptic progression for dayIndex > 0
        if (dayIndex > 0) {
            const dayCycle = dayIndex % 6;
            if (dayCycle === 1) {
                // Caution day (Yellow) - slightly gusty & higher cape
                if (hourOfDay >= 10 && hourOfDay <= 17) {
                    wind = Math.round(wind * 1.15);
                    gust = Math.round(gust * 1.25);
                    cape = Math.min(1400, Math.round(cape * 1.3));
                }
            } else if (dayCycle === 2) {
                // Unflyable day (Red) - rain & crosswind
                if (hourOfDay >= 8 && hourOfDay <= 19) {
                    rain = 2.4;
                    wind = Math.round(wind * 1.4);
                    gust = Math.round(gust * 1.5);
                    dir = (dir + 90) % 360;
                }
            } else if (dayCycle === 3) {
                // Severe hazard day (Black) - severe storm & violent gusts
                if (hourOfDay >= 11 && hourOfDay <= 18) {
                    cape = 1800;
                    wind = 34;
                    gust = 48;
                    rain = 5.2;
                }
            } else if (dayCycle === 4) {
                // Optimal calm soaring day (Green)
                wind = Math.max(6, Math.round(wind * 0.75));
                gust = Math.max(9, Math.round(gust * 0.75));
                cape = Math.min(400, cape);
                rain = 0;
            } else if (dayCycle === 5) {
                // Caution day (Yellow) - moderate wind
                if (hourOfDay >= 11 && hourOfDay <= 17) {
                    wind = Math.round(wind * 1.2);
                    gust = Math.round(gust * 1.25);
                }
            }
        }

        // Diurnal solar radiation and boundary layer height
        let rad = 0;
        let blh = 50;
        if (hourOfDay >= 7 && hourOfDay <= 19) {
            const solarFraction = Math.sin(((hourOfDay - 7) / 12) * Math.PI);
            rad = Math.max(0, Math.round(solarFraction * 720));
            blh = Math.max(50, Math.round(100 + (solarFraction * 1400)));
        }

        tempArr.push(temp);
        dewArr.push(dew);
        windArr.push(wind);
        gustArr.push(gust);
        dirArr.push(dir);
        capeArr.push(cape);
        rainArr.push(rain);
        radArr.push(rad);
        blhArr.push(blh);
        pressMslArr.push(1015.0);
        surfPressArr.push(Math.round(1015.0 * Math.exp(-effectiveElev / 8434)));
    }

    const hourly = {
        time: times,
        temperature_2m: tempArr,
        dewpoint_2m: dewArr,
        pressure_msl: pressMslArr,
        surface_pressure: surfPressArr,
        cloudcover_low: new Array(totalHours).fill(15),
        cloudcover_mid: new Array(totalHours).fill(10),
        cloudcover_high: new Array(totalHours).fill(20),
        windspeed_10m: windArr,
        winddirection_10m: dirArr,
        windgusts_10m: gustArr,
        precipitation: rainArr,
        precipitation_probability: rainArr.map(r => r > 0 ? 80 : 0),
        cape: capeArr,
        shortwave_radiation_instant: radArr,
        boundary_layer_height: blhArr
    };

    // Synthesize pressure levels (1000hPa down to 500hPa)
    STANDARD_PRESSURE_LEVELS_HPA.forEach(hpa => {
        // Standard atmospheric lapse rate ~ 0.65°C / 100m
        const deltaZ = (1000 - hpa) * 8.5; // Approx geopotential height delta
        hourly[`temperature_${hpa}hPa`] = tempArr.map(t => Math.round((t - (deltaZ * 0.0065)) * 10) / 10);
        hourly[`relative_humidity_${hpa}hPa`] = new Array(totalHours).fill(55);
        hourly[`geopotential_height_${hpa}hPa`] = new Array(totalHours).fill(Math.round(deltaZ));

        if (hpa === 950 || hpa === 850 || hpa === 700) {
            hourly[`windspeed_${hpa}hPa`] = windArr.map(w => Math.round((w * (1 + (1000 - hpa) / 2000)) * 10) / 10);
            hourly[`winddirection_${hpa}hPa`] = dirArr.map(d => (d + 10) % 360);
        }
    });

    // Daily sunrise/sunset timestamps
    const dailyTimes = [];
    const sunriseTimes = [];
    const sunsetTimes = [];
    for (let d = 0; d < days; d++) {
        const dObj = new Date(baseDate.getTime() + (d * 24 * 3600 * 1000));
        const dStr = dObj.toISOString().split('T')[0];
        dailyTimes.push(dStr);
        sunriseTimes.push(`${dStr}T06:15:00`);
        sunsetTimes.push(`${dStr}T20:30:00`);
    }

    return {
        latitude: lat,
        longitude: lon,
        elevation: effectiveElev,
        utc_offset_seconds: 7200,
        timezone: 'Europe/Rome',
        timezone_abbreviation: 'CEST',
        weather_model: options.weatherModel || 'best_match',
        takeoff_azimuth: options.takeoffAzimuth != null ? Number(options.takeoffAzimuth) : 180,
        slope_deg: options.slopeDeg != null ? Number(options.slopeDeg) : 18,
        slope_pct: Math.round(Math.tan((options.slopeDeg || 18) * Math.PI / 180) * 100),
        daily: {
            time: dailyTimes,
            sunrise: sunriseTimes,
            sunset: sunsetTimes
        },
        hourly,
        _isSynthetic: true,
        _source: 'synthetic'
    };
}

/**
 * Enriches a raw Open-Meteo weather payload with paragliding-specific metrics:
 * - Identifies diurnal daylight hours (sunrise to sunset)
 * - Computes vector wind shear between boundary layer and upper air
 * - Computes Eddy Dissipation Rate (EDR) synthetic turbulence
 * - Computes Deardorff convective scaling for thermal lift & climb rate
 * - Calculates dew points for sounding pressure levels
 * - Annotates cache age and source metadata
 * 
 * @param {Object} rawPayload Raw parsed Open-Meteo JSON
 * @param {string} targetDate Target date (YYYY-MM-DD)
 * @param {number} [fetchTimestamp] Timestamp when data was retrieved
 * @param {Object} [options]
 * @param {number} [options.customHeading] Override takeoff heading
 * @returns {Object} Enriched meteorological payload
 */
export function enrichWeatherData(rawPayload, targetDate, fetchTimestamp = Date.now(), options = {}) {
    if (!rawPayload || !rawPayload.hourly || !Array.isArray(rawPayload.hourly.time)) {
        throw new Error('Invalid raw weather payload: missing hourly time array.');
    }

    const payload = JSON.parse(JSON.stringify(rawPayload));
    const times = payload.hourly.time;
    const targetPrefix = targetDate;

    if (options.customHeading != null && !isNaN(Number(options.customHeading))) {
        payload.takeoff_azimuth = Number(options.customHeading);
    }

    // Extract daylight bounds from daily data
    let dailySunrise = '06:00';
    let dailySunset = '20:00';
    let sunriseHour = 6;
    let sunsetHour = 20;

    if (payload.daily && Array.isArray(payload.daily.time)) {
        let dIdx = payload.daily.time.indexOf(targetPrefix);
        if (dIdx === -1 && payload.daily.time.length > 0) dIdx = 0;

        if (dIdx !== -1) {
            if (payload.daily.sunrise && payload.daily.sunrise[dIdx]) {
                const sStr = String(payload.daily.sunrise[dIdx]);
                dailySunrise = sStr.includes('T') ? sStr.substring(11, 16) : sStr;
                const parsed = parseInt(dailySunrise.split(':')[0], 10);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) sunriseHour = parsed;
            }
            if (payload.daily.sunset && payload.daily.sunset[dIdx]) {
                const sStr = String(payload.daily.sunset[dIdx]);
                dailySunset = sStr.includes('T') ? sStr.substring(11, 16) : sStr;
                const parsed = parseInt(dailySunset.split(':')[0], 10);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) sunsetHour = parsed;
            }
        }
    }

    // Identify daylight indices for target date
    const relevantIndices = [];
    const allTargetIndices = [];

    times.forEach((t, index) => {
        if (typeof t === 'string' && t.startsWith(targetPrefix)) {
            allTargetIndices.push(index);
            const hour = parseInt(t.substring(11, 13), 10);
            if (!isNaN(hour) && hour >= sunriseHour && hour <= sunsetHour) {
                relevantIndices.push(index);
            }
        }
    });

    const activeIndices = relevantIndices.length > 0 ? relevantIndices : allTargetIndices;
    const elev = Number(payload.elevation) || 0;

    // Compute Turbulence EDR & Vector Shear
    const turbulence = activeIndices.map(i => {
        const wind = payload.hourly.windspeed_10m ? (payload.hourly.windspeed_10m[i] || 0) : 0;
        const windDir = payload.hourly.winddirection_10m ? payload.hourly.winddirection_10m[i] : null;
        const gust = payload.hourly.windgusts_10m ? (payload.hourly.windgusts_10m[i] || wind) : wind;
        const cape = payload.hourly.cape ? (payload.hourly.cape[i] || 0) : 0;

        let baseSpeed = wind;
        let baseDir = windDir;
        let topSpeed = wind;
        let topDir = windDir;

        if (elev < 800) {
            // Low altitude (<800m): surface / 950hPa vs 850hPa (~1500m)
            const w950 = payload.hourly.windspeed_950hPa ? payload.hourly.windspeed_950hPa[i] : undefined;
            const d950 = payload.hourly.winddirection_950hPa ? payload.hourly.winddirection_950hPa[i] : undefined;
            const w850 = payload.hourly.windspeed_850hPa ? payload.hourly.windspeed_850hPa[i] : undefined;
            const d850 = payload.hourly.winddirection_850hPa ? payload.hourly.winddirection_850hPa[i] : undefined;

            baseSpeed = (w950 !== undefined) ? w950 : wind;
            baseDir = (d950 !== undefined) ? d950 : windDir;
            topSpeed = (w850 !== undefined) ? w850 : baseSpeed;
            topDir = (d850 !== undefined) ? d850 : baseDir;
        } else {
            // Alpine / Mountain (>=800m): 850hPa (~1500m) vs 700hPa (~3000m ridge flow)
            const w850 = payload.hourly.windspeed_850hPa ? payload.hourly.windspeed_850hPa[i] : undefined;
            const d850 = payload.hourly.winddirection_850hPa ? payload.hourly.winddirection_850hPa[i] : undefined;
            const w700 = payload.hourly.windspeed_700hPa ? payload.hourly.windspeed_700hPa[i] : undefined;
            const d700 = payload.hourly.winddirection_700hPa ? payload.hourly.winddirection_700hPa[i] : undefined;

            baseSpeed = (w850 !== undefined) ? w850 : wind;
            baseDir = (d850 !== undefined) ? d850 : windDir;
            topSpeed = (w700 !== undefined) ? w700 : baseSpeed;
            topDir = (d700 !== undefined) ? d700 : baseDir;
        }

        const shear = calculateVectorShear(baseSpeed, baseDir, topSpeed, topDir);
        return calculateTurbulenceEDR(wind, gust, cape, shear);
    });

    // Compute Deardorff Thermal Lift & Boundary Layer Parameters
    const thermalLift = activeIndices.map(i => {
        let rad = payload.hourly.shortwave_radiation_instant ? (payload.hourly.shortwave_radiation_instant[i] ?? 0) : 0;
        if (rad === 0 && payload.hourly.shortwave_radiation && payload.hourly.shortwave_radiation[i] != null) {
            rad = payload.hourly.shortwave_radiation[i];
        }
        const blh = payload.hourly.boundary_layer_height ? (payload.hourly.boundary_layer_height[i] ?? 0) : 0;
        const wind = payload.hourly.windspeed_10m ? (payload.hourly.windspeed_10m[i] ?? 0) : 0;
        const rain = payload.hourly.precipitation ? (payload.hourly.precipitation[i] ?? 0) : 0;

        return calculateThermalLift(rad, blh, wind, rain, elev);
    });

    // Calculate Dew Point for isobaric pressure levels if present
    STANDARD_PRESSURE_LEVELS_HPA.forEach(hpa => {
        const tempKey = `temperature_${hpa}hPa`;
        const rhKey = `relative_humidity_${hpa}hPa`;
        const dewKey = `dewpoint_${hpa}hPa`;

        if (Array.isArray(payload.hourly[tempKey]) && Array.isArray(payload.hourly[rhKey])) {
            payload.hourly[dewKey] = payload.hourly[tempKey].map((t, idx) => {
                const rh = payload.hourly[rhKey][idx];
                return calculateDewPoint(t, rh);
            });
        }
    });

    const now = Date.now();
    const ageMs = now - fetchTimestamp;

    payload.targetDate = targetDate;
    payload.fetchTimestamp = fetchTimestamp;
    payload.cacheAgeMs = ageMs;
    payload.isStale = ageMs >= DEFAULT_CACHE_TTL_MS;
    payload.isParticularlyOld = ageMs > MAX_STALE_WEATHER_AGE_MS;
    payload.daylight = {
        sunrise: dailySunrise,
        sunset: dailySunset,
        sunriseHour,
        sunsetHour,
        indices: activeIndices
    };
    payload.enrichedMetrics = {
        turbulence,
        thermalLift
    };
    payload.hasThermalData = Array.isArray(payload.hourly.shortwave_radiation_instant) ||
        Array.isArray(payload.hourly.shortwave_radiation);

    return payload;
}

/**
 * Searches and retrieves cached weather data synchronously or returns null.
 * Allows 0ms optimistic UI rendering on startup or cached spot selection.
 * 
 * @param {Object|Array} coords
 * @param {string} targetDate YYYY-MM-DD
 * @param {Object} [options]
 * @param {InMemoryCache} [options.cache=defaultWeatherCache]
 * @param {string} [options.weatherModel='best_match']
 * @param {number} [options.customHeading=null]
 * @returns {Object|null}
 */
export function getCachedWeatherData(coords, targetDate, options = {}) {
    if (!coords || !targetDate) return null;
    const { lat, lon } = normalizeCoordinates(coords);
    const cache = options.cache || defaultWeatherCache;
    const model = options.weatherModel || 'best_match';

    const exactKey = generateWeatherCacheKey(lat, lon, targetDate, model);
    const entry = cache.getEntry(exactKey);

    if (entry && entry.value) {
        const payload = JSON.parse(JSON.stringify(entry.value));
        const enriched = enrichWeatherData(payload, targetDate, entry.timestamp, options);
        enriched.isFromCache = true;
        enriched.cacheAgeMs = entry.ageMs;
        enriched.isStale = entry.isStale;
        return enriched;
    }

    return null;
}

/**
 * Fetches Open-Meteo weather data with caching, AbortController timeout,
 * exponential backoff retry on HTTP 429, and regional model fallback.
 * 
 * @param {Object|Array} coords Geographic coordinates
 * @param {Object} [options]
 * @param {string} [options.targetDate] Date string (YYYY-MM-DD, defaults to today)
 * @param {boolean} [options.forceRefresh=false] Bypass cache
 * @param {string} [options.weatherModel='best_match'] Weather model identifier
 * @param {number} [options.customHeading=null] Takeoff heading override in degrees
 * @param {boolean} [options.mock=false] Force synthetic mock weather generation
 * @param {boolean} [options.includeSounding=true] Include pressure levels
 * @param {InMemoryCache} [options.cache=defaultWeatherCache] Cache storage adapter
 * @param {Function} [options.fetchFn=globalThis.fetch] Custom fetch implementation
 * @param {number} [options.timeoutMs=DEFAULT_REQUEST_TIMEOUT_MS] Request timeout in ms
 * @param {number} [options.maxRetries=2] Max retries on HTTP 429 / 5xx
 * @returns {Promise<Object>} Enriched weather payload
 */
export async function fetchWeatherData(coords, options = {}) {
    const { lat, lon, elev } = normalizeCoordinates(coords);
    const targetDate = options.targetDate || new Date().toISOString().split('T')[0];
    const activeModel = (options.weatherModel && SUPPORTED_WEATHER_MODELS.includes(options.weatherModel))
        ? options.weatherModel
        : 'best_match';

    const cache = options.cache || defaultWeatherCache;
    const fetchFn = options.fetchFn || globalThis.fetch;
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS;
    const maxRetries = Math.max(0, Number(options.maxRetries) || 2);

    // 1. Synthetic Mock Weather Guard (Offline / Testing)
    if (options.mock === true) {
        const synthetic = generateSyntheticWeather({ lat, lon, elevation: elev }, {
            targetDate,
            weatherModel: activeModel,
            takeoffAzimuth: options.customHeading
        });
        const enriched = enrichWeatherData(synthetic, targetDate, Date.now(), options);
        enriched.isSynthetic = true;
        enriched.isFromCache = false;
        return enriched;
    }

    const cacheKey = generateWeatherCacheKey(lat, lon, targetDate, activeModel);

    // 2. Fresh Cache Check
    if (!options.forceRefresh) {
        const cached = getCachedWeatherData({ lat, lon }, targetDate, {
            ...options,
            cache,
            weatherModel: activeModel
        });
        if (cached && !cached.isStale && cached.hasThermalData) {
            return cached;
        }
    }

    // 3. Build URL and Prepare Network Request
    let url = buildForecastUrl({ lat, lon }, {
        targetDate,
        weatherModel: activeModel,
        includeSounding: options.includeSounding !== false
    });

    let response = null;
    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
        try {
            response = await fetchWithTimeout(url, {}, timeoutMs, fetchFn);

            // Handle HTTP 429 Rate Limit with exponential backoff
            if (response.status === 429 && attempt < maxRetries) {
                const backoffMs = Math.min(4000, (500 * Math.pow(2, attempt)) + Math.round(Math.random() * 200));
                await sleep(backoffMs);
                attempt++;
                continue;
            }

            // Regional Model Fallback: if a specific model returns HTTP 400 (e.g. out of domain or horizon),
            // automatically fall back to best_match
            if (!response.ok && response.status === 400 && activeModel !== 'best_match') {
                const fallbackUrl = buildForecastUrl({ lat, lon }, {
                    targetDate,
                    weatherModel: 'best_match',
                    includeSounding: options.includeSounding !== false
                });
                response = await fetchWithTimeout(fallbackUrl, {}, timeoutMs, fetchFn);
            }

            break;
        } catch (netErr) {
            lastError = netErr;
            if (attempt < maxRetries) {
                const backoffMs = 500 * Math.pow(2, attempt);
                await sleep(backoffMs);
                attempt++;
                continue;
            }
            break;
        }
    }

    // 4. Stale Cache Fallback on Network / HTTP Failure
    if (!response || !response.ok) {
        const staleCached = getCachedWeatherData({ lat, lon }, targetDate, {
            ...options,
            cache,
            weatherModel: activeModel
        });
        if (staleCached) {
            staleCached.isStaleOfflineFallback = true;
            return staleCached;
        }

        if (lastError) {
            throw new Error(`Open-Meteo network request failed: ${lastError.message}`);
        }
        let reason = `HTTP ${response ? response.status : 'Unknown'}`;
        try {
            const errJson = await response.json();
            if (errJson.reason) reason = errJson.reason;
        } catch (_) {}
        throw new Error(`Open-Meteo API error (${reason})`);
    }

    // 5. Parse and Enrich Payload
    const rawPayload = await response.json();
    rawPayload.weather_model = activeModel;

    // Cache the raw payload
    cache.set(cacheKey, rawPayload);

    // Enrich and return
    const enriched = enrichWeatherData(rawPayload, targetDate, Date.now(), options);
    enriched.isFromCache = false;
    return enriched;
}

/**
 * Fetches a 7-day multi-day outlook for a given spot and computes daily flyability summaries.
 * 
 * @param {Object|Array} coords Geographic coordinates
 * @param {Object} [options]
 * @param {number} [options.takeoffAzimuth=180] Takeoff azimuth in degrees
 * @param {string} [options.weatherModel='best_match']
 * @param {InMemoryCache} [options.cache=defaultWeatherCache]
 * @param {Function} [options.fetchFn=globalThis.fetch]
 * @returns {Promise<{ raw: Object, summaries: Array }>}
 */
export async function fetchWeekOverview(coords, options = {}) {
    const { lat, lon, elev } = normalizeCoordinates(coords);
    const todayStr = new Date().toISOString().split('T')[0];
    const activeModel = options.weatherModel || 'best_match';
    const cache = options.cache || defaultWeatherCache;
    const cacheKey = `week_${lat.toFixed(3)}_${lon.toFixed(3)}_${todayStr}_${activeModel}`;

    let payload = null;

    if (!options.forceRefresh && cache.has(cacheKey)) {
        payload = cache.get(cacheKey);
    } else if (options.mock === true) {
        payload = generateSyntheticWeather({ lat, lon, elevation: elev }, {
            targetDate: todayStr,
            days: 7,
            weatherModel: activeModel,
            takeoffAzimuth: options.takeoffAzimuth
        });
    } else {
        const fetchFn = options.fetchFn || globalThis.fetch;
        const timeoutMs = Number(options.timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS;

        const endDateObj = new Date();
        endDateObj.setDate(endDateObj.getDate() + 7);
        const endStr = endDateObj.toISOString().split('T')[0];

        const url = buildForecastUrl({ lat, lon }, {
            startDate: todayStr,
            endDate: endStr,
            weatherModel: activeModel,
            includeSounding: true
        });

        const res = await fetchWithTimeout(url, {}, timeoutMs, fetchFn);
        if (!res.ok) throw new Error(`Open-Meteo Week Overview error: HTTP ${res.status}`);
        payload = await res.json();
        cache.set(cacheKey, payload);
    }

    const azimuth = options.takeoffAzimuth != null ? Number(options.takeoffAzimuth) : 180;
    const summaries = calculateDailyFlyabilitySummary(payload, null, null);
    const weekOverview = calculateWeekOverview(payload, true, azimuth, null);

    return {
        raw: payload,
        summaries,
        weekOverview
    };
}

/**
 * Searches locations using Open-Meteo Geocoding API.
 * 
 * @param {string} query Search term (e.g. "Bassano del Grappa")
 * @param {Object} [options]
 * @param {number} [options.count=10] Max results
 * @param {string} [options.language='it'] Preferred language
 * @param {Function} [options.fetchFn=globalThis.fetch]
 * @param {InMemoryCache} [options.cache=defaultWeatherCache]
 * @returns {Promise<Array<{ id: number, name: string, latitude: number, longitude: number, elevation: number, country: string, admin1: string, timezone: string }>>}
 */
export async function searchLocations(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return [];
    }
    const cleanQuery = query.trim();
    const cache = options.cache || defaultWeatherCache;
    const cacheKey = `geo_search_${cleanQuery.toLowerCase()}_${options.language || 'it'}`;

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const url = buildGeocodingUrl(cleanQuery, options);
    const fetchFn = options.fetchFn || globalThis.fetch;
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS;

    const res = await fetchWithTimeout(url, {}, timeoutMs, fetchFn);
    if (!res.ok) {
        throw new Error(`Open-Meteo Geocoding search failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const results = (data.results || []).map(r => ({
        id: r.id,
        name: r.name,
        latitude: r.latitude,
        longitude: r.longitude,
        elevation: r.elevation != null ? Math.round(r.elevation) : 0,
        country: r.country || '',
        admin1: r.admin1 || '',
        timezone: r.timezone || 'Europe/Rome'
    }));

    cache.set(cacheKey, results, 60 * 60 * 1000); // 1 hour TTL for geocoding
    return results;
}

// In-Memory cache and timestamp queue for Nominatim rate limiting
const reverseGeocodeCache = new Map();
let lastNominatimTimestamp = 0;

/**
 * Performs reverse geocoding to resolve spot name from latitude/longitude.
 * Strictly respects Nominatim 1 req/sec policy using sequential rate limiting and local cache.
 * 
 * @param {number|string} lat
 * @param {number|string} lon
 * @param {Object} [options]
 * @param {string} [options.language='it']
 * @param {Function} [options.fetchFn=globalThis.fetch]
 * @returns {Promise<string|null>} Formatted location name or null
 */
export async function fetchReverseGeocode(lat, lon, options = {}) {
    const nLat = Number(lat);
    const nLon = Number(lon);
    if (isNaN(nLat) || isNaN(nLon)) return null;

    const lang = options.language || 'it';
    const cacheKey = `${nLat.toFixed(3)}_${nLon.toFixed(3)}_${lang}`;

    if (reverseGeocodeCache.has(cacheKey)) {
        return reverseGeocodeCache.get(cacheKey);
    }

    const fetchFn = options.fetchFn || globalThis.fetch;
    const now = Date.now();
    const elapsed = now - lastNominatimTimestamp;
    if (elapsed < 1000) {
        await sleep(1000 - elapsed);
    }
    lastNominatimTimestamp = Date.now();

    const url = `${NOMINATIM_REVERSE_URL}?format=jsonv2&lat=${nLat.toFixed(4)}&lon=${nLon.toFixed(4)}&accept-language=${lang}&addressdetails=1`;

    try {
        const res = await fetchWithTimeout(url, {
            headers: { 'Accept': 'application/json' }
        }, 5000, fetchFn);

        if (!res.ok) return null;
        const data = await res.json();
        const addr = data.address || {};
        const mainLoc = addr.village || addr.town || addr.city || addr.municipality || addr.suburb || addr.hamlet || addr.county || data.name;

        let finalName = '';
        if (mainLoc) {
            if (addr.county && mainLoc.toLowerCase() !== addr.county.toLowerCase()) {
                finalName = `${mainLoc} (${addr.county})`;
            } else {
                finalName = mainLoc;
            }
        } else if (data.display_name) {
            finalName = data.display_name.split(',')[0].trim();
        }

        if (finalName) {
            reverseGeocodeCache.set(cacheKey, finalName);
            return finalName;
        }
    } catch (_) {
        return null;
    }

    return null;
}

/**
 * Fetches batch weather data for multiple comprensori in single/chunked HTTP request(s).
 * Optimizes network traffic for HomeDashboardView and SpotMapView to evaluate regional flyability
 * without hitting rate limits (1 request per 35 spots instead of 35 requests).
 * 
 * @param {Array<object>} comprensori - Array of comprensorio objects
 * @param {Object} [options]
 * @param {string} [options.targetDate] - Reference date (YYYY-MM-DD, defaults to today)
 * @param {string} [options.weatherModel='best_match'] - Numerical model
 * @param {number} [options.maxSpots=35] - Max spots per batch request
 * @param {boolean} [options.forceRefresh=false] - Bypass cache
 * @param {InMemoryCache} [options.cache=defaultWeatherCache] - Cache adapter
 * @param {Function} [options.fetchFn=globalThis.fetch] - Fetch function
 * @param {number} [options.timeoutMs=8000] - Request timeout in ms
 * @param {boolean} [options.mock=false] - Return mock data
 * @returns {Promise<Map<string, object>>} Map of comprensorioId -> weatherPayload
 */
export async function fetchBatchComprensoriWeather(comprensori, options = {}) {
    const resultMap = new Map();
    if (!Array.isArray(comprensori) || comprensori.length === 0) {
        return resultMap;
    }

    const targetDate = options.targetDate || new Date().toISOString().split('T')[0];
    const activeModel = (options.weatherModel && SUPPORTED_WEATHER_MODELS.includes(options.weatherModel))
        ? options.weatherModel
        : 'best_match';
    const cache = options.cache || defaultWeatherCache;
    const fetchFn = options.fetchFn || globalThis.fetch;
    const timeoutMs = Number(options.timeoutMs) || 8000;
    const maxSpots = Math.max(1, Math.min(50, Number(options.maxSpots) || 35));

    // 1. Prepare valid spots with coordinates
    const normalizedSpots = [];
    for (const spot of comprensori) {
        if (!spot || !spot.id) continue;
        const takeoff = (spot.takeoffs && spot.takeoffs[0]) ? spot.takeoffs[0] : null;
        if (!takeoff || !takeoff.coordinates) continue;

        let coords = null;
        try {
            coords = normalizeCoordinates(takeoff.coordinates);
        } catch (_) {
            continue;
        }

        normalizedSpots.push({
            spot,
            coords,
            takeoff
        });
    }

    if (normalizedSpots.length === 0) {
        return resultMap;
    }

    // 2. Identify cached vs uncached spots
    const uncachedSpots = [];
    for (const item of normalizedSpots) {
        const cacheKey = generateWeatherCacheKey(item.coords.lat, item.coords.lon, targetDate, activeModel);
        if (!options.forceRefresh && cache.has(cacheKey)) {
            const cachedVal = cache.get(cacheKey);
            if (cachedVal) {
                resultMap.set(item.spot.id, cachedVal);
                continue;
            }
        }
        uncachedSpots.push(item);
    }

    // If mock, generate synthetic payload immediately
    if (options.mock === true) {
        for (const item of uncachedSpots) {
            const synth = generateSyntheticWeather(item.coords, {
                targetDate,
                weatherModel: activeModel,
                takeoffAzimuth: item.takeoff.heading
            });
            const enriched = enrichWeatherData(synth, targetDate, Date.now(), {
                customHeading: item.takeoff.heading
            });
            const cacheKey = generateWeatherCacheKey(item.coords.lat, item.coords.lon, targetDate, activeModel);
            cache.set(cacheKey, enriched);
            resultMap.set(item.spot.id, enriched);
        }
        return resultMap;
    }

    if (uncachedSpots.length === 0) {
        return resultMap;
    }

    // 3. Batch uncached spots in chunks of maxSpots
    const limitedSpots = uncachedSpots.slice(0, maxSpots);
    const lats = limitedSpots.map(s => s.coords.lat.toFixed(4)).join(',');
    const lons = limitedSpots.map(s => s.coords.lon.toFixed(4)).join(',');

    const baseUrl = OPEN_METEO_FORECAST_URL;
    const url = new URL(baseUrl);
    url.searchParams.append('latitude', lats);
    url.searchParams.append('longitude', lons);
    url.searchParams.append('timezone', 'auto');

    let forecastDays = 2;
    if (targetDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(targetDate);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 3600 * 1000));
        forecastDays = Math.max(2, Math.min(16, diffDays >= 0 ? diffDays + 1 : 2));
    }
    url.searchParams.append('forecast_days', String(forecastDays));
    url.searchParams.append('hourly', 'temperature_2m,dewpoint_2m,windspeed_10m,winddirection_10m,windgusts_10m,cape,precipitation');
    url.searchParams.append('daily', 'sunrise,sunset');

    if (activeModel && activeModel !== 'best_match' && SUPPORTED_WEATHER_MODELS.includes(activeModel)) {
        url.searchParams.append('models', activeModel);
    }

    try {
        const res = await fetchWithTimeout(url, {}, timeoutMs, fetchFn);
        if (res.ok) {
            const json = await res.json();
            const dataArray = Array.isArray(json) ? json : [json];

            dataArray.forEach((rawPayload, idx) => {
                const item = limitedSpots[idx];
                if (!item) return;

                rawPayload.weather_model = activeModel;
                rawPayload.targetDate = targetDate;
                rawPayload.fetchTimestamp = Date.now();
                rawPayload.takeoff_azimuth = item.takeoff.heading || 180;
                rawPayload._isSynthetic = false;

                const cacheKey = generateWeatherCacheKey(item.coords.lat, item.coords.lon, targetDate, activeModel);
                cache.set(cacheKey, rawPayload);
                resultMap.set(item.spot.id, rawPayload);
            });
        }
    } catch (_) {
        // Soft fail: fallback to stale cached data if available
        for (const item of limitedSpots) {
            const cacheKey = generateWeatherCacheKey(item.coords.lat, item.coords.lon, targetDate, activeModel);
            const staleEntry = cache.getEntry(cacheKey);
            if (staleEntry && staleEntry.value) {
                resultMap.set(item.spot.id, staleEntry.value);
            }
        }
    }

    return resultMap;
}

