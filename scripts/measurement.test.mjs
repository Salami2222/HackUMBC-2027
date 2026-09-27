import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import {
  BodyPart,
  ResetType,
  TrackerDataT,
  TrackerInfoT,
  TrackerIdT,
  DeviceIdT,
  QuatT,
  TrackerStatus,
} from 'solarxr-protocol';
import {
  CORE_ROLES,
  MeasurementEngine,
  inspectRoles,
  relativeChange,
  kneeInwardAngle,
} from '../src/measurement/measurements.ts';
import { evaluateFormRep } from '../src/exercise/form-quality.ts';

const rotation = (axis, degrees) =>
  new Quaternion().setFromAxisAngle(
    new Vector3(...axis),
    (degrees * Math.PI) / 180
  );
const setRotation = (tracker, q) => {
  tracker.rotationReferenceAdjusted = new QuatT(q.x, q.y, q.z, q.w);
};
function nodes() {
  return CORE_ROLES.map(({ part }, index) => {
    const t = new TrackerDataT();
    t.info = new TrackerInfoT();
    Object.assign(t.info, { bodyPart: part, isImu: true, isComputed: false });
    t.trackerId = new TrackerIdT(new DeviceIdT(index + 1), 0);
    t.status = TrackerStatus.OK;
    t.tps = 50;
    setRotation(t, new Quaternion());
    return t;
  });
}
const node = (list, part) => list.find((t) => t.info.bodyPart === part);
function prepared() {
  const engine = new MeasurementEngine();
  const list = nodes();
  engine.setConnected(true);
  engine.ingest(list, 1000);
  engine.confirmOrientation(1000);
  return { engine, list };
}
function referenced() {
  const value = prepared();
  value.engine.startReference(1000);
  for (let t = 1100; t <= 4100; t += 100) value.engine.ingest(value.list, t);
  assert.equal(value.engine.state(4100).referenceReady, true);
  return value;
}
const metric = (state, id) => state.measurements.find((m) => m.id === id);

test('signed inward deviation mirrors both knees and separates flexion through 135 degrees', () => {
  const identity = new Quaternion();
  for (const bend of [0, 30, 60, 89, 90, 98, 120, 135]) {
    for (const side of ['left', 'right']) {
      for (const inward of [-20, 0, 8, 18, 20]) {
        // Flexion about thigh X, frontal deviation about floating Z, then shin twist.
        const shin = rotation([1, 0, 0], bend)
          .multiply(rotation([0, 0, 1], (side === 'left' ? -1 : 1) * inward))
          .multiply(rotation([0, 1, 0], 25));
        const value = kneeInwardAngle(identity, shin, identity, identity, side);
        assert.ok(
          Math.abs(value - inward) < 1e-8,
          `${side} bend ${bend} inward ${inward}: ${value}`
        );
      }
    }
  }
});

test('inward measurement removes neutral offset and shared world rotation', () => {
  const neutralThigh = rotation([0, 1, 0], 20);
  const neutralShin = neutralThigh.clone().multiply(rotation([0, 0, 1], -5));
  const thigh = neutralThigh.clone().multiply(rotation([1, 0, 0], -40));
  const shin = thigh
    .clone()
    .multiply(rotation([1, 0, 0], 100))
    .multiply(rotation([0, 0, 1], -25));
  const heading = rotation([0, 1, 0], 135).multiply(rotation([0, 0, 1], 15));
  for (const shared of [new Quaternion(), heading]) {
    const q = (v) => shared.clone().multiply(v);
    assert.ok(
      Math.abs(
        kneeInwardAngle(
          q(thigh),
          q(shin),
          q(neutralThigh),
          q(neutralShin),
          'left'
        ) - 20
      ) < 1e-8
    );
  }
});

test('inward measurement remains unavailable for missing data and nearly parallel axes', () => {
  const { engine, list } = referenced();
  const shin = node(list, BodyPart.LEFT_LOWER_LEG);
  setRotation(shin, rotation([0, 0, 1], 89));
  engine.ingest(list, 4200);
  assert.equal(metric(engine.state(4200), 'leftKneeInward').value, null);
  setRotation(shin, new Quaternion());
  shin.status = TrackerStatus.DISCONNECTED;
  engine.ingest(list, 4300);
  assert.equal(metric(engine.state(4300), 'leftKneeInward').value, null);
  assert.equal(metric(engine.state(4300), 'rightKneeInward').value, 0);
  assert.equal(metric(engine.state(5401), 'rightKneeInward').value, null);
});

