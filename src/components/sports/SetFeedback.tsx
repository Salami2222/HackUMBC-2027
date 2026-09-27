import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSquatSession } from '@/exercise/SquatSessionProvider';
import { FORM_LABELS, UNASSESSED, FormRep } from '@/exercise/form-quality';
import './SetFeedback.scss';

export function SetFeedback() {
  const { feedbackReps: formReps, endedAt } = useSquatSession();
  return endedAt && formReps.length ? (
    <Link className="feedback-trigger" to="/feedback">
      Set feedback
    </Link>
  ) : null;
}

export function SetFeedbackNavigation() {
  const { endedAt, feedbackReps: formReps } = useSquatSession();
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

export function RepBreakdown({ rep }: { rep: FormRep }) {
  const measured = rep.jev?.measuredScore ?? rep.score;
  const adjustment =
    rep.score != null && measured != null ? rep.score - measured : null;
  return (
    <details className="rep-breakdown">
      <summary>
        <strong>Rep {rep.rep}</strong>
        <span data-rating={rep.rating}>{FORM_LABELS[rep.rating]}</span>
        <strong>
          {rep.score == null ? '—' : `${rep.score.toFixed(1)} / 100`}
        </strong>
        <span className="rep-expand">Breakdown</span>
      </summary>
      <div className="rep-breakdown-body">
        <p>
          {Math.round(rep.coverage * 100)}% usable data · Scores reflect the
          measured factors only.
        </p>
        {rep.reason && <p className="feedback-unknown">{rep.reason}</p>}
        <div className="rep-table-wrap">
          <table>
            <caption>Weighted measurements — rep {rep.rep}</caption>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Factor score</th>
                <th scope="col">Weight</th>
                <th scope="col">Points earned</th>
                <th scope="col">Points lost</th>
              </tr>
            </thead>
            <tbody>
              {rep.groups.map((g) => {
                const known = g.coverage >= 0.85;
                const score = 100 * (1 - g.severity);
                const model = rep.jev?.factors?.find((f) => f.id === g.id);
                return (
                  <tr key={g.id}>
                    <th scope="row">
                      <strong>{g.label}</strong>
                      <small>{g.evidence}</small>
                      <small>
                        {Math.round(g.coverage * 100)}% coverage ·{' '}
                        {(g.issueMs / 1000).toFixed(2)} s sustained deviation
                        {g.id === 'depth' ? ' (depth uses peak bend)' : ''}
                      </small>
                      {model && (
                        <small>
                          Jev factor:{' '}
                          {(100 * (1 - model.proposedSeverity)).toFixed(1)} /
                          100 · {model.reason}
                        </small>
                      )}
                    </th>
                    <td>{known ? `${score.toFixed(1)} / 100` : 'Unknown'}</td>
                    <td>{g.weight}%</td>
                    <td>
                      {known
                        ? `${(g.weight * (1 - g.severity)).toFixed(1)} / ${g.weight}`
                        : '—'}
                    </td>
                    <td>
                      {known ? `−${(g.weight * g.severity).toFixed(1)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="rep-score-equation">
          <span>
            Measured <strong>{measured ?? '—'}</strong>
          </span>
          <span>
            Jev adjustment{' '}
            <strong>
              {adjustment == null
                ? '—'
                : `${adjustment >= 0 ? '+' : ''}${adjustment.toFixed(1)}`}
            </strong>
          </span>
          <span>
            Final <strong>{rep.score ?? '—'} / 100</strong>
          </span>
        </div>
        <p>
          Factor score × weight = points earned. Displayed values are rounded.
        </p>
        {rep.jev && (
          <section
            className="rep-jev-status"
            aria-label={`Jev review for rep ${rep.rep}`}
          >
            <strong>
              {rep.jev.weight
                ? '95% measurements + 5% Jev'
                : 'Measurements only'}
            </strong>
            <p>{rep.jev.reason}</p>
            <p>
              {rep.jev.attempts ?? 0} requests ·{' '}
              {rep.jev.httpStatus
                ? `HTTP ${rep.jev.httpStatus}`
                : 'No response recorded'}
              {rep.jev.latencyMs != null && ` · ${rep.jev.latencyMs} ms`} ·
              Eligible proposal: {rep.jev.proposedScore ?? 'Not received'}
            </p>
            {rep.jev.summary && (
              <details>
                <summary>Curated review inputs</summary>
                <pre>{JSON.stringify(rep.jev.summary, null, 2)}</pre>
              </details>
            )}
          </section>
        )}
      </div>
    </details>
  );
}

export function FeedbackDashboard() {
  const { feedbackReps: formReps, formSummary, endedAt } = useSquatSession();
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
                ? 'No sustained deviations detected in the assessed measurements. This does not assess every aspect of squat technique.'
                : 'There was not enough usable data to give form feedback.'}
            </p>
          )}
        </div>
        <section className="rep-results" aria-label="Rep results">
          <h3>Rep breakdowns</h3>
          {formReps.map((rep) => (
            <RepBreakdown key={rep.rep} rep={rep} />
          ))}
        </section>
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
