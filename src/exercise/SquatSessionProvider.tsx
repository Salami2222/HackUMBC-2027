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
import { SquatPhaseDetector, PhaseSample } from './squat-phase';
import { FormAnalyzer, FormRep, summarizeForm } from './form-quality';
import { PhaseAdviser } from './phase-adviser';
import { FormAdviser } from './form-adviser';
import {
  classifyHeadInclination,
  completeSquatRep,
  CompletedSquatRep,
} from './squat';
import { FormTestRepResult, FormTestResult } from './form-test';
import { recordFormTestRep, recordWorkingSetRep } from './session-recording';
import { SessionMode, targetRepCount } from './session-config';

type Phase = 'idle' | SessionMode;

function useSessionState() {
  const measurementState = useMeasurements();
  const [sessionMode, setSelectedMode] = useState<SessionMode>('working-set');
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [formTestReps, setFormTestReps] = useState<FormTestRepResult[]>([]);
  const formTestRepsRef = useRef<FormTestRepResult[]>([]);
  const [formTestResult, setFormTestResult] = useState<FormTestResult | null>(
    null
  );
  const [trainingReps, setTrainingReps] = useState<CompletedSquatRep[]>([]);
  const trainingRepsRef = useRef<CompletedSquatRep[]>([]);
  const [notice, setNotice] = useState('');
  const detector = useRef(new SquatPhaseDetector());
  const formAnalyzer = useRef(new FormAnalyzer());
  const formAdviser = useRef(new FormAdviser());
  const [formReps, setFormReps] = useState<FormRep[]>([]);
  const formRepsRef = useRef<FormRep[]>([]);
  const [feedbackReps, setFeedbackReps] = useState<FormRep[]>([]);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const formSummary = useMemo(
    () => summarizeForm(feedbackReps),
    [feedbackReps]
  );
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
    if (phaseRef.current !== 'idle') {
      setFeedbackReps(
        phaseRef.current === 'form-test'
          ? formTestRepsRef.current.map((rep) => rep.assessment)
          : formRepsRef.current
      );
      setEndedAt(Date.now());
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
    if (phaseRef.current !== 'idle') {
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
          formAnalyzer.current.review(
            (phaseRef.current === 'form-test'
              ? formTestRepsRef.current.length
              : trainingRepsRef.current.length) + 1
          )
        );
    }
    if (phaseRef.current !== 'idle')
      void adviser.current.request(
        samples.current,
        detector.current.state.phase
      );
    if (!peaks || phaseRef.current === 'idle') return;

    const repNumber =
      (phaseRef.current === 'form-test'
        ? formTestRepsRef.current.length
        : trainingRepsRef.current.length) + 1;
    const completed = completeSquatRep(repNumber, peaks, at);
    const assessment = formAdviser.current.finalize(
      formAnalyzer.current.finish(repNumber, completed.achievedKneeFlexion, at)
    );

    if (phaseRef.current === 'form-test') {
      const recorded = recordFormTestRep(formTestRepsRef.current, assessment);
      formTestRepsRef.current = recorded.reps;
      setFormTestReps(recorded.reps);
      if (recorded.result) {
        phaseRef.current = 'idle';
        setPhase('idle');
        setFormTestResult(recorded.result);
        setFeedbackReps(recorded.reps.map((rep) => rep.assessment));
        setEndedAt(at);
        resetMotion();
      }
    } else {
      const recorded = recordWorkingSetRep(trainingRepsRef.current, peaks, at);
      const next = recorded.reps;
      formRepsRef.current = [...formRepsRef.current, assessment];
      setFormReps(formRepsRef.current);
      trainingRepsRef.current = next;
      setTrainingReps(next);
      if (recorded.complete) {
        phaseRef.current = 'idle';
        setPhase('idle');
        adviser.current.reset();
        setNotice('Set complete. Eight reps recorded.');
        setFeedbackReps(formRepsRef.current);
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

  const selectSessionMode = (mode: SessionMode) => {
    if (phaseRef.current !== 'idle') return;
    setSelectedMode(mode);
    setNotice('');
  };

  const startSession = () => {
    if (!canMeasure || phaseRef.current !== 'idle') return;
    resetMotion();
    setNotice('');
    setEndedAt(null);
    if (sessionMode === 'form-test') {
      formTestRepsRef.current = [];
      setFormTestReps([]);
      setFormTestResult(null);
    } else {
      setFormReps([]);
      formRepsRef.current = [];
      trainingRepsRef.current = [];
      setTrainingReps([]);
    }
    phaseRef.current = sessionMode;
    setPhase(sessionMode);
  };

  const stop = () => {
    if (phaseRef.current === 'idle') return;
    setFeedbackReps(
      phaseRef.current === 'form-test'
        ? formTestRepsRef.current.map((rep) => rep.assessment)
        : formRepsRef.current
    );
    setEndedAt(Date.now());
    resetMotion();
    phaseRef.current = 'idle';
    setPhase('idle');
  };

  return {
    sessionMode,
    selectSessionMode,
    targetRepCount: targetRepCount(sessionMode),
    formTestReps,
    formTestResult,
    trainingReps,
    formReps,
    feedbackReps,
    formSummary,
    endedAt,
    phase,
    notice,
    canMeasure,
    head,
    headStatus,
    motion,
    jevStatus: adviser.current.status,
    startSession,
    stop,
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
