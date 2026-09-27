import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { atom, useAtom, useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import {
  DataFeedMessage,
  DataFeedUpdateT,
  ResetType,
  TrackerStatus,
} from 'solarxr-protocol';
import { Vector3 } from 'three';
import { bonesAtom, flatTrackersAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { useReset } from '@/hooks/reset';
import { useMeasurements } from '@/measurement/MeasurementProvider';
import { useSquatSession } from '@/exercise/SquatSessionProvider';
import { FORM_LABELS } from '@/exercise/form-quality';
import { SetFeedback } from './SetFeedback';
import { PHASE_LABELS } from '@/exercise/squat-phase';
import { WORKING_SET_REP_COUNT } from '@/exercise/session-config';
import { FormTestSummary, formTestRepLabel } from './FormTestSummary';
import { SessionModeSelect } from './SessionModeSelect';
import {
  SkeletonPreviewView,
  SkeletonVisualizerWidget,
  setSkeletonView,
} from '@/components/widgets/SkeletonVisualizerWidget';
import { NodeOrientation } from './NodeOrientation';
import { nodeKey, nodePosition } from './node-positions';
import './PresentationDashboard.scss';

const PHASES = ['ready', 'descending', 'bottom', 'ascending'] as const;
const mascotEnabledAtom = atom(false);
export const PresentationPerformance = memo(function PresentationPerformance() {
  const session = useSquatSession();
  const {
    motion,
    phase,
    sessionMode,
    targetRepCount,
    trainingReps,
    formTestReps,
    formTestResult,
    canMeasure,
  } = session;
  const count =
    sessionMode === 'form-test' ? formTestReps.length : trainingReps.length;
  const complete =
    sessionMode === 'form-test'
      ? !!formTestResult
      : count === WORKING_SET_REP_COUNT && phase === 'idle';
  const current = canMeasure && !complete ? motion.phase : 'unavailable';
  const label = complete
    ? sessionMode === 'form-test'
      ? 'Test complete'
      : 'Set complete'
    : !canMeasure
      ? 'No tracking'
      : PHASE_LABELS[current];
  const active = phase !== 'idle';
  return (
    <aside
      className="presentation-performance"
      aria-label="Session performance"
      data-mode={sessionMode}
    >
      <div className="presentation-reps">
        <div className="presentation-stat-heading">
          {sessionMode === 'form-test' ? 'Form Test' : 'Working Set'}
          <button
            className="presentation-session-button"
            disabled={!active && !canMeasure}
            onClick={active ? session.stop : session.startSession}
          >
            {active ? 'Stop' : 'Start Session'}
          </button>
        </div>
        <div className="presentation-rep-count">
          {String(count).padStart(2, '0')} <span>/ {targetRepCount}</span>
        </div>
        <div className="presentation-rep-label">Reps</div>
        <p className="presentation-session-status" role="status">
          {active
            ? canMeasure
              ? 'Recording'
              : 'Tracking paused'
            : complete
              ? sessionMode === 'form-test'
                ? 'Three reps recorded'
                : 'Eight reps recorded'
              : sessionMode === 'form-test'
                ? 'Start a test to count reps'
                : 'Start a set to count reps'}
        </p>
      </div>
      {!(sessionMode === 'form-test' && formTestResult) && (
        <div className="presentation-phase">
          <p className="presentation-eyebrow">Squat phase</p>
          <div
            className="presentation-phase-value"
            data-phase={current}
            data-paused={motion.paused}
            role="status"
            aria-live="polite"
          >
            <span className="presentation-phase-arrow" aria-hidden="true">
              {current === 'descending'
                ? '↓'
                : current === 'ascending'
                  ? '↑'
                  : current === 'bottom'
                    ? '↕'
                    : complete
                      ? '✓'
                      : '—'}
            </span>
            <strong
              key={`${current}:${complete}`}
              className="presentation-phase-word"
            >
              {label}
            </strong>
          </div>
          <ol className="presentation-phase-track" aria-label="Squat phase">
            {PHASES.map((item) => (
              <li
                key={item}
                data-current={item === current}
                aria-current={item === current ? 'step' : undefined}
              >
                <span aria-hidden="true" />
                {PHASE_LABELS[item]}
              </li>
            ))}
          </ol>
        </div>
      )}
      {sessionMode === 'form-test' ? (
        <section
          className="presentation-form presentation-form-test"
          aria-label="Form Test measured form"
        >
          {formTestResult ? (
            <FormTestSummary
              result={formTestResult}
              onRunAgain={session.startSession}
              canMeasure={canMeasure}
            />
          ) : (
            <>
              <p className="presentation-eyebrow">Measured form</p>
              <p>Three reps · Inward knees, symmetry, torso, depth and head</p>
              <ol className="presentation-form-test-reps">
                {Array.from({ length: targetRepCount }, (_, index) => {
                  const rep = formTestReps[index];
                  return (
                    <li key={index}>
                      <span>Rep {index + 1}</span>
                      <strong>{rep ? formTestRepLabel(rep) : '—'}</strong>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          <SetFeedback />
        </section>
      ) : (
        <section
          className="presentation-form"
          aria-label="Form across eight reps"
        >
          <div className="form-chart-heading">
            <p className="presentation-eyebrow">Measured form</p>
            <SetFeedback />
          </div>
          <div
            className="presentation-form-chart"
            role="img"
            aria-label="Form graph with eight rep divisions and Optimal, Sub-optimal and Needs attention bands. Completed rep scores cover measured movement only."
          >
            <div className="presentation-form-plot" aria-hidden="true">
              <div className="presentation-form-band is-optimal">
                <span>Optimal</span>
              </div>
              <div className="presentation-form-band is-suboptimal">
                <span>Sub-optimal</span>
              </div>
              <div className="presentation-form-band is-attention">
                <span>Needs attention</span>
              </div>
              <svg
                className="form-score-trace"
                viewBox="0 0 800 300"
                preserveAspectRatio="none"
                aria-label="Completed rep scores"
              >
                {session.formReps.map((rep, i, all) => {
                  // The vertical bands are categories, not a linear numeric axis.
                  // Within each band, the unmodified weighted score sets the height.
                  const y = (score: number, rating: string) =>
                    (rating === 'optimal'
                      ? 0
                      : rating === 'suboptimal'
                        ? 100
                        : 200) +
                    32 +
                    (100 - score) * 0.6;
                  const x = 50 + i * 100;
                  const previous = all[i - 1];
                  return (
                    <g key={rep.rep}>
                      {rep.score != null && previous?.score != null && (
                        <line
                          x1={x - 100}
                          y1={y(previous.score, previous.rating)}
                          x2={x}
                          y2={y(rep.score, rep.rating)}
                        />
                      )}
                      {rep.score != null ? (
                        <circle
                          cx={x}
                          cy={Math.max(
                            8,
                            Math.min(292, y(rep.score, rep.rating))
                          )}
                          r="5"
                          data-rating={rep.rating}
                        >
                          <title>
                            Rep {rep.rep}: {FORM_LABELS[rep.rating]},{' '}
                            {rep.score}
                            /100; {Math.round(rep.coverage * 100)}% data
                            coverage
                          </title>
                        </circle>
                      ) : (
                        <text x={x} y="282" textAnchor="middle">
                          ?<title>Rep {rep.rep}: insufficient data</title>
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <div className="presentation-rep-grid">
                {Array.from({ length: 8 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
            <div className="presentation-rep-axis" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <span className="presentation-axis-title" aria-hidden="true">
              Rep
            </span>
          </div>
        </section>
      )}
    </aside>
  );
});

export function PresentationDashboard({
  headerTarget,
}: {
  headerTarget: HTMLElement | null;
}) {
  const { isConnected, useDataFeedPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom);
  const bones = useAtomValue(bonesAtom);
  const measurements = useMeasurements();
  const session = useSquatSession();
  const received = useRef({ trackers: 0, bones: 0 });
  const view = useRef<SkeletonPreviewView | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [now, setNow] = useState(Date.now);
  const [viewMode, setViewMode] = useState<'Front' | 'Side' | '3D'>('3D');
  const [resetMessage, setResetMessage] = useState('');
  const [mascotEnabled, setMascotEnabled] = useAtom(mascotEnabledAtom);
  const reset = useReset(
    { type: ResetType.Full },
    () =>
      setResetMessage(
        'Upright reset confirmed. Capture a new reference after orientation.'
      ),
    () => setResetMessage('Reset interrupted. Check your nodes and retry.')
  );
  useDataFeedPacket(
    DataFeedMessage.DataFeedUpdate,
    (packet: DataFeedUpdateT) => {
      if (packet.index === 0) received.current.trackers = Date.now();
      if (packet.index === 1) received.current.bones = Date.now();
    }
  );
  useEffect(() => {
    received.current = { trackers: 0, bones: 0 };
  }, [isConnected]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const assigned = trackers.filter(
    ({ tracker }) =>
      tracker.info?.isImu &&
      !tracker.info.isComputed &&
      nodePosition(tracker.info.bodyPart) &&
      tracker.status === TrackerStatus.OK &&
      (tracker.tps ?? 0) > 0
  );
  const fresh = isConnected && now - received.current.trackers < 3000;
  const ready = fresh && assigned.length > 0;
  const live = ready && now - received.current.bones < 3000 && bones.length > 0;
  const canCapture =
    measurements.coreReady &&
    measurements.oriented &&
    !measurements.capturing &&
    !reset.disabled;
  const active = session.phase !== 'idle';
  const actions = (
    <div className="presentation-actions">
      <span className={`presentation-feed-state ${live ? 'is-live' : ''}`}>
        <i />
        {live ? 'Live' : 'No live pose'}
      </span>
      <details
        className="presentation-quick-menu"
        ref={menu}
        onKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('dialog'))
            return;
          if (event.key === 'Escape') {
            event.stopPropagation();
            if (menu.current) {
              menu.current.open = false;
              menu.current.querySelector('summary')?.focus();
            }
          }
        }}
      >
        <summary aria-label="Session and calibration options">•••</summary>
        <div className="presentation-menu-content">
          <button
            role="switch"
            aria-checked={mascotEnabled}
            className="presentation-mascot-toggle"
            onClick={() => setMascotEnabled((enabled) => !enabled)}
          >
            <span>School mascot</span>
            <span aria-hidden="true">{mascotEnabled ? 'On' : 'Off'}</span>
          </button>
          <SessionModeSelect id="presentation-session-type" />
          <button
            disabled={!session.canMeasure || active}
            onClick={session.startSession}
          >
            Start{' '}
            {session.sessionMode === 'form-test' ? 'Form Test' : 'Working Set'}
          </button>
          <button disabled={!active} onClick={session.stop}>
            Stop session
          </button>
          <p>{session.jevStatus}</p>
          {session.notice && <p role="status">{session.notice}</p>}
          <NodeOrientation
            ready={
              ready &&
              !measurements.capturing &&
              !measurements.migrationRequired
            }
            nodeCount={fresh ? assigned.length : 0}
            blockedReason={
              measurements.capturing
                ? 'Finish reference capture first.'
                : measurements.migrationRequired
                  ? measurements.message
                  : 'Connect and assign a node in Sensor Calibration.'
            }
            otherResetBusy={reset.disabled}
            configurationKey={assigned
              .map(
                ({ tracker }) => `${nodeKey(tracker)}:${tracker.info?.bodyPart}`
              )
              .sort()
              .join('|')}
            onStart={() => {
              setResetMessage('');
              measurements.invalidate();
            }}
            onComplete={measurements.confirmOrientation}
          />
          <button
            disabled={!ready || reset.disabled || measurements.capturing}
            onClick={() => {
              measurements.invalidateReference();
              setResetMessage('Stand upright and hold still.');
              reset.triggerReset();
            }}
          >
            {reset.status === 'counting'
              ? `Resetting ${reset.timer}`
              : 'Reset upright pose'}
          </button>
          <button
            disabled={!canCapture}
            onClick={() => {
              setResetMessage('');
              measurements.captureReference();
            }}
          >
            {measurements.capturing ? 'Hold still…' : 'Capture reference'}
          </button>
          {measurements.capturing && (
            <button onClick={measurements.cancelReference}>
              Cancel capture
            </button>
          )}
          <p role="status">{resetMessage || measurements.message}</p>
          <Link to="/calibration">Sensor setup</Link>
          <Link to="/tracking">Tracking diagnostics</Link>
        </div>
      </details>
    </div>
  );
  return (
    <main className="presentation-screen" aria-label="Presentation">
      {headerTarget ? createPortal(actions, headerTarget) : actions}
      <section className="presentation-viewport" aria-label="Live IK viewport">
        <div className="presentation-canvas">
          {live ? (
            <SkeletonVisualizerWidget
              floorAnchored
              appearance={mascotEnabled ? 'mascot' : 'skeleton'}
              onInit={(context) => {
                view.current =
                  context.addView({
                    left: 0,
                    bottom: 0,
                    width: 1,
                    height: 1,
                    position: new Vector3(2.5, 1.9, -2.8),
                    onHeightChange(v, height) {
                      setSkeletonView(v, v.framing?.mode ?? '3D', height);
                    },
                  }) ?? null;
                setViewMode('3D');
              }}
            />
          ) : (
            <div className="presentation-empty" role="status">
              <span aria-hidden="true">◎</span>
              <strong>
                {isConnected
                  ? 'Waiting for live tracking'
                  : 'Tracking service offline'}
              </strong>
              <Link to="/calibration">Connect your nodes</Link>
            </div>
          )}
        </div>
        <div
          className="presentation-view-controls"
          role="group"
          aria-label="Presentation skeleton view"
        >
          {(['Front', 'Side', '3D'] as const).map((mode) => (
            <button
              key={mode}
              disabled={!live}
              aria-pressed={viewMode === mode}
              onClick={() => {
                if (view.current) {
                  setSkeletonView(view.current, mode);
                  setViewMode(mode);
                }
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>
      <PresentationPerformance />
    </main>
  );
}
