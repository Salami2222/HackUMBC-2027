import { Link } from 'react-router-dom';
import { useMeasurements } from '@/measurement/MeasurementProvider';

export function MeasurementPanel({ setup = false }: { setup?: boolean }) {
  const state = useMeasurements();
  return (
    <section
      className="measurement-panel"
      aria-label={setup ? 'Measurement setup' : 'Body measurements'}
    >
      {setup ? (
        <>
          <div className="measurement-actions">
            <strong>Upright reference</strong>
            <button
              className="secondary-button"
              disabled={!state.coreReady || !state.oriented || state.capturing}
              onClick={state.captureReference}
            >
              {state.referenceReady
                ? 'Recapture reference'
                : 'Capture upright reference'}
            </button>
            {state.capturing && (
              <button
                className="secondary-button"
                onClick={state.cancelReference}
              >
                Cancel
              </button>
            )}
          </div>
          <p>
            1. Assign and wear the six measurement nodes below. 2. Run
            Auto-orient trackers. 3. Stand upright with arms down, facing
            forward, and hold still to capture the reference.
          </p>
          <div className="measurement-nodes">
            {state.roles.map((role) => (
              <div key={role.part} data-ready={!role.reason}>
                <strong>{role.label}</strong>
                <span>{role.reason ?? 'Receiving data'}</span>
              </div>
            ))}
          </div>
          <p role="status">{state.message}</p>
          {state.capturing && (
            <progress
              aria-label="Upright reference capture"
              value={state.progress}
              max={1}
            />
          )}
          <small>
            Reference stays in this page session. Recalibrate after moving a
            strap. Elbow and hand/wrist nodes are optional for these
            measurements.
          </small>
        </>
      ) : (
        <>
          <div className="measurement-actions">
            <strong>Body measurements</strong>
            <Link to="/calibration">
              {state.referenceReady
                ? 'Reference captured · recalibrate'
                : 'Set up upright reference'}
            </Link>
          </div>
          <p>
            Changes from your upright reference, in degrees. Knee bend is an
            unsigned segment-angle estimate. These measurements do not rate
            form.
          </p>
          <div className="measurement-grid">
            {state.measurements.map((measurement) => (
              <div key={measurement.id}>
                <span>{measurement.label}</span>
                <strong>
                  {measurement.value === null
                    ? '—'
                    : `${measurement.value.toFixed(1)}°`}
                </strong>
                <small>
                  {measurement.reason ?? 'Live · relative to upright'}
                </small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
