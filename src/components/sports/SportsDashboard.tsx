import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Vector3 } from 'three';
import {
  SkeletonPreviewView,
  SkeletonVisualizerWidget,
} from '@/components/widgets/SkeletonVisualizerWidget';
import { calculateBaseline, ExerciseBaseline } from '@/analysis/baseline';
import { compareToBaseline, consistencyScore } from '@/analysis/comparison';
import { summary } from '@/analysis/metrics';
import {
  MockExerciseProvider,
  mockFrame,
  SESSION_REPS,
  WARMUP_REPS,
} from '@/analysis/mockExerciseStream';
import { mockSkeleton } from '@/analysis/mockSkeleton';
import { Exercise, ExerciseRep } from '@/analysis/types';
import './SportsDashboard.scss';

type ChartMetric = 'formScore' | 'depth' | 'torsoLean' | 'symmetry';
const TRACKERS = [
  'Chest',
  'Waist',
  'Hip',
  'Left upper leg',
  'Right upper leg',
  'Left lower leg',
  'Right lower leg',
  'Left foot',
  'Right foot',
  'Left arm',
  'Right arm',
];

const CHARTS: Record<
  ChartMetric,
  { label: string; unit: string; min: number; max: number }
> = {
  formScore: { label: 'Consistency', unit: '', min: 0, max: 100 },
  depth: { label: 'Depth', unit: '%', min: 75, max: 105 },
  torsoLean: { label: 'Torso lean', unit: '°', min: 0, max: 50 },
  symmetry: { label: 'Knee symmetry', unit: '°', min: 0, max: 10 },
};

function format(value: number, digits = 0) {
  return value.toFixed(digits);
}

