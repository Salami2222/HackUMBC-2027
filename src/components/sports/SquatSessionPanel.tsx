import { Link } from 'react-router-dom';
import { useSquatSession } from '@/exercise/SquatSessionProvider';
import { PHASE_LABELS } from '@/exercise/squat-phase';
import {
  HEAD_INCLINATION_LIMIT_DEG,
  HEAD_INCLINATION_LABELS,
} from '@/exercise/squat';
import { FormTestSummary, formTestRepLabel } from './FormTestSummary';
import { SessionModeSelect } from './SessionModeSelect';
import { SetFeedback } from './SetFeedback';

export function SquatSessionPanel() {
  const {
    sessionMode,
    targetRepCount,
    phase,
    formTestReps,
    formTestResult,
    trainingReps,
    notice,
    canMeasure,
    head,
    headStatus,
    motion,
    jevStatus,
    startSession,
    stop,
  } = useSquatSession();
  const active = phase !== 'idle';
  const count =
    sessionMode === 'form-test' ? formTestReps.length : trainingReps.length;
  const modeLabel = sessionMode === 'form-test' ? 'Form Test' : 'Working Set';
  const complete =
    sessionMode === 'form-test'
      ? !!formTestResult
      : count === targetRepCount && !active;
  const latestWorkingRep = trainingReps.at(-1);

  return (
    <section className="squat-session" aria-label="Squat session">
      <div className="squat-session-heading">
        <div>
          <span className="eyebrow">Squat</span>
          <h2>{modeLabel}</h2>
        </div>
        <span role="status">
          {active ? 'Recording' : complete ? 'Complete' : 'Ready'}
        </span>
      </div>
      <SessionModeSelect id="tracking-session-type" />
      <div className="squat-progress">
        <div>
          <span>{modeLabel} reps</span>
          <strong>
            {count} <small>/ {targetRepCount}</small>
          </strong>
        </div>
      </div>
      {sessionMode === 'form-test' && formTestResult ? (
        <FormTestSummary
          result={formTestResult}
          onRunAgain={startSession}
          canMeasure={canMeasure}
        />
      ) : (
        <>
          <div className="squat-actions">
            <button
              className="primary-button"
              onClick={startSession}
              disabled={!canMeasure || active}
            >
              Start Session
            </button>
            <button
              className="secondary-button"
              onClick={stop}
              disabled={!active}
            >
              Stop Session
            </button>
          </div>
          {sessionMode === 'form-test' && formTestReps.length > 0 && (
            <p className="squat-comparison">
              Latest rep: {formTestRepLabel(formTestReps.at(-1)!)}
            </p>
          )}
          {sessionMode === 'working-set' && latestWorkingRep && (
            <p className="squat-comparison">
              Latest rep: {latestWorkingRep.achievedKneeFlexion.toFixed(1)}°
            </p>
          )}
        </>
      )}

      <p className="squat-notice" role="status">
        {canMeasure ? PHASE_LABELS[motion.phase] : 'Tracking unavailable'}
        {motion.paused ? ' · Paused' : ''}
      </p>
      <details className="squat-notice">
        <summary>Phase diagnostics</summary>
        <p>
          Knee speed: {canMeasure ? `${motion.kneeSpeed.toFixed(1)}°/s` : '—'} ·
          Head speed:{' '}
          {canMeasure && motion.headSpeed != null
            ? `${motion.headSpeed.toFixed(2)} m/s`
            : '—'}
        </p>
        <p>{jevStatus}</p>
        <p>{motion.reason}</p>
      </details>
      <SetFeedback />
      {notice && (
        <p className="squat-notice" role="status">
          {notice}
        </p>
      )}
      {sessionMode === 'form-test' ? (
        <p className="squat-notice">
          Form Test: 3 reps · Inward knees, symmetry, torso, depth and head
        </p>
      ) : (
        <>
          <p className="squat-notice">
            Working Set: 8 reps · Head range: ±{HEAD_INCLINATION_LIMIT_DEG}°
            from upright
          </p>
          <p className="squat-notice" data-head-status={headStatus}>
            {HEAD_INCLINATION_LABELS[headStatus]}
            {headStatus !== 'unavailable' && head != null
              ? ` · ${head.toFixed(1)}°`
              : ''}
          </p>
        </>
      )}
      {active && canMeasure && (
        <p className="squat-notice">
          Start upright, then squat and return upright to count each rep.
        </p>
      )}
      {!canMeasure && (
        <p className="squat-notice">
          <Link to="/calibration">Calibrate eight measurement nodes</Link> and
          capture an upright reference before recording live reps.
        </p>
      )}
    </section>
  );
}
