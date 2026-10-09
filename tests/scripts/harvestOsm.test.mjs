import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOverpassQuery,
  normalizeOsmSpot,
  parseOverpassResponse,
  runHarvest
} from '../../scripts/harvest-osm.mjs';

describe('OpenStreetMap Free Flying Harvester - Tooling Tests', () => {
  it('should construct valid Overpass QL query for a given country code', () => {
    const query = buildOverpassQuery('IT');
    assert.ok(query.includes('area["ISO3166-1"="IT"]'));
    assert.ok(query.includes('node["sport"="free_flying"]'));
    assert.ok(query.includes('node["sport"="paragliding"]'));
    assert.ok(query.includes('out center body;'));
  });

  it('should normalize an OSM node takeoff with altitude and direction', () => {
    const rawNode = {
      type: 'node',
      id: 1234567,
      lat: 45.833,
      lon: 9.302,
      tags: {
        name: 'Decollo Cornizzolo Sud',
        'free_flying:site': 'takeoff',
        ele: '1060',
        direction: '180',
        description: 'Ampio decollo erboso con moquette',
        club: 'Aero Club Monte Cornizzolo'
      }
    };

    const spot = normalizeOsmSpot(rawNode);
    assert.ok(spot);
    assert.equal(spot.source, 'osm');
    assert.equal(spot.sourceId, 'osm-node-1234567');
    assert.equal(spot.name, 'Decollo Cornizzolo Sud');
    assert.equal(spot.type, 'takeoff');
    assert.equal(spot.coordinates.lat, 45.833);
    assert.equal(spot.coordinates.lon, 9.302);
    assert.equal(spot.altitude, 1060);
    assert.equal(spot.heading, 180);
    assert.equal(spot.operator, 'Aero Club Monte Cornizzolo');
  });

  it('should normalize an OSM way landing with center coordinates', () => {
    const rawWay = {
      type: 'way',
      id: 9876543,
      center: {
        lat: 45.817,
        lon: 9.318
      },
      tags: {
        name: 'Atterraggio Ufficiale Suello',
        'paragliding:site': 'landing',
        ele: '260'
      }
    };

    const spot = normalizeOsmSpot(rawWay);
    assert.ok(spot);
    assert.equal(spot.type, 'landing');
    assert.equal(spot.coordinates.lat, 45.817);
    assert.equal(spot.coordinates.lon, 9.318);
    assert.equal(spot.altitude, 260);
    assert.equal(spot.heading, null);
  });

  it('should parse an entire Overpass response filtering out elements without coordinates', () => {
    const overpassResponse = {
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 45.0,
          lon: 9.0,
          tags: { name: 'Valid Takeoff', 'free_flying:site': 'takeoff' }
        },
        {
          type: 'relation',
          id: 2,
          tags: { name: 'Invalid Relation No Coords' }
        }
      ]
    };

    const parsed = parseOverpassResponse(overpassResponse);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'Valid Takeoff');
  });

  it('should execute runHarvest with mock fetch and generate output safely', async () => {
    const mockElements = [
      {
        type: 'node',
        id: 999,
        lat: 46.0,
        lon: 11.0,
        tags: { name: 'Mock Launch', 'free_flying:site': 'takeoff', ele: '1500' }
      }
    ];

    const mockFetch = async () => ({
      ok: true,
      json: async () => ({ elements: mockElements })
    });

    const testOutPath = new URL('./tmp-harvest-test.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

    try {
      const results = await runHarvest({
        country: 'IT',
        endpoint: 'http://mock.endpoint',
        outFile: testOutPath,
        fetchImpl: mockFetch
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'Mock Launch');
    } finally {
      import('node:fs').then(fs => {
        if (fs.existsSync(testOutPath)) {
          fs.unlinkSync(testOutPath);
        }
      });
    }
  });
});
