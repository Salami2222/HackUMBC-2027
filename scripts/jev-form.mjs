import { localRequestAllowed } from './tracking-service-plugin.mjs';

export const metricKeys = [
  'leftKneeInwardPeakDeg',
  'rightKneeInwardPeakDeg',
  'leftKneeInwardOver8Ms',
  'rightKneeInwardOver8Ms',
  'leftKneeInwardAtLeast18Ms',
  'rightKneeInwardAtLeast18Ms',
  'observedDurationMs',
  'descentObservedMs',
  'bottomObservedMs',
  'ascentObservedMs',
  'sampleCount',
  'largestGapMs',
  'leftKneePeakDeg',
  'rightKneePeakDeg',
  'bilateralPeakDeg',
  'currentLeftKneeDeg',
  'currentRightKneeDeg',
  'kneeDifferencePeakDeg',
  'kneeDifferenceOver12Ms',
  'chestSideTiltPeakDeg',
  'chestSideTiltOver10Ms',
  'chestForwardTiltPeakDeg',
  'chestDropDuringRisePeakDeg',
  'headUpPeakDeg',
  'headDownPeakDeg',
  'headOutside35Ms',
  'headRollPeakDeg',
  'headTurnPeakDeg',
];
const ids = ['collapse', 'symmetry', 'torso', 'depth', 'head'];
const factors = ids.filter((id) => !['depth', 'collapse'].includes(id));
const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
const exact = (o, keys) =>
  o &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  Object.keys(o).length === keys.length &&
  keys.every((k) => Object.hasOwn(o, k));
