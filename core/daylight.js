/**
 * GlideMind - Pure Headless Daylight & Solar Ephemeris Engine
 * 
 * Computes diurnal flyable windows (sunrise to sunset) for paragliding sites,
 * timelines, charts, and aerological flyability assessments.
 * Governed by engineering-workflow (Section 4): strictly headless, zero DOM.
 */

import { parseCoordinates } from './comprensorio.js';

/**
 * Determines whether a date in Europe/Rome (or central Europe) is in Daylight Saving Time (CEST = UTC+2).
 * DST starts last Sunday of March (02:00 CET -> 03:00 CEST) and ends last Sunday of October (03:00 CEST -> 02:00 CET).
 * 
 * @param {Date} date
 * @returns {boolean}
 */
export function isCentralEuropeanDst(date) {
  const year = date.getUTCFullYear();
  
  // Last Sunday of March
  const march31 = new Date(Date.UTC(year, 2, 31, 1, 0, 0));
  const marchLastSunday = 31 - march31.getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, marchLastSunday, 1, 0, 0));

  // Last Sunday of October
  const oct31 = new Date(Date.UTC(year, 9, 31, 1, 0, 0));
  const octLastSunday = 31 - oct31.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 9, octLastSunday, 1, 0, 0));

  const time = date.getTime();
  return time >= dstStart.getTime() && time < dstEnd.getTime();
}

/**
 * Computes astronomical solar sunrise and sunset in local time for a given latitude, longitude, and date.
 * Based on the standard NOAA solar calculations and solar declination formulas.
 * 
 * @param {number} lat Latitude in decimal degrees (-90 to 90)
 * @param {number} lon Longitude in decimal degrees (-180 to 180)
 * @param {Date|string} [date=new Date()] Target calendar date or ISO string
 * @param {number} [zenith=90.833] Official solar zenith angle (90°50' for atmospheric refraction)
 * @returns {{ sunrise: string, sunset: string, sunriseHour: number, sunsetHour: number }}
 */
export function calculateSolarTimes(lat, lon, date = new Date(), zenith = 90.833) {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : new Date(date);
  const year = d.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000) + 1;

  // Fractional year in radians
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1);

  // Equation of time in minutes
  const eqTime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );

  // Solar declination in radians
  const decl = 0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = lat * (Math.PI / 180);
  const zenithRad = zenith * (Math.PI / 180);

  const cosHourAngle = (Math.cos(zenithRad) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  // Determine timezone offset: for Italy/Central Europe (longitude ~6°E to ~19°E)
  let tzOffsetHours = 1;
  if (lon >= 5 && lon <= 20) {
    tzOffsetHours = isCentralEuropeanDst(d) ? 2 : 1;
  } else {
    // General timezone estimation from longitude
    tzOffsetHours = Math.round(lon / 15);
  }

  // Polar night or midnight sun guard
  if (cosHourAngle > 1) {
    // Sun never rises (polar night)
    return { sunrise: '08:00', sunset: '16:00', sunriseHour: 8, sunsetHour: 16 };
  }
  if (cosHourAngle < -1) {
    // Sun never sets (midnight sun)
    return { sunrise: '04:00', sunset: '22:00', sunriseHour: 4, sunsetHour: 22 };
  }

  const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI); // degrees
  const solarNoonMinutes = 720 - (4 * lon) - eqTime; // UTC minutes

  const sunriseMinutesUtc = solarNoonMinutes - (4 * hourAngle);
  const sunsetMinutesUtc = solarNoonMinutes + (4 * hourAngle);

  const sunriseMinutesLocal = (sunriseMinutesUtc + (tzOffsetHours * 60) + 1440) % 1440;
  const sunsetMinutesLocal = (sunsetMinutesUtc + (tzOffsetHours * 60) + 1440) % 1440;

  const srH = Math.floor(sunriseMinutesLocal / 60);
  const srM = Math.round(sunriseMinutesLocal % 60);
  const ssH = Math.floor(sunsetMinutesLocal / 60);
  const ssM = Math.round(sunsetMinutesLocal % 60);

  const sunriseStr = `${String(srH).padStart(2, '0')}:${String(srM).padStart(2, '0')}`;
  const sunsetStr = `${String(ssH).padStart(2, '0')}:${String(ssM).padStart(2, '0')}`;

  return {
    sunrise: sunriseStr,
    sunset: sunsetStr,
    sunriseHour: srH,
    sunsetHour: ssH
  };
}

/**
 * Extracts coordinates { lat, lon } from arbitrary spot, location, or coordinate representation.
 * 
 * @param {object|string|number[]|null} spotOrCoords
 * @returns {{ lat: number, lon: number }|null}
 */
export function extractSpotCoordinates(spotOrCoords) {
  if (!spotOrCoords) return null;
  const direct = parseCoordinates(spotOrCoords);
  if (direct) return direct;

  // Check spot.takeoffs
  if (spotOrCoords.takeoffs && Array.isArray(spotOrCoords.takeoffs) && spotOrCoords.takeoffs.length > 0) {
    for (const t of spotOrCoords.takeoffs) {
      const parsed = parseCoordinates(t.coordinates);
      if (parsed) return parsed;
    }
  }

  // Check spot.landings
  if (spotOrCoords.landings && Array.isArray(spotOrCoords.landings) && spotOrCoords.landings.length > 0) {
    for (const l of spotOrCoords.landings) {
      const parsed = parseCoordinates(l.coordinates);
      if (parsed) return parsed;
    }
  }

  // Direct lat/lon properties
  if (typeof spotOrCoords.latitude === 'number' && typeof spotOrCoords.longitude === 'number') {
    return { lat: spotOrCoords.latitude, lon: spotOrCoords.longitude };
  }
  if (typeof spotOrCoords.lat === 'number' && typeof spotOrCoords.lon === 'number') {
    return { lat: spotOrCoords.lat, lon: spotOrCoords.lon };
  }

  return null;
}

