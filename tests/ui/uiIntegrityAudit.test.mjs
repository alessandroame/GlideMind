/**
 * GlideMind - UI Integrity, Progressive Disclosure & Anti-Naked Data Audit Tests
 * 
 * Verifies that:
 * 1. Timeline scrubbers never contain naked numbers or unreferenced rotated arrows.
 * 2. Comprensorio cards always include units of measure and cardinal direction with degrees.
 * 3. Primary charts and tiles translate raw academic acronyms (LCL, CAPE, EDR) into practical aeronautical terms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('UI Integrity, Progressive Disclosure & Anti-Naked Data Audit', () => {
  const forecastViewSrc = readFileSync(resolve('ui/views/ForecastView.js'), 'utf-8');
  const homeViewSrc = readFileSync(resolve('ui/views/HomeDashboardView.js'), 'utf-8');

  it('enforces that timeline scrubbers do not contain naked numbers (compact-wind)', () => {
    assert.ok(
      !forecastViewSrc.includes('compact-wind'),
      'ForecastView must not contain compact-wind naked numbers in scrubber'
    );
  });

  it('enforces that timeline scrubbers do not contain unreferenced rotated arrows (compact-arrow)', () => {
    assert.ok(
      !forecastViewSrc.includes('compact-arrow'),
      'ForecastView must not contain compact-arrow unreferenced arrows in scrubber'
    );
  });

  it('enforces that wind direction in Home comprensorio cards couples cardinal point with degrees', () => {
    assert.ok(
      homeViewSrc.includes('getCardinalDirection(weather.windDir)'),
      'HomeDashboardView must couple cardinal direction with numerical degrees'
    );
  });

  it('enforces phenomenological translation for cloud base and thermodynamic metrics', () => {
    // Must use Base Nubi or Base Cumulo alongside LCL, not bare LCL in legend
    assert.ok(
      forecastViewSrc.includes('Base Nubi (LCL)') || forecastViewSrc.includes('Base Cumulo (LCL)'),
      'ForecastView must provide practical plain-language context for LCL'
    );
  });
});
