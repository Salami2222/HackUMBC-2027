import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
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
import { NodeSetup } from './NodeSetup';
import { NodePicker } from './NodePicker';
import './SportsDashboard.scss';

function trackerKey(tracker: TrackerDataT) {
  return `${tracker.trackerId?.deviceId?.id}:${tracker.trackerId?.trackerNum}`;
}

function trackerName(tracker: TrackerDataT) {
  return String(
    tracker.info?.customName || tracker.info?.displayName || 'IMU tracker'
  );
}

export function LiveMovementDashboard({ active = true }: { active?: boolean }) {
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
    <main className="sports-content calibration-screen">
      <div className="tracking-intro">
        <div>
          <span className="eyebrow">SlimeVR hardware</span>
          <h1>Sensor Calibration</h1>
        </div>
        <span className="source-note">
          <i className={live ? 'is-running' : ''} />{' '}
          {live ? 'Sensor live' : 'Awaiting sensor'}
        </span>
      </div>

      <div className="calibration-layout">
        <section
          className="calibration-controls"
          aria-label="Calibrate a sensor"
        >
          <p className="calibration-lead">
            Connect a node, assign it to your chest, then reset your upright
            pose.
          </p>
          <div className="calibration-status" role="status">
            <i className={live ? 'is-running' : ''} />
            <span>{status}</span>
          </div>
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
          <div className="calibration-actions">
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
          {assignment && !assignedConfirmation && !assignmentPending && (
            <p className="calibration-feedback">
              Assignment was not confirmed. Check the connection and retry.
            </p>
          )}
          {calibrationMessage && (
            <p className="calibration-feedback" role="status">
              {calibrationMessage}
            </p>
          )}
          <div className="sensor-readout">
            <span>{fresh ? available.length : 0} nodes online</span>
            {angles && (
              <span data-testid="chest-orientation">
                Chest · pitch {angles.x.toFixed(1)}° · yaw {angles.y.toFixed(1)}
                ° · roll {angles.z.toFixed(1)}°
              </span>
            )}
          </div>
          <p className="calibration-footnote">
            One chest IMU measures orientation. Full squat angles and rep counts
            still use the simulated Tracking stream.
          </p>
        </section>

        <section className="sensor-preview" aria-label="Live skeleton preview">
          <div className="stage-title">
            <span>Live skeleton preview</span>
            <span>{skeletonLive ? 'LIVE' : 'NO LIVE POSE'}</span>
          </div>
          <div className="sports-viewport">
            {active && skeletonLive ? (
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
                <strong>{status}</strong>
                <span>
                  Connect and calibrate a node to preview the live pose.
                </span>
              </div>
            )}
          </div>
          <div className="stage-footer">
            <span>
              {skeletonLive
                ? 'Chest measured · remaining segments estimated'
                : 'SlimeVR pose preview'}
            </span>
            <div className="view-buttons" aria-label="Skeleton view">
              <button
                disabled={!skeletonLive}
                onClick={() => setView(new Vector3(0, 1.3, -4))}
              >
                Front
              </button>
              <button
                disabled={!skeletonLive}
                onClick={() => setView(new Vector3(4, 1.3, 0))}
              >
                Side
              </button>
              <button
                disabled={!skeletonLive}
                onClick={() => setView(new Vector3(2.5, 1.9, -2.8))}
              >
                3D
              </button>
            </div>
          </div>
        </section>
      </div>

      <NodeSetup open={setupOpen} onToggle={() => setSetupOpen(!setupOpen)} />
    </main>
  );
}