/**
 * Central Single Source of Truth (SSOT) resolver for diurnal flyable daylight hours
 * between sunrise and sunset.
 * 
 * Hierarchy:
 * 1. weatherData.daily (Open-Meteo live or synthetic forecast for targetDate)
 * 2. weatherData.daylight (Pre-enriched Open-Meteo daylight descriptor)
 * 3. weatherData.meta (Custom metadata object with sunrise and sunset strings)
 * 4. Astronomical solar ephemeris computed from coordinates and target date
 * 5. Default seasonal fallback (06:00 - 20:00)
 * 
 * @param {object|null} weatherData Weather payload containing daily, daylight, or meta
 * @param {string|null} [targetDate=null] Target date in YYYY-MM-DD format
 * @param {object|string|null} [fallbackLocation=null] Comprensorio, spot, or coordinates
 * @returns {{
 *   sunriseHour: number,
 *   sunsetHour: number,
 *   sunriseStr: string,
 *   sunsetStr: string,
 *   hours: number[]
 * }}
 */
export function resolveDaylightHours(weatherData = null, targetDate = null, fallbackLocation = null) {
  let srStr = null;
  let ssStr = null;
  let srHour = null;
  let ssHour = null;

  const datePrefix = targetDate ? targetDate.slice(0, 10) : null;

  // 1. Check weatherData.daily array
  if (weatherData && weatherData.daily && Array.isArray(weatherData.daily.time)) {
    let dIdx = -1;
    if (datePrefix) {
      dIdx = weatherData.daily.time.findIndex(t => typeof t === 'string' && t.startsWith(datePrefix));
    }
    if (dIdx === -1 && weatherData.daily.time.length > 0) {
      dIdx = 0;
    }

    if (dIdx !== -1) {
      const dailySr = weatherData.daily.sunrise?.[dIdx];
      const dailySs = weatherData.daily.sunset?.[dIdx];
      if (dailySr) {
        srStr = String(dailySr).includes('T') ? String(dailySr).substring(11, 16) : String(dailySr);
        const parsed = parseInt(srStr.split(':')[0], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) srHour = parsed;
      }
      if (dailySs) {
        ssStr = String(dailySs).includes('T') ? String(dailySs).substring(11, 16) : String(dailySs);
        const parsed = parseInt(ssStr.split(':')[0], 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) ssHour = parsed;
      }
    }
  }

  // 2. Check weatherData.daylight
  if ((srHour === null || ssHour === null) && weatherData && weatherData.daylight) {
    if (typeof weatherData.daylight.sunriseHour === 'number' && weatherData.daylight.sunriseHour >= 0 && weatherData.daylight.sunriseHour <= 23) {
      srHour = weatherData.daylight.sunriseHour;
      srStr = weatherData.daylight.sunrise || `${String(srHour).padStart(2, '0')}:00`;
    }
    if (typeof weatherData.daylight.sunsetHour === 'number' && weatherData.daylight.sunsetHour >= 0 && weatherData.daylight.sunsetHour <= 23) {
      ssHour = weatherData.daylight.sunsetHour;
      ssStr = weatherData.daylight.sunset || `${String(ssHour).padStart(2, '0')}:00`;
    }
  }

  // 3. Check weatherData.meta
  if ((srHour === null || ssHour === null) && weatherData && weatherData.meta) {
    if (typeof weatherData.meta.sunrise === 'string' && weatherData.meta.sunrise.includes(':')) {
      srStr = weatherData.meta.sunrise;
      const parsed = parseInt(srStr.split(':')[0], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) srHour = parsed;
    }
    if (typeof weatherData.meta.sunset === 'string' && weatherData.meta.sunset.includes(':')) {
      ssStr = weatherData.meta.sunset;
      const parsed = parseInt(ssStr.split(':')[0], 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) ssHour = parsed;
    }
  }

  // 4. Compute astronomical solar ephemeris if coordinates are available
  if (srHour === null || ssHour === null) {
    const coords = extractSpotCoordinates(fallbackLocation) ||
      (weatherData ? extractSpotCoordinates({ lat: weatherData.latitude, lon: weatherData.longitude }) : null);

    if (coords) {
      const solar = calculateSolarTimes(coords.lat, coords.lon, targetDate || new Date());
      if (srHour === null) {
        srHour = solar.sunriseHour;
        srStr = solar.sunrise;
      }
      if (ssHour === null) {
        ssHour = solar.sunsetHour;
        ssStr = solar.sunset;
      }
    }
  }

  // 5. Final fallback guards and normalization (nominal 08:00 - 20:00 window)
  if (srHour === null || isNaN(srHour)) srHour = 8;
  if (ssHour === null || isNaN(ssHour)) ssHour = 20;

  if (srHour > ssHour) {
    srHour = 8;
    ssHour = 20;
  }

  if (!srStr) srStr = `${String(srHour).padStart(2, '0')}:00`;
  if (!ssStr) ssStr = `${String(ssHour).padStart(2, '0')}:00`;

  const hours = [];
  for (let h = srHour; h <= ssHour; h++) {
    hours.push(h);
  }

  return {
    sunriseHour: srHour,
    sunsetHour: ssHour,
    sunriseStr: srStr,
    sunsetStr: ssStr,
    hours
  };
}