export function validFormReview(b) {
  return (
    exact(b, [
      'schema',
      'rep',
      'at',
      'stage',
      'reference',
      'metrics',
      'groups',
    ]) &&
    b.schema === 'form-summary-v3' &&
    ['ascent', 'late-ascent'].includes(b.stage) &&
    b.reference === 'upright-relative' &&
    Number.isInteger(b.rep) &&
    b.rep >= 1 &&
    b.rep <= 8 &&
    Number.isFinite(b.at) &&
    b.at > 0 &&
    exact(b.metrics, metricKeys) &&
    metricKeys.every(
      (k) =>
        b.metrics[k] === null ||
        (Number.isFinite(b.metrics[k]) && Math.abs(b.metrics[k]) <= 60000)
    ) &&
    b.metrics.observedDurationMs >= 700 &&
    b.metrics.observedDurationMs <= 30500 &&
    b.metrics.sampleCount >= 8 &&
    b.metrics.sampleCount <= 6000 &&
    Number.isFinite(b.metrics.currentLeftKneeDeg) &&
    Number.isFinite(b.metrics.currentRightKneeDeg) &&
    b.metrics.currentLeftKneeDeg >= 0 &&
    b.metrics.currentRightKneeDeg >= 0 &&
    b.metrics.currentLeftKneeDeg <= 180 &&
    b.metrics.currentRightKneeDeg <= 180 &&
    b.metrics.descentObservedMs > 0 &&
    b.metrics.bottomObservedMs > 0 &&
    b.metrics.ascentObservedMs > 0 &&
    Array.isArray(b.groups) &&
    b.groups.length === ids.length &&
    new Set(b.groups.map((g) => g?.id)).size === ids.length &&
    b.groups.every(
      (g) =>
        exact(g, ['id', 'coverage', 'severity', 'issueMs']) &&
        ids.includes(g.id) &&
        unit(g.coverage) &&
        g.coverage >= 0.85 &&
        unit(g.severity) &&
        Number.isFinite(g.issueMs) &&
        g.issueMs >= 0 &&
        g.issueMs <= 31000
    )
  );
}
const rubrics = {
  symmetry:
    'Bilateral knee-bend asymmetry: 12 degrees begins the deviation range, 30 is substantial. This does not measure inward knee collapse.',
  torso:
    'Sideways chest tilt: 10 to 25 degrees. Additional chest drop of 8 to 20 degrees over approximately 300ms while knees extend is relevant. Ordinary forward lean alone is not an issue.',
  head: 'Head inclination outside plus/minus 35 degrees begins the deviation range; 55 is substantial. Sideways roll 15 to 35 degrees and head/chest turn 30 to 60. Never move the 35-degree target or treat a brief spike as sustained.',
};
export function formRequest(body) {
  return {
    model: 'jev-1.13.0',
    state: {
      schema: body.schema,
      stage: body.stage,
      reference: body.reference,
      units:
        'Angles are degrees relative to the upright reference; time is milliseconds; knee bend is zero upright. Null is unknown, never zero.',
      limitations:
        'Ascent partial rep, not yet Ready. Only summarized estimated movement is available. No raw samples. Coverage is usable-data fraction, not probability. These are experimental targets, not injury predictions. Rep speed, tempo and foot position are excluded from scoring. Do not infer them or penalize phase durations. Inward knee deviation is an experimental signed thigh/shin estimate, not a validated diagnosis; it remains measurement-only, as does depth. Its penalty range is 8 to 20 degrees with a 350ms persistence gate while that knee is bent at least 20 degrees. A same-knee run at least 18 degrees for 600ms plus a measured score below 65 may flag Needs attention. Per-side duration totals do not prove a continuous run. Do not replace this estimate, diagnose knee collapse or infer hip/spine posture, foot pressure, load or bracing. Peaks alone do not establish sustained problems; issueMs is accumulated time in runs of at least 350ms. Measured severities use a square-root ramp after persistence filtering so moderate deviations contribute. No independent sensor corroboration is available.',
      depthTargetDeg: 98,
      headInclinationLimitDeg: 35,
      metrics: Object.fromEntries(metricKeys.map((k) => [k, body.metrics[k]])),
      measuredFactors: body.groups.map(
        ({ id, coverage, severity, issueMs }) => ({
          id,
          coverage,
          severity,
          issueMs,
        })
      ),
    },
    questions: Object.fromEntries(
      factors.map((id) => [
        id,
        {
          type: 'choice',
          instructions: `Assess only ${id} using the supplied curated measurements and their persistence. ${rubrics[id]} Use the summaries to interpret consistency and context, not to invent missing evidence. When summaries cannot distinguish competing interpretations, choose uncertain.`,
          criteria: {
            none: 'No supported sustained deviation in this factor.',
            moderate:
              'Supported sustained deviation of moderate magnitude in this factor.',
            substantial:
              'Supported sustained deviation near or beyond the substantial end of the configured range.',
            uncertain:
              'Insufficient or conflicting evidence to assess this factor.',
          },
        },
      ])
    ),
  };
}
export function parseFormAdvice(data, body) {
  const parsed = {};
  for (const id of factors) {
    const a = data?.answers?.[id];
    const p = a?.probabilities;
    const options = ['none', 'moderate', 'substantial', 'uncertain'];
    if (
      !a ||
      !options.includes(a.choice) ||
      !unit(a.confidence) ||
      !exact(p, options) ||
      !options.every((k) => unit(p[k])) ||
      Math.abs(Object.values(p).reduce((s, v) => s + v, 0) - 1) > 0.02
    )
      throw new Error('Invalid form advice');
    const known = p.none + p.moderate + p.substantial;
    parsed[id] = {
      severity: known > 0 ? (p.moderate * 0.5 + p.substantial) / known : 0,
      confidence: a.confidence,
      probability: p[a.choice],
      uncertain: a.choice === 'uncertain',
    };
  }
  return {
    rep: body.rep,
    at: body.at,
    factors: parsed,
    measuredSeverities: Object.fromEntries(
      body.groups.map((g) => [g.id, g.severity])
    ),
  };
}
export function formMiddleware(key) {
  let busy = false,
    lastRequest = 0;
  return async (req, res) => {
    const reply = (code, body) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (!localRequestAllowed(req))
      return reply(403, { error: 'Local access only' });
    if (req.method !== 'POST') return reply(405, { error: 'POST required' });
    if (
      req.headers.origin !== `http://${req.headers.host}` ||
      !req.headers['content-type']?.startsWith('application/json')
    )
      return reply(403, { error: 'Same-origin JSON required' });
    const apiKey = key();
    if (!apiKey)
      return reply(503, {
        error: 'Jev not configured',
        code: 'notConfigured',
      });
    if (busy || Date.now() - lastRequest < 500)
      return reply(429, { error: 'Review already pending' });
    busy = true;
    lastRequest = Date.now();
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8000)
          return reply(413, { error: 'Summary too large' });
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, {
          error: 'Invalid summary',
          code: 'invalidSummary',
        });
      }
      if (!validFormReview(body))
        return reply(400, {
          error: 'Invalid summary',
          code: 'invalidSummary',
        });
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formRequest(body)),
      });
      if (!response.ok)
        return reply(502, {
          error: 'Jev review unavailable',
          code: [401, 403].includes(response.status)
            ? 'authentication'
            : response.status === 429
              ? 'rateLimited'
              : 'upstream',
          upstreamStatus: response.status,
        });
      return reply(200, parseFormAdvice(await response.json(), body));
    } catch (error) {
      return reply(502, {
        error: 'Jev review unavailable',
        code:
          error.name === 'TimeoutError'
            ? 'timeout'
            : error.message === 'Invalid form advice'
              ? 'invalidResponse'
              : 'upstream',
      });
    } finally {
      busy = false;
    }
  };
}
