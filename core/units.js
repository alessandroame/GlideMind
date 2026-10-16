/**
 * GlideMind - Aeronautical Measurement Units Conversion & Formatting (Headless Core)
 * Pure mathematical conversions for wind speed (km/h, knots), altitude (m, ft),
 * and vertical climb/sink rate (m/s, fpm).
 * Zero DOM dependencies.
 */

export const KM_TO_KNOTS = 0.539956803;
export const METERS_TO_FEET = 3.280839895;
export const MS_TO_FPM = 196.8503937;

/**
 * Converts wind speed from km/h to the target unit.
 * @param {number} speedKmh
 * @param {'km/h'|'knots'} [unit='km/h']
 * @returns {number}
 */
export function convertWindSpeed(speedKmh, unit = 'km/h') {
  const val = Number(speedKmh);
  if (!Number.isFinite(val)) return 0;
  if (unit === 'knots' || unit === 'kt') {
    const converted = Math.round(val * KM_TO_KNOTS);
    return converted === 0 ? 0 : converted;
  }
  const rounded = Math.round(val);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Formats wind speed with its unit label.
 * @param {number} speedKmh
 * @param {'km/h'|'knots'} [unit='km/h']
 * @returns {string}
 */
export function formatWindSpeed(speedKmh, unit = 'km/h') {
  const converted = convertWindSpeed(speedKmh, unit);
  const label = (unit === 'knots' || unit === 'kt') ? 'kt' : 'km/h';
  return `${converted} ${label}`;
}

/**
 * Converts altitude or elevation from meters to the target unit.
 * @param {number} meters
 * @param {'m'|'ft'} [unit='m']
 * @returns {number}
 */
export function convertAltitude(meters, unit = 'm') {
  const val = Number(meters);
  if (!Number.isFinite(val)) return 0;
  if (unit === 'ft') {
    const converted = Math.round(val * METERS_TO_FEET);
    return converted === 0 ? 0 : converted;
  }
  const rounded = Math.round(val);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Formats altitude with its unit label.
 * @param {number} meters
 * @param {'m'|'ft'} [unit='m']
 * @returns {string}
 */
export function formatAltitude(meters, unit = 'm') {
  const converted = convertAltitude(meters, unit);
  const label = unit === 'ft' ? 'ft' : 'm';
  return `${converted} ${label}`;
}

/**
 * Converts vertical speed (variometer) from m/s to the target unit.
 * @param {number} varioMs
 * @param {'m/s'|'fpm'} [unit='m/s']
 * @returns {number}
 */
export function convertVario(varioMs, unit = 'm/s') {
  const val = Number(varioMs);
  if (!Number.isFinite(val)) return 0;
  if (unit === 'fpm') {
    const converted = Math.round(val * MS_TO_FPM);
    return converted === 0 ? 0 : converted;
  }
  const rounded = Math.round(val * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Formats vertical speed (variometer) with sign and unit label.
 * @param {number} varioMs
 * @param {'m/s'|'fpm'} [unit='m/s']
 * @returns {string}
 */
export function formatVario(varioMs, unit = 'm/s') {
  const converted = convertVario(varioMs, unit);
  const sign = converted > 0 ? '+' : '';
  if (unit === 'fpm') {
    return `${sign}${converted} fpm`;
  }
  return `${sign}${converted.toFixed(1)} m/s`;
}
