/**
 * GlideMind - Application Version & Build Metadata
 * Single Source of Truth for client runtime versioning, release tag and build stamp.
 */

let detectedBuild = '5bf6d1c';
if (typeof process !== 'undefined' && process.env && process.env.GLIDEMIND_BUILD) {
  detectedBuild = process.env.GLIDEMIND_BUILD;
}

export const APP_VERSION = '2.0.0';
export const APP_BUILD = detectedBuild;
export const APP_BUILD_DATE = '2026-10-09';

/**
 * Returns formatted version string (e.g. "v2.0.0").
 * @returns {string}
 */
export function getFormattedVersion() {
  return `v${APP_VERSION}`;
}

/**
 * Returns formatted build string (e.g. "build 5bf6d1c").
 * @returns {string}
 */
export function getFormattedBuild() {
  return `build ${APP_BUILD}`;
}
