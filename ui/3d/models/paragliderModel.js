/**
 * GlideMind - 3D Paraglider Avatar Model & Procedural Mesh Generator
 * 
 * Provides:
 * 1. Procedural 1:1 metric Three.js Enzo 3 high-performance competition paraglider
 *    (AR ~7.6, Shark-Nose Airfoil, 54 Cells, Elliptical Closed Wingtips, 2-liner Kevlar lines).
 * 2. Solid aerodynamic cocoon pod harness with cockpit instrument flight deck and reclined pilot.
 * 3. GLB Model loader with seamless procedural fallback.
 * 4. Dynamic pose & attitude updater (heading, pitch, coordinated bank, perspective scale).
 * 
 * Complies with geodesy_webgl_3d_spec.md and laws-of-ux (Fitts's Law, Doherty Threshold):
 * - Metric 1:1 scale
 * - Aeronautical axes (+X right wingtip, +Y upward/dorsal, -Z forward flight direction)
 */

function parseRgbColor(val, fallbackHex) {
  if (val && typeof val.r === 'number' && typeof val.g === 'number' && typeof val.b === 'number') {
    return { r: val.r, g: val.g, b: val.b };
  }
  const num = typeof val === 'number' ? val : fallbackHex;
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255
  };
}

/**
 * Creates a high-performance procedural Three.js mesh group for a paraglider avatar.
 * 
 * @param {object} THREE Three.js library instance
 * @param {object} [options]
 * @param {number} [options.spanSteps=54] Number of wing cells
 * @param {number} [options.chordSteps=18] Chord resolution steps
 * @param {number} [options.span=13.2] Wingspan in meters (flat span)
 * @param {number} [options.chord=2.02] Center chord length in meters
 * @param {number} [options.archDrop=1.95] Racing catenary arch drop in meters
 * @param {number} [options.wingYBase=7.2] Line height above carabiners
 * @param {string|number} [options.canopyColor=0xdc2626] Main canopy color (default: Carmine Red)
 * @param {string|number} [options.accentColor=0xb91c1c] Rib seams color
 * @param {string|number} [options.podColor=0x182232] Cocoon pod shell color (default: Dark Carbon)
 * @param {string|number} [options.linesColor=0x475569] Suspension lines color
 * @returns {object} THREE.Group
 */
