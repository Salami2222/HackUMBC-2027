import { BodyPart, ResetType, TrackerDataT, TrackerStatus } from 'solarxr-protocol';
import { Euler, Quaternion, Vector3 } from 'three';

export const CORE_ROLES = [
  { part: BodyPart.HEAD, label: 'Head' },
  { part: BodyPart.CHEST, label: 'Chest' },
  { part: BodyPart.LEFT_UPPER_LEG, label: 'Left knee / thigh' },
  { part: BodyPart.RIGHT_UPPER_LEG, label: 'Right knee / thigh' },
  { part: BodyPart.LEFT_LOWER_LEG, label: 'Left ankle / shin' },
  { part: BodyPart.RIGHT_LOWER_LEG, label: 'Right ankle / shin' },
  { part: BodyPart.LEFT_FOOT, label: 'Left foot' },
  { part: BodyPart.RIGHT_FOOT, label: 'Right foot' },
] as const;
export const FRESH_MS = 1000;
export const ORIENTATION_IDLE_MS = 60000;
const HOLD_MS = 3000;
const MAX_CAPTURE_GAP_MS = 350;
const STILL_DEGREES = 3;
const DEGREES = 180 / Math.PI;
type Rotations = Map<BodyPart, Quaternion>;

export interface RoleReading {
  part: BodyPart;
  label: string;
  reason: string | null;
  rotation: Quaternion | null;
}
export interface Measurement {
  id: string;
  label: string;
  value: number | null;
  reason: string | null;
}
export interface Reference {
  signature: string;
  rotations: Rotations;
  capturedAt: number;
}
export interface MeasurementState {
  sampleTime: number;
  referenceCapturedAt: number | null;
  roles: RoleReading[];
  coreReady: boolean;
  migrationRequired: boolean;
  oriented: boolean;
  referenceReady: boolean;
  capturing: boolean;
  progress: number;
  message: string;
  measurements: Measurement[];
}

export function normalizedRotation(tracker: TrackerDataT): Quaternion | null {
  const q = tracker.rotationReferenceAdjusted;
  if (!q || ![q.x, q.y, q.z, q.w].every(Number.isFinite)) return null;
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  // Reject corrupted rotations instead of turning arbitrary data into a pose.
  if (length < 0.5 || length > 1.5) return null;
  return new Quaternion(q.x, q.y, q.z, q.w).normalize();
}

