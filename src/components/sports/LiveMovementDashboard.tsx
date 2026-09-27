import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
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
import {
  SkeletonVisualizerWidget,
  SkeletonPreviewView,
  setSkeletonView,
} from '@/components/widgets/SkeletonVisualizerWidget';
import { bonesAtom, flatTrackersAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { useReset } from '@/hooks/reset';
import { QuaternionToEulerDegrees } from '@/maths/quaternion';

import './SportsDashboard.scss';
import { NodeSetup } from './NodeSetup';
import { NodePicker } from './NodePicker';
import { NodeOrientation } from './NodeOrientation';
import { NodeBattery } from './NodeBattery';

import { TrackingServiceControl } from './TrackingServiceControl';
import { useMeasurements } from '@/measurement/MeasurementProvider';

import {
  NODE_POSITIONS,
  nodePosition,
  nodeKey,
  nodeLabel,
  legacyHandLabel,
  nodeHardwareName,
} from './node-positions';

export function LiveMovementDashboard({ active = true }: { active?: boolean }) {
  const measurements = useMeasurements();
  const view = useRef<SkeletonPreviewView | null>(null);
  const [viewMode, setViewMode] = useState<'Front' | 'Side' | '3D'>('Front');
  const { isConnected, sendRPCPacket, useDataFeedPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom).filter(
    ({ tracker }) => tracker.info?.isImu && !tracker.info.isComputed
  );
  const bones = useAtomValue(bonesAtom);
  const [selectedKey, setSelectedKey] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [armsOpen, setArmsOpen] = useState(false);
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
    ({ tracker }) =>
      tracker.status === TrackerStatus.OK && (tracker.tps ?? 0) > 0
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
    draft?.key === selectedId
      ? draft.part
      : (selected?.info?.bodyPart ?? BodyPart.CHEST);
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
    measurements.invalidate();
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
  const selectNode = (key: string) => {
    setSelectedKey(key);
    setAssignment(null);
    setDraft(null);
    setCalibrationMessage('');
  };
  const armParts = new Set([
    BodyPart.LEFT_UPPER_ARM,
    BodyPart.RIGHT_UPPER_ARM,
    BodyPart.LEFT_LOWER_ARM,
    BodyPart.RIGHT_LOWER_ARM,
  ]);
  const ordered = [...trackers].sort((a, b) => {
    const order = [
      BodyPart.HEAD,
      BodyPart.CHEST,
      BodyPart.LEFT_UPPER_LEG,
      BodyPart.RIGHT_UPPER_LEG,
      BodyPart.LEFT_LOWER_LEG,
      BodyPart.RIGHT_LOWER_LEG,
    ];
    const rank = (part: BodyPart | undefined) => {
      const index = order.indexOf(part ?? BodyPart.NONE);
      return index < 0 ? 10 : index;
    };
    return rank(a.tracker.info?.bodyPart) - rank(b.tracker.info?.bodyPart);
  });
  const arms = ordered.filter(({ tracker }) =>
    armParts.has(tracker.info?.bodyPart ?? BodyPart.NONE)
  );
  const visibleTrackers = ordered.filter(
    ({ tracker }) =>
      armsOpen || !armParts.has(tracker.info?.bodyPart ?? BodyPart.NONE)
  );
  const readyCount = measurements.roles.filter((role) => !role.reason).length;
  const toolbar = (
    <div className="calibration-header-tools">
      <span
        className={`connection-count ${fresh && available.length ? 'is-online' : ''}`}
      >
        <i />
        {fresh ? available.length : 0} nodes online
      </span>
      <button
        className="secondary-button"
        onClick={() => setSetupOpen(!setupOpen)}
        aria-expanded={setupOpen}
        aria-controls="connection-drawer"
      >
        Connect nodes
      </button>
      <NodeOrientation
        ready={
          fresh &&
          assignedOnline.length > 0 &&
          !assignmentPending &&
          !measurements.migrationRequired
        }
        nodeCount={fresh ? assignedOnline.length : 0}
        blockedReason={
          !isConnected
            ? 'Tracking service disconnected. Open service options to restart.'
            : !fresh
              ? 'Waiting for fresh tracker data.'
              : assignmentPending
                ? 'Waiting for the assignment to be saved.'
                : measurements.migrationRequired
                  ? measurements.message
                  : 'Connect and assign a node to begin.'
        }
        otherResetBusy={reset.status === 'counting'}
        configurationKey={assignedOnline
          .map(({ tracker }) => `${nodeKey(tracker)}:${tracker.info?.bodyPart}`)
          .sort()
          .join('|')}
        onStart={measurements.invalidate}
        onComplete={measurements.confirmOrientation}
      />
      <details className="service-menu">
        <summary aria-label="Tracking service options">•••</summary>
        <div className="service-menu-content">
          <TrackingServiceControl />
          <button
            className="secondary-button"
            disabled={!fresh || !assignedOnline.length || reset.disabled}
            onClick={() => {
              setCalibrationMessage('Stand upright while the pose resets.');
              reset.triggerReset();
            }}
          >
            {reset.status === 'counting'
              ? `Resetting ${reset.timer}`
              : 'Reset upright pose'}
          </button>
          {calibrationMessage && <p role="status">{calibrationMessage}</p>}
        </div>
      </details>
    </div>
  );

  return (
    <main
      className="sports-content calibration-workspace"
      aria-label="Sensor Calibration"
    >
      {toolbar}
      <div
        id="connection-drawer"
        className="connection-drawer"
        hidden={!setupOpen}
      >
        <NodeSetup open={setupOpen} onToggle={() => setSetupOpen(!setupOpen)} />
      </div>
      {measurements.migrationRequired && (
        <p className="workspace-notice" role="alert">
          {measurements.message}
        </p>
      )}
      <div className="calibration-workspace-grid">
        <section
          ref={assignmentPanel}
          className="node-inspector"
          aria-label="Selected node and calibration"
        >
          <NodePicker
            label="Selected node"
            disabled={!!assignmentPending}
            value={selectedId}
            placeholder="Choose a node"
            onChange={selectNode}
            options={trackers.map(({ tracker }) => ({
              value: nodeKey(tracker),
              label: nodeLabel(tracker),
              detail: nodeHardwareName(tracker),
            }))}
          />
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
              ...(legacyHandLabel(selected?.info?.bodyPart)
                ? [
                    {
                      value: String(selected!.info!.bodyPart),
                      label: `${legacyHandLabel(selected?.info?.bodyPart)} — switch to feet`,
                    },
                  ]
                : []),
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
          {legacyHandLabel(selected?.info?.bodyPart) && (
            <p className="workspace-notice" role="alert">
              This node is still designated{' '}
              {legacyHandLabel(selected?.info?.bodyPart)}. Move it onto the
              matching foot, select Left foot or Right foot, and save. Keep your
              ankle / shin node in place.
            </p>
          )}
          {unchanged && !legacyHandLabel(selected?.info?.bodyPart) ? (
            <p className="assignment-confirmation">
              <span aria-hidden="true">✓</span> Assignment saved
            </p>
          ) : (
            <button
              className="secondary-button save-node"
              onClick={assignPosition}
              disabled={
                !fresh ||
                !selected ||
                unchanged ||
                !!occupied ||
                !!assignmentPending
              }
            >
              {assignmentPending ? 'Saving…' : 'Save assignment'}
            </button>
          )}
          {occupied && !unchanged && (
            <p className="workspace-notice" role="status">
              {targetPosition?.label} is in use. Unassign the other node first.
            </p>
          )}
          {assignment && !assignedConfirmation && !assignmentPending && (
            <p className="workspace-notice" role="status">
              Assignment not confirmed. Retry when connected.
            </p>
          )}
          <ol className="calibration-steps">
            <li
              data-complete={measurements.coreReady}
              data-current={!measurements.coreReady}
            >
              <span className="step-marker" aria-hidden="true">
                {measurements.coreReady ? '✓' : '1'}
              </span>
              <div>
                <strong>1. Connect</strong>
                <small>
                  {measurements.coreReady
                    ? 'Measurement nodes online'
                    : `${readyCount} of 8 measurement nodes ready`}
                </small>
              </div>
            </li>
            <li
              data-complete={measurements.oriented}
              data-current={measurements.coreReady && !measurements.oriented}
            >
              <span className="step-marker" aria-hidden="true">
                {measurements.oriented ? '✓' : '2'}
              </span>
              <div>
                <strong>2. Orient</strong>
                <small>
                  {measurements.oriented
                    ? 'Orientation confirmed'
                    : 'Auto-orient in the ski pose'}
                </small>
              </div>
            </li>
            <li
              data-complete={measurements.referenceReady}
              data-current={
                measurements.oriented && !measurements.referenceReady
              }
            >
              <span className="step-marker" aria-hidden="true">
                {measurements.referenceReady ? '✓' : '3'}
              </span>
              <div>
                <strong>3. Capture reference</strong>
                <small>
                  {measurements.referenceReady
                    ? 'Reference captured'
                    : 'Stand upright in a neutral pose'}
                </small>
              </div>
            </li>
          </ol>
          <button
            className="primary-button capture-reference"
            disabled={
              !measurements.coreReady ||
              !measurements.oriented ||
              measurements.capturing
            }
            onClick={measurements.captureReference}
          >
            <span aria-hidden="true">◎</span>
            {measurements.capturing
              ? 'Hold still…'
              : measurements.referenceReady
                ? 'Recapture reference'
                : 'Capture reference'}
          </button>
          {measurements.capturing && (
            <>
              <progress
                aria-label="Upright reference capture"
                value={measurements.progress}
                max={1}
              />
              <button
                className="cancel-reference"
                onClick={measurements.cancelReference}
              >
                Cancel
              </button>
            </>
          )}
          <details className="calibration-details">
            <summary>Setup details</summary>
            <p role="status">{measurements.message}</p>
            {measurements.roles
              .filter((role) => role.reason)
              .map((role) => (
                <p key={role.part}>
                  {role.label}: {role.reason}
                </p>
              ))}
            {selected && <p>{targetPosition?.hint}</p>}
            <p>{status}</p>
            {angles && (
              <p data-testid="node-orientation">
                Pitch {angles.x.toFixed(1)}° · Yaw {angles.y.toFixed(1)}° · Roll{' '}
                {angles.z.toFixed(1)}°
              </p>
            )}
          </details>
        </section>
        <section
          className="calibration-body-stage"
          aria-label="Body tracking viewport"
        >
          <div className="original-skeleton-viewport">
            {active && skeletonLive ? (
              <SkeletonVisualizerWidget
                floorAnchored
                onInit={(context) => {
                  view.current =
                    context.addView({
                      left: 0,
                      bottom: 0,
                      width: 1,
                      height: 1,
                      position: new Vector3(0, 1, -4),
                      onHeightChange(v, height) {
                        setSkeletonView(v, v.framing?.mode ?? 'Front', height);
                      },
                    }) ?? null;
                  setViewMode('Front');
                }}
              />
            ) : (
              <div className="viewport-offline-state">
                <span className="offline-pose-icon" aria-hidden="true">
                  ◎
                </span>
                <strong>
                  {isConnected
                    ? 'Waiting for live tracking'
                    : 'Tracking service offline'}
                </strong>
                <span>Connect your nodes to see your pose.</span>
              </div>
            )}
          </div>
          <div
            className="body-view-controls"
            role="group"
            aria-label="Skeleton view"
          >
            {(['Front', 'Side', '3D'] as const).map((mode) => (
              <button
                key={mode}
                disabled={!skeletonLive}
                aria-pressed={viewMode === mode}
                onClick={() => {
                  const v = view.current;
                  if (!v) return;
                  setSkeletonView(v, mode);
                  setViewMode(mode);
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="connected-nodes-panel" aria-label="Connected nodes">
        <div className="connected-nodes-heading">
          <h2>Connected nodes</h2>
          {unassignedOnline.length > 0 && (
            <span>{unassignedOnline.length} need a position</span>
          )}
        </div>
        <div className="connected-nodes-scroll">
          <table className="connected-nodes-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>Position</th>
                <th>Status</th>
                <th>Battery</th>
                <th>Data rate</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTrackers.map(({ tracker, device }) => {
                const online =
                  fresh &&
                  tracker.status === TrackerStatus.OK &&
                  (tracker.tps ?? 0) > 0;
                const state =
                  !fresh || tracker.status === TrackerStatus.DISCONNECTED
                    ? 'Offline'
                    : online
                      ? 'Online'
                      : tracker.status === TrackerStatus.BUSY
                        ? 'Starting'
                        : 'No data';
                return (
                  <tr
                    key={nodeKey(tracker)}
                    data-selected={nodeKey(tracker) === selectedId}
                  >
                    <td>
                      <button
                        className="table-node-select"
                        onClick={() => selectNode(nodeKey(tracker))}
                        disabled={!!assignmentPending}
                      >
                        <i />
                        {nodeLabel(tracker)}
                        <small>{nodeHardwareName(tracker)}</small>
                      </button>
                    </td>
                    <td>{nodeLabel(tracker)}</td>
                    <td>
                      <span
                        className={`table-node-status ${online ? 'is-online' : ''}`}
                      >
                        <i />
                        {state}
                      </span>
                    </td>
                    <td>
                      <NodeBattery
                        hardware={device?.hardwareStatus}
                        online={online}
                        compact
                      />
                    </td>
                    <td>{online ? `${Math.round(tracker.tps!)} Hz` : '—'}</td>
                    <td>
                      <button
                        className="node-row-action"
                        aria-label={`Configure ${nodeHardwareName(tracker)}`}
                        disabled={!!assignmentPending}
                        onClick={() => {
                          selectNode(nodeKey(tracker));
                          assignmentPanel.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          });
                        }}
                      >
                        •••
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!trackers.length && (
          <p className="nodes-empty">
            No nodes yet. Select Connect nodes to get started.
          </p>
        )}
        {arms.length > 0 && (
          <button
            className="arm-node-toggle"
            aria-expanded={armsOpen}
            onClick={() => setArmsOpen(!armsOpen)}
          >
            {armsOpen ? '−' : '+'} {arms.length} arm nodes
          </button>
        )}
      </section>
    </main>
  );
}
