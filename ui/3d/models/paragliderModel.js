/**
 * GlideMind - 3D Paraglider Avatar Model & Procedural Mesh Generator
 * 
 * Provides:
 * 1. Procedural 1:1 metric Three.js paraglider mesh (canopy, suspension lines, pilot pod)
 * 2. GLB Model loader with procedural fallback
 * 3. Dynamic pose & attitude updater (heading, pitch, coordinated bank, perspective scale)
 * 
 * Complies with geodesy_webgl_3d_spec.md:
 * - Metric 1:1 scale
 * - Aeronautical axes (+X right wingtip, +Y upward/dorsal, -Z forward flight direction)
 */

/**
 * Creates a procedural Three.js mesh group for a paraglider.
 * 
 * @param {object} THREE Three.js library instance
 * @param {object} [options]
 * @param {string|number} [options.canopyColor=0xf97316] Main canopy color (default: safety orange)
 * @param {string|number} [options.accentColor=0x0284c7] Accent / stripe color (default: aero blue)
 * @param {string|number} [options.podColor=0x1e293b] Harness / pod color (default: slate 800)
 * @param {string|number} [options.linesColor=0x94a3b8] Suspension lines color (default: light slate)
 * @param {number} [options.span=10.5] Wingspan in meters
 * @param {number} [options.chord=2.4] Wing chord in meters
 * @param {number} [options.linesDrop=6.5] Suspension line drop distance in meters
 * @returns {object} THREE.Group
 */
