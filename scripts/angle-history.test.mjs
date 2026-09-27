import test from 'node:test';
import assert from 'node:assert/strict';
import { debugPath, traceStats } from '../src/measurement/angle-history.ts';
const sample = (time, value) => ({
  time,
  values: {
    headInclination: value,
    headPitch: value,
    leftKnee: value,
    rightKnee: value,
  },
});
test('debug traces break on missing samples and long gaps', () => {
  const path = debugPath(
    [
      sample(1000, 0),
      sample(1100, 10),
      sample(1200, null),
      sample(1300, 20),
      sample(2200, 30),
    ],
    'leftKnee',
    2200,
    0,
    180
  );
  assert.equal((path.match(/M/g) || []).length, 3);
  assert.equal((path.match(/L/g) || []).length, 1);
});
test('stats count only valid values inside the displayed window', () => {
  const samples = [
    sample(500, 90),
    sample(11000, -20),
    sample(11100, null),
    sample(11200, 15),
    sample(13000, 100),
  ];
  assert.deepEqual(traceStats(samples, 'headInclination', 12000), {
    count: 2,
    min: -20,
    max: 15,
  });
  assert.deepEqual(traceStats([], 'leftKnee', 12000), {
    count: 0,
    min: null,
    max: null,
  });
});
