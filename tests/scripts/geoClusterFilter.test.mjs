import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clusterSpotsByProximity,
  validateElevationWithDem,
  pairTakeoffWithLandings,
  computeGeometricReliability,
  processGeometricPipeline
} from '../../scripts/geo-cluster-filter.mjs';

describe('Geometric Clustering & DEM Validation Engine - Tooling Tests', () => {
  describe('clusterSpotsByProximity', () => {
    it('should cluster two spots within 100 meters and increment source count', () => {
      const spot1 = {
        source: 'osm',
        sourceId: 'osm-1',
        name: 'Cornizzolo Sud',
        type: 'takeoff',
        coordinates: { lat: 45.8332, lon: 9.3020 },
        altitude: 1060,
        heading: 180
      };

      // 40 meters away
      const spot2 = {
        source: 'pgearth',
        sourceId: 'pg-1',
        name: 'Monte Cornizzolo Rampa Moquette',
        type: 'takeoff',
        coordinates: { lat: 45.8335, lon: 9.3022 },
        altitude: 1065,
        heading: 175
      };

      const clusters = clusterSpotsByProximity([spot1, spot2], 0.1);
      assert.equal(clusters.length, 1);
      assert.equal(clusters[0].coLocatedCount, 2);
      assert.equal(clusters[0].sourceCount, 2);
      assert.ok(clusters[0].sources.includes('osm'));
      assert.ok(clusters[0].sources.includes('pgearth'));
    });

    it('should NOT cluster a takeoff and a landing even if they are close', () => {
      const takeoff = {
        source: 'osm',
        sourceId: 'osm-t1',
        name: 'Rampa Decollo',
        type: 'takeoff',
        coordinates: { lat: 45.833, lon: 9.302 },
        altitude: 1060
      };

      const landing = {
        source: 'osm',
        sourceId: 'osm-l1',
        name: 'Campetto',
        type: 'landing',
        coordinates: { lat: 45.8332, lon: 9.3021 },
        altitude: 1050
      };

      const clusters = clusterSpotsByProximity([takeoff, landing], 0.1);
      assert.equal(clusters.length, 2);
      assert.equal(clusters[0].type, 'takeoff');
      assert.equal(clusters[1].type, 'landing');
    });

    it('should keep spots beyond 100 meters in separate clusters', () => {
      const spotA = {
        source: 'osm',
        sourceId: 'a',
        name: 'Spot A',
        type: 'takeoff',
        coordinates: { lat: 45.833, lon: 9.302 },
        altitude: 1000
      };

      // ~500m away
      const spotB = {
        source: 'osm',
        sourceId: 'b',
        name: 'Spot B',
        type: 'takeoff',
        coordinates: { lat: 45.837, lon: 9.302 },
        altitude: 1100
      };

      const clusters = clusterSpotsByProximity([spotA, spotB], 0.1);
      assert.equal(clusters.length, 2);
    });
  });

  describe('validateElevationWithDem', () => {
    it('should grant 20 points for delta <= 25m', () => {
      const res = validateElevationWithDem(1060, 1055);
      assert.equal(res.isValid, true);
      assert.equal(res.score, 20);
      assert.equal(res.deltaMeters, 5);
    });

    it('should grant 10 points for delta between 25m and 75m', () => {
      const res = validateElevationWithDem(1060, 1020);
      assert.equal(res.isValid, true);
      assert.equal(res.score, 10);
      assert.equal(res.deltaMeters, 40);
    });

    it('should flag as invalid with 0 points for delta > 75m', () => {
      const res = validateElevationWithDem(1060, 800);
      assert.equal(res.isValid, false);
      assert.equal(res.score, 0);
      assert.equal(res.deltaMeters, 260);
    });

    it('should handle missing or NaN values safely', () => {
      const res = validateElevationWithDem(null, 1060);
      assert.equal(res.isValid, false);
      assert.equal(res.score, 0);
    });
  });

  describe('pairTakeoffWithLandings', () => {
    const takeoff = {
      sourceId: 't1',
      name: 'Decollo Cornizzolo',
      coordinates: { lat: 45.833, lon: 9.302 },
      altitude: 1060
    };

    it('should pair with landing within glide reach (E <= 7)', () => {
      // Distance ~2.2 km, DeltaH = 800m -> E = 2200 / 800 = 2.75 (Safe!)
      const landingSuello = {
        sourceId: 'l1',
        name: 'Atterraggio Suello',
        coordinates: { lat: 45.817, lon: 9.318 },
        altitude: 260
      };

      const pairings = pairTakeoffWithLandings(takeoff, [landingSuello]);
      assert.equal(pairings.length, 1);
      assert.equal(pairings[0].isSafe, true);
      assert.ok(pairings[0].requiredGlide < 4.0);
    });

    it('should flag landing as not safe if required glide ratio E > 7', () => {
      // Distance ~10 km, DeltaH = 300m -> E = 10000 / 300 = 33.3 (Unreachable!)
      const distantLanding = {
        sourceId: 'l2',
        name: 'Atterraggio Lontano',
        coordinates: { lat: 45.900, lon: 9.302 },
        altitude: 760
      };

      const pairings = pairTakeoffWithLandings(takeoff, [distantLanding]);
      assert.equal(pairings.length, 1);
      assert.equal(pairings[0].isSafe, false);
      assert.ok(pairings[0].requiredGlide > 7.0);
    });

    it('should reject landing that is higher than the takeoff', () => {
      const highLanding = {
        sourceId: 'l3',
        name: 'Pizzo Alto',
        coordinates: { lat: 45.834, lon: 9.303 },
        altitude: 1200
      };

      const pairings = pairTakeoffWithLandings(takeoff, [highLanding]);
      assert.equal(pairings.length, 0);
    });
  });

  describe('computeGeometricReliability', () => {
    it('should compute high reliability (>= 90%) for corroborated spot with DEM and landing', () => {
      const score = computeGeometricReliability({
        sourceCount: 2, // 30 pts
        demScore: 20,   // 20 pts
        hasHeading: true, // 20 pts
        hasSafeLanding: true // 20 pts
      });
      assert.equal(score, 90);
    });

    it('should penalize isolated spot without landing and without heading', () => {
      const score = computeGeometricReliability({
        sourceCount: 1, // 15 pts
        demScore: 0,    // 0 pts
        hasHeading: false, // 0 pts
        hasSafeLanding: false // 5 pts
      });
      assert.equal(score, 20);
    });
  });

  describe('processGeometricPipeline', () => {
    it('should orchestrate raw spots into categorized takeoffs and landings with scores', async () => {
      const rawSpots = [
        {
          source: 'osm',
          sourceId: 't-cornizzolo',
          name: 'Decollo Cornizzolo',
          type: 'takeoff',
          coordinates: { lat: 45.833, lon: 9.302 },
          altitude: 1060,
          heading: 180
        },
        {
          source: 'osm',
          sourceId: 'l-suello',
          name: 'Atterraggio Suello',
          type: 'landing',
          coordinates: { lat: 45.817, lon: 9.318 },
          altitude: 260
        }
      ];

      const demMap = {
        '45.833,9.302': 1058, // close to 1060 (delta 2m)
        '45.817,9.318': 262   // close to 260 (delta 2m)
      };

      const result = await processGeometricPipeline(rawSpots, {
        demElevationsMap: demMap
      });

      assert.equal(result.takeoffs.length, 1);
      assert.equal(result.landings.length, 1);

      const takeoff = result.takeoffs[0];
      assert.equal(takeoff.canonicalName, 'Decollo Cornizzolo');
      assert.equal(takeoff.hasSafeLanding, true);
      assert.equal(takeoff.demValidation.score, 20);
      assert.ok(takeoff.geometricReliability >= 75);

      const landing = result.landings[0];
      assert.equal(landing.canonicalName, 'Atterraggio Suello');
      assert.equal(landing.demValidation.score, 20);
      assert.ok(landing.geometricReliability >= 70);
    });
  });
});
