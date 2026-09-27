import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import {
  BodyPart,
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
} from '../src/measurement/measurements.ts';

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

test('disconnect, assignment change, mounting change, and reset invalidate calibration', () => {
  for (const change of ['disconnect', 'assignment', 'mounting', 'reset']) {
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
