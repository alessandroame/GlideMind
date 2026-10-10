/**
 * GlideMind - Paraglider Models, Brands & Certification Catalog (Headless Core)
 * 
 * Provides domain models and presets for paragliding wings:
 * 1. EN certification classes (EN-A, EN-B, EN-C, EN-D / CCC) with physical aerodynamic limits.
 * 2. Curated database of top paraglider manufacturers and iconic models.
 * 3. Search and filtering by brand, model name, and EN category.
 * 4. Custom wing creation with automated aerodynamic parameter deduction.
 * 
 * ZERO DOM DEPENDENCIES: 100% pure Node.js headless testable.
 */

/**
 * Standard EN certification classes and aerodynamic baseline envelopes.
 */
export const GLIDER_CLASSES = Object.freeze({
  EN_A: Object.freeze({
    id: 'generic-en-a',
    brand: 'Generica',
    model: 'Scuola / Principiante (EN-A)',
    name: 'Scuola / Principiante (EN-A)',
    category: 'EN-A',
    vTrim: 36,
    vMax: 46,
    ar: 4.8,
    glideRatio: 7.8,
    description: 'Massima sicurezza passiva e tolleranza al comando. Ideale per scuola e primi voli.'
  }),
  EN_B: Object.freeze({
    id: 'generic-en-b',
    brand: 'Generica',
    model: 'Standard / Intermedio (EN-B)',
    name: 'Standard / Intermedio (EN-B)',
    category: 'EN-B',
    vTrim: 38,
    vMax: 50,
    ar: 5.3,
    glideRatio: 8.6,
    description: 'Equilibrio ottimale tra sicurezza e prestazioni per voli termici e cross-country.'
  }),
  EN_C: Object.freeze({
    id: 'generic-en-c',
    brand: 'Generica',
    model: 'Sport / Avanzato (EN-C)',
    name: 'Sport / Avanzato (EN-C)',
    category: 'EN-C',
    vTrim: 40,
    vMax: 55,
    ar: 6.2,
    glideRatio: 9.8,
    description: 'Prestazioni elevate e pilotaggio attivo richiesto in condizioni turbolente.'
  }),
  EN_D: Object.freeze({
    id: 'generic-en-d',
    brand: 'Generica',
    model: 'Competizione (EN-D / CCC)',
    name: 'Competizione (EN-D / CCC)',
    category: 'EN-D',
    vTrim: 42,
    vMax: 60,
    ar: 7.0,
    glideRatio: 10.5,
    description: 'Ali da gara a due linee con allungamento elevato per piloti esperti.'
  })
});

/**
 * Default wing fallback (Standard EN-A/B).
 */
export const DEFAULT_GLIDER = Object.freeze({
  id: 'default-standard-en-a',
  brand: 'Standard',
  model: 'EN-A/B',
  name: 'Standard EN-A/B',
  category: 'EN-A',
  vTrim: 37,
  vMax: 50,
  ar: 5.1,
  glideRatio: 8.5
});

/**
 * Recognized paraglider manufacturers.
 */
export const PARAGLIDER_BRANDS = Object.freeze([
  'Ozone',
  'Advance',
  'Axis',
  'Niviuk',
  'Skywalk',
  'Gin Gliders',
  'Nova',
  'Phi',
  'BGD',
  'Supair',
  'Triple Seven',
  'Flow',
  'Mac Para',
  'UP',
  'AirDesign'
]);

/**
 * Curated catalog of certified paraglider models.
 */
