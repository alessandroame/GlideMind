import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MACRO_REGIONS,
  DEFAULT_MACRO_REGION,
  getComprensorioCoordinates,
  filterComprensoriByMacroRegion,
  filterComprensoriByRadius,
  normalizeBoundingBox,
  filterComprensoriByBoundingBox,
  clusterComprensori,
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
    assert.ok(MACRO_REGIONS.ALPS_WEST);
    assert.ok(MACRO_REGIONS.ALPS_EAST);
    assert.ok(MACRO_REGIONS.ALL);
    assert.equal(DEFAULT_MACRO_REGION, 'all');

    assert.equal(MACRO_REGIONS.NORTH_WEST.regions.includes('Piemonte'), true);
    assert.equal(MACRO_REGIONS.NORTH_EAST.regions.includes('Veneto'), true);
    assert.equal(MACRO_REGIONS.CENTRE.regions.includes('Toscana'), true);
    assert.equal(MACRO_REGIONS.ALPS_WEST.countries.includes('FR'), true);
    assert.equal(MACRO_REGIONS.ALPS_EAST.countries.includes('SI'), true);
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

  it('should correctly filter European spots for Alps West and Alps East macro-regions', () => {
    const sampleSpots = [
      { id: 'annecy', name: 'Annecy', country: 'FR', region: 'Auvergne-Rhône-Alpes' },
      { id: 'interlaken', name: 'Interlaken', country: 'CH', region: 'Berner Oberland' },
      { id: 'innsbruck', name: 'Innsbruck', country: 'AT', region: 'Tirol' },
      { id: 'lijak', name: 'Lijak', country: 'SI', region: 'Goriška' },
      { id: 'cavallaria', name: 'Cavallaria', country: 'IT', region: 'Piemonte' }
    ];

    const alpsWest = filterComprensoriByMacroRegion(sampleSpots, 'alps-west');
    assert.equal(alpsWest.length, 2);
    assert.ok(alpsWest.some(s => s.id === 'annecy'));
    assert.ok(alpsWest.some(s => s.id === 'interlaken'));

    const alpsEast = filterComprensoriByMacroRegion(sampleSpots, 'alps-east');
    assert.equal(alpsEast.length, 2);
    assert.ok(alpsEast.some(s => s.id === 'innsbruck'));
    assert.ok(alpsEast.some(s => s.id === 'lijak'));

    const itNorthWest = filterComprensoriByMacroRegion(sampleSpots, 'north-west');
    assert.equal(itNorthWest.length, 1);
    assert.equal(itNorthWest[0].id, 'cavallaria');
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
      { id: 'spot-non-volabile', name: 'Spot Rosso', severity: 2, score: 15 }
    ];

    const top = findTopFlyableSpot(evaluated);
    assert.ok(top);
    assert.equal(top.id, 'spot-volabile-top');
    assert.equal(top.score, 95);

    assert.equal(findTopFlyableSpot([]), null);
  });

  it('should normalize bounding boxes from LatLngBounds-like objects, arrays, and plain dicts', () => {
    // Leaflet LatLngBounds duck-typing
    const mockLeafletBounds = {
      getSouth: () => 44.0,
      getWest: () => 7.0,
      getNorth: () => 46.0,
      getEast: () => 9.0
    };
    const norm1 = normalizeBoundingBox(mockLeafletBounds);
    assert.deepEqual(norm1, { south: 44.0, west: 7.0, north: 46.0, east: 9.0 });

    // Plain array [south, west, north, east]
    const norm2 = normalizeBoundingBox([44.0, 7.0, 46.0, 9.0]);
    assert.deepEqual(norm2, { south: 44.0, west: 7.0, north: 46.0, east: 9.0 });

    // Inverted south/north correction
    const normInverted = normalizeBoundingBox({ south: 46.0, north: 44.0, west: 7.0, east: 9.0 });
    assert.deepEqual(normInverted, { south: 44.0, west: 7.0, north: 46.0, east: 9.0 });

    // With margin buffer (10%)
    const normBuffered = normalizeBoundingBox([40.0, 10.0, 50.0, 20.0], 0.1);
    assert.equal(normBuffered.south, 39.0);
    assert.equal(normBuffered.north, 51.0);
    assert.equal(normBuffered.west, 9.0);
    assert.equal(normBuffered.east, 21.0);

    // Invalid inputs
    assert.equal(normalizeBoundingBox(null), null);
    assert.equal(normalizeBoundingBox({ south: 'invalid' }), null);
  });

  it('should filter comprensori strictly within a bounding box (viewport culling)', () => {
    // Piemonte / Western Alps bbox: lat 44.5 - 46.0, lon 7.0 - 8.5
    const westAlpsBbox = { south: 44.5, west: 7.0, north: 46.0, east: 8.5 };
    const visibleSpots = filterComprensoriByBoundingBox(DEFAULT_COMPRENSORI, westAlpsBbox, { marginRatio: 0 });

    assert.ok(visibleSpots.length > 0);
    for (const spot of visibleSpots) {
      const coords = getComprensorioCoordinates(spot);
      assert.ok(coords.lat >= 44.5 && coords.lat <= 46.0, `Lat ${coords.lat} out of bounds for ${spot.name}`);
      assert.ok(coords.lon >= 7.0 && coords.lon <= 8.5, `Lon ${coords.lon} out of bounds for ${spot.name}`);
    }

    // Spot far away (Rocca Calascio in Abruzzo ~lat 42.3, lon 13.6) should NOT be in Western Alps
    assert.equal(visibleSpots.some(s => s.id === 'calascio-rocca-aq'), false);

    // Safety maxSpots cap
    const capped = filterComprensoriByBoundingBox(DEFAULT_COMPRENSORI, { south: 30, west: 0, north: 60, east: 30 }, { maxSpots: 2 });
    assert.equal(capped.length, 2);
  });

  it('should cluster spots at macro zoom levels (< 7.5) and return unclustered spots at detailed zoom (>= 7.5)', () => {
    // Zoom 8 (detailed): no clustering
    const unclustered = clusterComprensori(DEFAULT_COMPRENSORI, 8);
    assert.equal(unclustered.length, DEFAULT_COMPRENSORI.length);
    assert.equal(unclustered.some(item => item.isCluster), false);

    // Zoom 5 (macro): clusters nearby spots
    const clusteredZoom5 = clusterComprensori(DEFAULT_COMPRENSORI, 5);
    assert.ok(clusteredZoom5.length < DEFAULT_COMPRENSORI.length, 'Zoom 5 should aggregate adjacent spots');
    const clusters = clusteredZoom5.filter(item => item.isCluster);
    assert.ok(clusters.length > 0, 'Must produce at least one cluster');

    for (const cl of clusters) {
      assert.ok(cl.count >= 2, 'Cluster must contain at least 2 spots');
      assert.ok(typeof cl.coordinates.lat === 'number');
      assert.ok(typeof cl.coordinates.lon === 'number');
      assert.ok(typeof cl.bounds.south === 'number');
      assert.ok(typeof cl.bounds.north === 'number');
      assert.ok(['flyable', 'caution', 'unflyable', 'unavailable'].includes(cl.status));
    }

    // Edge cases: empty or single element
    assert.deepEqual(clusterComprensori([], 5), []);
    assert.equal(clusterComprensori([DEFAULT_COMPRENSORI[0]], 5).length, 1);
  });
});

