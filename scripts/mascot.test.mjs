import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BodyPart, BoneT, QuatT, Vec3fT } from 'solarxr-protocol';
import { createMascotRig } from '../src/utils/mascotRig.ts';

const bytes = fs.readFileSync(
  new URL('../public/models/kinetiq-mascot.glb', import.meta.url)
);
const jsonLength = bytes.readUInt32LE(12);
const asset = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
async function loadRig() {
  // Test the real asset's geometry/skin in Node; textures are checked in-browser.
  const json = structuredClone(asset);
  for (const mesh of json.meshes)
    for (const p of mesh.primitives) delete p.material;
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(padded);
  const binaryChunk = bytes.subarray(20 + jsonLength);
  const glb = Buffer.alloc(20 + padded.length + binaryChunk.length);
  bytes.copy(glb, 0, 0, 20);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  padded.copy(glb, 20);
  binaryChunk.copy(glb, 20 + padded.length);
  const { scene } = await new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
    ''
  );
  return { model: scene, rig: createMascotRig(scene) };
}
function pose(thigh = 0, shin = 0, headPitch = 0) {
  return new Map(
    Object.values(BodyPart)
      .filter((p) => typeof p === 'number')
      .map((part) => {
        const b = new BoneT();
        b.bodyPart = part;
        let angle = 0;
        if ([BodyPart.LEFT_UPPER_LEG, BodyPart.RIGHT_UPPER_LEG].includes(part))
          angle = thigh;
        if ([BodyPart.LEFT_LOWER_LEG, BodyPart.RIGHT_LOWER_LEG].includes(part))
          angle = shin;
        if (part === BodyPart.HEAD) angle = headPitch;
        if ([BodyPart.LEFT_FOOT, BodyPart.RIGHT_FOOT].includes(part))
          angle = 90;
        const q = new Quaternion().setFromAxisAngle(
          new Vector3(1, 0, 0),
          (angle * Math.PI) / 180
        );
        b.rotationG = new QuatT(q.x, q.y, q.z, q.w);
        b.headPositionG = new Vec3fT(0, 1, 0);
        b.boneLength = part === BodyPart.HEAD ? 0 : 0.2;
        return [part, b];
      })
  );
}
test('export keeps the real 28-joint skin and embedded textures, with no animation clips', () => {
  assert.equal(asset.animations, undefined);
  assert.equal(asset.skins[0].joints.length, 28);
  assert.ok(asset.meshes[0].primitives[0].attributes.JOINTS_0 != null);
  assert.ok(asset.meshes[0].primitives[0].attributes.WEIGHTS_0 != null);
  assert.ok(asset.images.length > 0);
  for (const view of asset.bufferViews)
    assert.ok(
      (view.byteOffset ?? 0) + view.byteLength <= asset.buffers[0].byteLength
    );
});
test('live retarget bends both knees, lowers the head and changes the actual skinned mesh', async () => {
  const { model, rig } = await loadRig();
  const bones = pose();
  const before = JSON.stringify([...bones]);
  assert.equal(rig.update(bones, 1.7), true);
  const head = model.getObjectByName('Head');
  const height = head.getWorldPosition(new Vector3()).y;
  const knee = model.getObjectByName('LeftLeg');
  const rotation = knee.quaternion.clone();
  const mesh = model.getObjectByName('output_unwrapped');
  mesh.skeleton.update();
  const vertex = mesh
    .getVertexPosition(100, new Vector3())
    .applyMatrix4(mesh.matrixWorld);
  assert.equal(
    JSON.stringify([...bones]),
    before,
    'rendering never changes measurement input'
  );
  assert.equal(rig.update(pose(65, -25), 1.7), true);
  assert.ok(head.getWorldPosition(new Vector3()).y < height - 0.15);
  assert.ok(rotation.angleTo(knee.quaternion) > 0.5);
  mesh.skeleton.update();
  assert.ok(
    vertex.distanceTo(
      mesh.getVertexPosition(100, new Vector3()).applyMatrix4(mesh.matrixWorld)
    ) > 0.01
  );
  assert.equal(rig.update(bones, 1.7), true);
  assert.ok(
    Math.abs(head.getWorldPosition(new Vector3()).y - height) < 1e-5,
    'no animation drift or accumulation'
  );
  rig.dispose();
});
test('headset-free neutral head looks forward, and HMD bone offsets produce the same pose', async () => {
  const { model, rig } = await loadRig();
  const head = model.getObjectByName('Head');
  const up = new Vector3(0, 1, 0);
  rig.update(pose(), 1.7);
  assert.ok(
    up
      .clone()
      .applyQuaternion(head.getWorldQuaternion(new Quaternion()))
      .dot(up) > 0.99999
  );
  const offset = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    -Math.PI / 2
  );
  for (const pitch of [-35, 0, 35]) {
    const headless = pose(0, 0, pitch);
    const q = new Quaternion()
      .setFromAxisAngle(up, 0.6)
      .multiply(
        new Quaternion().setFromAxisAngle(
          new Vector3(1, 0, 0),
          (pitch * Math.PI) / 180
        )
      );
    headless.get(BodyPart.HEAD).rotationG = new QuatT(q.x, q.y, q.z, q.w);
    rig.update(headless, 1.7);
    const expected = head.getWorldQuaternion(new Quaternion()).normalize();
    const positional = pose();
    const hmd = positional.get(BodyPart.HEAD);
    q.multiply(offset);
    hmd.rotationG = new QuatT(q.x, q.y, q.z, q.w);
    hmd.boneLength = 0.1;
    rig.update(positional, 1.7);
    assert.ok(
      expected.angleTo(head.getWorldQuaternion(new Quaternion()).normalize()) <
        1e-6
    );
  }
  rig.dispose();
});

