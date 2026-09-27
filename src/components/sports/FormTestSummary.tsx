import { FormTestRepResult, FormTestResult } from '@/exercise/form-test';
import { FORM_LABELS } from '@/exercise/form-quality';
import './FormTestSummary.scss';

export function formTestRepLabel(rep: FormTestRepResult) {
  const { assessment } = rep;
  return `${FORM_LABELS[assessment.rating]}${assessment.score == null ? '' : ` · ${assessment.score.toFixed(1)}/100`}`;
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
      <p className="form-test-verdict" data-passed={result.passed}>
        Measured form:{' '}
        {result.passed
          ? 'Passed'
          : result.improvementReps
            ? 'Needs Improvement'
            : 'Insufficient data'}
      </p>
      <ol>
        {result.reps.map((rep) => (
          <li key={rep.repNumber}>
            <span>Rep {rep.repNumber}</span>
            <strong>{formTestRepLabel(rep)}</strong>
          </li>
        ))}
      </ol>
      <p>
        {result.passed
          ? 'All three reps met the configured form targets.'
          : `${result.improvementReps} of 3 reps have improvement cues. ${result.unknownReps} have insufficient data. Review the weighted breakdown in Feedback.`}
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
