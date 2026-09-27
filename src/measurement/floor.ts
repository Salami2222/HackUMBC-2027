import { BodyPart, BoneT } from 'solarxr-protocol';
import { Quaternion, Vector3 } from 'three';

// Translate the complete rendered skeleton, never individual joints. A raised
// foot stays raised; the lowest valid foot contact defines the preview floor.
export function floorOffset(bones: Map<BodyPart, BoneT>): number | null {
  const heights: number[] = [];
  for (const [foot, shin] of [
    [BodyPart.LEFT_FOOT, BodyPart.LEFT_LOWER_LEG],
    [BodyPart.RIGHT_FOOT, BodyPart.RIGHT_LOWER_LEG],
  ]) {
    const bone = bones.get(foot) ?? bones.get(shin);
    const p = bone?.headPositionG;
    const q = bone?.rotationG;
    if (
      !bone ||
      !p ||
      !q ||
      ![p.x, p.y, p.z, q.x, q.y, q.z, q.w, bone.boneLength].every(Number.isFinite) ||
      bone.boneLength <= 0
    )
      continue;
    const rotation = new Quaternion(q.x, q.y, q.z, q.w);
    if (rotation.lengthSq() < 0.25 || rotation.lengthSq() > 2.25) continue;
    const tail = new Vector3(0, -bone.boneLength, 0)
      .applyQuaternion(rotation.normalize())
      .add(new Vector3(p.x, p.y, p.z));
    if (bone.bodyPart === foot) heights.push(p.y, tail.y);
    else heights.push(tail.y);
  }
  return heights.length ? -Math.min(...heights) : null;
}

export function standingHeight(bones: Map<BodyPart, BoneT>): number | null {
  const parts = [
    BodyPart.NECK,
    BodyPart.UPPER_CHEST,
    BodyPart.CHEST,
    BodyPart.WAIST,
    BodyPart.HIP,
    BodyPart.LEFT_UPPER_LEG,
    BodyPart.LEFT_LOWER_LEG,
  ];
  const lengths = parts.map((part) => bones.get(part)?.boneLength);
  if (
    lengths.some((length) => length == null || !Number.isFinite(length) || length < 0)
  )
    return null;
  const height = lengths.reduce<number>((sum, length) => sum + length!, 0) / 0.936;
  return height > 0 ? height : null;
}