function Chart({ reps, metric }: { reps: ExerciseRep[]; metric: ChartMetric }) {
  const config = CHARTS[metric];
  const value = (rep: ExerciseRep) =>
    metric === 'symmetry'
      ? Math.abs(rep.leftKneeAngle - rep.rightKneeAngle)
      : rep[metric];
  const x = (index: number) => 44 + index * (714 / 9);
  const y = (score: number) =>
    183 - ((score - config.min) / (config.max - config.min)) * 130;
  const points = reps
    .map((rep, index) => `${x(index)},${y(value(rep))}`)
    .join(' ');
  return (
    <div
      className="sports-chart"
      role="img"
      aria-label={`${config.label} across ${reps.length} completed reps`}
    >
      <svg viewBox="0 0 800 225" preserveAspectRatio="none">
        {[0, 1, 2, 3].map((line) => {
          const val = config.max - (line * (config.max - config.min)) / 3;
          return (
            <g key={line}>
              <line
                x1="44"
                x2="758"
                y1={y(val)}
                y2={y(val)}
                className="chart-grid"
              />
              <text x="0" y={y(val) + 4} className="chart-label">
                {format(val)}
                {config.unit}
              </text>
            </g>
          );
        })}
        {reps.length > 1 && <polyline points={points} className="chart-line" />}
        {reps.map((rep, index) => (
          <g key={rep.rep}>
            <circle
              cx={x(index)}
              cy={y(value(rep))}
              r="5"
              className="chart-point"
            />
            <text
              x={x(index)}
              y="214"
              textAnchor="middle"
              className="chart-label"
            >
              {rep.rep}
            </text>
          </g>
        ))}
      </svg>
      {!reps.length && (
        <div className="chart-empty">Complete a rep to begin the trend</div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="sports-metric">
      <span className="metric-label">{label}</span>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      {note && <span className="metric-note">{note}</span>}
    </div>
  );
}

export function SportsDashboard() {
  const provider = useMemo(() => new MockExerciseProvider(), []);
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [frame, setFrame] = useState(() =>
    mockFrame('squat', 0, 0, 'warmup', WARMUP_REPS)
  );
  const [warmupReps, setWarmupReps] = useState<ExerciseRep[]>([]);
  const [trainingReps, setTrainingReps] = useState<ExerciseRep[]>([]);
  const [baseline, setBaseline] = useState<ExerciseBaseline | null>(null);
  const baselineRef = useRef<ExerciseBaseline | null>(null);
  const [session, setSession] = useState<
    'ready' | 'warmup' | 'warmupComplete' | 'training' | 'trainingComplete'
  >('ready');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('formScore');
  const [calibration, setCalibration] = useState<number | 'complete' | null>(
    null
  );
  const [trackersOpen, setTrackersOpen] = useState(false);
  const view = useRef<SkeletonPreviewView | null>(null);
  const bones = useMemo(() => mockSkeleton(frame), [frame]);
  const latest = trainingReps.at(-1);
  const comparison =
    baseline && latest ? compareToBaseline(latest, baseline) : null;
  const report = summary(trainingReps, baseline);
  const showingWarmup =
    session === 'ready' || session === 'warmup' || session === 'warmupComplete';
  const completedReps = showingWarmup ? warmupReps.length : trainingReps.length;
  const targetReps = showingWarmup ? WARMUP_REPS : SESSION_REPS;
  const displayedScore = showingWarmup
    ? warmupReps.at(-1)?.formScore
    : latest?.formScore;

  useEffect(() => {
    const unsubscribe = provider.subscribe((event) => {
      if (event.type === 'frame') setFrame(event.frame);
      if (event.type === 'rep') {
        if (event.phase === 'warmup') {
          setWarmupReps((current) => [...current, event.rep]);
        } else if (baselineRef.current) {
          const result = compareToBaseline(event.rep, baselineRef.current);
          setTrainingReps((current) => [
            ...current,
            { ...event.rep, formScore: consistencyScore(result) },
          ]);
        }
      }
      if (event.type === 'complete') {
        setSession(
          event.phase === 'warmup' ? 'warmupComplete' : 'trainingComplete'
        );
      }
    });
    return () => {
      unsubscribe();
      provider.stop();
    };
  }, [provider]);

  useEffect(() => {
    if (
      session !== 'warmupComplete' ||
      warmupReps.length !== WARMUP_REPS ||
      baseline
    )
      return;
    const personalBaseline = calculateBaseline(warmupReps);
    baselineRef.current = personalBaseline;
    setBaseline(personalBaseline);
  }, [session, warmupReps, baseline]);

  useEffect(() => {
    if (calibration === null || calibration === 'complete') return;
    const timer = setTimeout(
      () => setCalibration(calibration === 1 ? 'complete' : calibration - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [calibration]);

  const reset = (mode = exercise) => {
    provider.stop();
    baselineRef.current = null;
    setWarmupReps([]);
    setTrainingReps([]);
    setBaseline(null);
    setFrame(mockFrame(mode, 0, 0, 'warmup', WARMUP_REPS));
    setSession('ready');
    setChartMetric('formScore');
  };

  const startWarmup = () => {
    reset();
    setSession('warmup');
    provider.start({ exercise, phase: 'warmup', targetReps: WARMUP_REPS });
  };

  const startTraining = () => {
    if (!baseline || baseline.exercise !== exercise || session === 'warmup')
      return;
    setTrainingReps([]);
    setFrame(mockFrame(exercise, 0, 0, 'training', SESSION_REPS));
    setSession('training');
    provider.start({ exercise, phase: 'training', targetReps: SESSION_REPS });
  };

  const setView = (position: Vector3) => {
    if (!view.current) return;
    view.current.camera.position.copy(position);
    view.current.controls.update();
  };

  const fromBaseline = (value: number, digits: number, unit: string) =>
    `${value >= 0 ? '+' : ''}${format(value, digits)}${unit} from baseline`;

  return (
    <div className="sports-app">
      <header className="sports-header">
        <div className="sports-brand">
          <div className="brand-mark">
            M<span>•</span>
          </div>
          <div>
            <strong>MOTIONLAB</strong>
            <small>PERFORMANCE ANALYSIS</small>
          </div>
        </div>
        <div className="sports-header-center">
          <span className="header-divider" />
          <span>Movement intelligence</span>
          <span className="header-divider" />
        </div>
        <div className="sports-header-right">
          <span className="live-dot" /> MOCK DATA{' '}
          <Link to="/slimevr">SLIMEVR HOME ↗</Link>
        </div>
      </header>

      <main className="sports-content">
        <div className="sports-heading">
          <div>
            <div className="eyebrow">
              TRAINING SESSION <span> / </span> 001
            </div>
            <h1>Movement overview</h1>
            <p>Real time biomechanics, built on SlimeVR motion tracking.</p>
          </div>
          <div className="sports-controls">
            <label className="exercise-select">
              EXERCISE
              <select
                value={exercise}
                onChange={(event) => {
                  const mode = event.target.value as Exercise;
                  setExercise(mode);
                  reset(mode);
                }}
              >
                <option value="squat">Squat</option>
                <option value="deadlift">Deadlift</option>
              </select>
            </label>
            <button
              className="secondary-button"
              onClick={() => setCalibration(3)}
            >
              Calibrate
            </button>
            <button className="secondary-button" onClick={() => reset()}>
              Reset
            </button>
            <button
              className={baseline ? 'secondary-button' : 'primary-button'}
              onClick={startWarmup}
              disabled={session === 'warmup'}
            >
              {session === 'warmup'
                ? 'Warm-Up in progress'
                : baseline
                  ? 'Redo Warm-Up'
                  : 'Start Warm-Up'}
            </button>
            <button
              className="primary-button"
              onClick={startTraining}
              disabled={
                !baseline || session === 'warmup' || session === 'training'
              }
            >
              {session === 'training'
                ? 'Training in progress'
                : 'Start Training Session'}{' '}
              <span>↗</span>
            </button>
          </div>
        </div>

        <section className="sports-hero">
          <div className="sports-panel viewport-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">01 / LIVE MOVEMENT</span>
                <h2>Skeleton tracking</h2>
              </div>
              <span className="panel-tag">SLIMEVR VISUALIZER</span>
            </div>
            <div className="sports-viewport">
              <SkeletonVisualizerWidget
                bonesOverride={bones}
                onInit={(context) => {
                  view.current =
                    context.addView({
                      left: 0,
                      bottom: 0,
                      width: 1,
                      height: 1,
                      position: new Vector3(2.5, 1.9, -2.8),
                      onHeightChange(v, height) {
                        v.controls.target.set(0, height / 2.2, 0);
                        v.camera.zoom = 1 / (Math.max(1, height) / 1.55);
                        v.camera.updateProjectionMatrix();
                      },
                    }) ?? null;
                }}
              />
              <div className="viewport-status">
                <span className="live-dot" />{' '}
                {session === 'warmup'
                  ? 'WARM-UP IN PROGRESS'
                  : session === 'training'
                    ? 'CAPTURING TRAINING MOTION'
                    : 'MOCK TRACKING READY'}
              </div>
              <div className="viewport-axis">
                Y ↑ <span>X →</span>
              </div>
            </div>
            <div className="viewport-footer">
              <div>
                <span className="status-pulse" /> 11 / 11 TRACKERS SIMULATED
              </div>
              <div className="view-buttons">
                <button onClick={() => setView(new Vector3(0, 1.3, -4))}>
                  FRONT
                </button>
                <button onClick={() => setView(new Vector3(4, 1.3, 0))}>
                  SIDE
                </button>
                <button onClick={() => setView(new Vector3(2.5, 1.9, -2.8))}>
                  3D
                </button>
              </div>
            </div>
          </div>

          <div className="sports-panel metrics-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">02 / PERFORMANCE</span>
                <h2>Live metrics</h2>
              </div>
              <span className="panel-tag">{exercise.toUpperCase()}</span>
            </div>
            <div className="rep-banner">
              <div>
                <span>{showingWarmup ? 'WARM-UP REPS' : 'TRAINING REPS'}</span>
                <strong>
                  {completedReps.toString().padStart(2, '0')}
                  <em> / {targetReps}</em>
                </strong>
              </div>
              <div className="rep-progress">
                <div
                  style={{ width: `${(completedReps / targetReps) * 100}%` }}
                />
              </div>
            </div>
            <div className="metrics-grid">
              <Metric
                label="LEFT KNEE"
                value={format(frame.leftKneeAngle)}
                unit="°"
                note="Joint angle"
              />
              <Metric
                label="RIGHT KNEE"
                value={format(frame.rightKneeAngle)}
                unit="°"
                note="Joint angle"
              />
              <Metric
                label={exercise === 'squat' ? 'HIP ANGLE' : 'HIP HINGE'}
                value={format(frame.hipAngle)}
                unit="°"
                note="Joint angle"
              />
              <Metric
                label="TORSO LEAN"
                value={format(frame.torsoLean, 1)}
                unit="°"
                note="Forward angle"
              />
              <Metric
                label={exercise === 'squat' ? 'SQUAT DEPTH' : 'LOCKOUT'}
                value={
                  exercise === 'squat'
                    ? format(frame.depth)
                    : frame.lockout
                      ? 'Yes'
                      : 'No'
                }
                unit={exercise === 'squat' ? '%' : ''}
                note={
                  exercise === 'squat' ? 'Target range' : 'Current position'
                }
              />
              <Metric
                label="REP DURATION"
                value={format(frame.repDuration, 2)}
                unit="s"
                note="Cycle time"
              />
            </div>
            <div className="score-row">
              <div>
                <span>
                  {showingWarmup
                    ? 'WARM-UP MOCK SCORE'
                    : 'CONSISTENCY VS BASELINE'}
                </span>
                <strong>
                  {displayedScore === undefined ? '—' : format(displayedScore)}
                  <small> / 100</small>
                </strong>
              </div>
              <div className="score-meter">
                <div style={{ width: `${displayedScore ?? 0}%` }} />
              </div>
            </div>
          </div>
        </section>

        <section
          className="sports-panel personal-baseline-panel"
          aria-live="polite"
        >
          <div>
            <span className="panel-index">PERSONAL BASELINE</span>
            <h2>
              Baseline:{' '}
              {baseline
                ? 'Ready'
                : session === 'warmup' || session === 'warmupComplete'
                  ? 'Recording'
                  : 'Not created'}
            </h2>
            <p>
              {baseline ? (
                <>
                  <strong>Warm-Up Complete.</strong> Personal baseline created
                  from {baseline.sampleSize} reps.
                </>
              ) : session === 'warmup' || session === 'warmupComplete' ? (
                `Rep ${warmupReps.length} / ${WARMUP_REPS} completed`
              ) : (
                'Complete an 8-rep warm-up before training.'
              )}
            </p>
          </div>
          {baseline && (
            <div className="personal-baseline-values">
              <span>
                Knees{' '}
                <strong>
                  {format(
                    (baseline.leftKneeAngle + baseline.rightKneeAngle) / 2,
                    1
                  )}
                  °
                </strong>
              </span>
              <span>
                Hip <strong>{format(baseline.hipAngle, 1)}°</strong>
              </span>
              <span>
                Torso <strong>{format(baseline.torsoLean, 1)}°</strong>
              </span>
              <span>
                Depth <strong>{format(baseline.depth, 1)}%</strong>
              </span>
              <span>
                Duration <strong>{format(baseline.repDuration, 2)} s</strong>
              </span>
              <span>
                Knee difference{' '}
                <strong>{format(baseline.kneeAsymmetry, 1)}°</strong>
              </span>
            </div>
          )}
        </section>

        <section className="sports-lower">
          <div className="sports-panel trend-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">03 / SESSION TREND</span>
                <h2>Form consistency</h2>
              </div>
              <span className="panel-tag">REP BY REP</span>
            </div>
            <div className="chart-tabs">
              {(Object.keys(CHARTS) as ChartMetric[]).map((key) => (
                <button
                  className={chartMetric === key ? 'active' : ''}
                  key={key}
                  onClick={() => setChartMetric(key)}
                >
                  {CHARTS[key].label}
                </button>
              ))}
            </div>
            <Chart reps={trainingReps} metric={chartMetric} />
            <div className="chart-caption">
              <span>
                BASELINE <strong>8 WARM-UP REPS</strong>
              </span>
              <span>REP NUMBER →</span>
            </div>
          </div>
          <div className="sports-side-stack">
            <div className="sports-panel baseline-panel">
              <div className="panel-top">
                <div>
                  <span className="panel-index">04 / BENCHMARK</span>
                  <h2>Baseline comparison</h2>
                </div>
              </div>
              <p>Latest training rep compared with your 8-rep warm-up</p>
              <div className="baseline-row">
                <span>Depth</span>
                <strong>
                  {comparison
                    ? fromBaseline(comparison.depthPercent, 1, '%')
                    : '—'}
                </strong>
              </div>
              <div className="baseline-row">
                <span>Torso lean</span>
                <strong>
                  {comparison
                    ? fromBaseline(comparison.torsoLean, 1, '°')
                    : '—'}
                </strong>
              </div>
              <div className="baseline-row">
                <span>Left / right knee</span>
                <strong>
                  {comparison
                    ? fromBaseline(comparison.kneeAsymmetry, 1, '°')
                    : '—'}
                </strong>
              </div>
              <div className="baseline-row">
                <span>Rep duration</span>
                <strong>
                  {comparison
                    ? fromBaseline(comparison.repDuration, 2, ' s')
                    : '—'}
                </strong>
              </div>
            </div>
            <div className="sports-panel insight-panel">
              <div className="insight-icon">◎</div>
              <div>
                <span className="panel-index">MOVEMENT INSIGHT</span>
                <h3>
                  {comparison
                    ? 'Compared with your warm-up'
                    : 'Movement baseline pending'}
                </h3>
                <p>
                  {comparison
                    ? `Torso lean ${fromBaseline(comparison.torsoLean, 1, '°')}; depth ${fromBaseline(comparison.depthPercent, 1, '%')}.`
                    : baseline
                      ? 'Complete a training rep to compare it with your warm-up.'
                      : 'Complete the warm-up to create your personal baseline.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sports-panel trackers-panel">
          <button
            className="tracker-toggle"
            onClick={() => setTrackersOpen(!trackersOpen)}
          >
            <span>
              <span className="panel-index">05 / HARDWARE</span>
              <h2>
                Tracker status <small>11 simulated segments</small>
              </h2>
            </span>
            <span>
              {trackersOpen ? 'HIDE' : 'SHOW'} TRACKERS{' '}
              {trackersOpen ? '−' : '+'}
            </span>
          </button>
          {trackersOpen && (
            <div className="tracker-grid">
              {TRACKERS.map((tracker) => (
                <div key={tracker}>
                  <span className="status-pulse" />
                  {tracker}
                  <strong>CONNECTED</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {session === 'trainingComplete' && report && (
          <section className="sports-panel summary-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">SESSION COMPLETE</span>
                <h2>Session summary</h2>
              </div>
              <span className="panel-tag">
                {exercise.toUpperCase()} / {SESSION_REPS} REPS
              </span>
            </div>
            <div className="summary-stats">
              <Metric label="TOTAL REPS" value={format(report.totalReps)} />
              <Metric
                label="AVG CONSISTENCY"
                value={format(report.averageScore)}
                unit="/100"
              />
              <Metric label="BEST REP" value={`#${report.bestRep}`} />
              <Metric
                label="MAX TORSO DEVIATION"
                value={format(report.largestDeviation, 1)}
                unit="°"
              />
              <Metric
                label="AVG KNEE ANGLE"
                value={format(report.averageKneeAngle, 1)}
                unit="°"
              />
              <Metric
                label="AVG TORSO LEAN"
                value={format(report.averageTorsoLean, 1)}
                unit="°"
              />
              <Metric
                label="ASYMMETRY VS BASELINE"
                value={`${report.asymmetryChange >= 0 ? '+' : ''}${format(report.asymmetryChange, 1)}`}
                unit="°"
              />
            </div>
            <div className="summary-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>REP</th>
                    <th>SCORE</th>
                    <th>DEPTH</th>
                    <th>TORSO LEAN</th>
                    <th>L/R DIFFERENCE</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingReps.map((rep) => (
                    <tr key={rep.rep}>
                      <td>{String(rep.rep).padStart(2, '0')}</td>
                      <td>{rep.formScore}</td>
                      <td>{format(rep.depth, 1)}%</td>
                      <td>{format(rep.torsoLean, 1)}°</td>
                      <td>
                        {format(
                          Math.abs(rep.leftKneeAngle - rep.rightKneeAngle),
                          1
                        )}
                        °
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <footer className="sports-footer">
          MOTIONLAB / DEMO MODE{' '}
          <span>Powered by the SlimeVR skeleton visualizer</span>
        </footer>
      </main>

      {calibration !== null && (
        <div
          className="calibration-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Mock calibration"
        >
          <div className="calibration-modal">
            <span className="panel-index">TRACKER CALIBRATION / DEMO</span>
            <div className="calibration-count">
              {calibration === 'complete' ? '✓' : calibration}
            </div>
            <h2>
              {calibration === 'complete'
                ? 'Calibration complete'
                : 'Stand upright and remain still'}
            </h2>
            <p>
              {calibration === 'complete'
                ? 'Your simulated trackers are ready.'
                : 'Hold a neutral position while the countdown finishes.'}
            </p>
            <button
              className="primary-button"
              onClick={() => setCalibration(null)}
            >
              {calibration === 'complete' ? 'Continue' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
