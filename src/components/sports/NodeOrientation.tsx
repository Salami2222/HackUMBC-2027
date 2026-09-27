import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  ResetRequestT,
  ResetResponseT,
  ResetStatus,
  ResetType,
  RpcMessage,
  ArmsMountingResetMode,
  ChangeSettingsRequestT,
  ResetsSettingsT,
  SettingsRequestT,
  SettingsResponseT,
} from 'solarxr-protocol';
import { serverGuardsAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';

export function NodeOrientation({
  ready,
  nodeCount,
  blockedReason,
  otherResetBusy,
  configurationKey,
  onStart,
  onComplete,
}: {
  ready: boolean;
  nodeCount: number;
  blockedReason: string;
  otherResetBusy: boolean;
  configurationKey: string;
  onStart: () => void;
  onComplete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const guards = useAtomValue(serverGuardsAtom);
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const [step, setStep] = useState<'upright' | 'ski' | 'done'>('upright');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [armMode, setArmMode] = useState(ArmsMountingResetMode.TPOSE_UP);
  const requestedMode = useRef(ArmsMountingResetMode.TPOSE_UP);
  const pending = useRef<{
    type: ResetType | 'read-settings' | 'confirm-settings';
    deadline: number;
  } | null>(null);
  const participants = useRef<string | null>(null);

  const fail = (reason: string) => {
    pending.current = null;
    participants.current = null;
    setBusy(false);
    setCountdown(null);
    setStep('upright');
    setMessage(reason);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (
        participants.current !== null &&
        participants.current !== configurationKey
      ) {
        fail(
          'The connected nodes or assignments changed. Start calibration again.'
        );
        return;
      }
      if (!pending.current && participants.current === null) return;
      if (!ready) {
        fail('Tracking disconnected. Reconnect your nodes, then start again.');
      } else if (pending.current && Date.now() > pending.current.deadline) {
        fail('Calibration was not confirmed. Check the connection and retry.');
      }
    }, 250);
    return () => clearInterval(timer);
  }, [ready, configurationKey]);

  const sendReset = (type: ResetType) => {
    pending.current = { type, deadline: Date.now() + 15000 };
    const request = new ResetRequestT();
    request.resetType = type;
    request.bodyParts = [];
    sendRPCPacket(RpcMessage.ResetRequest, request);
  };

  useRPCPacket(RpcMessage.SettingsResponse, (response: SettingsResponseT) => {
    const phase = pending.current?.type;
    if (phase !== 'read-settings' && phase !== 'confirm-settings') return;
    if (!ready || participants.current !== configurationKey) {
      fail(
        'The connected nodes or assignments changed. Start calibration again.'
      );
      return;
    }
    if (!response.resetsSettings) {
      fail(
        'The service did not provide calibration settings. Retry calibration.'
      );
      return;
    }
    if (phase === 'read-settings') {
      const request = new ChangeSettingsRequestT();
      request.resetsSettings = Object.assign(
        new ResetsSettingsT(),
        response.resetsSettings,
        {
          armsMountingResetMode: requestedMode.current,
        }
      );
      pending.current = {
        type: 'confirm-settings',
        deadline: Date.now() + 10000,
      };
      sendRPCPacket(RpcMessage.ChangeSettingsRequest, request);
      sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    } else if (
      response.resetsSettings.armsMountingResetMode === requestedMode.current
    ) {
      sendReset(ResetType.Full);
    } else {
      fail(
        'The service did not confirm the selected arm pose. Retry calibration.'
      );
    }
  });

  useRPCPacket(RpcMessage.ResetResponse, (response: ResetResponseT) => {
    if (
      !pending.current ||
      response.resetType !== pending.current.type ||
      (response.bodyParts?.length ?? 0) > 0
    )
      return;
    if (!ready || participants.current !== configurationKey) {
      fail('Tracking disconnected. Reconnect your nodes, then start again.');
      return;
    }
    if (response.status === ResetStatus.STARTED) {
      const remaining = Math.max(0, response.duration - response.progress);
      pending.current.deadline = Date.now() + remaining + 10000;
      setCountdown(Math.ceil(remaining / 1000));
    } else if (response.status === ResetStatus.FINISHED) {
      pending.current = null;
      setBusy(false);
      setCountdown(null);
      setStep(response.resetType === ResetType.Full ? 'ski' : 'done');
      if (response.resetType === ResetType.Mounting) {
        participants.current = null;
        onComplete();
      }
      setMessage('');
    }
  });

  const start = () => {
    if (!ready || pending.current || otherResetBusy) return;
    if (step === 'ski' && !guards?.canDoMounting) return;
    const type = step === 'upright' ? ResetType.Full : ResetType.Mounting;
    if (step === 'upright') participants.current = configurationKey;
    if (participants.current !== configurationKey) {
      fail('The connected nodes changed. Start calibration again.');
      return;
    }
    onStart();
    setBusy(true);
    setCountdown(null);
    setMessage('');
    if (type === ResetType.Full) {
      requestedMode.current = armMode;
      pending.current = { type: 'read-settings', deadline: Date.now() + 10000 };
      sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    } else {
      sendReset(type);
    }
  };

  return (
    <>
      <button
        className="primary-button"
        onClick={() => {
          setStep('upright');
          participants.current = null;
          setMessage('');
          dialog.current?.showModal();
        }}
      >
        Auto-orient trackers
      </button>
      <dialog
        ref={dialog}
        className="node-orientation-dialog"
        aria-labelledby="node-orientation-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <span className="panel-index">TRACKER ORIENTATION</span>
        <h2 id="node-orientation-title">
          {step === 'done'
            ? 'Orientation calibrated'
            : step === 'upright'
              ? '1. Stand upright'
              : armMode === ArmsMountingResetMode.TPOSE_UP
                ? '2. T-pose arms, ski-pose legs'
                : '2. Hold the ski pose'}
        </h2>
        <p>
          {step === 'done'
            ? 'The service confirmed mounting calibration. Stand upright, check the live skeleton, then capture an upright reference below. This still needs your visual check; repeat whenever a tracker moves.'
            : step === 'upright'
              ? 'Wear and assign all your nodes first. Face forward with your arms straight down at your sides. Start the reset, then hold still through the countdown.'
              : armMode === ArmsMountingResetMode.TPOSE_UP
                ? 'Raise both arms straight out to the sides, 90 degrees from your torso, in a T. For your leg and chest trackers, also bend your knees and lean your torso forward into the ski pose. Hold this combined pose through the countdown.'
                : 'Bend your knees, lean your upper body forward, and bend your arms as shown. Start auto-orientation and hold this pose through the countdown.'}
        </p>
        {step === 'upright' && (
          <label className="node-input">
            <span>Arm calibration pose</span>
            <select
              value={armMode}
              disabled={busy}
              onChange={(event) => setArmMode(Number(event.target.value))}
            >
              <option value={ArmsMountingResetMode.TPOSE_UP}>
                T-pose (arms out)
              </option>
              <option value={ArmsMountingResetMode.BACK}>
                Ski pose (arms bent)
              </option>
            </select>
          </label>
        )}
        {step !== 'done' &&
          (step === 'upright' || armMode === ArmsMountingResetMode.BACK) && (
            <img
              src={
                step === 'upright'
                  ? '/images/reset/FullResetPose.webp'
                  : '/images/mounting-reset-pose.webp'
              }
              alt={
                step === 'upright'
                  ? 'Stand straight with arms at your sides, facing forward'
                  : 'Ski pose with knees and elbows bent and torso leaning forward'
              }
            />
          )}
        <p className="node-orientation-scope">
          {nodeCount} assigned online nodes. Each node gets its own mounting
          correction in one calibration.
        </p>
        <div role="status">
          {!ready && <p>{blockedReason}</p>}
          {step === 'ski' && !guards?.canDoMounting && ready && (
            <p>
              The service requires an upright reset before mounting calibration.
            </p>
          )}
          {message && <p>{message}</p>}
          {busy && (
            <p>
              {countdown === null
                ? 'Waiting for the tracking service…'
                : `Hold still — ${countdown}s remaining`}
            </p>
          )}
        </div>
        <div className="node-orientation-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            {step === 'done' ? 'Done' : 'Close'}
          </button>
          {step !== 'done' && (
            <button
              className="primary-button"
              onClick={start}
              disabled={
                !ready ||
                busy ||
                otherResetBusy ||
                (step === 'ski' && !guards?.canDoMounting)
              }
            >
              {busy
                ? 'Calibrating…'
                : step === 'upright'
                  ? 'Start upright reset'
                  : 'Start auto-orientation'}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
