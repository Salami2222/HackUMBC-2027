import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMeasurements } from '@/measurement/MeasurementProvider';
import {
  ACCEPTABLE_DEPTH_MIN_DEG,
  HEAD_INCLINATION_LIMIT_DEG,
  HEAD_INCLINATION_LABELS,
  classifyHeadInclination,
  analyzeWarmup,
  completeSquatRep,
  CompletedSquatRep,
  createSquatBaseline,
  loadSquatBaseline,
  saveSquatBaseline,
  SquatBaseline,
  SquatRepDetector,
  WarmupAnalysis,
  WARMUP_REP_COUNT,
} from '@/exercise/squat';

type Phase = 'idle' | 'warmup' | 'training' | 'result';

function depthLabel(classification: CompletedSquatRep['depthClassification']) {
  if (classification === 'acceptable') return 'Acceptable depth';
  if (classification === 'shallow') return 'Shallow';
  return 'Very shallow';
}

export function SquatSessionPanel() {
  const measurementState = useMeasurements();
  const [baseline, setBaseline] = useState<SquatBaseline | null>(() => {
    try {
      return typeof window === 'undefined'
        ? null
        : loadSquatBaseline(window.localStorage);
    } catch {
      return null;
    }
  });
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [warmupReps, setWarmupReps] = useState<CompletedSquatRep[]>([]);
  const warmupRepsRef = useRef<CompletedSquatRep[]>([]);
  const [trainingReps, setTrainingReps] = useState<CompletedSquatRep[]>([]);
  const trainingRepsRef = useRef<CompletedSquatRep[]>([]);
  const [result, setResult] = useState<WarmupAnalysis | null>(null);
  const [notice, setNotice] = useState('');
  const detector = useRef(new SquatRepDetector());
  const left = measurementState.measurements.find(
    (measurement) => measurement.id === 'leftKnee'
  )?.value;
  const right = measurementState.measurements.find(
    (measurement) => measurement.id === 'rightKnee'
  )?.value;
  const canMeasure =
    measurementState.referenceReady &&
    typeof left === 'number' &&
    Number.isFinite(left) &&
    typeof right === 'number' &&
    Number.isFinite(right);
  const head = measurementState.measurements.find(
    (measurement) => measurement.id === 'headInclination'
  )?.value;
  const headStatus = classifyHeadInclination(
    measurementState.referenceReady ? head : null
  );

  useEffect(() => {
    if (measurementState.referenceReady) return;
    detector.current.reset();
    if (phaseRef.current === 'warmup' || phaseRef.current === 'training') {
      if (phaseRef.current === 'warmup') {
        warmupRepsRef.current = [];
        setWarmupReps([]);
      }
      phaseRef.current = 'idle';
      setPhase('idle');
      setNotice('The upright reference changed. Recalibrate before recording.');
    }
  }, [measurementState.referenceReady]);

  useEffect(() => {
    if (phaseRef.current !== 'warmup' && phaseRef.current !== 'training')
      return;
    if (!canMeasure) {
      detector.current.reset();
      return;
    }
    const peaks = detector.current.ingest(
      left,
      right,
      measurementState.sampleTime
    );
    if (!peaks) return;
    if (phaseRef.current === 'warmup') {
      const next = [
        ...warmupRepsRef.current,
        completeSquatRep(
          warmupRepsRef.current.length + 1,
          peaks,
          measurementState.sampleTime
        ),
      ];
      warmupRepsRef.current = next;
      setWarmupReps(next);
      if (next.length === WARMUP_REP_COUNT) {
        const analysis = analyzeWarmup(next);
        phaseRef.current = 'result';
        setPhase('result');
        setResult(analysis);
        detector.current.reset();
        if (analysis.accepted) {
          const accepted = createSquatBaseline(
            analysis,
            measurementState.sampleTime
          );
          setBaseline(accepted);
          try {
            saveSquatBaseline(window.localStorage, accepted);
          } catch {
            setNotice('Baseline accepted, but this browser could not save it.');
          }
        }
      }
    } else {
      const next = [
        ...trainingRepsRef.current,
        completeSquatRep(
          trainingRepsRef.current.length + 1,
          peaks,
          measurementState.sampleTime
        ),
      ];
      trainingRepsRef.current = next;
      setTrainingReps(next);
    }
  }, [measurementState.sampleTime, canMeasure, left, right]);

  const startWarmup = () => {
    if (!canMeasure) return;
    detector.current.reset();
    warmupRepsRef.current = [];
    setWarmupReps([]);
    setResult(null);
    setNotice('');
    phaseRef.current = 'warmup';
    setPhase('warmup');
  };

  const startTraining = () => {
    if (!baseline || !canMeasure) return;
    detector.current.reset();
    trainingRepsRef.current = [];
    setTrainingReps([]);
    setNotice('');
    phaseRef.current = 'training';
    setPhase('training');
  };

  const stop = () => {
    detector.current.reset();
    phaseRef.current = 'idle';
    setPhase('idle');
    if (phase === 'warmup') {
      warmupRepsRef.current = [];
      setWarmupReps([]);
    }
  };

  const dismissResult = () => {
    phaseRef.current = 'idle';
    setPhase('idle');
    setResult(null);
  };

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
          <Link to="/calibration">Calibrate six measurement nodes</Link> and
          capture an upright reference before recording live reps.
        </p>
      )}
    </section>
  );
}
