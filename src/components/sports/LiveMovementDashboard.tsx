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
import { NodeSetup } from './NodeSetup';
import { NodePicker } from './NodePicker';

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
  const [setupOpen, setSetupOpen] = useState(false);
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
        'Upright pose reset confirmed. Chest orientation is ready.'
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
        ) ??
        (available.length === 1 ? available[0] : undefined) ??
        trackers.find(
          ({ tracker }) => tracker.info?.bodyPart === BodyPart.CHEST
        ) ??
        (trackers.length === 1 ? trackers[0] : undefined)
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
    ? 'Waiting for the local tracking service'
    : !fresh
      ? 'Waiting for fresh tracking data'
      : !available.length
        ? trackers.length
          ? 'Your node is offline'
          : 'Waiting for your first node'
        : !selected
          ? 'Choose your chest node'
          : !assigned
            ? 'Assign this node to chest'
            : !live
              ? 'Chest node is not streaming'
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
    <div className="sports-app live-dashboard">
      <header className="sports-header">
        <div className="sports-brand">
          <div className="brand-mark">M</div>
          <div>
            <strong>MotionLab</strong>
            <small>Movement studio</small>
          </div>
        </div>
        <div className="sports-header-center">Live tracking</div>
        <div className="sports-header-right">
          <span className={live ? 'live-dot' : ''} />
          <span>{live ? 'Tracking live' : 'Awaiting connection'}</span>
          <Link to="/demo">Open demo</Link>
        </div>
      </header>
      <main className="sports-content">
        <div className="sports-heading">
          <div>
            <div className="eyebrow">Hardware overview</div>
            <h1>Live movement</h1>
            <p>Connect a node to see your chest orientation in real time.</p>
          </div>
        </div>
        <section
          className="sports-panel control-panel"
          aria-label="Session controls"
        >
          <div className="control-panel-intro">
            <div>
              <span className="panel-index">SETUP</span>
              <h2>Session controls</h2>
            </div>
            <p>
              Choose a node, assign it to your chest, then reset your upright
              pose.
            </p>
          </div>
          <div className="sports-controls">
            <NodePicker
              label="Chest node"
              value={selected ? trackerKey(selected) : ''}
              placeholder={
                trackers.length ? 'Choose a node' : 'No nodes added yet'
              }
              onChange={(value) => {
                setSelectedKey(value);
                setAssignment(null);
                setCalibrationMessage('');
              }}
              options={trackers.map(({ tracker }) => ({
                value: trackerKey(tracker),
                label: trackerName(tracker).replace(/^Tracker\s+/, 'Node '),
                detail: !fresh
                  ? 'Offline'
                  : tracker.status === TrackerStatus.OK
                    ? 'Online'
                    : tracker.status === TrackerStatus.BUSY
                      ? 'Starting'
                      : tracker.status === TrackerStatus.ERROR
                        ? 'Needs attention'
                        : 'Offline',
              }))}
            />
            <button
              className="secondary-button"
              onClick={() => setSetupOpen(!setupOpen)}
              aria-expanded={setupOpen}
              aria-controls="node-setup-content"
            >
              Connect nodes
            </button>
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
                  'Stand upright and face forward while your pose resets.'
                );
                reset.triggerReset();
              }}
            >
              {reset.status === 'counting'
                ? `Resetting ${reset.timer}`
                : 'Reset upright pose'}
            </button>
          </div>
        </section>
        <NodeSetup open={setupOpen} onToggle={() => setSetupOpen(!setupOpen)} />
        <div className="live-connection-note" role="status">
          <strong>{status}.</strong>{' '}
          {live
            ? 'Chest is measured; the rest of the skeleton is estimated.'
            : 'Turn on your node and connect to the same Wi-Fi as this computer. Use Connect nodes for first-time setup.'}
          {assignment && !assignedConfirmation && !assignmentPending && (
            <p>Assignment was not confirmed. Check the connection and retry.</p>
          )}
          {calibrationMessage && <p>{calibrationMessage}</p>}
        </div>
        <section className="sports-hero">
          <div className="sports-panel viewport-panel">
            <div className="panel-top">
              <div>
                <span className="panel-index">MOVEMENT</span>
                <h2>Skeleton view</h2>
              </div>
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
              <div>{fresh ? available.length : 0} NODES ONLINE</div>
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
                <span className="panel-index">MEASUREMENTS</span>
                <h2>Chest orientation</h2>
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
                      ? 'Aligned orientation'
                      : 'Node orientation'}
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
            {isConnected ? 'Ready for your nodes' : 'Local service offline'}
          </span>
        </footer>
      </main>
    </div>
  );
}
