import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeFormTest } from '../src/exercise/form-test.ts';
import { evaluateFormRep, GROUPS } from '../src/exercise/form-quality.ts';
import { targetRepCount } from '../src/exercise/session-config.ts';
import {
  recordFormTestRep,
  recordWorkingSetRep,
} from '../src/exercise/session-recording.ts';

function assessment(rep = 1, change = () => ({}), depth = 100) {
  const samples = Array.from({ length: 81 }, (_, i) => {
    const bend = i <= 40 ? i * 2.5 : (80 - i) * 2.5;
    return {
      at: 1000 + i * 100,
      phase: i === 80 ? 'ready' : i < 40 ? 'descending' : 'ascending',
      values: {
        leftKnee: bend,
        rightKnee: bend,
        chestTilt: 20,
        chestRoll: 0,
        headInclination: 0,
        headRoll: 0,
        headTurn: 0,
        ...change(i, bend),
      },
    };
  });
  return evaluateFormRep(samples, rep, depth, 9100);
}
const peaks = (angle) => ({
  maxLeftKneeFlexion: angle,
  maxRightKneeFlexion: angle,
  maxBilateralKneeFlexion: angle,
});
const attempt = (change, depth = 100) =>
  [1, 2, 3].reduce(
    (state, rep) =>
      recordFormTestRep(state.reps, assessment(rep, change, depth)),
    { reps: [], result: null }
  );

test('both modes retain independent three- and eight-rep targets', () => {
  assert.equal(targetRepCount('form-test'), 3);
  assert.equal(targetRepCount('working-set'), 8);
});
test('Form Test stores the shared weighted assessment unchanged, including Jev', () => {
  const measured = assessment();
  const finalized = {
    ...measured,
    score: 99,
    jev: {
      measuredScore: 100,
      proposedScore: 80,
      weight: 0.05,
      reason: 'Applied',
    },
  };
  const recorded = recordFormTestRep([], finalized);
  assert.equal(recorded.reps[0].assessment, finalized);
  assert.deepEqual(
    finalized.groups.map((g) => [g.id, g.weight]),
    GROUPS.map((g) => [g.id, g.weight])
  );
  assert.equal(
    finalized.groups.reduce((sum, g) => sum + g.weight, 0),
    100
  );
});
for (const [name, change, rating] of [
  ['head', () => ({ headInclination: 65 }), 'suboptimal'],
  ['torso', () => ({ chestRoll: 35 }), 'suboptimal'],
  ['symmetry', (_, bend) => ({ leftKnee: bend + 40 }), 'suboptimal'],
  [
    'combined torso and symmetry',
    (_, bend) => ({ leftKnee: bend + 40, chestRoll: 35 }),
    'attention',
  ],
]) {
  test(`good depth cannot pass with sustained ${name} issues`, () => {
    const { result } = attempt(change);
    assert.equal(result.passed, false);
    assert.equal(result.improvementReps, 3);
    assert.ok(result.reps.every((r) => r.assessment.rating === rating));
  });
}
test('Form Test uses the shared 98 degree target, not the former 75 degree rule', () => {
  assert.equal(attempt(() => ({}), 80).result.passed, false);
  assert.equal(attempt(() => ({}), 98).result.passed, true);
});
test('missing head data does not become a depth-only pass', () => {
  const { result } = attempt(() => ({ headInclination: null }));
  assert.equal(result.passed, false);
  assert.equal(result.unknownReps, 3);
  assert.ok(result.reps.every((r) => r.assessment.score === null));
});
test('a bad first rep does not finish early and all three are retained', () => {
  const first = recordFormTestRep(
    [],
    assessment(1, () => ({ chestRoll: 35 }))
  );
  assert.equal(first.result, null);
  assert.throws(() => analyzeFormTest(first.reps));
  const second = recordFormTestRep(first.reps, assessment(2));
  assert.equal(second.result, null);
  const third = recordFormTestRep(second.reps, assessment(3));
  assert.equal(third.result.improvementReps, 1);
  assert.equal(third.result.passed, false);
  assert.throws(() => recordFormTestRep(third.reps, assessment(4)));
  assert.throws(() => recordFormTestRep([], assessment(2)));
});
test('Working Set completes eight reps independently and retry only clears Form Test', () => {
  let working = [];
  for (let i = 0; i < 8; i++) {
    const recorded = recordWorkingSetRep(working, peaks(100), i + 1);
    working = recorded.reps;
    assert.equal(recorded.complete, i === 7);
  }
  assert.throws(() => recordWorkingSetRep(working, peaks(100), 9));
  const first = attempt(() => ({ chestRoll: 35 }));
  const second = attempt(() => ({}));
  assert.equal(first.result.passed, false);
  assert.equal(second.result.passed, true);
  assert.equal(second.reps[0].repNumber, 1);
  assert.equal(working.length, 8);
});
