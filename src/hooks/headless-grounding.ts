import { useEffect, useRef, useState } from 'react';
import {
  ChangeSettingsRequestT,
  ModelSettingsT,
  ModelTogglesT,
  RpcMessage,
  SettingsRequestT,
  SettingsResponseT,
} from 'solarxr-protocol';
import { useWebsocketAPI } from './websocket-api';

export function useHeadlessGrounding() {
  const { isConnected, sendRPCPacket, useRPCPacket } = useWebsocketAPI();
  const phase = useRef<'read' | 'confirm' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    phase.current = null;
    setError('');
    if (!isConnected) return;
    phase.current = 'read';
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
    const timeout = setTimeout(() => {
      if (!phase.current) return;
      phase.current = null;
      setError(
        'Floor tracking was not confirmed by the service. Restart the tracking service and recalibrate.'
      );
    }, 10000);
    return () => clearTimeout(timeout);
  }, [isConnected]);

  useRPCPacket(RpcMessage.SettingsResponse, (response: SettingsResponseT) => {
    if (!phase.current || !isConnected) return;
    const toggles = response.modelSettings?.toggles;
    if (!toggles) return;
    const enabled =
      toggles.selfLocalization &&
      toggles.floorClip &&
      toggles.skatingCorrection &&
      toggles.footPlant;
    if (enabled) {
      phase.current = null;
      setError('');
      return;
    }
    if (phase.current === 'confirm') {
      // Other components may have older settings requests in flight. Wait for
      // the matching readback, or let the timeout report a failure.
      return;
    }
    const request = new ChangeSettingsRequestT();
    request.modelSettings = new ModelSettingsT();
    request.modelSettings.toggles = Object.assign(new ModelTogglesT(), toggles, {
      selfLocalization: true,
      floorClip: true,
      skatingCorrection: true,
      footPlant: true,
    });
    phase.current = 'confirm';
    sendRPCPacket(RpcMessage.ChangeSettingsRequest, request);
    sendRPCPacket(RpcMessage.SettingsRequest, new SettingsRequestT());
  });
  return error;
}
