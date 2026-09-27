import { TrackerDataT, TrackerStatus } from 'solarxr-protocol';
import { QuaternionToEulerDegrees } from '@/maths/quaternion';

export const ANGLE_WINDOW_MS = 10000;
export const ANGLE_STALE_MS = 3000;
export type ImuAngles = { x: number; y: number; z: number };
export type AngleSample = { time: number; angles: ImuAngles | null };

export function imuAngles(tracker: TrackerDataT): ImuAngles | null {
  if (
    !tracker.info?.isImu ||
    tracker.info.isComputed ||
    tracker.status !== TrackerStatus.OK ||
    tracker.tps === 0
  )
    return null;
  const q = tracker.rotationReferenceAdjusted;
  if (!q || ![q.x, q.y, q.z, q.w].every(Number.isFinite)) return null;
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (length < 1e-6) return null;
  return QuaternionToEulerDegrees({
    x: q.x / length,
    y: q.y / length,
    z: q.z / length,
    w: q.w / length,
  });
}

// Plot actual arrival times. Break at missing data, long gaps, and Euler wraps.
export function anglePath(
  samples: AngleSample[],
  axis: keyof ImuAngles,
  now: number
): string {
  let previous: AngleSample | null = null;
  const parts: string[] = [];
  for (const sample of samples) {
    if (sample.time < now - ANGLE_WINDOW_MS || sample.time > now) continue;
    if (!sample.angles) {
      previous = null;
      continue;
    }
    const value = sample.angles[axis];
    const connected =
      previous?.angles &&
      sample.time - previous.time <= 500 &&
      Math.abs(value - previous.angles[axis]) <= 180;
    const x = 36 + ((sample.time - now + ANGLE_WINDOW_MS) / ANGLE_WINDOW_MS) * 352;
    const y = 16 + ((180 - value) / 360) * 120;
    parts.push(`${connected ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    previous = sample;
  }
  return parts.join(' ');
}
