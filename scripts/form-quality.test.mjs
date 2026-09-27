import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateFormRep,
  FormAnalyzer,
  summarizeForm,
} from '../src/exercise/form-quality.ts';

function frames(change = () => ({})) {
  return Array.from({ length: 81 }, (_, i) => {
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
        leftFootRoll: 0,
        rightFootRoll: 0,
        leftAnkle: 10,
        rightAnkle: 10,
        ...change(i, bend),
      },
    };
  });
}
const assess = (change, depth = 100) =>
  evaluateFormRep(frames(change), 1, depth, 9100);
test('complete usable movement is scored, without penalizing normal forward lean', () => {
  const r = assess(() => ({ chestTilt: 45 }));
  assert.equal(r.rating, 'optimal');
  assert.equal(r.score, 100);
  assert.equal(r.coverage, 1);
});
test('brief head or foot spikes do not become sustained issues', () => {
  const r = assess((i) =>
    i === 30 || i === 31 ? { headInclination: 80, leftFootRoll: 40 } : {}
  );
  assert.equal(r.rating, 'optimal');
});
test('each single family is capped and cannot trigger needs attention', () => {
  for (const change of [
    () => ({ headInclination: 80 }),
    () => ({ chestRoll: 35 }),
    (_, bend) => ({ leftKnee: bend + 40 }),
    () => ({ leftFootRoll: 50 }),
  ]) {
    const r = assess(change);
    assert.equal(r.rating, 'suboptimal');
    assert.ok(r.score >= 65);
  }
  assert.equal(assess(() => ({}), 40).rating, 'suboptimal');
});
test('two sustained substantial groups can produce needs attention', () => {
  const r = assess((_, bend) => ({ leftKnee: bend + 40, chestRoll: 35 }));
  assert.equal(r.rating, 'attention');
  assert.ok(r.score < 65);
});
test('correlated head metrics stay within the head group cap', () => {
  const one = assess(() => ({ headInclination: 80 }));
  const three = assess(() => ({
    headInclination: 80,
    headRoll: 50,
    headTurn: 80,
  }));
  assert.equal(one.score, three.score);
  assert.equal(three.rating, 'suboptimal');
});
test('missing or corrupt foot data is unknown, never zero or optimal', () => {
  for (const value of [null, undefined, NaN, Infinity]) {
    const r = assess(() => ({ leftFootRoll: value }));
    assert.equal(r.score, null);
    assert.equal(r.rating, 'unknown');
  }
});
test('coverage threshold applies to each family, not just an average', () => {
  const r = assess((i) => (i < 20 ? { headInclination: null } : {}));
  assert.equal(r.rating, 'unknown');
  assert.ok(r.coverage < 0.85);
  const partial = assess((i) => (i < 4 ? { headInclination: null } : {}));
  assert.equal(partial.rating, 'optimal');
});
test('missing intervals break persistence and do not count as corroboration', () => {
  const r = assess((i) =>
    i % 3 === 2 ? { headInclination: null } : { headInclination: 80 }
  );
  assert.equal(r.groups.find((g) => g.id === 'head').severity, 0);
});
test('analyzer clears unfinished evidence on interruption or explicit reset', () => {
  const a = new FormAnalyzer();
  a.observe({ at: 500, phase: 'ready', values: {} });
  for (const f of frames().slice(0, 20)) a.observe(f);
  a.observe({ at: 4000, phase: 'unavailable', values: {} });
  assert.equal(a.finish(1, 100, 4100).rating, 'unknown');
  for (const f of frames()) a.observe(f);
  a.reset();
  assert.equal(a.finish(1, 100, 10000).rating, 'unknown');
});
test('set feedback identifies repeated reps and excludes unknown scores from trends', () => {
  const reps = Array.from({ length: 8 }, (_, i) => ({
    ...assess(i > 3 ? () => ({ chestRoll: 35 }) : () => ({})),
    rep: i + 1,
  }));
  const summary = summarizeForm(reps);
  assert.deepEqual(summary.feedback[0].reps, [5, 6, 7, 8]);
  assert.match(summary.trend, /fell/);
  reps[7] = { ...reps[7], score: null, rating: 'unknown' };
  assert.match(summarizeForm(reps).trend, /Not enough/);
});

test('weighted scores remain numeric contributions, independent of rating gates', () => {
  const head = assess(() => ({ headInclination: 80 }));
  assert.equal(head.score, 95);
  assert.equal(head.rating, 'suboptimal');
  const torso = assess(() => ({ chestRoll: 35 }));
  assert.equal(torso.score, 80);
});
