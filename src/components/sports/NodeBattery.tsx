import { HardwareStatusT } from 'solarxr-protocol';

export function NodeBattery({
  hardware,
  online,
}: {
  hardware?: HardwareStatusT | null;
  online: boolean;
}) {
  const raw = hardware?.batteryPctEstimate;
  // Match the server's unsigned encoding of a depleted battery (-1 -> 255).
  const percent =
    raw == null ? null : raw > 200 ? 0 : Math.max(0, Math.min(100, raw));
  const runtime = hardware?.batteryRuntimeEstimate;
  const minutes = runtime != null && runtime > 0n ? runtime / 60000000n : null;
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
