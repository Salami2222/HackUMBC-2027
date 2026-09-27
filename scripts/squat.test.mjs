import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeWarmup,
  classifySquatDepth,
  completeSquatRep,
  createSquatBaseline,
  loadSquatBaseline,
  saveSquatBaseline,
  SQUAT_BASELINE_KEY,
  SquatRepDetector,
  WARMUP_REP_COUNT,
} from '../src/exercise/squat.ts';

const reps = (angles) =>
  angles.map((angle, index) =>
    completeSquatRep(
      index + 1,
      {
        maxLeftKneeFlexion: angle,
        maxRightKneeFlexion: angle,
        maxBilateralKneeFlexion: angle,
      },
      1000 + index
    )
  );

for (const [angles, labels, accepted] of [
  [[80, 85, 90], ['acceptable', 'acceptable', 'acceptable'], true],
  [[80, 70, 85], ['acceptable', 'shallow', 'acceptable'], false],
  [[90, 55, 87], ['acceptable', 'very-shallow', 'acceptable'], false],
  [[65, 68, 82], ['shallow', 'shallow', 'acceptable'], false],
  [[110, 120, 95], ['acceptable', 'acceptable', 'acceptable'], true],
]) {
  test(`three-rep depth result for ${angles.join(', ')}`, () => {
    const result = analyzeWarmup(reps(angles));
    assert.deepEqual(
      result.reps.map((rep) => rep.depthClassification),
      labels
    );
    assert.equal(result.accepted, accepted);
    assert.equal(
      result.failedDepthRepCount,
      labels.filter((label) => label !== 'acceptable').length
    );
  });
}

test('the straighter leg determines depth; no upper depth cutoff exists', () => {
  const rep = completeSquatRep(
    1,
    {
      maxLeftKneeFlexion: 110,
      maxRightKneeFlexion: 68,
      maxBilateralKneeFlexion: 68,
    },
    1000
  );
  assert.equal(rep.achievedKneeFlexion, 68);
  assert.equal(rep.depthClassification, 'shallow');
  assert.equal(classifySquatDepth(120), 'acceptable');
  assert.equal(classifySquatDepth(75), 'acceptable');
  assert.equal(classifySquatDepth(60), 'shallow');
  assert.equal(classifySquatDepth(59.9), 'very-shallow');
});

test('analysis waits for all three reps even when the first fails', () => {
  assert.throws(() => analyzeWarmup(reps([55])));
  assert.throws(() => analyzeWarmup(reps([55, 85])));
  const result = analyzeWarmup(reps([55, 85, 90]));
  assert.equal(result.reps.length, WARMUP_REP_COUNT);
  assert.equal(result.failedDepthRepCount, 1);
  assert.equal(result.accepted, false);
  assert.throws(() => createSquatBaseline(result, 2000));
});

function feedRep(detector, leftPeak, rightPeak, startAt, noisy = false) {
  let at = startAt;
  const results = [];
  const sample = (left, right) => {
    const result = detector.ingest(left, right, at);
    if (result) results.push(result);
    at += 50;
  };
  for (let i = 0; i < 12; i++) sample(0, 0);
  for (let i = 1; i <= 12; i++)
    sample((leftPeak * i) / 12, (rightPeak * i) / 12);
  for (let i = 0; i < 7; i++)
    sample(noisy && i === 3 ? 160 : leftPeak, rightPeak);
  for (let i = 11; i >= 0; i--)
    sample((leftPeak * i) / 12, (rightPeak * i) / 12);
  for (let i = 0; i < 7; i++) sample(0, 0);
  return { results, nextAt: at };
}

test('the live detector completes a rep on return upright and uses stable peaks', () => {
  const detector = new SquatRepDetector();
  const { results } = feedRep(detector, 80, 85, 1000, true);
  assert.equal(results.length, 1);
  assert.ok(results[0].maxLeftKneeFlexion >= 75);
  assert.ok(results[0].maxLeftKneeFlexion < 100);
  assert.ok(results[0].maxRightKneeFlexion >= 80);
});