export const POPULAR_GLIDERS = Object.freeze([
  // Ozone
  { id: 'ozone-mojo-6', brand: 'Ozone', model: 'Mojo 6', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: 'ozone-alta', brand: 'Ozone', model: 'Alta', category: 'EN-A', vTrim: 37, vMax: 47, ar: 4.9, glideRatio: 8.2 },
  { id: 'ozone-buzz-z7', brand: 'Ozone', model: 'Buzz Z7', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.8 },
  { id: 'ozone-geo-7', brand: 'Ozone', model: 'Geo 7', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.8 },
  { id: 'ozone-rush-6', brand: 'Ozone', model: 'Rush 6', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.7, glideRatio: 9.3 },
  { id: 'ozone-swift-6', brand: 'Ozone', model: 'Swift 6', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.7, glideRatio: 9.3 },
  { id: 'ozone-delta-4', brand: 'Ozone', model: 'Delta 4', category: 'EN-C', vTrim: 40, vMax: 55, ar: 6.1, glideRatio: 9.9 },
  { id: 'ozone-photon', brand: 'Ozone', model: 'Photon', category: 'EN-C', vTrim: 41, vMax: 58, ar: 6.5, glideRatio: 10.4 },
  { id: 'ozone-mantra-m7', brand: 'Ozone', model: 'Mantra M7', category: 'EN-D', vTrim: 41, vMax: 58, ar: 6.8, glideRatio: 10.6 },
  { id: 'ozone-zeolite-2', brand: 'Ozone', model: 'Zeolite 2', category: 'EN-D', vTrim: 42, vMax: 60, ar: 6.7, glideRatio: 10.7 },
  { id: 'ozone-zeno-2', brand: 'Ozone', model: 'Zeno 2', category: 'EN-D', vTrim: 42, vMax: 62, ar: 6.9, glideRatio: 12.2, sinkMin: 0.92 },
  { id: 'ozone-enzo-3', brand: 'Ozone', model: 'Enzo 3', category: 'EN-D', vTrim: 43, vMax: 65, ar: 7.5, glideRatio: 11.2 },

  // Advance
  { id: 'advance-alpha-7', brand: 'Advance', model: 'Alpha 7', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.1 },
  { id: 'advance-epsilon-dls', brand: 'Advance', model: 'Epsilon DLS', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.8 },
  { id: 'advance-iota-dls', brand: 'Advance', model: 'Iota DLS', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.6, glideRatio: 9.4 },
  { id: 'advance-sigma-dls', brand: 'Advance', model: 'Sigma DLS', category: 'EN-C', vTrim: 40, vMax: 55, ar: 6.0, glideRatio: 10.0 },
  { id: 'advance-omega-uls', brand: 'Advance', model: 'Omega ULS', category: 'EN-D', vTrim: 42, vMax: 60, ar: 6.8, glideRatio: 10.8 },

  // Axis (Canonical ParaMeteo Models)
  { id: 'axis-compact-4', brand: 'Axis', model: 'Compact 4', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.4, sinkMin: 1.06 },
  { id: 'axis-pluto-4', brand: 'Axis', model: 'Pluto 4', category: 'EN-B', vTrim: 37, vMax: 49, ar: 5.05, glideRatio: 9.3, sinkMin: 1.02 },
  { id: 'axis-comet-4', brand: 'Axis', model: 'Comet 4', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.55, glideRatio: 10.3, sinkMin: 0.98 },
  { id: 'axis-vega-6', brand: 'Axis', model: 'Vega 6', category: 'EN-C', vTrim: 40, vMax: 56, ar: 6.25, glideRatio: 11.2, sinkMin: 0.95 },
  { id: 'axis-venus-4-sc', brand: 'Axis', model: 'Venus 4 / SC', category: 'EN-D', vTrim: 41, vMax: 60, ar: 6.95, glideRatio: 11.8, sinkMin: 0.92 },
  { id: 'axis-sirius-2-tandem', brand: 'Axis', model: 'Sirius 2 (Tandem)', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.3, glideRatio: 9.5, sinkMin: 1.10 },

  // Niviuk
  { id: 'niviuk-koyot-5', brand: 'Niviuk', model: 'Koyot 5', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.7, glideRatio: 7.9 },
  { id: 'niviuk-hook-6', brand: 'Niviuk', model: 'Hook 6', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.3, glideRatio: 8.7 },
  { id: 'niviuk-ikuma-3', brand: 'Niviuk', model: 'Ikuma 3', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.7, glideRatio: 9.3 },
  { id: 'niviuk-artik-7', brand: 'Niviuk', model: 'Artik 7', category: 'EN-C', vTrim: 40, vMax: 56, ar: 6.3, glideRatio: 10.1 },
  { id: 'niviuk-artik-r', brand: 'Niviuk', model: 'Artik R', category: 'EN-C', vTrim: 41, vMax: 58, ar: 6.5, glideRatio: 11.5, sinkMin: 0.95 },
  { id: 'niviuk-peak-6', brand: 'Niviuk', model: 'Peak 6', category: 'EN-D', vTrim: 42, vMax: 61, ar: 6.9, glideRatio: 10.9 },

  // Skywalk
  { id: 'skywalk-mescal-6', brand: 'Skywalk', model: 'Mescal 6', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: 'skywalk-tequila-6', brand: 'Skywalk', model: 'Tequila 6', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.7 },
  { id: 'skywalk-chili-5', brand: 'Skywalk', model: 'Chili 5', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.6, glideRatio: 9.4 },
  { id: 'skywalk-mint', brand: 'Skywalk', model: 'Mint', category: 'EN-C', vTrim: 41, vMax: 57, ar: 6.4, glideRatio: 10.3 },
  { id: 'skywalk-x-alps-5', brand: 'Skywalk', model: 'X-Alps 5', category: 'EN-D', vTrim: 42, vMax: 60, ar: 6.9, glideRatio: 10.8 },

  // Gin Gliders
  { id: 'gin-bolero-7', brand: 'Gin Gliders', model: 'Bolero 7', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.7, glideRatio: 7.9 },
  { id: 'gin-calypso-2', brand: 'Gin Gliders', model: 'Calypso 2', category: 'EN-A', vTrim: 37, vMax: 47, ar: 4.9, glideRatio: 8.3 },
  { id: 'gin-evora', brand: 'Gin Gliders', model: 'Evora', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.3, glideRatio: 8.8 },
  { id: 'gin-explorer-2', brand: 'Gin Gliders', model: 'Explorer 2', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.8, glideRatio: 9.5 },
  { id: 'gin-bonanza-3', brand: 'Gin Gliders', model: 'Bonanza 3', category: 'EN-C', vTrim: 41, vMax: 57, ar: 6.3, glideRatio: 10.2 },
  { id: 'gin-boomerang-12', brand: 'Gin Gliders', model: 'Boomerang 12', category: 'EN-D', vTrim: 43, vMax: 65, ar: 7.6, glideRatio: 11.3 },

  // Nova
  { id: 'nova-prion-5', brand: 'Nova', model: 'Prion 5', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.7, glideRatio: 8.0 },
  { id: 'nova-aonic', brand: 'Nova', model: 'Aonic', category: 'EN-A', vTrim: 37, vMax: 48, ar: 5.0, glideRatio: 8.4 },
  { id: 'nova-ion-7', brand: 'Nova', model: 'Ion 7', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.8 },
  { id: 'nova-mentor-7', brand: 'Nova', model: 'Mentor 7', category: 'EN-B', vTrim: 39, vMax: 54, ar: 5.7, glideRatio: 9.6 },
  { id: 'nova-sector', brand: 'Nova', model: 'Sector', category: 'EN-C', vTrim: 40, vMax: 56, ar: 5.92, glideRatio: 11.0, sinkMin: 0.96 },
  { id: 'nova-codex', brand: 'Nova', model: 'Codex', category: 'EN-C', vTrim: 41, vMax: 57, ar: 6.1, glideRatio: 10.1 },
  { id: 'nova-xenon', brand: 'Nova', model: 'Xenon', category: 'EN-D', vTrim: 42, vMax: 60, ar: 6.7, glideRatio: 10.7 },

  // Phi
  { id: 'phi-fantasia', brand: 'Phi', model: 'Fantasia', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.5, glideRatio: 7.8 },
  { id: 'phi-symphonia-2', brand: 'Phi', model: 'Symphonia 2', category: 'EN-A', vTrim: 37, vMax: 48, ar: 5.1, glideRatio: 8.5 },
  { id: 'phi-tenor-2', brand: 'Phi', model: 'Tenor 2', category: 'EN-B', vTrim: 38, vMax: 51, ar: 5.2, glideRatio: 8.9 },
  { id: 'phi-maestro-2', brand: 'Phi', model: 'Maestro 2', category: 'EN-B', vTrim: 39, vMax: 54, ar: 5.6, glideRatio: 9.5 },
  { id: 'phi-allegro', brand: 'Phi', model: 'Allegro', category: 'EN-C', vTrim: 40, vMax: 56, ar: 6.0, glideRatio: 10.0 },
  { id: 'phi-scala-2', brand: 'Phi', model: 'Scala 2', category: 'EN-D', vTrim: 42, vMax: 61, ar: 6.8, glideRatio: 10.8 },

  // BGD
  { id: 'bgd-magic', brand: 'BGD', model: 'Magic', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: 'bgd-adam-2', brand: 'BGD', model: 'Adam 2', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.7, glideRatio: 7.9 },
  { id: 'bgd-epic-2', brand: 'BGD', model: 'Epic 2', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.7 },
  { id: 'bgd-echo-2', brand: 'BGD', model: 'Echo 2', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.7 },
  { id: 'bgd-base-2', brand: 'BGD', model: 'Base 2', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.7, glideRatio: 9.3 },
  { id: 'bgd-cure-2', brand: 'BGD', model: 'Cure 2', category: 'EN-C', vTrim: 40, vMax: 56, ar: 6.4, glideRatio: 10.1 },
  { id: 'bgd-diva-2', brand: 'BGD', model: 'Diva 2', category: 'EN-D', vTrim: 42, vMax: 61, ar: 7.1, glideRatio: 11.0 },

  // Supair
  { id: 'supair-eona-4', brand: 'Supair', model: 'Eona 4', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 7.9 },
  { id: 'supair-birdy', brand: 'Supair', model: 'Birdy', category: 'EN-A', vTrim: 37, vMax: 47, ar: 5.0, glideRatio: 8.3 },
  { id: 'supair-leaf-3', brand: 'Supair', model: 'Leaf 3', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.3, glideRatio: 8.8 },
  { id: 'supair-step-x', brand: 'Supair', model: 'Step X', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.6, glideRatio: 9.4 },
  { id: 'supair-savage', brand: 'Supair', model: 'Savage', category: 'EN-C', vTrim: 41, vMax: 56, ar: 6.5, glideRatio: 10.2 },

  // Triple Seven (777)
  { id: '777-pawn', brand: 'Triple Seven', model: 'Pawn', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: '777-knight-2', brand: 'Triple Seven', model: 'Knight 2', category: 'EN-B', vTrim: 38, vMax: 51, ar: 5.2, glideRatio: 8.9 },
  { id: '777-rook-4', brand: 'Triple Seven', model: 'Rook 4', category: 'EN-B', vTrim: 39, vMax: 54, ar: 5.6, glideRatio: 9.5 },
  { id: '777-queen-3', brand: 'Triple Seven', model: 'Queen 3', category: 'EN-C', vTrim: 41, vMax: 57, ar: 6.3, glideRatio: 10.2 },
  { id: '777-king-2', brand: 'Triple Seven', model: 'King 2', category: 'EN-D', vTrim: 42, vMax: 61, ar: 6.9, glideRatio: 10.9 },

  // Flow Paragliders
  { id: 'flow-cosmos-2', brand: 'Flow', model: 'Cosmos 2', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: 'flow-freedom-2', brand: 'Flow', model: 'Freedom 2', category: 'EN-B', vTrim: 38, vMax: 51, ar: 5.4, glideRatio: 9.0 },
  { id: 'flow-fusion', brand: 'Flow', model: 'Fusion', category: 'EN-C', vTrim: 40, vMax: 56, ar: 6.3, glideRatio: 10.1 },
  { id: 'flow-spectra-2', brand: 'Flow', model: 'Spectra 2', category: 'EN-D', vTrim: 43, vMax: 64, ar: 7.4, glideRatio: 11.2 },

  // Mac Para
  { id: 'macpara-muse-5', brand: 'Mac Para', model: 'Muse 5', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.7, glideRatio: 7.9 },
  { id: 'macpara-illusion-2', brand: 'Mac Para', model: 'Illusion 2', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.2, glideRatio: 8.7 },
  { id: 'macpara-eden-7', brand: 'Mac Para', model: 'Eden 7', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.6, glideRatio: 9.3 },
  { id: 'macpara-elan-3', brand: 'Mac Para', model: 'Elan 3', category: 'EN-C', vTrim: 40, vMax: 56, ar: 6.2, glideRatio: 10.0 },

  // UP Paragliders
  { id: 'up-ascent-4', brand: 'UP', model: 'Ascent 4', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: 'up-kibo-2', brand: 'UP', model: 'Kibo 2', category: 'EN-B', vTrim: 38, vMax: 51, ar: 5.3, glideRatio: 8.8 },
  { id: 'up-summit-xc4', brand: 'UP', model: 'Summit XC4', category: 'EN-B', vTrim: 39, vMax: 54, ar: 5.7, glideRatio: 9.4 },
  { id: 'up-trango-x-race', brand: 'UP', model: 'Trango X-Race', category: 'EN-C', vTrim: 41, vMax: 57, ar: 6.4, glideRatio: 10.2 },
  { id: 'up-meru', brand: 'UP', model: 'Meru', category: 'EN-D', vTrim: 42, vMax: 61, ar: 6.9, glideRatio: 10.9 },

  // AirDesign
  { id: 'airdesign-eiko-2', brand: 'AirDesign', model: 'Eiko 2', category: 'EN-A', vTrim: 36, vMax: 46, ar: 4.8, glideRatio: 8.0 },
  { id: 'airdesign-vivo-2', brand: 'AirDesign', model: 'Vivo 2', category: 'EN-B', vTrim: 38, vMax: 50, ar: 5.3, glideRatio: 8.8 },
  { id: 'airdesign-soar-2', brand: 'AirDesign', model: 'Soar 2', category: 'EN-B', vTrim: 39, vMax: 53, ar: 5.7, glideRatio: 9.4 },
  { id: 'airdesign-volt-4', brand: 'AirDesign', model: 'Volt 4', category: 'EN-C', vTrim: 41, vMax: 57, ar: 6.5, glideRatio: 10.3 },
  { id: 'airdesign-hero-2', brand: 'AirDesign', model: 'Hero 2', category: 'EN-D', vTrim: 42, vMax: 61, ar: 6.9, glideRatio: 10.9 }
].map(g => Object.freeze({
  ...g,
  name: `${g.brand} ${g.model}`
})));

