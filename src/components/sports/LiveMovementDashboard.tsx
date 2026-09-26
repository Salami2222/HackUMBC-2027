import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import {
  AssignTrackerRequestT,
  BodyPart,
  DataFeedMessage,
  DataFeedUpdateT,
  ResetType,
  RpcMessage,
  TrackerDataT,
  TrackerStatus,
} from 'solarxr-protocol';
import { Vector3 } from 'three';
import { bonesAtom, flatTrackersAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { useReset } from '@/hooks/reset';
import { QuaternionToEulerDegrees } from '@/maths/quaternion';
import {
  SkeletonPreviewView,
  SkeletonVisualizerWidget,
} from '@/components/widgets/SkeletonVisualizerWidget';
import './SportsDashboard.scss';
import { UnknownDeviceModal } from '@/components/UnknownDeviceModal';

function trackerKey(tracker: TrackerDataT) {
  return `${tracker.trackerId?.deviceId?.id}:${tracker.trackerId?.trackerNum}`;
}

function trackerName(tracker: TrackerDataT) {
  return String(
    tracker.info?.customName || tracker.info?.displayName || 'IMU tracker'
  );
}

export function LiveMovementDashboard() {
  const { isConnected, sendRPCPacket, useDataFeedPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom).filter(
    ({ tracker }) => tracker.info?.isImu && !tracker.info.isComputed
  );
  const bones = useAtomValue(bonesAtom);
  const [selectedKey, setSelectedKey] = useState('');
  const [now, setNow] = useState(Date.now);
  const [assignment, setAssignment] = useState<{
    key: string;
    sentAt: number;
  } | null>(null);
  const [calibrationMessage, setCalibrationMessage] = useState('');
  const received = useRef({ trackers: 0, bones: 0 });
  const view = useRef<SkeletonPreviewView | null>(null);
  const reset = useReset(
    { type: ResetType.Full },
    () =>
      setCalibrationMessage(
        'SlimeVR confirmed the full reset. Chest orientation is ready.'
      ),
    () =>
      setCalibrationMessage(
        'Reset was not completed. Check the tracker and retry.'
      )
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

  const available = trackers.filter(
    ({ tracker }) => tracker.status === TrackerStatus.OK
  );
  const selected = selectedKey
    ? trackers.find(({ tracker }) => trackerKey(tracker) === selectedKey)
        ?.tracker
    : (
        available.find(
          ({ tracker }) => tracker.info?.bodyPart === BodyPart.CHEST
        ) ?? (available.length === 1 ? available[0] : undefined)
      )?.tracker;
  const fresh = isConnected && now - received.current.trackers < 3000;
  const assigned = selected?.info?.bodyPart === BodyPart.CHEST;
  const rotation = selected?.rotationReferenceAdjusted ?? selected?.rotation;
  const live =
    fresh && assigned && selected?.status === TrackerStatus.OK && !!rotation;
  const skeletonLive =
    live && now - received.current.bones < 3000 && bones.length > 0;
  const angles = live ? QuaternionToEulerDegrees(rotation) : null;
  const assignedConfirmation =
    assignment &&
    trackers.some(
      ({ tracker }) =>
        trackerKey(tracker) === assignment.key &&
        tracker.info?.bodyPart === BodyPart.CHEST
    );
  const assignmentPending =
    assignment && !assignedConfirmation && now - assignment.sentAt < 5000;
  const status = !isConnected
    ? 'Waiting for SlimeVR server'
    : !fresh
      ? 'Waiting for fresh tracking data'
      : !available.length
        ? 'Waiting for a connected tracker'
        : !selected
          ? 'Choose your chest tracker'
          : !assigned
            ? 'Assign this tracker to chest'
            : !live
              ? 'Chest tracker is not streaming'
              : 'Live chest orientation';

  const assignChest = () => {
    if (!selected?.trackerId || !fresh || selected.status !== TrackerStatus.OK)
      return;
    const request = new AssignTrackerRequestT();
    request.trackerId = selected.trackerId;
    request.bodyPosition = BodyPart.CHEST;
    request.allowDriftCompensation =
      selected.info?.allowDriftCompensation ?? false;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, request);
    setAssignment({ key: trackerKey(selected), sentAt: Date.now() });
  };
  const setView = (position: Vector3) => {
    if (!view.current) return;
    view.current.camera.position.copy(position);
    view.current.controls.update();
  };

  return (
    <div className="sports-app">
      <UnknownDeviceModal />
      <header className="sports-header">
        <div className="sports-brand">
          <div className="brand-mark">
            M<span>•</span>
          </div>
          <div>
            <strong>MOTIONLAB</strong>
            <small>PERFORMANCE ANALYSIS</small>
          </div>
        </div>
        <div className="sports-header-center">Movement intelligence</div>
        <div className="sports-header-right">
          <span className={live ? 'live-dot' : ''} />
          {live ? 'LIVE TRACKER' : 'LIVE MODE / WAITING'}
          <Link to="/demo">DEMO</Link>
          <Link to="/slimevr">SLIMEVR HOME ↗</Link>
        </div>
      </header>
      <main className="sports-content">
        <div className="sports-heading">
          <div>
            <div className="eyebrow">HARDWARE SESSION / CHEST</div>
            <h1>Movement overview</h1>
            <p>Real tracker orientation through SlimeVR.</p>
          </div>
          <div className="sports-controls">
            <label className="exercise-select">
              TRACKER
              <select
                aria-label="Chest tracker"
                value={selected ? trackerKey(selected) : ''}
                onChange={(event) => {
                  setSelectedKey(event.target.value);
                  setAssignment(null);
                  setCalibrationMessage('');
                }}
              >
                <option value="">
                  {available.length ? 'Choose tracker' : 'No tracker detected'}
                </option>
                {trackers.map(({ tracker }) => (
                  <option key={trackerKey(tracker)} value={trackerKey(tracker)}>
                    {trackerName(tracker)} / {TrackerStatus[tracker.status]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              onClick={assignChest}
              disabled={
                !fresh ||
                !selected ||
                selected.status !== TrackerStatus.OK ||
                assigned ||
                !!assignmentPending
              }
            >
              {assigned
                ? 'Assigned to chest'
                : assignmentPending
                  ? 'Assigning…'
                  : 'Assign to chest'}
            </button>
            <button
              className="secondary-button"
              disabled={!live || reset.disabled}
              onClick={() => {
                setCalibrationMessage(
                  'Stand upright and face forward while SlimeVR resets.'
                );
                reset.triggerReset();
              }}
            >
              {reset.status === 'counting'
                ? `Resetting ${reset.timer}`
                : 'Reset upright pose'}
            </button>
          </div>
        </div>
        <div className="live-connection-note" role="status">
          <strong>{status}.</strong>{' '}
          {live
            ? 'Chest is measured; the rest of the skeleton is estimated by SlimeVR.'
            : 'Power on the tracker. ESP trackers need a Wi-Fi connection to this computer; USB is used for setup.'}
          {isConnected && !available.length && (
            <Link to="/onboarding/wifi-creds"> Open tracker setup ↗</Link>
          )}
          {assignment && !assignedConfirmation && !assignmentPending && (
            <p>Assignment was not confirmed. Check the connection and retry.</p>
          )}
          {calibrationMessage && <p>{calibrationMessage}</p>}
        </div>
        <section className="sports-hero">
          <div className="sports-panel viewport-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">01 / LIVE MOVEMENT</span>
                <h2>Skeleton tracking</h2>
              </div>
              <span className="panel-tag">SLIMEVR VISUALIZER</span>
            </div>
            <div className="sports-viewport">
              {skeletonLive ? (
                <SkeletonVisualizerWidget
                  onInit={(context) => {
                    view.current =
                      context.addView({
                        left: 0,
                        bottom: 0,
                        width: 1,
                        height: 1,
                        position: new Vector3(2.5, 1.9, -2.8),
                        onHeightChange(v, height) {
                          v.controls.target.set(0, height / 2.2, 0);
                          v.camera.zoom = 1 / (Math.max(1, height) / 1.55);
                          v.camera.updateProjectionMatrix();
                        },
                      }) ?? null;
                  }}
                />
              ) : (
                <div className="live-empty-state">
                  <h3>{status}</h3>
                  <p>No simulated movement is shown in live mode.</p>
                </div>
              )}
              <div className="viewport-status">
                {skeletonLive
                  ? 'LIVE CHEST / ESTIMATED SKELETON'
                  : 'NO LIVE POSE'}
              </div>
            </div>
            <div className="viewport-footer">
              <div>{fresh ? available.length : 0} TRACKERS CONNECTED</div>
              <div className="view-buttons">
                <button
                  disabled={!skeletonLive}
                  onClick={() => setView(new Vector3(0, 1.3, -4))}
                >
                  FRONT
                </button>
                <button
                  disabled={!skeletonLive}
                  onClick={() => setView(new Vector3(4, 1.3, 0))}
                >
                  SIDE
                </button>
                <button
                  disabled={!skeletonLive}
                  onClick={() => setView(new Vector3(2.5, 1.9, -2.8))}
                >
                  3D
                </button>
              </div>
            </div>
          </div>
          <div className="sports-panel metrics-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">02 / CHEST ORIENTATION</span>
                <h2>Live movement</h2>
              </div>
              <span className="panel-tag">
                {live ? 'STREAMING' : 'WAITING'}
              </span>
            </div>
            <div className="metrics-grid">
              {(['x', 'y', 'z'] as const).map((axis, index) => (
                <div className="sports-metric" key={axis}>
                  <span className="metric-label">
                    {['PITCH', 'YAW', 'ROLL'][index]}
                  </span>
                  <div className="metric-value" data-testid={`chest-${axis}`}>
                    {angles ? angles[axis].toFixed(1) : '—'}
                    <span>°</span>
                  </div>
                  <span className="metric-note">
                    {selected?.rotationReferenceAdjusted
                      ? 'SlimeVR adjusted'
                      : 'Tracker orientation'}
                  </span>
                </div>
              ))}
              {['KNEE ANGLES', 'REP COUNT', 'FORM SCORE'].map((label) => (
                <div className="sports-metric" key={label}>
                  <span className="metric-label">{label}</span>
                  <div className="metric-value">—</div>
                  <span className="metric-note">
                    Unavailable with this setup
                  </span>
                </div>
              ))}
            </div>
            <div className="live-measurement-note">
              <h3>One tracker, chest orientation</h3>
              <p>
                Attach the tracker securely to your chest, stand upright, then
                reset the upright pose. These angles describe orientation, not a
                validated lifting score.
              </p>
              <p>
                Other body segments are inferred. A single chest IMU cannot
                measure your knees, squat depth, or full-body form.
              </p>
            </div>
          </div>
        </section>
        <footer className="sports-footer">
          MOTIONLAB / LIVE HARDWARE
          <span>
            {isConnected
              ? 'SlimeVR server connected'
              : 'SlimeVR server disconnected'}
          </span>
        </footer>
      </main>
    </div>
  );
}
