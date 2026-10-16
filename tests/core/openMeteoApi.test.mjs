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
    isCoordinateList,
    normalizeCoordinateList,
    buildHourlyVariablesList,
    buildForecastUrl,
    buildGeocodingUrl,
    fetchWithTimeout,
    generateSyntheticWeather,
    enrichWeatherData,
    getCachedWeatherData,
    fetchWeatherData,
    fetchMultiLocationWeatherData,
    fetchWeekOverview,
    searchLocations,
    fetchReverseGeocode,
    getRateLimitStatus,
    resetRateLimitCooldown,
    getInFlightRequestsCount,
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

    it('should detect and normalize multi-location coordinates list', () => {
        const coordsArray = [
            { lat: 45.833, lon: 9.302, elev: 1060 },
            { lat: 45.817, lon: 9.318, elev: 260 }
        ];
        assert.equal(isCoordinateList(coordsArray), true);
        const normalized = normalizeCoordinateList(coordsArray);
        assert.equal(normalized.length, 2);
        assert.equal(normalized[0].lat, 45.833);
        assert.equal(normalized[0].elev, 1060);
        assert.equal(normalized[1].lat, 45.817);
        assert.equal(normalized[1].elev, 260);

        // Object with takeoff and landing
        const coordsObj = {
            takeoff: { lat: 45.833, lon: 9.302, altitude: 1060 },
            landing: { lat: 45.817, lon: 9.318, altitude: 260 }
        };
        assert.equal(isCoordinateList(coordsObj), true);
        const normObj = normalizeCoordinateList(coordsObj);
        assert.equal(normObj.length, 2);
        assert.equal(normObj[0].role, 'takeoff');
        assert.equal(normObj[1].role, 'landing');

        // Single coordinate is not a list
        assert.equal(isCoordinateList({ lat: 45.8, lon: 9.3 }), false);
        assert.equal(isCoordinateList([45.8, 9.3]), false);
    });

    it('should build multi-point forecast URL with comma-separated coordinates', () => {
        const coords = [
            { lat: 45.8332, lon: 9.3021, elev: 1060 },
            { lat: 45.8172, lon: 9.3186, elev: 260 }
        ];
        const url = buildForecastUrl(coords, { targetDate: '2026-10-20' });
        assert.equal(url.searchParams.get('latitude'), '45.8332,45.8172');
        assert.equal(url.searchParams.get('longitude'), '9.3021,9.3186');
        assert.equal(url.searchParams.get('elevation'), '1060,260');
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
    beforeEach(() => {
        resetRateLimitCooldown();
    });

    it('should return synthetic data immediately when mock option is true', async () => {
        const result = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            mock: true,
            targetDate: '2026-10-10'
        });

        assert.equal(result.isSynthetic, true);
        assert.equal(result.isFromCache, false);
        assert.ok(result.enrichedMetrics.thermalLift.length > 0);
    });

    it('should fetch from mock fetchFn, populate cache across all returned forecast dates, and hit cache on subsequent days', async () => {
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
        assert.equal(testCache.size, 3, 'Must populate cache for all 3 days in returned forecast');

        // Second call on same date: cache hit, zero network calls
        const res2 = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: fakeFetch
        });

        assert.equal(networkCalls, 1, 'Second fetch for same date should be served from memory cache');
        assert.equal(res2.isFromCache, true);

        // Third call on different day within forecast (day 2): cache hit, zero network calls!
        const resDay2 = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-11',
            cache: testCache,
            fetchFn: fakeFetch
        });

        assert.equal(networkCalls, 1, 'Fetch for day 2 within forecast horizon must be served from cache without network query');
        assert.equal(resDay2.isFromCache, true);
        assert.equal(resDay2.targetDate, '2026-10-11');
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

    it('should fetch multi-point weather in mock mode and return distinct takeoff and landing weather', async () => {
        const coords = [
            { lat: 45.833, lon: 9.302, elev: 1060, role: 'takeoff' },
            { lat: 45.817, lon: 9.318, elev: 260, role: 'landing' }
        ];

        const result = await fetchWeatherData(coords, {
            mock: true,
            targetDate: '2026-10-10'
        });

        assert.ok(result);
        assert.ok(result.takeoffWeather, 'Must have takeoffWeather');
        assert.ok(result.landingWeather, 'Must have landingWeather');
        assert.equal(result.points.length, 2);

        // Takeoff vs Landing elevation
        assert.equal(result.takeoffWeather.elevation, 1060);
        assert.equal(result.landingWeather.elevation, 260);

        // Diurnal midday wind: landing in valley has attenuated wind speed and shifted direction
        const middayHour = 13;
        const takeoffWind = result.takeoffWeather.hourly.windspeed_10m[middayHour];
        const landingWind = result.landingWeather.hourly.windspeed_10m[middayHour];
        const takeoffDir = result.takeoffWeather.hourly.winddirection_10m[middayHour];
        const landingDir = result.landingWeather.hourly.winddirection_10m[middayHour];

        assert.notEqual(takeoffWind, landingWind, 'Takeoff and landing wind speed must differ');
        assert.notEqual(takeoffDir, landingDir, 'Takeoff and landing wind direction must differ');
        assert.ok(landingWind < takeoffWind, 'Valley landing wind should be calmer than mountain takeoff');
    });

    it('should fetch multi-point weather over network, cache each location and return combined payload', async () => {
        const testCache = new InMemoryCache();
        let requestedUrl = null;

        const fakeMultiFetch = async (urlStr) => {
            requestedUrl = urlStr;
            const toPayload = generateSyntheticWeather([45.833, 9.302, 1060], { targetDate: '2026-10-10', isLanding: false });
            const ldPayload = generateSyntheticWeather([45.817, 9.318, 260], { targetDate: '2026-10-10', isLanding: true });
            return {
                ok: true,
                status: 200,
                json: async () => [toPayload, ldPayload]
            };
        };

        const coords = [
            { lat: 45.833, lon: 9.302, elev: 1060 },
            { lat: 45.817, lon: 9.318, elev: 260 }
        ];

        const result = await fetchWeatherData(coords, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: fakeMultiFetch
        });

        assert.ok(requestedUrl.includes('latitude=45.8330%2C45.8170') || requestedUrl.includes('latitude=45.8330,45.8170'));
        assert.equal(testCache.size, 6, 'Must cache both takeoff and landing across all returned dates (3 days * 2 locations = 6)');
        assert.ok(result.takeoffWeather);
        assert.ok(result.landingWeather);
        assert.notEqual(
            result.takeoffWeather.hourly.winddirection_10m[14],
            result.landingWeather.hourly.winddirection_10m[14]
        );

        // Day 2 multi-point check: zero network calls
        let day2NetworkCalls = 0;
        const failFetch = async () => {
            day2NetworkCalls++;
            throw new Error('Should not call network on day 2 cache hit');
        };
        const day2Result = await fetchWeatherData(coords, {
            targetDate: '2026-10-11',
            cache: testCache,
            fetchFn: failFetch
        });
        assert.equal(day2NetworkCalls, 0, 'Multi-point day 2 must be served directly from memory cache');
        assert.equal(day2Result.isFromCache, true);
    });

    it('should deduplicate concurrent in-flight requests for the exact same URL and execute single network fetch', async () => {
        let networkCalls = 0;
        const delayedFetch = async () => {
            networkCalls++;
            await new Promise(r => setTimeout(r, 40));
            const synthetic = generateSyntheticWeather([45.8, 9.3, 1000], { targetDate: '2026-10-10' });
            return {
                ok: true,
                status: 200,
                json: async () => synthetic
            };
        };

        const testCache = new InMemoryCache();
        // Fire 4 parallel requests concurrently with forceRefresh: true (so cache check is bypassed)
        const [r1, r2, r3, r4] = await Promise.all([
            fetchWeatherData({ lat: 45.8, lon: 9.3 }, { targetDate: '2026-10-10', cache: testCache, fetchFn: delayedFetch, forceRefresh: true }),
            fetchWeatherData({ lat: 45.8, lon: 9.3 }, { targetDate: '2026-10-10', cache: testCache, fetchFn: delayedFetch, forceRefresh: true }),
            fetchWeatherData({ lat: 45.8, lon: 9.3 }, { targetDate: '2026-10-10', cache: testCache, fetchFn: delayedFetch, forceRefresh: true }),
            fetchWeatherData({ lat: 45.8, lon: 9.3 }, { targetDate: '2026-10-10', cache: testCache, fetchFn: delayedFetch, forceRefresh: true })
        ]);

        assert.equal(networkCalls, 1, 'Only 1 network fetch must be executed despite 4 concurrent callers');
        assert.ok(r1 && r2 && r3 && r4);
        assert.equal(getInFlightRequestsCount(), 0, 'In-flight map must be empty after promises resolve');
    });

    it('should activate circuit breaker cooldown on persistent HTTP 429 and return fallback without throwing', async () => {
        let attempts = 0;
        const rateLimitedFetch = async () => {
            attempts++;
            return {
                ok: false,
                status: 429,
                headers: {
                    get: (name) => name.toLowerCase() === 'retry-after' ? '30' : null
                }
            };
        };

        const testCache = new InMemoryCache();
        const res = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: rateLimitedFetch,
            maxRetries: 1
        });

        assert.ok(res, 'Must return fallback weather rather than throwing unhandled exception');
        assert.equal(res.isRateLimited, true, 'Result must be flagged as rate limited');
        assert.equal(res.isSynthetic, true, 'Result must be synthetic when no stale cache exists');

        const status = getRateLimitStatus();
        assert.equal(status.isRateLimited, true, 'Circuit breaker must be active');
        assert.ok(status.cooldownRemainingMs > 0, 'Must have remaining cooldown');
    });

    it('should skip network fetch and immediately return fallback when circuit breaker cooldown is active', async () => {
        const rateLimitedFetch = async () => ({
            ok: false,
            status: 429,
            headers: { get: () => '60' }
        });
        const testCache = new InMemoryCache();

        // 1. Initial call receives 429 and activates circuit breaker
        await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: rateLimitedFetch,
            maxRetries: 0
        });

        assert.equal(getRateLimitStatus().isRateLimited, true, 'Circuit breaker must be active after 429');

        // 2. Subsequent call during cooldown: must NOT call spyFetch at all
        let networkCalls = 0;
        const spyFetch = async () => {
            networkCalls++;
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const res = await fetchWeatherData({ lat: 45.8, lon: 9.3 }, {
            targetDate: '2026-10-10',
            cache: testCache,
            fetchFn: spyFetch
        });

        assert.equal(networkCalls, 0, 'Must not touch network while circuit breaker is active');
        assert.equal(res.isRateLimited, true);
        assert.equal(res.isSynthetic, true);

        // Reset cooldown and verify network is allowed again
        resetRateLimitCooldown();
        assert.equal(getRateLimitStatus().isRateLimited, false);
    });

    it('should fall back to surface-only query or synthetic weather on HTTP 503 Service Unavailable without throwing', async () => {
        const requestedUrls = [];
        const testCache = new InMemoryCache();

        // Case A: Heavy sounding query returns 503, lightweight surface-only query succeeds (200)
        const fallback503Fetch = async (urlStr) => {
            requestedUrls.push(urlStr);
            if (urlStr.includes('1000hPa')) {
                return { ok: false, status: 503 };
            }
            const toPayload = generateSyntheticWeather([45.1819, 7.0888, 2200], { targetDate: '2026-10-16', isLanding: false });
            const ldPayload = generateSyntheticWeather([45.1375, 7.0458, 500], { targetDate: '2026-10-16', isLanding: true });
            return {
                ok: true,
                status: 200,
                json: async () => [toPayload, ldPayload]
            };
        };

        const coords = [
            { lat: 45.1819, lon: 7.0888, elev: 2200, role: 'takeoff' },
            { lat: 45.1375, lon: 7.0458, elev: 500, role: 'landing' }
        ];

        const resA = await fetchWeatherData(coords, {
            targetDate: '2026-10-16',
            includeSounding: true,
            cache: testCache,
            fetchFn: fallback503Fetch,
            maxRetries: 0
        });
        assert.equal(requestedUrls.length, 2, 'Must retry immediately with lightweight surface-only URL on HTTP 503');
        assert.ok(!requestedUrls[1].includes('1000hPa'), 'Fallback URL must omit heavy isobaric sounding variables');
        assert.equal(resA.isFromCache, false);

        // Case B: Persistent HTTP 503 returns synthetic fallback gracefully
        resetRateLimitCooldown();
        const emptyCache = new InMemoryCache();
        const always503Fetch = async () => ({ ok: false, status: 503 });
        const resB = await fetchWeatherData(coords, {
            targetDate: '2026-10-16',
            includeSounding: false,
            cache: emptyCache,
            fetchFn: always503Fetch,
            maxRetries: 0
        });
        assert.ok(resB, 'Must return synthetic fallback on persistent HTTP 503 rather than throwing');
        assert.equal(resB.isSynthetic, true);
        resetRateLimitCooldown();
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

    it('should request total cloudcover in surface variables and generate non-flat diurnal cloudcover curves', () => {
        const fullVars = buildHourlyVariablesList({ includeSounding: true });
        assert.ok(fullVars.includes('cloudcover'), 'buildHourlyVariablesList must include total cloudcover');

        const synth = generateSyntheticWeather({ lat: 45.83, lon: 9.30, elev: 1100 }, { targetDate: '2026-10-16', days: 3 });
        assert.ok(Array.isArray(synth.hourly.cloudcover), 'Synthetic weather must include hourly.cloudcover array');
        assert.equal(synth.hourly.cloudcover.length, 72);

        const day1DaylightClouds = synth.hourly.cloudcover.slice(7, 20);
        const uniqueCloudValues = new Set(day1DaylightClouds);
        assert.ok(uniqueCloudValues.size >= 4, 'Daylight synthetic cloudcover must follow a diurnal curve rather than a flat line');
        assert.ok(synth.hourly.cloudcover[14] > synth.hourly.cloudcover[7], 'Midday convective cloudcover must exceed early morning cloudcover');

        // Verify enrichWeatherData synthesizes total cloudcover when only layered cloudcover_low/mid/high are present
        const partialPayload = {
            latitude: 45.83,
            longitude: 9.30,
            elevation: 1100,
            hourly: {
                time: ['2026-10-16T08:00', '2026-10-16T12:00', '2026-10-16T16:00'],
                temperature_2m: [16, 22, 20],
                dewpoint_2m: [10, 11, 11],
                windspeed_10m: [8, 15, 12],
                winddirection_10m: [180, 185, 190],
                windgusts_10m: [11, 22, 18],
                cloudcover_low: [10, 50, 30],
                cloudcover_mid: [0, 20, 10],
                cloudcover_high: [10, 10, 20],
                cape: [50, 600, 400],
                precipitation: [0, 0, 0]
            }
        };
        const enriched = enrichWeatherData(partialPayload, '2026-10-16');
        assert.deepEqual(enriched.hourly.cloudcover, [19, 64, 50]);
    });
});
