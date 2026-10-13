/**
 * GlideMind - Tests for Takeoff Slope Exposure Sector (Mini Map Cartography Layer)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTakeoffSectorSvg, LeafletMapEngine, HeadlessMockMapEngine } from '../../ui/map/mapEngineAdapter.js';

describe('GlideMind Cartography - Takeoff Slope Exposure Sector & Launch Window', () => {

  it('should generate valid clean SVG with 70° launch sector arc without arrow line or heading badge by default', () => {
    const svg = generateTakeoffSectorSvg(170, 180, 1060, { prefix: 'test-to-' });

    assert.ok(svg.includes('<svg'), 'Must produce <svg root element');
    assert.ok(svg.includes('class="gm-takeoff-sector-svg"'), 'Must have correct CSS class');
    assert.ok(svg.includes('id="test-to-wedge"'), 'Must render sector arc wedge');
    assert.ok(!svg.includes('id="test-to-line"'), 'Must not render slope axis line by default');
    assert.ok(!svg.includes('id="test-to-arrow"'), 'Must not render directional arrowhead by default');
    assert.ok(!svg.includes('id="test-to-badge"'), 'Must not render heading angle badge by default');
    assert.ok(svg.includes('1060m'), 'Must display 1060m altitude text');
    assert.ok(svg.includes('role="img"'), 'Must be accessible with role="img"');
    assert.ok(svg.includes('aria-label='), 'Must include accessibility label');
  });

  it('should optionally render slope axis line and heading badge when explicitly requested in options', () => {
    const svg = generateTakeoffSectorSvg(170, 180, 1060, { prefix: 'test-to-', showArrow: true, showBadge: true });

    assert.ok(svg.includes('id="test-to-line"'), 'Must render slope axis line when showArrow is true');
    assert.ok(svg.includes('id="test-to-arrow"'), 'Must render directional arrowhead when showArrow is true');
    assert.ok(svg.includes('id="test-to-badge"'), 'Must render heading angle badge when showBadge is true');
    assert.ok(svg.includes('170°'), 'Must display 170° heading text when showBadge is true');
  });

  it('should color-code sector green (#22c55e) when wind is aligned in front (diff <= 35°)', () => {
    // Takeoff 180° (South), Wind 190° (diff = 10°) -> Aligned
    const svg = generateTakeoffSectorSvg(180, 190, 1000, { prefix: 'test-to-' });

    assert.ok(svg.includes('stroke="#22c55e"'), 'Aligned wind must use green stroke');
    assert.ok(svg.includes('fill="rgba(34, 197, 94, 0.22)"'), 'Aligned wind must use green fill');
    assert.ok(svg.includes('In Asse'), 'Aria label must state In Asse');
  });

  it('should color-code sector amber (#f59e0b) when wind is cross (35° < diff <= 75°)', () => {
    // Takeoff 180° (South), Wind 230° (diff = 50°) -> Crosswind
    const svg = generateTakeoffSectorSvg(180, 230, 1000, { prefix: 'test-to-' });

    assert.ok(svg.includes('stroke="#f59e0b"'), 'Crosswind must use amber stroke');
    assert.ok(svg.includes('fill="rgba(245, 158, 11, 0.22)"'), 'Crosswind must use amber fill');
    assert.ok(svg.includes('Traverso'), 'Aria label must state Traverso');
  });

  it('should color-code sector red (#ef4444) when wind is tailwind/sottovento (diff > 75°)', () => {
    // Takeoff 180° (South), Wind 0° (North, diff = 180°) -> Tailwind
    const svg = generateTakeoffSectorSvg(180, 0, 1000, { prefix: 'test-to-' });

    assert.ok(svg.includes('stroke="#ef4444"'), 'Tailwind must use red stroke');
    assert.ok(svg.includes('fill="rgba(239, 68, 68, 0.25)"'), 'Tailwind must use red fill');
    assert.ok(svg.includes('Sottovento'), 'Aria label must state Sottovento');
  });

  it('should handle wraparound angles across 0° / 360° correctly', () => {
    // Takeoff 10° (NNE), Wind 350° (NNW) -> diff = 20° (Aligned)
    const svg = generateTakeoffSectorSvg(10, 350, 1200, { prefix: 'test-to-' });

    assert.ok(svg.includes('stroke="#22c55e"'), '10° vs 350° is 20° diff and must be green');
    assert.ok(svg.includes('In Asse'), 'Must evaluate to In Asse');
  });

  it('should update windsock rotation, SVG markup, and takeoff sector when updateWindsockMarker is called', () => {
    const engine = new LeafletMapEngine();
    let wrapperTransform = '';
    let wrapperInnerHtml = '';
    let sectorInnerHtml = '';

    const mockWrapper = {
      style: {
        set transform(val) { wrapperTransform = val; },
        get transform() { return wrapperTransform; }
      },
      set innerHTML(val) { wrapperInnerHtml = val; },
      get innerHTML() { return wrapperInnerHtml; }
    };

    const mockWindsockEl = {
      querySelector(sel) {
        if (sel === '#miniws-wrapper' || sel === '.gm-windsock-wrapper') return mockWrapper;
        return null;
      }
    };

    const mockSectorEl = {
      set innerHTML(val) { sectorInnerHtml = val; },
      get innerHTML() { return sectorInnerHtml; }
    };

    engine.windsockMarker = { getElement: () => mockWindsockEl };
    engine.takeoffSectorMarker = { getElement: () => mockSectorEl };
    engine.activeMiniMapSpotData = { takeoff: { heading: 180, altitude: 1000 } };

    // Test with wind from West (270°) -> windsock points East (90°)
    engine.updateWindsockMarker({ windSpeed: 15, windGust: 20, windDir: 270, turbulence: 0.1 });

    assert.equal(wrapperTransform, 'rotate(90deg)', 'Windsock must rotate to 90deg for 270deg wind');
    assert.ok(wrapperInnerHtml.includes('<svg'), 'Must update inner pure SVG');
    assert.ok(sectorInnerHtml.includes('stroke="#ef4444"'), '270deg wind vs 180deg heading is 90deg cross/tailwind diff -> Red sector');

    // Test with wind from South (180°) -> windsock points North (0°)
    engine.updateWindsockMarker({ windSpeed: 12, windGust: 16, windDirection: 180, turbulence: 0.05 });

    assert.equal(wrapperTransform, 'rotate(0deg)', 'Windsock must rotate to 0deg for 180deg wind');
    assert.ok(sectorInnerHtml.includes('stroke="#22c55e"'), '180deg wind vs 180deg heading is 0deg diff -> Green sector');
  });

  it('should support dual windsocks (takeoff and landing) and zoom controls in LeafletMapEngine and HeadlessMockMapEngine', () => {
    // 1. HeadlessMockMapEngine zoom controls
    const mockEngine = new HeadlessMockMapEngine(null, { zoom: 12 });
    assert.equal(mockEngine.zoom, 12);
    mockEngine.zoomIn();
    assert.equal(mockEngine.zoom, 13);
    mockEngine.zoomOut();
    assert.equal(mockEngine.zoom, 12);

    // 2. LeafletMapEngine zoom controls delegating to Leaflet map instance
    const leafletEngine = new LeafletMapEngine();
    let mapZoom = 10;
    leafletEngine.map = {
      zoomIn(delta = 1) { mapZoom += delta; },
      zoomOut(delta = 1) { mapZoom -= delta; }
    };
    leafletEngine.zoomIn();
    assert.equal(mapZoom, 11);
    leafletEngine.zoomOut();
    assert.equal(mapZoom, 10);

    // 3. LeafletMapEngine dual windsocks updating independently
    let takeoffWrapperTransform = '';
    let landingWrapperTransform = '';
    let takeoffWrapperInnerHtml = '';
    let landingWrapperInnerHtml = '';

    const mockTakeoffWrapper = {
      style: {
        set transform(v) { takeoffWrapperTransform = v; },
        get transform() { return takeoffWrapperTransform; }
      },
      set innerHTML(v) { takeoffWrapperInnerHtml = v; },
      get innerHTML() { return takeoffWrapperInnerHtml; }
    };

    const mockLandingWrapper = {
      style: {
        set transform(v) { landingWrapperTransform = v; },
        get transform() { return landingWrapperTransform; }
      },
      set innerHTML(v) { landingWrapperInnerHtml = v; },
      get innerHTML() { return landingWrapperInnerHtml; }
    };

    leafletEngine.takeoffWindsockMarker = {
      getElement: () => ({
        querySelector: (sel) => (sel === '#miniws-to-wrapper' || sel === '.gm-windsock-wrapper' ? mockTakeoffWrapper : null)
      })
    };

    leafletEngine.landingWindsockMarker = {
      getElement: () => ({
        querySelector: (sel) => (sel === '#miniws-ld-wrapper' || sel === '.gm-windsock-wrapper' ? mockLandingWrapper : null)
      })
    };

    // Takeoff wind: 180° (South) -> rotates to (180+180)%360 = 0°
    // Landing wind: 90° (East) -> rotates to (90+180)%360 = 270°
    leafletEngine.updateWindsockMarker(
      { windSpeed: 10, windDirection: 180, windGust: 14 },
      { windSpeed: 12, windDirection: 90, windGust: 16 }
    );

    assert.equal(takeoffWrapperTransform, 'rotate(0deg)', 'Takeoff windsock must point North (0deg) for 180deg wind');
    assert.equal(landingWrapperTransform, 'rotate(270deg)', 'Landing windsock must point West (270deg) for 90deg wind');
    assert.ok(takeoffWrapperInnerHtml.includes('<svg'), 'Takeoff windsock must have SVG');
    assert.ok(landingWrapperInnerHtml.includes('<svg'), 'Landing windsock must have SVG');
  });

  it('should support flight analysis procedures rendering, scrubbing updates and pause/resume in HeadlessMockMapEngine', () => {
    const mockEngine = new HeadlessMockMapEngine();

    const mockData = {
      takeoff: { coordinates: '45.833, 9.302', altitude: 1060 },
      landing: { coordinates: '45.817, 9.318', altitude: 260 },
      circuitData: {
        circuitType: 'standard_c',
        polylines: {
          finalLeg: [[45.818, 9.317], [45.817, 9.318]],
          baseLeg: [[45.819, 9.319], [45.818, 9.317]],
          downwindLeg: [[45.816, 9.320], [45.819, 9.319]]
        }
      }
    };

    mockEngine.renderComprensorioFlightMap(null, mockData);
    assert.equal(mockEngine.renderedMode, 'flightAnalysis');
    assert.equal(mockEngine.paused, false);
    assert.deepEqual(mockEngine.renderedCircuitPolylines, ['finalLeg', 'baseLeg', 'downwindLeg']);
    assert.equal(mockEngine.hasTakeoffSector, true, 'Headless engine must flag takeoff sector present');
    assert.equal(mockEngine.hasGlideLine, true, 'Headless engine must flag glide line present');

    // Pause / Resume
    mockEngine.pause();
    assert.equal(mockEngine.paused, true);
    mockEngine.resume();
    assert.equal(mockEngine.paused, false);

    // Scrub update to figure eight
    const updatedCircuit = {
      circuitType: 'figure_eight',
      polylines: {
        figureEight: [[45.818, 9.316], [45.818, 9.317], [45.818, 9.318]]
      }
    };
    mockEngine.updateFlightProcedures(updatedCircuit, {
      glideMetrics: { requiredGlideRatio: 5.5, isSafe: true }
    });
    assert.deepEqual(mockEngine.renderedCircuitPolylines, ['figureEight']);
    assert.equal(mockEngine.glideMetrics.requiredGlideRatio, 5.5);

    mockEngine.destroy();
    assert.equal(mockEngine.destroyed, true);
    assert.equal(mockEngine.renderedCircuitPolylines.length, 0);
    assert.equal(mockEngine.hasTakeoffSector, false);
    assert.equal(mockEngine.hasGlideLine, false);
  });

  it('should render takeoff slope exposure sector and geodesic glide line in LeafletMapEngine flight analysis map', () => {
    const engine = new LeafletMapEngine();
    let sectorHtml = '';
    let glideStyle = {};

    const mockSectorEl = {
      set innerHTML(val) { sectorHtml = val; },
      get innerHTML() { return sectorHtml; }
    };

    engine.flightTakeoffSector = { getElement: () => mockSectorEl };
    engine.flightGlideLine = { setStyle: (style) => { Object.assign(glideStyle, style); } };
    engine.activeFlightData = { takeoff: { heading: 180, altitude: 1000 } };

    // Update with 180° wind -> sector green
    engine.updateFlightProcedures({}, {
      takeoffWeather: { windDirection: 180, windSpeed: 10 },
      glideMetrics: { isSafe: true }
    });
    assert.ok(sectorHtml.includes('stroke="#22c55e"'), '180deg wind vs 180deg heading -> Green sector in fullscreen flight map');
    assert.equal(glideStyle.color, '#16a34a', 'Safe glide line must be green');

    // Update with 0° wind (tailwind) -> sector red, and unsafe glide -> amber
    engine.updateFlightProcedures({}, {
      takeoffWeather: { windDirection: 0, windSpeed: 15 },
      glideMetrics: { isSafe: false, severity: 1 }
    });
    assert.ok(sectorHtml.includes('stroke="#ef4444"'), '0deg tailwind vs 180deg heading -> Red sector in fullscreen flight map');
    assert.equal(glideStyle.color, '#ca8a04', 'Caution glide line must be amber');
  });
});
