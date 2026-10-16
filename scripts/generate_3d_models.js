/**
 * Standalone glTF 2.0 Binary (.glb) Paraglider Model Generator
 * 
 * Generates data/models/paraglider.glb without external dependencies.
 * Compliant with geodesy_webgl_3d_spec.md:
 * - 1:1 metric scale
 * - Aeronautical axes (+X right wingtip, +Y dorsal, -Z forward/nose)
 * - Wing canopy, suspension lines, and aerodynamic pilot pod
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT_DIR, 'data', 'models');
const TARGET_GLB = path.join(MODELS_DIR, 'paraglider.glb');

export function generateParagliderGlb() {
  // Geometric parameters
  const span = 10.5; // wingspan (m)
  const halfSpan = span / 2;
  const chord = 2.4; // chord (m)
  const nSpanSegments = 24;
  const nChordSegments = 10;
  const archHeight = 1.1; // anhedral arch height (m)
  const canopyThickness = 0.32; // max profile thickness (m)
  const linesLength = 6.2; // lines drop to harness (m)

  // Arrays for Canopy Mesh (Positions, Normals, Colors, Indices)
  const canopyPositions = [];
  const canopyNormals = [];
  const canopyColors = [];
  const canopyIndices = [];

  // Generate upper and lower surfaces (extrados and intrados)
  // i in [0..nSpanSegments], j in [0..nChordSegments]
  for (let s = 0; s <= nSpanSegments; s++) {
    const u = s / nSpanSegments; // 0 to 1
    const x = -halfSpan + u * span;
    // Normalized span position from center [-1, 1]
    const eta = (x / halfSpan);
    const absEta = Math.abs(eta);
    // Parabolic arch: y highest at center (x=0), lower at tips
    const archY = archHeight * (1 - Math.pow(eta, 2));
    const isTipBand = absEta > 0.78;

    for (let c = 0; c <= nChordSegments; c++) {
      const v = c / nChordSegments; // 0 (leading edge) to 1 (trailing edge)
      // Chord position: -Z is nose/leading edge, +Z is trailing edge with backward wingtip sweep
      const tipFactor = Math.max(0.22, Math.sqrt(Math.max(0.001, 1.0 - Math.pow(absEta, 2.2))));
      const currentChord = chord * tipFactor;
      const sweepBackZ = 0.42 * (eta * eta) + Math.pow(absEta, 3.5) * 0.15;
      const z = sweepBackZ + (v - 0.65) * currentChord;

      // NACA-like camber / thickness distribution
      // Maximum thickness around v = 0.25 - 0.30
      const thicknessFactor = 4 * v * Math.pow(1 - v, 1.2);
      const halfThick = (canopyThickness * thicknessFactor) / 2;

      // Upper surface vertex (Extrados: White leading edge/tips, Amber stripe, Carmine Red main)
      const yUpper = archY + halfThick;
      canopyPositions.push(x, yUpper, z);
      canopyNormals.push(0.3 * -eta, 0.9, (v - 0.5) * 0.4);
      if (v < 0.20 || isTipBand) {
        canopyColors.push(0.97, 0.98, 0.99);
      } else if (v <= 0.28) {
        canopyColors.push(0.96, 0.62, 0.04);
      } else {
        canopyColors.push(0.86, 0.15, 0.15);
      }

      // Lower surface vertex (Intrados: Light Ice-Silver for instant top/bottom distinction)
      const yLower = archY - halfThick;
      canopyPositions.push(x, yLower, z);
      canopyNormals.push(0.3 * -eta, -0.9, (v - 0.5) * 0.4);
      if (v >= 0.20 && v <= 0.28) {
        canopyColors.push(0.96, 0.62, 0.04);
      } else {
        canopyColors.push(0.89, 0.91, 0.94);
      }
    }
  }

  // Generate triangle indices for upper surface
  const stride = 2; // upper and lower interleaved
  const chordPoints = (nChordSegments + 1);

  for (let s = 0; s < nSpanSegments; s++) {
    for (let c = 0; c < nChordSegments; c++) {
      const i0 = (s * chordPoints + c) * stride; // upper
      const i1 = ((s + 1) * chordPoints + c) * stride;
      const i2 = ((s + 1) * chordPoints + (c + 1)) * stride;
      const i3 = (s * chordPoints + (c + 1)) * stride;

      // Quad upper: (i0, i1, i2) and (i0, i2, i3)
      canopyIndices.push(i0, i1, i2);
      canopyIndices.push(i0, i2, i3);

      // Lower surface indices
      const j0 = i0 + 1;
      const j1 = i1 + 1;
      const j2 = i2 + 1;
      const j3 = i3 + 1;

      // Quad lower (reversed winding): (j0, j2, j1) and (j0, j3, j2)
      canopyIndices.push(j0, j2, j1);
      canopyIndices.push(j0, j3, j2);
    }
  }

  // Add Pilot / Harness Pod Mesh
  // An aerodynamic capsule at (0, -linesLength, 0.2)
  const harnessCenter = [0, -linesLength, 0.1];
  const podLength = 1.4;
  const podRadius = 0.26;
  const podVertexStart = canopyPositions.length / 3;

  const nPodSegs = 12;
  const nPodRings = 8;
  for (let r = 0; r <= nPodRings; r++) {
    const vr = r / nPodRings; // 0 to 1
    const pz = harnessCenter[2] - podLength * 0.5 + vr * podLength;
    // Radius profile: round nose, tapered tail
    const rad = podRadius * Math.sin(vr * Math.PI);

    for (let seg = 0; seg < nPodSegs; seg++) {
      const theta = (seg / nPodSegs) * Math.PI * 2;
      const px = harnessCenter[0] + rad * Math.cos(theta);
      const py = harnessCenter[1] + rad * Math.sin(theta);

      canopyPositions.push(px, py, pz);
      canopyNormals.push(Math.cos(theta), Math.sin(theta), 0.2);
      canopyColors.push(0.10, 0.14, 0.20);
    }
  }

  for (let r = 0; r < nPodRings; r++) {
    for (let seg = 0; seg < nPodSegs; seg++) {
      const nextSeg = (seg + 1) % nPodSegs;
      const p0 = podVertexStart + r * nPodSegs + seg;
      const p1 = podVertexStart + (r + 1) * nPodSegs + seg;
      const p2 = podVertexStart + (r + 1) * nPodSegs + nextSeg;
      const p3 = podVertexStart + r * nPodSegs + nextSeg;

      canopyIndices.push(p0, p1, p2);
      canopyIndices.push(p0, p2, p3);
    }
  }

  // Convert to TypedArrays
  const posArray = new Float32Array(canopyPositions);
  const normArray = new Float32Array(canopyNormals);
  const colArray = new Float32Array(canopyColors);
  const indArray = new Uint16Array(canopyIndices);

  // Compute bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < posArray.length; i += 3) {
    const x = posArray[i], y = posArray[i + 1], z = posArray[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // Binary buffer layout:
  // Buffer 0:
  // - Indices: indArray.byteLength (padded to 4 bytes)
  // - Positions: posArray.byteLength
  // - Normals: normArray.byteLength
  // - Colors: colArray.byteLength
  const indByteLen = indArray.byteLength;
  const indPad = (4 - (indByteLen % 4)) % 4;
  const posByteLen = posArray.byteLength;
  const normByteLen = normArray.byteLength;
  const colByteLen = colArray.byteLength;

  const totalBinLen = indByteLen + indPad + posByteLen + normByteLen + colByteLen;
  const binBuffer = Buffer.alloc(totalBinLen);

  // Copy indices
  Buffer.from(indArray.buffer).copy(binBuffer, 0);
  // Copy positions
  const posOffset = indByteLen + indPad;
  Buffer.from(posArray.buffer).copy(binBuffer, posOffset);
  // Copy normals
  const normOffset = posOffset + posByteLen;
  Buffer.from(normArray.buffer).copy(binBuffer, normOffset);
  // Copy colors
  const colOffset = normOffset + normByteLen;
  Buffer.from(colArray.buffer).copy(binBuffer, colOffset);

  // glTF JSON Structure
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'GlideMind 3D Glider Generator'
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Paraglider' }],
    materials: [
      {
        name: 'CanopyMaterial',
        pbrMetallicRoughness: {
          baseColorFactor: [1.0, 1.0, 1.0, 1.0],
          metallicFactor: 0.05,
          roughnessFactor: 0.45
        },
        doubleSided: true
      }
    ],
    meshes: [
      {
        name: 'ParagliderMesh',
        primitives: [
          {
            attributes: {
              POSITION: 1,
              NORMAL: 2,
              COLOR_0: 3
            },
            indices: 0,
            material: 0,
            mode: 4 // TRIANGLES
          }
        ]
      }
    ],
    accessors: [
      // 0: INDICES
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: indArray.length,
        type: 'SCALAR',
        max: [Math.max(...indArray)],
        min: [0]
      },
      // 1: POSITION
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: posArray.length / 3,
        type: 'VEC3',
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ]
      },
      // 2: NORMAL
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: normArray.length / 3,
        type: 'VEC3',
        max: [1, 1, 1],
        min: [-1, -1, -1]
      },
      // 3: COLOR_0
      {
        bufferView: 3,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: colArray.length / 3,
        type: 'VEC3',
        max: [1, 1, 1],
        min: [0, 0, 0]
      }
    ],
    bufferViews: [
      // 0: Indices
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: indByteLen,
        target: 34963 // ELEMENT_ARRAY_BUFFER
      },
      // 1: Positions
      {
        buffer: 0,
        byteOffset: posOffset,
        byteLength: posByteLen,
        target: 34962 // ARRAY_BUFFER
      },
      // 2: Normals
      {
        buffer: 0,
        byteOffset: normOffset,
        byteLength: normByteLen,
        target: 34962 // ARRAY_BUFFER
      },
      // 3: Colors
      {
        buffer: 0,
        byteOffset: colOffset,
        byteLength: colByteLen,
        target: 34962 // ARRAY_BUFFER
      }
    ],
    buffers: [
      {
        byteLength: totalBinLen
      }
    ]
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonStr, 'utf-8');
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunkLen = jsonBuffer.length + jsonPad;

  const binChunkLen = binBuffer.length; // already 4-byte aligned

  // Total GLB length = 12 (header) + 8 (json chunk header) + jsonChunkLen + 8 (bin chunk header) + binChunkLen
  const totalGlbLen = 12 + 8 + jsonChunkLen + 8 + binChunkLen;
  const glb = Buffer.alloc(totalGlbLen);

  // GLB Header
  glb.writeUInt32LE(0x46546C67, 0); // "glTF"
  glb.writeUInt32LE(2, 4);          // version 2
  glb.writeUInt32LE(totalGlbLen, 8);

  // JSON Chunk Header
  let offset = 12;
  glb.writeUInt32LE(jsonChunkLen, offset);
  glb.writeUInt32LE(0x4E4F534A, offset + 4); // "JSON"
  offset += 8;

  // JSON Data + spaces padding
  jsonBuffer.copy(glb, offset);
  for (let p = 0; p < jsonPad; p++) {
    glb.writeUInt8(0x20, offset + jsonBuffer.length + p); // space (0x20)
  }
  offset += jsonChunkLen;

  // BIN Chunk Header
  glb.writeUInt32LE(binChunkLen, offset);
  glb.writeUInt32LE(0x004E4942, offset + 4); // "BIN\0"
  offset += 8;

  // BIN Data
  binBuffer.copy(glb, offset);

  return glb;
}

// Ensure target directory exists and write model
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const glbBuffer = generateParagliderGlb();
fs.writeFileSync(TARGET_GLB, glbBuffer);
console.log(`[BUILD] Generated ${TARGET_GLB} (${glbBuffer.length} bytes) successfully.`);
