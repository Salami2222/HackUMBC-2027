import { HardwareStatusT } from 'solarxr-protocol';

export function NodeBattery({
  hardware,
  online,
  compact = false,
}: {
  hardware?: HardwareStatusT | null;
  online: boolean;
  compact?: boolean;
}) {
  const raw = hardware?.batteryPctEstimate;
  // Match the server's unsigned encoding of a depleted battery (-1 -> 255).
  const percent =
    raw == null ? null : raw > 200 ? 0 : Math.max(0, Math.min(100, raw));
  const runtime = hardware?.batteryRuntimeEstimate;
  const minutes = runtime != null && runtime > 0n ? runtime / 60000000n : null;
  if (compact)
    return (
      <span
        className={`compact-battery ${online && percent != null && percent <= 20 ? 'is-low' : ''}`}
      >
        <span className="battery-shell" aria-hidden="true">
          <span
            style={{ width: `${online && percent != null ? percent : 0}%` }}
          />
        </span>
        {online && percent != null ? `${percent}%` : '—'}
      </span>
    );
  return (
    <div
      className={
        online && percent != null && percent <= 20
          ? 'node-battery is-low'
          : 'node-battery'
      }
    >
      <small>Battery</small>
      <strong>{online && percent != null ? `${percent}%` : '—'}</strong>
      <small>
        {!online
          ? 'Offline'
          : minutes != null
            ? `${minutes / 60n}h ${minutes % 60n}m estimated`
            : percent == null
              ? 'Not reported'
              : 'Reported level'}
      </small>
    </div>
  );
}
