import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createIndexEntry, shardCatalog } from '../../scripts/shard-locations-catalog.mjs';

describe('Locations Catalog Sharder & Index Generator (Tooling)', () => {
  const sampleComprensorio = {
    id: 'monte-cornizzolo-lc',
    name: 'Monte Cornizzolo',
    province: 'LC',
    region: 'Lombardia',
    country: 'IT',
    location: 'Monte Cornizzolo (Suello - LC)',
    description: 'Very long description of the site with club info.',
    webcam: 'https://example.com/webcam',
    club: { name: 'Aero Club', radioFreq: '144.300 MHz' },
    reliability: 95,
    takeoffs: [
      {
        id: 'takeoff-1',
        name: 'Decollo Sud',
        coordinates: '45.8332, 9.3020',
        altitude: 1060,
        heading: 180,
        isPrimary: true,
        hazards: 'Power lines'
      }
    ],
    landings: [
      {
        id: 'landing-1',
        name: 'Atterraggio Suello',
        coordinates: '45.8172, 9.3186',
        altitude: 260,
        isPrimary: true
      }
    ]
  };

  it('should generate a lightweight index entry preserving essential spatial and aerological metadata', () => {
    const entry = createIndexEntry(sampleComprensorio);
    assert.ok(entry);
    assert.equal(entry.id, 'monte-cornizzolo-lc');
    assert.equal(entry.name, 'Monte Cornizzolo');
    assert.equal(entry.country, 'IT');
    assert.equal(entry.region, 'Lombardia');
    assert.equal(entry.province, 'LC');
    assert.equal(entry.coordinates, '45.8332, 9.3020');
    assert.equal(entry.altitude, 1060);
    assert.equal(entry.heading, 180);
    assert.equal(entry.landingAltitude, 260);
    assert.equal(entry.reliability, 95);
    assert.equal(entry.takeoffsCount, 1);
    assert.equal(entry.landingsCount, 1);
    assert.equal(entry.hasWebcam, true);
    assert.equal(entry.hasClub, true);

    // Strips large text blobs to keep index compact
    assert.equal(entry.description, undefined);
    assert.equal(entry.takeoffs, undefined);
    assert.equal(entry.landings, undefined);
  });

  it('should partition a multi-country catalog into an index and distinct national shards', () => {
    const catalog = [
      sampleComprensorio,
      {
        id: 'calacuccia-corsica',
        name: 'Calacuccia',
        country: 'FR',
        region: 'Corsica',
        location: 'Calacuccia',
        takeoffs: [{ coordinates: '42.33, 9.04', altitude: 1200, isPrimary: true }],
        landings: [{ coordinates: '42.32, 9.03', altitude: 800, isPrimary: true }]
      },
      {
        id: 'tribalj-hr',
        name: 'Tribalj',
        country: 'HR',
        region: 'Croazia',
        location: 'Tribalj',
        takeoffs: [{ coordinates: '45.22, 14.68', altitude: 780, isPrimary: true }],
        landings: [{ coordinates: '45.21, 14.67', altitude: 70, isPrimary: true }]
      }
    ];

    const { indexEntries, countryPartitions } = shardCatalog(catalog);

    assert.equal(indexEntries.length, 3);
    assert.ok(countryPartitions.it);
    assert.ok(countryPartitions.fr);
    assert.ok(countryPartitions.hr);

    assert.equal(countryPartitions.it.length, 1);
    assert.equal(countryPartitions.fr.length, 1);
    assert.equal(countryPartitions.hr.length, 1);
    assert.equal(countryPartitions.it[0].id, 'monte-cornizzolo-lc');
    assert.equal(countryPartitions.fr[0].id, 'calacuccia-corsica');
  });

  it('should handle empty or null catalog gracefully', () => {
    const res = shardCatalog(null);
    assert.deepEqual(res.indexEntries, []);
    assert.deepEqual(res.countryPartitions, {});
    assert.equal(createIndexEntry(null), null);
  });
});
