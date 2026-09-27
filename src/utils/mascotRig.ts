import {
  Bone,
  Box3,
  Group,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Texture,
  Vector3,
} from 'three';
import { BodyPart, BoneT } from 'solarxr-protocol';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const FRONT = new Quaternion().setFromAxisAngle(UP, Math.PI);
const HEAD_OFFSET = new Quaternion().setFromUnitVectors(DOWN, new Vector3(0, 0, 1));
const FOOT_OFFSET = new Quaternion().setFromUnitVectors(DOWN, new Vector3(0, 0, -1));

// This mapping is specific to the supplied Meshy rig. Spine02 is the lowest
// spine joint in this asset, despite its name. SolarXR rotations are GLOBAL.
const PARTS: Record<string, BodyPart> = {
  Hips: BodyPart.HIP,
  Spine02: BodyPart.WAIST,
  Spine01: BodyPart.CHEST,
  Spine: BodyPart.UPPER_CHEST,
  neck: BodyPart.NECK,
  Head: BodyPart.HEAD,
  LeftArm: BodyPart.LEFT_UPPER_ARM,
  LeftForeArm: BodyPart.LEFT_LOWER_ARM,
  RightArm: BodyPart.RIGHT_UPPER_ARM,
  RightForeArm: BodyPart.RIGHT_LOWER_ARM,
  LeftUpLeg: BodyPart.LEFT_UPPER_LEG,
  LeftLeg: BodyPart.LEFT_LOWER_LEG,
  LeftFoot: BodyPart.LEFT_FOOT,
  RightUpLeg: BodyPart.RIGHT_UPPER_LEG,
  RightLeg: BodyPart.RIGHT_LOWER_LEG,
  RightFoot: BodyPart.RIGHT_FOOT,
};
const UPRIGHT = new Set(['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head']);
const REQUIRED = [
  BodyPart.HIP,
  BodyPart.HEAD,
  BodyPart.LEFT_UPPER_LEG,
  BodyPart.LEFT_LOWER_LEG,
  BodyPart.RIGHT_UPPER_LEG,
  BodyPart.RIGHT_LOWER_LEG,
];

function rotation(bone?: BoneT) {
  const q = bone?.rotationG;
  if (!q || ![q.x, q.y, q.z, q.w].every(Number.isFinite)) return null;
  const result = new Quaternion(q.x, q.y, q.z, q.w);
  return result.lengthSq() >= 0.25 && result.lengthSq() <= 2.25
    ? result.normalize()
    : null;
}

export function disposeMascot(model: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  model.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  materials.forEach((material) => {
    for (const value of Object.values(material))
      if (value instanceof Texture) textures.add(value);
    material.dispose();
  });
  textures.forEach((texture) => {
    texture.dispose();
    const image = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
      image.close();
  });
}

