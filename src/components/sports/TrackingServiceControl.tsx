import { useEffect, useState } from 'react';
import { useMeasurements } from '@/measurement/MeasurementProvider';

type ServiceState = {
  available?: boolean;
  receiverReady?: boolean;
  apiReady?: boolean;
  restarting?: boolean;
  token?: string;
  error?: string;
};

export function TrackingServiceControl() {
  const [service, setService] = useState<ServiceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const measurements = useMeasurements();

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tracking-service', { signal: controller.signal })
      .then(async (response) => {
        if (!response.headers.get('content-type')?.includes('application/json'))
          throw new Error(
            'Restart control requires the local Windows development server.'
          );
        const data: ServiceState = await response.json();
        setService(data);
        if (!response.ok)
          setMessage(data.error || 'Local service control unavailable.');
      })
      .catch((error: Error) => {
        if (error.name === 'AbortError') return;
        setService({ available: false });
        setMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  const restart = async () => {
    if (busy || !service?.token) return;
    setBusy(true);
    setMessage('Restarting the receiver…');
    measurements.invalidate();
    try {
      const response = await fetch('/api/tracking-service', {
        method: 'POST',
        headers: { 'X-Kinetiq-Service-Token': service.token },
      });
      const data: ServiceState = await response.json();
      if (!response.ok || !data.receiverReady || !data.apiReady)
        throw new Error(data.error || 'The receiver did not become ready.');
      setService({ ...data, token: service.token });
      setMessage(
        'Receiver restarted and listening. Nodes on the same network should reconnect automatically. Re-run calibration before measuring.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Restart failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tracking-service-control">
      <button
        className="secondary-button"
        disabled={
          !service?.available || !service.token || busy || service.restarting
        }
        onClick={restart}
      >
        {busy ? 'Restarting…' : 'Restart tracking service'}
      </button>
      <small role="status">
        {message ||
          (!service
            ? 'Checking local receiver…'
            : service.receiverReady && service.apiReady
              ? 'Connect this computer to the nodes’ Wi-Fi before restarting.'
              : 'Receiver unavailable. Connect this computer to the nodes’ Wi-Fi, then restart.')}
      </small>
    </div>
  );
}
