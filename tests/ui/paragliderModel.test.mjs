import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createParagliderMesh,
  loadParagliderModel,
  updateAvatarPose
} from '../../ui/3d/models/paragliderModel.js';

/**
 * Minimal Three.js Mock Implementation for Node.js Testing
 */
function createMockThree() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }

  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
      this.x = x;
      this.y = y;
      this.z = z;
      this.order = order;
    }
    set(x, y, z, order = 'XYZ') {
      this.x = x;
      this.y = y;
      this.z = z;
      this.order = order;
      return this;
    }
  }

  class Object3D {
    constructor() {
      this.name = '';
      this.position = new Vector3();
      this.rotation = new Euler();
      this.scale = {
        x: 1, y: 1, z: 1,
        setScalar(s) { this.x = s; this.y = s; this.z = s; }
      };
      this.children = [];
    }
    add(obj) {
      this.children.push(obj);
    }
  }

  class Group extends Object3D {
    constructor() {
      super();
      this.type = 'Group';
    }
  }

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.castShadow = false;
      this.receiveShadow = false;
    }
  }

  class LineSegments extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  class BufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
    }
    setIndex(idx) {
      this.index = idx;
    }
    rotateX() {}
  }

  class CylinderGeometry extends BufferGeometry {}
  class SphereGeometry extends BufferGeometry {}

  class Material {
    constructor(params = {}) {
      Object.assign(this, params);
    }
    dispose() {}
  }

  class MeshStandardMaterial extends Material {}
  class LineBasicMaterial extends Material {}

  return {
    Group,
    Mesh,
    LineSegments,
    BufferGeometry,
    CylinderGeometry,
    SphereGeometry,
    Float32BufferAttribute: BufferAttribute,
    MeshStandardMaterial,
    LineBasicMaterial,
    DoubleSide: 2
  };
}

describe('3D Paraglider Model - Procedural Geometry & Pose Kinematics', () => {

  it('should throw if THREE is missing or invalid', () => {
    assert.throws(() => createParagliderMesh(null), /THREE must be a valid Three.js instance/);
  });

  it('should generate a procedural paraglider mesh group with canopy, pod, and suspension lines', () => {
    const THREE = createMockThree();
    const glider = createParagliderMesh(THREE, { span: 10.5, chord: 2.4 });

    assert.equal(glider.name, 'GlideMindParagliderAvatar');
    assert.equal(glider.children.length, 4); // Canopy, PilotPod, PilotHead, SuspensionLines

    const names = glider.children.map(c => c.name);
    assert.ok(names.includes('GliderCanopy'));
    assert.ok(names.includes('PilotPod'));
    assert.ok(names.includes('PilotHead'));
    assert.ok(names.includes('SuspensionLines'));

    // Check canopy geometry attributes
    const canopy = glider.children.find(c => c.name === 'GliderCanopy');
    assert.ok(canopy.geometry.attributes.position);
    assert.ok(canopy.geometry.attributes.normal);
    assert.ok(canopy.geometry.attributes.uv);
    assert.ok(canopy.geometry.index.length > 0);
  });

  it('should update avatar pose according to aeronautical standard conventions', () => {
    const THREE = createMockThree();
    const glider = createParagliderMesh(THREE);

    // Update with East heading (90 deg), 10 deg pitch up, 15 deg right bank
    updateAvatarPose(glider, {
      x: 150.5,
      y: 1200.0,
      z: -340.2,
      headingDeg: 90,
      pitchDeg: 10,
      bankDeg: 15,
      scale: 2.5
    });

    assert.equal(glider.position.x, 150.5);
    assert.equal(glider.position.y, 1200.0);
    assert.equal(glider.position.z, -340.2);

    // Euler rotation check (order 'YXZ'):
    // rotY = -(90 * PI / 180) = -PI / 2
    assert.ok(Math.abs(glider.rotation.y - (-Math.PI / 2)) < 1e-4);
    // rotX = +(10 * PI / 180)
    assert.ok(Math.abs(glider.rotation.x - (10 * Math.PI / 180)) < 1e-4);
    // rotZ = -(15 * PI / 180)
    assert.ok(Math.abs(glider.rotation.z - (-15 * Math.PI / 180)) < 1e-4);
    assert.equal(glider.rotation.order, 'YXZ');

    // Scale check
    assert.equal(glider.scale.x, 2.5);
    assert.equal(glider.scale.y, 2.5);
    assert.equal(glider.scale.z, 2.5);
  });

  it('should fallback gracefully to procedural mesh in loadParagliderModel when GLTFLoader is absent', async () => {
    const THREE = createMockThree();
    const glider = await loadParagliderModel(THREE, 'data/models/paraglider.glb');

    assert.ok(glider);
    assert.equal(glider.name, 'GlideMindParagliderAvatar');
    assert.equal(glider.children.length, 4);
  });

  it('should load GLB model via GLTFLoader mock when available', async () => {
    const THREE = createMockThree();
    
    // Simulate GLTFLoader on THREE
    THREE.GLTFLoader = class {
      load(url, onLoad) {
        const mockScene = new THREE.Group();
        mockScene.name = 'GLTFGliderScene';
        onLoad({ scene: mockScene });
      }
    };

    // Temporarily mount mock window to trigger GLTFLoader branch
    globalThis.window = {};

    try {
      const glider = await loadParagliderModel(THREE, 'data/models/paraglider.glb');
      assert.ok(glider);
      assert.equal(glider.name, 'GlideMindParagliderAvatar');
      assert.equal(glider.children[0].name, 'GLTFGliderScene');
    } finally {
      delete globalThis.window;
    }
  });

  it('should include bi-color racing livery vertex colors on GliderCanopy and apply articulated pendulum swing and POV hiding', () => {
    const THREE = createMockThree();
    const glider = createParagliderMesh(THREE);

    const canopy = glider.children.find(c => c.name === 'GliderCanopy');
    const pod = glider.children.find(c => c.name === 'PilotPod');
    const head = glider.children.find(c => c.name === 'PilotHead');

    assert.ok(canopy.geometry.attributes.color, 'GliderCanopy must include vertex color attribute for bi-color racing livery');
    assert.equal(canopy.material.vertexColors, true);

    // Apply 30 deg right bank in chase mode: canopy shifts inward (-X), pod shifts outward (+X)
    updateAvatarPose(glider, {
      x: 0,
      y: 500,
      z: 0,
      headingDeg: 0,
      pitchDeg: 0,
      bankDeg: 30,
      cameraMode: 'chase',
      scale: 1.0
    });

    assert.ok(canopy.position.x < -0.1, `Expected canopy inward shift (< -0.1), got ${canopy.position.x}`);
    assert.ok(pod.position.x > 0.2, `Expected pilot pod outward centrifugal swing (> 0.2), got ${pod.position.x}`);
    assert.equal(pod.visible, true);
    assert.equal(head.visible, true);

    // Switch to cockpit POV mode: PilotPod and PilotHead must be hidden to prevent camera clipping
    updateAvatarPose(glider, {
      x: 0,
      y: 500,
      z: 0,
      headingDeg: 0,
      pitchDeg: 0,
      bankDeg: 15,
      cameraMode: 'cockpit',
      scale: 1.0
    });

    assert.equal(pod.visible, false, 'PilotPod must be hidden in cockpit POV mode');
    assert.equal(head.visible, false, 'PilotHead must be hidden in cockpit POV mode');
    assert.equal(canopy.visible, true, 'GliderCanopy must remain visible above the pilot in cockpit POV mode');
  });
});

