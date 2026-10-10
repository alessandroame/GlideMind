/**
 * GlideMind - Aerodynamic Windsock Kinematics & Vector Engine (Headless Core)
 * 
 * Capabilities:
 * 1. Computes kinematic deflection, whip-wave flutter, and gust stretch for a 12-segment windsock.
 * 2. Standard aeronautical alternating stripes (Aviation Orange/Red & White).
 * 3. Pure SVG string markup generation with scoped keyframe animations.
 * 
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * - ZERO DOM DEPENDENCIES: Never references browser DOM nodes or globals.
 * - 100% testable and executable in headless Node.js runtimes (conforms to Shift-Left Gate 1).
 */

/**
 * Normalizes an azimuth angle to the [0, 360) range, handling negative angles and -0.
 * @param {number} deg
 * @returns {number}
 */
export function normalizeAngle(deg) {
  const num = Number(deg);
  if (!Number.isFinite(num)) return 0;
  const a = ((num % 360) + 360) % 360;
  return a === 0 ? 0 : a;
}

/**
 * Classifies wind speed into an aeronautical elevation stage for paragliding (EN-A novice envelope).
 * - Stage 0: Calm (< 5 km/h) - Limp, droop downwards
 * - Stage 1: Light (5 - 11.9 km/h) - Slight elevation (~30-50°)
 * - Stage 2: Ideal EN-A (12 - 18 km/h) - Steady flight envelope (~50-75°)
 * - Stage 3: Caution (18.1 - 25 km/h) - Horizontal, vigorous flutter (~80-90°)
 * - Stage 4: Danger (> 25 km/h) - Blown out, high-speed whip wave
 * 
 * @param {number} speed Wind speed in km/h
 * @returns {number} Stage integer (0 to 4)
 */
export function getWindsockElevationStage(speed) {
  const v = Math.max(0, speed || 0);
  if (v < 5) return 0;
  if (v < 12) return 1;
  if (v <= 18) return 2;
  if (v <= 25) return 3;
  return 4;
}

/**
 * Calculates physical kinematics, 12-segment coordinates, and flutter dynamics.
 * 
 * @param {number} speed Wind speed in km/h at takeoff/surface altitude
 * @param {number} gust Maximum gust speed in km/h
 * @param {number} direction Meteorological wind direction in degrees (0..360, where wind blows from)
 * @param {number} [turbulence=0] Normalized turbulence factor / EDR (0.0 to 1.0)
 * @returns {object} Calculated kinematic parameters and segment array
 */
