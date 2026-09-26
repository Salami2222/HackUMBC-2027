export type Exercise = 'squat' | 'deadlift';
export type ExercisePhase = 'warmup' | 'training';

export interface ExerciseSessionOptions {
  exercise: Exercise;
  phase: ExercisePhase;
  targetReps: number;
}

export interface ExerciseFrame {
  timestamp: number;
  exercise: Exercise;
  rep: number;
  motion: number;
  leftKneeAngle: number;
  rightKneeAngle: number;
  hipAngle: number;
  torsoLean: number;
  depth: number;
  repDuration: number;
  formScore: number;
  lockout: boolean;
}

export type ExerciseRep = Omit<ExerciseFrame, 'timestamp' | 'motion' | 'lockout'>;

export type ExerciseEvent =
  | { type: 'frame'; phase: ExercisePhase; frame: ExerciseFrame }
  | { type: 'rep'; phase: ExercisePhase; rep: ExerciseRep }
  | { type: 'complete'; phase: ExercisePhase };

export interface ExerciseDataProvider {
  subscribe(listener: (event: ExerciseEvent) => void): () => void;
  start(options: ExerciseSessionOptions): void;
  stop(): void;
}
