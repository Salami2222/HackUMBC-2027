import type { CompletedSquatRep, SquatRepPeaks } from './squat';
import { completeSquatRep } from './squat.ts';
import {
  analyzeFormTest,
  type FormTestRepResult,
  type FormTestResult,
} from './form-test.ts';
import { FORM_TEST_REP_COUNT, WORKING_SET_REP_COUNT } from './session-config.ts';
import type { FormRep } from './form-quality';

export function recordFormTestRep(
  previous: FormTestRepResult[],
  assessment: FormRep
): { reps: FormTestRepResult[]; result: FormTestResult | null } {
  if (previous.length >= FORM_TEST_REP_COUNT)
    throw new Error('Form Test already has three reps.');
  if (assessment.rep !== previous.length + 1)
    throw new Error('Form Test assessment must match the next rep.');
  const reps = [...previous, { repNumber: assessment.rep, assessment }];
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
