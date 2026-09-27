import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  ResetRequestT,
  ResetResponseT,
  ResetStatus,
  ResetType,
  RpcMessage,
} from 'solarxr-protocol';
import { serverGuardsAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';

export function NodeOrientation({
  ready,
  nodeCount,
  otherResetBusy,
}: {
  ready: boolean;
  nodeCount: number;
  otherResetBusy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const guards = useAtomValue(serverGuardsAtom);
  const { sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const [step, setStep] = useState<'upright' | 'ski' | 'done'>('upright');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ type: ResetType; deadline: number } | null>(null);

  const fail = (reason: string) => {
    pending.current = null;
    setBusy(false);
    setCountdown(null);
    setStep('upright');
    setMessage(reason);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (!pending.current) return;
      if (!ready) {
        fail('Tracking disconnected. Reconnect your nodes, then start again.');
      } else if (Date.now() > pending.current.deadline) {
        fail('Calibration was not confirmed. Check the connection and retry.');
      }
    }, 250);
    return () => clearInterval(timer);
  }, [ready]);

  useRPCPacket(RpcMessage.ResetResponse, (response: ResetResponseT) => {
    if (
      !pending.current ||
      response.resetType !== pending.current.type ||
      (response.bodyParts?.length ?? 0) > 0
    )
      return;
    if (!ready) {
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
      setMessage('');
    }
  });

  const start = () => {
    if (!ready || pending.current || otherResetBusy) return;
    if (step === 'ski' && !guards?.canDoMounting) return;
    const type = step === 'upright' ? ResetType.Full : ResetType.Mounting;
    pending.current = { type, deadline: Date.now() + 15000 };
    setBusy(true);
    setCountdown(null);
    setMessage('');
    const request = new ResetRequestT();
    request.resetType = type;
    request.bodyParts = [];
    sendRPCPacket(RpcMessage.ResetRequest, request);
  };

  return (
    <>
      <button
        className="primary-button"
        onClick={() => {
          setStep('upright');
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
              : '2. Hold the ski pose'}
        </h2>
        <p>
          {step === 'done'
            ? 'Mounting calibration confirmed. Stand upright and check the live skeleton. Repeat this whenever a tracker moves or you change how it is worn.'
            : step === 'upright'
              ? 'Wear and assign all your nodes first. Face forward with your arms straight down at your sides. Start the reset, then hold still through the countdown.'
              : 'Bend your knees, lean your upper body forward, and bend your arms as shown. Start auto-orientation and hold this pose through the countdown.'}
        </p>
        {step !== 'done' && (
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
          {ready ? nodeCount : 0} assigned online nodes. Each node gets its own
          mounting correction in one calibration.
        </p>
        <div role="status">
          {!ready && <p>Connect and assign your nodes before calibrating.</p>}
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
