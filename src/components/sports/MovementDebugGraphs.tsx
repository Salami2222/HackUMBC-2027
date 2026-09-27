import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMeasurements } from '@/measurement/MeasurementProvider';
import {
  ACCEPTABLE_DEPTH_MIN_DEG,
  HEAD_INCLINATION_LIMIT_DEG,
  HEAD_INCLINATION_LABELS,
  classifyHeadInclination,
} from '@/exercise/squat';
import {
  DebugSample,
  TraceKey,
  WINDOW_MS,
  debugPath,
  traceStats,
} from '@/measurement/angle-history';

const graphs = [
  {
    title: 'Head up / down',
    min: -120,
    max: 120,
    ticks: [120, 60, 0, -60, -120],
    thresholds: [-HEAD_INCLINATION_LIMIT_DEG, HEAD_INCLINATION_LIMIT_DEG],
    note: 'Positive = up · negative = down · zero = upright reference. Solid: head relative to the floor. Dashed: head relative to chest.',
    traces: [
      { key: 'headInclination', label: 'Head', color: '#b79aff' },
      { key: 'headPitch', label: 'Head / chest', color: '#eebd77' },
    ],
  },
  {
    title: 'Upper / lower leg angle',
    min: 0,
    max: 180,
    ticks: [180, 90, 0],
    thresholds: [ACCEPTABLE_DEPTH_MIN_DEG],
    note: 'Knee bend: 0° = straight reference. Inner-angle estimate = 180° − bend. Left and right refer to your body.',
    traces: [
      { key: 'leftKnee', label: 'Left', color: '#b79aff' },
      { key: 'rightKnee', label: 'Right', color: '#75d6d0' },
    ],
  },
] satisfies {
  title: string;
  min: number;
  max: number;
  ticks: number[];
  thresholds: number[];
  note: string;
  traces: { key: TraceKey; label: string; color: string }[];
}[];
const keys = graphs.flatMap((g) => g.traces.map((t) => t.key));
const degrees = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toFixed(1)}°`;

export function MovementDebugGraphs() {
  const state = useMeasurements();
  const history = useRef<DebugSample[]>([]);
  const reference = useRef<number | null>(null);
  const lastSeen = useRef(0);
  const now = Date.now();
  const reading = (key: TraceKey) =>
    state.measurements.find((m) => m.id === key);

  useEffect(() => {
    if (reference.current !== state.referenceCapturedAt) {
      history.current = [];
      lastSeen.current = 0;
      reference.current = state.referenceCapturedAt;
    }
    history.current = history.current.filter(
      (sample) => now - sample.time <= WINDOW_MS
    );
    if (
      !state.referenceReady ||
      !state.sampleTime ||
      state.sampleTime === lastSeen.current
    )
      return;
    lastSeen.current = state.sampleTime;
    const values = Object.fromEntries(
      keys.map((key) => [key, reading(key)?.value ?? null])
    ) as DebugSample['values'];
    const last = history.current.at(-1);
    const availabilityChanged =
      last &&
      keys.some(
        (key) => (last.values[key] === null) !== (values[key] === null)
      );
    if (last && state.sampleTime - last.time < 90 && !availabilityChanged)
      return;
    history.current.push({ time: state.sampleTime, values });
    history.current = history.current.slice(-220);
  }, [state]);

  const samples =
    state.referenceReady && reference.current === state.referenceCapturedAt
      ? history.current
      : [];
  return (
    <section
      className="imu-angle-graphs movement-debug-graphs"
      aria-label="Movement debugging graphs"
    >
      <div className="measurement-actions">
        <strong>Live angle debugging</strong>
        <Link to="/calibration">
          {state.referenceReady ? 'Recalibrate' : 'Capture upright reference'}
        </Link>
      </div>
      <p className="imu-graph-note">
        Last 10 seconds ·{' '}
        {state.referenceReady
          ? 'Reference captured'
          : 'Waiting for calibrated reference'}{' '}
        · {state.roles.filter((r) => !r.reason).length}/{state.roles.length}{' '}
        measurement nodes ready · Feed age:{' '}
        {state.sampleTime ? `${Math.max(0, now - state.sampleTime)} ms` : '—'}
      </p>
      <div className="imu-graph-grid">
        {graphs.map((graph) => (
          <article className="imu-angle-graph" key={graph.title}>
            <div className="imu-graph-heading">
              <h2>{graph.title}</h2>
            </div>
            <div className="imu-graph-values">
              {graph.traces.map((trace) => (
                <span key={trace.key}>
                  <i style={{ background: trace.color }} />
                  {trace.label}
                  <strong>{degrees(reading(trace.key)?.value)}</strong>
                </span>
              ))}
            </div>
            <svg
              viewBox="0 0 400 160"
              role="img"
              aria-label={`${graph.title} over the last ten seconds`}
            >
              {graph.ticks.map((value) => {
                const y =
                  16 + ((graph.max - value) / (graph.max - graph.min)) * 120;
                return (
                  <g key={value}>
                    <text x="33" y={y + 3} textAnchor="end">
                      {value}°
                    </text>
                    <line x1="40" x2="388" y1={y} y2={y} />
                  </g>
                );
              })}
              {graph.traces.map((trace, index) => (
                <path
                  key={trace.key}
                  d={debugPath(samples, trace.key, now, graph.min, graph.max)}
                  fill="none"
                  stroke={trace.color}
                  strokeWidth="2"
                  strokeDasharray={index ? '5 3' : undefined}
                />
              ))}
              {graph.thresholds.map((value) => {
                const y =
                  16 + ((graph.max - value) / (graph.max - graph.min)) * 120;
                return (
                  <g key={value}>
                    <line
                      x1="40"
                      x2="388"
                      y1={y}
                      y2={y}
                      style={{ stroke: '#eebd77' }}
                      strokeDasharray="3 4"
                    />
                    <text x="388" y={y - 4} textAnchor="end">
                      {value}° target
                    </text>
                  </g>
                );
              })}
              <text x="40" y="156">
                −10s
              </text>
              <text x="388" y="156" textAnchor="end">
                Now
              </text>
            </svg>
            <p className="imu-graph-note">{graph.note}</p>
            {graph.traces[0].key === 'headInclination' && (
              <p className="imu-graph-note">
                {
                  HEAD_INCLINATION_LABELS[
                    classifyHeadInclination(
                      state.referenceReady
                        ? reading('headInclination')?.value
                        : null
                    )
                  ]
                }{' '}
                · target range ±{HEAD_INCLINATION_LIMIT_DEG}°
              </p>
            )}
            <dl className="debug-stats">
              {graph.traces.map((trace) => {
                const stat = traceStats(samples, trace.key, now);
                const metric = reading(trace.key);
                return (
                  <div key={trace.key}>
                    <dt>{trace.label}</dt>
                    <dd>
                      {metric?.reason ?? 'Live'} · min {degrees(stat.min)} · max{' '}
                      {degrees(stat.max)} · {stat.count} plotted samples
                      {trace.key.endsWith('Knee') && (
                        <>
                          {' '}
                          · inner angle{' '}
                          {degrees(
                            metric?.value == null ? null : 180 - metric.value
                          )}
                        </>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </article>
        ))}
      </div>
      <p className="imu-graph-note">
        Angle targets use your team's testing thresholds, not an overall form
        verdict or eye-gaze measurement. Gaps mean unavailable data.
      </p>
    </section>
  );
}