export function createParagliderMesh(THREE, options = {}) {
  if (!THREE || typeof THREE.Group !== 'function') {
    throw new Error('THREE must be a valid Three.js instance');
  }

  const group = new THREE.Group();
  group.name = 'GlideMindParagliderAvatar';

  const spanSteps = options.spanSteps || 54;
  const chordSteps = options.chordSteps || 18;
  const halfSpan = (options.span ? options.span / 2 : (options.halfSpan || 6.6));
  const centerChord = options.chord || options.centerChord || 2.02;
  const archDrop = options.archDrop || 1.95;
  const wingYBase = options.wingYBase || 7.2;

  const mainColor = parseRgbColor(options.canopyColor, 0xdc2626);       // Carmine Racing Red (Extrados main)
  const leadingBandColor = parseRgbColor(options.leadingBandColor, 0xf8fafc); // High-contrast White (Leading edge & wingtips)
  const accentBandColor = parseRgbColor(options.accentBandColor, 0xf59e0b);   // Warm Amber stripe
  const intradosColor = parseRgbColor(options.intradosColor, 0xe2e8f0);       // Light Ice-Silver (Intrados lower surface)
  const cellSeamColor = parseRgbColor(options.accentColor, 0x991b1b);         // Extrados rib seam
  const intradosSeamColor = { r: 0.58, g: 0.64, b: 0.72 };                    // Intrados subtle seam
  const intakeColor = { r: 0.10, g: 0.14, b: 0.20 };                          // Dark shark-nose cell openings
  const harnessShellColor = parseRgbColor(options.podColor, 0x182232);
  const harnessTrimColor = parseRgbColor(options.harnessTrimColor, 0xf97316);
  const linesColor = options.linesColor !== undefined ? options.linesColor : 0x64748b;

  // 1. High-Performance Reflex Shark-Nose Airfoil with Realistic Thickness Distribution:
  // - t=0 is Leading Edge (Shark-Nose Intakes facing -Z)
  // - Max thickness (16%) is at t=0.18 - 0.22
  // - Progressive taper down to 1.5% thickness at t=1.0 (Trailing Edge)
  const getAirfoil = (t, isUpper, tipFactor = 1.0) => {
    const clampedT = Math.max(0, Math.min(1, t));
    const camber = (0.055 * Math.sin(Math.PI * Math.pow(clampedT, 0.65)) - 0.015 * Math.pow(clampedT, 2.5)) * tipFactor;

    let halfThickness;
    if (clampedT < 0.22) {
      const nt = clampedT / 0.22;
      halfThickness = (0.045 + 0.035 * Math.sin(nt * Math.PI * 0.5)) * tipFactor;
    } else {
      const nt = (clampedT - 0.22) / 0.78;
      halfThickness = (0.080 * Math.pow(1.0 - nt, 1.4) + 0.005) * tipFactor;
    }

    if (isUpper) {
      return camber + halfThickness;
    } else {
      const sharkNoseCut = (clampedT < 0.08) ? (0.02 * Math.sin((clampedT / 0.08) * Math.PI)) : 0;
      return camber - halfThickness + sharkNoseCut;
    }
  };

  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  // Store trailing edge deformation metadata per vertex: [spanU, brakeWeight]
  const brakeMeta = [];

  for (let i = 0; i <= spanSteps; i++) {
    const u = -1.0 + (2.0 * i) / spanSteps; // -1 (Left Tip) to +1 (Right Tip)
    const absU = Math.abs(u);

    const tipFactor = Math.max(0.18, Math.sqrt(Math.max(0.001, 1.0 - Math.pow(absU, 2.2))));
    const currentChord = centerChord * tipFactor;

    const tipDownturn = Math.pow(absU, 4.5) * 0.40;
    const arcY = wingYBase - (u * u * archDrop) - tipDownturn;
    const arcX = u * halfSpan * (1.0 - 0.03 * u * u);
    const sweepBackZ = 0.42 * (u * u) + Math.pow(absU, 3.5) * 0.15;

    const isCellRib = (i % 2 === 0);
    const isWingtipBand = absU > 0.78;

    // Upper surface (Extrados - High-Visibility Bi-Color Racing Livery)
    // t = 0 is Leading Edge (-Z, forward flight direction); t = 1 is Trailing Edge (+Z, wake direction)
    for (let j = 0; j <= chordSteps; j++) {
      const t = j / chordSteps;
      const localZ = sweepBackZ + (t - 0.65) * currentChord;
      const localY = arcY + getAirfoil(t, true, tipFactor) * currentChord;

      positions.push(-arcX, localY, localZ);
      normals.push(-0.25 * u, 0.95, (t - 0.5) * 0.3);
      uvs.push((u + 1) * 0.5, t);

      const brakeWeight = (t > 0.68 && absU > 0.25 && absU < 0.95)
        ? ((t - 0.68) / 0.32) * Math.sin(((absU - 0.25) / 0.70) * Math.PI) * currentChord
        : 0;
      brakeMeta.push(u, brakeWeight);

      if (t < 0.05 && !isCellRib) {
        colors.push(intakeColor.r, intakeColor.g, intakeColor.b);
      } else if (isCellRib) {
        colors.push(cellSeamColor.r, cellSeamColor.g, cellSeamColor.b);
      } else if (t < 0.20 || isWingtipBand) {
        colors.push(leadingBandColor.r, leadingBandColor.g, leadingBandColor.b);
      } else if (t >= 0.20 && t <= 0.28) {
        colors.push(accentBandColor.r, accentBandColor.g, accentBandColor.b);
      } else {
        colors.push(mainColor.r, mainColor.g, mainColor.b);
      }
    }

    // Lower surface (Intrados - High-Contrast Light Ice-Silver for top/bottom distinction)
    for (let j = chordSteps - 1; j >= 1; j--) {
      const t = j / chordSteps;
      const localZ = sweepBackZ + (t - 0.65) * currentChord;
      const localY = arcY + getAirfoil(t, false, tipFactor) * currentChord;

      positions.push(-arcX, localY, localZ);
      normals.push(-0.25 * u, -0.95, (t - 0.5) * 0.3);
      uvs.push((u + 1) * 0.5, t);

      const brakeWeight = (t > 0.68 && absU > 0.25 && absU < 0.95)
        ? ((t - 0.68) / 0.32) * Math.sin(((absU - 0.25) / 0.70) * Math.PI) * currentChord
        : 0;
      brakeMeta.push(u, brakeWeight);

      if (t < 0.08 && !isCellRib) {
        colors.push(intakeColor.r, intakeColor.g, intakeColor.b);
      } else if (isCellRib) {
        colors.push(intradosSeamColor.r, intradosSeamColor.g, intradosSeamColor.b);
      } else if (t >= 0.20 && t <= 0.28) {
        colors.push(accentBandColor.r, accentBandColor.g, accentBandColor.b);
      } else {
        colors.push(intradosColor.r, intradosColor.g, intradosColor.b);
      }
    }
  }

  const vertsPerRib = chordSteps * 2;
  for (let i = 0; i < spanSteps; i++) {
    const r0 = i * vertsPerRib;
    const r1 = (i + 1) * vertsPerRib;

    for (let j = 0; j < vertsPerRib; j++) {
      const jNext = (j + 1) % vertsPerRib;
      indices.push(r0 + j, r1 + j, r0 + jNext);
      indices.push(r0 + jNext, r1 + j, r1 + jNext);
    }
  }

  // Closed End-Caps at Left Tip (i=0) and Right Tip (i=spanSteps)
  const leftCapCenterIdx = positions.length / 3;
  positions.push(positions[0], positions[1], positions[2]);
  normals.push(1.0, 0, 0);
  uvs.push(0, 0.5);
  colors.push(leadingBandColor.r, leadingBandColor.g, leadingBandColor.b);
  brakeMeta.push(-1.0, 0);

  for (let j = 0; j < vertsPerRib; j++) {
    const jNext = (j + 1) % vertsPerRib;
    indices.push(leftCapCenterIdx, jNext, j);
  }

  const rightRibStart = spanSteps * vertsPerRib;
  const rightCapCenterIdx = positions.length / 3;
  positions.push(positions[rightRibStart * 3], positions[rightRibStart * 3 + 1], positions[rightRibStart * 3 + 2]);
  normals.push(-1.0, 0, 0);
  uvs.push(1.0, 0.5);
  colors.push(leadingBandColor.r, leadingBandColor.g, leadingBandColor.b);
  brakeMeta.push(1.0, 0);

  for (let j = 0; j < vertsPerRib; j++) {
    const jNext = (j + 1) % vertsPerRib;
    indices.push(rightCapCenterIdx, rightRibStart + j, rightRibStart + jNext);
  }

  const canopyGeo = new THREE.BufferGeometry();
  const posFloat32 = new Float32Array(positions);
  canopyGeo.setAttribute('position', new THREE.Float32BufferAttribute(posFloat32, 3));
  canopyGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  canopyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  canopyGeo.setIndex(indices);
  if (typeof canopyGeo.computeVertexNormals === 'function') {
    canopyGeo.computeVertexNormals();
  }
  canopyGeo.userData = {
    basePositions: new Float32Array(positions),
    brakeMeta: new Float32Array(brakeMeta)
  };

  const canopyMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.42,
    metalness: 0.06,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -2.0
  });

  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  canopyMesh.name = 'GliderCanopy';
  canopyMesh.renderOrder = 10;
  group.add(canopyMesh);

  // 2. Clean 2-Row Kevlar Lines Rigging
  const linePositions = [];
  const harnessRightCarabiner = [-0.22, 0.48, 0.0];
  const harnessLeftCarabiner = [0.22, 0.48, 0.0];

  const spanRatios = [0.22, 0.60, 0.98];
  const rowRatios = [0.15, 0.58];

  spanRatios.forEach(u => {
    const tipFactor = Math.max(0.18, Math.sqrt(Math.max(0.001, 1.0 - Math.pow(u, 2.2))));
    const currentChord = centerChord * tipFactor;
    const tipDownturn = Math.pow(u, 4.5) * 0.40;
    const arcY = wingYBase - (u * u * archDrop) - tipDownturn;
    const arcX = u * halfSpan * (1.0 - 0.03 * u * u);
    const sweepBackZ = 0.42 * (u * u) + Math.pow(u, 3.5) * 0.15;

    rowRatios.forEach(ct => {
      const z = sweepBackZ + (ct - 0.65) * currentChord;

      linePositions.push(harnessRightCarabiner[0], harnessRightCarabiner[1], harnessRightCarabiner[2]);
      linePositions.push(-arcX, arcY - 0.02, z);

      linePositions.push(harnessLeftCarabiner[0], harnessLeftCarabiner[1], harnessLeftCarabiner[2]);
      linePositions.push(arcX, arcY - 0.02, z);
    });
  });

  // Trailing Edge Brake Lines
  [0.92].forEach(u => {
    const tipFactor = Math.max(0.18, Math.sqrt(Math.max(0.001, 1.0 - Math.pow(u, 2.2))));
    const currentChord = centerChord * tipFactor;
    const tipDownturn = Math.pow(u, 4.5) * 0.40;
    const arcY = wingYBase - (u * u * archDrop) - tipDownturn;
    const arcX = u * halfSpan * (1.0 - 0.03 * u * u);
    const sweepBackZ = 0.42 * (u * u) + Math.pow(u, 3.5) * 0.15;
    const z = sweepBackZ + (0.98 - 0.65) * currentChord;

    linePositions.push(-0.22, 0.48, 0.08);
    linePositions.push(-arcX, arcY - 0.02, z);

    linePositions.push(0.22, 0.48, 0.08);
    linePositions.push(arcX, arcY - 0.02, z);
  });

  const lineGeo = new THREE.BufferGeometry();
  const lineFloat32 = new Float32Array(linePositions);
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineFloat32, 3));
  lineGeo.userData = {
    baseLinePositions: new Float32Array(linePositions)
  };
  const lineMat = new THREE.LineBasicMaterial({
    color: linesColor,
    transparent: true,
    opacity: 0.62,
    depthTest: true,
    depthWrite: false
  });
  const linesMesh = new THREE.LineSegments(lineGeo, lineMat);
  linesMesh.name = 'SuspensionLines';
  linesMesh.renderOrder = 9;
  group.add(linesMesh);

  // 3. Monolithic Cocoon Pod Harness & Reclined Pilot Torso
  const pilotPod = new THREE.Group();
  pilotPod.name = 'PilotPod';
  pilotPod.renderOrder = 10;

  const fuseSections = [
    { z: -1.25, y: 0.02, rx: 0.01, ry: 0.01 },
    { z: -1.18, y: 0.04, rx: 0.08, ry: 0.07 },
    { z: -0.95, y: 0.08, rx: 0.16, ry: 0.14 },
    { z: -0.60, y: 0.14, rx: 0.22, ry: 0.19 },
    { z: -0.25, y: 0.19, rx: 0.25, ry: 0.23 },
    { z: 0.10,  y: 0.22, rx: 0.26, ry: 0.25 },
    { z: 0.45,  y: 0.30, rx: 0.23, ry: 0.28 },
    { z: 0.80,  y: 0.40, rx: 0.16, ry: 0.27 },
    { z: 1.15,  y: 0.48, rx: 0.08, ry: 0.22 },
    { z: 1.40,  y: 0.52, rx: 0.01, ry: 0.08 },
    { z: 1.45,  y: 0.53, rx: 0.005, ry: 0.005 }
  ];

  const fuseRadialSegs = 20;
  const fusePositions = [];
  const fuseColors = [];
  const fuseIndices = [];

  fuseSections.forEach((sec) => {
    for (let j = 0; j <= fuseRadialSegs; j++) {
      const theta = (j / fuseRadialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      fusePositions.push(sec.rx * cosT, sec.y + sec.ry * sinT, sec.z);

      const isTopTrim = sinT > 0.85 && sec.z > -1.0 && sec.z < 1.3;
      const c = isTopTrim ? harnessTrimColor : harnessShellColor;
      fuseColors.push(c.r, c.g, c.b);
    }
  });

  for (let s = 0; s < fuseSections.length - 1; s++) {
    const ring0 = s * (fuseRadialSegs + 1);
    const ring1 = (s + 1) * (fuseRadialSegs + 1);

    for (let j = 0; j < fuseRadialSegs; j++) {
      const a = ring0 + j;
      const b = ring1 + j;
      const c = ring1 + j + 1;
      const d = ring0 + j + 1;

      fuseIndices.push(a, b, d);
      fuseIndices.push(b, c, d);
    }
  }

  const fuseGeo = new THREE.BufferGeometry();
  fuseGeo.setAttribute('position', new THREE.Float32BufferAttribute(fusePositions, 3));
  fuseGeo.setAttribute('color', new THREE.Float32BufferAttribute(fuseColors, 3));
  fuseGeo.setIndex(fuseIndices);
  if (typeof fuseGeo.computeVertexNormals === 'function') {
    fuseGeo.computeVertexNormals();
  }

  const fuseMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.15,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -2.0
  });
  const podHarnessMesh = new THREE.Mesh(fuseGeo, fuseMat);
  podHarnessMesh.name = 'PodCocoonHarness';
  podHarnessMesh.renderOrder = 10;
  pilotPod.add(podHarnessMesh);

  // Cockpit Instrument Flight Deck
  if (typeof THREE.CylinderGeometry === 'function') {
    const torsoGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.44, 12);
    if (typeof torsoGeo.rotateX === 'function') torsoGeo.rotateX(Math.PI / 4.2);
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const torso = new THREE.Mesh(torsoGeo, suitMat);
    torso.position.set(0, 0.38, 0.12);
    pilotPod.add(torso);
  }

  // Face pilot forward along -Z
  pilotPod.rotation.y = Math.PI;
  group.add(pilotPod);

  // 4. Pilot Head (Teardrop racing helmet + smoked visor)
  const pilotHead = new THREE.Group();
  pilotHead.name = 'PilotHead';

  if (typeof THREE.SphereGeometry === 'function') {
    const helmetGeo = new THREE.SphereGeometry(0.16, 14, 10);
    if (typeof helmetGeo.rotateX === 'function') helmetGeo.rotateX(Math.PI / 8);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.2,
      metalness: 0.3
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 0.62, -0.18);
    pilotHead.add(helmet);

    const visorGeo = new THREE.SphereGeometry(0.165, 12, 8);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.1,
      metalness: 0.9
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.62, -0.20);
    pilotHead.add(visor);
  }

  pilotHead.rotation.y = Math.PI;
  group.add(pilotHead);

  group.userData = {
    wingYBase,
    lastBrakeLeft: 0,
    lastBrakeRight: 0
  };

  return group;
}

