/**
 * GlideMind - Unit Conversion & Formatting Utilities Tests (Headless Core)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertWindSpeed,
  formatWindSpeed,
  convertAltitude,
  formatAltitude,
  convertVario,
  formatVario
} from '../../core/units.js';

describe('core/units.js - Pure Headless Unit Conversions & Formatting', () => {
  it('converts and formats wind speed across km/h and knots', () => {
    assert.equal(convertWindSpeed(36, 'km/h'), 36);
    assert.equal(convertWindSpeed(36, 'knots'), 19);
    assert.equal(convertWindSpeed(36, 'kt'), 19);
    assert.equal(convertWindSpeed(NaN, 'km/h'), 0);

    assert.equal(formatWindSpeed(38, 'km/h'), '38 km/h');
    assert.equal(formatWindSpeed(36, 'knots'), '19 kt');
    assert.equal(formatWindSpeed(36, 'kt'), '19 kt');
  });

  it('converts and formats altitude across m and ft', () => {
    assert.equal(convertAltitude(1000, 'm'), 1000);
    assert.equal(convertAltitude(1000, 'ft'), 3281);
    assert.equal(convertAltitude(NaN, 'm'), 0);

    assert.equal(formatAltitude(1250, 'm'), '1250 m');
    assert.equal(formatAltitude(1000, 'ft'), '3281 ft');
    assert.equal(formatAltitude(NaN, 'm'), '0 m');
  });

  it('converts and formats vario climb rate across m/s and fpm', () => {
    assert.equal(convertVario(2.5, 'm/s'), 2.5);
    assert.equal(convertVario(1.0, 'fpm'), 197);
    assert.equal(convertVario(NaN, 'm/s'), 0);

    assert.equal(formatVario(2.4, 'm/s'), '+2.4 m/s');
    assert.equal(formatVario(-1.2, 'm/s'), '-1.2 m/s');
    assert.equal(formatVario(1.0, 'fpm'), '+197 fpm');
  });
});
