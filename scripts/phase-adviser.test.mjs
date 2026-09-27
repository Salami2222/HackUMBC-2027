import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhaseAdviser } from '../src/exercise/phase-adviser.ts';
import { validWindow, parseAdvice, jevPlugin } from './jev-plugin.mjs';

const windowAt = (at) =>
  Array.from({ length: 11 }, (_, i) => ({
    at: at - 1000 + i * 100,
    left: i * 7,
    right: i * 7,
    headHeight: 1.7 - i * 0.03,
  }));
const answerAt = (at) => ({
  at,
  phase: 'descending',
  probability: 0.92,
  confidence: 0.9,
});

test('single flight and rate limit prevent queued or duplicated advice', async (t) => {
  const adviser = new PhaseAdviser();
  let calls = 0,
    resolve;
  const at = Date.now();
  t.mock.method(globalThis, 'fetch', () => {
    calls++;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const pending = adviser.request(windowAt(at), 'descending', at);
  await adviser.request(windowAt(at), 'descending', at + 300);
  assert.equal(calls, 1);
  resolve({ ok: true, json: async () => answerAt(at) });
  await pending;
  assert.equal(adviser.advice.phase, 'descending');
  await adviser.request(windowAt(at), 'descending', at + 100);
  assert.equal(calls, 1);
});

test('late advice and answers from before reset are discarded', async (t) => {
  const adviser = new PhaseAdviser();
  let resolve;
  const at = Date.now();
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const pending = adviser.request(windowAt(at), 'descending', at);
  adviser.reset();
  resolve({ ok: true, json: async () => answerAt(at) });
  await pending;
  assert.equal(adviser.advice, null);
  const stale = at - 2000;
  const next = adviser.request(windowAt(stale), 'ascending', at + 1000);
  resolve({ ok: true, json: async () => answerAt(stale) });
  await next;
  assert.equal(adviser.advice, null);
  assert.match(adviser.status, /delayed/);
});

test('unavailable service backs off and malformed confidence is rejected', async (t) => {
  const adviser = new PhaseAdviser();
  let calls = 0;
  const at = Date.now();
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({ ...answerAt(at), probability: 9 }),
    };
  });
  await adviser.request(windowAt(at), 'descending', at);
  assert.equal(adviser.advice, null);
  assert.match(adviser.status, /unavailable/);
  await adviser.request(windowAt(at), 'descending', at + 500);
  assert.equal(calls, 1);
});

test('proxy restricts windows and validates returned probabilities', () => {
  const body = { phase: 'descending', samples: windowAt(Date.now()) };
  assert.equal(validWindow(body), true);
  for (const value of [
    null,
    {},
    { ...body, phase: 'override' },
    { ...body, samples: [{ at: 0, left: NaN, right: 0 }] },
    { ...body, samples: [...body.samples].reverse() },
  ])
    assert.ok(!validWindow(value));
  assert.throws(() =>
    parseAdvice(
      {
        answers: {
          phase: {
            choice: 'descending',
            probabilities: { descending: 2 },
            confidence: 1,
          },
        },
      },
      1
    )
  );
  assert.equal(
    parseAdvice(
      {
        answers: {
          phase: {
            choice: 'ascending',
            probabilities: { ascending: 0.9 },
            confidence: 0.8,
          },
        },
      },
      123
    ).at,
    123
  );
});

test('proxy rejects off-origin callers before reading a key or calling Jev', async () => {
  let handler;
  jevPlugin().configureServer({
    middlewares: {
      use: (route, fn) => {
        if (route === '/api/squat-phase') handler = fn;
      },
    },
  });
  const res = {
    statusCode: 0,
    setHeader() {},
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  await handler(
    {
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:5173', origin: 'https://example.com' },
    },
    res
  );
  assert.equal(res.statusCode, 403);
});