/**
 * Loads the 3D Paraglider model from a GLB URL or GLTFLoader,
 * falling back seamlessly to procedural mesh generation on error.
 * 
 * @param {object} THREE Three.js library instance
 * @param {string} [modelUrl='data/models/paraglider.glb'] URL or path to binary glTF model
 * @param {object} [options]
 * @returns {Promise<object>} THREE.Group
 */
export async function loadParagliderModel(THREE, modelUrl = 'data/models/paraglider.glb', options = {}) {
  if (!THREE) {
    throw new Error('THREE instance is required');
  }

  if (typeof THREE.GLTFLoader === 'function' && typeof window !== 'undefined') {
    try {
      const loader = new THREE.GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(modelUrl, resolve, undefined, reject);
      });

      if (gltf && gltf.scene) {
        const root = new THREE.Group();
        root.name = 'GlideMindParagliderAvatar';
        root.add(gltf.scene);
        return root;
      }
    } catch {
      // Fallback to procedural mesh
    }
  }

  return createParagliderMesh(THREE, options);
}

/**
 * Updates the 3D paraglider avatar pose, articulated centrifugal pendulum swing,
 * inner trailing-edge brake deflection, and Pilot POV anti-clipping visibility.
 * 
 * @param {object} avatarGroup THREE.Group
 * @param {object} pose
 * @param {number} [pose.x=0] East displacement in meters
 * @param {number} [pose.y=0] Altitude in meters
 * @param {number} [pose.z=0] South displacement in meters
 * @param {number} [pose.headingDeg=0] Compass heading in degrees
 * @param {number} [pose.pitchDeg=0] Aerodynamic pitch in degrees
 * @param {number} [pose.bankDeg=0] Coordinated bank in degrees
 * @param {number} [pose.scale=1.0] Perspective scale multiplier
 * @param {number} [pose.brakeLeft=0] Left trailing-edge brake pull [0, 1]
 * @param {number} [pose.brakeRight=0] Right trailing-edge brake pull [0, 1]
 * @param {string} [pose.cameraMode='chase'] Active camera mode ('chase' | 'cockpit' | 'free')
 */
