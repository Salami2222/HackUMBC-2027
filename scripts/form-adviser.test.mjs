import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateFormRep,
  summarizeFormReview,
  FormAnalyzer,
} from '../src/exercise/form-quality.ts';
import { FormAdviser, blendFormAdvice } from '../src/exercise/form-adviser.ts';
import {
  validFormReview,
  formRequest,
  parseFormAdvice,
  formMiddleware,
  metricKeys,
} from './jev-form.mjs';

function frames(change = () => ({}), step = 100, end = 3700) {
  return Array.from({ length: Math.round(end / step) + 1 }, (_, i) => {
    const ms = i * step;
    const bend =
      ms <= 1800
        ? ms / 18
        : ms <= 2000
          ? 100
          : Math.max(0, 100 - (ms - 2000) / 20);
    return {
      at: 10000 + ms,
      phase:
        ms < 1800
          ? 'descending'
          : ms <= 2000
            ? 'bottom'
            : ms < 4000
              ? 'ascending'
              : 'ready',
      values: {
        leftKnee: bend,
        rightKnee: bend,
        chestTilt: 30,
        chestRoll: 0,
        headInclination: 0,
        headRoll: 0,
        headTurn: 0,
        leftFootRoll: 0,
        rightFootRoll: 0,
        leftAnkle: 10,
        rightAnkle: 10,
        ...change(ms),
      },
    };
  });
}
const fixture = () => {
  const samples = frames();
  return summarizeFormReview(
    samples,
    evaluateFormRep(samples, 1, 100, samples.at(-1).at)
  );
};
const response = (choice = 'moderate') => ({
  answers: Object.fromEntries(
    ['symmetry', 'torso', 'head'].map((id) => [
      id,
      {
        choice,
        confidence: 0.95,
        probabilities: Object.fromEntries(
          ['none', 'moderate', 'substantial', 'uncertain'].map((k) => [
            k,
            k === choice ? 1 : 0,
          ])
        ),
      },
    ])
  ),
});
const assessment = () =>
  evaluateFormRep(
    frames(() => ({}), 100, 4000),
    1,
    100,
    14000
  );

test('form review contains only bounded scalar summaries and four factor records', () => {
  const b = fixture();
  assert.equal(validFormReview(b), true);
  assert.deepEqual(Object.keys(b.metrics).sort(), [...metricKeys].sort());
  assert.equal(b.metrics.bilateralPeakDeg, 100);
  assert.equal(b.metrics.headOutside35Ms, 0);
  assert.equal(b.metrics.currentLeftKneeDeg, 15);
  assert.ok(JSON.stringify(b).length < 2500);
  const payload = formRequest(b);
  assert.equal(payload.state.samples, undefined);
  assert.equal(payload.state.metrics.bilateralPeakDeg, 100);
  assert.equal(payload.questions.depth, undefined);
  assert.equal(Object.keys(payload.questions).length, 3);
  assert.equal(payload.state.headInclinationLimitDeg, 35);
});

test('summary uses actual timestamps, retains missing data and does not interpret null as zero', () => {
  for (const step of [50, 100]) {
    const samples = frames(() => ({ headInclination: 45 }), step);
    const b = summarizeFormReview(
      samples,
      evaluateFormRep(samples, 1, 100, 13700)
    );
    assert.equal(b.metrics.observedDurationMs, 3700);
    assert.equal(b.metrics.headOutside35Ms, 3700);
    assert.equal(b.metrics.headUpPeakDeg, 45);
  }
  const samples = frames(() => ({ headInclination: null }));
  const b = summarizeFormReview(
    samples,
    evaluateFormRep(samples, 1, 100, 13700)
  );
  assert.equal(b.metrics.leftFootRollPeakDeg, undefined);
  assert.equal(b.metrics.loweringSpeedPeakDegPerSec, undefined);
  assert.equal(b.metrics.headOutside35Ms, null);
  assert.equal(validFormReview(b), false);
});

test('review becomes available early in ascent with sufficient coverage and phase evidence', () => {
  const a = new FormAnalyzer();
  for (const f of frames()) {
    a.observe(f);
    if (f.at < 12300 || f.phase !== 'ascending')
      assert.equal(a.review(1), null);
  }
  assert.equal(validFormReview(a.review(1)), true);
  a.reset();
  assert.equal(a.review(1), null);
});

test('proxy rejects raw data, injected strings, duplicate factors and extra fields', () => {
  const b = fixture();
  for (const bad of [
    { ...b, samples: frames() },
    { ...b, notes: 'instructions' },
    { ...b, metrics: { ...b.metrics, headUpPeakDeg: 'unknown' } },
    { ...b, metrics: { ...b.metrics, sampleCount: NaN } },
    { ...b, groups: b.groups.map(() => b.groups[0]) },
    {
      ...b,
      groups: b.groups.map((g) => ({ ...g, evidence: 'arbitrary text' })),
    },
    { ...b, stage: 'descending' },
  ])
    assert.equal(validFormReview(bad), false);
  assert.throws(() => parseFormAdvice({ answers: {} }, b));
  const invalid = response();
  invalid.answers.head.probabilities.none = 1;
  assert.throws(() => parseFormAdvice(invalid, b));
});

test('five percent weighting changes numeric scores while retaining measured category gates', () => {
  const measured = assessment();
  const advice = parseFormAdvice(response(), fixture());
  const scored = blendFormAdvice(measured, advice);
  assert.equal(scored.score, 98.3); // 100 * .95 + 65 * .05 (depth stays measured)
  assert.equal(scored.jev.weight, 0.05);
  assert.equal(scored.rating, measured.rating);
  assert.equal(measured.score, 100);
  const attention = { ...measured, score: 50, rating: 'attention' };
  assert.equal(blendFormAdvice(attention, advice).rating, 'attention');
  assert.equal(
    blendFormAdvice({ ...measured, score: null, rating: 'unknown' }, advice)
      .score,
    null
  );
});

