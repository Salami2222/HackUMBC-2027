import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { skeletonCameraFrame } from '../src/measurement/viewport.ts';

test('presets center the floor-anchored body at every viewport aspect', () => {
  for (const height of [1.2, 1.7, 2.1])
    for (const aspect of [0.5, 1, 2.5])
      for (const mode of ['Front', 'Side', '3D']) {
        const { position, target } = skeletonCameraFrame(
          height,
          aspect,
          20,
          mode
        );
        const camera = new PerspectiveCamera(20, aspect, 0.1, 100);
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        assert.ok(target.clone().project(camera).length() < 1.01);
        for (const y of [0, height])
          for (const x of [-height * 0.35, height * 0.35])
            for (const z of [-height * 0.12, height * 0.12]) {
              const point = new Vector3(x, y, z).project(camera);
              assert.ok(
                Math.abs(point.x) < 1 && Math.abs(point.y) < 1,
                `${mode} must fit ${height}m at aspect ${aspect}`
              );
            }
      }
});
test('Front and Side remain level while 3D looks toward the same center', () => {
  for (const mode of ['Front', 'Side', '3D']) {
    const { position, target } = skeletonCameraFrame(1.8, 1.5, 20, mode);
    assert.equal(target.y, 0.9);
    if (mode === 'Front') {
      assert.equal(position.x, 0);
      assert.equal(position.y, target.y);
      assert.ok(position.z < 0);
    }
    if (mode === 'Side') {
      assert.equal(position.z, 0);
      assert.equal(position.y, target.y);
      assert.ok(position.x > 0);
    }
    if (mode === '3D') {
      assert.ok(position.x > 0 && position.z < 0 && position.y > target.y);
    }
  }
});