export function calculateWindsockKinematics(speed = 0, gust = 0, direction = 0, turbulence = 0) {
  const cleanSpeed = Math.max(0, Number(speed) || 0);
  const cleanGust = Math.max(cleanSpeed, Number(gust) || 0);
  const cleanDir = normalizeAngle(Number(direction) || 0);
  const cleanTurb = Math.min(1.0, Math.max(0, Number(turbulence) || 0));

  // The windsock points downwind (direction from which wind blows + 180 degrees)
  const rotation = (cleanDir + 180) % 360;

  const effectiveSpeed = Math.max(cleanSpeed, cleanGust > 0 ? cleanGust * 0.40 : 0);
  const hasWindOrGust = cleanSpeed > 0 || cleanGust > 0;
  const isCalm = cleanSpeed < 2 && cleanGust < 3;

  // Length calculations: Nominal wind vs Gust extension (in SVG virtual pixels)
  const sLen = Math.min(effectiveSpeed * 3.5, 88);
  const gLen = Math.max(sLen, Math.min(cleanGust * 3.5, 95));
  const gustDelta = Math.max(0, cleanGust - cleanSpeed);
  const stretchScale = sLen > 0 ? Math.min(2.2, Math.max(1.0, gLen / sLen)) : 1.0;

  // Dynamics: Flutter oscillation period governed by wind speed and turbulence
  const turbFactor = Math.min(20, Math.max(0, cleanTurb * 25));
  const basePeriod = Math.max(0.7, 2.6 - (effectiveSpeed * 0.03));
  const turbSpeedFactor = 1.0 + (turbFactor * 0.08);
  const flutterDuration = Math.max(0.35, basePeriod / turbSpeedFactor);

  // Segment Coordinate Mapping (Base mounting mouth at Y=96, tapering towards apex)
  const baseY = 96;
  const hS = sLen / 12;
  const hG = gLen / 12;

  const yArrS = [];
  const yArrG = [];
  const wArr = [];

  for (let i = 0; i <= 12; i++) {
    yArrS.push(baseY - i * hS);
    yArrG.push(baseY - i * hG);
    // Mouth width 24px tapering down to 12px at tail
    wArr.push(24 - (12 * (i / 12)));
  }

  // Aerodynamic tension & oscillation amplitude
  const maxLen = 96 - yArrS[12];
  const tensionFactor = Math.max(0.20, 35.0 / Math.max(35, maxLen));
  const flowFactor = Math.min(15, effectiveSpeed * 0.25 + gustDelta * 0.15);
  const totalTurbFactor = Math.min(25, turbFactor + flowFactor);
  const baseOsc = isCalm ? 0 : totalTurbFactor * 0.85 * tensionFactor;

  // Build segment objects
  const segments = [];
  const overlap = 0.8;

  for (let k = 1; k <= 12; k++) {
    // 5 alternating aeronautical stripes: Segments 1..3 Red/Orange, 4..6 White, 7..9 Red/Orange, 10..12 White
    const isRed = (k <= 3 || (k >= 7 && k <= 9));
    const fill = isRed ? '#ef4444' : '#ffffff';
    const yTop = yArrS[k - 1];
    const yBot = (k === 12) ? yArrS[k] : (yArrS[k] - overlap);
    const wTop = wArr[k - 1];
    const wBot = wArr[k];
    const amp = isCalm ? 0 : (baseOsc * (0.20 + (k / 12) * 1.10));
    const delay = flutterDuration * 0.022 * (k - 1);
    const originY = k === 1 ? baseY : yArrS[k - 1];

    segments.push({
      index: k,
      fill,
      yTop: Number(yTop.toFixed(2)),
      yBot: Number(yBot.toFixed(2)),
      wTop: Number(wTop.toFixed(2)),
      wBot: Number(wBot.toFixed(2)),
      amp: Number(amp.toFixed(2)),
      delay: Number(delay.toFixed(3)),
      originY: Number(originY.toFixed(2))
    });
  }

  return {
    speed: cleanSpeed,
    gust: cleanGust,
    direction: cleanDir,
    turbulence: cleanTurb,
    rotation,
    effectiveSpeed: Number(effectiveSpeed.toFixed(2)),
    hasWindOrGust,
    isCalm,
    nominalLength: Number(sLen.toFixed(2)),
    gustLength: Number(gLen.toFixed(2)),
    stretchScale: Number(stretchScale.toFixed(3)),
    flutterDuration: Number(flutterDuration.toFixed(2)),
    gustPeriod: 2.40,
    hasGustAnim: gustDelta > 1.5 && hasWindOrGust,
    elevationStage: getWindsockElevationStage(cleanSpeed),
    yArrS,
    yArrG,
    wArr,
    segments
  };
}

/**
 * Generates scoped CSS keyframes and animation rules for whip-wave propagation.
 * 
 * @param {object} kinematics Result from calculateWindsockKinematics
 * @param {string} [prefix='gm-ws-'] Unique CSS class/animation prefix
 * @returns {string} Clean CSS text
 */
export function generateWindsockKeyframeCss(kinematics, prefix = 'gm-ws-') {
  const animPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '');
  const { segments, flutterDuration, hasGustAnim, stretchScale, gustPeriod } = kinematics;

  let keyframesCss = '';
  let rulesCss = '';

  for (const seg of segments) {
    const k = seg.index;
    const shift = (k - 1) * 0.8;
    const p1 = (40.0 + shift).toFixed(1);
    const p3 = (55.0 + shift).toFixed(1);

    keyframesCss += `  @keyframes ${animPrefix}Snake${k} {
    0%, 35% { transform: rotate(0deg); }
    ${p1}% { transform: rotate(-${seg.amp}deg); }
    50% { transform: rotate(0deg); }
    ${p3}% { transform: rotate(${seg.amp}deg); }
    65%, 100% { transform: rotate(0deg); }
  }\n`;

    rulesCss += `  .${prefix}seg-${k} {
    animation: ${animPrefix}Snake${k} ${flutterDuration}s cubic-bezier(0.37, 0, 0.63, 1) infinite;
    animation-delay: ${seg.delay}s;
    transform-origin: 120px ${seg.originY}px;
  }\n`;
  }

  let gustCss = '';
  if (hasGustAnim) {
    gustCss = `  @keyframes ${animPrefix}GustPulse {
    0%, 100% { transform: scaleY(1); }
    45%, 55% { transform: scaleY(${stretchScale}); }
  }
  .${prefix}gust-container {
    transform-origin: 120px 96px;
    animation: ${animPrefix}GustPulse ${gustPeriod}s ease-in-out infinite;
  }\n`;
  } else {
    gustCss = `  .${prefix}gust-container {
    transform-origin: 120px 96px;
    transform: scaleY(1);
  }\n`;
  }

  return `${keyframesCss}\n${rulesCss}\n${gustCss}`;
}

