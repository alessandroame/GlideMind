import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MACRO_REGIONS,
  DEFAULT_MACRO_REGION,
  getComprensorioCoordinates,
  filterComprensoriByMacroRegion,
  filterComprensoriByRadius,
  getMissingSpots,
  findTopFlyableSpot
} from '../../core/mapDataPartition.js';
import { DEFAULT_COMPRENSORI } from '../../core/comprensorio.js';

describe('Map Data Partitioning & Geospatial Filtering (Headless Core)', () => {
  it('should define the standard macro-regions with center coordinates and zoom levels', () => {
    assert.ok(MACRO_REGIONS.NORTH_WEST);
    assert.ok(MACRO_REGIONS.NORTH_EAST);
    assert.ok(MACRO_REGIONS.CENTRE);
    assert.ok(MACRO_REGIONS.SOUTH_ISLANDS);
    assert.ok(MACRO_REGIONS.ALL);
    assert.equal(DEFAULT_MACRO_REGION, 'north-west');

    assert.equal(MACRO_REGIONS.NORTH_WEST.regions.includes('Piemonte'), true);
    assert.equal(MACRO_REGIONS.NORTH_EAST.regions.includes('Veneto'), true);
    assert.equal(MACRO_REGIONS.CENTRE.regions.includes('Toscana'), true);
  });

  it('should extract valid coordinates from comprensorio primary takeoff', () => {
    const spot = DEFAULT_COMPRENSORI.find(s => s.id === 'ivrea-cavallaria-to') || DEFAULT_COMPRENSORI[0];
    const coords = getComprensorioCoordinates(spot);
    assert.ok(coords);
    assert.ok(typeof coords.lat === 'number' && coords.lat > 40 && coords.lat < 48);
    assert.ok(typeof coords.lon === 'number' && coords.lon > 6 && coords.lon < 19);

    assert.equal(getComprensorioCoordinates(null), null);
    assert.equal(getComprensorioCoordinates({ takeoffs: [] }), null);
  });

  it('should filter comprensori strictly by macro-region', () => {
    const northWestSpots = filterComprensoriByMacroRegion(DEFAULT_COMPRENSORI, 'north-west');
    assert.ok(northWestSpots.length > 0);
    for (const spot of northWestSpots) {
      assert.ok(
        ['piemonte', "valle d'aosta", 'liguria', 'lombardia'].includes(spot.region.toLowerCase()),
        `Spot ${spot.name} in unexpected region ${spot.region}`
      );
    }

    const allSpots = filterComprensoriByMacroRegion(DEFAULT_COMPRENSORI, 'all');
    assert.equal(allSpots.length, DEFAULT_COMPRENSORI.length);
  });

  it('should filter and sort comprensori within a given kilometer radius', () => {
    // Reference center: Torino (45.0703, 7.6869)
    const torinoCoords = { lat: 45.0703, lon: 7.6869 };
    const within100km = filterComprensoriByRadius(DEFAULT_COMPRENSORI, torinoCoords, 100);

    assert.ok(within100km.length > 0);
    // Should be strictly sorted ascending by distance
    for (let i = 1; i < within100km.length; i++) {
      assert.ok(within100km[i].distanceKm >= within100km[i - 1].distanceKm);
      assert.ok(within100km[i].distanceKm <= 100);
    }
  });

  it('should calculate missing spots for batch network fetch using set difference and TTL', () => {
    const spots = [
      { id: 'spot-1', name: 'Spot 1' },
      { id: 'spot-2', name: 'Spot 2' },
      { id: 'spot-3', name: 'Spot 3' }
    ];

    const now = Date.now();
    const cacheMap = new Map();
    // spot-1 is fresh (fetched 5 min ago)
    cacheMap.set('spot-1', { fetchedAt: now - 300000 });
    // spot-2 is expired (fetched 40 min ago, TTL is 30 min)
    cacheMap.set('spot-2', { fetchedAt: now - 2400000 });
    // spot-3 is missing

    const missing = getMissingSpots(spots, cacheMap, 1800000);
    assert.equal(missing.length, 2);
    assert.equal(missing.some(s => s.id === 'spot-2'), true);
    assert.equal(missing.some(s => s.id === 'spot-3'), true);
    assert.equal(missing.some(s => s.id === 'spot-1'), false);
  });

  it('should select top flyable spot prioritizing lowest severity and highest score', () => {
    const evaluated = [
      { id: 'spot-cautela', name: 'Spot Giallo', severity: 1, score: 60 },
      { id: 'spot-volabile-top', name: 'Spot Verde Top', severity: 0, score: 95 },
      { id: 'spot-volabile-mid', name: 'Spot Verde Mid', severity: 0, score: 80 },
      { id: 'spot-chiuso', name: 'Spot Rosso', severity: 2, score: 15 }
    ];

    const top = findTopFlyableSpot(evaluated);
    assert.ok(top);
    assert.equal(top.id, 'spot-volabile-top');
    assert.equal(top.score, 95);

    assert.equal(findTopFlyableSpot([]), null);
  });
});