export function createMascotRig(model: Object3D) {
  const meshes: SkinnedMesh[] = [];
  model.traverse((node) => {
    if (node instanceof SkinnedMesh) {
      node.skeleton.pose(); // Restore the skin's bind pose, never a clip's first frame.
      node.frustumCulled = false; // Bind-pose bounds don't describe a live squat.
      meshes.push(node);
    }
  });
  if (!meshes.length) throw new Error('Mascot has no skinned mesh.');
  model.updateMatrixWorld(true);
  const joints = new Map<string, Bone>();
  model.traverse((node) => {
    if (node instanceof Bone) joints.set(node.name, node);
  });
  for (const name of Object.keys(PARTS))
    if (!joints.has(name)) throw new Error(`Missing mascot joint: ${name}`);

  const bounds = new Box3().setFromObject(model);
  const modelHeight = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(modelHeight) || modelHeight <= 0)
    throw new Error('Invalid mascot bounds.');

  // Sample the actual skinned soles, rather than grounding ankle joints. The
  // small x/z grid follows both heel and toe contact without scanning the full
  // mesh on every packet. One raised foot can remain raised.
  const contacts: { mesh: SkinnedMesh; index: number }[] = [];
  const point = new Vector3();
  for (const mesh of meshes) {
    const cells = new Map<string, { index: number; y: number }>();
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    mesh.skeleton.update();
    for (let index = 0; index < positions.count; index++) {
      let footWeight = 0;
      for (let component = 0; component < 4; component++) {
        const name =
          mesh.skeleton.bones[indices.getComponent(index, component)]?.name ?? '';
        if (/Foot|Toe/.test(name)) footWeight += weights.getComponent(index, component);
      }
      if (footWeight < 0.5) continue;
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      if (point.y > bounds.min.y + modelHeight * 0.035) continue;
      const key = `${Math.floor(((point.x - bounds.min.x) / modelHeight) * 16)}:${Math.floor(((point.z - bounds.min.z) / modelHeight) * 16)}`;
      if (!cells.has(key) || point.y < cells.get(key)!.y)
        cells.set(key, { index, y: point.y });
    }
    for (const { index } of cells.values()) contacts.push({ mesh, index });
  }
  if (!contacts.length) throw new Error('Mascot has no usable foot skin weights.');

  const root = new Group();
  root.name = 'Live school mascot';
  const body = new Group();
  root.add(body);
  body.add(model);
  const corrections = new Map<Bone, Quaternion>();
  for (const joint of joints.values()) {
    const bind = joint.getWorldQuaternion(new Quaternion());
    if (PARTS[joint.name] == null) continue;
    const neutral = bind.clone();
    if (!joint.name.endsWith('Foot')) {
      const direction = UP.clone().applyQuaternion(bind);
      neutral.premultiply(
        new Quaternion().setFromUnitVectors(
          direction,
          UPRIGHT.has(joint.name) ? UP : DOWN
        )
      );
    }
    // Meshy faces +Z; the existing SlimeVR front view faces -Z.
    neutral.premultiply(FRONT);
    if (joint.name.endsWith('Foot')) neutral.premultiply(FOOT_OFFSET.clone().invert());
    corrections.set(joint, neutral);
  }
  const hips = joints.get('Hips')!;
  const hipRestY = hips.position.y;
  const localRest = new Map<Bone, Quaternion>(
    [...joints.values()].map((bone) => [bone, bone.quaternion.clone()])
  );
  const parentRotation = new Quaternion();
  const worldRotations = new Map<Object3D, Quaternion>();
  const worldPoint = new Vector3();

  return {
    root,
    update(bones: Map<BodyPart, BoneT>, height: number) {
      if (REQUIRED.some((part) => !rotation(bones.get(part)))) return false;
      const head = bones.get(BodyPart.HEAD)?.headPositionG;
      const hip = bones.get(BodyPart.HIP)?.headPositionG;
      if (!head || !hip || ![head.x, head.z, hip.x, hip.z].every(Number.isFinite))
        return false;
      const scale = Number.isFinite(height) && height > 0 ? height / modelHeight : 1;
      root.scale.setScalar(scale);
      body.position.y = 0;
      // Match the head-centered SlimeVR viewport. Vertical displacement comes
      // from the mascot's own leg chain and the same lowest-foot floor rule.
      hips.position.set((hip.x - head.x) / scale, hipRestY, (hip.z - head.z) / scale);
      worldRotations.clear();
      model.traverse((node) => {
        parentRotation.copy(worldRotations.get(node.parent!) ?? new Quaternion());
        if (node instanceof Bone) {
          const source = rotation(bones.get(PARTS[node.name]));
          const correction = corrections.get(node);
          if (source && correction) {
            // SlimeVR zeroes the head offset without a positional HMD. In that
            // mode rotationG is already the head orientation. Only a nonzero
            // head segment includes the -Y -> +Z bone-axis offset to undo.
            if (node.name === 'Head' && (bones.get(BodyPart.HEAD)?.boneLength ?? 0) > 0)
              source.multiply(HEAD_OFFSET.clone().invert());
            const target = source.multiply(correction);
            node.quaternion.copy(parentRotation.clone().invert().multiply(target));
          } else {
            node.quaternion.copy(localRest.get(node)!);
          }
        }
        worldRotations.set(node, parentRotation.clone().multiply(node.quaternion));
      });
      root.updateMatrixWorld(true);
      meshes.forEach((mesh) => mesh.skeleton.update());
      let lowest = Infinity;
      for (const { mesh, index } of contacts) {
        mesh.getVertexPosition(index, worldPoint).applyMatrix4(mesh.matrixWorld);
        lowest = Math.min(lowest, worldPoint.y);
      }
      body.position.y = -lowest / scale;
      root.updateMatrixWorld(true);
      return true;
    },
    dispose() {
      root.removeFromParent();
      disposeMascot(model);
    },
  };
}

export type MascotRig = ReturnType<typeof createMascotRig>;
