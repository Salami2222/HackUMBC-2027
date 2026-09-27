import type { SquatRepPeaks, SquatDepthClassification } from './squat';
import { FORM_TEST_REP_COUNT } from './session-config.ts';

export const ACCEPTABLE_DEPTH_MIN_DEG = 75;
export const VERY_SHALLOW_THRESHOLD_DEG = 60;

export interface FormTestRepResult {
  repNumber: number;
  achievedKneeFlexion: number;
  depthClassification: SquatDepthClassification;
}

export interface FormTestResult {
  totalReps: typeof FORM_TEST_REP_COUNT;
  passedDepthReps: number;
  failedDepthReps: number;
  depthPassed: boolean;
  reps: FormTestRepResult[];
}

export function classifyFormTestDepth(kneeFlexion: number): SquatDepthClassification {
  if (kneeFlexion >= ACCEPTABLE_DEPTH_MIN_DEG) return 'acceptable';
  if (kneeFlexion >= VERY_SHALLOW_THRESHOLD_DEG) return 'shallow';
  return 'very-shallow';
}

// Reuse the live phase detector's smoothed per-leg peaks. The form test uses
// its own minimum-depth rule without changing working-set form scoring.
export function completeFormTestRep(
  repNumber: number,
  peaks: SquatRepPeaks
): FormTestRepResult {
  const achievedKneeFlexion = Math.min(
    peaks.maxLeftKneeFlexion,
    peaks.maxRightKneeFlexion
  );
  return {
    repNumber,
    achievedKneeFlexion,
    depthClassification: classifyFormTestDepth(achievedKneeFlexion),
  };
}

export function analyzeFormTest(reps: FormTestRepResult[]): FormTestResult {
  if (reps.length !== FORM_TEST_REP_COUNT)
    throw new Error('Analyze the form test only after all three reps.');
  const failedDepthReps = reps.filter(
    (rep) => rep.depthClassification !== 'acceptable'
  ).length;
  return {
    totalReps: FORM_TEST_REP_COUNT,
    passedDepthReps: FORM_TEST_REP_COUNT - failedDepthReps,
    failedDepthReps,
    depthPassed: failedDepthReps === 0,
    reps: [...reps],
  };
}
