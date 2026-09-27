import type { FormRep } from './form-quality';
import { FORM_TEST_REP_COUNT } from './session-config.ts';

export interface FormTestRepResult {
  repNumber: number;
  assessment: FormRep;
}

export interface FormTestResult {
  totalReps: typeof FORM_TEST_REP_COUNT;
  passed: boolean;
  unknownReps: number;
  improvementReps: number;
  reps: FormTestRepResult[];
}

// Both modes consume the same finalized assessment, including eligible Jev advice.
export function analyzeFormTest(reps: FormTestRepResult[]): FormTestResult {
  if (reps.length !== FORM_TEST_REP_COUNT)
    throw new Error('Analyze the form test only after all three reps.');
  return {
    totalReps: FORM_TEST_REP_COUNT,
    passed: reps.every(({ assessment }) => assessment.rating === 'optimal'),
    unknownReps: reps.filter(({ assessment }) => assessment.rating === 'unknown')
      .length,
    improvementReps: reps.filter(({ assessment }) =>
      ['suboptimal', 'attention'].includes(assessment.rating)
    ).length,
    reps: [...reps],
  };
}
