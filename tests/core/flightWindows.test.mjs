/**
 * GlideMind - Flight Windows Headless Unit Tests
 * 
 * Verifies diurnal time-window segmentation, operational Italian briefing synthesis,
 * and takeoff forcing contracts in pure Node.js runtime.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFlightWindows } from '../../core/flightWindows.js';
import { DEFAULT_COMPRENSORI } from '../../core/comprensorio.js';
import { DEFAULT_GLIDER } from '../../core/gliders.js';

describe('Flight Windows Headless Engine (core/flightWindows.js)', () => {
  const spot = DEFAULT_COMPRENSORI[0]; // Monte Cornizzolo

  /**
   * Helper to build synthetic 24h weather payload
   */
  function createSyntheticWeather({
    windSpeed = 12,
    windGust = 16,
    windDir = 170, // In axis with Cornizzolo Risparmio (heading 170)
    cape = 150,
    rain = 0,
    temp = 20,
    landingWindSpeed = 8
  } = {}) {
    const times = [];
    const speeds = [];
    const gusts = [];
    const dirs = [];
    const capes = [];
    const rains = [];
    const temps = [];
    const lSpeeds = [];

    for (let h = 0; h < 24; h++) {
      const timeStr = `2026-10-15T${String(h).padStart(2, '0')}:00`;
      times.push(timeStr);
      speeds.push(typeof windSpeed === 'function' ? windSpeed(h) : windSpeed);
      gusts.push(typeof windGust === 'function' ? windGust(h) : windGust);
      dirs.push(typeof windDir === 'function' ? windDir(h) : windDir);
      capes.push(typeof cape === 'function' ? cape(h) : cape);
      rains.push(typeof rain === 'function' ? rain(h) : rain);
      temps.push(typeof temp === 'function' ? temp(h) : temp);
      lSpeeds.push(typeof landingWindSpeed === 'function' ? landingWindSpeed(h) : landingWindSpeed);
    }

    return {
      hourly: {
        time: times,
        windspeed_10m: speeds,
        windgusts_10m: gusts,
        winddirection_10m: dirs,
        temperature_2m: temps,
        cape: capes,
        precipitation: rains
      },
      landingWeather: {
        hourly: {
          time: times,
          windspeed_10m: lSpeeds,
          windgusts_10m: lSpeeds.map(s => s + 4),
          winddirection_10m: dirs
        }
      }
    };
  }

  it('should return empty array when comprensorio is missing or invalid', () => {
    assert.deepEqual(calculateFlightWindows({ comprensorio: null }), []);
    assert.deepEqual(calculateFlightWindows({ comprensorio: undefined }), []);
  });

  it('should partition daylight into 3-4 natural operational windows with valid structure', () => {
    const weather = createSyntheticWeather({
      windSpeed: 10,
      windGust: 14,
      windDir: 170,
      landingWindSpeed: 8
    });

    const windows = calculateFlightWindows({
      comprensorio: spot,
      weatherData: weather,
      targetDate: '2026-10-15',
      glider: DEFAULT_GLIDER
    });

    assert.ok(Array.isArray(windows));
    assert.ok(windows.length >= 3 && windows.length <= 4, `Expected 3-4 windows, got ${windows.length}`);

    for (const win of windows) {
      assert.ok(win.id, 'window should have id');
      assert.ok(win.phaseName, 'window should have phaseName');
      assert.ok(win.timeRange.includes(' - '), 'timeRange formatted as HH:00 - HH:00');
      assert.ok(win.startHour <= win.endHour, 'startHour <= endHour');
      assert.ok(['flyable', 'caution', 'unflyable'].includes(win.status), 'valid status');
      assert.ok(win.title, 'window should have descriptive title');
      assert.ok(win.description.length > 10, 'window should have narrative description');
      assert.ok(win.takeoff && win.takeoff.name, 'window should specify takeoff');
      assert.ok(win.landing && win.landing.name, 'window should specify landing');
      assert.equal(win.isForcedTakeoff, false);
    }

    // In optimal weather, morning and midday should be flyable
    assert.equal(windows[0].status, 'flyable');
    assert.ok(windows[0].title.includes('Volo Calmo') || windows[0].title.includes('Planate'));
  });

  it('should detect morning calm vs afternoon breeze and turbulence correctly', () => {
    // Dynamic diurnal profile: calm morning (8 km/h), windy & turbulent afternoon (24 km/h gust 32)
    const weather = createSyntheticWeather({
      windSpeed: (h) => (h < 13 ? 8 : 22),
      windGust: (h) => (h < 13 ? 12 : 30),
      windDir: 170,
      landingWindSpeed: (h) => (h < 13 ? 6 : 24)
    });

    const windows = calculateFlightWindows({
      comprensorio: spot,
      weatherData: weather,
      targetDate: '2026-10-15',
      glider: DEFAULT_GLIDER
    });

    assert.ok(windows.length >= 3);

    // Morning is calm and flyable
    const morning = windows[0];
    assert.equal(morning.status, 'flyable');

    // Afternoon has strong wind or landing breeze
    const afternoon = windows.find(w => w.phaseId === 'afternoon') || windows[windows.length - 2];
    assert.ok(afternoon.status === 'caution' || afternoon.status === 'unflyable');
    assert.ok(afternoon.hazards.length > 0, 'hazards must be populated');
  });

  it('should flag severe rain or excessive wind as unflyable with explicit reason', () => {
    const rainWeather = createSyntheticWeather({
      rain: 3.5 // heavy rain all day
    });

    const windows = calculateFlightWindows({
      comprensorio: spot,
      weatherData: rainWeather,
      targetDate: '2026-10-15',
      glider: DEFAULT_GLIDER
    });

    for (const win of windows) {
      assert.equal(win.status, 'unflyable');
      assert.ok(win.title.includes('Precipitazioni') || win.description.includes('Pioggia'));
    }
  });

  it('should respect forced takeoff selection and provide alternative hint when degraded', () => {
    // Multi-takeoff comprensorio with South (heading 170) and West/East slopes
    // Wind from 180° (South) -> South is in axis (170°), North/Centrale might differ
    const multiComprensorio = {
      id: 'test-comprensorio',
      name: 'Test Monte',
      location: 'Test',
      takeoffs: [
        {
          id: 'takeoff-south',
          name: 'Decollo Sud',
          heading: 180,
          altitude: 1200,
          isPrimary: true
        },
        {
          id: 'takeoff-north',
          name: 'Decollo Nord',
          heading: 0,
          altitude: 1100,
          isPrimary: false
        }
      ],
      landings: [
        {
          id: 'landing-main',
          name: 'Atterraggio Valle',
          altitude: 300,
          isPrimary: true,
          isOfficial: true
        }
      ]
    };

    // Wind from South (180°) at 14 km/h:
    // Takeoff South is perfect (frontal)
    // Takeoff North is tailwind / lee-side (severe / unflyable)
    const southWindWeather = createSyntheticWeather({
      windSpeed: 14,
      windGust: 18,
      windDir: 180,
      landingWindSpeed: 8
    });

    // Case A: User forces Takeoff North (which is in tailwind)
    const forcedNorthWindows = calculateFlightWindows({
      comprensorio: multiComprensorio,
      weatherData: southWindWeather,
      targetDate: '2026-10-15',
      glider: DEFAULT_GLIDER,
      forcedTakeoffId: 'takeoff-north'
    });

    assert.ok(forcedNorthWindows.length >= 3);
    for (const win of forcedNorthWindows) {
      assert.equal(win.isForcedTakeoff, true);
      assert.equal(win.takeoff.id, 'takeoff-north', 'Must strictly evaluate the forced takeoff');
      assert.equal(win.status, 'unflyable', 'Tailwind on forced takeoff must be unflyable');
      assert.ok(win.alternativeTakeoff, 'Should provide alternative takeoff hint');
      assert.equal(win.alternativeTakeoff.id, 'takeoff-south', 'Alternative should recommend Takeoff South');
      assert.ok(win.description.includes('Decollo Sud'), 'Narrative description should mention the viable alternative');
    }

    // Case B: User forces Takeoff South (which is in axis)
    const forcedSouthWindows = calculateFlightWindows({
      comprensorio: multiComprensorio,
      weatherData: southWindWeather,
      targetDate: '2026-10-15',
      glider: DEFAULT_GLIDER,
      forcedTakeoffId: 'takeoff-south'
    });

    assert.ok(forcedSouthWindows.length >= 3);
    assert.equal(forcedSouthWindows[0].isForcedTakeoff, true);
    assert.equal(forcedSouthWindows[0].takeoff.id, 'takeoff-south');
    assert.equal(forcedSouthWindows[0].status, 'flyable');
    assert.equal(forcedSouthWindows[0].alternativeTakeoff, null, 'No alternative needed when forced takeoff is optimal');
  });
});
