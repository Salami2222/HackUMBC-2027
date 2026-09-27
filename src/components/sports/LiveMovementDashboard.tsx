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
import { NodeOrientation } from './NodeOrientation';
import { NodeBattery } from './NodeBattery';

import {
  NODE_POSITIONS,
  nodePosition,
  nodeKey,
  nodeLabel,
  nodeHardwareName,
} from './node-positions';

export function LiveMovementDashboard() {
  const { isConnected, sendRPCPacket, useDataFeedPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom).filter(
    ({ tracker }) => tracker.info?.isImu && !tracker.info.isComputed
  );
  const bones = useAtomValue(bonesAtom);
  const [selectedKey, setSelectedKey] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [draft, setDraft] = useState<{ key: string; part: BodyPart } | null>(
    null
  );
  const [now, setNow] = useState(Date.now);
  const [assignment, setAssignment] = useState<{
    key: string;
    sentAt: number;
    part: BodyPart;
    name: string;
  } | null>(null);
  const [calibrationMessage, setCalibrationMessage] = useState('');
  const received = useRef({ trackers: 0, bones: 0 });
  const view = useRef<SkeletonPreviewView | null>(null);
  const assignmentPanel = useRef<HTMLElement>(null);
  const reset = useReset(
    { type: ResetType.Full },
    () =>
      setCalibrationMessage(
        'Upright pose reset confirmed. Your nodes are ready.'
      ),
    () => {
      if (reset.status === 'counting')
        setCalibrationMessage(
          'Reset was not completed. Check the tracker and retry.'
        );
    }
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
    ? trackers.find(({ tracker }) => nodeKey(tracker) === selectedKey)?.tracker
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
  const selectedId = selected ? nodeKey(selected) : '';
  const position = nodePosition(selected?.info?.bodyPart);
  const targetPart =
    draft?.key === selectedId ? draft.part : (position?.part ?? BodyPart.CHEST);
  const targetPosition = nodePosition(targetPart);
  const occupied =
    targetPart !== BodyPart.NONE
      ? trackers.find(
          ({ tracker }) =>
            nodeKey(tracker) !== selectedId &&
            tracker.info?.bodyPart === targetPart
        )?.tracker
      : undefined;
  const unchanged = selected?.info?.bodyPart === targetPart;
  const assigned = !!position;
  const assignedOnline = available.filter(
    ({ tracker }) => !!nodePosition(tracker.info?.bodyPart)
  );
  const unassignedOnline = fresh
    ? available.filter(({ tracker }) => !tracker.info?.bodyPart)
    : [];
  const rotation = selected?.rotationReferenceAdjusted ?? selected?.rotation;
  const live =
    fresh && assigned && selected?.status === TrackerStatus.OK && !!rotation;
  const skeletonLive =
    fresh &&
    assignedOnline.length > 0 &&
    now - received.current.bones < 3000 &&
    bones.length > 0;
  const angles = live ? QuaternionToEulerDegrees(rotation) : null;
  const assignedConfirmation =
    assignment &&
    trackers.some(
      ({ tracker }) =>
        nodeKey(tracker) === assignment.key &&
        tracker.info?.bodyPart === assignment.part &&
        tracker.info?.customName === assignment.name
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
          ? 'Choose a node'
          : selected.status === TrackerStatus.DISCONNECTED
            ? `${nodeLabel(selected)} (${nodeHardwareName(selected)}) is offline`
            : !assigned
              ? 'Assign this node to a body position'
              : !live
                ? `${nodeLabel(selected)} node is not streaming`
                : `Live ${nodeLabel(selected).toLowerCase()} orientation`;

  const assignPosition = () => {
    if (
      !selected?.trackerId ||
      !fresh ||
      occupied ||
      assignmentPending ||
      unchanged
    )
      return;
    const request = new AssignTrackerRequestT();
    request.trackerId = selected.trackerId;
    request.bodyPosition = targetPart;
    request.displayName = targetPosition?.label ?? nodeHardwareName(selected);
    request.allowDriftCompensation =
      selected.info?.allowDriftCompensation ?? false;
    sendRPCPacket(RpcMessage.AssignTrackerRequest, request);
    setSelectedKey(nodeKey(selected));
    setAssignment({
      key: nodeKey(selected),
      sentAt: Date.now(),
      part: targetPart,
      name: String(request.displayName),
    });
    setCalibrationMessage('');
  };
  const setView = (position: Vector3) => {
    if (!view.current) return;
    view.current.camera.position.copy(position);
    view.current.controls.update();
  };

  return (
    <div className="sports-app">
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
          <span className={fresh && assignedOnline.length ? 'live-dot' : ''} />
          {fresh && assignedOnline.length
            ? 'LIVE NODES'
            : 'LIVE MODE / WAITING'}
          <Link to="/demo">DEMO</Link>
        </div>
      </header>
      <main className="sports-content">
        <div className="sports-heading">
          <div>
            <div className="eyebrow">HARDWARE SESSION / BODY NODES</div>
            <h1>Movement overview</h1>
            <p>Your movement, connected.</p>
          </div>
          <div className="sports-controls">
            <NodePicker
              label="Node"
              disabled={!!assignmentPending}
              value={selectedId}
              placeholder={
                trackers.length ? 'Choose a node' : 'No nodes added yet'
              }
              onChange={(value) => {
                setSelectedKey(value);
                setAssignment(null);
                setDraft(null);
                setCalibrationMessage('');
              }}
              options={trackers.map(({ tracker }) => ({
                value: nodeKey(tracker),
                label: nodeLabel(tracker),
                detail: `${nodeHardwareName(tracker)} · ${
                  !fresh
                    ? 'Offline'
                    : tracker.status === TrackerStatus.OK
                      ? 'Online'
                      : tracker.status === TrackerStatus.BUSY
                        ? 'Starting'
                        : tracker.status === TrackerStatus.ERROR
                          ? 'Needs attention'
                          : 'Offline'
                }`,
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
              className="secondary-button"
              disabled={!skeletonLive || reset.disabled}
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
            <NodeOrientation
              ready={fresh && assignedOnline.length > 0 && !assignmentPending}
              nodeCount={assignedOnline.length}
              otherResetBusy={reset.status === 'counting'}
            />
          </div>
        </div>
        <section
          className="sports-panel node-manager"
          aria-label="Node connection manager"
        >
          <div className="panel-top">
            <div>
              <span className="panel-index">CONNECTION MANAGER</span>
              <h2>Your nodes</h2>
            </div>
            <span className="panel-tag">
              {fresh ? available.length : 0} ONLINE ·{' '}
              {fresh ? assignedOnline.length : 0} ASSIGNED ONLINE
            </span>
          </div>
          <p className="node-manager-description">
            Each row is a separate physical node. Online means it is sending
            tracking data now. USB setup success alone does not mean a node is
            still online.
          </p>
          {trackers.length === 0 ? (
            <p className="node-manager-description">
              No nodes detected. Open Connect nodes to set up Wi-Fi over USB.
            </p>
          ) : (
            <div className="node-manager-list">
              {[...trackers]
                .sort(
                  (a, b) =>
                    Number(b.tracker.status === TrackerStatus.OK) -
                    Number(a.tracker.status === TrackerStatus.OK)
                )
                .map(({ tracker, device }) => {
                  const online = fresh && tracker.status === TrackerStatus.OK;
                  const state =
                    !fresh || tracker.status === TrackerStatus.DISCONNECTED
                      ? 'Offline'
                      : online
                        ? 'Online'
                        : tracker.status === TrackerStatus.BUSY
                          ? 'Starting'
                          : 'Not streaming';
                  return (
                    <div
                      className={`node-manager-row ${nodeKey(tracker) === selectedId ? 'is-selected' : ''}`}
                      key={nodeKey(tracker)}
                    >
                      <div>
                        <strong>{nodeHardwareName(tracker)}</strong>
                        <small>
                          {nodeKey(tracker) === selectedId
                            ? 'Selected node'
                            : 'Physical node'}
                        </small>
                      </div>
                      <span
                        className={`node-state ${online ? 'is-online' : ''}`}
                      >
                        {state}
                      </span>
                      <div>
                        <small>Body position</small>
                        <strong>{nodeLabel(tracker)}</strong>
                      </div>
                      <div>
                        <small>Data rate</small>
                        <strong>
                          {online && tracker.tps != null
                            ? `${Math.round(tracker.tps)} packets/s`
                            : '—'}
                        </strong>
                      </div>
                      <NodeBattery
                        hardware={device?.hardwareStatus}
                        online={online}
                      />
                      <button
                        className="secondary-button"
                        aria-label={`Configure ${nodeHardwareName(tracker)}`}
                        disabled={!!assignmentPending}
                        onClick={() => {
                          setSelectedKey(nodeKey(tracker));
                          setDraft(null);
                          setAssignment(null);
                          setCalibrationMessage('');
                          assignmentPanel.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center',
                          });
                        }}
                      >
                        Configure
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
        <section
          ref={assignmentPanel}
          className="sports-panel node-assignment"
          aria-label="Body position assignment"
        >
          <div className="node-assignment-controls">
            <NodePicker
              label="Body position"
              value={String(targetPart)}
              placeholder="Choose a position"
              disabled={!selected || !!assignmentPending}
              onChange={(value) => {
                setDraft({ key: selectedId, part: Number(value) });
                setAssignment(null);
              }}
              options={[
                ...NODE_POSITIONS.map(({ part, label }) => ({
                  value: String(part),
                  label,
                  detail: trackers.some(
                    ({ tracker }) =>
                      nodeKey(tracker) !== selectedId &&
                      tracker.info?.bodyPart === part
                  )
                    ? 'In use'
                    : undefined,
                })),
                { value: String(BodyPart.NONE), label: 'Unassigned' },
              ]}
            />
            <button
              className="primary-button"
              onClick={assignPosition}
              disabled={
                !fresh ||
                !selected ||
                unchanged ||
                !!occupied ||
                !!assignmentPending
              }
            >
              {assignmentPending
                ? 'Saving…'
                : unchanged
                  ? 'Assignment saved'
                  : targetPart === BodyPart.NONE
                    ? 'Unassign node'
                    : 'Save assignment'}
            </button>
          </div>
          <div className="node-assignment-help" role="status">
            <strong>
              {selected
                ? `${nodeLabel(selected)} · ${nodeHardwareName(selected)}`
                : 'Select a node to assign its position'}
            </strong>
            <p>
              {occupied
                ? `${targetPosition?.label} is already assigned to ${nodeHardwareName(occupied)}. Unassign that node first or choose another position.`
                : (targetPosition?.hint ??
                  'Remove this node from the body without disconnecting it.')}{' '}
              Left and right refer to your own body.
            </p>
            {assignedConfirmation && (
              <p>
                Saved. The node name and body position will be kept when it
                reconnects.
              </p>
            )}
          </div>
        </section>
        <NodeSetup open={setupOpen} onToggle={() => setSetupOpen(!setupOpen)} />
        {unassignedOnline.length > 0 && (
          <section
            className="live-connection-note node-assignment-notice"
            aria-label="Nodes awaiting assignment"
          >
            <strong>Online nodes awaiting a body position</strong>
            <p>
              These nodes are sending data but will not drive the skeleton until
              assigned. Each node has its own saved position.
            </p>
            <div>
              {unassignedOnline.map(({ tracker }) => (
                <button
                  key={nodeKey(tracker)}
                  className="secondary-button"
                  disabled={
                    !!assignmentPending || nodeKey(tracker) === selectedId
                  }
                  onClick={() => {
                    setSelectedKey(nodeKey(tracker));
                    setDraft(null);
                    setAssignment(null);
                    setCalibrationMessage('');
                  }}
                >
                  {nodeKey(tracker) === selectedId ? 'Selected' : 'Select'}{' '}
                  {nodeHardwareName(tracker)}
                </button>
              ))}
            </div>
          </section>
        )}
        <div className="live-connection-note" role="status">
          <strong>{status}.</strong>{' '}
          {live
            ? 'The selected node measures orientation. The skeleton combines your assigned nodes with estimated segments.'
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
                <span className="panel-index">01 / LIVE MOVEMENT</span>
                <h2>Skeleton tracking</h2>
              </div>
              <span className="panel-tag">MOVEMENT VIEW</span>
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
                  ? 'LIVE NODES / ESTIMATED SKELETON'
                  : 'NO LIVE POSE'}
              </div>
            </div>
            <div className="viewport-footer">
              <div>
                {fresh ? assignedOnline.length : 0} ASSIGNED /{' '}
                {fresh ? available.length : 0} ONLINE
              </div>
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
                <span className="panel-index">
                  02 / {position?.label.toUpperCase() ?? 'NODE'} ORIENTATION
                </span>
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
                  <div className="metric-value" data-testid={`node-${axis}`}>
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
                  <span className="metric-note">Not calculated yet</span>
                </div>
              ))}
            </div>
            <div className="live-measurement-note">
              <h3>
                {position
                  ? `${position.label} orientation`
                  : 'Assign your body nodes'}
              </h3>
              <p>
                Attach each node at its assigned position, stand upright, then
                reset the upright pose. These angles describe orientation, not a
                validated lifting score.
              </p>
              <p>
                The skeleton uses all assigned online nodes. Missing segments
                are estimated; these orientation readings are not joint angles
                or a validated lifting score.
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