export function isLegacyHand(part: BodyPart | undefined) {
  return [
    BodyPart.LEFT_HAND,
    BodyPart.RIGHT_HAND,
    BodyPart.LEFT_LOWER_ARM,
    BodyPart.RIGHT_LOWER_ARM,
  ].includes(part!);
}
export function assignmentSignature(trackers: TrackerDataT[]): string {
  return JSON.stringify(
    trackers
      .filter(
        (t) =>
          t.info?.isImu &&
          !t.info.isComputed &&
          (CORE_ROLES.some(({ part }) => part === t.info?.bodyPart) ||
            isLegacyHand(t.info?.bodyPart))
      )
      .map((t) => [
        t.info?.bodyPart,
        t.trackerId?.deviceId?.id,
        t.trackerId?.trackerNum,
        t.info?.mountingOrientation,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  );
}

export function inspectRoles(
  trackers: TrackerDataT[],
  receivedAt: number,
  now: number,
  connected: boolean
): RoleReading[] {
  return CORE_ROLES.map(({ part, label }) => {
    const matches = trackers.filter(
      (t) => t.info?.isImu && !t.info.isComputed && t.info.bodyPart === part
    );
    const tracker = matches[0];
    const rotation = tracker ? normalizedRotation(tracker) : null;
    const reason = !connected
      ? 'Service disconnected'
      : !matches.length
        ? 'Not assigned'
        : matches.length > 1
          ? 'Duplicate assignment'
          : !receivedAt || now - receivedAt > FRESH_MS
            ? 'Stale data'
            : tracker.status !== TrackerStatus.OK
              ? 'Offline or not ready'
              : !tracker.trackerId?.deviceId || tracker.trackerId.trackerNum == null
                ? 'Missing node identity'
                : tracker.tps == null
                  ? 'Packet rate unavailable'
                  : tracker.tps <= 0
                    ? 'No sensor packets'
                    : !rotation
                      ? 'Invalid or missing calibrated rotation'
                      : null;
    return { part, label, reason, rotation: reason ? null : rotation };
  });
}

// Relative rotations remove shared world heading. Neutral-relative rotations
// express changes from the captured stance, not clinical anatomical angles.
export function relativeChange(
  parent: Quaternion,
  child: Quaternion,
  neutralParent: Quaternion,
  neutralChild: Quaternion
): Quaternion {
  const neutral = neutralParent.clone().invert().multiply(neutralChild);
  return parent.clone().invert().multiply(child).multiply(neutral.invert()).normalize();
}

const definitions = [
  {
    id: 'leftKnee',
    label: 'Left knee bend',
    parent: BodyPart.LEFT_UPPER_LEG,
    child: BodyPart.LEFT_LOWER_LEG,
    kind: 'bend',
  },
  {
    id: 'rightKnee',
    label: 'Right knee bend',
    parent: BodyPart.RIGHT_UPPER_LEG,
    child: BodyPart.RIGHT_LOWER_LEG,
    kind: 'bend',
  },
  {
    id: 'headPitch',
    label: 'Head / chest pitch',
    parent: BodyPart.CHEST,
    child: BodyPart.HEAD,
    kind: 'pitch',
  },
  {
    id: 'headTurn',
    label: 'Head / chest turn',
    parent: BodyPart.CHEST,
    child: BodyPart.HEAD,
    kind: 'yaw',
  },
] as const;

export function measure(
  roles: RoleReading[],
  reference: Reference | null
): Measurement[] {
  const result: Measurement[] = definitions.map(
    ({ id, label, parent, child, kind }) => {
      const a = roles.find((role) => role.part === parent)!;
      const b = roles.find((role) => role.part === child)!;
      const reason = a.reason
        ? `${a.label}: ${a.reason}`
        : b.reason
          ? `${b.label}: ${b.reason}`
          : !reference
            ? 'Capture an upright reference'
            : null;
      if (reason || !reference || !a.rotation || !b.rotation)
        return { id, label, value: null, reason };
      const neutralA = reference.rotations.get(parent);
      const neutralB = reference.rotations.get(child);
      if (!neutralA || !neutralB)
        return { id, label, value: null, reason: 'Reference incomplete' };
      const delta = relativeChange(a.rotation, b.rotation, neutralA, neutralB);
      const up = new Vector3(0, 1, 0).applyQuaternion(delta);
      if (kind === 'bend')
        return {
          id,
          label,
          value: Math.acos(Math.max(-1, Math.min(1, up.y))) * DEGREES,
          reason: null,
        };
      // YXZ separates heading from sagittal pitch around the neutral segment axes.
      const euler = new Euler().setFromQuaternion(delta, 'YXZ');
      if (Math.abs(Math.cos(euler.x)) < 0.1)
        return { id, label, value: null, reason: 'Orientation near angle singularity' };
      return {
        id,
        label,
        value: (kind === 'yaw' ? euler.y : euler.x) * DEGREES,
        reason: null,
      };
    }
  );
  const left = result[0],
    right = result[1];
  const head = roles.find((role) => role.part === BodyPart.HEAD)!;
  const neutralHead = reference?.rotations.get(BodyPart.HEAD);
  const inclination = (q: Quaternion) => {
    const forward = new Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(forward.y, Math.hypot(forward.x, forward.z)) * DEGREES;
  };
  result.push({
    id: 'headInclination',
    label: 'Head up / down',
    value:
      head.rotation && neutralHead && !head.reason
        ? inclination(head.rotation) - inclination(neutralHead)
        : null,
    reason: head.reason
      ? `Head: ${head.reason}`
      : !neutralHead
        ? 'Capture an upright reference'
        : null,
  });
  result.push({
    id: 'kneeDifference',
    label: 'Knee bend difference',
    value:
      left.value !== null && right.value !== null
        ? Math.abs(left.value - right.value)
        : null,
    reason: left.reason ?? right.reason,
  });
  // Neutral-relative segment orientation. These are movement measures, not clinical joint angles.
  for (const [part, prefix] of [
    [BodyPart.CHEST, 'chest'],
    [BodyPart.HEAD, 'head'],
    [BodyPart.LEFT_FOOT, 'leftFoot'],
    [BodyPart.RIGHT_FOOT, 'rightFoot'],
  ] as const) {
    const role = roles.find((r) => r.part === part);
    const neutral = reference?.rotations.get(part);
    const delta =
      role?.rotation && neutral
        ? neutral.clone().invert().multiply(role.rotation)
        : null;
    const euler = delta ? new Euler().setFromQuaternion(delta, 'YXZ') : null;
    for (const axis of ['Pitch', 'Roll'] as const) {
      const reason =
        role?.reason ??
        (!neutral
          ? 'Capture an upright reference'
          : !euler || Math.abs(Math.cos(euler.x)) < 0.1
            ? 'Orientation near angle singularity'
            : null);
      result.push({
        id: `${prefix}${axis === 'Pitch' ? 'Tilt' : 'Roll'}`,
        label: `${role?.label ?? prefix} ${axis.toLowerCase()}`,
        value:
          !reason && euler ? (axis === 'Pitch' ? euler.x : euler.z) * DEGREES : null,
        reason,
      });
    }
  }
  for (const [shin, foot, id] of [
    [BodyPart.LEFT_LOWER_LEG, BodyPart.LEFT_FOOT, 'leftAnkle'],
    [BodyPart.RIGHT_LOWER_LEG, BodyPart.RIGHT_FOOT, 'rightAnkle'],
  ] as const) {
    const a = roles.find((r) => r.part === shin),
      b = roles.find((r) => r.part === foot);
    const na = reference?.rotations.get(shin),
      nb = reference?.rotations.get(foot);
    const delta =
      a?.rotation && b?.rotation && na && nb
        ? relativeChange(a.rotation, b.rotation, na, nb)
        : null;
    const euler = delta ? new Euler().setFromQuaternion(delta, 'YXZ') : null;
    const reason =
      a?.reason ??
      b?.reason ??
      (!euler
        ? 'Capture an upright reference'
        : Math.abs(Math.cos(euler.x)) < 0.1
          ? 'Orientation near angle singularity'
          : null);
    result.push({
      id,
      label: `${id === 'leftAnkle' ? 'Left' : 'Right'} ankle flexion`,
      value: !reason && euler ? euler.x * DEGREES : null,
      reason,
    });
  }
  return result;
}

export class MeasurementEngine {
  private trackers: TrackerDataT[] = [];
  private receivedAt = 0;
  private connected = false;
  private signature = '';
  private lastReadyAt = 0;
  private orientedSignature: string | null = null;
  private reference: Reference | null = null;
  private capture: {
    startedAt: number;
    samples: { time: number; rotations: Rotations }[];
  } | null = null;
  private message =
    'Assign the eight measurement nodes, including both feet, then run Auto-orient trackers.';

  setConnected(connected: boolean) {
    if (this.connected === connected) return;
    this.connected = connected;
    this.receivedAt = 0;
    this.invalidateReference(
      'Connection changed. Capture a new upright reference when tracking returns.'
    );
  }

  invalidate(
    message = 'Calibration changed. Run auto-orientation and capture a new reference.'
  ) {
    this.orientedSignature = null;
    this.reference = null;
    this.capture = null;
    this.message = message;
  }

  invalidateReference(
    message = 'Upright pose reset. Capture a new upright reference.'
  ) {
    this.reference = null;
    this.capture = null;
    this.message = message;
  }

  resetPose(type: ResetType) {
    if (type === ResetType.Mounting) this.invalidate();
    else this.invalidateReference();
  }

  private expireOrientation(now: number) {
    if (
      this.orientedSignature != null &&
      this.lastReadyAt &&
      now - this.lastReadyAt > ORIENTATION_IDLE_MS
    )
      this.invalidate(
        'Nodes have been unavailable for over a minute. Run auto-orientation and capture a reference.'
      );
  }

  confirmOrientation(now: number) {
    if (!this.state(now).coreReady) {
      this.message =
        'Auto-orientation finished, but all eight measurement nodes must be ready. Reconnect them and repeat.';
      return;
    }
    this.orientedSignature = this.signature;
    this.reference = null;
    this.capture = null;
    this.message =
      'Auto-orientation confirmed by the service. Stand upright and capture a reference.';
  }

  startReference(now: number) {
    const state = this.state(now);
    if (!state.coreReady || !state.oriented) return;
    this.reference = null;
    this.capture = { startedAt: now, samples: [] };
    this.message = 'Stand upright and hold still for three seconds.';
  }

  cancelReference() {
    this.capture = null;
    this.message = 'Reference capture cancelled.';
  }

  ingest(trackers: TrackerDataT[], now: number) {
    this.expireOrientation(now);
    const signature = assignmentSignature(trackers);
    if (signature !== this.signature) {
      this.signature = signature;
      this.invalidate(
        'Node assignments or mounting settings changed. Run auto-orientation again.'
      );
    }
    this.trackers = trackers;
    this.receivedAt = now;
    if (inspectRoles(trackers, now, now, this.connected).every((role) => !role.reason))
      this.lastReadyAt = now;
    if (!this.capture) return;
    const roles = inspectRoles(trackers, now, now, this.connected);
    if (
      roles.some((role) => role.reason) ||
      trackers.some(
        (t) =>
          isLegacyHand(t.info?.bodyPart) &&
          t.status === TrackerStatus.OK &&
          (t.tps ?? 0) > 0
      )
    ) {
      this.capture = null;
      this.message =
        'Reference interrupted: a required node is not reporting usable data.';
      return;
    }
    const capture = this.capture;
    const rotations = new Map(roles.map((role) => [role.part, role.rotation!]));
    const upright = roles.every(
      (role) =>
        role.part === BodyPart.LEFT_FOOT ||
        role.part === BodyPart.RIGHT_FOOT ||
        new Vector3(0, 1, 0).applyQuaternion(role.rotation!).y >= Math.cos(20 / DEGREES)
    );
    if (!upright) {
      capture.samples = [];
      this.message =
        'Stand upright. If you already are, check placement and repeat auto-orientation.';
      return;
    }
    const first = capture.samples[0];
    const previous = capture.samples.at(-1);
    const moved =
      first &&
      roles.some(
        (role) =>
          first.rotations.get(role.part)!.angleTo(role.rotation!) * DEGREES >
          STILL_DEGREES
      );
    if (moved || (previous && now - previous.time > MAX_CAPTURE_GAP_MS)) {
      capture.samples = [];
      this.message = 'Movement or a data gap detected. Hold still for three seconds.';
    }
    // Avoid treating repeated packets at the same timestamp as more evidence.
    if (capture.samples.at(-1)?.time === now) return;
    capture.samples.push({ time: now, rotations });
    if (now - capture.samples[0].time < HOLD_MS || capture.samples.length < 20) return;
    const averaged = new Map<BodyPart, Quaternion>();
    for (const { part } of CORE_ROLES) {
      const anchor = capture.samples[0].rotations.get(part)!;
      const sum = new Quaternion(0, 0, 0, 0);
      for (const sample of capture.samples) {
        const q = sample.rotations.get(part)!;
        const sign = anchor.dot(q) < 0 ? -1 : 1;
        sum.x += sign * q.x;
        sum.y += sign * q.y;
        sum.z += sign * q.z;
        sum.w += sign * q.w;
      }
      averaged.set(part, sum.normalize());
    }
    this.reference = {
      signature: this.signature,
      rotations: averaged,
      capturedAt: now,
    };
    this.capture = null;
    this.message =
      'Upright reference captured. Move one segment at a time and check the measurements.';
  }

  state(now: number): MeasurementState {
    this.expireOrientation(now);
    const roles = inspectRoles(this.trackers, this.receivedAt, now, this.connected);
    if (
      this.capture &&
      (now - this.capture.startedAt > 15000 || roles.some((role) => role.reason))
    ) {
      this.capture = null;
      this.message =
        'Reference capture stopped. Check the nodes, stand still, and retry.';
    }
    const reference =
      this.reference?.signature === this.signature ? this.reference : null;
    const migrationRequired = this.trackers.some(
      (t) =>
        t.info?.isImu &&
        !t.info.isComputed &&
        isLegacyHand(t.info.bodyPart) &&
        t.status === TrackerStatus.OK &&
        (t.tps ?? 0) > 0
    );
    return {
      migrationRequired,
      sampleTime: this.receivedAt,
      referenceCapturedAt: reference?.capturedAt ?? null,
      roles,
      coreReady: !migrationRequired && roles.every((role) => !role.reason),
      oriented: this.orientedSignature === this.signature,
      referenceReady: !!reference && !migrationRequired,
      capturing: !!this.capture,
      progress: this.capture?.samples.length
        ? Math.min(
            1,
            (this.capture.samples.at(-1)!.time - this.capture.samples[0].time) / HOLD_MS
          )
        : 0,
      message: migrationRequired
        ? 'Switch hand / wrist nodes to feet tracking: move each node onto the matching foot, save its new assignment, then auto-orient and capture a reference.'
        : this.message,
      measurements: measure(roles, reference),
    };
  }
}
