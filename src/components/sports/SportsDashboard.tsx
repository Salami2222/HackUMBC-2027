import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from 'react-router-dom';
import {
  BodyPart,
  DataFeedMessage,
  DataFeedUpdateT,
  TrackerStatus,
} from 'solarxr-protocol';
import { Vector3 } from 'three';
import { bonesAtom, flatTrackersAtom } from '@/store/app-store';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import {
  SkeletonPreviewView,
  SkeletonVisualizerWidget,
} from '@/components/widgets/SkeletonVisualizerWidget';
import './SportsDashboard.scss';

export function SportsDashboard({ active = true }: { active?: boolean }) {
  const { isConnected, useDataFeedPacket } = useWebsocketAPI();
  const trackers = useAtomValue(flatTrackersAtom);
  const bones = useAtomValue(bonesAtom);
  const received = useRef({ trackers: 0, bones: 0 });
  const view = useRef<SkeletonPreviewView | null>(null);
  const [now, setNow] = useState(Date.now);

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

  const hasAssignedNode = trackers.some(
    ({ tracker }) =>
      tracker.info?.isImu &&
      !tracker.info.isComputed &&
      tracker.info.bodyPart !== undefined &&
      tracker.info.bodyPart !== BodyPart.NONE &&
      tracker.status === TrackerStatus.OK
  );
  const live =
    isConnected &&
    hasAssignedNode &&
    now - received.current.trackers < 3000 &&
    now - received.current.bones < 3000 &&
    bones.length > 0;

  const setView = (position: Vector3) => {
    if (!live || !view.current) return;
    view.current.camera.position.copy(position);
    view.current.controls.update();
  };

  return (
    <main className="sports-content tracking-screen" aria-label="Tracking">
      <section className="tracking-stage" aria-label="Live skeleton preview">
        <div className="sports-viewport">
          {active && live ? (
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
            <div className="live-empty-state" role="status">
              <strong>
                {isConnected
                  ? 'Waiting for live tracking'
                  : 'Waiting for the local tracking service'}
              </strong>
              <Link to="/calibration">Connect and calibrate your nodes</Link>
            </div>
          )}
        </div>
        <div className="stage-footer">
          <span>
            {live ? 'Live pose · missing segments are estimated' : ''}
          </span>
          <div className="view-buttons" aria-label="Skeleton view">
            <button
              disabled={!live}
              onClick={() => setView(new Vector3(0, 1.3, -4))}
            >
              Front
            </button>
            <button
              disabled={!live}
              onClick={() => setView(new Vector3(4, 1.3, 0))}
            >
              Side
            </button>
            <button
              disabled={!live}
              onClick={() => setView(new Vector3(2.5, 1.9, -2.8))}
            >
              3D
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
