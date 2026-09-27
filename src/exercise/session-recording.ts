import type { CompletedSquatRep, SquatRepPeaks } from './squat';
import { completeSquatRep } from './squat.ts';
import {
  analyzeFormTest,
  completeFormTestRep,
  type FormTestRepResult,
  type FormTestResult,
} from './form-test.ts';
import { FORM_TEST_REP_COUNT, WORKING_SET_REP_COUNT } from './session-config.ts';

export function recordFormTestRep(
  previous: FormTestRepResult[],
  peaks: SquatRepPeaks
): { reps: FormTestRepResult[]; result: FormTestResult | null } {
  if (previous.length >= FORM_TEST_REP_COUNT)
    throw new Error('Form Test already has three reps.');
  const reps = [...previous, completeFormTestRep(previous.length + 1, peaks)];
  return {
    reps,
    result: reps.length === FORM_TEST_REP_COUNT ? analyzeFormTest(reps) : null,
  };
}

export function recordWorkingSetRep(
  previous: CompletedSquatRep[],
  peaks: SquatRepPeaks,
  completedAt: number
): { reps: CompletedSquatRep[]; complete: boolean } {
  if (previous.length >= WORKING_SET_REP_COUNT)
    throw new Error('Working Set already has eight reps.');
  const reps = [...previous, completeSquatRep(previous.length + 1, peaks, completedAt)];
  return { reps, complete: reps.length === WORKING_SET_REP_COUNT };
}