test('real measurement output catches equal inward deviations even with matching knee bend', () => {
  const { engine, list } = referenced();
  const samples = [];
  for (let i = 0; i <= 20; i++) {
    for (const [part, sign] of [
      [BodyPart.LEFT_LOWER_LEG, -1],
      [BodyPart.RIGHT_LOWER_LEG, 1],
    ])
      setRotation(
        node(list, part),
        rotation([1, 0, 0], 105).multiply(rotation([0, 0, 1], sign * 22))
      );
    const at = 4200 + i * 100;
    engine.ingest(list, at);
    samples.push({
      at,
      phase: i < 10 ? 'descending' : 'ascending',
      values: Object.fromEntries(
        engine.state(at).measurements.map((m) => [m.id, m.value])
      ),
    });
  }
  const result = evaluateFormRep(samples, 1, 100, 6200);
  assert.equal(result.groups.find((g) => g.id === 'symmetry').severity, 0);
  assert.equal(result.groups.find((g) => g.id === 'collapse').severity, 1);
  assert.equal(result.rating, 'attention');
  assert.equal(result.score, 60);
});

test('legacy hand assignments stay intact and block calibration until moved to feet', () => {
  const { engine, list } = prepared();
  const foot = node(list, BodyPart.LEFT_FOOT);
  foot.info.bodyPart = BodyPart.LEFT_LOWER_ARM;
  engine.ingest(list, 2000);
  assert.equal(foot.info.bodyPart, BodyPart.LEFT_LOWER_ARM);
  assert.equal(engine.state(2000).migrationRequired, true);
  assert.equal(engine.state(2000).coreReady, false);
  assert.match(engine.state(2000).message, /Switch hand/);
  engine.confirmOrientation(2000);
  engine.startReference(2000);
  assert.equal(engine.state(2000).capturing, false);
  foot.info.bodyPart = BodyPart.LEFT_FOOT;
  engine.ingest(list, 2100);
  assert.equal(engine.state(2100).migrationRequired, false);
  assert.equal(engine.state(2100).oriented, false);
});

test('foot reference accepts flat feet and reports relative foot roll and ankle motion', () => {
  const { engine, list } = prepared();
  const foot = node(list, BodyPart.LEFT_FOOT);
  // A flat foot does not share the shin's vertical orientation.
  const neutral = rotation([1, 0, 0], 80);
  setRotation(foot, neutral);
  engine.startReference(1000);
  for (let t = 1100; t <= 4100; t += 100) engine.ingest(list, t);
  assert.equal(engine.state(4100).referenceReady, true);
  setRotation(foot, neutral.clone().multiply(rotation([0, 0, 1], 15)));
  engine.ingest(list, 4200);
  assert.ok(
    Math.abs(metric(engine.state(4200), 'leftFootRoll').value - 15) < 0.01
  );
  foot.status = TrackerStatus.DISCONNECTED;
  engine.ingest(list, 4300);
  assert.equal(metric(engine.state(4300), 'leftFootRoll').value, null);
  assert.equal(metric(engine.state(4300), 'leftAnkle').value, null);
});

test('only real, uniquely assigned, streaming calibrated nodes are usable', () => {
  const list = nodes();
  assert.ok(inspectRoles(list, 1000, 1100, true).every((r) => !r.reason));
  assert.ok(
    inspectRoles(list, 1000, 2001, true).every((r) => r.reason === 'Stale data')
  );
  assert.ok(
    inspectRoles(list, 1000, 1100, false).every(
      (r) => r.reason === 'Service disconnected'
    )
  );
  const t = list[0];
  t.status = TrackerStatus.DISCONNECTED;
  assert.match(inspectRoles(list, 1000, 1100, true)[0].reason, /Offline/);
  t.status = TrackerStatus.OK;
  t.tps = 0;
  assert.match(
    inspectRoles(list, 1000, 1100, true)[0].reason,
    /No sensor packets/
  );
  t.tps = null;
  assert.match(
    inspectRoles(list, 1000, 1100, true)[0].reason,
    /rate unavailable/
  );
  t.tps = 50;
  setRotation(t, new Quaternion(0, 0, 0, 0));
  assert.match(inspectRoles(list, 1000, 1100, true)[0].reason, /Invalid/);
  setRotation(t, new Quaternion(NaN, 0, 0, 1));
  assert.match(inspectRoles(list, 1000, 1100, true)[0].reason, /Invalid/);
  setRotation(t, new Quaternion());
  assert.equal(
    inspectRoles([...list, t], 1000, 1100, true)[0].reason,
    'Duplicate assignment'
  );
  t.info.isComputed = true;
  assert.equal(inspectRoles(list, 1000, 1100, true)[0].reason, 'Not assigned');
});

