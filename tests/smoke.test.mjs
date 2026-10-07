import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('GlideMind Foundation Smoke Test', () => {
  it('should run node native test runner with strict assertions', () => {
    assert.strictEqual(1 + 1, 2);
  });

  it('should run on a supported Node.js runtime (>= 20)', () => {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    assert.ok(major >= 20, `Node major version is ${major}, expected >= 20`);
  });
});
