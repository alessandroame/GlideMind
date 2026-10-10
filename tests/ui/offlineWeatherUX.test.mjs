import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../core/store.js';
import { HomeDashboardViewController } from '../../ui/views/HomeDashboardView.js';
import { DEFAULT_COMPRENSORI, evaluateComprensorio } from '../../core/comprensorio.js';

describe('Offline & Unavailable Weather Data UX Governance', () => {
  it('should evaluate comprensorio as unavailable when weatherData is null and allowSynthetic is false', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const evaluated = evaluateComprensorio({
      comprensorio: spot,
      weatherData: null,
      allowSynthetic: false
    });

    assert.equal(evaluated.status, 'unavailable');
    assert.equal(evaluated.badge, 'Dati N/D');
    assert.equal(evaluated.isOfflineUnavailable, true);
    assert.equal(evaluated.weatherSnapshot.windSpeed, null);
    assert.equal(evaluated.weatherSnapshot.windDir, null);
    assert.ok(evaluated.takeoff, 'Orographic takeoff must be preserved');
    assert.ok(evaluated.landing, 'Orographic landing must be preserved');
    assert.ok(evaluated.glideMetrics.requiredGlideRatio > 0, 'Geometric glide ratio must be calculated');
  });

  it('should render clean offline state in HomeDashboard spot cards without fake wind or false flyability verdicts', () => {
    // Controller with an empty cache and no mock weather
    const mockStore = createStore();
    const controller = new HomeDashboardViewController({ store: mockStore });
    const html = controller.renderHtml();

    // Verify spot cards reflect unavailable state
    assert.ok(html.includes('gm-badge-nd'), 'Must render neutral N/D badge');
    assert.ok(html.includes('Dati N/D'), 'Must display Dati N/D text');
    assert.ok(html.includes('-- km/h'), 'Must display dash placeholder for wind speed');
    assert.ok(!html.includes('da SW (212°)'), 'Must not display fake wind direction');
    assert.ok(html.includes('Previsione non disponibile offline'), 'Must show explainability message');

    // Verify geometric orography is still present
    assert.ok(html.includes('gm-glide-label">Efficienza</span>'), 'Geometric glide ratio label must exist');
    assert.ok(/1:\d+\.\d+/.test(html), 'Geometric glide ratio must be preserved');
  });

  it('should safely terminate loading state and transition to offline if batch weather fetch fails', async () => {
    const mockStore = createStore({ activeDate: '2026-10-22' });
    const failingFetch = async () => {
      throw new Error('Network error (Simulated offline condition)');
    };

    const controller = new HomeDashboardViewController({
      store: mockStore,
      fetchFn: failingFetch
    });

    // Invoke batch weather fetch with simulated network failure
    await controller.fetchBatchWeatherAsync();

    // Status must be offline, not stuck in loading
    assert.equal(controller.networkStatus, 'offline', 'Network status must transition to offline');
    assert.equal(controller.isLoading, false, 'Loading flag must be cleared');

    const badgeHtml = controller.renderLiveWeatherBadge();
    assert.ok(!badgeHtml.includes('Aggiornamento...'), 'Live badge must not stay stuck in Aggiornamento...');
    assert.ok(badgeHtml.includes('Offline'), 'Live badge must declare offline state');

    // Cards must render with unavailable indicators
    const evaluated = controller.getEvaluatedComprensori();
    assert.ok(evaluated.length > 0);
    assert.equal(evaluated[0].status, 'unavailable');
    assert.equal(evaluated[0].badge, 'Dati N/D');
  });

  it('should render real flyability verdicts when cached data is available for the active date', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({ activeDate: '2026-10-10', pinnedSpotIds: [spot.id] });
    const controller = new HomeDashboardViewController({ store: mockStore });

    const mockPayload = {
      targetDate: '2026-10-10',
      hourly: {
        time: ['2026-10-10T14:00'],
        wind_speed_10m: [12.0],
        wind_gusts_10m: [16.0],
        wind_direction_10m: [180],
        cape: [100],
        precipitation: [0],
        turbulence_edr: [0.10],
        temperature_2m: [20]
      }
    };

    // Store in controller date-keyed cache
    controller.cachedWeatherMap.set(`${spot.id}_2026-10-10`, mockPayload);

    const evaluated = controller.getEvaluatedComprensori();
    const evaluatedSpot = evaluated.find(s => s.comprensorioId === spot.id);

    assert.ok(evaluatedSpot, 'Spot must be evaluated');
    assert.notEqual(evaluatedSpot.status, 'unavailable', 'Spot with cache must not be unavailable');
    assert.equal(evaluatedSpot.weatherSnapshot.windSpeed, 12);
    assert.equal(evaluatedSpot.weatherSnapshot.windDir, 180);
  });
});