test('reference requires confirmed orientation, then three seconds of stable data', () => {
  const engine = new MeasurementEngine();
  const list = nodes();
  engine.setConnected(true);
  engine.ingest(list, 1000);
  engine.startReference(1000);
  assert.equal(engine.state(1000).capturing, false);
  engine.confirmOrientation(1000);
  engine.startReference(1000);
  for (let t = 1100; t <= 4000; t += 100) engine.ingest(list, t);
  assert.equal(engine.state(4000).referenceReady, false);
  engine.ingest(list, 4100);
  const state = engine.state(4100);
  assert.equal(state.referenceReady, true);
  assert.ok(state.measurements.every((m) => Math.abs(m.value) < 1e-6));
});

test('three-dimensional knee bend is independent of shared world heading', () => {
  const { engine, list } = referenced();
  const heading = rotation([0, 1, 0], 70);
  list.forEach((t) => setRotation(t, heading));
  setRotation(
    node(list, BodyPart.LEFT_LOWER_LEG),
    heading.clone().multiply(rotation([1, 0, 0], 60))
  );
  engine.ingest(list, 4200);
  const state = engine.state(4200);
  assert.ok(Math.abs(metric(state, 'leftKnee').value - 60) < 1e-5);
  assert.ok(Math.abs(metric(state, 'rightKnee').value) < 1e-5);
  assert.ok(Math.abs(metric(state, 'kneeDifference').value - 60) < 1e-5);
  assert.ok(Math.abs(metric(state, 'headPitch').value) < 1e-5);
  assert.equal(
    state.roles.some((r) => r.part === BodyPart.HIP),
    false
  );
  assert.equal(
    state.measurements.some((m) => m.id === 'chestHip'),
    false
  );
});

test('relative rotations subtract the neutral relationship, not Euler components', () => {
  const p = rotation([0, 1, 0], 20),
    c = rotation([1, 0, 0], 10);
  assert.ok(relativeChange(p, c, p, c).angleTo(new Quaternion()) < 1e-6);
  const world = rotation([0, 1, 0], 100);
  assert.ok(
    relativeChange(
      world.clone().multiply(p),
      world.clone().multiply(c),
      p,
      c
    ).angleTo(new Quaternion()) < 1e-6
  );
});

test('missing head suppresses head measurements without inventing zeros or blocking knees', () => {
  const { engine, list } = referenced();
  node(list, BodyPart.HEAD).status = TrackerStatus.DISCONNECTED;
  engine.ingest(list, 4200);
  const state = engine.state(4200);
  assert.equal(metric(state, 'headPitch').value, null);
  assert.notEqual(metric(state, 'leftKnee').value, null);
  assert.equal(state.coreReady, false);
});

test('stale data suppresses every measurement while retaining reference for recovery', () => {
  const { engine } = referenced();
  const state = engine.state(5201);
  assert.equal(state.referenceReady, true);
  assert.ok(state.measurements.every((m) => m.value === null));
});

test('assignment changes and mounting resets invalidate calibration', () => {
  for (const change of ['assignment', 'mounting', 'reset']) {
    const { engine, list } = referenced();
    if (change === 'disconnect') engine.setConnected(false);
    if (change === 'assignment') {
      list[0].trackerId.deviceId.id = 999;
      engine.ingest(list, 4200);
    }
    if (change === 'mounting') {
      list[0].info.mountingOrientation = new QuatT(0, 1, 0, 0);
      engine.ingest(list, 4200);
    }
    if (change === 'reset') engine.invalidate();
    const state = engine.state(4200);
    assert.equal(state.referenceReady, false, change);
    assert.equal(state.oriented, false, change);
  }
});

test('motion and capture gaps restart the stable window', () => {
  for (const gap of [false, true]) {
    const { engine, list } = prepared();
    engine.startReference(1000);
    for (let t = 1100; t <= 2500; t += 100) engine.ingest(list, t);
    if (!gap) setRotation(list[0], rotation([1, 0, 0], 5));
    engine.ingest(list, 3000);
    assert.equal(engine.state(3000).progress, 0);
    assert.equal(engine.state(3000).referenceReady, false);
    for (let t = 3100; t <= 6000; t += 100) engine.ingest(list, t);
    assert.equal(engine.state(6000).referenceReady, true);
  }
});

