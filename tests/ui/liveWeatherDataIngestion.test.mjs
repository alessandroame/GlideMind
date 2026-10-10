import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from '../../core/store.js';
import { ForecastViewController } from '../../ui/views/ForecastView.js';
import { HomeDashboardViewController } from '../../ui/views/HomeDashboardView.js';
import { DEFAULT_COMPRENSORI } from '../../core/comprensorio.js';
import { fetchBatchComprensoriWeather, InMemoryCache } from '../../core/openMeteoApi.js';

describe('GlideMind Phase 4-bis: Live Weather Data Ingestion & Cache Sync', () => {
  it('should guarantee 0ms optimistic initial rendering in ForecastView without network blocks', () => {
    const mockStore = createStore({ selectedSpot: DEFAULT_COMPRENSORI[0] });
    const controller = new ForecastViewController({ store: mockStore });

    const start = performance.now();
    const html = controller.renderHtml();
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 150, `Initial render took ${elapsed.toFixed(1)}ms, must be < 150ms (0ms nominal)`);
    assert.ok(html.includes('gm-forecast-view'), 'Must render forecast view HTML');
    assert.ok(html.includes('gm-live-badge'), 'Must include live weather status badge');
    assert.ok(html.includes('Offline / Stima') || html.includes('Live'), 'Must show initial status');
  });

  it('should guarantee 0ms optimistic initial rendering in HomeDashboardView without network blocks', () => {
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });

    const start = performance.now();
    const html = controller.renderHtml();
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 150, `Initial render took ${elapsed.toFixed(1)}ms, must be < 150ms`);
    assert.ok(html.includes('gm-home-view'), 'Must render home view HTML');
    assert.ok(html.includes('gm-live-badge'), 'Must include live weather status badge');
  });

  it('should render discrete network status badges for all states (live, loading, offline)', () => {
    const controller = new ForecastViewController();

    controller.networkStatus = 'loading';
    const loadingHtml = controller.renderLiveWeatherBadge();
    assert.ok(loadingHtml.includes('gm-live-badge loading'));
    assert.ok(loadingHtml.includes('Aggiornamento...'));

    controller.networkStatus = 'live';
    const liveHtml = controller.renderLiveWeatherBadge();
    assert.ok(liveHtml.includes('gm-live-badge live'));
    assert.ok(liveHtml.includes('Live'));

    controller.networkStatus = 'offline';
    const offlineHtml = controller.renderLiveWeatherBadge();
    assert.ok(offlineHtml.includes('gm-live-badge offline'));
    assert.ok(offlineHtml.includes('Offline / Stima'));
  });

  it('should asynchronously fetch and enrich real Open-Meteo weather data in ForecastView (Stale-While-Revalidate)', async () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({ selectedSpot: spot });

    // Mock network fetch response conforming to Open-Meteo API
    const mockFetch = async (url) => {
      const times = [];
      const temp2m = [];
      const dew2m = [];
      const wind10m = [];
      const gust10m = [];
      const dir10m = [];
      const capeArr = [];
      const rainArr = [];

      for (let i = 0; i < 48; i++) {
        const d = new Date(Date.now() + i * 3600 * 1000);
        times.push(d.toISOString().substring(0, 19));
        temp2m.push(18.5);
        dew2m.push(11.0);
        wind10m.push(14.0);
        gust10m.push(19.0);
        dir10m.push(180);
        capeArr.push(220);
        rainArr.push(0);
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 45.833,
          longitude: 9.302,
          elevation: 1060,
          utc_offset_seconds: 7200,
          timezone: 'Europe/Rome',
          daily: {
            time: [times[0].substring(0, 10), times[24].substring(0, 10)],
            sunrise: [`${times[0].substring(0, 10)}T06:30:00`, `${times[24].substring(0, 10)}T06:31:00`],
            sunset: [`${times[0].substring(0, 10)}T20:00:00`, `${times[24].substring(0, 10)}T19:58:00`]
          },
          hourly: {
            time: times,
            temperature_2m: temp2m,
            dewpoint_2m: dew2m,
            pressure_msl: new Array(48).fill(1015),
            surface_pressure: new Array(48).fill(900),
            cloudcover_low: new Array(48).fill(10),
            cloudcover_mid: new Array(48).fill(10),
            cloudcover_high: new Array(48).fill(10),
            windspeed_10m: wind10m,
            winddirection_10m: dir10m,
            windgusts_10m: gust10m,
            precipitation: rainArr,
            precipitation_probability: new Array(48).fill(0),
            cape: capeArr,
            shortwave_radiation_instant: new Array(48).fill(500),
            boundary_layer_height: new Array(48).fill(1200),
            temperature_1000hPa: temp2m,
            relative_humidity_1000hPa: new Array(48).fill(60),
            geopotential_height_1000hPa: new Array(48).fill(100),
            temperature_850hPa: temp2m.map(t => t - 6),
            relative_humidity_850hPa: new Array(48).fill(55),
            geopotential_height_850hPa: new Array(48).fill(1500),
            windspeed_850hPa: wind10m,
            winddirection_850hPa: dir10m,
            temperature_700hPa: temp2m.map(t => t - 14),
            relative_humidity_700hPa: new Array(48).fill(50),
            geopotential_height_700hPa: new Array(48).fill(3000),
            windspeed_700hPa: wind10m,
            winddirection_700hPa: dir10m
          }
        })
      };
    };

    let renderedHtml = '';
    const mockContainer = {
      innerHTML: '',
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return null; }
    };

    const controller = new ForecastViewController({
      store: mockStore,
      fetchFn: mockFetch
    });

    controller.mount(mockContainer);

    // Trigger async fetch with mock fetch
    const todayStr = new Date().toISOString().split('T')[0];
    const enriched = await controller.fetchWeatherDataAsync(spot, todayStr);

    assert.ok(enriched, 'Fetch must resolve with enriched weather data');
    assert.equal(enriched._isSynthetic, false, 'Must be marked as non-synthetic real data');
    assert.equal(controller.networkStatus, 'live', 'Network status must transition to live');
    assert.deepEqual(mockStore.getState().weatherData, enriched, 'Store must be synchronized with live weather payload');

    controller.unmount();
  });

  it('should gracefully handle network failure and fallback to offline mode in ForecastView', async () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({ selectedSpot: spot });

    const failingFetch = async () => {
      throw new Error('Network connection timeout (Simulated DNS failure)');
    };

    const controller = new ForecastViewController({
      store: mockStore,
      fetchFn: failingFetch
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const result = await controller.fetchWeatherDataAsync(spot, todayStr, true);

    assert.equal(controller.networkStatus, 'offline', 'Network status must transition to offline');
    if (result) {
      assert.equal(result.isStaleOfflineFallback, true, 'Fallback result must be marked as stale offline fallback');
    }

    // UI render must still work relying on optimistic/synthetic fallback
    const html = controller.renderHtml();
    assert.ok(html.includes('gm-forecast-view'), 'Forecast view must render without crashing');
    assert.ok(html.includes('Offline / Stima'), 'Status badge must show offline/stima');
  });

  it('should fetch batch weather for multiple comprensori in a single request (HomeDashboardView)', async () => {
    let requestedUrls = [];
    const mockFetch = async (url) => {
      requestedUrls.push(url.toString());
      const times = [
        new Date().toISOString().substring(0, 19),
        new Date(Date.now() + 3600000).toISOString().substring(0, 19)
      ];

      // Return array of 2 results for 2 requested spots
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            latitude: 45.833,
            longitude: 9.302,
            hourly: {
              time: times,
              temperature_2m: [21.0, 22.0],
              dewpoint_2m: [12.0, 12.5],
              windspeed_10m: [11.0, 13.0],
              windgusts_10m: [16.0, 18.0],
              winddirection_10m: [180, 185],
              cape: [300, 450],
              precipitation: [0, 0]
            }
          },
          {
            latitude: 46.224,
            longitude: 12.825,
            hourly: {
              time: times,
              temperature_2m: [19.0, 20.0],
              dewpoint_2m: [10.0, 10.5],
              windspeed_10m: [14.0, 16.0],
              windgusts_10m: [20.0, 22.0],
              winddirection_10m: [190, 195],
              cape: [250, 350],
              precipitation: [0, 0]
            }
          }
        ]
      };
    };

    const targetSpots = [DEFAULT_COMPRENSORI[0], DEFAULT_COMPRENSORI[1]];
    const testCache = new InMemoryCache();
    const batchMap = await fetchBatchComprensoriWeather(targetSpots, {
      fetchFn: mockFetch,
      cache: testCache,
      forceRefresh: true
    });

    assert.equal(batchMap.size, 2, 'Must resolve weather for 2 comprensori');
    assert.ok(batchMap.has(DEFAULT_COMPRENSORI[0].id), 'Must have weather for spot 0');
    assert.ok(batchMap.has(DEFAULT_COMPRENSORI[1].id), 'Must have weather for spot 1');
    assert.equal(requestedUrls.length, 1, 'Must make exactly 1 batch HTTP request for multiple spots');
    assert.ok(requestedUrls[0].includes('latitude=45.833'), 'Must contain multi-latitudes');
  });

  it('should declare .gm-live-badge tokens and animations in css/theme.css', () => {
    const cssContent = fs.readFileSync(path.resolve('css/theme.css'), 'utf-8');
    assert.ok(cssContent.includes('.gm-live-badge'), 'theme.css must declare .gm-live-badge');
    assert.ok(cssContent.includes('.gm-live-badge.live'), 'theme.css must declare .gm-live-badge.live');
    assert.ok(cssContent.includes('.gm-live-badge.loading'), 'theme.css must declare .gm-live-badge.loading');
    assert.ok(cssContent.includes('.gm-live-badge.offline'), 'theme.css must declare .gm-live-badge.offline');
    assert.ok(cssContent.includes('gm-live-pulse'), 'theme.css must define pulse keyframes');
  });
});
