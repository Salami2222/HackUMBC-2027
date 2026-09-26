export type Exercise = 'squat' | 'deadlift';

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
  | { type: 'frame'; frame: ExerciseFrame }
  | { type: 'rep'; rep: ExerciseRep }
  | { type: 'complete' };

export interface ExerciseDataProvider {
  subscribe(listener: (event: ExerciseEvent) => void): () => void;
  start(exercise: Exercise): void;
  stop(): void;
}
