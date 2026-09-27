import { readFileSync } from 'node:fs';
import { formMiddleware } from './jev-form.mjs';
import { localRequestAllowed } from './tracking-service-plugin.mjs';

const choices = ['ready', 'descending', 'bottom', 'ascending', 'uncertain'];
export function validWindow(body) {
  return (
    body &&
    choices.includes(body.phase) &&
    Array.isArray(body.samples) &&
    body.samples.length >= 4 &&
    body.samples.length <= 40 &&
    body.samples.every(
      (s, i, all) =>
        s &&
        Number.isFinite(s.at) &&
        (i === 0 || s.at > all[i - 1].at) &&
        [s.left, s.right].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 180
        ) &&
        (s.headHeight === null ||
          (Number.isFinite(s.headHeight) &&
            s.headHeight > 0.2 &&
            s.headHeight < 2.8))
    ) &&
    body.samples.at(-1).at - body.samples[0].at <= 2200
  );
}
export function parseAdvice(data, at) {
  const answer = data?.answers?.phase;
  const probability = answer?.probabilities?.[answer?.choice];
  if (
    !choices.includes(answer?.choice) ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1 ||
    !Number.isFinite(answer?.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1
  )
    throw new Error('Invalid advice');
  return {
    at,
    phase: answer.choice,
    probability,
    confidence: answer.confidence,
  };
}

export function jevPlugin(env = {}) {
  let busy = false,
    lastRequest = 0;
  const key = () => {
    try {
      return (
        process.env.TYPESAFE_API_KEY ||
        env.TYPESAFE_API_KEY ||
        readFileSync(
          process.env.KINETIQ_JEV_KEY_FILE || env.KINETIQ_JEV_KEY_FILE,
          'utf8'
        )
      ).trim();
    } catch {
      return '';
    }
  };
  const middleware = async (req, res) => {
    const reply = (code, body) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (!localRequestAllowed(req))
      return reply(403, { error: 'Local access only' });
    if (req.method === 'GET') return reply(200, { configured: Boolean(key()) });
    if (req.method !== 'POST')
      return reply(405, { error: 'Method not allowed' });
    if (
      req.headers.origin !== `http://${req.headers.host}` ||
      !req.headers['content-type']?.startsWith('application/json')
    )
      return reply(403, { error: 'Same-origin JSON required' });
    const apiKey = key();
    if (!apiKey) return reply(503, { error: 'Jev not configured' });
    if (busy || Date.now() - lastRequest < 250)
      return reply(429, { error: 'Advice already pending' });
    busy = true;
    lastRequest = Date.now();
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 16000)
          return reply(413, { error: 'Window too large' });
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: 'Invalid window' });
      }
      if (!validWindow(body)) return reply(400, { error: 'Invalid window' });
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        signal: AbortSignal.timeout(1500),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'jev-1.13.0',
          state: {
            currentPhase: body.phase,
            samples: body.samples.map(({ at, left, right, headHeight }) => ({
              at,
              left,
              right,
              headHeight,
            })),
          },
          questions: {
            phase: {
              type: 'choice',
              instructions:
                'Classify the current squat movement from the latest trend in this timestamped window. Knee flexion is degrees, zero when standing. Head height is estimated metres above the floor, not an independent sensor. Both knees lead; height supports. Pausing halfway down is not bottom. Do not evaluate safety or depth quality. Choose uncertain for conflicting evidence.',
              criteria: {
                ready: 'Both knees near straight and stable.',
                descending:
                  'Both knee bends increasing, usually head falling; a pause in descent can retain this phase.',
                bottom:
                  'A sustained turning point from increasing knee bend to decreasing knee bend.',
                ascending: 'Both knee bends decreasing, usually head rising.',
                uncertain: 'Insufficient or contradictory motion evidence.',
              },
            },
          },
        }),
      });
      if (!response.ok)
        return reply(502, {
          error: 'Jev unavailable; local detection continues',
        });
      return reply(
        200,
        parseAdvice(await response.json(), body.samples.at(-1).at)
      );
    } catch {
      return reply(502, {
        error: 'Jev unavailable; local detection continues',
      });
    } finally {
      busy = false;
    }
  };
  const review = formMiddleware(key);
  return {
    name: 'kinetiq-jev-adviser',
    configureServer(server) {
      server.middlewares.use('/api/squat-phase', middleware);
      server.middlewares.use('/api/squat-form', review);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/squat-phase', middleware);
      server.middlewares.use('/api/squat-form', review);
    },
  };
}
