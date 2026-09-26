import { ExerciseBaseline } from './baseline';
import { ExerciseRep } from './types';

export interface ExerciseComparison {
  leftKneeAngle: number;
  rightKneeAngle: number;
  hipAngle: number;
  torsoLean: number;
  depthPercent: number;
  repDuration: number;
  kneeAsymmetry: number;
}

export function compareToBaseline(
  rep: ExerciseRep,
  baseline: ExerciseBaseline
): ExerciseComparison {
  if (rep.exercise !== baseline.exercise) {
    throw new Error('Cannot compare different exercises');
  }

  return {
    leftKneeAngle: rep.leftKneeAngle - baseline.leftKneeAngle,
    rightKneeAngle: rep.rightKneeAngle - baseline.rightKneeAngle,
    hipAngle: rep.hipAngle - baseline.hipAngle,
    torsoLean: rep.torsoLean - baseline.torsoLean,
    depthPercent: baseline.depth
      ? ((rep.depth - baseline.depth) / baseline.depth) * 100
      : 0,
    repDuration: rep.repDuration - baseline.repDuration,
    kneeAsymmetry:
      Math.abs(rep.leftKneeAngle - rep.rightKneeAngle) - baseline.kneeAsymmetry,
  };
}

// Demo consistency score: drift from the person's warm-up, not an ideal pose.
export function consistencyScore(comparison: ExerciseComparison): number {
  const normalizedDrift =
    (Math.abs(comparison.leftKneeAngle) / 20 +
      Math.abs(comparison.rightKneeAngle) / 20 +
      Math.abs(comparison.hipAngle) / 20 +
      Math.abs(comparison.torsoLean) / 10 +
      Math.abs(comparison.depthPercent) / 15 +
      Math.abs(comparison.repDuration) / 1 +
      Math.abs(comparison.kneeAsymmetry) / 5) /
    7;
  return Math.max(0, Math.round(100 * (1 - normalizedDrift)));
}