export function createParagliderMesh(THREE, options = {}) {
  if (!THREE || typeof THREE.Group !== 'function') {
    throw new Error('THREE must be a valid Three.js instance');
  }

  const group = new THREE.Group();
  group.name = 'GlideMindParagliderAvatar';

  const span = options.span || 10.5;
  const halfSpan = span / 2;
  const chord = options.chord || 2.4;
  const linesDrop = options.linesDrop || 6.5;

  const canopyColor = options.canopyColor !== undefined ? options.canopyColor : 0xf97316;
  const podColor = options.podColor !== undefined ? options.podColor : 0x1e293b;
  const linesColor = options.linesColor !== undefined ? options.linesColor : 0x94a3b8;

  // 1. CANOPY GEOMETRY
  // Build parametric anhedral arch canopy with cambered profile
  const nSpan = 18;
  const nChord = 8;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const archHeight = 1.1; // m
  const thickness = 0.32; // m

  for (let s = 0; s <= nSpan; s++) {
    const u = s / nSpan;
    const x = -halfSpan + u * span;
    const eta = x / halfSpan;
    const archY = archHeight * (1 - eta * eta);

    for (let c = 0; c <= nChord; c++) {
      const v = c / nChord;
      // -Z is forward leading edge, +Z is rear trailing edge
      const z = -chord * 0.4 + v * chord;
      const thickFactor = 4 * v * Math.pow(Math.max(0, 1 - v), 1.2);
      const halfT = (thickness * thickFactor) / 2;

      // Upper surface (Extrados)
      positions.push(x, archY + halfT, z);
      normals.push(-0.25 * eta, 0.95, (v - 0.5) * 0.3);
      uvs.push(u, v);

      // Lower surface (Intrados)
      positions.push(x, archY - halfT, z);
      normals.push(-0.25 * eta, -0.95, (v - 0.5) * 0.3);
      uvs.push(u, v);
    }
  }

  const stride = 2;
  const nCPoints = nChord + 1;

  for (let s = 0; s < nSpan; s++) {
    for (let c = 0; c < nChord; c++) {
      const i0 = (s * nCPoints + c) * stride;
      const i1 = ((s + 1) * nCPoints + c) * stride;
      const i2 = ((s + 1) * nCPoints + (c + 1)) * stride;
      const i3 = (s * nCPoints + (c + 1)) * stride;

      // Upper surface quad
      indices.push(i0, i1, i2);
      indices.push(i0, i2, i3);

      // Lower surface quad
      const j0 = i0 + 1;
      const j1 = i1 + 1;
      const j2 = i2 + 1;
      const j3 = i3 + 1;
      indices.push(j0, j2, j1);
      indices.push(j0, j3, j2);
    }
  }

  const canopyGeom = new THREE.BufferGeometry();
  canopyGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  canopyGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  canopyGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  canopyGeom.setIndex(indices);

  const canopyMat = new THREE.MeshStandardMaterial({
    color: canopyColor,
    roughness: 0.45,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const canopyMesh = new THREE.Mesh(canopyGeom, canopyMat);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  canopyMesh.name = 'GliderCanopy';
  group.add(canopyMesh);

  // 2. PILOT & HARNESS POD
  // Streamlined pod located at Y = -linesDrop
  const podGeom = new THREE.CylinderGeometry(0.24, 0.16, 1.4, 12);
  podGeom.rotateX(Math.PI / 2); // Align cylinder along Z (longitudinal)

  const podMat = new THREE.MeshStandardMaterial({
    color: podColor,
    roughness: 0.6,
    metalness: 0.1
  });

  const podMesh = new THREE.Mesh(podGeom, podMat);
  podMesh.position.set(0, -linesDrop, 0.15);
  podMesh.name = 'PilotPod';
  group.add(podMesh);

  // Pilot Helmet / Head
  const headGeom = new THREE.SphereGeometry(0.16, 10, 8);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3
  });
  const headMesh = new THREE.Mesh(headGeom, headMat);
  headMesh.position.set(0, -linesDrop + 0.3, -0.15);
  headMesh.name = 'PilotHead';
  group.add(headMesh);

  // 3. SUSPENSION LINES CASCADE
  // Connect 10 canopy attachment points along the arch to harness risers
  const linePositions = [];
  const riserLeft = [-0.22, -linesDrop + 0.45, 0.0];
  const riserRight = [0.22, -linesDrop + 0.45, 0.0];

  const anchorSpans = [-0.85, -0.6, -0.35, -0.1, 0.1, 0.35, 0.6, 0.85];
  const anchorChords = [-0.15, 0.35]; // A-lines (forward) and C-lines (rear)

  for (const sFrac of anchorSpans) {
    const ax = sFrac * halfSpan;
    const ay = archHeight * (1 - sFrac * sFrac);
    const riser = ax < 0 ? riserLeft : riserRight;

    for (const cz of anchorChords) {
      linePositions.push(ax, ay, cz);
      linePositions.push(riser[0], riser[1], riser[2]);
    }
  }

  const linesGeom = new THREE.BufferGeometry();
  linesGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

  const linesMat = new THREE.LineBasicMaterial({
    color: linesColor,
    transparent: true,
    opacity: 0.75
  });

  const linesMesh = new THREE.LineSegments(linesGeom, linesMat);
  linesMesh.name = 'SuspensionLines';
  group.add(linesMesh);

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

  // Attempt GLTFLoader if available in browser
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

  // Procedural mesh fallback
  return createParagliderMesh(THREE, options);
}

/**
 * Updates the 3D paraglider avatar pose and attitude smoothly.
 * 
 * Coordinate Transformation:
 * - Position (x, y, z): Topocentric metric coordinates in Three.js space
 * - Heading: Bearing [0, 360) rotated around Y axis (North = -Z, East = +X)
 * - Pitch: Kinematic pitch angle [-45, +45] rotated around lateral X axis (nose up = +X)
 * - Bank: Coordinated bank angle [-65, +65] rotated around longitudinal Z axis (right wing down = -Z)
 * - Scale: Visual scale multiplier (>= 1.0)
 * 
 * @param {object} avatarGroup THREE.Group
 * @param {object} pose
 * @param {number} [pose.x=0] East displacement in meters
 * @param {number} [pose.y=0] Altitude in meters
 * @param {number} [pose.z=0] South displacement in meters
 * @param {number} [pose.headingDeg=0] Compass heading in degrees
 * @param {number} [pose.pitchDeg=0] Kinematic pitch in degrees
 * @param {number} [pose.bankDeg=0] Aerodynamic bank in degrees
 * @param {number} [pose.scale=1.0] Perspective scale multiplier
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
  // Bearing 0 -> rotY = 0
  // Bearing 90 -> rotY = -PI/2
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
}
