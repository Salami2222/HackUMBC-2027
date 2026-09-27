import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Exercise, ExerciseFrame, ExerciseRep } from '@/analysis/types';
import { HISTORY_LIMIT, MovementGraphs } from './MovementGraphs';
import './SportsDashboard.scss';

type SessionState =
  | 'ready'
  | 'warmup'
  | 'warmupComplete'
  | 'training'
  | 'trainingComplete'
  | 'stopped';

export function SportsDashboard({ active = true }: { active?: boolean }) {
  const provider = useMemo(() => new MockExerciseProvider(), []);
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [frame, setFrame] = useState(() =>
    mockFrame('squat', 0, 0, 'warmup', WARMUP_REPS)
  );
  const [frames, setFrames] = useState<ExerciseFrame[]>([]);
  const [warmupReps, setWarmupReps] = useState<ExerciseRep[]>([]);
  const [trainingReps, setTrainingReps] = useState<ExerciseRep[]>([]);
  const [baseline, setBaseline] = useState<ExerciseBaseline | null>(null);
  const baselineRef = useRef<ExerciseBaseline | null>(null);
  const [session, setSession] = useState<SessionState>('ready');
  const [phase, setPhase] = useState<'warmup' | 'training'>('warmup');
  const view = useRef<SkeletonPreviewView | null>(null);
  const bones = useMemo(() => mockSkeleton(frame), [frame]);
  const completedReps =
    phase === 'warmup' ? warmupReps.length : trainingReps.length;
  const targetReps = phase === 'warmup' ? WARMUP_REPS : SESSION_REPS;
  const running = session === 'warmup' || session === 'training';
  const currentRep = running
    ? Math.min(completedReps + 1, targetReps)
    : completedReps;
  const latest = trainingReps.at(-1);
  const comparison =
    baseline && latest ? compareToBaseline(latest, baseline) : null;
  const score = comparison ? consistencyScore(comparison) : null;
  const report = summary(trainingReps, baseline);
  const stateLabel: Record<SessionState, string> = {
    ready: 'Ready',
    warmup: 'Recording baseline',
    warmupComplete: 'Ready to start',
    training: 'Session running',
    trainingComplete: 'Session complete',
    stopped: 'Stopped',
  };
  const movementLabel = !baseline
    ? 'Record a baseline to compare movement'
    : score === null
      ? 'Start a session to compare reps'
      : score >= 90
        ? 'Moving close to baseline'
        : score >= 80
          ? 'Movement is changing'
          : 'Noticeable change from baseline';

  useEffect(() => {
    const unsubscribe = provider.subscribe((event) => {
      if (event.type === 'frame') {
        setFrame(event.frame);
        setFrames((current) => [...current, event.frame].slice(-HISTORY_LIMIT));
      }
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

  const recordBaseline = () => {
    provider.stop();
    baselineRef.current = null;
    setBaseline(null);
    setWarmupReps([]);
    setTrainingReps([]);
    setFrames([]);
    setPhase('warmup');
    setSession('warmup');
    provider.start({
      exercise,
      phase: 'warmup',
      targetReps: WARMUP_REPS,
    });
  };

  const startSession = () => {
    if (!baseline || running) return;
    setTrainingReps([]);
    setFrames([]);
    setPhase('training');
    setSession('training');
    provider.start({
      exercise,
      phase: 'training',
      targetReps: SESSION_REPS,
    });
  };

  const stopSession = () => {
    provider.stop();
    setSession('stopped');
  };

  const chooseExercise = (next: Exercise) => {
    provider.stop();
    baselineRef.current = null;
    setExercise(next);
    setFrame(mockFrame(next, 0, 0, 'warmup', WARMUP_REPS));
    setFrames([]);
    setWarmupReps([]);
    setTrainingReps([]);
    setBaseline(null);
    setPhase('warmup');
    setSession('ready');
  };

  const setView = (position: Vector3) => {
    if (!view.current) return;
    view.current.camera.position.copy(position);
    view.current.controls.update();
  };

  return (
    <main className="sports-content tracking-screen">
      <div className="tracking-intro">
        <div>
          <span className="eyebrow">Tracking / {exercise}</span>
          <h1>Movement at a glance</h1>
        </div>
        <span className="source-note">
          <i /> Simulated movement
        </span>
      </div>

      <section className="tracking-hero" aria-label="Tracking session">
        <div className="tracking-stage">
          <div className="stage-title">
            <span>Skeleton</span>
            <span>{running ? 'MOVING' : 'READY'}</span>
          </div>
          <div className="sports-viewport">
            {active && (
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
                        v.camera.zoom = 1 / (Math.max(1, height) / 1.1);
                        v.camera.updateProjectionMatrix();
                      },
                    }) ?? null;
                }}
              />
            )}
          </div>
          <div className="stage-footer">
            <span>11 simulated segments</span>
            <div className="view-buttons" aria-label="Skeleton view">
              <button onClick={() => setView(new Vector3(0, 1.3, -4))}>
                Front
              </button>
              <button onClick={() => setView(new Vector3(4, 1.3, 0))}>
                Side
              </button>
              <button onClick={() => setView(new Vector3(2.5, 1.9, -2.8))}>
                3D
              </button>
            </div>
          </div>
        </div>

        <aside className="session-sidebar" aria-label="Session controls">
          <span className="eyebrow">Current session</span>
          <label className="session-exercise">
            <span className="sr-only">Exercise</span>
            <select
              value={exercise}
              disabled={running}
              onChange={(event) =>
                chooseExercise(event.target.value as Exercise)
              }
            >
              <option value="squat">Squat</option>
              <option value="deadlift">Deadlift</option>
            </select>
          </label>
          <div className="session-state" role="status">
            <i className={running ? 'is-running' : ''} />
            {stateLabel[session]}
          </div>
          <div className="rep-readout">
            <span>{phase === 'warmup' ? 'BASELINE REP' : 'CURRENT REP'}</span>
            <strong>{String(currentRep).padStart(2, '0')}</strong>
            <small>/ {targetReps}</small>
          </div>
          <div
            className="rep-track"
            aria-label={`${completedReps} of ${targetReps} reps complete`}
          >
            <span style={{ width: `${(completedReps / targetReps) * 100}%` }} />
          </div>
          <div className="baseline-status">
            <span>Baseline</span>
            <strong>
              {baseline
                ? `Ready · ${baseline.sampleSize} reps`
                : session === 'warmup'
                  ? `Recording · ${warmupReps.length}/${WARMUP_REPS}`
                  : 'Not recorded'}
            </strong>
          </div>
          <div className="session-actions">
            <button
              className="secondary-button"
              onClick={recordBaseline}
              disabled={running}
            >
              {baseline ? 'Record Baseline Again' : 'Record Baseline'}
            </button>
            <button
              className="primary-button"
              onClick={startSession}
              disabled={!baseline || running}
            >
              Start Session
            </button>
            <button
              className="text-button"
              onClick={stopSession}
              disabled={!running}
            >
              Stop Session
            </button>
          </div>
          <div className="movement-status" aria-live="polite">
            <span className="eyebrow">Compared with baseline</span>
            <strong>{movementLabel}</strong>
            {report && session === 'trainingComplete' && (
              <small>
                {report.totalReps} reps completed ·{' '}
                {Math.round(report.averageScore)}% average consistency
              </small>
            )}
          </div>
        </aside>
      </section>

      <MovementGraphs frames={frames} baseline={baseline} exercise={exercise} />
    </main>
  );
}