export function updateAvatarPose(avatarGroup, pose = {}) {
  if (!avatarGroup || !avatarGroup.position) return;

  const x = pose.x || 0;
  const y = pose.y || 0;
  const z = pose.z || 0;
  avatarGroup.position.set(x, y, z);

  const headingDeg = pose.headingDeg || 0;
  const pitchDeg = pose.pitchDeg || 0;
  const bankDeg = pose.bankDeg || 0;

  // Rotations in radians:
  // Heading: in Three.js Y-Up space, North is -Z, East is +X.
  const rotY = -((headingDeg * Math.PI) / 180);

  // Pitch: nose up rotates around lateral axis X
  const rotX = (pitchDeg * Math.PI) / 180;

  // Bank: right wing down rotates around longitudinal axis Z
  const rotZ = -((bankDeg * Math.PI) / 180);

  if (typeof avatarGroup.rotation?.set === 'function') {
    avatarGroup.rotation.set(rotX, rotY, rotZ, 'YXZ');
  }

  const scale = Math.max(0.1, pose.scale || 1.0);
  if (typeof avatarGroup.scale?.setScalar === 'function') {
    avatarGroup.scale.setScalar(scale);
  }

  // Articulated Pendulum Mechanics & Cockpit POV Anti-Clipping on Child Meshes
  if (Array.isArray(avatarGroup.children) && avatarGroup.children.length > 0) {
    const isCockpitPov = pose.cameraMode === 'cockpit';
    const bankRad = (bankDeg * Math.PI) / 180;

    // When the group rotates by rotZ around (0,0,0), shifting the canopy inward (-sin(bank)*pivotH)
    // and swinging the pilot pod outward (+sin(bank)*swingArm) shifts the effective center of
    // rotation up into the canopy/risers so the pilot swings outward under centrifugal force!
    const canopyShiftX = -Math.sin(bankRad) * 3.2;
    const podSwingX = Math.sin(bankRad) * 1.35;
    const podSwingY = (1 - Math.cos(bankRad)) * 0.65;

    const brakeRight = Math.max(0, Math.min(1, Number(pose.brakeRight) || (bankDeg > 1 ? Math.min(1, bankDeg / 42) : 0)));
    const brakeLeft = Math.max(0, Math.min(1, Number(pose.brakeLeft) || (bankDeg < -1 ? Math.min(1, -bankDeg / 42) : 0)));

    for (const child of avatarGroup.children) {
      if (!child) continue;
      if (child.name === 'PilotPod' || child.name === 'PilotHead') {
        child.visible = !isCockpitPov;
        if (child.position && typeof child.position.set === 'function') {
          child.position.set(podSwingX, podSwingY, 0);
        }
      } else if (child.name === 'GliderCanopy') {
        child.visible = true;
        if (child.position && typeof child.position.set === 'function') {
          child.position.set(canopyShiftX, 0, 0);
        }
        // Apply inner trailing-edge brake deflection if brake state changed significantly
        const geo = child.geometry;
        const ud = geo?.userData;
        const posAttr = geo?.attributes?.position;
        if (ud && ud.basePositions && ud.brakeMeta && posAttr && posAttr.array && posAttr.array.length === ud.basePositions.length) {
          const prevBL = avatarGroup.userData?.lastBrakeLeft ?? -1;
          const prevBR = avatarGroup.userData?.lastBrakeRight ?? -1;
          if (Math.abs(brakeLeft - prevBL) > 0.03 || Math.abs(brakeRight - prevBR) > 0.03) {
            const base = ud.basePositions;
            const meta = ud.brakeMeta;
            const arr = posAttr.array;
            const vCount = base.length / 3;
            for (let v = 0; v < vCount; v++) {
              const u = meta[v * 2];
              const weight = meta[v * 2 + 1];
              // u > 0 corresponds to right wing (-arcX), u < 0 corresponds to left wing (+arcX)
              const activeBrake = u > 0 ? brakeRight : brakeLeft;
              const deflectionY = weight * activeBrake * 0.26;
              arr[v * 3 + 1] = base[v * 3 + 1] - deflectionY;
            }
            posAttr.needsUpdate = true;
            if (avatarGroup.userData) {
              avatarGroup.userData.lastBrakeLeft = brakeLeft;
              avatarGroup.userData.lastBrakeRight = brakeRight;
            }
          }
        }
      } else if (child.name === 'SuspensionLines') {
        child.visible = true;
        const lGeo = child.geometry;
        const baseLines = lGeo?.userData?.baseLinePositions;
        const lPosAttr = lGeo?.attributes?.position;
        if (baseLines && lPosAttr && lPosAttr.array && lPosAttr.array.length === baseLines.length) {
          const arr = lPosAttr.array;
          for (let k = 0; k < arr.length; k += 6) {
            // Even vertex: carabiner attachment on pilot pod
            arr[k]     = baseLines[k] + podSwingX;
            arr[k + 1] = baseLines[k + 1] + podSwingY;
            arr[k + 2] = baseLines[k + 2];
            // Odd vertex: upper attachment on canopy intrados
            arr[k + 3] = baseLines[k + 3] + canopyShiftX;
            arr[k + 4] = baseLines[k + 4];
            arr[k + 5] = baseLines[k + 5];
          }
          lPosAttr.needsUpdate = true;
        }
      }
    }
  }
}