test('head pitch follows the feed and invalid core poses cannot masquerade as live movement', async () => {
  const { model, rig } = await loadRig();
  rig.update(pose(), 1.7);
  const head = model.getObjectByName('Head');
  const before = head.getWorldQuaternion(new Quaternion());
  rig.update(pose(0, 0, 30), 1.7);
  assert.ok(
    Math.abs(
      before.angleTo(head.getWorldQuaternion(new Quaternion())) - Math.PI / 6
    ) < 1e-5
  );
  const invalid = pose();
  invalid.delete(BodyPart.LEFT_LOWER_LEG);
  assert.equal(rig.update(invalid, 1.7), false);
  invalid.set(BodyPart.LEFT_LOWER_LEG, pose().get(BodyPart.LEFT_LOWER_LEG));
  invalid.get(BodyPart.HEAD).rotationG.w = NaN;
  assert.equal(rig.update(invalid, 1.7), false);
  rig.dispose();
});

test('the rendered soles stay grounded and a raised foot is not pinned down', async () => {
  const { model, rig } = await loadRig();
  const mesh = model.getObjectByName('output_unwrapped');
  const point = new Vector3();
  for (const input of [pose(), pose(65, -25)]) {
    rig.update(input, 1.7);
    mesh.skeleton.update();
    let lowest = Infinity;
    for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      lowest = Math.min(lowest, point.y);
    }
    assert.ok(lowest >= -0.015 && lowest <= 0.001, `sole grounding: ${lowest}`);
  }
  const lifted = pose();
  for (const part of [BodyPart.RIGHT_UPPER_LEG, BodyPart.RIGHT_LOWER_LEG])
    lifted.set(part, pose(65, -25).get(part));
  rig.update(lifted, 1.7);
  const right = model
    .getObjectByName('RightFoot')
    .getWorldPosition(new Vector3());
  const left = model
    .getObjectByName('LeftFoot')
    .getWorldPosition(new Vector3());
  assert.ok(right.y > left.y + 0.15);
  rig.dispose();
});