test('a bad first rep does not stop detection of the second and third', () => {
  const detector = new SquatRepDetector();
  const recorded = [];
  let at = 1000;
  for (const angle of [55, 85, 90]) {
    const fed = feedRep(detector, angle, angle, at);
    recorded.push(...fed.results);
    at = fed.nextAt;
    if (recorded.length < WARMUP_REP_COUNT)
      assert.throws(() =>
        analyzeWarmup(
          recorded.map((peak, index) => completeSquatRep(index + 1, peak, at))
        )
      );
  }
  assert.equal(recorded.length, 3);
  const result = analyzeWarmup(
    recorded.map((peak, index) => completeSquatRep(index + 1, peak, at))
  );
  assert.equal(result.accepted, false);
  assert.equal(result.reps[0].depthClassification, 'very-shallow');
});

test('retry resets incomplete movement and allows a fresh three-rep attempt', () => {
  const detector = new SquatRepDetector();
  feedRep(detector, 55, 55, 1000);
  detector.reset();
  const recorded = [];
  let at = 5000;
  for (const angle of [80, 85, 90]) {
    const fed = feedRep(detector, angle, angle, at);
    recorded.push(...fed.results);
    at = fed.nextAt;
  }
  assert.equal(recorded.length, 3);
  assert.equal(
    analyzeWarmup(
      recorded.map((peak, index) => completeSquatRep(index + 1, peak, at))
    ).accepted,
    true
  );
});

test('an accepted baseline persists; failed replacement does not overwrite it', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const accepted = createSquatBaseline(analyzeWarmup(reps([80, 85, 90])), 2000);
  saveSquatBaseline(storage, accepted);
  assert.deepEqual(loadSquatBaseline(storage), accepted);
  const previous = values.get(SQUAT_BASELINE_KEY);
  const rejected = analyzeWarmup(reps([80, 70, 85]));
  assert.throws(() => createSquatBaseline(rejected, 3000));
  assert.equal(values.get(SQUAT_BASELINE_KEY), previous);
  assert.equal(loadSquatBaseline(storage)?.sampleSize, 3);
});

function feedSegments(detector, segments, startAt = 1000) {
  let at = startAt;
  const results = [];
  for (const [left, right, count] of segments) {
    for (let i = 0; i < count; i++) {
      const result = detector.ingest(left, right, at);
      if (result) results.push(result);
      at += 50;
    }
  }
  return { results, nextAt: at };
}

test('alternating leg bends do not qualify as bilateral squat depth', () => {
  const { results } = feedSegments(new SquatRepDetector(), [
    [0, 0, 12],
    [90, 20, 20],
    [20, 90, 20],
    [0, 0, 12],
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].maxLeftKneeFlexion, 90);
  assert.equal(results[0].maxRightKneeFlexion, 90);
  const rep = completeSquatRep(1, results[0], 5000);
  assert.equal(rep.achievedKneeFlexion, 20);
  assert.equal(rep.depthValid, false);
});

test('starting crouched requires an upright stance before recording a full rep', () => {
  const detector = new SquatRepDetector();
  const partial = feedSegments(detector, [
    [85, 85, 20],
    [0, 0, 12],
  ]);
  assert.equal(partial.results.length, 0);
  assert.equal(feedRep(detector, 85, 85, partial.nextAt).results.length, 1);
});

test('a data gap discards a partial rep and requires upright before rearming', () => {
  const detector = new SquatRepDetector();
  const first = feedSegments(detector, [
    [0, 0, 12],
    [85, 85, 20],
  ]);
  const resumed = feedSegments(
    detector,
    [
      [85, 85, 20],
      [0, 0, 12],
    ],
    first.nextAt + 1000
  );
  assert.equal(resumed.results.length, 0);
  assert.equal(feedRep(detector, 85, 85, resumed.nextAt).results.length, 1);
});
