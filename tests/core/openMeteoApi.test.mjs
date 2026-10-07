/**
 * Test Suite: Open-Meteo API Client & Meteorological Ingestion Engine
 * 
 * Verifies:
 * 1. InMemoryCache LRU, TTL, eviction, and serialization
 * 2. Cache key generation and coordinate normalization
 * 3. URL builders for forecast and geocoding endpoints
 * 4. Network fetch timeout and AbortController handling
 * 5. Synthetic weather generation for diurnal paragliding cycle
 * 6. Meteorological payload enrichment (turbulence EDR, Deardorff thermal lift, dew points)
 * 7. Live fetch simulation with mock fetchFn, rate limit retries, and offline cache fallback
 * 8. Week overview multi-day flyability summarization
 * 9. Geocoding and reverse geocoding resolution
 * 
 * ZERO DOM DEPENDENCIES: 100% pure Node.js native test runner.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    InMemoryCache,
    generateWeatherCacheKey,
    normalizeCoordinates,
    buildHourlyVariablesList,
    buildForecastUrl,
    buildGeocodingUrl,
    fetchWithTimeout,
    generateSyntheticWeather,
    enrichWeatherData,
    getCachedWeatherData,
    fetchWeatherData,
    fetchWeekOverview,
    searchLocations,
    fetchReverseGeocode,
    DEFAULT_CACHE_TTL_MS,
    STANDARD_PRESSURE_LEVELS_HPA,
    OPEN_METEO_FORECAST_URL
} from '../../core/openMeteoApi.js';

describe('Open-Meteo Client - InMemoryCache LRU & TTL', () => {
    let cache;

    beforeEach(() => {
        cache = new InMemoryCache({ maxEntries: 3, defaultTtlMs: 500 });
    });

    it('should store and retrieve fresh entries', () => {
        cache.set('key1', { temp: 20 });
        assert.deepEqual(cache.get('key1'), { temp: 20 });
        assert.equal(cache.has('key1'), true);
        assert.equal(cache.size, 1);
    });

    it('should return undefined and evict expired entries based on TTL', async () => {
        cache.set('quick', 'value', 50);
        assert.equal(cache.get('quick'), 'value');

        await new Promise(r => setTimeout(r, 70));

        assert.equal(cache.get('quick'), undefined);
        assert.equal(cache.has('quick'), false);
    });

    it('should evict oldest entries when capacity exceeds maxEntries (LRU)', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        assert.equal(cache.size, 3);

        // Access 'a' to make 'b' the oldest
        cache.get('a');

        // Add 'd' -> 'b' should be evicted
        cache.set('d', 4);
        assert.equal(cache.has('b'), false);
        assert.equal(cache.has('a'), true);
        assert.equal(cache.has('c'), true);
        assert.equal(cache.has('d'), true);
    });

    it('should support pruneExpired to bulk-clean stale items', async () => {
        cache.set('exp1', 'val1', 30);
        cache.set('exp2', 'val2', 30);
        cache.set('keep', 'val3', 5000);

        await new Promise(r => setTimeout(r, 50));

        const pruned = cache.pruneExpired();
        assert.equal(pruned, 2);
        assert.equal(cache.size, 1);
        assert.equal(cache.get('keep'), 'val3');
    });

    it('should serialize and deserialize cache state correctly', () => {
        cache.set('spot1', { lat: 45.1, lon: 7.2 });
        const jsonDump = cache.toJSON();
        assert.ok(jsonDump['spot1']);

        const newCache = new InMemoryCache();
        newCache.fromJSON(jsonDump);
        assert.deepEqual(newCache.get('spot1'), { lat: 45.1, lon: 7.2 });
    });
});

describe('Open-Meteo Client - Coordinates & URL Builders', () => {
    it('should normalize coordinates across various input formats', () => {
        const c1 = normalizeCoordinates({ latitude: 45.3521, longitude: 7.3512, elevation: 900 });
        assert.equal(c1.lat, 45.3521);
        assert.equal(c1.lon, 7.3512);
        assert.equal(c1.elev, 900);

        const c2 = normalizeCoordinates({ lat: 46.0, lng: 11.0 });
        assert.equal(c2.lat, 46.0);
        assert.equal(c2.lon, 11.0);
        assert.equal(c2.elev, null);

        const c3 = normalizeCoordinates([45.8, 9.2, 1200]);
        assert.equal(c3.lat, 45.8);
        assert.equal(c3.lon, 9.2);
        assert.equal(c3.elev, 1200);
    });

    it('should throw meaningful errors for out-of-range or malformed coordinates', () => {
        assert.throws(() => normalizeCoordinates({ lat: 95, lon: 10 }), /Invalid latitude/);
        assert.throws(() => normalizeCoordinates({ lat: 45, lon: 200 }), /Invalid longitude/);
        assert.throws(() => normalizeCoordinates(null), /Coordinate input is null/);
    });

    it('should generate consistent weather cache keys rounded to 3 decimals', () => {
        const key1 = generateWeatherCacheKey(45.3528, 7.3519, '2026-10-15', 'icon_eu');
        assert.equal(key1, 'glidemind_weather_45.353_7.352_2026-10-15_icon_eu');

        const key2 = generateWeatherCacheKey(45.3532, 7.3524, '2026-10-15');
        assert.equal(key2, 'glidemind_weather_45.353_7.352_2026-10-15_best_match');
    });

    it('should build hourly variable list with surface and pressure levels', () => {
        const fullVars = buildHourlyVariablesList({ includeSounding: true });
        assert.ok(fullVars.includes('temperature_2m'));
        assert.ok(fullVars.includes('windspeed_10m'));
        assert.ok(fullVars.includes('cape'));
        assert.ok(fullVars.includes('shortwave_radiation_instant'));
        assert.ok(fullVars.includes('temperature_850hPa'));
        assert.ok(fullVars.includes('windspeed_850hPa'));
        assert.ok(fullVars.includes('geopotential_height_700hPa'));

        const surfaceOnly = buildHourlyVariablesList({ includeSounding: false });
        assert.ok(surfaceOnly.includes('temperature_2m'));
        assert.equal(surfaceOnly.some(v => v.includes('hPa')), false);
    });

    it('should build deterministic forecast URL with target date and model', () => {
        const url = buildForecastUrl({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-20',
            weatherModel: 'icon_seamless',
            timezone: 'auto'
        });

        assert.equal(url.origin + url.pathname, OPEN_METEO_FORECAST_URL);
        assert.equal(url.searchParams.get('latitude'), '45.8000');
        assert.equal(url.searchParams.get('longitude'), '9.3000');
        assert.equal(url.searchParams.get('models'), 'icon_seamless');
        assert.ok(url.searchParams.get('hourly').includes('temperature_2m'));
        assert.ok(url.searchParams.get('daily').includes('sunrise'));
    });

    it('should build geocoding search URL with proper escaping', () => {
        const url = buildGeocodingUrl('Bassano del Grappa', { count: 5, language: 'it' });
        assert.equal(url.searchParams.get('name'), 'Bassano del Grappa');
        assert.equal(url.searchParams.get('count'), '5');
        assert.equal(url.searchParams.get('language'), 'it');
        assert.equal(url.searchParams.get('format'), 'json');
    });
});

describe('Open-Meteo Client - Synthetic Weather Generation', () => {
    it('should generate complete diurnal paragliding weather dataset', () => {
        const synthetic = generateSyntheticWeather([45.35, 7.35, 900], {
            targetDate: '2026-10-10',
            days: 3,
            takeoffAzimuth: 180,
            slopeDeg: 20
        });

        assert.equal(synthetic._isSynthetic, true);
        assert.equal(synthetic.latitude, 45.35);
        assert.equal(synthetic.longitude, 7.35);
        assert.equal(synthetic.elevation, 900);
        assert.equal(synthetic.takeoff_azimuth, 180);
        assert.equal(synthetic.slope_deg, 20);

        // 3 days = 72 hours
        assert.equal(synthetic.hourly.time.length, 72);
        assert.equal(synthetic.hourly.temperature_2m.length, 72);
        assert.equal(synthetic.hourly.windspeed_10m.length, 72);
        assert.equal(synthetic.hourly.cape.length, 72);
        assert.equal(synthetic.hourly.shortwave_radiation_instant.length, 72);

        // Verify diurnal cycle: midday hour (12:00) should have high radiation and thermals
        const middayIdx = 12; // 12:00 on day 1
        assert.ok(synthetic.hourly.shortwave_radiation_instant[middayIdx] > 400);
        assert.ok(synthetic.hourly.boundary_layer_height[middayIdx] > 500);
        assert.ok(synthetic.hourly.cape[middayIdx] >= 500);

        // Night hour (02:00) should have 0 solar radiation and low wind
        const nightIdx = 2; // 02:00 on day 1
        assert.equal(synthetic.hourly.shortwave_radiation_instant[nightIdx], 0);
        assert.ok(synthetic.hourly.windspeed_10m[nightIdx] < 10);

        // Pressure levels verification
        STANDARD_PRESSURE_LEVELS_HPA.forEach(hpa => {
            assert.equal(synthetic.hourly[`temperature_${hpa}hPa`].length, 72);
            assert.equal(synthetic.hourly[`relative_humidity_${hpa}hPa`].length, 72);
        });

        // Daily sunrise and sunset
        assert.equal(synthetic.daily.time.length, 3);
        assert.equal(synthetic.daily.sunrise.length, 3);
        assert.equal(synthetic.daily.sunset.length, 3);
    });
});

describe('Open-Meteo Client - Payload Enrichment', () => {
    it('should compute turbulence EDR and Deardorff thermal metrics on weather payload', () => {
        const synthetic = generateSyntheticWeather([45.35, 7.35, 900], {
            targetDate: '2026-10-10',
            days: 1
        });

        const enriched = enrichWeatherData(synthetic, '2026-10-10');

        assert.ok(enriched.daylight);
        assert.equal(typeof enriched.daylight.sunriseHour, 'number');
        assert.equal(typeof enriched.daylight.sunsetHour, 'number');
        assert.ok(enriched.daylight.indices.length > 0);

        assert.ok(enriched.enrichedMetrics);
        assert.ok(Array.isArray(enriched.enrichedMetrics.turbulence));
        assert.ok(Array.isArray(enriched.enrichedMetrics.thermalLift));

        // Midday thermal lift should be active
        const middayThermal = enriched.enrichedMetrics.thermalLift.find(t => t.probability > 30);
        assert.ok(middayThermal, 'Expected active thermal window during daylight');
        assert.ok(middayThermal.climbRate > 0);
        assert.ok(middayThermal.ceilingMsl >= 900);

        // Sounding pressure level dew points should be computed
        assert.ok(Array.isArray(enriched.hourly.dewpoint_850hPa));
        assert.equal(enriched.hourly.dewpoint_850hPa.length, 24);
    });

    it('should respect custom takeoff heading override in enriched payload', () => {
        const synthetic = generateSyntheticWeather([45.35, 7.35, 900], { targetDate: '2026-10-10' });
        const enriched = enrichWeatherData(synthetic, '2026-10-10', Date.now(), { customHeading: 220 });
        assert.equal(enriched.takeoff_azimuth, 220);
    });
});

describe('Open-Meteo Client - Fetch Simulation, Retry & Cache Fallback', () => {
    it('should return synthetic data immediately when mock option is true', async () => {
        const result = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            mock: true,
            targetDate: '2026-10-10'
        });

        assert.equal(result.isSynthetic, true);
        assert.equal(result.isFromCache, false);
        assert.ok(result.enrichedMetrics.thermalLift.length > 0);
    });

    it('should fetch from mock fetchFn, populate cache, and hit cache on second call', async () => {
        const testCache = new InMemoryCache();
        let networkCalls = 0;

        const fakeFetch = async (url) => {
            networkCalls++;
            const synthetic = generateSyntheticWeather([45.8, 9.3, 1000], { targetDate: '2026-10-10' });
            return {
                ok: true,
                status: 200,
                json: async () => synthetic
            };
        };

        // First call: cache miss, triggers network
        const res1 = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: fakeFetch
        });

        assert.equal(networkCalls, 1);
        assert.equal(res1.isFromCache, false);
        assert.equal(testCache.size, 1);

        // Second call: cache hit, zero network calls
        const res2 = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: fakeFetch
        });

        assert.equal(networkCalls, 1, 'Second fetch should be served from memory cache');
        assert.equal(res2.isFromCache, true);
    });

    it('should retry on HTTP 429 rate limit with exponential backoff and succeed', async () => {
        let attempts = 0;
        const testCache = new InMemoryCache();

        const retryFetch = async () => {
            attempts++;
            if (attempts === 1) {
                return { ok: false, status: 429 };
            }
            const synthetic = generateSyntheticWeather([45.8, 9.3, 1000], { targetDate: '2026-10-10' });
            return {
                ok: true,
                status: 200,
                json: async () => synthetic
            };
        };

        const res = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: retryFetch,
            maxRetries: 2
        });

        assert.equal(attempts, 2);
        assert.equal(res.isFromCache, false);
    });

    it('should automatically fall back to best_match if a regional model returns HTTP 400', async () => {
        let requestedModels = [];
        const testCache = new InMemoryCache();

        const modelFallbackFetch = async (urlStr) => {
            const parsedUrl = new URL(urlStr);
            const modelParam = parsedUrl.searchParams.get('models');
            requestedModels.push(modelParam);

            if (modelParam === 'arome_france') {
                return { ok: false, status: 400, json: async () => ({ reason: 'Out of domain' }) };
            }

            const synthetic = generateSyntheticWeather([45.8, 9.3, 1000], { targetDate: '2026-10-10' });
            return {
                ok: true,
                status: 200,
                json: async () => synthetic
            };
        };

        const res = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            weatherModel: 'arome_france',
            cache: testCache,
            fetchFn: modelFallbackFetch
        });

        assert.deepEqual(requestedModels, ['arome_france', null]); // null means fallback without models param
        assert.ok(res);
    });

    it('should fall back to stale cache entry if network fetch fails', async () => {
        const testCache = new InMemoryCache({ defaultTtlMs: 20 });
        const synthetic = generateSyntheticWeather([45.8, 9.3, 1000], { targetDate: '2026-10-10' });

        // Preload cache with entry that expires soon
        const cacheKey = generateWeatherCacheKey(45.8, 9.3, '2026-10-10', 'best_match');
        testCache.set(cacheKey, synthetic, 20);

        await new Promise(r => setTimeout(r, 40)); // Stale now

        const failingFetch = async () => {
            throw new Error('Connection refused (offline mountaintop)');
        };

        const res = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: failingFetch
        });

        assert.equal(res.isStaleOfflineFallback, true);
        assert.ok(res.hourly);
    });

    it('should throw clear error when network fails and no cached fallback exists', async () => {
        const emptyCache = new InMemoryCache();
        const failingFetch = async () => {
            throw new Error('Network timeout');
        };

        await assert.rejects(
            async () => {
                await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
                    targetDate: '2026-10-10',
                    cache: emptyCache,
                    fetchFn: failingFetch,
                    maxRetries: 0
                });
            },
            /Open-Meteo network request failed/
        );
    });

    it('should handle request timeout using AbortController in fetchWithTimeout', async () => {
        const hangingFetch = async (url, options) => {
            return new Promise((resolve, reject) => {
                if (options.signal) {
                    options.signal.addEventListener('abort', () => {
                        const err = new Error('The operation was aborted');
                        err.name = 'AbortError';
                        reject(err);
                    });
                }
            });
        };

        await assert.rejects(
            async () => {
                await fetchWithTimeout('https://example.com/api', {}, 50, hangingFetch);
            },
            /Request timed out after 50ms/
        );
    });
});

describe('Open-Meteo Client - Week Overview Multi-Day Summary', () => {
    it('should return weekly outlook and daily paragliding summaries', async () => {
        const result = await fetchWeekOverview([45.8, 9.3, 1000], {
            mock: true,
            takeoffAzimuth: 180
        });

        assert.ok(result.raw);
        assert.ok(Array.isArray(result.summaries));
        assert.ok(result.summaries.length > 0);

        const firstDay = result.summaries[0];
        assert.ok(firstDay.dateStr);
        assert.ok(firstDay.label);
        assert.equal(typeof firstDay.score, 'number');
        assert.equal(typeof firstDay.bestSeverity, 'number');
        assert.ok(firstDay.bestWindow);
        assert.ok(firstDay.limitingFactor);
    });
});

describe('Open-Meteo Client - Geocoding & Reverse Geocoding', () => {
    it('should search locations using Open-Meteo Geocoding API and cache results', async () => {
        const testCache = new InMemoryCache();
        let geocodeCalls = 0;

        const fakeGeocodeFetch = async (urlStr) => {
            geocodeCalls++;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    results: [
                        {
                            id: 3182885,
                            name: 'Bassano del Grappa',
                            latitude: 45.7667,
                            longitude: 11.7333,
                            elevation: 129,
                            country: 'Italy',
                            admin1: 'Veneto',
                            timezone: 'Europe/Rome'
                        }
                    ]
                })
            };
        };

        const res1 = await searchLocations('Bassano del Grappa', {
            cache: testCache,
            fetchFn: fakeGeocodeFetch
        });

        assert.equal(geocodeCalls, 1);
        assert.equal(res1.length, 1);
        assert.equal(res1[0].name, 'Bassano del Grappa');
        assert.equal(res1[0].elevation, 129);

        // Second call: cached
        const res2 = await searchLocations('Bassano del Grappa', {
            cache: testCache,
            fetchFn: fakeGeocodeFetch
        });

        assert.equal(geocodeCalls, 1);
        assert.deepEqual(res2, res1);
    });

    it('should return empty array for empty search queries without network calls', async () => {
        const results = await searchLocations('   ');
        assert.deepEqual(results, []);
    });

    it('should reverse geocode coordinates and format spot location name', async () => {
        const fakeReverseFetch = async (urlStr) => {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    name: 'Monte Cornizzolo',
                    address: {
                        village: 'Suello',
                        county: 'Lecco',
                        country: 'Italy'
                    }
                })
            };
        };

        const spotName = await fetchReverseGeocode(45.83, 9.30, {
            fetchFn: fakeReverseFetch
        });

        assert.equal(spotName, 'Suello (Lecco)');
    });
});