/**
 * Generates a complete, pure SVG windsock string markup.
 * 
 * @param {number} speed Wind speed in km/h
 * @param {number} gust Wind gust in km/h
 * @param {number} direction Direction in degrees (0..360)
 * @param {number} [turbulence=0] Normalized turbulence (0..1)
 * @param {object} [options={}] Optional configuration
 * @param {string} [options.prefix='gm-ws-'] Unique class prefix
 * @param {number} [options.scale=0.5] Display scaling factor
 * @param {boolean} [options.includeWrapper=true] Whether to wrap in outer sizing div
 * @returns {string} Pure HTML/SVG string
 */
export function generateWindsockSvg(speed, gust, direction, turbulence = 0, options = {}) {
  const prefix = options.prefix || 'gm-ws-';
  const scale = typeof options.scale === 'number' ? options.scale : 0.5;
  const includeWrapper = options.includeWrapper !== false;

  const kinematics = calculateWindsockKinematics(speed, gust, direction, turbulence);
  const styleCss = generateWindsockKeyframeCss(kinematics, prefix);

  const { rotation, hasWindOrGust, segments } = kinematics;

  let svgContent = '';
  svgContent += `<style id="${prefix}style">${styleCss}</style>`;
  svgContent += '<svg width="240" height="240" viewBox="0 0 240 240" style="overflow: visible;" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Manica a vento vettoriale">';

  // 1. Mounting Rig Lines
  svgContent += '<line x1="120" y1="120" x2="108" y2="96" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="2 3" />';
  svgContent += '<line x1="120" y1="120" x2="132" y2="96" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="2 3" />';

  // 2. Gust Container
  svgContent += `<g id="${prefix}gust-container" class="${prefix}gust-container">`;

  // 3. 12 Nested Segments for S-Curve Whip Wave
  for (const seg of segments) {
    const k = seg.index;
    const strokeOpacity = hasWindOrGust ? '1' : '0';
    const fillOpacity = hasWindOrGust ? '1' : '0';

    svgContent += `<g id="${prefix}group-${k}" class="${prefix}seg-${k}">`;
    svgContent += `<path id="${prefix}stripe-${k}" d="M ${120 - seg.wTop / 2} ${seg.yTop} L ${120 + seg.wTop / 2} ${seg.yTop} L ${120 + seg.wBot / 2} ${seg.yBot} L ${120 - seg.wBot / 2} ${seg.yBot} Z" fill="${seg.fill}" stroke="none" fill-opacity="${fillOpacity}"/>`;
    svgContent += `<path id="${prefix}side-${k}-l" d="M ${120 - seg.wTop / 2} ${seg.yTop} L ${120 - seg.wBot / 2} ${seg.yBot}" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-opacity="${strokeOpacity}"/>`;
    svgContent += `<path id="${prefix}side-${k}-r" d="M ${120 + seg.wTop / 2} ${seg.yTop} L ${120 + seg.wBot / 2} ${seg.yBot}" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-opacity="${strokeOpacity}"/>`;

    if (k === 12) {
      svgContent += `<path id="${prefix}side-12-b" d="M ${120 - seg.wBot / 2} ${seg.yBot} L ${120 + seg.wBot / 2} ${seg.yBot}" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-opacity="${strokeOpacity}"/>`;
    }
  }

  // Close all 12 nested <g> tags
  for (let k = 1; k <= 12; k++) {
    svgContent += '</g>';
  }

  // Close gust container <g>
  svgContent += '</g>';

  // 4. Throat / Mouth Opening Ring (Rigid metallic swivel ring)
  svgContent += '<ellipse cx="120" cy="96" rx="12" ry="4" fill="#0f172a" stroke="#cbd5e1" stroke-width="2"/>';
  svgContent += '</svg>';

  if (!includeWrapper) {
    return svgContent;
  }

  return [
    `<div class="gm-windsock-scaler" style="transform: scale(${scale}); transform-origin: center; width: 240px; height: 240px;">`,
    `  <div id="${prefix}wrapper" class="gm-windsock-wrapper" style="transform: rotate(${rotation}deg); transform-origin: 120px 120px; width: 240px; height: 240px; pointer-events: none;">`,
    `    ${svgContent}`,
    '  </div>',
    '</div>'
  ].join('\n');
}
