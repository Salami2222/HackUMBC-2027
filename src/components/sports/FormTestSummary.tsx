import {
  ACCEPTABLE_DEPTH_MIN_DEG,
  FormTestRepResult,
  FormTestResult,
} from '@/exercise/form-test';
import './FormTestSummary.scss';

export function formTestDepthLabel(
  classification: FormTestRepResult['depthClassification']
) {
  if (classification === 'acceptable') return 'Acceptable';
  if (classification === 'shallow') return 'Shallow';
  return 'Very shallow';
}

export function FormTestSummary({
  result,
  onRunAgain,
  canMeasure,
}: {
  result: FormTestResult;
  onRunAgain: () => void;
  canMeasure: boolean;
}) {
  return (
    <div className="form-test-summary" aria-live="polite">
      <h3>Form Test Complete</h3>
      <p className="form-test-verdict" data-passed={result.depthPassed}>
        Squat Depth: {result.depthPassed ? 'Passed' : 'Needs Improvement'}
      </p>
      <ol>
        {result.reps.map((rep) => (
          <li key={rep.repNumber}>
            <span>Rep {rep.repNumber}</span>
            <strong>{formTestDepthLabel(rep.depthClassification)}</strong>
          </li>
        ))}
      </ol>
      <p>
        {result.depthPassed
          ? 'Your squat depth was consistent across all 3 reps. Depth criterion passed. You can progress to your working sets when ready.'
          : `${result.failedDepthReps} of 3 reps did not reach the target squat depth. Aim for at least ${ACCEPTABLE_DEPTH_MIN_DEG}° of knee flexion before progressing.`}
      </p>
      <button
        className="secondary-button"
        type="button"
        onClick={onRunAgain}
        disabled={!canMeasure}
      >
        Run Form Test Again
      </button>
    </div>
  );
}
