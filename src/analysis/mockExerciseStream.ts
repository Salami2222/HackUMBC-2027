import {
  Exercise,
  ExerciseDataProvider,
  ExerciseEvent,
  ExerciseFrame,
  ExercisePhase,
  ExerciseRep,
  ExerciseSessionOptions,
} from './types';

export const SESSION_REPS = 10;
export const WARMUP_REPS = 8;
const UPDATE_MS = 1000 / 30;

function round(value: number, digits = 0) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function mockRep(
  exercise: Exercise,
  rep: number,
  phase: ExercisePhase = 'training'
): ExerciseRep {
  const fatigue = phase === 'warmup' ? 0 : Math.max(0, rep - 3);
  const variations =
    phase === 'warmup'
      ? [0, -0.3, 0.2, -0.2, 0.3, -0.1, 0.1, 0]
      : [0, -0.7, 0.5, -0.2, 0.8, -0.5, 0.2, -0.6, 0.6, 0];
  const variation = variations[rep - 1] ?? 0;
  const squat = exercise === 'squat';
  const leftKneeAngle = round(
    (squat ? 84 : 116) + fatigue * (squat ? 0.95 : 0.5) + variation,
    1
  );
  const rightKneeAngle = round(leftKneeAngle + 1.1 + fatigue * 0.52, 1);
  return {
    exercise,
    rep,
    leftKneeAngle,
    rightKneeAngle,
    hipAngle: round((squat ? 72 : 70) + fatigue * 1.15 + variation, 1),
    torsoLean: round(
      (squat ? 17 : 37) + fatigue * (squat ? 1.15 : 0.85) + variation * 0.5,
      1
    ),
    depth: round(
      (squat ? 97 : 96) - fatigue * (squat ? 1.55 : 0.9) + variation * 0.7,
      1
    ),
    repDuration: round((squat ? 2.2 : 2.4) + fatigue * 0.045, 2),
    formScore: round(97 - fatigue * 1.75 - Math.abs(variation) * 0.7),
  };
}

export function mockFrame(
  exercise: Exercise,
  completed: number,
  progress: number,
  phase: ExercisePhase = 'training',
  targetReps = SESSION_REPS
): ExerciseFrame {
  const rep = Math.min(completed + 1, targetReps);
  const profile = mockRep(exercise, rep, phase);
  const motion = (1 - Math.cos(progress * Math.PI * 2)) / 2;
  const kneeRest = exercise === 'squat' ? 174 : 173;
  return {
    ...profile,
    timestamp: Date.now(),
    rep: completed,
    motion,
    leftKneeAngle: round(kneeRest - (kneeRest - profile.leftKneeAngle) * motion, 1),
    rightKneeAngle: round(kneeRest - (kneeRest - profile.rightKneeAngle) * motion, 1),
    hipAngle: round(178 - (178 - profile.hipAngle) * motion, 1),
    torsoLean: round(2 + (profile.torsoLean - 2) * motion, 1),
    depth: round(profile.depth * motion, 1),
    lockout: motion < 0.12,
  };
}

export class MockExerciseProvider implements ExerciseDataProvider {
  private listeners = new Set<(event: ExerciseEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private completed = 0;
  private session: ExerciseSessionOptions | null = null;

  subscribe(listener: (event: ExerciseEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ExerciseEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  start(options: ExerciseSessionOptions) {
    this.stop();
    this.session = options;
    this.completed = 0;
    this.startedAt = performance.now();
    this.emit({
      type: 'frame',
      phase: options.phase,
      frame: mockFrame(options.exercise, 0, 0, options.phase, options.targetReps),
    });
    this.timer = setInterval(() => this.tick(), UPDATE_MS);
  }

  private tick() {
    const session = this.session;
    if (!session) return;
    const { exercise, phase, targetReps } = session;
    let elapsed = (performance.now() - this.startedAt) / 1000;
    let duration = mockRep(exercise, this.completed + 1, phase).repDuration;
    while (elapsed >= duration && this.completed < targetReps) {
      this.completed += 1;
      this.emit({ type: 'rep', phase, rep: mockRep(exercise, this.completed, phase) });
      this.startedAt += duration * 1000;
      elapsed = (performance.now() - this.startedAt) / 1000;
      if (this.completed === targetReps) {
        this.stop();
        this.emit({
          type: 'frame',
          phase,
          frame: mockFrame(exercise, targetReps, 0, phase, targetReps),
        });
        this.emit({ type: 'complete', phase });
        return;
      }
      duration = mockRep(exercise, this.completed + 1, phase).repDuration;
    }
    this.emit({
      type: 'frame',
      phase,
      frame: mockFrame(exercise, this.completed, elapsed / duration, phase, targetReps),
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.session = null;
  }
}