test('uncertain, stale, foreign and changed-factor advice cannot override measurements', () => {
  const measured = assessment();
  const advice = parseFormAdvice(response(), fixture());
  for (const bad of [
    null,
    { ...advice, rep: 2 },
    { ...advice, at: 8000 },
    { ...advice, at: 15000 },
    parseFormAdvice(response('uncertain'), fixture()),
  ]) {
    assert.equal(blendFormAdvice(measured, bad).score, measured.score);
    assert.equal(blendFormAdvice(measured, bad).jev.weight, 0);
  }
  for (const factor of Object.values(advice.factors)) factor.confidence = 0.5;
  assert.equal(blendFormAdvice(measured, advice).score, 100);
  const fresh = parseFormAdvice(response(), fixture());
  for (const id of Object.keys(fresh.measuredSeverities))
    fresh.measuredSeverities[id] = 1;
  assert.equal(blendFormAdvice(measured, fresh).score, 100);
});

test('adviser makes at most two requests per rep, one in flight, and ignores responses after Ready', async (t) => {
  let now = 13700;
  t.mock.method(Date, 'now', () => now);
  let calls = 0,
    resolve;
  t.mock.method(globalThis, 'fetch', async (_, opts) => {
    calls++;
    const b = JSON.parse(opts.body);
    assert.equal(b.samples, undefined);
    return new Promise((r) => {
      resolve = () =>
        r({ ok: true, json: async () => parseFormAdvice(response(), b) });
    });
  });
  const a = new FormAdviser();
  const pending = a.request(fixture());
  await a.request(fixture(), now + 600);
  assert.equal(calls, 1);
  resolve();
  await pending;
  const result = a.finalize(assessment());
  assert.equal(result.score, 98.3);
  assert.equal(result.jev.summary.schema, 'form-summary-v2');
  now += 600;
  const late = a.request({ ...fixture(), rep: 2, at: now });
  const frozen = a.finalize({ ...assessment(), rep: 2, completedAt: now });
  resolve();
  await late;
  assert.equal(a.advice, null);
  assert.equal(frozen.score, 100);
  now += 600;
  const first = a.request({ ...fixture(), rep: 3, at: now });
  resolve();
  await first;
  now += 600;
  const second = a.request({ ...fixture(), rep: 3, at: now });
  resolve();
  await second;
  now += 600;
  await a.request({ ...fixture(), rep: 3, at: now });
  assert.equal(calls, 4);
});

test('server forwards only curated summary and rejects off-origin requests', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_, opts) => {
    calls++;
    const payload = JSON.parse(opts.body);
    assert.equal(payload.state.samples, undefined);
    assert.equal(payload.state.metrics.bilateralPeakDeg, 100);
    return { ok: true, json: async () => response() };
  });
  const handler = formMiddleware(() => 'test-only');
  const makeReq = (origin) => ({
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      host: '127.0.0.1:5173',
      origin,
      'content-type': 'application/json',
    },
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(fixture());
    },
  });
  const res = {
    setHeader() {},
    end(b) {
      this.body = JSON.parse(b);
    },
  };
  await handler(makeReq('https://example.com'), res);
  assert.equal(res.statusCode, 403);
  assert.equal(calls, 0);
  await handler(makeReq('http://127.0.0.1:5173'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(res.body.factors.head.severity, 0.5);
});

test('early ascent reply survives a pending late refresh and keeps its own input snapshot', async (t) => {
  let now = 12300;
  t.mock.method(Date, 'now', () => now);
  let resolve;
  t.mock.method(globalThis, 'fetch', async (_, opts) => {
    const body = JSON.parse(opts.body);
    return new Promise((r) => {
      resolve = () =>
        r({
          ok: true,
          status: 200,
          json: async () => parseFormAdvice(response(), body),
        });
    });
  });
  const samples = frames().filter((s) => s.at <= now);
  const early = summarizeFormReview(
    samples,
    evaluateFormRep(samples, 1, 100, now)
  );
  assert.equal(early.stage, 'ascent');
  assert.equal(validFormReview(early), true);
  const a = new FormAdviser();
  const pending = a.request(early);
  now += 350;
  resolve();
  await pending;
  now = 13700;
  const refresh = a.request(fixture());
  now = 14000;
  const rep = a.finalize(assessment());
  assert.equal(rep.score, 98.3);
  assert.equal(rep.jev.attempts, 2);
  assert.equal(rep.jev.summary.at, early.at);
  resolve();
  await refresh;
  assert.equal(a.advice, null);
  assert.equal(rep.score, 98.3);
});

test('feedback retains request failures and submitted inputs without exposing credentials', async (t) => {
  t.mock.method(Date, 'now', () => 13700);
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 502,
    json: async () => ({ code: 'authentication' }),
  }));
  const a = new FormAdviser();
  await a.request(fixture());
  const rep = a.finalize(assessment());
  assert.equal(rep.score, 100);
  assert.equal(rep.jev.attempts, 1);
  assert.equal(rep.jev.httpStatus, 502);
  assert.match(rep.jev.reason, /rejected the API key/);
  assert.equal(rep.jev.summary.schema, 'form-summary-v2');
  const noRequest = new FormAdviser().finalize(assessment());
  assert.match(noRequest.jev.reason, /Not requested/);
});
