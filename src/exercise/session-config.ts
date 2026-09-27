export type SessionMode = 'form-test' | 'working-set';

export const FORM_TEST_REP_COUNT = 3;
export const WORKING_SET_REP_COUNT = 8;

export function targetRepCount(mode: SessionMode): number {
  return mode === 'form-test' ? FORM_TEST_REP_COUNT : WORKING_SET_REP_COUNT;
}