/**
 * Returns default aerodynamic envelope metrics for an EN certification category.
 * @param {string} category - 'EN-A' | 'EN-B' | 'EN-C' | 'EN-D'
 * @returns {typeof GLIDER_CLASSES.EN_A}
 */
export function getGliderClassDefaults(category = 'EN-A') {
  const norm = (category || '').toUpperCase().trim();
  if (norm === 'EN-D' || norm === 'CCC' || norm === 'COMPETIZIONE') {
    return GLIDER_CLASSES.EN_D;
  }
  if (norm === 'EN-C' || norm === 'SPORT') {
    return GLIDER_CLASSES.EN_C;
  }
  if (norm === 'EN-B' || norm === 'INTERMEDIO') {
    return GLIDER_CLASSES.EN_B;
  }
  return GLIDER_CLASSES.EN_A;
}

/**
 * Searches and filters paraglider models by query text and/or brand and category.
 * @param {object} [options={}]
 * @param {string} [options.query=''] - Free-text search string for brand or model name.
 * @param {string} [options.brand=''] - Specific brand filter (case-insensitive) or 'ALL'.
 * @param {string} [options.category=''] - Certification class filter ('EN-A', 'EN-B', etc.) or 'ALL'.
 * @returns {Array<object>} Filtered array of gliders.
 */
