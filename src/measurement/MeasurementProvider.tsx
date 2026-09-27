import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { DataFeedMessage, DataFeedUpdateT, RpcMessage } from 'solarxr-protocol';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { MeasurementEngine, MeasurementState } from './measurements';

type MeasurementContextValue = MeasurementState & {
  confirmOrientation: () => void;
  invalidate: () => void;
  captureReference: () => void;
  cancelReference: () => void;
};
const MeasurementContext = createContext<MeasurementContextValue | null>(null);

export function MeasurementProvider({ children }: { children: ReactNode }) {
  const { isConnected, useDataFeedPacket, useRPCPacket } = useWebsocketAPI();
  const [engine] = useState(() => new MeasurementEngine());
  const [state, setState] = useState(() => engine.state(Date.now()));
  const publish = () => setState(engine.state(Date.now()));

  useEffect(() => {
    engine.setConnected(isConnected);
    publish();
  }, [isConnected]);

  useEffect(() => {
    const timer = setInterval(publish, 100);
    return () => clearInterval(timer);
  }, []);

  useDataFeedPacket(
    DataFeedMessage.DataFeedUpdate,
    (packet: DataFeedUpdateT) => {
      if (packet.index !== 0) return;
      engine.setConnected(isConnected);
      engine.ingest(
        packet.devices.flatMap((device) => device.trackers),
        Date.now()
      );
      publish();
    }
  );

  useRPCPacket(RpcMessage.ResetResponse, () => {
    engine.invalidate();
    publish();
  });

  return (
    <MeasurementContext.Provider
      value={{
        ...state,
        confirmOrientation: () => {
          // The wizard confirms only its matching completed mounting operation.
          // Wait until all listeners have invalidated the previous reference.
          queueMicrotask(() => {
            engine.confirmOrientation(Date.now());
            publish();
          });
        },
        invalidate: () => {
          engine.invalidate();
          publish();
        },
        captureReference: () => {
          engine.startReference(Date.now());
          publish();
        },
        cancelReference: () => {
          engine.cancelReference();
          publish();
        },
      }}
    >
      {children}
    </MeasurementContext.Provider>
  );
}

export function useMeasurements() {
  const context = useContext(MeasurementContext);
  if (!context) throw new Error('MeasurementProvider is required');
  return context;
}
