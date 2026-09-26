import { ExerciseBaseline } from './baseline';
import { ExerciseRep } from './types';

export const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function summary(reps: ExerciseRep[], baseline: ExerciseBaseline | null) {
  if (!reps.length) return null;
  const last = average(
    reps.slice(-3).map((rep) => Math.abs(rep.leftKneeAngle - rep.rightKneeAngle))
  );
  const best = reps.reduce((current, rep) =>
    rep.formScore > current.formScore ? rep : current
  );
  const largestDeviation = baseline
    ? Math.max(...reps.map((rep) => Math.abs(rep.torsoLean - baseline.torsoLean)))
    : 0;
  return {
    totalReps: reps.length,
    averageScore: average(reps.map((rep) => rep.formScore)),
    bestRep: best.rep,
    largestDeviation,
    averageKneeAngle: average(
      reps.map((rep) => (rep.leftKneeAngle + rep.rightKneeAngle) / 2)
    ),
    averageTorsoLean: average(reps.map((rep) => rep.torsoLean)),
    asymmetryChange: baseline ? last - baseline.kneeAsymmetry : 0,
  };
}
