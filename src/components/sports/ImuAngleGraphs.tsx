import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  DataFeedMessage,
  DataFeedUpdateT,
  RpcMessage,
  TrackerStatus,
} from 'solarxr-protocol';
import { flatTrackersAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { nodeHardwareName, nodeKey, nodeLabel } from './node-positions';
import {
  ANGLE_STALE_MS,
  ANGLE_WINDOW_MS,
  AngleSample,
  anglePath,
  imuAngles,
} from './imu-angles';

const axes = [
  { key: 'x', label: 'Pitch', color: '#b79aff' },
  { key: 'y', label: 'Yaw', color: '#75d6d0' },
  { key: 'z', label: 'Roll', color: '#eebd77' },
] as const;

export function ImuAngleGraphs() {
  const { isConnected, useDataFeedPacket, useRPCPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom).filter(
    ({ tracker }) => tracker.info?.isImu && !tracker.info.isComputed
  );
  const history = useRef(
    new Map<string, { part: number | undefined; samples: AngleSample[] }>()
  );
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    history.current.clear();
  }, [isConnected]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  useRPCPacket(RpcMessage.ResetResponse, () => {
    history.current.clear();
  });

  useDataFeedPacket(
    DataFeedMessage.DataFeedUpdate,
    (packet: DataFeedUpdateT) => {
      if (packet.index !== 0 || !isConnected) return;
      const time = Date.now();
      const present = new Set<string>();
      for (const device of packet.devices) {
        for (const tracker of device.trackers) {
          if (!tracker.info?.isImu || tracker.info.isComputed) continue;
          const key = nodeKey(tracker);
          present.add(key);
          const saved = history.current.get(key);
          const samples =
            saved && saved.part === tracker.info.bodyPart ? saved.samples : [];
          const angles = imuAngles(tracker);
          const last = samples.at(-1);
          // Keep at most ~10 plotted samples/second, without hiding a dropout.
          if (last && time - last.time < 90 && !!last.angles === !!angles)
            continue;
          history.current.set(key, {
            part: tracker.info.bodyPart,
            samples: [
              ...samples.filter(
                (sample) => time - sample.time <= ANGLE_WINDOW_MS
              ),
              { time, angles },
            ].slice(-220),
          });
        }
      }
      for (const key of history.current.keys()) {
        if (!present.has(key)) history.current.delete(key);
      }
    }
  );

  return (
    <section className="imu-angle-graphs" aria-label="Live IMU angles">
      <p className="imu-graph-note">
        Calibrated IMU orientation · degrees · last 10 seconds
      </p>
      {!trackers.length && (
        <p className="imu-graph-empty">
          Connect a node to see its angular values.
        </p>
      )}
      <div className="imu-graph-grid">
        {trackers.map(({ tracker }) => {
          const key = nodeKey(tracker);
          const samples = history.current.get(key)?.samples ?? [];
          const latest = samples.at(-1);
          const fresh =
            isConnected &&
            tracker.status === TrackerStatus.OK &&
            latest &&
            now - latest.time < ANGLE_STALE_MS;
          const current = fresh ? latest.angles : null;
          const title = `${nodeLabel(tracker)} · ${nodeHardwareName(tracker)}`;
          return (
            <article className="imu-angle-graph" key={key}>
              <div className="imu-graph-heading">
                <h2>{title}</h2>
                <span>
                  {current
                    ? 'Live'
                    : !isConnected || tracker.status !== TrackerStatus.OK
                      ? 'Offline'
                      : 'No fresh angular data'}
                </span>
              </div>
              <div className="imu-graph-values">
                {axes.map((axis) => (
                  <span key={axis.key}>
                    <i style={{ background: axis.color }} />
                    {axis.label}
                    <strong>
                      {current ? `${current[axis.key].toFixed(1)}°` : '—'}
                    </strong>
                  </span>
                ))}
              </div>
              <svg
                viewBox="0 0 400 160"
                role="img"
                aria-label={`${title}: pitch, yaw and roll over the last ten seconds`}
              >
                {[180, 0, -180].map((value) => {
                  const y = 16 + ((180 - value) / 360) * 120;
                  return (
                    <g key={value}>
                      <text x="29" y={y + 3} textAnchor="end">
                        {value}°
                      </text>
                      <line x1="36" x2="388" y1={y} y2={y} />
                    </g>
                  );
                })}
                {axes.map((axis) => (
                  <path
                    key={axis.key}
                    d={isConnected ? anglePath(samples, axis.key, now) : ''}
                    fill="none"
                    stroke={axis.color}
                    strokeWidth="2"
                    strokeDasharray={
                      axis.key === 'y'
                        ? '5 3'
                        : axis.key === 'z'
                          ? '2 3'
                          : undefined
                    }
                  />
                ))}
                <text x="36" y="156">
                  −10s
                </text>
                <text x="388" y="156" textAnchor="end">
                  Now
                </text>
              </svg>
            </article>
          );
        })}
      </div>
    </section>
  );
}
