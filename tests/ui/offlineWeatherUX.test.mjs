import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStore } from '../../core/store.js';
import { HomeDashboardViewController } from '../../ui/views/HomeDashboardView.js';
import { DEFAULT_COMPRENSORI, evaluateComprensorio } from '../../core/comprensorio.js';
import { GLIDER_CLASSES } from '../../core/flyability.js';

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

  it('should render 4-state semantic indicator pills with subordinate micro-data in Home spot cards', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    const mockStore = createStore({
      activeDate: '2026-10-10',
      pinnedSpotIds: [spot.id],
      activeGlider: GLIDER_CLASSES.EN_A
    });
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
    controller.cachedWeatherMap.set(`${spot.id}_2026-10-10`, mockPayload);

    const html = controller.renderHtml();

    // Verify presence of indicator pills with dot, semantic label, and micro-data
    assert.ok(html.includes('gm-ind-pill'), 'Must render semantic indicator pills');
    assert.ok(html.includes('gm-ind-dot'), 'Must render semantic status dots');
    assert.ok(html.includes('gm-ind-flyable') || html.includes('gm-ind-caution'), 'Must assign severity class');
    assert.ok(html.includes('gm-ind-micro'), 'Must render subordinate micro-data container');
    assert.ok(html.includes('12 km/h'), 'Must render wind speed in micro-data');
    assert.ok(html.includes('gm-glide-label">Efficienza</span>'), 'Must retain Efficienza label');
  });

  it('should recalculate indicator severity classes when active glider is changed in store', () => {
    const spot = DEFAULT_COMPRENSORI[0];
    // Sustained wind 24 km/h with gusts 30 km/h:
    // For EN-A (vTrim 36): windRed=23, gustRed=29 -> SEVERITY 2 (Unflyable/Red, warn_heavy_gusts)
    // For EN-D (vTrim 42): windRed=27, gustRed=34 -> SEVERITY 1 (Caution/Yellow, mod_heavy_gusts)
    const mockPayload = {
      targetDate: '2026-10-10',
      hourly: {
        time: ['2026-10-10T14:00'],
        wind_speed_10m: [24.0],
        wind_gusts_10m: [30.0],
        wind_direction_10m: [180],
        cape: [50],
        precipitation: [0],
        turbulence_edr: [0.12],
        temperature_2m: [20]
      }
    };

    // 1. With EN-A glider
    const storeEnA = createStore({
      activeDate: '2026-10-10',
      pinnedSpotIds: [spot.id],
      activeGlider: GLIDER_CLASSES.EN_A
    });
    const controllerEnA = new HomeDashboardViewController({ store: storeEnA });
    controllerEnA.cachedWeatherMap.set(`${spot.id}_2026-10-10`, mockPayload);
    const htmlEnA = controllerEnA.renderHtml();

    // Must be red (unflyable) for EN-A
    assert.ok(htmlEnA.includes('gm-ind-unflyable') || htmlEnA.includes('gm-ind-severe'), 'Must be red or severe for beginner EN-A');

    // 2. With EN-D competition glider
    const storeEnD = createStore({
      activeDate: '2026-10-10',
      pinnedSpotIds: [spot.id],
      activeGlider: GLIDER_CLASSES.EN_D
    });
    const controllerEnD = new HomeDashboardViewController({ store: storeEnD });
    controllerEnD.cachedWeatherMap.set(`${spot.id}_2026-10-10`, mockPayload);
    const htmlEnD = controllerEnD.renderHtml();

    // Must be caution (yellow) for EN-D
    assert.ok(htmlEnD.includes('gm-ind-caution'), 'Must be caution (yellow) for high-performance EN-D glider');
  });

  it('should enforce traffic-light indicator design tokens and zero-truncation layout rules in theme.css (Laws of UX & Prägnanz)', () => {
    const cssContent = readFileSync(resolve('css/theme.css'), 'utf-8');

    // 1. Zero bulky background boxes or borders for indicators
    assert.ok(cssContent.includes('.gm-ind-pill {'), 'Must declare .gm-ind-pill rule');
    assert.ok(cssContent.includes('background: transparent;'), 'Must have transparent background for minimal indicator');
    assert.ok(cssContent.includes('border: none;'), 'Must have border: none for minimal indicator');

    // 2. Traffic light status dot tokens
    assert.ok(cssContent.includes('.gm-ind-dot {'), 'Must declare .gm-ind-dot indicator circle');
    assert.ok(cssContent.includes('.gm-ind-flyable .gm-ind-dot'), 'Must style green status dot');
    assert.ok(cssContent.includes('.gm-ind-caution .gm-ind-dot'), 'Must style yellow status dot');
    assert.ok(cssContent.includes('.gm-ind-unflyable .gm-ind-dot'), 'Must style red status dot');
    assert.ok(cssContent.includes('.gm-ind-severe .gm-ind-dot'), 'Must style black/hazard status dot');

    // 3. Progressive disclosure: micro-numbers hidden on mobile triage
    assert.ok(cssContent.includes('.gm-ind-micro {'), 'Must declare .gm-ind-micro rule');
    assert.ok(cssContent.includes('display: none;'), 'Micro-numbers must be hidden on mobile');

    // 4. Layout protection against takeoff/landing name truncation
    assert.ok(cssContent.includes('.gm-flight-label {'), 'Must declare .gm-flight-label rule');
    assert.ok(cssContent.includes('.gm-flight-target {'), 'Must declare .gm-flight-target rule');
    assert.ok(cssContent.includes('.gm-ind-pill .gm-glide-label {'), 'Must declare rule hiding .gm-glide-label in pill');
  });
});
