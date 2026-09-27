import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BodyPart, DataFeedMessage, DataFeedUpdateT } from 'solarxr-protocol';
import { useMeasurements } from '@/measurement/MeasurementProvider';
import { floorOffset } from '@/measurement/floor';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { SquatPhaseDetector, SESSION_REPS, PhaseSample } from './squat-phase';
import { FormAnalyzer, FormRep, summarizeForm } from './form-quality';
import { PhaseAdviser } from './phase-adviser';
import { FormAdviser } from './form-adviser';
import {
  classifyHeadInclination,
  analyzeWarmup,
  completeSquatRep,
  CompletedSquatRep,
  createSquatBaseline,
  loadSquatBaseline,
  saveSquatBaseline,
  SquatBaseline,
  WarmupAnalysis,
  WARMUP_REP_COUNT,
} from './squat';
type Phase = 'idle' | 'warmup' | 'training' | 'result';
function useSessionState() {
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
  const detector = useRef(new SquatPhaseDetector());
  const formAnalyzer = useRef(new FormAnalyzer());
  const formAdviser = useRef(new FormAdviser());
  const [formReps, setFormReps] = useState<FormRep[]>([]);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const formSummary = useMemo(() => summarizeForm(formReps), [formReps]);
  const left = measurementState.measurements.find(
    (measurement) => measurement.id === 'leftKnee'
  )?.value;
  const right = measurementState.measurements.find(
    (measurement) => measurement.id === 'rightKnee'
  )?.value;
  const canMeasure =
    measurementState.referenceReady &&
    Date.now() - measurementState.sampleTime <= 500 &&
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

  const [motion, setMotion] = useState(() => detector.current.state);
  const adviser = useRef(new PhaseAdviser());
  const samples = useRef<PhaseSample[]>([]);
  const lastSample = useRef(0);
  const headFrame = useRef({ at: 0, height: null as number | null });
  const { useDataFeedPacket } = useWebsocketAPI();
  useDataFeedPacket(
    DataFeedMessage.DataFeedUpdate,
    (packet: DataFeedUpdateT) => {
      if (packet.index !== 1) return;
      const bones = new Map(packet.bones.map((bone) => [bone.bodyPart, bone]));
      const floor = floorOffset(bones);
      const headY = bones.get(BodyPart.HEAD)?.headPositionG?.y;
      headFrame.current = {
        at: Date.now(),
        height: floor != null && headY != null ? headY + floor : null,
      };
    }
  );
  const resetMotion = (reason?: string) => {
    detector.current.reset(reason);
    formAnalyzer.current.reset();
    formAdviser.current.reset();
    adviser.current.reset();
    samples.current = [];
    lastSample.current = 0;
    setMotion({ ...detector.current.state });
  };
  useEffect(
    () => () => {
      adviser.current.reset();
      formAdviser.current.reset();
    },
    []
  );
  useEffect(() => {
    resetMotion();
    if (phaseRef.current === 'warmup' || phaseRef.current === 'training') {
      if (phaseRef.current === 'warmup') {
        warmupRepsRef.current = [];
        setWarmupReps([]);
      }
      if (phaseRef.current === 'training') setEndedAt(Date.now());
      phaseRef.current = 'idle';
      setPhase('idle');
      setNotice('The upright reference changed. Recalibrate before recording.');
    }
  }, [measurementState.referenceReady, measurementState.referenceCapturedAt]);

  useEffect(() => {
    if (!canMeasure) {
      if (lastSample.current || detector.current.state.phase !== 'unavailable')
        resetMotion(
          'Tracking unavailable. Stand upright when tracking returns.'
        );
      return;
    }
    const at = measurementState.sampleTime;
    if (at <= lastSample.current) return;
    if (lastSample.current && at - lastSample.current > 500) resetMotion();
    lastSample.current = at;
    const sample: PhaseSample = {
      at,
      left: left!,
      right: right!,
      headHeight:
        typeof head === 'number' && Math.abs(at - headFrame.current.at) <= 150
          ? headFrame.current.height
          : null,
    };
    samples.current = [
      ...samples.current.filter((s) => at - s.at <= 2000),
      sample,
    ].slice(-40);
    const previous = detector.current.state.phase;
    const peaks = detector.current.ingest(sample, adviser.current.advice);
    if (previous !== detector.current.state.phase) adviser.current.reset();
    setMotion({ ...detector.current.state });
    if (phaseRef.current === 'training') {
      if (
        previous !== detector.current.state.phase &&
        ['descending', 'unavailable'].includes(detector.current.state.phase)
      )
        formAdviser.current.reset();
      formAnalyzer.current.observe({
        at,
        phase: detector.current.state.phase,
        values: Object.fromEntries(
          measurementState.measurements.map((m) => [m.id, m.value])
        ),
      });
      if (!peaks && detector.current.state.phase === 'ascending')
        void formAdviser.current.request(
          formAnalyzer.current.review(trainingRepsRef.current.length + 1)
        );
    }
    // Only explicitly started sets request paid advice.
    if (phaseRef.current === 'warmup' || phaseRef.current === 'training')
      void adviser.current.request(
        samples.current,
        detector.current.state.phase
      );
    if (phaseRef.current !== 'warmup' && phaseRef.current !== 'training')
      return;
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
        resetMotion();
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
      const completed = next.at(-1)!;
      const measured = formAnalyzer.current.finish(
        completed.rep,
        completed.achievedKneeFlexion,
        at
      );
      const assessment = formAdviser.current.finalize(measured);
      setFormReps((previous) => [...previous, assessment]);
      trainingRepsRef.current = next;
      setTrainingReps(next);
      if (next.length >= SESSION_REPS) {
        phaseRef.current = 'idle';
        setPhase('idle');
        adviser.current.reset();
        setNotice('Set complete. Eight reps recorded.');
        setEndedAt(at);
      }
    }
  }, [
    measurementState.sampleTime,
    measurementState.measurements,
    canMeasure,
    left,
    right,
    head,
  ]);

  const startWarmup = () => {
    if (!canMeasure) return;
    resetMotion();
    warmupRepsRef.current = [];
    setWarmupReps([]);
    setResult(null);
    setNotice('');
    phaseRef.current = 'warmup';
    setPhase('warmup');
  };

  const startPresentationSet = () => {
    if (!canMeasure) return;
    setFormReps([]);
    setEndedAt(null);
    resetMotion();
    warmupRepsRef.current = [];
    setWarmupReps([]);
    trainingRepsRef.current = [];
    setTrainingReps([]);
    setNotice('');
    setResult(null);
    phaseRef.current = 'training';
    setPhase('training');
  };

  const startTraining = () => {
    if (!baseline) return;
    startPresentationSet();
  };

  const stop = () => {
    if (phaseRef.current === 'training') setEndedAt(Date.now());
    resetMotion();
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

  return {
    baseline,
    formReps,
    formSummary,
    endedAt,
    phase,
    warmupReps,
    trainingReps,
    result,
    notice,
    canMeasure,
    head,
    headStatus,
    motion,
    jevStatus: adviser.current.status,
    startWarmup,
    startTraining,
    startPresentationSet,
    stop,
    dismissResult,
  };
}
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(
  null
);
export function SquatSessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSquatSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SquatSessionProvider is required');
  return value;
}
