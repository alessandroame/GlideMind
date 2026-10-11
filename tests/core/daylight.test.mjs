import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSolarTimes,
  isCentralEuropeanDst,
  extractSpotCoordinates,
  resolveDaylightHours
} from '../../core/daylight.js';

describe('Daylight & Solar Ephemeris Engine (Core Domain)', () => {
  it('should correctly identify Central European DST boundaries', () => {
    // Winter: January 15 (CET = UTC+1)
    assert.equal(isCentralEuropeanDst(new Date('2026-01-15T12:00:00Z')), false);

    // Summer: July 15 (CEST = UTC+2)
    assert.equal(isCentralEuropeanDst(new Date('2026-07-15T12:00:00Z')), true);

    // Transition month March: March 10 (CET) vs March 30 (CEST)
    assert.equal(isCentralEuropeanDst(new Date('2026-03-10T12:00:00Z')), false);
    assert.equal(isCentralEuropeanDst(new Date('2026-03-30T12:00:00Z')), true);

    // Transition month October: October 10 (CEST) vs October 30 (CET)
    assert.equal(isCentralEuropeanDst(new Date('2026-10-10T12:00:00Z')), true);
    assert.equal(isCentralEuropeanDst(new Date('2026-10-30T12:00:00Z')), false);
  });

  it('should compute astronomical solar sunrise and sunset for Alps / Northern Italy coordinates', () => {
    const lat = 45.833;
    const lon = 9.302; // Monte Cornizzolo

    // Summer Solstice: June 21 (Longest day, sunrise ~05:30, sunset ~21:15 CEST)
    const summer = calculateSolarTimes(lat, lon, '2026-06-21');
    assert.equal(summer.sunriseHour, 5);
    assert.equal(summer.sunsetHour, 21);
    assert.ok(summer.sunrise.startsWith('05:'));
    assert.ok(summer.sunset.startsWith('21:'));

    // Winter Solstice: December 21 (Shortest day, sunrise ~08:00, sunset ~16:40 CET)
    const winter = calculateSolarTimes(lat, lon, '2026-12-21');
    assert.equal(winter.sunriseHour, 8);
    assert.equal(winter.sunsetHour, 16);
    assert.ok(winter.sunrise.startsWith('08:'));
    assert.ok(winter.sunset.startsWith('16:'));

    // Autumn: October 11 (Sunrise ~07:35, sunset ~18:40 CEST)
    const autumn = calculateSolarTimes(lat, lon, '2026-10-11');
    assert.equal(autumn.sunriseHour, 7);
    assert.equal(autumn.sunsetHour, 18);
    assert.ok(autumn.sunrise.startsWith('07:'));
    assert.ok(autumn.sunset.startsWith('18:'));
  });

  it('should extract coordinates from various spot or coordinate representations', () => {
    // Direct string
    const sCoord = extractSpotCoordinates('45.833, 9.302');
    assert.deepEqual(sCoord, { lat: 45.833, lon: 9.302 });

    // Object with takeoffs
    const spotObj = {
      name: 'Cornizzolo',
      takeoffs: [{ coordinates: '45.834, 9.290' }]
    };
    const tCoord = extractSpotCoordinates(spotObj);
    assert.deepEqual(tCoord, { lat: 45.834, lon: 9.290 });

    // Lat/Lon direct properties
    const propCoord = extractSpotCoordinates({ latitude: 46.22, longitude: 12.82 });
    assert.deepEqual(propCoord, { lat: 46.22, lon: 12.82 });

    // Null or invalid input
    assert.equal(extractSpotCoordinates(null), null);
    assert.equal(extractSpotCoordinates('invalid'), null);
  });

  it('should resolve daylight hours strictly between sunrise and sunset from weatherData.daily', () => {
    const weatherData = {
      daily: {
        time: ['2026-06-21', '2026-06-22'],
        sunrise: ['2026-06-21T05:34:00', '2026-06-22T05:35:00'],
        sunset: ['2026-06-21T21:14:00', '2026-06-22T21:14:00']
      }
    };

    const daylight = resolveDaylightHours(weatherData, '2026-06-21');
    assert.equal(daylight.sunriseHour, 5);
    assert.equal(daylight.sunsetHour, 21);
    assert.equal(daylight.sunriseStr, '05:34');
    assert.equal(daylight.sunsetStr, '21:14');
    assert.equal(daylight.hours[0], 5);
    assert.equal(daylight.hours[daylight.hours.length - 1], 21);
    assert.equal(daylight.hours.length, 17); // 5..21 inclusive = 17 slots
  });

  it('should resolve winter daylight window from weatherData.daily with shorter hours', () => {
    const weatherData = {
      daily: {
        time: ['2026-12-21'],
        sunrise: ['2026-12-21T08:02:00'],
        sunset: ['2026-12-21T16:42:00']
      }
    };

    const daylight = resolveDaylightHours(weatherData, '2026-12-21');
    assert.equal(daylight.sunriseHour, 8);
    assert.equal(daylight.sunsetHour, 16);
    assert.equal(daylight.hours[0], 8);
    assert.equal(daylight.hours[daylight.hours.length - 1], 16);
    assert.equal(daylight.hours.length, 9); // 8..16 inclusive = 9 slots
  });

  it('should resolve daylight from weatherData.daylight or weatherData.meta fallback', () => {
    const metaWeather = {
      meta: {
        sunrise: '06:15',
        sunset: '19:45'
      }
    };

    const daylight = resolveDaylightHours(metaWeather);
    assert.equal(daylight.sunriseHour, 6);
    assert.equal(daylight.sunsetHour, 19);
    assert.equal(daylight.hours[0], 6);
    assert.equal(daylight.hours[daylight.hours.length - 1], 19);
    assert.equal(daylight.hours.length, 14); // 6..19 inclusive = 14 slots
  });

  it('should calculate solar daylight when weather data is missing but location is known', () => {
    const spot = {
      takeoffs: [{ coordinates: '45.833, 9.302' }]
    };

    // June 21 without weather data
    const daylight = resolveDaylightHours(null, '2026-06-21', spot);
    assert.equal(daylight.sunriseHour, 5);
    assert.equal(daylight.sunsetHour, 21);
    assert.ok(daylight.hours.includes(12));
    assert.equal(daylight.hours[0], 5);
  });
});
