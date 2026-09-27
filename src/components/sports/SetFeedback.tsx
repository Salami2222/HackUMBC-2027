import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSquatSession } from '@/exercise/SquatSessionProvider';
import { FORM_LABELS, UNASSESSED } from '@/exercise/form-quality';
import './SetFeedback.scss';

export function SetFeedback() {
  const { formReps, endedAt } = useSquatSession();
  return endedAt && formReps.length ? (
    <Link className="feedback-trigger" to="/feedback">
      Set feedback
    </Link>
  ) : null;
}

export function SetFeedbackNavigation() {
  const { endedAt, formReps } = useSquatSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const previous = useRef(endedAt);
  useEffect(() => {
    const changed = endedAt != null && previous.current !== endedAt;
    previous.current = endedAt;
    if (changed && formReps.length && pathname !== '/calibration')
      navigate('/feedback');
  }, [endedAt, formReps.length, pathname, navigate]);
  return null;
}

export function FeedbackDashboard() {
  const { formReps, formSummary, endedAt } = useSquatSession();
  const rated = formReps.filter((r) => r.score != null);
  if (!endedAt || !formReps.length)
    return (
      <main className="feedback-screen" aria-label="Set feedback">
        <p className="feedback-empty">Your completed set will appear here.</p>
      </main>
    );
  return (
    <main className="feedback-screen" aria-label="Set feedback">
      <article className="set-feedback">
        <header>
          <div>
            <span>Set review</span>
            <h2 id="set-feedback-title">Your next set</h2>
          </div>
          <Link to="/presentation" className="feedback-trigger">
            Back to presentation
          </Link>
        </header>
        <p>
          {formReps.length} completed reps · {formSummary.assessed} assessed ·{' '}
          {formSummary.unknown} with insufficient data
        </p>
        <p>{formSummary.trend}</p>
        {formSummary.unknown > 0 && (
          <p className="feedback-unknown">
            Check missing or interrupted nodes before the next set. Unknown reps
            are excluded from scores and trend comparisons.
          </p>
        )}
        <div className="feedback-cues">
          {formSummary.feedback.map((item) => (
            <section key={item.id}>
              <h3>{item.label}</h3>
              <span>
                {item.reps.length === 1
                  ? 'Observed on rep'
                  : 'Repeated on reps'}{' '}
                {item.reps.join(', ')}
              </span>
              <p>{item.cue}</p>
              <details>
                <summary>Measurements</summary>
                <p>{item.evidence}</p>
              </details>
            </section>
          ))}
          {!formSummary.feedback.length && (
            <p>
              {rated.length
                ? 'No sustained deviations detected in the assessed measurements. Keep the same controlled movement.'
                : 'There was not enough usable data to give form feedback.'}
            </p>
          )}
        </div>
        <table>
          <caption>Rep results</caption>
          <thead>
            <tr>
              <th>Rep</th>
              <th>Measured form</th>
              <th>Score</th>
              <th>Data coverage</th>
            </tr>
          </thead>
          <tbody>
            {formReps.map((rep) => (
              <tr key={rep.rep}>
                <td>{rep.rep}</td>
                <td data-rating={rep.rating}>{FORM_LABELS[rep.rating]}</td>
                <td>
                  {rep.score == null ? '—' : `${rep.score}/100`}
                  {rep.jev && (
                    <details>
                      <summary>
                        {rep.jev.weight ? 'Jev 5%' : 'Measurements only'}
                      </summary>
                      <p>
                        Measured: {rep.jev.measuredScore ?? '—'} · Jev proposal:{' '}
                        {rep.jev.proposedScore ?? '—'}
                      </p>
                      <p>{rep.jev.reason}</p>
                      {rep.jev.summary && (
                        <details>
                          <summary>Review inputs</summary>
                          <pre
                            style={{
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {JSON.stringify(rep.jev.summary, null, 2)}
                          </pre>
                        </details>
                      )}
                    </details>
                  )}
                </td>
                <td>
                  {Math.round(rep.coverage * 100)}%
                  {rep.reason && (
                    <details>
                      <summary>Why?</summary>
                      {rep.reason}
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>
          <p>{UNASSESSED}</p>
          <p>
            Data coverage measures usable samples, not a probability of correct
            form. Ratings use experimental movement targets, not injury-risk
            predictions.
          </p>
        </footer>
      </article>
    </main>
  );
}
