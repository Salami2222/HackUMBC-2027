import { BodyPart, BoneT, QuatT, Vec3fT } from 'solarxr-protocol';
import { Quaternion, Vector3 } from 'three';
import { BoneKind } from '@/utils/skeletonHelper';
import { ExerciseFrame } from './types';

const DOWN = new Vector3(0, -1, 0);
const ALL_PARTS = Object.values(BodyPart).filter(
  (part): part is BodyPart => typeof part === 'number' && part !== BodyPart.NONE
);

export function mockSkeleton(frame: ExerciseFrame): BoneT[] {
  const motion = frame.motion;
  const squat = frame.exercise === 'squat';
  const drop = motion * (squat ? 0.35 : 0.2);
  const lean = (frame.torsoLean * Math.PI) / 180;
  const spine = (distance: number) => Math.sin(lean) * distance;
  const points = new Map<BodyPart, Vector3>();
  const put = (part: BodyPart, x: number, y: number, z: number) =>
    points.set(part, new Vector3(x, y, z));

  put(BodyPart.HIP, 0, 1 - drop, 0);
  put(BodyPart.WAIST, 0, 1.12 - drop, spine(0.12));
  put(BodyPart.CHEST, 0, 1.35 - drop, spine(0.35));
  put(BodyPart.UPPER_CHEST, 0, 1.47 - drop, spine(0.47));
  put(BodyPart.NECK, 0, 1.58 - drop, spine(0.58));
  put(BodyPart.HEAD, 0, 1.77 - drop, spine(0.77));

  for (const side of [-1, 1] as const) {
    const left = side === -1;
    const hip = left ? BodyPart.LEFT_HIP : BodyPart.RIGHT_HIP;
    const thigh = left ? BodyPart.LEFT_UPPER_LEG : BodyPart.RIGHT_UPPER_LEG;
    const shin = left ? BodyPart.LEFT_LOWER_LEG : BodyPart.RIGHT_LOWER_LEG;
    const foot = left ? BodyPart.LEFT_FOOT : BodyPart.RIGHT_FOOT;
    const shoulder = left ? BodyPart.LEFT_SHOULDER : BodyPart.RIGHT_SHOULDER;
    const upperArm = left ? BodyPart.LEFT_UPPER_ARM : BodyPart.RIGHT_UPPER_ARM;
    const lowerArm = left ? BodyPart.LEFT_LOWER_ARM : BodyPart.RIGHT_LOWER_ARM;
    const hand = left ? BodyPart.LEFT_HAND : BodyPart.RIGHT_HAND;
    const asymmetry = left
      ? 0
      : Math.max(0, frame.rightKneeAngle - frame.leftKneeAngle) * 0.003;

    put(hip, side * 0.12, 0.96 - drop, 0);
    put(thigh, side * 0.14, 0.93 - drop, 0);
    put(
      shin,
      side * (0.14 + asymmetry),
      0.52 - drop * 0.2,
      motion * (squat ? 0.26 : 0.12)
    );
    put(foot, side * 0.14, 0.09, 0.02);
    put(shoulder, side * 0.22, 1.55 - drop, spine(0.55));
    put(upperArm, side * 0.26, 1.43 - drop, spine(0.55) + 0.02);
    put(lowerArm, side * 0.31, 1.13 - drop, spine(0.42) + (squat ? 0.04 : 0.16));
    put(hand, side * 0.33, 0.89 - drop, spine(0.36) + (squat ? 0.04 : 0.22));
  }

  // The existing SlimeVR helper walks every finger bone. Small neutral finger
  // positions keep its full hierarchy intact while the demo focuses on legs.
  for (const part of ALL_PARTS) {
    if (points.has(part)) continue;
    const parentPart = BoneKind.parent(part);
    const parent = parentPart === null ? null : points.get(parentPart);
    if (!parent) continue;
    const side = BodyPart[part].startsWith('LEFT') ? -1 : 1;
    const spread = ((part % 5) - 2) * 0.012;
    points.set(part, parent.clone().add(new Vector3(side * spread, -0.035, 0.012)));
  }

  return ALL_PARTS.map((part) => {
    const point = points.get(part)!;
    const child = BoneKind.children(part)
      .map((childPart) => points.get(childPart))
      .find((value): value is Vector3 => !!value);
    const direction = child
      ? child.clone().sub(point)
      : DOWN.clone().multiplyScalar(0.04);
    const length = direction.length();
    const rotation = new Quaternion().setFromUnitVectors(DOWN, direction.normalize());
    return new BoneT(
      part,
      new QuatT(rotation.x, rotation.y, rotation.z, rotation.w),
      length,
      new Vec3fT(point.x, point.y, point.z)
    );
  });
}
