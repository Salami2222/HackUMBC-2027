import { SetFeedback } from './SetFeedback';
import { Link } from 'react-router-dom';
import { useSquatSession } from '@/exercise/SquatSessionProvider';
import { PHASE_LABELS } from '@/exercise/squat-phase';
import {
  ACCEPTABLE_DEPTH_MIN_DEG,
  HEAD_INCLINATION_LIMIT_DEG,
  HEAD_INCLINATION_LABELS,
  CompletedSquatRep,
  WARMUP_REP_COUNT,
} from '@/exercise/squat';
function depthLabel(classification: CompletedSquatRep['depthClassification']) {
  if (classification === 'acceptable') return 'Acceptable depth';
  if (classification === 'shallow') return 'Shallow';
  return 'Very shallow';
}

export function SquatSessionPanel() {
  const {
    baseline,
    phase,
    warmupReps,
    trainingReps,
    result,
    notice,
    canMeasure,
    head,
    headStatus,
    motion,
    jevStatus,
    startWarmup,
    startTraining,
    stop,
    dismissResult,
  } = useSquatSession();
  const latestTrainingRep = trainingReps.at(-1);
  const status =
    phase === 'warmup'
      ? 'Recording warm-up'
      : phase === 'training'
        ? 'Session running'
        : baseline
          ? 'Baseline ready'
          : 'No baseline yet';

  return (
    <section className="squat-session" aria-label="Squat session">
      <div className="squat-session-heading">
        <div>
          <span className="eyebrow">Squat</span>
          <h2>{result ? 'Warm-up result' : 'Session'}</h2>
        </div>
        <span role="status">{status}</span>
      </div>

      {result ? (
        <div className="warmup-result" aria-live="polite">
          <h3>
            {result.accepted
              ? 'Warm-Up Complete'
              : 'Warm-Up Needs to Be Repeated'}
          </h3>
          <ol>
            {result.reps.map((rep) => (
              <li key={rep.rep}>
                <span>Rep {rep.rep}</span>
                <strong>
                  {depthLabel(rep.depthClassification)} ·{' '}
                  {rep.achievedKneeFlexion.toFixed(1)}°
                </strong>
              </li>
            ))}
          </ol>
          <p>
            {result.accepted
              ? 'Baseline accepted.'
              : `${result.failedDepthRepCount} of ${WARMUP_REP_COUNT} reps did not reach the required squat depth. Retry and aim for at least ${ACCEPTABLE_DEPTH_MIN_DEG}° of knee flexion.`}
          </p>
          {!result.accepted && baseline && (
            <p>Your previous accepted baseline is still available.</p>
          )}
          <div className="squat-actions">
            {result.accepted ? (
              <button className="primary-button" onClick={dismissResult}>
                Continue
              </button>
            ) : (
              <>
                <button
                  className="primary-button"
                  onClick={startWarmup}
                  disabled={!canMeasure}
                >
                  Retry Warm-Up
                </button>
                <button className="secondary-button" onClick={dismissResult}>
                  Return to tracking
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="squat-progress">
            <div>
              <span>
                {phase === 'warmup' ? 'Warm-up reps' : 'Session reps'}
              </span>
              <strong>
                {phase === 'warmup' ? warmupReps.length : trainingReps.length}
                {phase === 'warmup' && <small> / {WARMUP_REP_COUNT}</small>}
              </strong>
            </div>
            <div>
              <span>Personal baseline</span>
              <strong>
                {baseline
                  ? `${baseline.averageKneeFlexion.toFixed(1)}°`
                  : 'Not recorded'}
              </strong>
            </div>
          </div>
          <div className="squat-actions">
            <button
              className="secondary-button"
              onClick={startWarmup}
              disabled={!canMeasure || phase !== 'idle'}
            >
              {baseline ? 'Record Baseline Again' : 'Record Baseline'}
            </button>
            <button
              className="primary-button"
              onClick={startTraining}
              disabled={!baseline || !canMeasure || phase !== 'idle'}
            >
              Start Session
            </button>
            <button
              className="secondary-button"
              onClick={stop}
              disabled={phase !== 'warmup' && phase !== 'training'}
            >
              Stop Session
            </button>
          </div>
          {latestTrainingRep && baseline && (
            <p className="squat-comparison">
              Latest rep: {latestTrainingRep.achievedKneeFlexion.toFixed(1)}° ·{' '}
              {depthLabel(latestTrainingRep.depthClassification)} ·{' '}
              {latestTrainingRep.achievedKneeFlexion >=
              baseline.averageKneeFlexion
                ? 'at or deeper than baseline'
                : 'shallower than baseline'}
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
      <p className="squat-notice">
        Depth target: {ACCEPTABLE_DEPTH_MIN_DEG}° knee bend · Head range: ±
        {HEAD_INCLINATION_LIMIT_DEG}° from upright
      </p>
      <p className="squat-notice" data-head-status={headStatus}>
        {HEAD_INCLINATION_LABELS[headStatus]}
        {headStatus !== 'unavailable' && head != null
          ? ` · ${head.toFixed(1)}°`
          : ''}
      </p>
      {(phase === 'warmup' || phase === 'training') && canMeasure && (
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
