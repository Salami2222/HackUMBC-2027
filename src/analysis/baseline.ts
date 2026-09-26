import { Exercise, ExerciseRep } from './types';

export interface ExerciseBaseline {
  exercise: Exercise;
  leftKneeAngle: number;
  rightKneeAngle: number;
  hipAngle: number;
  torsoLean: number;
  depth: number;
  repDuration: number;
  kneeAsymmetry: number;
  sampleSize: number;
}

const average = (values: number[]) =>
  values.reduce((total, value) => total + value, 0) / values.length;

export function calculateBaseline(reps: ExerciseRep[]): ExerciseBaseline | null {
  if (!reps.length) return null;

  const exercise = reps[0].exercise;
  if (reps.some((rep) => rep.exercise !== exercise)) {
    throw new Error('A baseline must use reps from one exercise');
  }

  return {
    exercise,
    leftKneeAngle: average(reps.map((rep) => rep.leftKneeAngle)),
    rightKneeAngle: average(reps.map((rep) => rep.rightKneeAngle)),
    hipAngle: average(reps.map((rep) => rep.hipAngle)),
    torsoLean: average(reps.map((rep) => rep.torsoLean)),
    depth: average(reps.map((rep) => rep.depth)),
    repDuration: average(reps.map((rep) => rep.repDuration)),
    kneeAsymmetry: average(
      reps.map((rep) => Math.abs(rep.leftKneeAngle - rep.rightKneeAngle))
    ),
    sampleSize: reps.length,
  };
}
