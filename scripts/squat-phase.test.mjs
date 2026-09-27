import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SquatPhaseDetector } from '../src/exercise/squat-phase.ts';

function rig({ hz = 10, head = true, advice = null } = {}) {
  const detector = new SquatPhaseDetector();
  let at = 1000;
  let last = 0;
  const phases = [],
    reps = [];
  function sample(
    left,
    right = left,
    height = head ? 1.7 - (left + right) * 0.0025 : null
  ) {
    const rep = detector.ingest(
      { at, left, right, headHeight: height },
      advice?.(at)
    );
    if (rep) reps.push(rep);
    if (phases.at(-1) !== detector.state.phase)
      phases.push(detector.state.phase);
    at += 1000 / hz;
    last = left;
  }
  const hold = (angle, seconds, jitter = 0) => {
    for (let i = 0; i < Math.ceil(seconds * hz); i++)
      sample(angle + (i % 2 ? jitter : -jitter));
  };
  const ramp = (to, seconds) => {
    const from = last,
      n = Math.ceil(seconds * hz);
    for (let i = 1; i <= n; i++) sample(from + ((to - from) * i) / n);
  };
  const rep = (peak = 100, pause = 0.4) => {
    hold(0, 1);
    ramp(peak, 1.5);
    hold(peak, pause);
    ramp(0, 1.5);
    hold(0, 1);
  };
  return {
    detector,
    sample,
    hold,
    ramp,
    rep,
    phases,
    reps,
    gap(ms) {
      at += ms;
    },
    get at() {
      return at;
    },
  };
}

for (const hz of [10, 20, 40])
  test(`ordered phase sequence and one count per rep at ${hz} Hz`, () => {
    const r = rig({ hz });
    r.rep();
    assert.deepEqual(r.phases, [
      'unavailable',
      'ready',
      'descending',
      'bottom',
      'ascending',
      'ready',
    ]);
    assert.equal(r.reps.length, 1);
    assert.ok(r.reps[0].maxBilateralKneeFlexion > 97);
    r.hold(0, 3);
    assert.equal(r.reps.length, 1);
  });
test('eight reps stay ordered without duplicate counts', () => {
  const r = rig();
  for (let i = 0; i < 8; i++) r.rep();
  assert.equal(r.reps.length, 8);
});
test('a shallow rep is counted independently of the depth target', () => {
  const r = rig();
  r.rep(40);
  assert.equal(r.reps.length, 1);
  assert.ok(r.reps[0].maxBilateralKneeFlexion < 98);
});
test('a mid-descent pause and small bounce cannot flicker phases', () => {
  const r = rig();
  r.hold(0, 1);
  r.ramp(45, 1);
  r.hold(45, 2, 1.5);
  assert.equal(r.detector.state.phase, 'descending');
  r.ramp(100, 1);
  r.hold(100, 2, 1.5);
  r.ramp(0, 1.5);
  r.hold(0, 1);
  assert.equal(r.reps.length, 1);
  assert.deepEqual(r.phases, [
    'unavailable',
    'ready',
    'descending',
    'bottom',
    'ascending',
    'ready',
  ]);
});
test('noise at upright never starts or counts a rep', () => {
  const r = rig();
  r.hold(2, 10, 2);
  assert.equal(r.reps.length, 0);
  assert.equal(r.detector.state.phase, 'ready');
});
test('head-only movement and model votes cannot invent knee movement', () => {
  const r = rig({
    advice: (at) => ({
      at,
      phase: 'descending',
      probability: 0.99,
      confidence: 0.99,
    }),
  });
  r.hold(0, 1);
  for (let i = 0; i < 30; i++) r.sample(0, 0, 1.7 - 0.02 * i);
  assert.equal(r.detector.state.phase, 'ready');
  assert.equal(r.reps.length, 0);
});
test('missing head height does not block valid bilateral motion', () => {
  const r = rig({ head: false });
  r.rep();
  assert.equal(r.reps.length, 1);
});
test('contradictory and late Jev answers cannot reverse the phase sequence', () => {
  for (const stale of [false, true]) {
    const r = rig({
      advice: (at) => ({
        at: stale ? at - 2000 : at,
        phase: Math.round(at / 100) % 2 ? 'descending' : 'ascending',
        probability: 0.99,
        confidence: 0.99,
      }),
    });
    r.rep();
    assert.equal(r.reps.length, 1);
    assert.deepEqual(r.phases, [
      'unavailable',
      'ready',
      'descending',
      'bottom',
      'ascending',
      'ready',
    ]);
  }
});
test('a feed gap discards the unfinished rep and rearms only upright', () => {
  const r = rig();
  r.hold(0, 1);
  r.ramp(100, 1);
  r.gap(700);
  r.hold(100, 1);
  r.ramp(0, 1.5);
  r.hold(0, 1);
  assert.equal(r.reps.length, 0);
  r.rep();
  assert.equal(r.reps.length, 1);
});
test('starting crouched cannot count the first return upright', () => {
  const r = rig();
  r.hold(100, 1);
  r.ramp(0, 1.5);
  r.hold(0, 1);
  assert.equal(r.reps.length, 0);
  r.rep();
  assert.equal(r.reps.length, 1);
});
test('one-leg movement cannot start a bilateral squat', () => {
  const r = rig();
  r.hold(0, 1);
  for (let i = 0; i < 30; i++) r.sample(i * 3, 0);
  assert.equal(r.detector.state.phase, 'ready');
  assert.equal(r.reps.length, 0);
});
test('duplicate and out-of-order timestamps cannot advance confirmation', () => {
  const r = rig();
  r.hold(0, 1);
  const at = r.at;
  for (let i = 0; i < 20; i++)
    r.detector.ingest({ at, left: 90, right: 90, headHeight: 1.2 });
  r.detector.ingest({ at: at - 1000, left: 90, right: 90, headHeight: 1.2 });
  assert.equal(r.detector.state.phase, 'ready');
});
test('a deliberate second descent during ascent invalidates the attempt', () => {
  const r = rig();
  r.hold(0, 1);
  r.ramp(100, 1.5);
  r.ramp(40, 1.5);
  assert.equal(r.detector.state.phase, 'ascending');
  r.ramp(110, 1.5);
  assert.equal(r.detector.state.phase, 'unavailable');
  r.ramp(0, 1.5);
  r.hold(0, 1);
  assert.equal(r.reps.length, 0);
});

for (const seconds of [0.6, 1, 4, 7])
  test(`turnaround without a bottom hold at ${seconds}s per direction`, () => {
    const r = rig();
    r.hold(0, 1);
    r.ramp(100, seconds);
    r.ramp(0, seconds);
    r.hold(0, 1);
    assert.equal(r.reps.length, 1);
    assert.deepEqual(r.phases, [
      'unavailable',
      'ready',
      'descending',
      'bottom',
      'ascending',
      'ready',
    ]);
  });

test('invalid readings and explicit reset discard the partial rep', () => {
  const r = rig();
  r.hold(0, 1);
  r.ramp(100, 1.5);
  r.detector.ingest({ at: r.at, left: NaN, right: 90, headHeight: null });
  r.ramp(0, 1.5);
  r.hold(0, 1);
  assert.equal(r.reps.length, 0);
  r.ramp(100, 1.5);
  r.detector.reset();
  r.ramp(0, 1.5);
  r.hold(0, 1);
  assert.equal(r.reps.length, 0);
  r.rep();
  assert.equal(r.reps.length, 1);
});