test('bent posture, cancellation, timeout, and interrupted data cannot establish a reference', () => {
  const { engine, list } = prepared();
  engine.startReference(1000);
  setRotation(node(list, BodyPart.LEFT_UPPER_LEG), rotation([1, 0, 0], 35));
  for (let t = 1100; t <= 5100; t += 100) engine.ingest(list, t);
  assert.equal(engine.state(5100).referenceReady, false);
  engine.cancelReference();
  assert.equal(engine.state(5100).capturing, false);
  setRotation(node(list, BodyPart.LEFT_UPPER_LEG), new Quaternion());
  engine.ingest(list, 5200);
  engine.startReference(5200);
  assert.equal(engine.state(7000).capturing, false);
  assert.equal(engine.state(7000).referenceReady, false);
});

test('antipodal quaternions average to the same stable reference', () => {
  const { engine, list } = prepared();
  engine.startReference(1000);
  for (let t = 1100; t <= 4100; t += 100) {
    list.forEach((n) =>
      setRotation(n, new Quaternion(0, 0, 0, t % 200 === 0 ? -1 : 1))
    );
    engine.ingest(list, t);
  }
  assert.equal(engine.state(4100).referenceReady, true);
  assert.ok(
    engine.state(4100).measurements.every((m) => Math.abs(m.value) < 1e-6)
  );
});

test('near-singular relative pitch is unavailable rather than an unstable heading', () => {
  const { engine, list } = referenced();
  setRotation(node(list, BodyPart.HEAD), rotation([1, 0, 0], 90));
  engine.ingest(list, 4200);
  assert.equal(metric(engine.state(4200), 'headTurn').value, null);
});

test('head inclination tracks signed nodding independent of heading and chest lean', () => {
  const { engine, list } = referenced();
  for (const pitch of [-30, 25]) {
    setRotation(
      node(list, BodyPart.HEAD),
      rotation([0, 1, 0], 70).multiply(rotation([1, 0, 0], pitch))
    );
    engine.ingest(list, 4200);
    assert.ok(
      Math.abs(metric(engine.state(4200), 'headInclination').value - pitch) <
        1e-5
    );
  }
  setRotation(node(list, BodyPart.HEAD), new Quaternion());
  setRotation(node(list, BodyPart.CHEST), rotation([1, 0, 0], -35));
  engine.ingest(list, 4300);
  assert.ok(
    Math.abs(metric(engine.state(4300), 'headInclination').value) < 1e-5
  );
  assert.ok(
    Math.abs(metric(engine.state(4300), 'headPitch').value - 35) < 1e-5
  );
  node(list, BodyPart.HEAD).status = TrackerStatus.DISCONNECTED;
  engine.ingest(list, 4400);
  assert.equal(metric(engine.state(4400), 'headInclination').value, null);
});

test('upright and yaw resets clear reference but preserve mounting and allow recapture', () => {
  for (const type of [ResetType.Full, ResetType.Yaw]) {
    const { engine, list } = referenced();
    engine.resetPose(type);
    assert.equal(engine.state(4200).oriented, true);
    assert.equal(engine.state(4200).referenceReady, false);
    engine.startReference(4200);
    for (let t = 4300; t <= 7300; t += 100) engine.ingest(list, t);
    assert.equal(engine.state(7300).referenceReady, true);
  }
  const { engine } = referenced();
  engine.resetPose(ResetType.Mounting);
  assert.equal(engine.state(4200).oriented, false);
});
test('brief reconnect preserves mounting, prolonged node absence requires orientation again', () => {
  const { engine, list } = referenced();
  engine.setConnected(false);
  assert.equal(engine.state(4500).oriented, true);
  engine.setConnected(true);
  engine.ingest(list, 5000);
  assert.equal(engine.state(5000).oriented, true);
  list.forEach((t) => (t.status = TrackerStatus.DISCONNECTED));
  engine.ingest(list, 5500);
  assert.equal(engine.state(66000).oriented, false);
  list.forEach((t) => (t.status = TrackerStatus.OK));
  engine.ingest(list, 66100);
  assert.equal(engine.state(66100).oriented, false);
});
