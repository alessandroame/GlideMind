import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLIDER_CLASSES,
  DEFAULT_GLIDER,
  PARAGLIDER_BRANDS,
  POPULAR_GLIDERS,
  searchGliders,
  getGliderById,
  createCustomGlider,
  getGliderClassDefaults
} from '../../core/gliders.js';

describe('GlideMind Core - Paraglider Brands & Models Catalog', () => {
  it('should define all 4 standard EN certification classes with valid physical metrics', () => {
    const keys = ['EN_A', 'EN_B', 'EN_C', 'EN_D'];
    for (const key of keys) {
      const cls = GLIDER_CLASSES[key];
      assert.ok(cls, `Must define class ${key}`);
      assert.ok(cls.category.startsWith('EN-'), `Category must start with EN-`);
      assert.ok(cls.vTrim >= 34 && cls.vTrim <= 45, `Trim speed must be between 34 and 45 km/h`);
      assert.ok(cls.vMax > cls.vTrim, `vMax must be strictly greater than vTrim`);
      assert.ok(cls.glideRatio >= 7.0 && cls.glideRatio <= 12.0, `Glide ratio must be physically plausible`);
      assert.ok(cls.ar >= 4.0 && cls.ar <= 8.0, `Aspect ratio must be physically plausible`);
    }
  });

  it('should export DEFAULT_GLIDER conforming to standard EN-A/B recreational envelope', () => {
    assert.equal(DEFAULT_GLIDER.category, 'EN-A');
    assert.equal(DEFAULT_GLIDER.brand, 'Standard');
    assert.ok(DEFAULT_GLIDER.vTrim >= 36);
    assert.ok(DEFAULT_GLIDER.glideRatio >= 8.0);
  });

  it('should include all premier paragliding manufacturers in PARAGLIDER_BRANDS', () => {
    assert.ok(PARAGLIDER_BRANDS.length >= 10);
    const expected = ['Ozone', 'Advance', 'Axis', 'Niviuk', 'Skywalk', 'Gin Gliders', 'Nova', 'Phi', 'BGD', 'Supair'];
    for (const brand of expected) {
      assert.ok(PARAGLIDER_BRANDS.includes(brand), `PARAGLIDER_BRANDS must include ${brand}`);
    }
  });

  it('should include Axis brand and all iconic Axis models from ParaMeteo catalog', () => {
    assert.ok(PARAGLIDER_BRANDS.includes('Axis'), 'PARAGLIDER_BRANDS must include Axis');
    const axisWings = searchGliders({ brand: 'Axis' });
    assert.ok(axisWings.length >= 6, `Expected at least 6 Axis wings, found ${axisWings.length}`);

    const compact = axisWings.find(w => w.model === 'Compact 4');
    assert.ok(compact, 'Must find Compact 4');
    assert.equal(compact.category, 'EN-A');
    assert.equal(compact.vTrim, 36);
    assert.equal(compact.vMax, 46);
    assert.equal(compact.ar, 4.8);
    assert.equal(compact.glideRatio, 8.4);

    const pluto = axisWings.find(w => w.model === 'Pluto 4');
    assert.ok(pluto, 'Must find Pluto 4');
    assert.equal(pluto.category, 'EN-B');
    assert.equal(pluto.vTrim, 37);
    assert.equal(pluto.vMax, 49);
    assert.equal(pluto.ar, 5.05);
    assert.equal(pluto.glideRatio, 9.3);

    const comet = axisWings.find(w => w.model === 'Comet 4');
    assert.ok(comet, 'Must find Comet 4');
    assert.equal(comet.category, 'EN-B');
    assert.equal(comet.vTrim, 39);
    assert.equal(comet.vMax, 53);
    assert.equal(comet.ar, 5.55);
    assert.equal(comet.glideRatio, 10.3);

    const vega = axisWings.find(w => w.model === 'Vega 6');
    assert.ok(vega, 'Must find Vega 6');
    assert.equal(vega.category, 'EN-C');
    assert.equal(vega.vTrim, 40);
    assert.equal(vega.vMax, 56);
    assert.equal(vega.ar, 6.25);
    assert.equal(vega.glideRatio, 11.2);

    const venus = axisWings.find(w => w.model.includes('Venus 4'));
    assert.ok(venus, 'Must find Venus 4 / SC');
    assert.equal(venus.category, 'EN-D');
    assert.equal(venus.vTrim, 41);
    assert.equal(venus.vMax, 60);
    assert.equal(venus.ar, 6.95);
    assert.equal(venus.glideRatio, 11.8);

    const sirius = axisWings.find(w => w.model.includes('Sirius 2'));
    assert.ok(sirius, 'Must find Sirius 2 (Tandem)');
    assert.equal(sirius.category, 'EN-B');
    assert.equal(sirius.vTrim, 38);
    assert.equal(sirius.vMax, 50);
    assert.equal(sirius.ar, 5.3);
    assert.equal(sirius.glideRatio, 9.5);
  });

  it('should provide a curated database of 50+ real certified paragliders', () => {
    assert.ok(POPULAR_GLIDERS.length >= 50, `Catalog must have at least 50 wings, found ${POPULAR_GLIDERS.length}`);
    for (const glider of POPULAR_GLIDERS) {
      assert.ok(glider.id, 'Glider must have id');
      assert.ok(glider.brand, 'Glider must have brand');
      assert.ok(glider.model, 'Glider must have model');
      assert.ok(glider.name.includes(glider.brand) && glider.name.includes(glider.model));
      assert.ok(['EN-A', 'EN-B', 'EN-C', 'EN-D'].includes(glider.category));
      assert.ok(typeof glider.vTrim === 'number' && glider.vTrim > 0);
      assert.ok(typeof glider.vMax === 'number' && glider.vMax > glider.vTrim);
      assert.ok(typeof glider.glideRatio === 'number' && glider.glideRatio >= 7.0);
      assert.ok(typeof glider.ar === 'number' && glider.ar >= 4.0);
    }
  });

  it('should filter gliders accurately by brand', () => {
    const ozoneGliders = searchGliders({ brand: 'Ozone' });
    assert.ok(ozoneGliders.length >= 8);
    assert.ok(ozoneGliders.every(g => g.brand === 'Ozone'));

    const advanceGliders = searchGliders({ brand: 'Advance' });
    assert.ok(advanceGliders.length >= 5);
    assert.ok(advanceGliders.every(g => g.brand === 'Advance'));

    const axisGliders = searchGliders({ brand: 'Axis' });
    assert.ok(axisGliders.length >= 6);
    assert.ok(axisGliders.every(g => g.brand === 'Axis'));
  });

  it('should search gliders by free text query across brand and model', () => {
    // Model search
    const buzzResults = searchGliders({ query: 'buzz' });
    assert.ok(buzzResults.length >= 1);
    assert.equal(buzzResults[0].model, 'Buzz Z7');
    assert.equal(buzzResults[0].brand, 'Ozone');
    assert.equal(buzzResults[0].category, 'EN-B');

    // Partial search
    const alphaResults = searchGliders({ query: 'alph' });
    assert.ok(alphaResults.some(g => g.brand === 'Advance' && g.model === 'Alpha 7'));

    // Category query
    const encResults = searchGliders({ category: 'EN-C' });
    assert.ok(encResults.length >= 8);
    assert.ok(encResults.every(g => g.category === 'EN-C'));
  });

  it('should retrieve a glider by unique ID', () => {
    const buzz = getGliderById('ozone-buzz-z7');
    assert.ok(buzz);
    assert.equal(buzz.brand, 'Ozone');
    assert.equal(buzz.model, 'Buzz Z7');
    assert.equal(buzz.category, 'EN-B');

    // Generic class lookup
    const genericB = getGliderById('EN-B');
    assert.ok(genericB);
    assert.equal(genericB.category, 'EN-B');

    // Non-existent
    assert.equal(getGliderById('non-existent-wing'), null);
  });

  it('should create a custom glider with automatic aerodynamic parameter deduction', () => {
    // Custom EN-B with deduced values
    const custom = createCustomGlider({
      brand: 'Icaro',
      model: 'Gravis 2',
      category: 'EN-B'
    });

    assert.equal(custom.brand, 'Icaro');
    assert.equal(custom.model, 'Gravis 2');
    assert.equal(custom.name, 'Icaro Gravis 2');
    assert.equal(custom.category, 'EN-B');
    assert.equal(custom.isCustom, true);
    assert.ok(custom.id.includes('icaro-gravis-2'));
    assert.equal(custom.vTrim, GLIDER_CLASSES.EN_B.vTrim);
    assert.equal(custom.glideRatio, GLIDER_CLASSES.EN_B.glideRatio);

    // Custom with overridden metrics
    const tuned = createCustomGlider({
      brand: 'Custom Lab',
      model: 'Speedster',
      category: 'EN-C',
      vTrim: 42,
      vMax: 59,
      glideRatio: 10.2
    });
    assert.equal(tuned.vTrim, 42);
    assert.equal(tuned.vMax, 59);
    assert.equal(tuned.glideRatio, 10.2);
  });

  it('should provide default class metrics via getGliderClassDefaults', () => {
    assert.equal(getGliderClassDefaults('EN-A').category, 'EN-A');
    assert.equal(getGliderClassDefaults('EN-B').category, 'EN-B');
    assert.equal(getGliderClassDefaults('EN-C').category, 'EN-C');
    assert.equal(getGliderClassDefaults('EN-D').category, 'EN-D');
    assert.equal(getGliderClassDefaults('CCC').category, 'EN-D');
    assert.equal(getGliderClassDefaults('unknown').category, 'EN-A');
  });
});
