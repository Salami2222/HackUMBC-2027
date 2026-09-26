import { ExerciseRep } from './types';

export const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function baseline(reps: ExerciseRep[]) {
  const first = reps.slice(0, 3);
  if (first.length < 3) return null;
  return {
    depth: average(first.map((rep) => rep.depth)),
    torsoLean: average(first.map((rep) => rep.torsoLean)),
    kneeDifference: average(
      first.map((rep) => Math.abs(rep.leftKneeAngle - rep.rightKneeAngle))
    ),
    repDuration: average(first.map((rep) => rep.repDuration)),
  };
}

export function summary(reps: ExerciseRep[]) {
  if (!reps.length) return null;
  const first = average(
    reps.slice(0, 3).map((rep) => Math.abs(rep.leftKneeAngle - rep.rightKneeAngle))
  );
  const last = average(
    reps.slice(-3).map((rep) => Math.abs(rep.leftKneeAngle - rep.rightKneeAngle))
  );
  const best = reps.reduce((current, rep) =>
    rep.formScore > current.formScore ? rep : current
  );
  const reference = baseline(reps);
  const largestDeviation = reference
    ? Math.max(...reps.map((rep) => Math.abs(rep.torsoLean - reference.torsoLean)))
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
    asymmetryTrend: last - first,
  };
}
