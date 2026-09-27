import { Vector3 } from 'three';
export type SkeletonViewMode = 'Front' | 'Side' | '3D';

// Match the original SlimeVR renderer's floor-anchored, head-centered body.
export function skeletonCameraFrame(
  height: number,
  aspect: number,
  fov: number,
  mode: SkeletonViewMode
) {
  const bodyHeight = Number.isFinite(height) && height > 0 ? height : 1.7;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfFov = (fov * Math.PI) / 360;
  const distance =
    (Math.max(bodyHeight / 2, (bodyHeight * 0.4) / safeAspect) / Math.tan(halfFov)) *
      1.16 +
    bodyHeight * 0.2;
  const target = new Vector3(0, bodyHeight / 2, 0);
  const direction =
    mode === 'Front'
      ? new Vector3(0, 0, -1)
      : mode === 'Side'
        ? new Vector3(1, 0, 0)
        : new Vector3(1, 0.18, -1).normalize();
  return { target, position: target.clone().addScaledVector(direction, distance) };
}
