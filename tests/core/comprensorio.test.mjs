import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCoordinates,
  slugifyComprensorio,
  cleanUserText,
  DEFAULT_COMPRENSORI,
  normalizeLocationsCatalog,
  calculateGlideToLanding,
  evaluateComprensorio,
  sortEvaluatedComprensori
} from '../../core/comprensorio.js';
import { GLIDER_CLASSES } from '../../core/flyability.js';

describe('GlideMind Comprensorio Locality & Dual Launch/Landing Evaluator', () => {
  describe('Coordinate Parsing & Slugification', () => {
    it('should parse coordinate strings safely', () => {
      const parsed = parseCoordinates('45.833265, 9.302084');
      assert.ok(parsed);
      assert.equal(parsed.lat, 45.833265);
      assert.equal(parsed.lon, 9.302084);
    });

    it('should handle array and object coordinate representations', () => {
      assert.deepEqual(parseCoordinates([45.5, 9.2]), { lat: 45.5, lon: 9.2 });
      assert.deepEqual(parseCoordinates({ lat: 45.5, lon: 9.2 }), { lat: 45.5, lon: 9.2 });
    });

    it('should return null for malformed or missing coordinates', () => {
      assert.equal(parseCoordinates(null), null);
      assert.equal(parseCoordinates(''), null);
      assert.equal(parseCoordinates('invalid,coord'), null);
    });

    it('should generate consistent slugs for comprensori', () => {
      const slug = slugifyComprensorio('Monte Cornizzolo (Suello - LC)', 'LC');
      assert.equal(slug, 'monte-cornizzolo-suello-lc-lc');
      assert.equal(slugifyComprensorio('Bassano del Grappa'), 'bassano-del-grappa');
    });
  });

  describe('Locations Catalog Normalization', () => {
    it('should provide default curated comprensori when raw catalog is missing or null', () => {
      const defaults = normalizeLocationsCatalog(null);
      assert.ok(Array.isArray(defaults));
      assert.ok(defaults.length >= 4);
      const cornizzolo = defaults.find(c => c.id === 'monte-cornizzolo-lc');
      assert.ok(cornizzolo, 'Monte Cornizzolo must be in default comprensori');
      assert.equal(cornizzolo.takeoffs.length, 2);
      assert.equal(cornizzolo.landings.length, 1);
    });

    it('should normalize structured raw JSON from locations.json', () => {
      const sampleRaw = {
        IT: {
          Lombardia: [
            {
              location: 'Monte Cornizzolo (Suello - LC)',
              takeoffs: [
                { name: 'Risparmio', altitude: 1060, heading: 170, coordinates: '45.833, 9.302' }
              ],
              landings: [
                { name: 'Suello', altitude: 260, coordinates: '45.817, 9.318' }
              ]
            }
          ]
        }
      };

      const normalized = normalizeLocationsCatalog(sampleRaw);
      assert.equal(normalized.length, 1);
      assert.equal(normalized[0].province, 'LC');
      assert.equal(normalized[0].takeoffs.length, 1);
      assert.equal(normalized[0].landings.length, 1);
    });
  });

  describe('Aerodynamic Glide Ratio Calculation (E_richiesta = D / Delta_H)', () => {
    it('should calculate accurate required glide ratio from takeoff to landing', () => {
      // Cornizzolo Risparmio (1060m) to Suello (260m): Delta H = 800m
      // Coordinates approx 2.2 km distance
      const takeoff = { coordinates: '45.833265, 9.302084', altitude: 1060 };
      const landing = { coordinates: '45.817209, 9.318668', altitude: 260 };

      const glide = calculateGlideToLanding(takeoff, landing, GLIDER_CLASSES.EN_A);
      assert.ok(glide.distanceMeters > 2000 && glide.distanceMeters < 2500);
      assert.equal(glide.deltaAltitudeMeters, 800);
      assert.ok(glide.requiredGlideRatio > 2.5 && glide.requiredGlideRatio < 3.5);
      assert.equal(glide.isSafe, true, 'Glide ratio 3:1 is well within EN-A safe limit 5.5:1');
    });

    it('should flag unsafe when landing requires glide ratio exceeding pilot glider proxy limit', () => {
      // Takeoff altitude 500m, landing altitude 450m (Delta H = 50m), distance 1000m -> Required glide = 20:1
      const takeoff = { coordinates: '45.830000, 9.300000', altitude: 500 };
      const landing = { coordinates: '45.840000, 9.300000', altitude: 450 };

      const glide = calculateGlideToLanding(takeoff, landing, GLIDER_CLASSES.EN_A);
      assert.ok(glide.requiredGlideRatio > 10);
      assert.equal(glide.isSafe, false, 'Required glide ~20:1 must be unsafe for EN-A');
    });
  });

  describe('Comprensorio Flyability Evaluation & Best Takeoff Selection', () => {
    const cornizzolo = DEFAULT_COMPRENSORI.find(c => c.id === 'monte-cornizzolo-lc');

    it('should select best takeoff aligned with south wind and report Aperto', () => {
      // Weather with wind from South (175°) at 12 km/h
      const mockWeather = {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [12],
          wind_gusts_10m: [16],
          wind_direction_10m: [175],
          precipitation: [0],
          cape: [100],
          turbulence_edr: [0.10],
          temperature_2m: [22]
        }
      };

      const result = evaluateComprensorio({
        comprensorio: cornizzolo,
        weatherData: mockWeather,
        hourIndex: 0,
        glider: GLIDER_CLASSES.EN_A
      });

      assert.equal(result.status, 'flyable');
      assert.equal(result.badge, 'Aperto');
      assert.ok(result.bestTakeoff, 'Must select best takeoff');
      assert.equal(result.bestTakeoff.id, 'cornizzolo-risparmio', 'Risparmio (heading 170°) is best aligned with 175° wind');
      assert.ok(result.safeLanding);
      assert.equal(result.glideMetrics.isSafe, true);
      assert.ok(result.reason.includes('in asse'), `Reason should explain alignment: ${result.reason}`);
    });

    it('should report Chiuso / Unflyable when wind is tailwind (North wind on South takeoff)', () => {
      // Weather with strong North wind (0° / 360°) at 25 km/h
      const mockWeather = {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [25],
          wind_gusts_10m: [35],
          wind_direction_10m: [0],
          precipitation: [0],
          cape: [50],
          turbulence_edr: [0.35],
          temperature_2m: [18]
        }
      };

      const result = evaluateComprensorio({
        comprensorio: cornizzolo,
        weatherData: mockWeather,
        hourIndex: 0,
        glider: GLIDER_CLASSES.EN_A
      });

      assert.equal(result.status, 'unflyable');
      assert.equal(result.badge, 'Chiuso');
      assert.ok(result.score <= 20);
    });

    it('should report Cautela when takeoff is viable but landing glide is critical', () => {
      // Create a test comprensorio with safe takeoff but extreme distance to landing
      const criticalComprensorio = {
        id: 'spot-critical-landing',
        name: 'Spot Rientro Difficile',
        takeoffs: [
          { id: 't1', name: 'Decollo Sud', altitude: 800, heading: 180, coordinates: '45.800, 9.300' }
        ],
        landings: [
          // 4 km distance with only 100m altitude diff -> Glide ratio 40:1
          { id: 'l1', name: 'Atterraggio Lontano', altitude: 700, coordinates: '45.836, 9.300' }
        ]
      };

      const mockWeather = {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [10],
          wind_gusts_10m: [14],
          wind_direction_10m: [180],
          precipitation: [0],
          cape: [100],
          turbulence_edr: [0.10],
          temperature_2m: [20]
        }
      };

      const result = evaluateComprensorio({
        comprensorio: criticalComprensorio,
        weatherData: mockWeather,
        hourIndex: 0,
        glider: GLIDER_CLASSES.EN_A
      });

      assert.equal(result.status, 'caution');
      assert.equal(result.badge, 'Cautela');
      assert.ok(result.reason.includes('Rientro critico'), `Reason should explain landing risk: ${result.reason}`);
    });
  });

  describe('Flyability-Sorted List of Comprensori', () => {
    it('should sort comprensori strictly in order: flyable -> caution -> unflyable', () => {
      const items = [
        { name: 'Spot Chiuso', status: 'unflyable', score: 10 },
        { name: 'Spot Perfetto B', status: 'flyable', score: 85 },
        { name: 'Spot Cautela', status: 'caution', score: 55 },
        { name: 'Spot Perfetto A', status: 'flyable', score: 95 }
      ];

      const sorted = sortEvaluatedComprensori(items);
      assert.equal(sorted[0].name, 'Spot Perfetto A', 'Highest score flyable first');
      assert.equal(sorted[1].name, 'Spot Perfetto B', 'Second flyable');
      assert.equal(sorted[2].name, 'Spot Cautela', 'Caution follows flyable');
      assert.equal(sorted[3].name, 'Spot Chiuso', 'Unflyable is last');
    });
  });

  describe("Regola dell'Unico Binomio (1 Decollo + 1 Atterraggio per Comprensorio)", () => {
    it('should designate exactly one primary takeoff and one primary landing in default comprensori', () => {
      for (const site of DEFAULT_COMPRENSORI) {
        const primaryTakeoffs = site.takeoffs.filter(t => t.isPrimary === true);
        const primaryLandings = site.landings.filter(l => l.isPrimary === true);

        assert.equal(
          primaryTakeoffs.length,
          1,
          `Comprensorio "${site.name}" must have exactly 1 primary takeoff`
        );
        assert.equal(
          primaryLandings.length,
          1,
          `Comprensorio "${site.name}" must have exactly 1 primary landing`
        );
      }
    });

    it('should automatically assign isPrimary: true to the first takeoff and landing when normalizing catalog', () => {
      const raw = {
        IT: {
          Veneto: [
            {
              location: 'Col Visentin (Belluno - BL)',
              takeoffs: [
                { name: 'Decollo Nevegal', altitude: 1400 },
                { name: 'Decollo Faverghera', altitude: 1600 }
              ],
              landings: [
                { name: 'Atterraggio Quantin', altitude: 700 }
              ]
            }
          ]
        }
      };

      const normalized = normalizeLocationsCatalog(raw);
      assert.equal(normalized.length, 1);
      assert.equal(normalized[0].takeoffs[0].isPrimary, true);
      assert.equal(normalized[0].takeoffs[1].isPrimary, false);
      assert.equal(normalized[0].landings[0].isPrimary, true);
    });

    it('should return exactly 1 takeoff and 1 landing in evaluateComprensorio', () => {
      const site = DEFAULT_COMPRENSORI.find(s => s.id === 'monte-cornizzolo-lc');
      const evaluated = evaluateComprensorio({
        comprensorio: site,
        weatherData: null,
        hourIndex: 14
      });

      // Strict contract: single takeoff and single landing
      assert.ok(evaluated.takeoff, 'Must expose single takeoff');
      assert.ok(evaluated.landing, 'Must expose single landing');
      assert.equal(typeof evaluated.takeoff.name, 'string');
      assert.equal(typeof evaluated.landing.name, 'string');
      assert.equal(typeof evaluated.isTakeoffPrimary, 'boolean');
      assert.equal(typeof evaluated.isLandingPrimary, 'boolean');
    });

    it('should select primary takeoff when primary is flyable (Ibrido baseline)', () => {
      const site = {
        id: 'spot-multi-takeoff',
        name: 'Spot Bi-Decollo',
        takeoffs: [
          { id: 't-sud', name: 'Decollo Sud (Principale)', altitude: 1000, heading: 180, isPrimary: true },
          { id: 't-ovest', name: 'Decollo Ovest', altitude: 950, heading: 270, isPrimary: false }
        ],
        landings: [
          { id: 'l-main', name: 'Atterraggio Ufficiale', altitude: 300, isPrimary: true, isOfficial: true }
        ]
      };

      // South wind 12 km/h: both are flyable or south is direct
      const weatherSouth = {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [12],
          wind_gusts_10m: [16],
          wind_direction_10m: [180],
          precipitation: [0],
          cape: [100],
          turbulence_edr: [0.10],
          temperature_2m: [22]
        }
      };

      const result = evaluateComprensorio({
        comprensorio: site,
        weatherData: weatherSouth,
        hourIndex: 0
      });

      assert.equal(result.takeoff.id, 't-sud', 'Should pick primary takeoff when flyable');
      assert.equal(result.isTakeoffPrimary, true);
      assert.equal(result.isTakeoffOverridden, false);
      assert.equal(result.landing.id, 'l-main');
    });

    it('should override to alternative takeoff when primary is unflyable and alternative is flyable', () => {
      const site = {
        id: 'spot-multi-takeoff-wind',
        name: 'Spot Bi-Decollo Vento',
        takeoffs: [
          { id: 't-sud', name: 'Decollo Sud', altitude: 1000, heading: 180, isPrimary: true },
          { id: 't-nord', name: 'Decollo Nord', altitude: 1050, heading: 0, isPrimary: false }
        ],
        landings: [
          { id: 'l-main', name: 'Atterraggio', altitude: 300, isPrimary: true }
        ]
      };

      // North wind 16 km/h: Sud has tailwind (severity 2, unflyable), Nord is direct headwind (severity 0, flyable)
      const weatherNorth = {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [16],
          wind_gusts_10m: [20],
          wind_direction_10m: [0],
          precipitation: [0],
          cape: [50],
          turbulence_edr: [0.12],
          temperature_2m: [19]
        }
      };

      const result = evaluateComprensorio({
        comprensorio: site,
        weatherData: weatherNorth,
        hourIndex: 0
      });

      assert.equal(result.takeoff.id, 't-nord', 'Should automatically override to Decollo Nord');
      assert.equal(result.isTakeoffPrimary, false);
      assert.equal(result.isTakeoffOverridden, true);
      assert.ok(result.takeoffOverrideReason.includes('Decollo alternativo Decollo Nord'));
      assert.equal(result.status, 'flyable', 'Comprensorio remains flyable via alternative');
      assert.equal(result.badge, 'Aperto');
    });

    it('should retain primary takeoff when both primary and alternative are unflyable', () => {
      const site = {
        id: 'spot-all-bad',
        name: 'Spot Tempestoso',
        takeoffs: [
          { id: 't-sud', name: 'Decollo Sud', altitude: 1000, heading: 180, isPrimary: true },
          { id: 't-est', name: 'Decollo Est', altitude: 1000, heading: 90, isPrimary: false }
        ],
        landings: [
          { id: 'l-main', name: 'Atterraggio', altitude: 300, isPrimary: true }
        ]
      };

      // Gale wind 45 km/h: all takeoffs are severity 2
      const weatherStorm = {
        hourly: {
          time: ['2026-10-08T14:00'],
          wind_speed_10m: [45],
          wind_gusts_10m: [65],
          wind_direction_10m: [180],
          precipitation: [10],
          cape: [1200],
          turbulence_edr: [0.6],
          temperature_2m: [15]
        }
      };

      const result = evaluateComprensorio({
        comprensorio: site,
        weatherData: weatherStorm,
        hourIndex: 0
      });

      assert.equal(result.takeoff.id, 't-sud', 'Should stay on primary takeoff if no better alternative exists');
      assert.equal(result.isTakeoffOverridden, false);
      assert.equal(result.status, 'unflyable');
      assert.equal(result.badge, 'Chiuso');
    });
  });

  describe('Text Sanitization & Reliability Metadata Decoupling', () => {
    it('should strip technical attendibilità tags and trim text cleanly', () => {
      const dirty1 = 'Scenario unico al mondo sotto la celebre Rocca. [attendibilità 94%]';
      assert.equal(cleanUserText(dirty1), 'Scenario unico al mondo sotto la celebre Rocca.');

      const dirty2 = 'Volo d\'alta montagna; attenzione alle raffiche. [attendibilita 85%]';
      assert.equal(cleanUserText(dirty2), 'Volo d\'alta montagna; attenzione alle raffiche.');

      const cleanAlready = 'Prato immenso, decollo facile.';
      assert.equal(cleanUserText(cleanAlready), 'Prato immenso, decollo facile.');

      assert.equal(cleanUserText(null), '');
      assert.equal(cleanUserText(undefined), '');
    });

    it('should sanitize raw locations catalog and expose structured reliability numbers', () => {
      const rawCatalog = {
        IT: {
          Abruzzo: [
            {
              location: 'Rocca Calascio (Calascio - AQ)',
              description: 'Panorama spettacolare sul Gran Sasso. [attendibilità 93%]',
              reliability: 93,
              club: {
                name: 'Club Gran Sasso',
                shuttle: 'Navetta disponibile nei weekend. [attendibilità 90%]'
              },
              takeoffs: [
                {
                  name: 'Decollo Sud',
                  altitude: 1450,
                  heading: 180,
                  description: 'Decollo con moquette. [attendibilità 95%]',
                  hazards: 'Raffiche pomeridiane. [attendibilità 88%]',
                  reliability: 95
                }
              ],
              landings: [
                {
                  name: 'Atterraggio Fossa',
                  altitude: 1100,
                  description: 'Grande prato. [attendibilità 96%]',
                  hazards: 'Recinzione a nord. [attendibilità 80%]',
                  rules: 'Rispettare le greggi. [attendibilità 85%]',
                  reliability: 96
                }
              ]
            }
          ]
        }
      };

      const normalized = normalizeLocationsCatalog(rawCatalog);
      assert.equal(normalized.length, 1);
      const site = normalized[0];

      // Text must be 100% clean of technical tags
      assert.equal(site.description, 'Panorama spettacolare sul Gran Sasso.');
      assert.equal(site.club.shuttle, 'Navetta disponibile nei weekend.');
      assert.equal(site.takeoffs[0].description, 'Decollo con moquette.');
      assert.equal(site.takeoffs[0].hazards, 'Raffiche pomeridiane.');
      assert.equal(site.landings[0].description, 'Grande prato.');
      assert.equal(site.landings[0].hazards, 'Recinzione a nord.');
      assert.equal(site.landings[0].rules, 'Rispettare le greggi.');

      // Structured reliability scores must be preserved as numbers
      assert.equal(site.reliability, 93);
      assert.equal(site.takeoffs[0].reliability, 95);
      assert.equal(site.landings[0].reliability, 96);
    });
  });
});