export function searchGliders({ query = '', brand = '', category = '' } = {}) {
  const q = (query || '').toLowerCase().trim();
  const b = (brand || '').toLowerCase().trim();
  const c = (category || '').toUpperCase().trim();

  return POPULAR_GLIDERS.filter(g => {
    // Brand filter
    if (b && b !== 'all' && g.brand.toLowerCase() !== b) {
      return false;
    }
    // Category filter
    if (c && c !== 'ALL' && g.category !== c) {
      return false;
    }
    // Text search query
    if (q) {
      const matchBrand = g.brand.toLowerCase().includes(q);
      const matchModel = g.model.toLowerCase().includes(q);
      const matchName = g.name.toLowerCase().includes(q);
      const matchCategory = g.category.toLowerCase().includes(q);
      if (!matchBrand && !matchModel && !matchName && !matchCategory) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Retrieves a glider by its unique slug/ID from the catalog or generic classes.
 * @param {string} id
 * @returns {object|null}
 */
export function getGliderById(id) {
  if (!id) return null;
  const match = POPULAR_GLIDERS.find(g => g.id === id);
  if (match) return match;

  const genericMatch = Object.values(GLIDER_CLASSES).find(c => c.id === id || c.category === id);
  if (genericMatch) return genericMatch;

  return null;
}

/**
 * Creates a normalized custom glider specification object.
 * Missing aerodynamic values are inferred from the chosen certification category.
 * 
 * @param {object} params
 * @param {string} params.brand - Manufacturer name.
 * @param {string} params.model - Model name.
 * @param {string} [params.category='EN-A'] - EN certification category.
 * @param {number} [params.vTrim] - Trim speed in km/h.
 * @param {number} [params.vMax] - Max accelerated speed in km/h.
 * @param {number} [params.glideRatio] - L/D glide ratio.
 * @param {number} [params.ar] - Projected/flat aspect ratio.
 * @returns {object}
 */
export function createCustomGlider({
  brand,
  model,
  category = 'EN-A',
  vTrim,
  vMax,
  glideRatio,
  ar
}) {
  const cleanBrand = (brand || 'Personalizzata').trim();
  const cleanModel = (model || 'Vela Custom').trim();
  const cleanCategory = (category || 'EN-A').toUpperCase().trim();
  const defaults = getGliderClassDefaults(cleanCategory);

  const cleanSlug = `${cleanBrand}-${cleanModel}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return Object.freeze({
    id: `custom-${cleanSlug}`,
    brand: cleanBrand,
    model: cleanModel,
    name: `${cleanBrand} ${cleanModel}`,
    category: defaults.category,
    vTrim: typeof vTrim === 'number' && vTrim > 20 && vTrim < 70 ? vTrim : defaults.vTrim,
    vMax: typeof vMax === 'number' && vMax > 30 && vMax < 90 ? vMax : defaults.vMax,
    ar: typeof ar === 'number' && ar > 3 && ar < 10 ? ar : defaults.ar,
    glideRatio: typeof glideRatio === 'number' && glideRatio > 5 && glideRatio < 15 ? glideRatio : defaults.glideRatio,
    isCustom: true
  });
}
