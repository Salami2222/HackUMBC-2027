import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeFormTest,
  classifyFormTestDepth,
  completeFormTestRep,
} from '../src/exercise/form-test.ts';
import {
  FORM_TEST_REP_COUNT,
  targetRepCount,
  WORKING_SET_REP_COUNT,
} from '../src/exercise/session-config.ts';
import {
  recordFormTestRep,
  recordWorkingSetRep,
} from '../src/exercise/session-recording.ts';

const rep = (repNumber, left, right = left) =>
  completeFormTestRep(repNumber, {
    maxLeftKneeFlexion: left,
    maxRightKneeFlexion: right,
    maxBilateralKneeFlexion: Math.min(left, right),
  });

test('session modes have independent three- and eight-rep targets', () => {
  assert.equal(targetRepCount('form-test'), FORM_TEST_REP_COUNT);
  assert.equal(targetRepCount('working-set'), WORKING_SET_REP_COUNT);
  assert.equal(FORM_TEST_REP_COUNT, 3);
  assert.equal(WORKING_SET_REP_COUNT, 8);
});

test('form test depth has inclusive 75 and 60 degree boundaries, with no upper limit', () => {
  assert.equal(classifyFormTestDepth(59.9), 'very-shallow');
  assert.equal(classifyFormTestDepth(60), 'shallow');
  assert.equal(classifyFormTestDepth(74.9), 'shallow');
  assert.equal(classifyFormTestDepth(75), 'acceptable');
  assert.equal(classifyFormTestDepth(120), 'acceptable');
});

test('each rep uses the less-flexed leg from smoothed live peaks', () => {
  const result = rep(1, 110, 68);
  assert.equal(result.achievedKneeFlexion, 68);
  assert.equal(result.depthClassification, 'shallow');
});

for (const [angles, passed, failed] of [
  [[80, 85, 90], true, 0],
  [[82, 70, 88], false, 1],
  [[85, 55, 90], false, 1],
  [[110, 120, 95], true, 0],
]) {
  test(`all three form-test reps are evaluated: ${angles.join(', ')}`, () => {
    const result = analyzeFormTest(angles.map((angle, i) => rep(i + 1, angle)));
    assert.equal(result.totalReps, 3);
    assert.equal(result.reps.length, 3);
    assert.equal(result.failedDepthReps, failed);
    assert.equal(result.passedDepthReps, 3 - failed);
    assert.equal(result.depthPassed, passed);
  });
}

test('a bad first rep does not produce an early result', () => {
  assert.throws(() => analyzeFormTest([rep(1, 55)]));
  assert.throws(() => analyzeFormTest([rep(1, 55), rep(2, 90)]));
  const complete = analyzeFormTest([rep(1, 55), rep(2, 90), rep(3, 92)]);
  assert.equal(complete.depthPassed, false);
  assert.deepEqual(
    complete.reps.map((item) => item.depthClassification),
    ['very-shallow', 'acceptable', 'acceptable']
  );
});

test('a new form test starts from a fresh rep list', () => {
  const first = analyzeFormTest([rep(1, 80), rep(2, 60), rep(3, 90)]);
  const second = analyzeFormTest([rep(1, 82), rep(2, 85), rep(3, 110)]);
  assert.equal(first.depthPassed, false);
  assert.equal(second.depthPassed, true);
  assert.equal(second.reps[0].repNumber, 1);
});

const peaks = (angle) => ({
  maxLeftKneeFlexion: angle,
  maxRightKneeFlexion: angle,
  maxBilateralKneeFlexion: angle,
});

test('Form Test waits until rep three to finish, including after a shallow first rep', () => {
  let reps = [];
  for (const angle of [55, 85]) {
    const recorded = recordFormTestRep(reps, peaks(angle));
    reps = recorded.reps;
    assert.equal(recorded.result, null);
  }
  const completed = recordFormTestRep(reps, peaks(90));
  assert.equal(completed.reps.length, 3);
  assert.equal(completed.result.failedDepthReps, 1);
  assert.equal(completed.result.depthPassed, false);
  assert.throws(() => recordFormTestRep(completed.reps, peaks(100)));
});

test('Working Set reaches eight reps without Form Test and retains its own data', () => {
  let workingReps = [];
  for (let i = 0; i < 8; i++) {
    const recorded = recordWorkingSetRep(workingReps, peaks(100), i + 1);
    workingReps = recorded.reps;
    assert.equal(recorded.complete, i === 7);
  }
  assert.equal(workingReps.length, 8);
  assert.throws(() => recordWorkingSetRep(workingReps, peaks(100), 9));
  const formTest = recordFormTestRep([], peaks(80));
  assert.equal(formTest.reps.length, 1);
  assert.equal(workingReps.length, 8);
  assert.equal(workingReps.at(-1).rep, 8);
});

test('repeating Form Test clears only its own recording', () => {
  const working = recordWorkingSetRep([], peaks(100), 1).reps;
  const completed = [80, 70, 90].reduce(
    (state, angle) => recordFormTestRep(state.reps, peaks(angle)),
    { reps: [], result: null }
  );
  assert.equal(completed.result.depthPassed, false);
  const repeated = recordFormTestRep([], peaks(85));
  assert.equal(repeated.reps[0].repNumber, 1);
  assert.equal(repeated.result, null);
  assert.equal(working.length, 1);
});
