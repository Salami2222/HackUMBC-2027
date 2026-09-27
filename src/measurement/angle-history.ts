export const WINDOW_MS = 10000;
export type TraceKey = 'headInclination' | 'headPitch' | 'leftKnee' | 'rightKnee';
export type DebugSample = { time: number; values: Record<TraceKey, number | null> };

export function debugPath(
  samples: DebugSample[],
  key: TraceKey,
  now: number,
  min: number,
  max: number
) {
  let previous: DebugSample | null = null;
  const parts: string[] = [];
  for (const sample of samples) {
    if (sample.time < now - WINDOW_MS || sample.time > now) continue;
    const value = sample.values[key];
    if (value === null || !Number.isFinite(value)) {
      previous = null;
      continue;
    }
    const joined =
      previous &&
      sample.time - previous.time <= 500 &&
      Math.abs(value - previous.values[key]!) < 180;
    const x = 40 + ((sample.time - now + WINDOW_MS) / WINDOW_MS) * 348;
    const y = 16 + ((max - value) / (max - min)) * 120;
    parts.push(`${joined ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    previous = sample;
  }
  return parts.join(' ');
}

export function traceStats(samples: DebugSample[], key: TraceKey, now: number) {
  const values = samples
    .filter((s) => s.time >= now - WINDOW_MS && s.time <= now)
    .map((s) => s.values[key])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}
