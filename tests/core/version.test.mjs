import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_VERSION,
  APP_BUILD,
  APP_BUILD_DATE,
  getFormattedVersion,
  getFormattedBuild
} from '../../core/version.js';

describe('GlideMind Version & Build Metadata Contracts', () => {
  it('should export non-empty semantic version and build identifiers', () => {
    assert.ok(typeof APP_VERSION === 'string' && APP_VERSION.length > 0, 'APP_VERSION must be valid string');
    assert.ok(typeof APP_BUILD === 'string' && APP_BUILD.length > 0, 'APP_BUILD must be valid string');
    assert.ok(typeof APP_BUILD_DATE === 'string' && APP_BUILD_DATE.length > 0, 'APP_BUILD_DATE must be valid string');
  });

  it('should format version with leading v prefix', () => {
    const formatted = getFormattedVersion();
    assert.equal(formatted, `v${APP_VERSION}`);
    assert.ok(formatted.startsWith('v'), 'Must start with v');
  });

  it('should format build with build prefix', () => {
    const formatted = getFormattedBuild();
    assert.equal(formatted, `build ${APP_BUILD}`);
    assert.ok(formatted.startsWith('build '), 'Must start with build ');
  });
});
