import test from 'node:test';
import assert from 'node:assert/strict';
import { BodyPart, BoneT, QuatT, Vec3fT } from 'solarxr-protocol';
import { floorOffset, standingHeight } from '../src/measurement/floor.ts';

function bone(part, y, length = 0.2) {
  const b = new BoneT();
  b.bodyPart = part;
  b.headPositionG = new Vec3fT(0, y, 0);
  b.rotationG = new QuatT(0, 0, 0, 1);
  b.boneLength = length;
  return b;
}
test('ground offset follows the current feet through a crouch, not standing height', () => {
  for (const y of [-1.6, -0.8, 0.7]) {
    const b = bone(BodyPart.LEFT_FOOT, y);
    const bones = new Map([[b.bodyPart, b]]);
    assert.ok(Math.abs(y - b.boneLength + floorOffset(bones)) < 1e-8);
    assert.equal(b.headPositionG.y, y, 'source pose is untouched');
  }
});
test('one raised foot stays raised while the supporting foot remains on the floor', () => {
  const low = bone(BodyPart.LEFT_FOOT, -1);
  const high = bone(BodyPart.RIGHT_FOOT, -0.5);
  const offset = floorOffset(
    new Map([
      [low.bodyPart, low],
      [high.bodyPart, high],
    ])
  );
  assert.ok(Math.abs(low.headPositionG.y - 0.2 + offset) < 1e-8);
  assert.ok(Math.abs(high.headPositionG.y - 0.2 + offset - 0.5) < 1e-8);
});
test('ankle endpoints are used when feet are missing; corrupt data has no floor estimate', () => {
  const shin = bone(BodyPart.LEFT_LOWER_LEG, -0.5, 0.45);
  assert.ok(
    Math.abs(floorOffset(new Map([[shin.bodyPart, shin]])) - 0.95) < 1e-8
  );
  shin.rotationG.w = NaN;
  assert.equal(floorOffset(new Map([[shin.bodyPart, shin]])), null);
  assert.equal(floorOffset(new Map()), null);
});
test('camera framing uses segment lengths and stays fixed when the head crouches', () => {
  const parts = [
    BodyPart.NECK,
    BodyPart.UPPER_CHEST,
    BodyPart.CHEST,
    BodyPart.WAIST,
    BodyPart.HIP,
    BodyPart.LEFT_UPPER_LEG,
    BodyPart.LEFT_LOWER_LEG,
  ];
  const bones = new Map(parts.map((part) => [part, bone(part, 0)]));
  const head = bone(BodyPart.HEAD, 1.7);
  bones.set(BodyPart.HEAD, head);
  const before = standingHeight(bones);
  head.headPositionG.y = 0.9;
  assert.equal(standingHeight(bones), before);
  assert.equal(standingHeight(new Map()), null);
});
